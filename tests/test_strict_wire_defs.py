"""Focused tests for strict wire definitions and their runtime lowerings."""
from __future__ import annotations

import pytest

from src.tools.defs.integrations_email import TOOLS_SECTION as INTEGRATION_TOOLS
from src.tools.defs.media_scheduling import TOOLS_SECTION as SCHEDULING_TOOLS
from src.tools.http_probe_ops import build_http_probe_command
from src.tools.post_validation import parse_checks


def _schema(tools, name):
    return next(tool["input_schema"] for tool in tools if tool["name"] == name)


def test_http_probe_headers_are_name_value_records_and_legacy_dict_still_works():
    headers = _schema(INTEGRATION_TOOLS, "http_probe")["properties"]["headers"]
    assert headers["type"] == "array"
    assert headers["items"]["required"] == ["name", "value"]
    for shape in ([{"name": "X-Test", "value": "one"}], {"X-Test": "one"}):
        cmd = build_http_probe_command({"url": "https://example.com", "headers": shape})
        assert "X-Test: one" in cmd


@pytest.mark.parametrize("headers", [
    [{"name": "Accept", "value": "a"}, {"name": "accept", "value": "b"}],
    [{"name": "X", "value": "a", "extra": "no"}],
    [{"name": "X", "value": 1}],
])
def test_http_probe_wire_headers_reject_duplicates_and_bad_entries(headers):
    with pytest.raises(ValueError):
        build_http_probe_command({"url": "https://example.com", "headers": headers})


def test_schedule_triggers_share_closed_four_field_shape():
    for tool_name in ("schedule_task", "update_schedule"):
        trigger = _schema(SCHEDULING_TOOLS, tool_name)["properties"]["trigger"]
        assert trigger["additionalProperties"] is False
        assert set(trigger["properties"]) == {"source", "event", "repo", "alert_name"}
        assert trigger["properties"]["source"]["enum"] == ["gitea", "grafana", "generic", "github", "gitlab"]


def test_trigger_runtime_keeps_partial_conditions_and_rejects_empty():
    from src.scheduler.scheduler import Scheduler

    Scheduler._validate_trigger({"event": "push"})
    with pytest.raises(ValueError, match="at least one condition"):
        Scheduler._validate_trigger({})
    with pytest.raises(ValueError, match="Unknown trigger keys"):
        Scheduler._validate_trigger({"event": "push", "extra": "not allowed"})


def test_validate_action_expected_union_and_runtime_typed_values():
    expected = _schema(INTEGRATION_TOOLS, "validate_action")["properties"]["checks"]["items"]["properties"]["expected"]
    assert [x["type"] for x in expected["anyOf"]] == ["integer", "string", "array", "array"]
    checks, errors = parse_checks([{"type": "http", "target": "https://example.com", "expected": [200, 204]}])
    assert not errors and checks[0].expected == [200, 204]
    for raw in (
        {"type": "http", "target": "https://example.com", "expected": [200, "up"]},
        {"type": "service", "target": "sshd", "expected": [200]},
    ):
        checks, errors = parse_checks([raw])
        assert checks == [] and errors


def test_legacy_validation_expectations_keep_stringification_paths():
    checks, errors = parse_checks([{"type": "command", "target": "printf 12", "compare": "equals", "expected": 12}])
    assert not errors and checks[0].expected == 12
