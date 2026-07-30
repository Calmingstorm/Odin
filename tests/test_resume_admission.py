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
        for _ in range(200):
            await asyncio.sleep(0.02)
            if h.row()[0] != TurnStatus.SUSPENDED:
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
        await asyncio.sleep(0.06)  # baseline sampled while the breaker paces
        h.bot.sessions.add_message(str(original.channel.id), "user", "new topic")
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
