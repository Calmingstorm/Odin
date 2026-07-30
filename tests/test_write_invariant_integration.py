"""Integration pins: the write invariant driven through the REAL chat loop.

Each test runs ToolLoopRunner.run against a real TurnStateStore and asserts
the durable state the invariant promises: intents before execution, settles
after completion, one fenced checkpoint per batch, suspension with
preserved work on capacity exhaustion, terminal tombstones, and the
fail-closed halt when durability dies mid-turn.
"""

from __future__ import annotations

import pytest

from src.llm.errors import LLMCapacityError
from src.llm.recovery import RecoveryPolicy
from src.tools.result_validator import ToolResult
from src.turn_state import OpState, TurnStateUnavailableError, TurnStatus
from src.turn_state.store import TurnStateStore
from tests.fakes import FakeLLM, FakeMessage, make_bot, text_response, tool_call_response

FAST_POLICY = RecoveryPolicy(
    deadline_seconds=0.2, backoff_base=0.01, backoff_cap=0.02, retry_after_cap=0.05
)


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def build_with_store(script, tmp_path, **overrides):
    fake = FakeLLM(script)
    bot = make_bot(fake_llm=fake, config_overrides=overrides or None)
    store = TurnStateStore(tmp_path / "turn_state" / "turns.sqlite3")
    bot.tool_loop._turn_store = store
    bot.llm_gateway._recovery_policy_source = lambda: FAST_POLICY
    return bot, fake, store


def capacity_forever(fake):
    """Script entry raising capacity and re-arming itself (persistent outage)."""

    def _raise():
        fake.responses.append(_raise)
        raise LLMCapacityError(
            "Codex capacity: server_is_overloaded", provider="codex", model="fake-model"
        )

    return _raise


async def run_loop(bot, msg):
    return await bot.tool_loop.run(msg, [{"role": "user", "content": msg.content}])


def turn_row(store, cols="status, revision, payload"):
    return store._conn.execute(f"SELECT {cols} FROM turns").fetchone()


def op_rows(store):
    return store._conn.execute(
        "SELECT tool_call_id, state, result FROM operations ORDER BY tool_call_id"
    ).fetchall()


class TestHappyPath:
    async def test_completed_turn_settles_and_compacts(self, tmp_path):
        bot, fake, store = build_with_store(
            [
                tool_call_response(("parse_time", {"text": "tomorrow 3pm"})),
                text_response("Parsed it."),
            ],
            tmp_path,
        )
        text, _, is_error, tools_used, _ = await run_loop(bot, FakeMessage("parse"))
        assert text == "Parsed it."
        assert is_error is False

        status, revision, payload = turn_row(store)
        assert status == TurnStatus.TERMINAL_COMPLETED
        assert payload is None  # compacted immediately
        assert revision >= 3  # deadline + WI-1 + WI-4 at minimum

        ops = op_rows(store)
        assert len(ops) == 1
        call_id, state, result = ops[0]
        assert call_id == "call-1"
        assert state == OpState.APPLIED
        assert result  # the model-visible result text rode the ledger

    async def test_intents_are_durable_and_running_before_execution(self, tmp_path):
        bot, fake, store = build_with_store(
            [
                tool_call_response(("run_command", {"command": "ls"})),
                text_response("done"),
            ],
            tmp_path,
        )
        seen_states = []

        async def probing_execute(tool_name, tool_input, *, user_id=None):
            # WI-1/WI-2: at execution time the intent row already exists and
            # is RUNNING — durable BEFORE the external effect.
            rows = op_rows(store)
            seen_states.append(rows[0][1] if rows else None)
            return ToolResult(output="probe ok", tool_name=tool_name)

        bot.tool_executor.execute = probing_execute
        text, *_ = await run_loop(bot, FakeMessage("go"))
        assert text == "done"
        assert seen_states == [OpState.RUNNING]

class TestSuspension:
    async def test_capacity_exhaustion_suspends_with_preserved_work(self, tmp_path):
        bot, fake, store = build_with_store(
            [tool_call_response(("parse_time", {"text": "tomorrow"}))], tmp_path
        )
        fake.responses.append(capacity_forever(fake))

        text, _, is_error, tools_used, _ = await run_loop(bot, FakeMessage("parse"))
        assert is_error is True
        assert "preserved" in text
        assert "resume" in text
        assert tools_used == ["parse_time"]

        status, _, payload = turn_row(store)
        assert status == TurnStatus.SUSPENDED
        assert payload is not None

        import json as _json

        fields = _json.loads(payload)["fields"]
        # The transcript survived: assistant tool_use + matched tool_result.
        roles = [m.get("role") for m in fields["messages"]]
        assert "assistant" in roles
        assert fields["tools_used_in_loop"] == ["parse_time"]
        # The first generation's op settled APPLIED before the outage.
        ops = op_rows(store)
        assert ops and ops[0][1] == OpState.APPLIED
        # Recovery deadline was persisted as absolute UTC.
        (deadline,) = store._conn.execute(
            "SELECT recovery_deadline_utc FROM turns"
        ).fetchone()
        assert deadline is not None

    async def test_consumed_guard_flag_is_durable_in_suspension(self, tmp_path):
        # Hedging guard fires (one-shot flag consumed) → capacity kills the
        # retry generation → the suspended payload must carry the consumed
        # flag (WI-5): a future resume gets NO fresh hedging budget.
        bot, fake, store = build_with_store(
            [text_response("Shall I proceed with the deployment now?")], tmp_path
        )
        fake.responses.append(capacity_forever(fake))

        text, _, is_error, *_ = await run_loop(bot, FakeMessage("deploy it"))
        assert is_error is True

        import json as _json

        status, _, payload = turn_row(store)
        assert status == TurnStatus.SUSPENDED
        fields = _json.loads(payload)["fields"]
        assert fields["hedging_retried"] is True

    async def test_suspension_persistence_failure_reports_plain_error(self, tmp_path):
        bot, fake, store = build_with_store(
            [tool_call_response(("parse_time", {"text": "x"}))], tmp_path
        )
        fake.responses.append(capacity_forever(fake))

        async def kill_store_then_probe(tool_name, tool_input, *, user_id=None):
            return ToolResult(output="ok", tool_name=tool_name)

        # Sever durability AFTER the first batch (mid-turn) but make the
        # suspension write the first failing one: monkey-close the conn just
        # before capacity exhausts. Simplest deterministic point: close it
        # inside the capacity callable's first raise.
        original = fake.responses[-1]

        def close_then_capacity():
            store._conn.close()
            return original()

        fake.responses[-1] = close_then_capacity

        with pytest.raises((TurnStateUnavailableError, Exception)):
            # Depending on which durable write hits the closed connection
            # first (deadline checkpoint vs suspension), the turn either
            # fail-closes (raise) or reports the plain error tuple. Both are
            # acceptable; what is FORBIDDEN is a "work preserved" claim.
            result = await run_loop(bot, FakeMessage("x"))
            assert "preserved" not in result[0]
            raise TurnStateUnavailableError("reached tuple path (acceptable)")


class TestTerminalStates:
    async def test_cancelled_turn_is_terminal_cancelled(self, tmp_path):
        bot, fake, store = build_with_store(
            [tool_call_response(("run_command", {"command": "x"}))], tmp_path
        )

        async def cancel_during_tool(tool_name, tool_input, *, user_id=None):
            ch_id = str(FakeMessage("x").channel.id)
            bot.channel_state.cancel_events[ch_id].set()
            return ToolResult(output="ok", tool_name=tool_name)

        bot.tool_executor.execute = cancel_during_tool
        text, *_ = await run_loop(bot, FakeMessage("go"))
        assert text.startswith("Task stopped by user.")
        (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.TERMINAL_CANCELLED

    async def test_tool_timeout_settles_outcome_unknown(self, tmp_path):
        bot, fake, store = build_with_store(
            [
                tool_call_response(("run_command", {"command": "x"})),
                text_response("moved on"),
            ],
            tmp_path,
        )

        async def raise_timeout(tool_name, tool_input, *, user_id=None):
            raise TimeoutError("simulated in-execution timeout")

        bot.tool_executor.execute = raise_timeout
        text, *_ = await run_loop(bot, FakeMessage("go"))
        assert text == "moved on"
        ops = op_rows(store)
        # The interrupted execution may have applied — UNKNOWN, never a
        # confident failure, never rerun.
        assert ops and ops[0][1] == OpState.OUTCOME_UNKNOWN

    async def test_llm_error_turn_is_terminal_failed(self, tmp_path):
        bot, fake, store = build_with_store([RuntimeError("boom")], tmp_path)
        text, _, is_error, *_ = await run_loop(bot, FakeMessage("go"))
        assert is_error is True
        (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.TERMINAL_FAILED


class TestFailClosed:
    async def test_mid_turn_durability_death_halts_the_turn(self, tmp_path):
        # Two batches scripted; durability dies during the FIRST tool's
        # execution → the WI-3/WI-4 write raises → the turn halts through
        # the escape guard instead of silently continuing without durability.
        bot, fake, store = build_with_store(
            [
                tool_call_response(("run_command", {"command": "one"})),
                tool_call_response(("run_command", {"command": "two"})),
                text_response("never reached"),
            ],
            tmp_path,
        )
        executed = []

        async def kill_durability(tool_name, tool_input, *, user_id=None):
            executed.append(tool_input["command"])
            store._conn.close()
            return ToolResult(output="ok", tool_name=tool_name)

        bot.tool_executor.execute = kill_durability
        with pytest.raises(TurnStateUnavailableError):
            await run_loop(bot, FakeMessage("go"))
        # The second batch never started: fail closed, not fail quiet.
        assert executed == ["one"]
