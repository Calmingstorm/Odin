import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.background_task import BackgroundTask, _execute_tool_captured, run_background_task
from src.llm.strict_tool_adapter import compile_catalog
from src.scheduler.scheduler import Scheduler
from src.tools.nested_payload import validate_nested_payload
from src.tools.registry import get_tool_definitions
from src.tools.result_validator import ToolResult
from tests.fakes import FakeChannel
from tests.test_scheduled_events import _handlers


class Executor:
    def __init__(self):
        self.calls = []
        self._tool_catalog = SimpleNamespace(merged_definitions=lambda: skill_catalog())

    def check_permission(self, tool_name, user_id):
        return None

    def _resolve_default_host(self, user_id):
        return "nonlocal"

    async def execute(self, tool_name, tool_input, user_id=None):
        self.calls.append((tool_name, tool_input))
        return ToolResult(output="", tool_name=tool_name)


class Skills:
    def __init__(self):
        self.calls = []

    def has_skill(self, name):
        return name == "needs_count"

    def get_tool_definitions(self):
        return skill_catalog()

    async def execute(self, name, payload, requester_id=None):
        self.calls.append((name, payload))
        return "done"


def skill_catalog():
    return [{"name": "needs_count", "input_schema": {
        "type": "object", "properties": {"count": {"type": "integer"}},
        "required": ["count"], "additionalProperties": False,
    }}]


@pytest.mark.parametrize("condition,expected", [("READY", False), ("!READY", True)])
async def test_delegated_empty_output_obeys_conditions(condition, expected):
    executor = Executor()
    task = BackgroundTask(task_id="test", description="conditions", requester="tester",
                          requester_id="123", channel=FakeChannel(id=555), steps=[
                              {"tool_name": "run_command", "tool_input": {"command": "inert"}},
                              {"tool_name": "run_command", "tool_input": {"command": "guarded"},
                               "condition": condition},
                          ])
    await run_background_task(task, executor, Skills())
    assert len(executor.calls) == (2 if expected else 1)
    assert task.results[1].status == ("ok" if expected else "skipped")


@pytest.mark.parametrize("condition,expected", [("READY", False), ("!READY", True)])
async def test_scheduled_empty_output_obeys_conditions(condition, expected):
    loop = MagicMock(dispatch_loop_tool_inner=AsyncMock(return_value=ToolResult(output="")))
    handler = _handlers(tool_loop=loop)
    assert await handler._run_scheduled_workflow(FakeChannel(id=555), {"steps": [
        {"tool_name": "run_command", "tool_input": {"command": "inert"}},
        {"tool_name": "run_command", "tool_input": {"command": "guarded"}, "condition": condition},
    ]})
    assert loop.dispatch_loop_tool_inner.await_count == (2 if expected else 1)


@pytest.mark.parametrize("output", [
    "Error: native rejected", "Permission denied: selected skill", "Unknown tool: removed",
])
async def test_native_error_becomes_failed_scheduled_result(output):
    loop = MagicMock(dispatch_loop_tool_inner=AsyncMock(return_value=output))
    handler = _handlers(tool_loop=loop)
    result = await handler._execute_scheduled_tool("invoke_skill", {}, FakeChannel(id=555), "123")
    assert not result.ok
    assert result.error == "tool_reported_failure"
    assert result.output == output


async def test_structured_scheduled_result_is_preserved():
    original = ToolResult(output="unknown settlement", ok=False, uncertain_outcome=True,
                          audit_metadata={"phase": "test"})
    loop = MagicMock(dispatch_loop_tool_inner=AsyncMock(return_value=original))
    result = await _handlers(tool_loop=loop)._execute_scheduled_tool(
        "invoke_skill", {}, FakeChannel(id=555), "123",
    )
    assert result is original


async def test_native_error_aborts_workflow_and_reaches_scheduler_retry_counter(tmp_path):
    channel = FakeChannel(id=555)
    loop = MagicMock(dispatch_loop_tool_inner=AsyncMock(return_value="Error: native failure"))
    handler = _handlers(tool_loop=loop, get_channel=lambda _: channel)
    scheduler = Scheduler(str(tmp_path / "schedules.json"))
    schedule = await scheduler.add(
        "failed workflow", "workflow", "555", run_at="2999-01-01T00:00:00Z",
        max_retries=2, steps=[
        {"tool_name": "invoke_skill", "tool_input": {"name": "test"}},
        {"tool_name": "run_command", "tool_input": {"command": "must not execute"}},
    ])
    scheduler._callback = handler._on_scheduled_task
    assert (await scheduler.run_now(schedule["id"]))["status"] == "failure"
    current = scheduler.list_all()[0]
    assert current["consecutive_failures"] == 1
    assert current["retry_count"] == 1
    assert current["retry_at"]
    assert (await scheduler.history.query())[0]["status"] == "failure"
    loop.dispatch_loop_tool_inner.assert_awaited_once()


@pytest.mark.parametrize("tool,payload", [("http_probe", {"url": "https://example.invalid"}),
                                        ("apply_patch", {"root": "/tmp", "patch_text": "inert"}),
                                        ("run_command", {"command": "inert"}),
                                        ("run_script", {"script": "inert"})])
async def test_background_preserves_executor_host_contract(tool, payload):
    executor = Executor()
    await _execute_tool_captured(
        tool, payload, executor, Skills(), None, None, "tester", requester_id="123",
    )
    assert executor.calls == [(tool, payload)]
    assert "host" not in payload


@pytest.mark.parametrize("tool,payload,expected_host", [
    ("http_probe", {"url": "https://example.invalid"}, None),
    ("apply_patch", {"root": "/tmp", "patch_text": "inert"}, None),
    ("run_command", {"command": "inert"}, "nonlocal"),
    ("run_script", {"script": "inert"}, "nonlocal"),
])
async def test_background_actual_executor_prepares_contract_defaults(tool, payload, expected_host):
    from src.tools.executor import ToolExecutor

    executor = ToolExecutor.__new__(ToolExecutor)
    executor._resolve_default_host = lambda _: "nonlocal"
    executor.check_permission = lambda *_: None
    executor._execute_inner = AsyncMock(return_value=ToolResult(output="inert"))
    # Instance handlers are a supported inert seam, avoiding real host leases.
    setattr(executor, "_handle_" + tool, AsyncMock())
    await _execute_tool_captured(
        tool, payload, executor, Skills(), None, None, "tester", requester_id="123",
    )
    prepared = executor._execute_inner.await_args.args[1]
    assert prepared.get("host") == expected_host
    if expected_host is None:
        assert "host" not in prepared


@pytest.mark.parametrize("wrapper", ["delegate_task", "schedule_task", "update_schedule"])
@pytest.mark.parametrize("payload", [{}, {"count": "wrong"}])
def test_nested_invoke_skill_validates_selected_schema(wrapper, payload):
    step = {"tool_name": "invoke_skill", "tool_input": {"name": "needs_count", "input": payload}}
    with pytest.raises(ValueError, match="invalid input"):
        validate_nested_payload(
            wrapper, {"steps": [step]}, skill_catalog(), allow_placeholders=False,
        )


def test_nested_skill_wire_json_decodes_without_mutating_original():
    args = {"steps": [{"tool_name": "invoke_skill", "tool_input": {
        "name": "needs_count", "input": '{"count":3}',
    }}]}
    result = validate_nested_payload("delegate_task", args, skill_catalog())
    assert result["steps"][0]["tool_input"]["input"] == {"count": 3}
    assert args["steps"][0]["tool_input"]["input"] == '{"count":3}'


def test_templated_selected_skill_name_defers_until_concrete_execution():
    args = {"steps": [{"tool_name": "invoke_skill", "tool_input": {
        "name": "{var.selected}", "input": {"count": 3},
    }}]}
    assert validate_nested_payload("delegate_task", args, skill_catalog()) == args
    with pytest.raises(ValueError, match="unknown tool"):
        validate_nested_payload("delegate_task", args, skill_catalog(), allow_placeholders=False)


@pytest.mark.parametrize("strict", [False, True])
async def test_delegated_invalid_selected_skill_never_executes(strict):
    executor, skills = Executor(), Skills()
    task = BackgroundTask(task_id="test", description="schema", requester="tester",
                          requester_id="123", channel=FakeChannel(id=555), steps=[
                              {"tool_name": "invoke_skill",
                               "tool_input": {"name": "needs_count", "input": {}}},
                          ])
    task.nested_payload_validated = strict
    await run_background_task(task, executor, skills)
    assert task.status == "failed"
    assert skills.calls == []


async def test_valid_selected_skill_executes_with_integer_input():
    skills = Skills()
    result = await _execute_tool_captured(
        "invoke_skill", {"name": "needs_count", "input": {"count": 3}},
        Executor(), skills, None, None, "tester", requester_id="123",
    )
    assert result == "done"
    assert skills.calls == [("needs_count", {"count": 3})]


async def test_scheduled_concrete_skill_schema_rechecked_before_dispatch():
    loop = MagicMock(dispatch_loop_tool_inner=AsyncMock())
    loop._tool_catalog.merged_definitions.return_value = skill_catalog()
    handler = _handlers(tool_loop=loop)
    assert not await handler._run_scheduled_workflow(FakeChannel(id=555), {
        "_nested_payload_validated": True, "steps": [{"tool_name": "invoke_skill",
        "tool_input": {"name": "needs_count", "input": {}}}],
    })
    loop.dispatch_loop_tool_inner.assert_not_awaited()


def test_update_workflow_strict_transport_preserves_condition_and_failure_policy():
    adapter = compile_catalog(get_tool_definitions())
    schema = next(
        tool["parameters"] for tool in adapter.wire_tools if tool["name"] == "update_schedule"
    )
    args = {key: None for key in schema["properties"]}
    steps_schema = next(
        branch for branch in schema["properties"]["steps"]["anyOf"] if branch.get("type") == "array"
    )
    step = {key: None for key in steps_schema["items"]["properties"]}
    step.update(tool_name="run_command", tool_input=json.dumps({"command": "inert"}),
                condition="READY", on_failure="continue")
    args.update(schedule_id="schedule", steps=[step])
    result = adapter.accept("update_schedule", args)
    assert result["steps"][0] == {"tool_name": "run_command", "tool_input": {"command": "inert"},
                                  "condition": "READY", "on_failure": "continue"}
