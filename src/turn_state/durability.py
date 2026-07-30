"""Write-invariant driver for one chat turn.

`TurnDurability` is the seam between the tool loop and the store: the loop
calls the five invariant hooks (Odin's write invariant, round-2) and this
module does the snapshot + fenced persistence. A disabled instance (store
missing/unavailable, admission refused, non-Discord source) no-ops every
hook so the loop keeps ONE code path.

The invariant, mapped to hooks:

1. `on_llm_response`  — the successful LLM response (transcript incl. the
   assistant tool_use message) and ALL proposed tool intents are durable
   BEFORE any execution.
2. `before_tool`      — each intent transitions PREPARED→RUNNING before its
   external effect; a persistence failure here BLOCKS the effect
   (fail-closed).
3. `after_tool`       — each result is persisted immediately after
   completion (APPLIED / DEFINITELY_FAILED / OUTCOME_UNKNOWN for
   timeouts-and-interruptions, which may have applied).
4. `on_batch_settled` — after the parallel batch settles: the tool-result
   continuation message, trajectory/guard/validation/stuck state, and the
   advanced iteration go durable atomically (one fenced checkpoint).
5. `on_guard_injection` — a guard nudge and its consumed one-shot flag are
   durable BEFORE the LLM retry that consumes them.

`on_generation_start` additionally persists the absolute UTC recovery
deadline before each LLM call, so a process restart reconstructs only the
REMAINING budget (never a fresh five minutes).

Failure semantics: hooks raise `TurnStateUnavailableError` / `StaleTurnError`
— the loop halts (fail-closed). Terminal bookkeeping (`settle_terminal`,
`suspend`) is best-effort where no further external effect can follow.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from typing import Any

from ..odin_log import get_logger
from .codec import compute_content_digest, snapshot_chat_turn
from .store import OpState, TurnKey, TurnLease, TurnStateStore, TurnStatus

log = get_logger("turn_state")

# Bound stored per-op result text (the model-visible copy already rides the
# transcript; the ledger copy is for replay/reconciliation).
_OP_RESULT_CAP = 4000


def _hash_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8", "replace")).hexdigest()


class TurnDurability:
    """Per-turn durability handle. Carried on the turn state object
    (classified RECONSTRUCTED in the codec — always process-local)."""

    def __init__(self, store: TurnStateStore | None, lease: TurnLease | None) -> None:
        self._store = store
        self._lease = lease
        self.generation_seq = 0
        self.suspended = False
        self.settled = False
        # Set by the loop's /stop path: _clear_active clears the shared
        # cancel EVENT before terminal settlement can read it, so the fact
        # must be carried here (a cancelled turn is terminal by design).
        self.cancelled = False
        # One-shot remaining budget for a resumed generation (see resumed()).
        self._resume_budget: float | None = None

    # -- construction --------------------------------------------------

    @classmethod
    def disabled(cls) -> TurnDurability:
        return cls(None, None)

    @classmethod
    async def admit(
        cls,
        store: TurnStateStore | None,
        *,
        message: Any,
        system_prompt: str,
        tools: list | None,
        session_snapshot: dict | None,
    ) -> TurnDurability:
        """Admit a fresh Discord chat turn; any refusal → disabled handle."""
        if store is None or not store.available:
            return cls.disabled()
        try:
            key = TurnKey(
                source="discord",
                channel_id=str(message.channel.id),
                message_id=str(message.id),
            )
            tool_names = sorted(t.get("name", "") for t in (tools or []))
            lease = await asyncio.to_thread(
                store.admit_turn_sync,
                key,
                guild_id=str(getattr(getattr(message, "guild", None), "id", "") or ""),
                user_id=str(message.author.id),
                content_digest=compute_content_digest(
                    getattr(message, "content", "") or ""
                ),
                code_version=_code_version(),
                prompt_policy_hash=_hash_text(system_prompt),
                tool_catalog_hash=_hash_text(",".join(tool_names)),
                session_snapshot=session_snapshot,
            )
        except Exception:
            log.exception("Turn admission failed — running without durability")
            return cls.disabled()
        if lease is None:
            return cls.disabled()
        return cls(store, lease)

    @classmethod
    def resumed(
        cls,
        store: TurnStateStore,
        lease: TurnLease,
        generation_seq: int,
        *,
        first_generation_budget: float | None = None,
    ) -> TurnDurability:
        """Handle for a resumed turn.

        ``first_generation_budget`` is the REMAINING recovery budget of the
        interrupted generation (from the persisted UTC deadline) — usually
        ~0, which means one attempt then re-suspend. A restart never grants
        a fresh five minutes to the generation that already spent its
        budget; later generations budget normally.
        """
        handle = cls(store, lease)
        handle.generation_seq = int(generation_seq)
        handle._resume_budget = first_generation_budget
        return handle

    def pop_resume_budget(self) -> float | None:
        """One-shot: the restored generation's remaining budget, then None."""
        budget = self._resume_budget
        self._resume_budget = None
        return budget

    # -- state ---------------------------------------------------------

    @property
    def enabled(self) -> bool:
        return (
            self._store is not None
            and self._lease is not None
            and not self.suspended
            and not self.settled
        )

    @property
    def lease(self) -> TurnLease | None:
        return self._lease

    # -- snapshot plumbing (runs in a worker thread: blob writes + sqlite) --

    def _checkpoint_sync(
        self,
        st,
        *,
        progressed: bool,
        recovery_deadline_utc: float | None = None,
        extra: dict | None = None,
    ) -> None:
        assert self._store is not None and self._lease is not None
        payload = snapshot_chat_turn(
            st,
            store_blob=self._store.store_blob_sync,
            generation_seq=self.generation_seq,
            extra=extra,
        )
        self._store.checkpoint_sync(
            self._lease,
            payload,
            progressed=progressed,
            recovery_deadline_utc=recovery_deadline_utc,
        )

    # -- the invariant hooks -------------------------------------------

    async def on_generation_start(self, st, deadline_seconds: float) -> None:
        """Persist the absolute recovery deadline before the LLM call."""
        if not self.enabled:
            return
        await asyncio.to_thread(
            self._checkpoint_sync,
            st,
            progressed=False,
            recovery_deadline_utc=time.time() + max(0.0, deadline_seconds),
        )

    async def on_llm_response(self, st, tool_calls: list) -> None:
        """WI-1: response transcript + PREPARED intents, before any effect.

        Parse-error calls are excluded (they are never executed; on resume a
        tool_use block with no ledger row truthfully means "never ran").
        Raises LedgerIntentError on empty/duplicate executable ids — the
        loop converts that to matched error results WITHOUT executing.
        """
        if not self.enabled:
            return
        self.generation_seq += 1
        await asyncio.to_thread(self._checkpoint_sync, st, progressed=True)
        executable = [tc for tc in tool_calls if not getattr(tc, "parse_error", None)]
        if not executable:
            return
        intents = [
            {"tool_call_id": tc.id, "tool_name": tc.name, "tool_input": tc.input}
            for tc in executable
        ]
        assert self._store is not None and self._lease is not None
        await asyncio.to_thread(
            self._store.record_intents_sync,
            self._lease,
            self.generation_seq,
            intents,
            iteration=st.iteration,
        )

    async def before_tool(self, block) -> None:
        """WI-2: PREPARED→RUNNING gates the external effect (fail-closed)."""
        if not self.enabled:
            return
        assert self._store is not None and self._lease is not None
        await asyncio.to_thread(
            self._store.mark_running_sync, self._lease, self.generation_seq, block.id
        )

    async def after_tool(self, block, *, ok: bool, uncertain: bool, result_text: str) -> None:
        """WI-3: settle each op right after it completes."""
        if not self.enabled:
            return
        if ok:
            state = OpState.APPLIED
        elif uncertain:
            state = OpState.OUTCOME_UNKNOWN
        else:
            state = OpState.DEFINITELY_FAILED
        assert self._store is not None and self._lease is not None
        await asyncio.to_thread(
            self._store.settle_op_sync,
            self._lease,
            self.generation_seq,
            block.id,
            state=state,
            result_text=(result_text or "")[:_OP_RESULT_CAP],
        )

    async def after_tool_interrupted(self, block, result_text: str) -> None:
        """WI-3 for a wait_for-cancelled execution: OUTCOME_UNKNOWN via the
        no-downgrade guarded settle (it may race the tool's own settle at
        the cancellation boundary; an already-settled row wins)."""
        if not self.enabled:
            return
        assert self._store is not None and self._lease is not None
        await asyncio.to_thread(
            self._store.settle_interrupted_sync,
            self._lease,
            self.generation_seq,
            block.id,
            result_text=(result_text or "")[:_OP_RESULT_CAP],
        )

    async def on_batch_settled(self, st) -> None:
        """WI-4: one fenced checkpoint after the batch + bookkeeping."""
        if not self.enabled:
            return
        await asyncio.to_thread(self._checkpoint_sync, st, progressed=True)

    async def on_guard_injection(self, st) -> None:
        """WI-5: consumed one-shot flags durable before the LLM retry.

        Not "real progress" — guard nudges must not extend the resumable
        TTL the way completed tool batches do.
        """
        if not self.enabled:
            return
        await asyncio.to_thread(self._checkpoint_sync, st, progressed=False)

    # -- terminal transitions ------------------------------------------

    async def suspend(self, st, reason: str) -> bool:
        """Suspend with preserved work. Returns False when persistence
        failed (caller reports the legacy error instead of promising a
        preserved checkpoint that does not exist)."""
        if not self.enabled:
            return False
        extra: dict = {"suspend_reason": reason}
        try:
            if st.trace is not None:
                extra["closed_trace"] = st.trace.finalize()
        except Exception:
            pass
        try:
            assert self._store is not None and self._lease is not None
            payload = await asyncio.to_thread(
                lambda: snapshot_chat_turn(
                    st,
                    store_blob=self._store.store_blob_sync,
                    generation_seq=self.generation_seq,
                    extra=extra,
                )
            )
            await asyncio.to_thread(self._store.suspend_sync, self._lease, payload)
        except Exception:
            log.exception("Turn suspension failed — work NOT preserved")
            return False
        self.suspended = True
        return True

    def mark_cancelled(self) -> None:
        self.cancelled = True

    async def settle_terminal(self, *, cancelled: bool, is_error: bool) -> None:
        """Best-effort terminal bookkeeping after the turn's reply exists.

        No further external effect follows, so a failure here must not
        destroy an already-computed reply — log and move on.
        """
        if not self.enabled:
            return
        if cancelled or self.cancelled:
            status = TurnStatus.TERMINAL_CANCELLED
        elif is_error:
            status = TurnStatus.TERMINAL_FAILED
        else:
            status = TurnStatus.TERMINAL_COMPLETED
        try:
            assert self._store is not None and self._lease is not None
            await asyncio.to_thread(self._store.finish_sync, self._lease, status)
        except Exception:
            log.exception("Turn terminal bookkeeping failed (non-fatal)")
        self.settled = True


def _code_version() -> str:
    try:
        from ..version import get_version

        return str(get_version())
    except Exception:
        return "unknown"
