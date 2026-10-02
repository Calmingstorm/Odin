"""Offline R4 matrix: independent canonical fixtures, real SSE and history paths.

Only the wire builder consults compiled schemas. Expected accepted dictionaries
are maintained by hand, never manufactured with the production normalizer.
No tool handlers, desktop input, endpoints or remote hosts are invoked.
"""

import json
from copy import deepcopy
from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.discord.tool_loop import build_assistant_content
from src.llm.openai_codex import CodexChatClient, _request_tool_adapter
from src.llm.strict_tool_adapter import compile_catalog
from src.llm.tool_history import assistant_content, normalize_tool_calls
from src.tools.defs.computer import computer_definitions
from src.tools.nested_payload import ValidatedNestedPayload
from src.tools.registry import get_tool_definitions

URL = "https://example.invalid/fixture"
OMITTED = {"__odin_omitted__": True}
TARGET = {"url": URL, "table_index": 0, "wait_seconds": 0}
STEP = {"tool_name": "browser_read_table", "tool_input": TARGET}

# New served tools must get reviewed fixtures before the catalog guard passes.
BUILTIN_INPUTS = {
    "run_command": {"command": "printf 'fixture'", "host": "localhost"},
    "run_script": {"script": "printf 'fixture'\nprintf 'second'", "interpreter": "bash"},
    "run_command_multi": {"hosts": ["localhost"], "command": "printf 'fixture'"},
    "read_file": {"host": "localhost", "path": "/tmp/fixture", "raw": False},
    "apply_patch": {"host": "localhost", "root": "/tmp", "patch_text": "fixture-only"},
    "purge_messages": {},
    "post_file": {"host": "localhost", "path": "/tmp/fixture", "caption": ""},
    "generate_file": {"filename": "fixture.txt", "content": ""},
    "schedule_task": {
        "description": "fixture", "action": "check",
        "tool_name": "browser_read_table", "tool_input": TARGET,
    },
    "list_schedules": {},
    "update_schedule": {"schedule_id": "fixture", "paused": False, "report_format": ""},
    "delete_schedule": {"schedule_id": "fixture"},
    "parse_time": {"expression": "in 1 hour"},
    "search_history": {"query": "fixture"},
    "memory_manage": {"action": "save", "key": "fixture", "value": "", "scope": "personal"},
    "search_audit": {"has_error": False, "min_duration_ms": 0},
    "create_skill": {"name": "fixture", "code": "fixture text only"},
    "edit_skill": {"name": "fixture", "code": "fixture text only"},
    "delete_skill": {"name": "fixture"},
    "list_skills": {},
    "enable_skill": {"name": "fixture"},
    "disable_skill": {"name": "fixture"},
    "install_skill": {"url": URL},
    "export_skill": {"name": "fixture"},
    "skill_status": {"name": "fixture"},
    "invoke_skill": {"name": "closed_ext", "input": {"text": "quoted \"雪\""}},
    "delegate_task": {"description": "fixture", "steps": [STEP]},
    "list_tasks": {},
    "cancel_task": {"task_id": "fixture"},
    "search_knowledge": {"query": "fixture"},
    "ingest_document": {"source": "fixture", "content": ""},
    "bulk_ingest_knowledge": {"items": [
        {"type": "file", "path": "/tmp/fixture"},
        {"type": "url", "url": URL, "source": ""},
    ]},
    "list_knowledge": {},
    "delete_knowledge": {"source": "fixture"},
    "browser_screenshot": {"url": URL, "full_page": False, "wait_seconds": 0},
    "browser_read_page": {"url": URL, "selector": "", "wait_seconds": 0},
    "browser_read_table": TARGET,
    "browser_click": {"url": URL, "selector": "#fixture"},
    "browser_fill": {"url": URL, "selector": "#fixture", "value": "", "submit": False},
    "browser_evaluate": {"url": URL, "expression": "document.title"},
    "web_search": {"query": "fixture"},
    "fetch_url": {"url": URL},
    "set_permission": {"user_id": "123", "tier": "guest"},
    "analyze_pdf": {"url": URL},
    "read_channel": {},
    "add_reaction": {"message_id": "123", "emoji": "fixture"},
    "create_poll": {"question": "fixture?", "options": ["one", "two"], "multiple": False},
    "manage_process": {"action": "poll", "pid": 123, "offset": 0, "wait_seconds": 0},
    "manage_list": {"action": "show", "list_name": "fixture", "items": []},
    "analyze_image": {"url": URL},
    "start_loop": {"goal": "fixture", "interval_seconds": 10},
    "stop_loop": {"loop_id": "fixture"},
    "list_loops": {},
    "spawn_agent": {"label": "fixture", "goal": "fixture", "model": "gpt-6.1-sol"},
    "send_to_agent": {"agent_id": "fixture", "message": "fixture"},
    "list_agents": {},
    "kill_agent": {"agent_id": "fixture"},
    "get_agent_results": {"agent_id": "fixture"},
    "wait_for_agents": {"agent_ids": ["fixture"]},
    "http_probe": {
        "url": URL, "headers": {"Accept": "application/json", "X-Fixture": ""},
        "verify_ssl": False, "retries": 0, "body": "",
    },
    "generate_image": {"prompt": "fixture"},
    "validate_action": {"grace_seconds": 0, "checks": [
        {"type": "http", "target": URL, "expected": [200, 204]},
        {"type": "command", "target": "fixture", "expected": "", "window_seconds": 0},
    ]},
    "email_send": {"to": ["fixture@example.invalid"], "subject": "fixture", "body": ""},
    "email_search": {"query": "fixture"},
    "email_read": {"uid": "fixture"},
    "email_list_recent": {},
    "get_tool_output": {"cursor": "fixture"},
}

EXTERNALS = [
    {"name": "closed_ext", "input_schema": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "text": {"type": "string"}, "flag": {"type": "boolean"},
            "count": {"type": "integer"}, "tags": {"type": "array", "items": {"type": "string"}},
            "nullable": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            "children": {"type": "array", "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "value": {"type": "string"},
                    "nullable": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
                },
                "required": ["value"],
            }},
        },
    }},
    {"name": "open_ext", "input_schema": {
        "type": "object", "properties": {"text": {"type": "string"}},
    }},
    {"name": "union_ext", "input_schema": {
        "type": "object", "additionalProperties": False,
        "properties": {"value": {"type": ["string", "null"]}}, "required": ["value"],
    }},
    # The explicit non-strict residual returns arguments unchanged.
    {"name": "exception_ext", "input_schema": {"type": "string"}},
]


def _wire_schema(adapter, name):
    return next(t["parameters"] for t in adapter.wire_tools if t["name"] == name)


def _populate_wire(schema, supplied):
    """Populate wire-only optionals recursively, retaining false/zero/empty."""
    if supplied is None or supplied == OMITTED:
        return deepcopy(supplied)
    if "anyOf" in schema:
        branches = schema["anyOf"]
        if isinstance(supplied, dict) and "operation" in supplied:
            schema = next(
                b for b in branches
                if b.get("properties", {}).get("operation", {}).get("const")
                == supplied["operation"]
            )
        else:
            kinds = [(dict, "object"), (list, "array"), (bool, "boolean"),
                     (int, "integer"), (float, "number"), (str, "string")]
            kind = next(label for cls, label in kinds if isinstance(supplied, cls))
            schema = next(
                b for b in branches
                if b.get("type") in (kind, "number" if kind == "integer" else kind) or "anyOf" in b
            )
        return _populate_wire(schema, supplied)
    if isinstance(supplied, dict) and "properties" in schema:
        return {
            k: _populate_wire(child, supplied[k]) if k in supplied else (
                deepcopy(OMITTED) if any(
                    "__odin_omitted__" in branch.get("properties", {})
                    for branch in child.get("anyOf", [])
                ) else None
            )
            for k, child in schema["properties"].items()
        }
    if isinstance(supplied, list) and "items" in schema:
        return [_populate_wire(schema["items"], item) for item in supplied]
    return deepcopy(supplied)


def _encoded_inputs(name, expected):
    supplied = deepcopy(expected)
    if name in {"schedule_task", "update_schedule"} and "tool_input" in supplied:
        supplied["tool_input"] = json.dumps(supplied["tool_input"], ensure_ascii=False, indent=1)
    if name == "invoke_skill" and "input" in supplied:
        supplied["input"] = json.dumps(supplied["input"], ensure_ascii=False, indent=1)
    if name in {"schedule_task", "update_schedule", "delegate_task"}:
        for step in supplied.get("steps", []):
            step["tool_input"] = json.dumps(step["tool_input"], ensure_ascii=False, indent=1)
    if name == "http_probe" and isinstance(supplied.get("headers"), dict):
        supplied["headers"] = [{"name": k, "value": v} for k, v in supplied["headers"].items()]
    return supplied


@dataclass(frozen=True)
class Case:
    label: str
    name: str
    supplied: dict
    expected: dict
    error: bool = False
    literal: str | None = None


def _case(label, name, expected, *, supplied=None, error=False, literal=None):
    return Case(label, name, _encoded_inputs(name, expected) if supplied is None else supplied,
                expected, error, literal)


COMMON = {
    "session_id": "s", "generation": 1, "consent_generation": 1,
    "source_id": "src", "source_revision": 1, "action_id": "a", "observation_id": "observed",
}
EXPECT = {"type": "visual_change"}
REGION = {"x": 0, "y": 0, "width": 10, "height": 10}
OPERATIONS = {
    "focus": {"x": 0, "y": 0, "expect": EXPECT},
    "click": {"x": 0, "y": 0, "count": 1, "modifiers": [], "expect": EXPECT},
    "double_click": {"region": REGION, "expect": EXPECT},
    "right_click": {"x": 0, "y": 1, "expect": EXPECT},
    "middle_click": {"region": REGION, "expect": EXPECT},
    "scroll": {
        "x": 0, "y": 0, "direction": "down", "count": 1, "modifiers": ["shift"], "expect": EXPECT,
    },
    "type": {"text": "quoted \"雪\"\nline", "expect": EXPECT},
    "key": {"key": "ctrl+shift+s", "expect": EXPECT},
    "drag": {
        "points": [[0, 0], [10, 10]], "duration": 0, "modifiers": ["shift"], "expect": EXPECT,
    },
    "polyline": {"points": [[0, 0], [10, 10], [20, 0]], "duration": 0.5, "expect": EXPECT},
    "replace_field": {
        "text": "", "target": "field",
        "expect": {"type": "field_text_equals", "target": "field", "text": ""},
    },
    "replace_field_pixels": {"text": "", "region": REGION, "expect": EXPECT},
    "sequence": {"steps": [
        {"action_id": "step", "operation": "click", "x": 0, "y": 0, "expect": EXPECT},
    ]},
    "strokes": {"strokes": [
        {"action_id": "one", "points": [[0, 0], [10, 10]], "duration": 0, "modifiers": []},
        {"action_id": "two", "points": [[20, 0], [30, 10]], "duration": 0.5,
         "modifiers": ["shift"]},
    ]},
}


def _cases():
    cases = [_case("builtin-" + name, name, expected) for name, expected in BUILTIN_INPUTS.items()]
    for operation, fields in OPERATIONS.items():
        expected = COMMON | {"operation": operation} | fields
        cases.append(_case("computer-" + operation, "computer_act", expected,
                           supplied={"payload": expected}))
    for operation in ("start", "inventory_targets", "status", "stop", "pause", "resume",
                      "reconcile", "cancel", "close", "export"):
        cases.append(_case("session-" + operation, "computer_session",
                           {"operation": operation, "session_id": "s", "generation": 1}))
    cases.append(_case("computer-observe", "computer_observe", {
        "session_id": "s", "generation": 1, "crop": REGION, "task_context": {"goal": "fixture"},
    }))
    for operation, fields in OPERATIONS.items():
        if operation in {"focus", "replace_field_pixels", "sequence", "strokes"}:
            continue
        expected = COMMON | {"operation": "sequence", "steps": [
            {"action_id": "step", "operation": operation} | fields,
        ]}
        cases.append(_case("sequence-" + operation, "computer_act", expected,
                           supplied={"payload": expected}))
    for name in ("schedule_task", "update_schedule", "delegate_task"):
        base = (
            {"schedule_id": "fixture"} if name == "update_schedule" else {"description": "fixture"}
        )
        if name == "schedule_task":
            base["action"] = "workflow"
        cases.append(_case(name + "-steps-json", name, base | {"steps": [
            STEP, STEP | {"condition": "", "on_failure": "continue"},
        ]}))
    cases.append(_case("update-direct-json", "update_schedule", {
        "schedule_id": "fixture", "tool_name": "browser_read_table", "tool_input": TARGET,
    }))
    cases.extend([
        _case("closed-false-zero-empty", "closed_ext",
              {"text": "", "flag": False, "count": 0, "tags": []}),
        _case("closed-explicit-null", "closed_ext", {"nullable": None}),
        _case("closed-sentinel-omission", "closed_ext", {}, supplied={"nullable": OMITTED}),
        _case("closed-recursive-null-sentinel", "closed_ext", {"children": [
            {"value": "", "nullable": None}, {"value": "second"},
        ]}, supplied={"children": [
            {"value": "", "nullable": None}, {"value": "second", "nullable": OMITTED},
        ], "nullable": OMITTED}),
        _case("open-envelope", "open_ext", {"text": "雪", "extra": {
            "null": None, "flag": False, "zero": 0, "empty": "", "list": [], "object": {},
        }}, supplied={"json": (
            '{\n "extra": {"null":null,"flag":false,"zero":0,'
            '"empty":"","list":[],"object":{}}, "text":"\\u96ea"\n}'
        )}),
        _case("union-envelope", "union_ext", {"value": None},
              supplied={"json": '{ "value" : null }'}),
        _case("exception-unchanged", "exception_ext", {
            "extra": None, "flag": False, "zero": 0, "empty": "", "list": [], "object": {},
        }, supplied={
            "extra": None, "flag": False, "zero": 0, "empty": "", "list": [], "object": {},
        }),
        _case("headers-empty", "http_probe", {"url": URL, "headers": {}},
              supplied={"url": URL, "headers": []}),
        _case("headers-duplicate-exact", "http_probe", {}, supplied={"url": URL, "headers": [
            {"name": "Accept", "value": "one"}, {"name": "Accept", "value": "two"},
        ]}, error=True),
        _case("headers-duplicate-case", "http_probe", {}, supplied={"url": URL, "headers": [
            {"name": "Accept", "value": "one"}, {"name": "aCcEpT", "value": "two"},
        ]}, error=True),
        _case("envelope-duplicate-key", "open_ext", {},
              supplied={"json": '{"text":"one","text":"two"}'}, error=True),
        _case("nested-duplicate-key", "invoke_skill", {}, supplied={
            "name": "closed_ext", "input": '{"text":"one","text":"two"}',
        }, error=True),
        _case("invalid-selected-target", "delegate_task", {}, supplied={
            "description": "fixture", "steps": [
                {"tool_name": "browser_read_table", "tool_input": '{"url":42}'},
            ],
        }, error=True),
        _case("malformed-json", "browser_read_table", {}, supplied={},
              literal='{ "url" : ', error=True),
    ])
    inner_wire = {"name": "closed_ext", "input": '{ "text" : "nested \\u96ea" }'}
    expected = {
        "description": "fixture", "action": "check", "tool_name": "invoke_skill",
        "tool_input": {"name": "closed_ext", "input": {"text": "nested 雪"}},
    }
    cases.append(_case("recursive-selected-target", "schedule_task", expected,
                       supplied=expected | {"tool_input": json.dumps(inner_wire)}))
    nested_probe = {"url": URL, "headers": {"X-Fixture": ""}, "verify_ssl": False}
    cases.append(_case("nested-target-header-map", "delegate_task", {
        "description": "fixture", "steps": [
            {"tool_name": "http_probe", "tool_input": nested_probe},
        ],
    }))
    # Every JSON-string location independently exercises empty objects, rejected
    # duplicate keys and non-object JSON. These are selected-target contracts,
    # not unrestricted blobs that happen to be syntactically valid JSON.
    locations = [
        ("schedule_task", False, {"description": "fixture", "action": "check"}),
        ("schedule_task", True, {"description": "fixture", "action": "workflow"}),
        ("update_schedule", False, {"schedule_id": "fixture"}),
        ("update_schedule", True, {"schedule_id": "fixture"}),
        ("delegate_task", True, {"description": "fixture"}),
        ("invoke_skill", False, {}),
    ]
    for name, in_steps, base in locations:
        label = name + ("-step" if in_steps else "-direct")
        for variant, raw, accepted, error in (
            ("empty-object", " { } ", {}, False),
            ("duplicates", '{"text":"one","text":"two"}', {}, True),
            ("array", "[]", {}, True),
            ("false-zero-empty", '{"text":"","flag":false,"count":0,"tags":[]}',
             {"text": "", "flag": False, "count": 0, "tags": []}, False),
        ):
            expected = deepcopy(base)
            supplied = deepcopy(base)
            if in_steps:
                expected["steps"] = [{"tool_name": "closed_ext", "tool_input": accepted}]
                supplied["steps"] = [{"tool_name": "closed_ext", "tool_input": raw}]
            elif name == "invoke_skill":
                expected.update(name="closed_ext", input=accepted)
                supplied.update(name="closed_ext", input=raw)
            else:
                expected.update(tool_name="closed_ext", tool_input=accepted)
                supplied.update(tool_name="closed_ext", tool_input=raw)
            cases.append(_case(label + "-" + variant, name, {} if error else expected,
                               supplied=supplied, error=error))
    # Outer JSON duplicates retain existing json.loads last-value behavior.
    # Exact replay is still the original text, not that accepted last-value map.
    cases.append(_case("outer-duplicate-key", "exception_ext", {"text": "second"},
                       literal='{ "text":"first", "text" : "second" }'))
    return cases


CASES = _cases()


@pytest.fixture(scope="module")
def adapter():
    return compile_catalog(get_tool_definitions() + computer_definitions() + EXTERNALS)


def _emitted(adapter, case):
    if case.literal is not None:
        return case.literal
    supplied = _populate_wire(_wire_schema(adapter, case.name), case.supplied)
    supplied = dict(reversed(list(supplied.items())))
    # Different ordering, whitespace, Unicode escapes and trailing newline.
    return json.dumps(supplied, ensure_ascii=True, indent=2) + "\n"


async def _stream(adapter, calls):
    events = []
    output = []
    for index, (name, emitted) in enumerate(calls):
        item = {
            "type": "function_call", "call_id": f"call-{index}",
            "name": name, "arguments": emitted,
        }
        output.append(item)
        events.append({"type": "response.output_item.added", "output_index": index,
                       "item": {k: item[k] for k in ("type", "call_id", "name")}})
        split = len(emitted) // 2
        for delta in (emitted[:split], emitted[split:]):
            events.append({"type": "response.function_call_arguments.delta",
                           "output_index": index, "delta": delta})
        events.append({"type": "response.function_call_arguments.done",
                       "output_index": index, "arguments": emitted})
        events.append({"type": "response.output_item.done", "output_index": index, "item": item})
    events.append({"type": "response.completed", "response": {"output": output}})

    async def lines():
        for event in events:
            yield ("data: " + json.dumps(event) + "\n").encode()

    client = CodexChatClient(auth=MagicMock(), model="fixture")
    token = _request_tool_adapter.set(adapter)
    try:
        response = await client._read_tool_stream(SimpleNamespace(content=lines()))
    finally:
        _request_tool_adapter.reset(token)
    return client, response


def _history(response, path):
    blocks = (
        build_assistant_content(response) if path == "chat"
        else assistant_content(response.text, normalize_tool_calls(response.tool_calls))
    )
    results = [
        {"type": "tool_result", "tool_use_id": call.id,
         "content": call.parse_error or "offline fixture, not executed",
         "is_error": bool(call.parse_error)}
        for call in response.tool_calls
    ]
    return [{"role": "assistant", "content": blocks}, {"role": "user", "content": results}]


def test_matrix_covers_real_served_catalog_and_computer_operations(adapter):
    assert set(BUILTIN_INPUTS) == {t["name"] for t in get_tool_definitions()}
    canonical = next(
        t["input_schema"] for t in computer_definitions() if t["name"] == "computer_act"
    )
    assert set(OPERATIONS) == {c["properties"]["operation"]["const"] for c in canonical["oneOf"]}
    assert {case.name for case in CASES} >= {t["name"] for t in computer_definitions()}
    sequence_schema = canonical["properties"]["steps"]["items"]
    assert {
        case.label.removeprefix("sequence-")
        for case in CASES if case.label.startswith("sequence-")
    } == {c["properties"]["operation"]["const"] for c in sequence_schema["oneOf"]}
    session = next(
        t["input_schema"] for t in computer_definitions() if t["name"] == "computer_session"
    )
    assert {
        case.expected["operation"] for case in CASES if case.name == "computer_session"
    } == set(session["properties"]["operation"]["enum"])
    assert {name: adapter.report[name]["mode"] for name in (
        "closed_ext", "open_ext", "union_ext", "exception_ext",
    )} == {
        "closed_ext": "external_compiled", "open_ext": "external_envelope",
        "union_ext": "external_envelope", "exception_ext": "external_exception",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["chat", "agent"])
@pytest.mark.parametrize("case", CASES, ids=lambda c: c.label)
async def test_emitted_replayed_matrix(adapter, case, path):
    emitted = _emitted(adapter, case)
    client, response = await _stream(adapter, [(case.name, emitted)])
    assert len(response.tool_calls) == 1
    call = response.tool_calls[0]
    assert call.id == "call-0"
    assert call.name == case.name
    assert call.input == case.expected
    assert bool(call.parse_error) == case.error
    if not case.error and case.name in {
        "schedule_task", "update_schedule", "delegate_task", "invoke_skill",
    }:
        assert isinstance(call.input, ValidatedNestedPayload)
    history = _history(response, path)
    replay = client._convert_messages_with_tools(deepcopy(history))
    assert replay == [
        {"type": "function_call", "call_id": "call-0", "name": case.name, "arguments": emitted},
        {"type": "function_call_output", "call_id": "call-0",
         "output": call.parse_error or "offline fixture, not executed"},
    ]
    assert client._convert_messages_with_tools(history) == replay
    assert history[0]["content"][0]["input"] == case.expected


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["chat", "agent"])
async def test_multi_call_order_and_duplicate_stream_events(adapter, path, monkeypatch):
    selected = [next(c for c in CASES if c.label == label) for label in (
        "builtin-http_probe", "recursive-selected-target", "computer-sequence",
        "headers-duplicate-case", "closed-recursive-null-sentinel",
    )]
    calls = [(c.name, _emitted(adapter, c)) for c in selected]
    original = adapter.accept
    accepted = []

    def accept_once(name, arguments):
        accepted.append(name)
        return original(name, arguments)

    monkeypatch.setattr(adapter, "accept", accept_once)
    client, response = await _stream(adapter, calls)
    assert accepted == [name for name, _ in calls]
    assert [c.input for c in response.tool_calls] == [case.expected for case in selected]
    assert [bool(c.parse_error) for c in response.tool_calls] == [case.error for case in selected]
    replay = client._convert_messages_with_tools(deepcopy(_history(response, path)))
    assert [
        (i["call_id"], i["name"], i["arguments"]) for i in replay if i["type"] == "function_call"
    ] == [(f"call-{index}", name, emitted) for index, (name, emitted) in enumerate(calls)]
    assert [i["call_id"] for i in replay if i["type"] == "function_call_output"] == [
        f"call-{index}" for index in range(len(calls))
    ]
    assert client._convert_messages_with_tools(_history(response, path)) == replay
    assert accepted == [name for name, _ in calls]
