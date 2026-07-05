"""Characterization: the autonomous-loop pipeline (_run_loop_iteration +
_dispatch_loop_tool). Pins the RFC-001 §4.3 chat-vs-loop asymmetries that
Phase 8 unification must preserve — the rows that could silently drift.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.llm.circuit_breaker import CircuitOpenError
from src.tools.result_validator import ToolResult
from tests.fakes import (
    FakeChannel,
    FakeLLM,
    make_bot,
    parse_error_call,
    text_response,
    tool_call_response,
)

HEDGING_TEXT = "Shall I proceed with the deployment now?"


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def build(script, **overrides):
    fake = FakeLLM(script)
    bot = make_bot(fake_llm=fake, config_overrides=overrides or None)
    # Deterministic tests: reflection dispatch is a boundary here
    bot.turn_recorder._maybe_loop_reflect = _ReflectRecorder()
    return bot, fake


class _ReflectRecorder:
    def __init__(self):
        self.calls: list[dict] = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)


async def run_iteration(bot, prompt="do the loop work", prev=None, user_id="4242"):
    return await bot.tool_loop.run_autonomous(prompt, FakeChannel(id=777), prev, user_id)


# ---------------------------------------------------------------------------
# Core flow and message shape
# ---------------------------------------------------------------------------


class TestLoopFlow:
    async def test_natural_finish_returns_final_text(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response("iteration complete"),
            ]
        )
        result = await run_iteration(bot)
        assert result == "iteration complete"
        assert len(fake.calls) == 2

    async def test_prev_context_synthetic_exchange_shape(self):
        bot, fake = build([text_response("ok")])
        await run_iteration(bot, prompt="continue the work", prev="found 3 issues")
        msgs = fake.messages_of_call(0)
        assert msgs[0]["role"] == "user"
        assert msgs[0]["content"] == "Previous iteration results:\nfound 3 issues"
        assert msgs[1]["role"] == "assistant"
        assert "context from previous iterations" in msgs[1]["content"]
        assert msgs[2] == {"role": "user", "content": "continue the work"}

    async def test_no_preamble_without_prev_context(self):
        bot, fake = build([text_response("ok")])
        await run_iteration(bot, prompt="just this")
        msgs = fake.messages_of_call(0)
        assert msgs == [{"role": "user", "content": "just this"}]

    async def test_long_final_text_truncated_to_discord_limit(self):
        from src.discord.delivery import DISCORD_MAX_LEN

        bot, fake = build([text_response("x" * (DISCORD_MAX_LEN + 500))])
        result = await run_iteration(bot)
        assert len(result) <= DISCORD_MAX_LEN
        assert result.endswith("... (truncated)")


# ---------------------------------------------------------------------------
# §4.3 asymmetry pins — these are the P8 acceptance tripwires
# ---------------------------------------------------------------------------


class TestAsymmetryPins:
    async def test_no_response_guards_in_loop(self):
        """Hedging text is returned as-is: the loop path has NO guard cascade."""
        bot, fake = build([text_response(HEDGING_TEXT)])
        result = await run_iteration(bot)
        assert result == HEDGING_TEXT
        assert len(fake.calls) == 1  # no retry injection

    async def test_no_completion_classifier_in_loop(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response("partial-looking answer"),
            ]
        )
        await run_iteration(bot)
        assert fake.chat_calls == []  # classifier never consulted

    async def test_llm_called_directly_not_via_codex_call(self):
        """The loop bypasses _codex_call — no cost tracking, no model routing."""
        bot, fake = build([text_response("ok")])
        gateway_calls = []
        orig = bot.llm_gateway.call_with_tools

        async def spy(**kwargs):
            gateway_calls.append(kwargs)
            return await orig(**kwargs)

        bot.llm_gateway.call_with_tools = spy
        records = []
        bot.cost_tracker.record = lambda *a, **k: records.append((a, k))
        await run_iteration(bot)
        assert gateway_calls == []
        assert records == []
        assert len(fake.calls) == 1

    async def test_circuit_open_error_reraised_to_loop_manager(self):
        bot, fake = build([CircuitOpenError("codex", 5.0)])
        with pytest.raises(CircuitOpenError):
            await run_iteration(bot)

    async def test_generic_llm_error_returned_as_text(self):
        bot, fake = build([RuntimeError("provider exploded")])
        result = await run_iteration(bot)
        assert result == "LLM call failed: provider exploded"
        assert bot.turn_recorder._maybe_loop_reflect.calls[-1]["is_error"] is True
        assert bot.turn_recorder._maybe_loop_reflect.calls[-1]["failure_class"] == "provider"

    async def test_cap_exhaustion_is_error_with_failure_class_cancelled(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "a"})),
                tool_call_response(("parse_time", {"text": "b"})),
            ],
            tools={"max_tool_iterations_loop": 2},
        )
        result = await run_iteration(bot)
        assert "Iteration hit the loop tool-iteration cap (2)" in result
        reflect = bot.turn_recorder._maybe_loop_reflect.calls[-1]
        assert reflect["is_error"] is True
        assert reflect["failure_class"] == "cancelled"

    async def test_cap_exhaustion_surfaces_stale_partial_text(self):
        """Pre-tool text from an earlier iteration is surfaced as 'partial',
        never silently returned as a clean success."""
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "a"}), text="working on it"),
                tool_call_response(("parse_time", {"text": "b"})),
            ],
            tools={"max_tool_iterations_loop": 2},
        )
        result = await run_iteration(bot)
        assert "Last partial output before the cap:" in result
        assert "working on it" in result

    async def test_recovered_tool_error_is_success_with_failure_detail(self):
        """A mid-iteration tool error followed by a clean finish returns the
        final text as a SUCCESS, but passes the failure detail to reflection."""
        bot, fake = build(
            [
                tool_call_response(("run_command", {"host": "h", "command": "x"})),
                text_response("recovered and finished"),
            ]
        )
        bot.tool_executor.execute = AsyncMock(side_effect=RuntimeError("ssh died"))
        result = await run_iteration(bot)
        assert result == "recovered and finished"
        reflect = bot.turn_recorder._maybe_loop_reflect.calls[-1]
        assert reflect["is_error"] is False
        assert reflect["failure_class"] == "command_failed"
        assert "ssh died" in reflect["error_text"]

    async def test_trajectory_source_is_loop(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response("done"),
            ]
        )
        saved = []

        async def spy_save(turn):
            saved.append(turn)

        bot.trajectory_saver.save = spy_save
        await run_iteration(bot)
        assert len(saved) == 1
        turn = saved[0]
        assert turn.source == "loop"
        assert len(turn.iterations) == 2
        assert turn.iterations[0].tool_calls[0]["name"] == "parse_time"
        assert turn.iterations[0].tool_results  # results persisted onto the iteration


# ---------------------------------------------------------------------------
# Loop tool dispatch parity (chat-equivalent semantics through the proxy path)
# ---------------------------------------------------------------------------


class TestLoopDispatchParity:
    async def test_parse_error_not_executed_in_loop(self):
        bot, fake = build(
            [
                parse_error_call("run_command", "bad json"),
                text_response("retried"),
            ]
        )
        bot.tool_executor.execute = AsyncMock()
        await run_iteration(bot)
        bot.tool_executor.execute.assert_not_awaited()
        content = fake.messages_of_call(1)[-1]["content"][0]["content"]
        assert "bad json" in content and "NOT executed" in content

    async def test_ok_false_visibility_in_loop(self):
        bot, fake = build(
            [
                tool_call_response(("run_command", {"host": "h", "command": "x"})),
                text_response("noted"),
            ]
        )
        bot.tool_executor.execute = AsyncMock(
            return_value=ToolResult(output="quietly failed", ok=False, tool_name="run_command"),
        )
        await run_iteration(bot)
        content = fake.messages_of_call(1)[-1]["content"][0]["content"]
        assert content.startswith("Error (tool reported failure):\n")

    async def test_rbac_denial_in_loop_dispatch(self):
        bot, fake = build(
            [
                tool_call_response(("run_command", {"host": "h", "command": "x"})),
                text_response("ok"),
            ]
        )
        bot.tool_executor.execute = AsyncMock()
        bot.tool_executor.check_permission = lambda tool, uid: "RBAC denied: nope"
        await run_iteration(bot)
        bot.tool_executor.execute.assert_not_awaited()
        content = fake.messages_of_call(1)[-1]["content"][0]["content"]
        assert content == "RBAC denied: nope"

    async def test_native_tool_dispatches_through_loop_proxy(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "tomorrow 3pm"})),
                text_response("parsed"),
            ]
        )
        result = await run_iteration(bot)
        assert result == "parsed"
        content = fake.messages_of_call(1)[-1]["content"][0]["content"]
        assert content  # parse_time produced real output through the proxy path

    async def test_skill_crud_rebuilds_prompt_in_loop(self):
        bot, fake = build(
            [
                tool_call_response(("create_skill", {"name": "s1", "code": "# c"})),
                text_response("made it"),
            ]
        )
        bot.skill_manager.create_skill = lambda name, code: f"Skill '{name}' created."
        bot.prompt_builder.cached_skills_text = "stale"
        bot.tool_catalog.cached = [{"name": "stale"}]
        await run_iteration(bot)
        assert bot.tool_catalog.cached is None
        assert bot.prompt_builder.cached_skills_text != "stale"

    async def test_export_skill_stages_pending_file_in_loop(self):
        """Loop-path skill files are STAGED to _pending_files, not sent
        directly to the channel (chat sends immediately) — §4.3-adjacent
        parity subtlety worth its own tripwire."""
        bot, _ = build([text_response("unused")])
        bot.skill_manager.export_skill = lambda name: (b"zipbytes", "s1_skill.zip")
        from src.discord.tool_loop import _LoopMessageProxy

        proxy = _LoopMessageProxy(FakeChannel(id=777), "4242", "loop")
        result = await bot.tool_loop.dispatch_loop_tool(
            "export_skill", {"name": "s1"}, proxy, "4242"
        )
        assert "exported as s1_skill.zip" in result
        assert bot.channel_state.pending_files["777"] == [(b"zipbytes", "s1_skill.zip")]

    async def test_invoke_skill_missing_required_fields_errors(self):
        bot, _ = build([text_response("unused")])
        from types import SimpleNamespace

        bot.skill_manager.has_skill = lambda name: name == "needy"
        bot.skill_manager._skills = {
            "needy": SimpleNamespace(definition={"input_schema": {"required": ["q", "depth"]}}),
        }
        from src.discord.tool_loop import _LoopMessageProxy

        proxy = _LoopMessageProxy(FakeChannel(id=777), "4242", "loop")
        result = await bot.tool_loop.dispatch_loop_tool(
            "invoke_skill",
            {"name": "needy", "input": {"q": "x"}},
            proxy,
            "4242",
        )
        assert "missing required fields" in result
        assert "depth" in result

    async def test_unknown_tool_routes_to_executor_with_user_id(self):
        bot, _ = build([text_response("unused")])
        bot.tool_executor.execute = AsyncMock(
            return_value=ToolResult(output="ran", tool_name="run_command")
        )
        from src.discord.tool_loop import _LoopMessageProxy

        proxy = _LoopMessageProxy(FakeChannel(id=777), "4242", "loop")
        result = await bot.tool_loop.dispatch_loop_tool(
            "run_command", {"host": "h", "command": "x"}, proxy, "4242"
        )
        bot.tool_executor.execute.assert_awaited_once()
        _, kwargs = bot.tool_executor.execute.await_args
        assert kwargs.get("user_id") == "4242"
        assert str(result) == "ran"
