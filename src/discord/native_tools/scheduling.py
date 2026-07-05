"""Scheduling-domain native tool handlers (RFC-001 Phase 5b).

Verbatim moves from OdinBot. The class exposes its dependencies under the
same attribute names the methods historically used on the bot, so bodies
are unchanged; the bot keeps one-line delegates for the dispatch table's
late-bound host resolution and the test patch seam.
"""

from __future__ import annotations

from ...odin_log import get_logger

log = get_logger("discord")


class SchedulingTools:
    def __init__(self, *, scheduler) -> None:
        self.scheduler = scheduler

    # -- creation-time validation ---------------------------------------------

    def _validate_schedule_payload(self, inp: dict) -> str | None:
        """Validate schedule_task input at creation time, not fire time.

        Catches the class of LLM mistake where a 'check' action is queued
        with no tool_input, or a 'workflow' step is missing tool_input —
        those errors used to surface only at fire time as a crashing
        coroutine, hours or days later. Returning a specific message
        at creation makes the LLM retry with a complete payload.
        """
        action = inp.get("action", "reminder")
        if action == "reminder":
            if not inp.get("message"):
                return "action=reminder requires a non-empty 'message'."
        elif action == "check":
            tool_name = inp.get("tool_name")
            if not tool_name:
                if inp.get("command"):
                    inp["tool_name"] = "run_command"
                    tool_name = "run_command"
                else:
                    return "action=check requires 'tool_name'."
            tool_input = inp.get("tool_input")
            if tool_input is None or (isinstance(tool_input, dict) and not tool_input):
                shortcut_cmd = inp.get("command")
                if shortcut_cmd and tool_name == "run_command":
                    tool_input = {"host": inp.get("host", "localhost"), "command": shortcut_cmd}
                    inp["tool_input"] = tool_input
                else:
                    tool_input = self._extract_tool_input_from_steps(inp)
                    if tool_input:
                        inp["tool_input"] = tool_input
                    else:
                        return (
                            f"action=check with tool_name='{tool_name}' requires 'tool_input' "
                            f"populated with the parameters that tool expects, OR use the "
                            f"'command' shortcut field directly "
                            f"(e.g. schedule_task(action='check', command='uname -r'))."
                        )
        elif action == "workflow":
            steps = inp.get("steps")
            if not steps or not isinstance(steps, list):
                return "action=workflow requires a non-empty 'steps' array."
            for i, step in enumerate(steps, 1):
                if not isinstance(step, dict):
                    return f"workflow step {i} must be an object."
                if not step.get("tool_name"):
                    return f"workflow step {i} is missing 'tool_name'."
                step_input = step.get("tool_input")
                if step.get("tool_name") in ("run_command", "run_script"):
                    if not isinstance(step_input, dict) or not step_input:
                        return (
                            f"workflow step {i} ({step['tool_name']}) requires a non-empty "
                            f"'tool_input' dict — for run_command include 'command', "
                            f"for run_script include 'script'."
                        )
        return None

    @staticmethod
    def _extract_tool_input_from_steps(inp: dict) -> dict | None:
        """Graceful fallback: gpt-5.4 consistently puts command params in
        steps[].tool_input but omits top-level tool_input for action=check.
        If steps has exactly one entry with a populated tool_input, use it."""
        steps = inp.get("steps")
        if not steps or not isinstance(steps, list):
            return None
        populated = [
            s
            for s in steps
            if isinstance(s, dict) and isinstance(s.get("tool_input"), dict) and s["tool_input"]
        ]
        if len(populated) == 1:
            return populated[0]["tool_input"]
        return None

    # -- handlers ----------------------------------------------------------------

    async def _handle_schedule_task(self, message, inp: dict) -> str:
        """Create a scheduled task."""
        validation_error = self._validate_schedule_payload(inp)
        if validation_error:
            return f"Failed to create schedule: {validation_error}"
        try:
            schedule = await self.scheduler.add(
                description=inp.get("description", "Unnamed task"),
                action=inp.get("action", "reminder"),
                channel_id=str(message.channel.id),
                cron=inp.get("cron"),
                run_at=inp.get("run_at"),
                message=inp.get("message"),
                tool_name=inp.get("tool_name"),
                tool_input=inp.get("tool_input"),
                steps=inp.get("steps"),
                trigger=inp.get("trigger"),
                cron_timezone=inp.get("cron_timezone"),
                requester_id=str(message.author.id),
            )
            if schedule.get("trigger"):
                trigger_desc = ", ".join(f"{k}={v}" for k, v in schedule["trigger"].items())
                return (
                    f"Scheduled webhook-triggered task (ID: {schedule['id']}): "
                    f"{schedule['description']}. Trigger: {trigger_desc}"
                )
            next_run = schedule.get("next_run", "unknown")
            stype = "recurring" if schedule.get("cron") else "one-time"
            return (
                f"Scheduled {stype} task (ID: {schedule['id']}): "
                f"{schedule['description']}. Next run: {next_run}"
            )
        except ValueError as e:
            return f"Failed to create schedule: {e}"
        except Exception as e:
            return f"Error creating schedule: {e}"

    def _handle_list_schedules(self) -> str:
        """List all scheduled tasks."""
        schedules = self.scheduler.list_all()
        if not schedules:
            return "No scheduled tasks."
        lines = []
        for s in schedules:
            if s.get("trigger"):
                trigger_desc = ", ".join(f"{k}={v}" for k, v in s["trigger"].items())
                stype = f"trigger: {trigger_desc}"
            elif s.get("cron"):
                stype = f"cron `{s['cron']}`"
            else:
                stype = "one-time"
            next_run = s.get("next_run", "on trigger" if s.get("trigger") else "N/A")
            last_run = s.get("last_run", "never")
            paused_tag = " **[PAUSED]**" if s.get("paused") else ""
            lines.append(
                f"- **{s['id']}**: {s['description']} ({stype}){paused_tag} "
                f"| next: {next_run} | last: {last_run}"
            )
        return f"**Scheduled tasks ({len(schedules)}):**\n" + "\n".join(lines)

    async def _handle_update_schedule(self, inp: dict) -> str:
        """Update an existing schedule."""
        schedule_id = inp.get("schedule_id", "")
        if not schedule_id:
            return "Error: 'schedule_id' is required."
        kwargs = {}
        for key in (
            "description",
            "cron",
            "run_at",
            "message",
            "tool_name",
            "tool_input",
            "steps",
            "channel_id",
            "cron_timezone",
        ):
            if key in inp:
                kwargs[key] = inp[key]
        trigger = inp.get("trigger")
        if trigger is not None:
            kwargs["trigger"] = trigger
        if "paused" in inp:
            val = inp["paused"]
            if not isinstance(val, bool):
                return "Error: 'paused' must be a boolean (true/false)."
            kwargs["paused"] = val
        if not kwargs:
            return "Error: no fields to update."
        try:
            result = await self.scheduler.update(schedule_id, **kwargs)
        except ValueError as e:
            return f"Error: {e}"
        if result is None:
            return f"Schedule {schedule_id} not found."
        return f"Updated schedule {schedule_id}."

    async def _handle_delete_schedule(self, inp: dict) -> str:
        """Delete a scheduled task."""
        schedule_id = inp.get("schedule_id", "")
        if await self.scheduler.delete(schedule_id):
            return f"Deleted schedule {schedule_id}."
        return f"Schedule {schedule_id} not found."

    def _handle_parse_time(self, inp: dict) -> str:
        """Parse a natural language time expression to ISO datetime."""
        expression = inp.get("expression", "")
        if not expression:
            return "Error: 'expression' is required (e.g. 'in 2 hours', 'tomorrow at 9am')"
        from ...tools.time_parser import parse_time

        try:
            result = parse_time(expression)
            return f"Parsed '{expression}' → {result}"
        except ValueError as e:
            return f"Error: {e}"
