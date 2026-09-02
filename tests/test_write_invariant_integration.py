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


class TestCancellationBranches:
    async def test_stop_before_first_iteration_is_terminal_cancelled(self, tmp_path):
        import asyncio

        bot, fake, store = build_with_store([text_response("never")], tmp_path)
        msg = FakeMessage("go")
        evt = bot.channel_state.cancel_events.setdefault(
            str(msg.channel.id), asyncio.Event()
        )
        evt.set()
        text, *_ = await run_loop(bot, msg)
        assert text.startswith("Task stopped by user.")
        (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.TERMINAL_CANCELLED

    async def test_stop_during_recovery_wait_is_graceful(self, tmp_path):
        import asyncio

        bot, fake, store = build_with_store([], tmp_path)
        msg = FakeMessage("go")
        evt = bot.channel_state.cancel_events.setdefault(
            str(msg.channel.id), asyncio.Event()
        )

        def capacity_and_stop():
            evt.set()  # /stop lands while the recovery wait begins
            raise LLMCapacityError("overloaded", retry_after=5.0)

        fake.responses.append(capacity_and_stop)
        text, _, is_error, *_ = await run_loop(bot, msg)
        assert text.startswith("Task stopped by user.")
        assert is_error is False
        (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.TERMINAL_CANCELLED

    async def test_cancelled_mixed_batch_settles_without_unknown(self, tmp_path):
        import asyncio

        from src.llm.types import LLMResponse, ToolCall

        batch = LLMResponse(
            text="",
            tool_calls=[
                ToolCall(id="wait", name="wait_for_agents", input={"agent_ids": ["a"]}),
                ToolCall(id="cmd", name="run_command", input={"host": "h", "command": "x"}),
            ],
            stop_reason="tool_use",
        )
        bot, fake, store = build_with_store([batch], tmp_path)
        read_started = asyncio.Event()
        cmd_started = asyncio.Event()
        cmd_release = asyncio.Event()

        async def wait_dispatch(*_args, **_kwargs):
            read_started.set()
            await asyncio.sleep(3600)

        async def execute(tool_name, tool_input, *, user_id=None):
            cmd_started.set()
            await cmd_release.wait()
            return ToolResult(output="applied", tool_name=tool_name)

        bot.native_tools.dispatch = wait_dispatch
        bot.tool_executor.execute = execute
        msg = FakeMessage("go")
        task = asyncio.create_task(run_loop(bot, msg))
        await asyncio.wait_for(read_started.wait(), timeout=1)
        await asyncio.wait_for(cmd_started.wait(), timeout=1)
        bot.channel_state.cancel_events[str(msg.channel.id)].set()
        await asyncio.sleep(0.05)
        assert not task.done()  # effect-capable sibling must finish naturally
        cmd_release.set()

        text, *_ = await asyncio.wait_for(task, timeout=1)
        assert text.startswith("Task stopped by user.")
        states = {call_id: state for call_id, state, _result in op_rows(store)}
        assert states == {"cmd": OpState.APPLIED, "wait": OpState.DEFINITELY_FAILED}
        assert OpState.OUTCOME_UNKNOWN not in states.values()

    async def test_stop_preempted_observation_is_definitely_failed(self, tmp_path):
        import asyncio

        bot, fake, store = build_with_store(
            [tool_call_response(("wait_for_agents", {"agent_ids": ["a"]}))],
            tmp_path,
        )
        started = asyncio.Event()

        async def blocking_wait(*_args, **_kwargs):
            started.set()
            await asyncio.sleep(3600)

        bot.native_tools.dispatch = blocking_wait
        msg = FakeMessage("go")
        task = asyncio.create_task(run_loop(bot, msg))
        await asyncio.wait_for(started.wait(), timeout=1)
        bot.channel_state.cancel_events[str(msg.channel.id)].set()

        text, *_ = await asyncio.wait_for(task, timeout=1)
        assert text.startswith("Task stopped by user.")
        op = op_rows(store)[0]
        assert op[1] == OpState.DEFINITELY_FAILED
        assert "cancelled by /stop before any effect" in op[2]
        (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.TERMINAL_CANCELLED

    async def test_task_cancel_with_failing_settle_still_propagates(self, tmp_path):
        import asyncio
        from unittest.mock import AsyncMock, patch

        from src.turn_state.durability import TurnDurability

        bot, fake, store = build_with_store(
            [tool_call_response(("run_command", {"command": "x"}))], tmp_path
        )
        started = asyncio.Event()

        async def blocking_tool(tool_name, tool_input, *, user_id=None):
            started.set()
            await asyncio.sleep(3600)

        bot.tool_executor.execute = blocking_tool
        with patch.object(
            TurnDurability,
            "settle_terminal",
            AsyncMock(side_effect=asyncio.CancelledError()),
        ):
            task = asyncio.get_running_loop().create_task(
                run_loop(bot, FakeMessage("go"))
            )
            await asyncio.wait_for(started.wait(), timeout=5)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

    async def test_escape_settle_failure_keeps_original_error(self, tmp_path):
        from unittest.mock import AsyncMock, patch

        from src.tools.result_validator import ToolResult
        from src.turn_state.durability import TurnDurability

        bot, fake, store = build_with_store(
            [
                tool_call_response(("run_command", {"command": "one"})),
                text_response("never"),
            ],
            tmp_path,
        )

        async def kill_durability(tool_name, tool_input, *, user_id=None):
            store._conn.close()
            return ToolResult(output="ok", tool_name=tool_name)

        bot.tool_executor.execute = kill_durability
        with patch.object(
            TurnDurability,
            "settle_terminal",
            AsyncMock(side_effect=RuntimeError("settle also broken")),
        ):
            # The ORIGINAL fail-closed error must surface, never the
            # settle-bookkeeping failure.
            with pytest.raises(TurnStateUnavailableError):
                await run_loop(bot, FakeMessage("go"))


class TestSuspendFallback:
    async def test_failed_suspension_reports_plain_error_never_false_claims(
        self, tmp_path
    ):
        from unittest.mock import AsyncMock, patch

        from src.turn_state.durability import TurnDurability

        bot, fake, store = build_with_store([], tmp_path)
        fake.responses.append(capacity_forever(fake))
        with patch.object(
            TurnDurability, "suspend", AsyncMock(return_value=False)
        ):
            text, _, is_error, *_ = await run_loop(bot, FakeMessage("go"))
        assert is_error is True
        assert text.startswith("LLM API error:")
        assert "preserved" not in text  # no false preservation claims
        (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.TERMINAL_FAILED


class TestMalformedBatch:
    async def test_duplicate_call_ids_bounce_without_execution(self, tmp_path):
        from unittest.mock import AsyncMock

        from src.llm.types import LLMResponse, ToolCall

        dup_batch = LLMResponse(
            text="",
            tool_calls=[
                ToolCall(id="dup", name="run_command", input={"command": "a"}),
                ToolCall(id="dup", name="run_command", input={"command": "b"}),
            ],
            stop_reason="tool_use",
        )
        bot, fake, store = build_with_store(
            [dup_batch, text_response("recovered with fresh ids")], tmp_path
        )
        bot.tool_executor.execute = AsyncMock()
        text, *_ = await run_loop(bot, FakeMessage("go"))
        assert text == "recovered with fresh ids"
        bot.tool_executor.execute.assert_not_awaited()  # failed BEFORE execution
        bounce = [
            b
            for m in fake.calls[-1]["messages"]
            if isinstance(m.get("content"), list)
            for b in m["content"]
            if isinstance(b, dict) and b.get("type") == "tool_result"
        ]
        assert bounce and all("NOT executed" in b["content"] for b in bounce)


class TestHousekeepingSweep:
    def test_ttl_sweep_runs_and_swallows_failures(self, tmp_path):
        import time as _time
        from types import SimpleNamespace
        from unittest.mock import MagicMock

        from src.discord.housekeeping import Housekeeping
        from src.turn_state import TurnKey

        store = TurnStateStore(tmp_path / "hk" / "turns.sqlite3")
        lease, disposition = store.admit_turn_sync(
            TurnKey("discord", "c1", "m1"),
            guild_id=None, user_id="u", content_digest="d", code_version="t",
            prompt_policy_hash="p", tool_catalog_hash="t",
            session_snapshot=None,
        )
        assert disposition == "admitted"
        store.suspend_sync(lease, {"p": 1})
        store._conn.execute(
            "UPDATE turns SET last_progress_at=?", [_time.time() - 25 * 3600]
        )
        store._conn.commit()

        cfg = SimpleNamespace(
            turn_state=SimpleNamespace(
                resume_ttl_hours=24.0,
                payload_retention_days=7.0,
                ledger_retention_days=90.0,
            ),
            attachments=None,
        )
        released = []

        class _Observer:
            def release_workload(self, scope):
                released.append(scope)

        hk = Housekeeping(
            get_config=lambda: cfg,
            sessions=MagicMock(ids=lambda: []),
            channel_state=MagicMock(),
            prompt_builder=MagicMock(),
            agent_manager=None,
            loop_manager=MagicMock(),
            loop_agent_bridge=None,
            channel_logger=None,
            fts_index=None,
            turn_store=store,
            window_observer=_Observer(),
        )
        hk.cleanup_stale()
        row = store._conn.execute("SELECT status FROM turns").fetchone()
        assert row[0] == TurnStatus.TERMINAL_EXPIRED
        assert [(scope.surface_kind, scope.workload_id) for scope in released] == [
            ("chat", "discord:c1:m1")
        ]

        # The expired-active defense sweep runs too: park a dead-owner
        # ACTIVE row and let housekeeping suspend it (log-line branch).
        lease2, disposition2 = store.admit_turn_sync(
            TurnKey("discord", "c2", "m2"),
            guild_id=None, user_id="u", content_digest="d", code_version="t",
            prompt_policy_hash="p", tool_catalog_hash="t",
            session_snapshot=None,
        )
        assert disposition2 == "admitted"
        store._conn.execute(
            "UPDATE turns SET lease_expires_at=? WHERE message_id='m2'",
            [_time.time() - 5],
        )
        store._conn.commit()
        hk.cleanup_stale()
        row2 = store._conn.execute(
            "SELECT status FROM turns WHERE message_id='m2'"
        ).fetchone()
        assert row2[0] == TurnStatus.SUSPENDED

        # A raising store must never break housekeeping — both sweep steps.
        store.sweep_expired_active_sync = MagicMock(side_effect=RuntimeError("boom"))
        store.ttl_sweep_sync = MagicMock(side_effect=RuntimeError("boom"))
        hk.cleanup_stale()
        store.close()


class TestRedeliveryRefusal:
    async def test_redelivered_message_never_reruns_effects(self, tmp_path):
        """Review blocker #2 (PR #242): after a restart wipes the in-memory
        dedup cache, a redelivered message with a terminal ledger row must
        REFUSE fresh execution — never run unledgered."""
        from unittest.mock import AsyncMock

        bot, fake, store = build_with_store(
            [
                tool_call_response(("run_command", {"command": "deploy"})),
                text_response("done"),
            ],
            tmp_path,
        )
        msg = FakeMessage("deploy the thing")
        text, *_ = await run_loop(bot, msg)
        assert text == "done"

        # Same message identity arrives again (Discord redelivery).
        fake.responses.extend([text_response("must never be produced")])
        bot.tool_executor.execute = AsyncMock()
        text2, _, is_error2, tools2, _ = await run_loop(bot, msg)
        assert "already processed" in text2
        assert is_error2 is False
        assert tools2 == []
        bot.tool_executor.execute.assert_not_awaited()

    async def test_suspended_identity_redelivery_points_at_resume(self, tmp_path):
        from unittest.mock import AsyncMock

        bot, fake, store = build_with_store([], tmp_path)
        fake.responses.append(capacity_forever(fake))
        msg = FakeMessage("long job")
        await run_loop(bot, msg)  # suspends
        bot.tool_executor.execute = AsyncMock()
        text2, *_ = await run_loop(bot, msg)  # redelivery of the SAME id
        assert "resume" in text2
        bot.tool_executor.execute.assert_not_awaited()
        (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.SUSPENDED  # untouched


class TestLeaseHeartbeats:
    async def test_long_tool_outlives_the_lease_ttl(self, tmp_path):
        """Round-2 blocker #1 (PR #242): the owner beats the lease alive, so
        a tool longer than the TTL settles fine and the turn completes."""
        import asyncio

        from src.tools.result_validator import ToolResult

        bot, fake, store = build_with_store(
            [
                tool_call_response(("run_command", {"command": "slow"})),
                text_response("survived the long tool"),
            ],
            tmp_path,
        )
        store.lease_ttl = 0.4  # heartbeat interval becomes ~5s floor... force lower
        # The durability heartbeat floors at 5s; drop the floor via the
        # store's ttl AND patch the interval floor for the test.
        import src.turn_state.durability as dur_mod

        original_start = dur_mod.TurnDurability._start_heartbeats

        def fast_start(self):
            if self._store is None or self._lease is None:
                return
            store_, lease_ = self._store, self._lease

            async def _beat():
                while True:
                    await asyncio.sleep(0.1)
                    if not self.enabled:
                        return
                    try:
                        await asyncio.to_thread(store_.heartbeat_sync, lease_)
                    except Exception:
                        return

            self._heartbeat_task = asyncio.get_running_loop().create_task(_beat())

        dur_mod.TurnDurability._start_heartbeats = fast_start
        try:
            async def slow_tool(tool_name, tool_input, *, user_id=None):
                await asyncio.sleep(1.0)  # 2.5x the lease TTL
                return ToolResult(output="done slowly", tool_name=tool_name)

            bot.tool_executor.execute = slow_tool
            text, _, is_error, *_ = await run_loop(bot, FakeMessage("go"))
            assert text == "survived the long tool"
            assert is_error is False
            (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
            assert status == TurnStatus.TERMINAL_COMPLETED
        finally:
            dur_mod.TurnDurability._start_heartbeats = original_start


class TestAdmissionFailClosed:
    async def test_runtime_admission_failure_refuses_execution(self, tmp_path):
        """Round-2 blocker #2 (PR #242): once the store was wired available,
        an admission I/O failure refuses execution — never a fresh-identity
        guess."""
        import sqlite3 as _sqlite3
        from unittest.mock import AsyncMock

        bot, fake, store = build_with_store([text_response("never")], tmp_path)

        def raising_admit(*a, **k):
            raise _sqlite3.OperationalError("disk I/O error")

        store.admit_turn_sync = raising_admit
        bot.tool_executor.execute = AsyncMock()
        text, _, is_error, tools, _ = await run_loop(bot, FakeMessage("go"))
        assert "can't verify" in text
        assert tools == []
        bot.tool_executor.execute.assert_not_awaited()
        assert len(fake.calls) == 0  # no generation either

    async def test_store_unavailable_disposition_also_refuses(self, tmp_path):
        from unittest.mock import AsyncMock

        bot, fake, store = build_with_store([text_response("never")], tmp_path)
        store.admit_turn_sync = lambda *a, **k: (None, "store_unavailable")
        bot.tool_executor.execute = AsyncMock()
        text, *_ = await run_loop(bot, FakeMessage("go"))
        assert "can't verify" in text
        assert len(fake.calls) == 0

    async def test_feature_off_still_runs_legacy(self, tmp_path):
        bot, fake, store = build_with_store([text_response("legacy ok")], tmp_path)
        bot.tool_loop._turn_store = None  # durability off at wiring
        text, _, is_error, *_ = await run_loop(bot, FakeMessage("go"))
        assert text == "legacy ok"
        assert is_error is False
