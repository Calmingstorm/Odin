"""Coverage for src/discord/native_tools/scheduling.py (RFC-006 P5).

Exercises the creation-time payload validation (reminder / check / workflow) and
the schedule CRUD handlers on SchedulingTools with a faked scheduler. parse_time
is patched for determinism.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from src.discord.native_tools.scheduling import SchedulingTools


def _tools(scheduler=None):
    return SchedulingTools(scheduler=scheduler or MagicMock())


def _message():
    return SimpleNamespace(
        channel=SimpleNamespace(id=42), author=SimpleNamespace(id=7))


class TestValidatePayload:
    def test_reminder_requires_message(self):
        t = _tools()
        assert t._validate_schedule_payload({"action": "reminder"}) is not None
        assert t._validate_schedule_payload({"action": "reminder", "message": "hi"}) is None

    def test_check_tool_name_and_command_shortcut(self):
        t = _tools()
        assert "requires 'tool_name'" in t._validate_schedule_payload({"action": "check"})
        # command shortcut backfills tool_name + tool_input
        inp: dict[str, Any] = {"action": "check", "command": "uname -r"}
        assert t._validate_schedule_payload(inp) is None
        assert inp["tool_name"] == "run_command"
        assert inp["tool_input"]["command"] == "uname -r"

    def test_check_missing_tool_input(self):
        t = _tools()
        assert "requires 'tool_input'" in t._validate_schedule_payload(
            {"action": "check", "tool_name": "some_tool"})

    def test_check_tool_input_from_single_step(self):
        t = _tools()
        inp = {"action": "check", "tool_name": "run_command",
               "steps": [{"tool_input": {"command": "ls"}}]}
        assert t._validate_schedule_payload(inp) is None
        assert inp["tool_input"] == {"command": "ls"}

    def test_workflow_validation(self):
        t = _tools()
        assert "non-empty 'steps'" in t._validate_schedule_payload({"action": "workflow"})
        assert "must be an object" in t._validate_schedule_payload(
            {"action": "workflow", "steps": ["notadict"]})
        assert "missing 'tool_name'" in t._validate_schedule_payload(
            {"action": "workflow", "steps": [{}]})
        assert "non-empty" in t._validate_schedule_payload(
            {"action": "workflow", "steps": [{"tool_name": "run_command", "tool_input": {}}]})
        assert t._validate_schedule_payload(
            {"action": "workflow",
             "steps": [{"tool_name": "run_command", "tool_input": {"command": "ls"}}]}) is None

    def test_extract_from_steps_edge_cases(self):
        t = _tools()
        assert t._extract_tool_input_from_steps({"steps": None}) is None
        assert t._extract_tool_input_from_steps(  # two populated → ambiguous → None
            {"steps": [{"tool_input": {"a": 1}}, {"tool_input": {"b": 2}}]}) is None


class TestScheduleTask:
    async def test_validation_error(self):
        out = await _tools()._handle_schedule_task(_message(), {"action": "reminder"})
        assert "Failed to create schedule" in out

    async def test_success_variants(self):
        sched = MagicMock()
        sched.add = AsyncMock(return_value={
            "id": "S1", "description": "d", "trigger": {"webhook": "x"}})
        out = await _tools(sched)._handle_schedule_task(
            _message(), {"action": "reminder", "message": "m", "trigger": {"webhook": "x"}})
        assert "webhook-triggered" in out and "S1" in out

        sched.add = AsyncMock(return_value={
            "id": "S2", "description": "d", "cron": "* * * * *", "next_run": "soon"})
        out = await _tools(sched)._handle_schedule_task(
            _message(), {"action": "reminder", "message": "m"})
        assert "recurring" in out and "Next run: soon" in out

        sched.add = AsyncMock(return_value={"id": "S3", "description": "d"})
        out = await _tools(sched)._handle_schedule_task(
            _message(), {"action": "reminder", "message": "m"})
        assert "one-time" in out

    async def test_value_error_and_generic(self):
        sched = MagicMock()
        sched.add = AsyncMock(side_effect=ValueError("bad cron"))
        out = await _tools(sched)._handle_schedule_task(
            _message(), {"action": "reminder", "message": "m"})
        assert "Failed to create schedule: bad cron" in out
        sched.add = AsyncMock(side_effect=RuntimeError("boom"))
        out = await _tools(sched)._handle_schedule_task(
            _message(), {"action": "reminder", "message": "m"})
        assert "Error creating schedule" in out


class TestListSchedules:
    def test_empty(self):
        sched = MagicMock()
        sched.list_all.return_value = []
        assert "No scheduled tasks" in _tools(sched)._handle_list_schedules()

    def test_formats_all_types(self):
        sched = MagicMock()
        sched.list_all.return_value = [
            {"id": "A", "description": "trig", "trigger": {"webhook": "x"}},
            {"id": "B", "description": "cronjob", "cron": "* * * * *", "paused": True},
            {"id": "C", "description": "once"},
        ]
        out = _tools(sched)._handle_list_schedules()
        assert "3" in out and "trigger:" in out and "cron `* * * * *`" in out
        assert "[PAUSED]" in out and "one-time" in out


class TestUpdateSchedule:
    async def test_requires_id_and_fields(self):
        assert "'schedule_id' is required" in await _tools()._handle_update_schedule({})
        assert "no fields to update" in await _tools()._handle_update_schedule(
            {"schedule_id": "S1"})

    async def test_paused_must_be_bool(self):
        assert "must be a boolean" in await _tools()._handle_update_schedule(
            {"schedule_id": "S1", "paused": "yes"})

    async def test_value_error_not_found_and_success(self):
        sched = MagicMock()
        sched.update = AsyncMock(side_effect=ValueError("bad"))
        assert "Error: bad" in await _tools(sched)._handle_update_schedule(
            {"schedule_id": "S1", "description": "d"})
        sched.update = AsyncMock(return_value=None)
        assert "not found" in await _tools(sched)._handle_update_schedule(
            {"schedule_id": "S1", "paused": True})
        sched.update = AsyncMock(return_value={"id": "S1"})
        assert "Updated schedule S1" in await _tools(sched)._handle_update_schedule(
            {"schedule_id": "S1", "cron": "* * * * *", "trigger": {"webhook": "x"}})


class TestDeleteAndParse:
    async def test_delete(self):
        sched = MagicMock()
        sched.delete = AsyncMock(return_value=True)
        assert "Deleted schedule S1" in await _tools(sched)._handle_delete_schedule(
            {"schedule_id": "S1"})
        sched.delete = AsyncMock(return_value=False)
        assert "not found" in await _tools(sched)._handle_delete_schedule(
            {"schedule_id": "S1"})

    def test_parse_time(self):
        t = _tools()
        assert "'expression' is required" in t._handle_parse_time({})
        with patch("src.tools.time_parser.parse_time", return_value="2026-07-07T14:00"):
            assert "→ 2026-07-07T14:00" in t._handle_parse_time({"expression": "in 2 hours"})
        with patch("src.tools.time_parser.parse_time", side_effect=ValueError("nope")):
            assert "Error: nope" in t._handle_parse_time({"expression": "gibberish"})
