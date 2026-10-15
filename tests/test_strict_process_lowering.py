"""manage_process's per-action strict wire lowering.

As one flat strict object, a start's free-text ``command`` was followed by six
required nulls. A model done after the command could not close the call there,
and the next-best token landed in the command (a stray word or period, or a
whole extra command). Each action now has its own branch under ``payload`` that
ends on the field the action uses. In a live A/B with Odin's system prompt and
full catalog, the flat shape got stray tails in 14 of 60 gpt-6-astra (medium)
and 4 of 20 gpt-6.1-sol (xhigh) starts; the per-action shape in 0 of 60 and 0
of 20 (docs/strict-wire-lowerings.md).
"""
from __future__ import annotations

from copy import deepcopy

import pytest

from src.llm.strict_tool_adapter import (
    _PROCESS_ACTION_TAILS,
    RequestToolAdapter,
    _process_branches,
)
from src.tools.registry import TOOLS

CANONICAL = next(t for t in TOOLS if t["name"] == "manage_process")["input_schema"]
FIELDS = list(CANONICAL["properties"])


@pytest.fixture
def adapter():
    return RequestToolAdapter([t for t in TOOLS if t["name"] == "manage_process"])


def _wire(adapter):
    return adapter.wire_tools[0]


def _branches(adapter):
    return _wire(adapter)["parameters"]["properties"]["payload"]["anyOf"]


def _payload(action, **fields):
    """A wire payload for *action*: every other field null, in the branch's order."""
    branch = next(b for b in _process_branches(CANONICAL)
                  if b["properties"]["action"]["const"] == action)
    return {key: (action if key == "action" else fields.get(key)) for key in branch["properties"]}


def test_the_wire_is_a_strict_payload_union(adapter):
    wire = _wire(adapter)
    assert wire["strict"] is True
    assert wire["parameters"]["required"] == ["payload"]
    assert wire["parameters"]["additionalProperties"] is False
    assert [b["properties"]["action"]["const"] for b in _branches(adapter)] == (
        CANONICAL["properties"]["action"]["enum"]
    )


@pytest.mark.parametrize("action", CANONICAL["properties"]["action"]["enum"])
def test_each_action_ends_on_the_fields_it_uses(adapter, action):
    branch = next(b for b in _branches(adapter) if b["properties"]["action"]["const"] == action)
    order = list(branch["properties"])
    tail = list(_PROCESS_ACTION_TAILS[action])
    assert sorted(order) == sorted(FIELDS)  # every canonical field stays expressible
    assert order[0] == "action"
    assert order[len(order) - len(tail):] == tail
    assert branch["required"] == order
    assert branch["additionalProperties"] is False
    for key in order[1:]:
        described = any("description" in node for node in branch["properties"][key]["anyOf"])
        assert described == (key in tail), key
        if key in tail:
            assert branch["properties"][key]["anyOf"][0]["description"] == (
                CANONICAL["properties"][key]["description"]
            )


@pytest.mark.parametrize("expected", [
    {"action": "start", "host": "localhost", "command": "sleep 300"},
    {"action": "poll", "pid": 7, "wait_seconds": 5, "offset": 0},
    {"action": "poll", "pid": 7, "cursor": "generation:0", "limit": 4000},
    {"action": "write", "pid": 7, "input_text": "y\n"},
    {"action": "kill", "pid": 7},
    {"action": "list"},
], ids=["start", "poll-wait", "poll-cursor", "write", "kill", "list"])
def test_calls_accept_to_their_canonical_arguments(adapter, expected):
    assert adapter.accept("manage_process", {"payload": _payload(**expected)}) == expected


@pytest.mark.parametrize("action", CANONICAL["properties"]["action"]["enum"])
def test_every_field_is_still_accepted_for_every_action(adapter, action):
    full = {"host": "localhost", "command": "true", "pid": 7, "input_text": "x",
            "wait_seconds": 1, "cursor": "generation:0", "offset": 1, "limit": 4000}
    assert set(full) | {"action"} == set(FIELDS)
    assert adapter.accept("manage_process", {"payload": _payload(action, **full)}) == (
        {"action": action} | full
    )


@pytest.mark.parametrize("arguments", [
    {"action": "start", "host": "localhost", "command": "sleep 300"},  # the old flat shape
    {"payload": _payload("start", host="localhost", command="sleep 300") | {"extra": 1}},
    {"payload": _payload("start", host="localhost", command="sleep 300") | {"action": "pause"}},
    {"payload": {"action": "start", "host": "localhost", "command": "sleep 300"}},  # nulls missing
], ids=["flat", "extra-field", "unknown-action", "incomplete"])
def test_other_shapes_are_refused(adapter, arguments):
    with pytest.raises(ValueError):
        adapter.accept("manage_process", arguments)


def test_lowering_refuses_an_action_it_has_no_order_for():
    schema = deepcopy(CANONICAL)
    schema["properties"]["action"]["enum"].append("pause")
    with pytest.raises(ValueError, match="per-action lowering"):
        _process_branches(schema)
