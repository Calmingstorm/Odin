"""Coverage for src/discord/scheduled_events.py (RFC-006 P10).

The scheduler's callback handlers (digest / monitor alert / reminder / check /
workflow / failure). Built with faked deps — executor, tool_loop, audit,
llm_gateway, agent_task_tools, channels — so nothing real is dispatched; we
assert on channel sends, audit calls, and ToolResult shaping.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.scheduled_events import ScheduledEventHandlers, ScheduledEventsDeps
from src.tools import ToolResult


def _channel():
    ch = MagicMock()
    ch.send = AsyncMock()
    return ch


def _cfg():
    return SimpleNamespace(
        tools=SimpleNamespace(hosts={"srv": {}}),
        monitoring=SimpleNamespace(alert_channel_id="123"),
        discord=SimpleNamespace(channels=["456"]),
    )


def _deps(**ov):
    ex = MagicMock()
    ex.execute = AsyncMock(return_value="cmd result")
    ex.check_permission = MagicMock(return_value="")
    d: dict[str, Any] = dict(
        get_config=lambda: _cfg(),
        get_channel=lambda cid: _channel(),
        get_guilds=lambda: [],
        tool_executor=ex,
        audit=MagicMock(log_execution=AsyncMock(), log_event=AsyncMock()),
        llm_gateway=SimpleNamespace(
            active_client=SimpleNamespace(chat=AsyncMock(return_value="LLM summary"))),
        tool_loop=MagicMock(dispatch_loop_tool_inner=AsyncMock(return_value="dispatched")),
        agent_task_tools=MagicMock(),
    )
    d.update(ov)
    return ScheduledEventsDeps(**d)


def _handlers(**ov):
    return ScheduledEventHandlers(_deps(**ov))


class TestDigest:
    async def test_no_channel_id(self):
        h = _handlers()
        with pytest.raises(RuntimeError, match="has no channel_id"):
            await h._on_scheduled_digest({"id": "S1"})

    async def test_channel_not_found(self):
        h = _handlers(get_channel=lambda cid: None)
        with pytest.raises(RuntimeError, match="channel 1 not found"):
            await h._on_scheduled_digest({"id": "S1", "channel_id": "1"})

    async def test_success_with_llm(self):
        ch = _channel()
        h = _handlers(get_channel=lambda cid: ch)
        await h._on_scheduled_digest({"id": "S1", "channel_id": "1"})
        assert ch.send.await_count >= 1
        sent = ch.send.await_args.args[0]
        assert "LLM summary" in sent

    async def test_no_active_client_uses_raw(self):
        ch = _channel()
        h = _handlers(get_channel=lambda cid: ch,
                      llm_gateway=SimpleNamespace(active_client=None))
        await h._on_scheduled_digest({"id": "S1", "channel_id": "1"})
        assert ch.send.await_count >= 1

    async def test_llm_exception_falls_back(self):
        ch = _channel()
        gw = SimpleNamespace(active_client=SimpleNamespace(
            chat=AsyncMock(side_effect=RuntimeError("llm down"))))
        h = _handlers(get_channel=lambda cid: ch, llm_gateway=gw)
        await h._on_scheduled_digest({"id": "S1", "channel_id": "1"})
        assert ch.send.await_count >= 1

    async def test_collect_failure(self):
        ch = _channel()
        ex = MagicMock()
        ex.execute = AsyncMock(side_effect=RuntimeError("boom"))
        # _format_digest_raw uses gather(return_exceptions=True) so it won't raise;
        # force the raw collection itself to raise by breaking get_config
        h = _handlers(get_channel=lambda cid: ch,
                      get_config=MagicMock(side_effect=RuntimeError("cfg gone")))
        with pytest.raises(RuntimeError, match="Digest data collection failed"):
            await h._on_scheduled_digest({"id": "S1", "channel_id": "1"})
        assert "Failed to collect data" in ch.send.await_args.args[0]

    async def test_collect_failure_and_notice_delivery_failure_propagate(self):
        ch = _channel()
        ch.send = AsyncMock(side_effect=RuntimeError("discord down"))
        h = _handlers(
            get_channel=lambda cid: ch,
            get_config=MagicMock(side_effect=RuntimeError("cfg gone")),
        )
        with pytest.raises(RuntimeError, match="failure notice delivery failed"):
            await h._on_scheduled_digest({"id": "S1", "channel_id": "1"})


class TestFormatDigestRaw:
    async def test_gather_with_exception(self):
        ex = MagicMock()
        ex.execute = AsyncMock(side_effect=[RuntimeError("disk err"), "mem ok"])
        h = _handlers(tool_executor=ex)
        out = await h._format_digest_raw()
        assert "ERROR" in out and "mem ok" in out


class TestResolveMentions:
    def test_replaces_known_member(self):
        member = SimpleNamespace(name="alice", nick=None, id=999)
        guild = SimpleNamespace(members=[member])
        h = _handlers(get_guilds=lambda: [guild])
        assert h._resolve_mentions("hey @alice") == "hey <@999>"
        # unknown name left unchanged
        assert h._resolve_mentions("hey @bob") == "hey @bob"


class TestExecuteScheduledTool:
    async def test_rbac_denial(self):
        ex = MagicMock()
        ex.check_permission = MagicMock(return_value="RBAC denied")
        h = _handlers(tool_executor=ex)
        r = await h._execute_scheduled_tool("run_command", {}, _channel(), "user1")
        assert r.ok is False and r.error == "permission_denied"

    async def test_dispatch_toolresult(self):
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(
            return_value=ToolResult(output="done", ok=True, tool_name="t")))
        h = _handlers(tool_loop=tl)
        r = await h._execute_scheduled_tool("t", {}, _channel(), None)
        assert r.ok and r.output == "done"

    async def test_dispatch_plain_result_wrapped(self):
        h = _handlers()  # dispatch returns "dispatched" (str) → wrapped ok=True
        r = await h._execute_scheduled_tool("t", {}, _channel(), None)
        assert r.ok and "dispatched" in r.output

    async def test_dispatch_exception(self):
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(side_effect=RuntimeError("boom")))
        h = _handlers(tool_loop=tl)
        r = await h._execute_scheduled_tool("t", {}, _channel(), None)
        assert r.ok is False and r.error == "execution_error"


class TestWorkflow:
    async def test_all_steps_ok(self):
        ch = _channel()
        h = _handlers()
        ok = await h._run_scheduled_workflow(ch, {"description": "wf", "steps": [
            {"tool_name": "t1"}, {"tool_name": "t2"}]})
        assert ok is True and ch.send.await_count == 1

    async def test_condition_skip(self):
        ch = _channel()
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(return_value="all healthy"))
        h = _handlers(tool_loop=tl)
        ok = await h._run_scheduled_workflow(ch, {"description": "wf", "steps": [
            {"tool_name": "t1"},
            {"tool_name": "t2", "condition": "error"},        # normal: skip (not present)
            {"tool_name": "t3", "condition": "!healthy"},     # negated: skip (present)
        ]})
        assert ok is True
        body = ch.send.await_args.args[0]
        assert "skipped" in body

    async def test_step_failure_aborts(self):
        ch = _channel()
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(
            return_value=ToolResult(output="fail", ok=False, tool_name="t")))
        h = _handlers(tool_loop=tl)
        ok = await h._run_scheduled_workflow(ch, {"description": "wf", "steps": [
            {"tool_name": "t1"}]})
        assert ok is False
        assert "aborted" in ch.send.await_args.args[0]

    async def test_step_failure_continue(self):
        ch = _channel()
        # step 1 fails (on_failure=continue → no abort), step 2 succeeds
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(side_effect=[
            ToolResult(output="fail", ok=False, tool_name="t"), "step2 ok"]))
        h = _handlers(tool_loop=tl)
        ok = await h._run_scheduled_workflow(ch, {"description": "wf", "steps": [
            {"tool_name": "t1", "on_failure": "continue"}, {"tool_name": "t2"}]})
        assert ok is True  # non-abort failure keeps going


    async def test_spawn_agent_auto_collect(self):
        ch = _channel()
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(
            return_value=ToolResult(output="Agent 'w' spawned (ID: `agent-1`)",
                                    ok=True, tool_name="spawn_agent")))
        att = MagicMock()
        att._collect_agent_result = AsyncMock(
            return_value=("agent finished the job", {"status": "completed",
                                                     "empty_result": False}))
        h = _handlers(tool_loop=tl, agent_task_tools=att)
        ok = await h._run_scheduled_workflow(ch, {"description": "wf", "steps": [
            {"tool_name": "spawn_agent", "tool_input": {"label": "w", "goal": "g"}}]})
        assert ok is True and "agent finished the job" in ch.send.await_args.args[0]
        att._collect_agent_result.assert_awaited_once()

    async def test_spawn_agent_empty_result(self):
        ch = _channel()
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(
            return_value=ToolResult(output="spawned (ID: `a1`)", ok=True,
                                    tool_name="spawn_agent")))
        att = MagicMock()
        att._collect_agent_result = AsyncMock(
            return_value=("", {"status": "completed", "empty_result": True}))
        h = _handlers(tool_loop=tl, agent_task_tools=att)
        ok = await h._run_scheduled_workflow(ch, {"description": "wf", "steps": [
            {"tool_name": "spawn_agent", "tool_input": {}}]})
        assert ok is True and "no output" in ch.send.await_args.args[0]

    async def test_workflow_collect_exception_aborts(self):
        ch = _channel()
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(
            return_value=ToolResult(output="spawned (ID: `a1`)", ok=True,
                                    tool_name="spawn_agent")))
        att = MagicMock()
        att._collect_agent_result = AsyncMock(side_effect=RuntimeError("collect boom"))
        h = _handlers(tool_loop=tl, agent_task_tools=att)
        ok = await h._run_scheduled_workflow(ch, {"description": "wf", "steps": [
            {"tool_name": "spawn_agent", "tool_input": {}}]})
        assert ok is False and "aborted" in ch.send.await_args.args[0]

    async def test_workflow_truncation(self):
        ch = _channel()
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(return_value="y" * 1600))
        h = _handlers(tool_loop=tl)
        # three ~1650-char steps → combined summary exceeds the 1900 cap → truncated
        ok = await h._run_scheduled_workflow(ch, {"description": "wf", "steps": [
            {"tool_name": "t1"}, {"tool_name": "t2"}, {"tool_name": "t3"}]})
        assert ok is True and "truncated" in ch.send.await_args.args[0]

    async def test_workflow_send_error_propagates(self):
        ch = _channel()
        ch.send = AsyncMock(side_effect=RuntimeError("post failed"))
        h = _handlers()
        with pytest.raises(RuntimeError, match="Failed to post workflow results"):
            await h._run_scheduled_workflow(
                ch, {"description": "wf", "steps": [{"tool_name": "t"}]}
            )


class TestScheduleFailureAndTask:
    async def test_schedule_failure_alert(self):
        ch = _channel()
        h = _handlers(get_channel=lambda cid: ch)
        await h._on_schedule_failure(
            {"id": "S1", "channel_id": "1", "description": "job", "last_error": "oops"}, 3)
        assert "consecutive failures" in ch.send.await_args.args[0]

    async def test_schedule_failure_no_channel(self):
        h = _handlers(get_channel=lambda cid: None)
        await h._on_schedule_failure({"id": "S1", "channel_id": None}, 5)  # warn, no raise

    async def test_schedule_failure_send_exception(self):
        ch = _channel()
        ch.send = AsyncMock(side_effect=RuntimeError("net"))
        h = _handlers(get_channel=lambda cid: ch)
        await h._on_schedule_failure(
            {"id": "S1", "channel_id": "1", "description": "j"}, 3)  # swallowed

    async def test_task_audit_exception_swallowed(self):
        ch = _channel()
        audit = MagicMock(log_event=AsyncMock(side_effect=RuntimeError("audit down")),
                          log_execution=AsyncMock())
        h = _handlers(get_channel=lambda cid: ch, audit=audit)
        # audit failure must not block the reminder
        await h._on_scheduled_task(
            {"id": "S1", "channel_id": "1", "action": "reminder",
             "message": "m", "description": "d"})
        assert ch.send.await_count == 1

    async def test_task_channel_not_found(self):
        h = _handlers(get_channel=lambda cid: None)
        with pytest.raises(RuntimeError, match="channel 1 not found"):
            await h._on_scheduled_task(
                {"id": "S1", "channel_id": "1", "action": "reminder"}
            )

    async def test_task_digest_dispatch(self):
        ch = _channel()
        h = _handlers(get_channel=lambda cid: ch)
        await h._on_scheduled_task({"id": "S1", "channel_id": "1", "action": "digest"})
        assert ch.send.await_count >= 1

    async def test_task_reminder_send_exception(self):
        ch = _channel()
        ch.send = AsyncMock(side_effect=RuntimeError("net"))
        h = _handlers(get_channel=lambda cid: ch)
        with pytest.raises(RuntimeError, match="Failed to send scheduled reminder"):
            await h._on_scheduled_task(
                {"id": "S1", "channel_id": "1", "action": "reminder",
                 "message": "m", "description": "d"}
            )

    async def test_task_check_fail_send_exception(self):
        # failing check tries to post the failure text; if that send raises it's
        # swallowed, then the RuntimeError still propagates
        ch = _channel()
        ch.send = AsyncMock(side_effect=RuntimeError("net"))
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(
            return_value=ToolResult(output="bad", ok=False, tool_name="t")))
        h = _handlers(get_channel=lambda cid: ch, tool_loop=tl)
        with pytest.raises(RuntimeError):
            await h._on_scheduled_task(
                {"id": "S1", "channel_id": "1", "action": "check",
                 "tool_name": "t", "description": "d"})

    async def test_task_check_success_send_exception(self):
        # a successful check whose result-post raises a NON-RuntimeError hits the
        # generic handler (RuntimeError is caught+re-raised earlier), which logs,
        # tries an error post, and re-raises.
        ch = _channel()
        ch.send = AsyncMock(side_effect=ValueError("net"))
        h = _handlers(get_channel=lambda cid: ch)  # dispatch returns "dispatched" (ok)
        with pytest.raises(ValueError):
            await h._on_scheduled_task(
                {"id": "S1", "channel_id": "1", "action": "check",
                 "tool_name": "t", "description": "d"})

    async def test_task_workflow_failure_raises(self):
        ch = _channel()
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(
            return_value=ToolResult(output="fail", ok=False, tool_name="t")))
        h = _handlers(get_channel=lambda cid: ch, tool_loop=tl)
        with pytest.raises(RuntimeError):
            await h._on_scheduled_task(
                {"id": "S1", "channel_id": "1", "action": "workflow", "description": "wf",
                 "steps": [{"tool_name": "t1"}]})

    async def test_task_no_channel_id(self):
        h = _handlers()
        with pytest.raises(RuntimeError, match="has no channel_id"):
            await h._on_scheduled_task({"id": "S1", "action": "reminder"})

    async def test_task_reminder(self):
        ch = _channel()
        h = _handlers(get_channel=lambda cid: ch)
        await h._on_scheduled_task(
            {"id": "S1", "channel_id": "1", "action": "reminder",
             "message": "standup", "description": "daily"})
        assert "standup" in ch.send.await_args.args[0]

    async def test_task_check_success_and_fail(self):
        ch = _channel()
        h = _handlers(get_channel=lambda cid: ch)
        await h._on_scheduled_task(
            {"id": "S1", "channel_id": "1", "action": "check",
             "tool_name": "t", "description": "d"})
        assert ch.send.await_count == 1
        # failing check raises RuntimeError
        tl = MagicMock(dispatch_loop_tool_inner=AsyncMock(
            return_value=ToolResult(output="bad", ok=False, tool_name="t")))
        h2 = _handlers(get_channel=lambda cid: ch, tool_loop=tl)
        with pytest.raises(RuntimeError):
            await h2._on_scheduled_task(
                {"id": "S1", "channel_id": "1", "action": "check",
                 "tool_name": "t", "description": "d"})

    async def test_task_workflow_and_unknown(self):
        ch = _channel()
        h = _handlers(get_channel=lambda cid: ch)
        await h._on_scheduled_task(
            {"id": "S1", "channel_id": "1", "action": "workflow", "description": "wf",
             "steps": [{"tool_name": "t1"}]})
        h2 = _handlers(get_channel=lambda cid: ch)
        with pytest.raises(RuntimeError, match="Unknown scheduled action"):
            await h2._on_scheduled_task(
                {"id": "S1", "channel_id": "1", "action": "mystery"}
            )
