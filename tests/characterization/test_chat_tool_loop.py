"""Characterization: the chat tool loop (_process_with_tools).

Pins message-list shapes, the response-guard cascade (order and one-retry
semantics), completion-classifier continuations, validation enforcement,
stuck-loop handling, cancellation, cap/error exits, RBAC, parse-error
bounce, ok=False visibility, vision injection, and skill handoff — against
baseline behavior (RFC-001 §8.1).
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.response_guards import (
    _CODE_HEDGING_RETRY_MSG,
    _FABRICATION_RETRY_MSG,
    _FAILURE_RETRY_MSG,
    _HEDGING_RETRY_MSG,
    _PROMISE_RETRY_MSG,
    _TOOL_UNAVAIL_RETRY_MSG,
)
from src.llm.circuit_breaker import CircuitOpenError
from src.tools.result_validator import ToolResult
from tests.fakes import (
    FakeLLM,
    FakeMessage,
    make_bot,
    parse_error_call,
    text_response,
    tool_call_response,
)

# Known guard-triggering texts (mirrors tests/test_response_guards.py)
FABRICATION_TEXT = "I ran the command and everything looks fine."
PROMISE_TEXT = "I'll do that now for you right away."
UNAVAIL_TEXT = "That tool is not available in this environment."
HEDGING_TEXT = "Shall I proceed with the deployment now?"
CODE_HEDGING_TEXT = "You can run this:\n```bash\nls -la\n```"
FAILURE_TEXT = "I couldn't get the data from the server, it appears to be down."
# Must trigger NO guard: no action/state claims (fabrication reads "the server
# is now running" as an unverified result claim), no offers, no code fences.
INNOCENT_TEXT = "Paris is the capital of France."


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def build(script, chat=None, **overrides):
    fake = FakeLLM(script, chat_responses=chat)
    bot = make_bot(fake_llm=fake, config_overrides=overrides or None)
    return bot, fake


async def run_loop(bot, msg, history=None):
    return await bot.tool_loop.run(
        msg,
        history if history is not None else [{"role": "user", "content": msg.content}],
    )


# ---------------------------------------------------------------------------
# Basic flows and message shapes
# ---------------------------------------------------------------------------


class TestBasicFlows:
    async def test_plain_text_reply_no_tools(self):
        bot, fake = build([text_response(INNOCENT_TEXT)])
        msg = FakeMessage("status?")
        text, already_sent, is_error, tools_used, handoff = await run_loop(bot, msg)
        assert text == INNOCENT_TEXT
        assert already_sent is False
        assert is_error is False
        assert tools_used == []
        assert handoff is False
        assert len(fake.calls) == 1

    async def test_single_tool_then_final(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "tomorrow 3pm"})),
                text_response("Parsed it."),
            ]
        )
        msg = FakeMessage("parse tomorrow 3pm")
        text, _, is_error, tools_used, _ = await run_loop(bot, msg)
        assert text == "Parsed it."
        assert is_error is False
        assert tools_used == ["parse_time"]
        assert len(fake.calls) == 2

    async def test_no_history_message_shape(self):
        """With a single-message history the preamble is inserted at the front."""
        bot, fake = build([text_response("ok")])
        await run_loop(bot, FakeMessage("hi"))
        roles = [m["role"] for m in fake.messages_of_call(0)]
        assert roles == ["developer", "user"]
        # The no-history preamble is the thin channel-context form
        dev = fake.developer_messages_of_call(0)[0]
        assert "Current message ID:" in dev
        assert "CURRENT REQUEST" not in dev

    async def test_with_history_preamble_before_last_user(self):
        bot, fake = build([text_response("ok")])
        history = [
            {"role": "user", "content": "[tester]: earlier request"},
            {"role": "assistant", "content": "earlier answer"},
            {"role": "user", "content": "[tester]: new request"},
        ]
        await run_loop(bot, FakeMessage("new request"), history)
        msgs = fake.messages_of_call(0)
        roles = [m["role"] for m in msgs]
        assert roles == ["user", "assistant", "developer", "user"]
        dev = msgs[2]["content"]
        assert "=== CURRENT REQUEST [req-" in dev
        assert "HISTORY ABOVE | REQUEST BELOW" in dev

    async def test_tool_iteration_message_shape(self):
        """Second LLM call sees assistant tool_use + user tool_result, ids paired."""
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"}), text="Checking."),
                text_response("done"),
            ]
        )
        await run_loop(bot, FakeMessage("when is now"))
        msgs = fake.messages_of_call(1)
        assert [m["role"] for m in msgs] == ["developer", "user", "assistant", "user"]
        assistant = msgs[2]["content"]
        assert assistant[0] == {"type": "text", "text": "Checking."}
        assert assistant[1]["type"] == "tool_use"
        assert assistant[1]["name"] == "parse_time"
        results = msgs[3]["content"]
        assert isinstance(results, list) and len(results) == 1
        assert results[0]["type"] == "tool_result"
        assert results[0]["tool_use_id"] == assistant[1]["id"]

    async def test_parallel_tools_single_result_message(self):
        """N tool calls in one response → one user message with N tool_results."""
        bot, fake = build(
            [
                tool_call_response(
                    ("parse_time", {"text": "now"}),
                    ("list_schedules", {}),
                ),
                text_response("both done"),
            ]
        )
        _, _, _, tools_used, _ = await run_loop(bot, FakeMessage("do both"))
        assert tools_used == ["parse_time", "list_schedules"]
        results = fake.messages_of_call(1)[-1]["content"]
        assert [r["type"] for r in results] == ["tool_result", "tool_result"]
        assert {r["tool_use_id"] for r in results} == {"call-1", "call-2"}

    async def test_executor_routed_tool_dispatch(self):
        """Non-native tools go to ToolExecutor.execute with user_id."""
        bot, fake = build(
            [
                tool_call_response(("run_command", {"host": "playground", "command": "uptime"})),
                text_response("ran"),
            ]
        )
        bot.tool_executor.execute = AsyncMock(
            return_value=ToolResult(output="up 3 days", tool_name="run_command"),
        )
        msg = FakeMessage("uptime please")
        await run_loop(bot, msg)
        bot.tool_executor.execute.assert_awaited_once()
        args, kwargs = bot.tool_executor.execute.await_args
        assert args[0] == "run_command"
        assert kwargs.get("user_id") == str(msg.author.id)
        result_content = fake.messages_of_call(1)[-1]["content"][0]["content"]
        assert "up 3 days" in result_content


# ---------------------------------------------------------------------------
# Failure visibility, RBAC, parse errors
# ---------------------------------------------------------------------------


class TestToolFailurePaths:
    async def test_ok_false_result_gets_error_prefix(self):
        """ToolResult(ok=False) without an error prefix is wrapped verbatim
        as 'Error (tool reported failure):\\n<output>' (PR #130 behavior)."""
        bot, fake = build(
            [
                tool_call_response(("run_command", {"host": "h", "command": "x"})),
                text_response("noted"),
            ]
        )
        bot.tool_executor.execute = AsyncMock(
            return_value=ToolResult(
                output="looked fine but was denied", ok=False, tool_name="run_command"
            ),
        )
        await run_loop(bot, FakeMessage("do the thing"))
        content = fake.messages_of_call(1)[-1]["content"][0]["content"]
        assert content.startswith("Error (tool reported failure):\n")
        assert "looked fine but was denied" in content

    async def test_ok_false_with_existing_error_prefix_not_double_wrapped(self):
        bot, fake = build(
            [
                tool_call_response(("run_command", {"host": "h", "command": "x"})),
                text_response("noted"),
            ]
        )
        bot.tool_executor.execute = AsyncMock(
            return_value=ToolResult(
                output="Error: no such host", ok=False, tool_name="run_command"
            ),
        )
        await run_loop(bot, FakeMessage("go"))
        content = fake.messages_of_call(1)[-1]["content"][0]["content"]
        assert content.startswith("Error: no such host")
        assert "tool reported failure" not in content

    async def test_rbac_denial_returned_without_execution(self):
        bot, fake = build(
            [
                tool_call_response(("run_command", {"host": "h", "command": "x"})),
                text_response("understood"),
            ]
        )
        bot.tool_executor.execute = AsyncMock()
        bot.tool_executor.check_permission = lambda tool, uid: "RBAC denied: tier too low"
        _, _, is_error, tools_used, _ = await run_loop(bot, FakeMessage("go"))
        bot.tool_executor.execute.assert_not_awaited()
        content = fake.messages_of_call(1)[-1]["content"][0]["content"]
        assert content == "RBAC denied: tier too low"
        # Pinned as-is: the denied tool is still recorded in tools_used
        # (names are appended before dispatch).
        assert tools_used == ["run_command"]
        assert is_error is False

    async def test_parse_error_call_is_not_executed(self):
        bot, fake = build(
            [
                parse_error_call("run_command", "unterminated string in arguments"),
                text_response("retrying properly"),
            ]
        )
        bot.tool_executor.execute = AsyncMock()
        await run_loop(bot, FakeMessage("go"))
        bot.tool_executor.execute.assert_not_awaited()
        content = fake.messages_of_call(1)[-1]["content"][0]["content"]
        assert "unterminated string in arguments" in content
        assert "NOT executed" in content

    async def test_llm_api_error_returns_error_tuple(self):
        bot, fake = build([RuntimeError("boom")])
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("go"))
        assert is_error is True
        # Formatter-shaped since the 2026-08-14 sanitization (type name +
        # first line, bounded).
        assert text == "LLM API error: RuntimeError: boom"

    async def test_llm_error_text_and_trajectory_sanitized(self):
        """2026-08-14 incident pin: a provider exception carrying a whole
        HTML page must reach neither the chat reply nor the operator-visible
        trajectory final_response (the Traces page renders it)."""
        bot, fake = build([RuntimeError("<html><body>@everyone edge page</body></html>")])

        class _RecordingSaver:
            def __init__(self):
                self.saved = []

            async def save(self, trajectory):
                self.saved.append(trajectory)

        saver = _RecordingSaver()
        bot.turn_recorder._trajectory_saver = saver

        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("go"))
        assert is_error is True
        assert text == "LLM API error: RuntimeError"  # HTML detail dropped
        assert "@everyone" not in text
        assert saver.saved
        traj = saver.saved[-1]
        assert traj.is_error is True
        assert "<html" not in traj.final_response.lower()
        assert "@everyone" not in traj.final_response

    async def test_circuit_open_waits_and_retries(self):
        # Amended 2026-07-30: the single hardcoded breaker retry became the
        # shared deadline recovery — an open client breaker is waited
        # through, then retried; the recovered response is not an error.
        bot, fake = build(
            [
                CircuitOpenError("codex", 0.0),
                text_response("recovered"),
            ]
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("go"))
        assert is_error is False
        assert text == "recovered"
        assert len(fake.calls) == 2

    async def test_unclassified_error_after_breaker_retry_is_error(self):
        # Amended 2026-07-30: a breaker-open retry that then hits an
        # UNCLASSIFIED exception fast-fails through the shared recovery —
        # the old "(circuit breaker recovery failed)" wording is gone; the
        # plain terminal error shape is the contract now.
        bot, fake = build(
            [
                CircuitOpenError("codex", 0.0),
                RuntimeError("still down"),
            ]
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("go"))
        assert is_error is True
        assert text == "LLM API error: RuntimeError: still down"


# ---------------------------------------------------------------------------
# Response-guard cascade
# ---------------------------------------------------------------------------


GUARD_CASES = [
    ("fabrication", FABRICATION_TEXT, _FABRICATION_RETRY_MSG),
    ("promise", PROMISE_TEXT, _PROMISE_RETRY_MSG),
    ("tool_unavailable", UNAVAIL_TEXT, _TOOL_UNAVAIL_RETRY_MSG),
    ("hedging", HEDGING_TEXT, _HEDGING_RETRY_MSG),
    ("code_hedging", CODE_HEDGING_TEXT, _CODE_HEDGING_RETRY_MSG),
]


class TestGuardCascade:
    @pytest.mark.parametrize("name,trigger,retry_msg", GUARD_CASES, ids=[c[0] for c in GUARD_CASES])
    async def test_guard_fires_once_then_accepts(self, name, trigger, retry_msg):
        """Each pre-tool guard injects its retry message once, then the
        (still-triggering) second response is accepted as final."""
        bot, fake = build([text_response(trigger), text_response(trigger)])
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("do something"))
        assert len(fake.calls) == 2
        assert fake.messages_of_call(1)[-1] == retry_msg
        assert text == trigger
        assert is_error is False

    async def test_guards_do_not_fire_after_tools_used(self):
        """Pre-tool guards are gated on `not tools_used_in_loop`."""
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response(HEDGING_TEXT),
            ]
        )
        text, _, _, _, _ = await run_loop(bot, FakeMessage("go"))
        assert text == HEDGING_TEXT
        assert len(fake.calls) == 2

    async def test_cascade_order_fabrication_before_hedging(self):
        """A text triggering two guards gets the EARLIER guard's retry;
        cascading detection catches the second on the next iteration."""
        both = FABRICATION_TEXT + " " + HEDGING_TEXT
        bot, fake = build(
            [
                text_response(both),
                text_response(both),
                text_response(INNOCENT_TEXT),
            ]
        )
        text, _, _, _, _ = await run_loop(bot, FakeMessage("go"))
        assert fake.messages_of_call(1)[-1] == _FABRICATION_RETRY_MSG
        assert fake.messages_of_call(2)[-1] == _HEDGING_RETRY_MSG
        assert text == INNOCENT_TEXT

    async def test_premature_failure_fires_only_with_tools(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response(FAILURE_TEXT),
                text_response("Recovered: here is the real answer."),
            ]
        )
        text, _, _, _, _ = await run_loop(bot, FakeMessage("go"))
        assert fake.messages_of_call(2)[-1] == _FAILURE_RETRY_MSG
        assert text == "Recovered: here is the real answer."


# ---------------------------------------------------------------------------
# Completion classifier + continuations
# ---------------------------------------------------------------------------


class TestCompletionClassifier:
    async def test_incomplete_injects_continuation_with_reason(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response("partial answer"),
                text_response("full answer"),
            ],
            chat=["INCOMPLETE: deployment not performed", "COMPLETE"],
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("deploy it"))
        assert text == "full answer"
        assert is_error is False
        last = fake.messages_of_call(2)[-1]
        assert last["role"] == "developer"
        assert last["content"] == (
            "You are not done. deployment not performed. Continue with tool calls now."
        )
        # The rejected partial answer is NOT appended as an assistant message
        assert all(
            "partial answer" not in str(m.get("content", "")) for m in fake.messages_of_call(2)
        )

    async def test_classifier_not_called_without_tools(self):
        bot, fake = build([text_response(INNOCENT_TEXT)], chat=["INCOMPLETE: x"])
        await run_loop(bot, FakeMessage("hi"))
        assert fake.chat_calls == []

    async def test_continuation_budget_is_three(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                text_response("t1"),
                text_response("t2"),
                text_response("t3"),
                text_response("t4"),
            ],
            chat=["INCOMPLETE: a", "INCOMPLETE: b", "INCOMPLETE: c", "INCOMPLETE: d"],
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("go"))
        # The budget gates the classifier CALL itself: after 3 continuations
        # the 4th text turn is accepted without consulting the classifier —
        # only 3 chat calls happen, and the scripted 4th INCOMPLETE is unused.
        assert text == "t4"
        assert is_error is False
        assert len(fake.chat_calls) == 3

    async def test_start_loop_short_circuits_classifier(self):
        bot, fake = build([])
        is_complete, reason = await bot.completion_classifier.classify(
            "run 50 iterations", "started", ["start_loop"]
        )
        assert is_complete is True and reason == ""
        assert fake.chat_calls == []

    def test_parse_classifier_response_variants(self):
        from src.discord.completion import CompletionClassifier

        assert CompletionClassifier.parse_response("COMPLETE") == (True, "")
        ok, reason = CompletionClassifier.parse_response("INCOMPLETE: missing deploy")
        assert ok is False and reason == "missing deploy"
        ok, reason = CompletionClassifier.parse_response("INCOMPLETE - no artifact")
        assert ok is False and reason == "no artifact"
        assert CompletionClassifier.parse_response("¯\\_(ツ)_/¯") == (True, "")
        assert CompletionClassifier.parse_response("") == (True, "")


# ---------------------------------------------------------------------------
# Validation enforcement
# ---------------------------------------------------------------------------


class TestValidationEnforcement:
    async def test_mutation_injects_auto_validate_then_forces_continuation(self):
        bot, fake = build(
            [
                tool_call_response(("run_command", {"host": "h", "command": "restart svc"})),
                text_response("done early"),
                text_response("done again"),
                text_response("final after retries"),
            ]
        )
        bot.tool_executor.execute = AsyncMock(
            return_value=ToolResult(
                output="restarted",
                tool_name="run_command",
                requires_validation=True,
                validation_reason="service restarted",
            )
        )
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("restart it"))
        # After the mutating tool result: [AUTO-VALIDATE] developer message
        auto = fake.messages_of_call(1)[-1]
        assert auto["role"] == "developer"
        assert auto["content"].startswith("[AUTO-VALIDATE]")
        assert "service restarted" in auto["content"]
        # Model answered with text twice while validation was pending →
        # two [VALIDATION REQUIRED] continuations, then the cap (2) lets it through.
        req1 = fake.messages_of_call(2)[-1]
        req2 = fake.messages_of_call(3)[-1]
        assert "[VALIDATION REQUIRED]" in req1["content"]
        assert "[VALIDATION REQUIRED]" in req2["content"]
        assert text == "final after retries"
        assert is_error is False

    async def test_validate_action_call_clears_requirement(self):
        bot, fake = build(
            [
                tool_call_response(("run_command", {"host": "h", "command": "restart svc"})),
                tool_call_response(("validate_action", {"check": "systemctl status svc"})),
                text_response("validated and done"),
            ]
        )
        mutating = ToolResult(
            output="restarted",
            tool_name="run_command",
            requires_validation=True,
            validation_reason="service restarted",
        )
        ok_result = ToolResult(output="active (running)", tool_name="validate_action")
        bot.tool_executor.execute = AsyncMock(side_effect=[mutating, ok_result])
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("restart it"))
        assert text == "validated and done"
        assert is_error is False
        # No [VALIDATION REQUIRED] anywhere — the requirement was satisfied by the call
        for i in range(len(fake.calls)):
            for dev in fake.developer_messages_of_call(i):
                assert "[VALIDATION REQUIRED]" not in dev


# ---------------------------------------------------------------------------
# Stuck-loop tracking, cancellation, iteration cap
# ---------------------------------------------------------------------------


class TestLoopTermination:
    async def test_stuck_loop_warns_then_terminates(self):
        same = lambda: tool_call_response(("parse_time", {"text": "now"}))  # noqa: E731
        bot, fake = build([same(), same(), same(), same(), same(), same()])
        text, _, is_error, _, _ = await run_loop(bot, FakeMessage("loop forever"))
        assert is_error is True
        assert "stuck tool-call cycle" in text
        # The nudge was injected before termination
        nudge_seen = any(
            "repeating the same tool-call sequence" in dev
            for i in range(len(fake.calls))
            for dev in fake.developer_messages_of_call(i)
        )
        assert nudge_seen

    async def test_stop_during_llm_call_preempts_tool_execution(self):
        """Cancel set while the LLM call is in flight → the after_llm
        checkpoint returns BEFORE any tool runs (no tools note)."""
        bot = None  # placeholder for closure

        def cancel_then_tool():
            bot.channel_state.cancel_events["99"].set()
            return tool_call_response(("parse_time", {"text": "now"}))

        fake = FakeLLM([cancel_then_tool])
        bot = make_bot(fake_llm=fake)
        bot.tool_executor.execute = AsyncMock()
        msg = FakeMessage("go", channel=None)
        assert msg.channel.id == 99
        text, _, is_error, tools_used, _ = await run_loop(bot, msg)
        assert text == "Task stopped by user."
        assert is_error is False
        assert tools_used == []
        bot.tool_executor.execute.assert_not_awaited()
        # Active-request bookkeeping cleaned up
        assert "99" not in bot.channel_state.active_requests
        assert not bot.channel_state.cancel_events["99"].is_set()

    async def test_stop_preempts_inflight_effect_free_tool(self):
        started = asyncio.Event()
        cancelled = asyncio.Event()

        async def blocking_read(name, tool_input, user_id=None):
            started.set()
            try:
                await asyncio.sleep(3600)
            except asyncio.CancelledError:
                cancelled.set()
                raise

        fake = FakeLLM(
            [tool_call_response(("read_file", {"host": "h", "path": "/tmp/x"}))]
        )
        bot = make_bot(fake_llm=fake)
        bot.tool_executor.execute = blocking_read
        msg = FakeMessage("go")
        task = asyncio.create_task(run_loop(bot, msg))
        await asyncio.wait_for(started.wait(), timeout=1)
        bot.channel_state.cancel_events["99"].set()

        text, _, is_error, tools_used, _ = await asyncio.wait_for(task, timeout=1)
        assert cancelled.is_set()
        assert text.startswith("Task stopped by user.")
        assert is_error is False
        assert tools_used == ["read_file"]

    async def test_stop_kills_only_agents_linked_to_this_turn(self):
        fake = FakeLLM([tool_call_response(("read_file", {"host": "h", "path": "/x"}))])
        bot = make_bot(fake_llm=fake)
        msg = FakeMessage("go", id=987654)

        async def cancel_read(name, tool_input, user_id=None):
            bot.channel_state.cancel_events["99"].set()
            return ToolResult(output="done", tool_name=name)

        bot.tool_executor.execute = cancel_read
        # _stopped is synchronous; use a plain callable mock.
        bot.tool_loop._kill_agents_for_turn = MagicMock(return_value=["a1", "a2"])

        text, *_ = await run_loop(bot, msg)
        bot.tool_loop._kill_agents_for_turn.assert_called_once_with("987654")
        assert "Sent cancellation to 2 agent(s) spawned by this turn" in text

    async def test_completed_observation_wins_simultaneous_stop_race(self):
        started = asyncio.Event()
        release = asyncio.Event()

        async def completing_read(name, tool_input, user_id=None):
            started.set()
            await release.wait()
            return ToolResult(output="complete", tool_name=name)

        fake = FakeLLM(
            [tool_call_response(("read_file", {"host": "h", "path": "/tmp/x"}))]
        )
        bot = make_bot(fake_llm=fake)
        bot.tool_executor.execute = completing_read
        msg = FakeMessage("go")
        task = asyncio.create_task(run_loop(bot, msg))
        await asyncio.wait_for(started.wait(), timeout=1)
        release.set()
        bot.channel_state.cancel_events["99"].set()

        text, *_ = await asyncio.wait_for(task, timeout=1)
        assert text.startswith("Task stopped by user.")

    async def test_stop_does_not_preempt_inflight_effect_capable_tool(self):
        started = asyncio.Event()
        release = asyncio.Event()
        cancelled = asyncio.Event()

        async def blocking_command(name, tool_input, user_id=None):
            started.set()
            try:
                await release.wait()
            except asyncio.CancelledError:
                cancelled.set()
                raise
            return ToolResult(output="done", tool_name=name)

        fake = FakeLLM(
            [tool_call_response(("run_command", {"host": "h", "command": "x"}))]
        )
        bot = make_bot(fake_llm=fake)
        bot.tool_executor.execute = blocking_command
        msg = FakeMessage("go")
        task = asyncio.create_task(run_loop(bot, msg))
        await asyncio.wait_for(started.wait(), timeout=1)
        bot.channel_state.cancel_events["99"].set()
        await asyncio.sleep(0.05)

        assert not task.done()
        assert not cancelled.is_set()
        release.set()
        text, *_ = await asyncio.wait_for(task, timeout=1)
        assert text.startswith("Task stopped by user.")
        assert not cancelled.is_set()

    async def test_stop_during_tool_execution_reports_tools_used(self):
        """Cancel set while a tool executes → the after_tools checkpoint
        returns with the tools-used note."""
        bot = None  # placeholder for closure

        async def tool_sets_cancel(name, tool_input, user_id=None):
            bot.channel_state.cancel_events["99"].set()
            return ToolResult(output="partial work", tool_name=name)

        fake = FakeLLM([tool_call_response(("run_command", {"host": "h", "command": "x"}))])
        bot = make_bot(fake_llm=fake)
        bot.tool_executor.execute = tool_sets_cancel
        msg = FakeMessage("go", channel=None)
        text, _, is_error, tools_used, _ = await run_loop(bot, msg)
        assert text.startswith("Task stopped by user.")
        assert "run_command" in text  # tools note
        assert is_error is False
        assert tools_used == ["run_command"]
        assert "99" not in bot.channel_state.active_requests

    async def test_iteration_cap_exit_is_error(self):
        bot, fake = build(
            [
                tool_call_response(("parse_time", {"text": "now"})),
                tool_call_response(("parse_time", {"text": "later"})),
            ],
            tools={"max_tool_iterations_chat": 2},
        )
        text, _, is_error, tools_used, _ = await run_loop(bot, FakeMessage("go"))
        assert is_error is True
        assert "Hit the chat tool-iteration cap (2)" in text
        assert len(tools_used) == 2

    async def test_normal_exit_clears_active_request(self):
        bot, fake = build([text_response("done")])
        msg = FakeMessage("go")
        await run_loop(bot, msg)
        assert str(msg.channel.id) not in bot.channel_state.active_requests


# ---------------------------------------------------------------------------
# Tool filtering, skill handoff, skill CRUD, vision
# ---------------------------------------------------------------------------


class TestToolSurfaceAndSkills:
    async def test_api_token_allowed_tools_scope_filters(self):
        bot, fake = build([text_response("ok")])
        msg = FakeMessage("go")
        msg.allowed_tools = ["parse_time"]
        await run_loop(bot, msg)
        tool_names = [t["name"] for t in fake.calls[0]["tools"]]
        assert tool_names == ["parse_time"]

    async def test_skill_handoff_returns_handoff_flag(self):
        bot, fake = build([tool_call_response(("myskill", {"q": "x"}))])
        bot.skill_manager.has_skill = lambda name: name == "myskill"
        bot.skill_manager.should_handoff_to_codex = lambda name: True
        bot.skill_manager.execute = AsyncMock(return_value="skill output text")
        text, _, is_error, tools_used, handoff = await run_loop(bot, FakeMessage("use myskill"))
        assert handoff is True
        assert is_error is False
        assert "skill output text" in text
        assert tools_used == ["myskill"]

    async def test_skill_crud_rebuilds_system_prompt_mid_loop(self):
        bot, fake = build(
            [
                tool_call_response(("create_skill", {"name": "s1", "code": "# code"})),
                text_response("created"),
            ],
        )
        bot.skill_manager.create_skill = lambda name, code: f"Skill '{name}' created."
        bot.prompt_builder.cached_skills_text = "stale-skills-text"
        bot.tool_catalog.cached = [{"name": "stale"}]
        rebuild_calls = []
        orig_build = bot.prompt_builder.build_full_prompt

        def spy(*args, **kwargs):
            rebuild_calls.append(kwargs)
            return orig_build(*args, **kwargs)

        bot.prompt_builder.build_full_prompt = spy
        await run_loop(bot, FakeMessage("make a skill"))
        # CRUD invalidated both caches and rebuilt the prompt mid-loop
        assert rebuild_calls, "system prompt was not rebuilt after skill CRUD"
        assert bot.prompt_builder.cached_skills_text != "stale-skills-text"
        assert bot.tool_catalog.cached is None

    async def test_analyze_image_block_injected_for_next_iteration(self):
        bot, fake = build(
            [
                tool_call_response(("analyze_image", {"url": "https://x/img.png"})),
                text_response("described the image"),
            ]
        )
        block = {
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": "aGk="},
        }

        async def fake_analyze(message, tool_input):
            return {"__image_block__": block, "__prompt__": "describe it"}

        bot.media_tools._handle_analyze_image = fake_analyze
        text, _, _, _, _ = await run_loop(bot, FakeMessage("look at this"))
        assert text == "described the image"
        vision_msg = fake.messages_of_call(1)[-1]
        assert vision_msg["role"] == "user"
        parts = vision_msg["content"]
        assert parts[0] == block
        assert "analyze_image" in parts[-1]["text"]
        # The tool_result itself was replaced with the loaded-image marker
        result_content = fake.messages_of_call(1)[-2]["content"][0]["content"]
        assert "Image loaded" in result_content
