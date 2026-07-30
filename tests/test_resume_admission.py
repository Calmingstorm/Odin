"""Resume admission + execution pins (src/discord/turn_resume.py).

Drives real suspend→resume cycles through the actual runner and store:
explicit resume completes the preserved work with full transcript
continuity; every admission rejection (deleted / edited / wrong author) is
terminal; the unmatched-block repair synthesizes truthful results from the
ledger and never re-executes anything.
"""

from __future__ import annotations

import asyncio
import json

import pytest

import src.discord.turn_resume as tr
from src.discord.turn_resume import TurnResumeManager
from src.llm.errors import LLMCapacityError
from src.llm.recovery import RecoveryPolicy
from src.turn_state import OpState, TurnStateStore, TurnStatus
from tests.fakes import FakeLLM, FakeMessage, make_bot, text_response, tool_call_response

FAST_POLICY = RecoveryPolicy(
    deadline_seconds=0.15, backoff_base=0.01, backoff_cap=0.02, retry_after_cap=0.05
)


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def capacity_forever(fake):
    def _raise():
        fake.responses.append(_raise)
        raise LLMCapacityError(
            "Codex capacity: server_is_overloaded", provider="codex", model="fake-model"
        )

    return _raise


class Harness:
    """A bot + store + resume manager sharing one fetchable message registry."""

    def __init__(self, script, tmp_path):
        self.fake = FakeLLM(script)
        self.bot = make_bot(fake_llm=self.fake)
        self.store = TurnStateStore(tmp_path / "ts" / "turns.sqlite3")
        self.bot.tool_loop._turn_store = self.store
        self.bot.llm_gateway._recovery_policy_source = lambda: FAST_POLICY
        self.messages: dict[tuple[str, str], object] = {}

        async def fetch(channel_id: str, message_id: str):
            return self.messages.get((channel_id, message_id))

        self.manager = TurnResumeManager(
            store=self.store,
            tool_loop=self.bot.tool_loop,
            llm_gateway=self.bot.llm_gateway,
            channel_state=self.bot.channel_state,
            sessions=self.bot.sessions,
            delivery=self.bot.delivery,
            permissions=self.bot.permissions,
            tool_catalog=self.bot.tool_catalog,
            get_config=lambda: self.bot.config,
            fetch_message=fetch,
        )
        self.bot.tool_loop._on_turn_suspended = self.manager.on_turn_suspended

    def register(self, msg):
        self.messages[(str(msg.channel.id), str(msg.id))] = msg

    async def run(self, msg):
        self.register(msg)
        return await self.bot.tool_loop.run(
            msg, [{"role": "user", "content": msg.content}]
        )

    def row(self, cols="status, payload"):
        return self.store._conn.execute(f"SELECT {cols} FROM turns").fetchone()


async def suspend_turn(tmp_path, script=None):
    h = Harness(
        script
        if script is not None
        else [tool_call_response(("parse_time", {"text": "tomorrow"}))],
        tmp_path,
    )
    h.fake.responses.append(capacity_forever(h.fake))
    original = FakeMessage("do the long thing")
    text, _, is_error, *_ = await h.run(original)
    assert is_error is True
    assert h.row()[0] == TurnStatus.SUSPENDED
    # Cancel any auto-waiter the suspension registered — these tests drive
    # the explicit path deterministically.
    for task in list(h.manager._waiters.values()):
        task.cancel()
    await asyncio.sleep(0)
    return h, original


def resume_msg(original, content="resume", author=None):
    return FakeMessage(content, author=author or original.author, channel=original.channel)


def make_breaker_probe_ready(h):
    """Model the production timeline where the breaker cooldown has elapsed
    by the time a resume happens (suspension→resume is minutes, cooldown is
    seconds-to-minutes): admit + succeed one probe so the breaker closes."""
    breaker = h.bot.llm_gateway.capacity_breaker_for()
    token = breaker.acquire_attempt()
    if not isinstance(token, float):
        breaker.attempt_succeeded(token)
    else:  # still pacing — force the window open for the test
        breaker._opened_at = 0.0
        token = breaker.acquire_attempt()
        if not isinstance(token, float):
            breaker.attempt_succeeded(token)


def heal_capacity(h, *responses):
    """Capacity is back: replace the self-rearming raiser and close the breaker."""
    h.fake.responses.clear()
    h.fake.responses.extend(responses)
    make_breaker_probe_ready(h)


class TestExplicitResume:
    async def test_resume_completes_preserved_work_with_continuity(self, tmp_path):
        h, original = await suspend_turn(tmp_path)
        heal_capacity(h, text_response("Finished what I started."))

        result = await h.manager.try_explicit_resume(resume_msg(original))
        assert result is not None
        text, _, is_error, tools_used, _ = result
        assert text == "Finished what I started."
        assert is_error is False
        assert tools_used == ["parse_time"]  # restored, not re-run

        # Transcript continuity: the resumed LLM call saw the earlier
        # tool_use + matched tool_result from before the outage.
        resumed_call = h.fake.calls[-1]["messages"]
        blocks = [
            b
            for m in resumed_call
            if isinstance(m.get("content"), list)
            for b in m["content"]
            if isinstance(b, dict)
        ]
        assert any(b.get("type") == "tool_use" for b in blocks)
        assert any(b.get("type") == "tool_result" for b in blocks)
        # The tool was NOT re-executed on resume (ledger untouched, still 1 op).
        ops = h.store._conn.execute("SELECT COUNT(*) FROM operations").fetchone()
        assert ops[0] == 1
        assert h.row()[0] == TurnStatus.TERMINAL_COMPLETED

    async def test_consumed_guard_budget_survives_resume(self, tmp_path):
        # Suspended AFTER the hedging guard consumed its one-shot budget:
        # the resumed turn must NOT get a fresh one — hedging again ends the
        # turn (guard-terminal), it is not retried a second time.
        h, original = await suspend_turn(
            tmp_path, script=[text_response("Shall I proceed with the deployment now?")]
        )
        payload = json.loads(h.row()[1])
        assert payload["fields"]["hedging_retried"] is True

        heal_capacity(h, text_response("Shall I proceed with the deployment now?"))
        calls_before = len(h.fake.calls)
        result = await h.manager.try_explicit_resume(resume_msg(original))
        assert result is not None
        # One LLM call on resume: the guard flag was restored as consumed, so
        # no second hedging retry generation was granted (hedging again is
        # guard-terminal, not another free retry).
        assert len(h.fake.calls) - calls_before == 1

    async def test_wrong_author_gets_notice(self, tmp_path):
        from tests.fakes.discord_objects import FakeAuthor

        h, original = await suspend_turn(tmp_path)
        intruder = FakeAuthor(id=999999, name="intruder")
        result = await h.manager.try_explicit_resume(
            resume_msg(original, author=intruder)
        )
        assert result is not None
        assert "only the person" in result[0]
        assert h.row()[0] == TurnStatus.SUSPENDED  # untouched

    async def test_edited_original_is_terminal_rejected(self, tmp_path):
        h, original = await suspend_turn(tmp_path)
        original.content = "do the long thing (edited)"
        result = await h.manager.try_explicit_resume(resume_msg(original))
        assert result is not None
        assert "edited" in result[0]
        assert h.row()[0] == TurnStatus.TERMINAL_REJECTED
        assert h.row()[1] is None  # payload compacted

    async def test_deleted_original_is_terminal_rejected(self, tmp_path):
        h, original = await suspend_turn(tmp_path)
        h.messages.clear()  # fetch returns None
        result = await h.manager.try_explicit_resume(resume_msg(original))
        assert result is not None
        assert "gone" in result[0]
        assert h.row()[0] == TurnStatus.TERMINAL_REJECTED

    async def test_non_trigger_and_no_checkpoint_pass_through(self, tmp_path):
        h, original = await suspend_turn(tmp_path)
        assert await h.manager.try_explicit_resume(
            resume_msg(original, content="what's the weather")
        ) is None
        # A trigger in a channel WITHOUT preserved work is a normal message.
        from tests.fakes.discord_objects import FakeChannel

        other_channel_msg = FakeMessage("resume", channel=FakeChannel(id=999888777))
        assert await h.manager.try_explicit_resume(other_channel_msg) is None

    async def test_second_resume_finds_nothing(self, tmp_path):
        h, original = await suspend_turn(tmp_path)
        heal_capacity(h, text_response("done"))
        assert await h.manager.try_explicit_resume(resume_msg(original)) is not None
        # Terminal now — a second `resume` is just a normal message.
        assert await h.manager.try_explicit_resume(resume_msg(original)) is None

    async def test_resumed_generation_budget_is_remaining_not_fresh(self, tmp_path):
        # Capacity STILL down at resume: the interrupted generation gets its
        # REMAINING budget (~0 → one attempt), then re-suspends. No fresh
        # five minutes for a generation that already spent its budget.
        h, original = await suspend_turn(tmp_path)
        make_breaker_probe_ready(h)
        attempts_before = len(h.fake.calls)
        result = await h.manager.try_explicit_resume(resume_msg(original))
        assert result is not None
        text = result[0]
        assert "preserved" in text  # re-suspended, work still safe
        assert h.row()[0] == TurnStatus.SUSPENDED
        # Exactly ONE attempt was made (zero-budget semantics).
        assert len(h.fake.calls) == attempts_before + 1
        for task in list(h.manager._waiters.values()):
            task.cancel()


class TestAutoResume:
    async def test_auto_resume_fires_when_capacity_returns(self, tmp_path, monkeypatch):
        monkeypatch.setattr(tr, "_AUTO_POLL_SECONDS", 0.02)
        h, original = await suspend_turn(tmp_path)
        # Heal capacity + re-register the waiter (suspend_turn cancelled it).
        heal_capacity(h, text_response("Auto-finished."))
        rows = h.store.list_suspended_sync("discord")
        from src.turn_state import TurnKey

        key = TurnKey("discord", rows[0]["channel_id"], rows[0]["message_id"])
        h.manager.on_turn_suspended(key, rows[0]["generation"])
        for _ in range(600):
            await asyncio.sleep(0.02)
            if h.row()[0] in TurnStatus.TERMINAL:
                break
        assert h.row()[0] == TurnStatus.TERMINAL_COMPLETED
        # The reply landed against the ORIGINAL message.
        assert any("Auto-finished." in (r["content"] or "") for r in original.replies)

    async def test_auto_resume_stands_down_when_session_advances(
        self, tmp_path, monkeypatch
    ):
        monkeypatch.setattr(tr, "_AUTO_POLL_SECONDS", 0.02)
        h, original = await suspend_turn(tmp_path)
        # Capacity text is scripted but the breaker stays OPEN (pacing) so
        # the waiter loops without resuming yet.
        h.fake.responses.clear()
        h.fake.responses.append(text_response("should never send"))
        rows = h.store.list_suspended_sync("discord")
        from src.turn_state import TurnKey

        key = TurnKey("discord", rows[0]["channel_id"], rows[0]["message_id"])
        h.manager.on_turn_suspended(key, rows[0]["generation"])
        await asyncio.sleep(0.06)  # waiter parked while the breaker paces
        # A real intervening turn appends user + assistant (+2) — beyond the
        # single preservation-marker growth (+1) the waiter tolerates.
        h.bot.sessions.add_message(str(original.channel.id), "user", "new topic")
        h.bot.sessions.add_message(str(original.channel.id), "assistant", "answered")
        await asyncio.sleep(0.02)
        make_breaker_probe_ready(h)  # capacity "returns" AFTER the advance
        await asyncio.sleep(0.3)
        assert h.row()[0] == TurnStatus.SUSPENDED  # stood down, still resumable
        for task in list(h.manager._waiters.values()):
            task.cancel()


class TestUnmatchedBlockRepair:
    def test_repair_synthesizes_truthful_results(self):
        messages = [
            {"role": "user", "content": "go"},
            {"role": "assistant", "content": [
                {"type": "tool_use", "id": "a", "name": "run_command", "input": {}},
                {"type": "tool_use", "id": "b", "name": "run_command", "input": {}},
                {"type": "tool_use", "id": "c", "name": "run_command", "input": {}},
            ]},
        ]
        operations = [
            {"tool_call_id": "a", "state": OpState.APPLIED, "result": "real output",
             "tool_name": "run_command", "generation_seq": 1},
            {"tool_call_id": "b", "state": OpState.OUTCOME_UNKNOWN, "result": None,
             "tool_name": "run_command", "generation_seq": 1},
            # "c" has no ledger row: intent was never recorded → never ran.
        ]
        TurnResumeManager._repair_unmatched_tool_use(messages, operations)
        assert messages[-1]["role"] == "user"
        by_id = {b["tool_use_id"]: b["content"] for b in messages[-1]["content"]}
        assert by_id["a"] == "real output"
        assert "outcome unknown" in by_id["b"]
        assert "never ran" in by_id["c"]

    def test_matched_transcript_is_untouched(self):
        messages = [
            {"role": "assistant", "content": [
                {"type": "tool_use", "id": "a", "name": "t", "input": {}},
            ]},
            {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "a", "content": "ok"},
            ]},
        ]
        before = json.loads(json.dumps(messages))
        TurnResumeManager._repair_unmatched_tool_use(messages, [])
        assert messages == before


class TestPostAcquireSafety:
    async def test_corrupt_checkpoint_rejects_before_acquiring(self, tmp_path):
        """Review blocker #5 (PR #242): reconstruction runs BEFORE the
        execution lease is acquired, so a corrupt checkpoint becomes
        TERMINAL_REJECTED — never a stranded ACTIVE row invisible to
        resumable queries."""
        h, original = await suspend_turn(tmp_path)
        h.store._conn.execute("UPDATE turns SET payload='{\"broken\": '")
        h.store._conn.commit()
        result = await h.manager.try_explicit_resume(resume_msg(original))
        # Malformed JSON self-heals inside load_resumable: rejected
        # terminally, and the trigger falls through as a normal message.
        assert result is None
        (status,) = h.store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.TERMINAL_REJECTED
        # A structurally-valid-but-unrestorable payload rejects explicitly:
        h2, original2 = await suspend_turn(tmp_path / "second")
        h2.store._conn.execute(
            "UPDATE turns SET payload='{\"fields\": {\"stuck_tracker\": 42}}'"
        )
        h2.store._conn.commit()
        result2 = await h2.manager.try_explicit_resume(resume_msg(original2))
        assert result2 is not None
        assert "could not be restored" in result2[0]
        (status,) = h2.store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.TERMINAL_REJECTED  # not stranded ACTIVE


class TestWaiterRegistry:
    async def test_replaced_waiter_cannot_orphan_successor(self, tmp_path, monkeypatch):
        """Review blocker #6b (PR #242): a cancelled predecessor's done
        callback must not pop its successor's registry entry."""
        monkeypatch.setattr(tr, "_AUTO_POLL_SECONDS", 5.0)  # keep waiters parked
        h, original = await suspend_turn(tmp_path)
        rows = h.store.list_suspended_sync("discord")
        from src.turn_state import TurnKey

        key = TurnKey("discord", rows[0]["channel_id"], rows[0]["message_id"])
        h.manager.on_turn_suspended(key, rows[0]["generation"])
        first = h.manager._waiters[key]
        h.manager.on_turn_suspended(key, rows[0]["generation"])  # replaces
        second = h.manager._waiters[key]
        assert second is not first
        await asyncio.sleep(0.05)  # predecessor's done callback has run
        assert h.manager._waiters.get(key) is second  # successor survives
        second.cancel()
        await asyncio.sleep(0)


class TestUnknownOutcomeHaltsContinuation:
    """Round-2 blocker #6 (PR #242): unresolved OUTCOME_UNKNOWN operations
    HALT continuation — enforcement, not model-facing advice."""

    async def _suspend_with_unknown(self, tmp_path):
        h, original = await suspend_turn(tmp_path)
        h.store._conn.execute(
            "UPDATE operations SET state=?", [OpState.OUTCOME_UNKNOWN]
        )
        h.store._conn.commit()
        return h, original

    async def test_explicit_resume_halts_and_hands_to_human(self, tmp_path):
        h, original = await self._suspend_with_unknown(tmp_path)
        heal_capacity(h, text_response("must never generate"))
        calls_before = len(h.fake.calls)
        result = await h.manager.try_explicit_resume(resume_msg(original))
        assert result is not None
        assert "UNKNOWN outcomes" in result[0]
        assert "parse_time" in result[0]
        assert len(h.fake.calls) == calls_before  # NO generation happened
        status = h.store._conn.execute("SELECT status FROM turns").fetchone()[0]
        assert status == TurnStatus.TERMINAL_REJECTED
        op_state = h.store._conn.execute(
            "SELECT state FROM operations"
        ).fetchone()[0]
        assert op_state == OpState.MANUAL_RESOLUTION_REQUIRED

    async def test_auto_resume_stands_down_on_unknowns(self, tmp_path, monkeypatch):
        monkeypatch.setattr(tr, "_AUTO_POLL_SECONDS", 0.02)
        h, original = await self._suspend_with_unknown(tmp_path)
        heal_capacity(h, text_response("must never generate"))
        rows = h.store.list_suspended_sync("discord")
        from src.turn_state import TurnKey

        key = TurnKey("discord", rows[0]["channel_id"], rows[0]["message_id"])
        h.manager.on_turn_suspended(key, rows[0]["generation"])
        await asyncio.sleep(0.3)
        status = h.store._conn.execute("SELECT status FROM turns").fetchone()[0]
        assert status == TurnStatus.SUSPENDED  # untouched, awaiting a human
        for task in list(h.manager._waiters.values()):
            task.cancel()


class TestProductionPipelinePath:
    async def test_suspension_bookkeeping_is_plus_one_and_auto_resume_admits(
        self, tmp_path, monkeypatch
    ):
        """Round-2 blocker #3 (PR #242): drive the REAL MessagePipeline
        (user message appended BEFORE the turn, preservation marker after
        → +1), then prove the waiter's arithmetic admits auto-resume."""
        monkeypatch.setattr(tr, "_AUTO_POLL_SECONDS", 0.05)
        h2 = Harness([tool_call_response(("parse_time", {"text": "x"}))], tmp_path)
        h2.fake.responses.append(capacity_forever(h2.fake))
        h2.bot.pipeline._turn_resume = h2.manager
        original = FakeMessage("please do the long thing")
        h2.register(original)
        await h2.bot.pipeline.run(original, original.content)

        ch_id = str(original.channel.id)
        session = h2.bot.sessions._sessions.get(ch_id)
        assert session is not None
        # +1 bookkeeping: the suspension callback captured a length that
        # already included the user message; only the marker follows.
        marker = session.messages[-1].content
        assert "PRESERVED" in marker
        assert h2.row()[0] == TurnStatus.SUSPENDED

        heal_capacity(h2, text_response("Pipeline auto-finish."))
        # Wait for a TERMINAL status — the row passes through ACTIVE while
        # the auto-resume runs (breaking on first non-SUSPENDED raced the
        # in-flight resume under coverage instrumentation).
        for _ in range(600):
            await asyncio.sleep(0.05)
            if h2.row()[0] in TurnStatus.TERMINAL:
                break
        assert h2.row()[0] == TurnStatus.TERMINAL_COMPLETED
        assert any(
            "Pipeline auto-finish." in (r["content"] or "")
            for r in original.replies
        )
        for task in list(h2.manager._waiters.values()):
            task.cancel()


class TestSessionRecheckUnderLock:
    async def test_advance_while_waiting_for_the_lock_stands_down(self, tmp_path):
        """Round-3 deviation #3 (PR #242): the authoritative session check
        runs UNDER the channel lock — a message advancing the session while
        auto-resume queues for the lock must stand it down."""
        h, original = await suspend_turn(tmp_path)
        heal_capacity(h, text_response("stale reply that must never send"))
        rows = h.store.list_suspended_sync("discord")
        row = h.store.load_resumable_sync(
            __import__("src.turn_state", fromlist=["TurnKey"]).TurnKey(
                "discord", rows[0]["channel_id"], rows[0]["message_id"]
            )
        )
        from src.turn_state import TurnKey

        key = TurnKey("discord", rows[0]["channel_id"], rows[0]["message_id"])
        ch_id = key.channel_id
        baseline = h.manager._session_len(ch_id)
        allowed = {baseline, baseline + 1}

        lock = h.manager._channel_lock(ch_id)
        await lock.acquire()  # another turn holds the channel
        resume_task = asyncio.get_running_loop().create_task(
            h.manager._run_auto_resume(key, row, allowed)
        )
        await asyncio.sleep(0.05)  # auto-resume is now queued on the lock
        # The session advances by a full turn while auto-resume waits.
        h.bot.sessions.add_message(ch_id, "user", "new topic")
        h.bot.sessions.add_message(ch_id, "assistant", "answered")
        lock.release()
        await asyncio.wait_for(resume_task, timeout=5)
        assert h.row()[0] == TurnStatus.SUSPENDED  # stood down under the lock


class TestStructuralPayloadValidation:
    async def test_empty_object_payload_terminally_rejects(self, tmp_path):
        """Round-3 deviation #5 (PR #242): a syntactically-valid but
        structurally-invalid payload rejects BEFORE any lease exists —
        never bounced back to SUSPENDED for an infinite retry loop."""
        h, original = await suspend_turn(tmp_path)
        h.store._conn.execute("UPDATE turns SET payload='{}'")
        h.store._conn.commit()
        result = await h.manager.try_explicit_resume(resume_msg(original))
        assert result is not None
        assert "could not be restored" in result[0]
        (status,) = h.store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.TERMINAL_REJECTED

    def test_validate_payload_rejects_each_structural_deviation(self):
        import pytest as _pytest

        from src.turn_state.codec import (
            CODEC_VERSION,
            CheckpointInvalidError,
            validate_payload,
        )

        good_fields = {name: None for name in __import__(
            "src.turn_state.codec", fromlist=["PERSISTED_FIELDS"]
        ).PERSISTED_FIELDS}
        good_fields.update({
            "system_prompt": "s", "messages": [], "user_id": "u",
            "chat_cap": 1, "iteration": 0, "stuck_tracker": {},
            "_trajectory": {}, "_ch_id": "c", "_req_id": "r",
        })
        base = {"codec_version": CODEC_VERSION, "policy": "chat",
                "generation_seq": 0, "fields": good_fields}
        validate_payload(base)  # sane baseline passes

        for broken in (
            {},  # everything missing
            "not-an-object",  # payload must be a dict
            {**base, "codec_version": CODEC_VERSION + 1},  # future codec
            {**base, "policy": "loop"},  # wrong policy
            {**base, "fields": "nope"},  # fields envelope must be a dict
            {**base, "fields": {}},  # missing persisted fields
            {**base, "fields": {**good_fields, "messages": "not-a-list"}},
        ):
            with _pytest.raises(CheckpointInvalidError):
                validate_payload(broken)


class TestExplicitResumeOrdering:
    async def test_resume_trigger_skips_history_compaction(self, tmp_path):
        """Round-3 deviation #6 (PR #242): the explicit-resume check runs
        BEFORE prompt/history assembly — get_task_history (which can invoke
        the compaction LLM) must never be called for a resume trigger."""
        h, original = await suspend_turn(tmp_path)
        heal_capacity(h, text_response("Resumed through the pipeline."))
        h.bot.pipeline._turn_resume = h.manager

        calls = []
        real_gth = h.bot.sessions.get_task_history

        async def recording_gth(*a, **k):
            calls.append(a)
            return await real_gth(*a, **k)

        h.bot.sessions.get_task_history = recording_gth
        trigger = resume_msg(original)
        await h.bot.pipeline.run(trigger, trigger.content)
        assert calls == []  # resume never touched history assembly
        assert h.row()[0] == TurnStatus.TERMINAL_COMPLETED
        assert any(
            "Resumed through the pipeline." in (r["content"] or "")
            for r in trigger.replies
        )
