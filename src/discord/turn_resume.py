"""Resume machinery for suspended chat turns.

Two entry points (design settled with Odin, 2026-07-30):

- **Explicit resume** — the user replies ``resume``/``continue`` in the
  channel: ``try_explicit_resume`` runs inside the normal intake pipeline
  (channel lock, delivery, session append all inherited), consuming the
  trigger message as a command — it is NEVER injected into the frozen
  transcript. Allowed even after the session has advanced.
- **Auto-resume** — registered at suspension time, in-process only: a
  per-turn waiter polls the model breaker; when capacity returns AND the
  session has not advanced since suspension, the turn resumes and replies
  against the ORIGINAL message. A process restart drops waiters by design —
  after a restart, resume is explicit-only.

Admission (both paths, per the settled design): re-fetch the original
message; require the same author and unchanged content (digest); re-derive
tools from the CURRENT catalog + permission filter — current security
policy always wins over persisted definitions; a deleted or materially
edited request is terminal (``TERMINAL_REJECTED``), never executable
folklore reconstructed from disk.

Replay safety: unmatched ``tool_use`` blocks (crash between intent
recording and batch settle) are repaired from the ledger — APPLIED ops
replay their stored result; anything else becomes an explicit
"outcome unknown / never ran" result block. Matched blocks are guaranteed;
NOTHING is ever re-executed automatically.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from typing import Any

from ..odin_log import get_logger
from ..turn_state.codec import compute_content_digest, restore_field_values
from ..turn_state.durability import TurnDurability
from ..turn_state.store import OpState, TurnKey, TurnStateStore
from .tool_loop import CHAT_POLICY, ToolLoopRunner, _ChatTurn

log = get_logger("turn_resume")

RESUME_TRIGGERS = frozenset({"resume", "continue"})

_AUTO_POLL_SECONDS = 15.0
# Response text cap for the session append on the auto path (mirrors the
# intake pipeline's CHAT_RESPONSE_MAX_CHARS discipline without importing it).
_SESSION_RESPONSE_CAP = 4000


class TurnResumeManager:
    def __init__(
        self,
        *,
        store: TurnStateStore,
        tool_loop: ToolLoopRunner,
        llm_gateway,
        channel_state,
        sessions,
        delivery,
        permissions,
        tool_catalog,
        get_config: Callable,
        fetch_message: Callable,
        auto_resume_enabled: bool = True,
        resume_ttl_hours: float = 24.0,
    ) -> None:
        self._store = store
        self._tool_loop = tool_loop
        self._llm_gateway = llm_gateway
        self._channel_state = channel_state
        self._sessions = sessions
        self._delivery = delivery
        self._permissions = permissions
        self._tool_catalog = tool_catalog
        self._get_config = get_config
        self._fetch_message = fetch_message  # async (channel_id, message_id) -> msg|None
        self._auto_resume_enabled = auto_resume_enabled
        self._resume_ttl_hours = resume_ttl_hours
        self._waiters: dict[TurnKey, asyncio.Task] = {}

    # ── queries ──────────────────────────────────────────────────────

    async def is_suspended(self, channel_id: str, message_id: str) -> bool:
        key = TurnKey(source="discord", channel_id=channel_id, message_id=message_id)
        row = await asyncio.to_thread(self._store.load_resumable_sync, key)
        return row is not None

    async def _latest_suspended_for_channel(self, channel_id: str) -> dict | None:
        rows = await asyncio.to_thread(self._store.list_suspended_sync, "discord")
        candidates = [r for r in rows if r["channel_id"] == channel_id]
        if not candidates:
            return None
        return max(candidates, key=lambda r: r.get("suspended_at") or 0.0)

    # ── suspension registration (auto-resume) ────────────────────────

    def on_turn_suspended(self, key: TurnKey, generation: str) -> None:
        """Called by the tool loop when a turn suspends. In-process only."""
        if not self._auto_resume_enabled:
            return
        # Session length AT SUSPENSION, captured synchronously inside the
        # suspending turn (which still holds the channel lock) — the
        # advance-check anchor (review blocker #6a, PR #242).
        suspend_len = self._session_len(key.channel_id)
        existing = self._waiters.pop(key, None)
        if existing is not None:
            existing.cancel()
        task = asyncio.get_running_loop().create_task(
            self._auto_resume_waiter(key, generation, suspend_len),
            name=f"turn-resume:{key.channel_id}:{key.message_id}",
        )
        self._waiters[key] = task

        def _cleanup(t: asyncio.Task, *, _key=key) -> None:
            # Ownership-sensitive: a cancelled predecessor must never pop
            # its successor's registry entry (review blocker #6b, PR #242).
            if self._waiters.get(_key) is t:
                self._waiters.pop(_key, None)

        task.add_done_callback(_cleanup)

    async def _auto_resume_waiter(
        self, key: TurnKey, generation: str, suspend_len: int
    ) -> None:
        """Wait for capacity, then resume IF nothing else happened.

        The advance check anchors on the session length captured AT
        SUSPENSION (``suspend_len``). Production ordering (round-2 blocker
        #3, PR #242): intake appends the USER message BEFORE the turn runs,
        so the suspension capture already includes it, and the only
        legitimate growth afterwards is the assistant preservation marker —
        exactly +1 (a directly-driven turn adds 0). Anything else — or an
        unreadable session — stands auto-resume down fail-safe; explicit
        resume stays available. No sampling window exists for a stranger
        message to sneak into the baseline.

        Capacity detection is ACTIVE: a quiet breaker is never probed by
        anyone, so the waiter claims the probe slot itself when the cooldown
        elapses and immediately releases it — the resumed generation's own
        attempt is the real probe. If capacity is still gone, that attempt
        re-suspends the turn (remaining budget ≈ 0 → single attempt), which
        re-registers this waiter — the breaker's escalating cooldown paces
        the retry cycle for free.
        """
        give_up_at = time.monotonic() + self._resume_ttl_hours * 3600.0
        breaker = self._llm_gateway.capacity_breaker_for()
        allowed = {suspend_len, suspend_len + 1} if suspend_len >= 0 else set()
        while time.monotonic() < give_up_at:
            await asyncio.sleep(_AUTO_POLL_SECONDS)
            row = await asyncio.to_thread(self._store.load_resumable_sync, key)
            if row is None or row["generation"] != generation:
                return  # resumed elsewhere / rejected / expired
            admission = breaker.acquire_attempt()
            if not isinstance(admission, float):
                breaker.abandon(admission)  # the resume re-acquires for real
                current = self._session_len(key.channel_id)
                if current not in allowed:
                    log.info(
                        "Auto-resume for %s stands down: session advanced or "
                        "unreadable (explicit resume still available)", key,
                    )
                    return
                await self._run_auto_resume(key, row)
                return
        log.info("Auto-resume waiter for %s expired", key)

    def _channel_lock(self, channel_id: str) -> asyncio.Lock:
        return self._channel_state.channel_locks.setdefault(channel_id, asyncio.Lock())

    def _session_len(self, channel_id: str) -> int:
        """Peek the channel's session length WITHOUT get_or_create (which
        bumps last_active on pure reads). SessionManager keeps its dict at
        `_sessions`; a lookup failure returns -1 so a broken peek can never
        satisfy the baseline-equality check and wrongly auto-resume."""
        try:
            session = getattr(self._sessions, "_sessions", {}).get(channel_id)
            return len(session.messages) if session is not None else 0
        except Exception:
            return -1

    async def _run_auto_resume(self, key: TurnKey, row: dict) -> None:
        if self._unresolved_ops(row):
            # Never auto-continue over ambiguous external effects — a human
            # must look at this (explicit resume delivers the details).
            log.warning(
                "Auto-resume for %s stands down permanently: unresolved "
                "operations require manual resolution", key,
            )
            return
        async with self._channel_lock(key.channel_id):
            if self._channel_state.active_requests.get(key.channel_id):
                log.info("Auto-resume for %s stands down: channel busy", key)
                return
            st, message, reason = await self._validate_and_rebuild(key, row)
            if st is None:
                log.info("Auto-resume for %s rejected: %s", key, reason)
                return
            log.info("Auto-resuming turn %s (capacity returned)", key)
            try:
                result = await self._tool_loop.run_resumed(st)
            except Exception:
                log.exception("Auto-resumed turn failed")
                return
            text, already_sent, is_error, tools_used, _handoff = result
            self._append_session(key.channel_id, text, is_error, tools_used)
            if not already_sent and message is not None:
                try:
                    await self._delivery.send_chunked(message, text)
                except Exception:
                    log.exception("Auto-resume delivery failed")

    def _append_session(
        self, channel_id: str, text: str, is_error: bool, tools_used: list
    ) -> None:
        """Minimal mirror of the intake post-turn session bookkeeping (the
        auto path runs outside the intake pipeline; reflection and
        housekeeping deliberately do not run here)."""
        try:
            body = (text or "")[:_SESSION_RESPONSE_CAP]
            if is_error:
                body = (
                    "[Resumed request ended with an error"
                    + (f" after tools ({', '.join(tools_used[:5])})" if tools_used else "")
                    + ".]"
                )
            self._sessions.add_message(channel_id, "assistant", body)
            self._sessions.prune()
        except Exception:
            log.exception("Auto-resume session append failed")

    # ── explicit resume (runs inside the intake pipeline) ────────────

    @staticmethod
    def is_resume_trigger(content: str) -> bool:
        return (content or "").strip().lower().rstrip("!.") in RESUME_TRIGGERS

    @staticmethod
    def _unresolved_ops(row: dict) -> list[dict]:
        """Operations whose external outcome is not settled. Their presence
        HALTS continuation (round-2 blocker #6, PR #242): 'never auto-rerun'
        is enforced by not generating, not by asking the model nicely."""
        blocked_states = {
            OpState.OUTCOME_UNKNOWN,
            OpState.MANUAL_RESOLUTION_REQUIRED,
            OpState.PREPARED,
            OpState.RUNNING,
        }
        return [
            op for op in (row.get("operations") or [])
            if op.get("state") in blocked_states
        ]

    async def try_explicit_resume(self, message: Any):
        """Resume the channel's suspended turn when *message* is a trigger.

        Returns the run() result tuple, a notice tuple when resume was
        attempted but rejected, or None when this message is not a resume
        trigger (normal processing continues).
        """
        content = getattr(message, "content", "") or ""
        if not self.is_resume_trigger(content):
            return None
        channel_id = str(message.channel.id)
        row_summary = await self._latest_suspended_for_channel(channel_id)
        if row_summary is None:
            return None  # nothing to resume — treat as a normal message
        key = TurnKey(
            source="discord",
            channel_id=channel_id,
            message_id=row_summary["message_id"],
        )
        row = await asyncio.to_thread(self._store.load_resumable_sync, key)
        if row is None:
            return None
        # Only the original requester may resume their turn.
        if str(message.author.id) != str(row.get("user_id") or ""):
            return (
                "There is preserved work in this channel, but only the person "
                "who started it can resume it.",
                False, False, [], False,
            )
        # Stand the auto-waiter down — the human took over.
        waiter = self._waiters.pop(key, None)
        if waiter is not None:
            waiter.cancel()
        unresolved = self._unresolved_ops(row)
        if unresolved:
            # Halt: continuation would let a later generation re-issue the
            # same effect under a fresh call id. Hand the ambiguity to the
            # human and close the turn out.
            names = ", ".join(
                sorted({str(op.get("tool_name") or "unknown") for op in unresolved})
            )
            moved = await asyncio.to_thread(
                self._store.mark_ops_manual_sync, key, row["generation"]
            )
            await asyncio.to_thread(
                self._store.reject_resumable_sync, key,
                f"{len(unresolved)} unresolved operation(s) — manual resolution",
            )
            log.warning(
                "Resume of %s halted: %d unresolved op(s) (%d moved to manual)",
                key, len(unresolved), moved,
            )
            return (
                f"I can't safely continue that work: {len(unresolved)} "
                f"interrupted operation(s) ({names}) have UNKNOWN outcomes — "
                "they may or may not have applied, and I will not re-run "
                "them automatically. Verify their current state, then ask "
                "fresh for whatever is still needed.",
                False, False, [], False,
            )
        st, _original, reason = await self._validate_and_rebuild(key, row)
        if st is None:
            return (
                f"I couldn't resume the preserved work: {reason}. "
                "Ask again from scratch if you still need it.",
                False, False, [], False,
            )
        log.info("Explicitly resuming turn %s", key)
        return await self._tool_loop.run_resumed(st)

    # ── admission + rebuild ──────────────────────────────────────────

    async def _validate_and_rebuild(self, key: TurnKey, row: dict):
        """Full resume admission. Returns (st, original_message, None) or
        (None, None, reason). Hard rejections mark the row terminal."""
        original = None
        try:
            original = await self._fetch_message(key.channel_id, key.message_id)
        except Exception:
            original = None
        if original is None:
            await asyncio.to_thread(
                self._store.reject_resumable_sync, key, "original message unavailable"
            )
            return None, None, "the original message is gone"
        if str(original.author.id) != str(row.get("user_id") or ""):
            await asyncio.to_thread(
                self._store.reject_resumable_sync, key, "author mismatch"
            )
            return None, None, "the original author no longer matches"
        digest = compute_content_digest(getattr(original, "content", "") or "")
        if digest != (row.get("content_digest") or ""):
            await asyncio.to_thread(
                self._store.reject_resumable_sync, key, "content edited"
            )
            return None, None, "the original message was edited"

        # RECONSTRUCT BEFORE ACQUIRING (review blocker #5, PR #242): every
        # fallible step — payload restore, tool derivation, transcript
        # repair, cancellation check — runs while the row is still
        # SUSPENDED, so a failure rejects/aborts cleanly instead of
        # stranding an ACTIVE row invisible to resumable queries.
        payload = row["payload"]
        try:
            fields = restore_field_values(
                payload,
                load_blob=self._store.load_blob_sync,
                stuck_tracker_cls=self._tool_loop._stuck_loop_tracker_cls,
            )
        except Exception:
            log.exception("Checkpoint restore failed — rejecting")
            await asyncio.to_thread(
                self._store.reject_resumable_sync, key, "checkpoint unreadable"
            )
            return None, None, "the checkpoint could not be restored"

        # Current security policy wins: tools re-derived from the live
        # catalog + permission filter, never the persisted definitions.
        tools = None
        if self._get_config().tools.enabled:
            tools = self._tool_catalog.merged_definitions()
            tools = self._permissions.filter_tools(str(original.author.id), tools)

        self._repair_unmatched_tool_use(fields["messages"], row.get("operations") or [])

        cancel = self._channel_state.cancel_events.setdefault(
            key.channel_id, asyncio.Event()
        )
        if cancel.is_set():
            return None, None, "the channel is busy stopping another task"

        remaining_budget = 0.0
        deadline_utc = row.get("recovery_deadline_utc")
        if deadline_utc:
            remaining_budget = max(0.0, float(deadline_utc) - time.time())

        # Acquire LAST — the single-winner transition happens only once
        # everything else is ready to run.
        lease = await asyncio.to_thread(
            self._store.acquire_resume_lease_sync, key, row["generation"]
        )
        if lease is None:
            return None, None, "someone else is already resuming it"

        try:
            durability = TurnDurability.resumed(
                self._store,
                lease,
                payload.get("generation_seq", 0),
                first_generation_budget=remaining_budget,
            )
            st = _ChatTurn(
                message=original,
                policy=CHAT_POLICY,
                trace=None,  # the old segment was closed into the payload
                tools=tools,
                _cancel=cancel,
                durability=durability,
                **fields,
            )
        except Exception:
            # Residual post-acquire window: release the fenced lease back to
            # SUSPENDED so the turn never strands ACTIVE.
            log.exception("Post-acquire turn construction failed — releasing")
            await asyncio.to_thread(self._store.release_acquired_sync, lease)
            return None, None, "the turn could not be reconstructed"
        return st, original, None

    @staticmethod
    def _repair_unmatched_tool_use(messages: list, operations: list[dict]) -> None:
        """Guarantee matched tool_use/tool_result blocks after a crash.

        Missing results are synthesized from the ledger: APPLIED replays the
        stored result; anything else states the truth (unknown / never ran).
        Nothing is re-executed.
        """
        seen_results: set[str] = set()
        use_blocks: dict[str, str] = {}
        for msg in messages:
            content = msg.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "tool_use" and block.get("id"):
                    use_blocks[block["id"]] = block.get("name", "tool")
                elif block.get("type") == "tool_result" and block.get("tool_use_id"):
                    seen_results.add(block["tool_use_id"])
        missing = [cid for cid in use_blocks if cid not in seen_results]
        if not missing:
            return
        ops_by_id = {op["tool_call_id"]: op for op in operations}
        repaired = []
        for cid in missing:
            op = ops_by_id.get(cid)
            if op is not None and op["state"] in (
                OpState.APPLIED,
                OpState.RECONCILED_APPLIED,
            ):
                content = op.get("result") or "[completed; result recorded]"
            elif op is None:
                content = (
                    "[Interrupted before execution — this call never ran; "
                    "re-issue it if still needed.]"
                )
            else:
                content = (
                    "[Interrupted: outcome unknown — verify current state "
                    "before re-running this operation.]"
                )
            repaired.append(
                {"type": "tool_result", "tool_use_id": cid, "content": content}
            )
        messages.append({"role": "user", "content": repaired})
        log.info("Repaired %d unmatched tool_use block(s) on resume", len(repaired))
