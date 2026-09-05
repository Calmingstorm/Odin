"""Scheduler and digest callbacks (RFC-001 P10, RFC-002 P3).

The scheduled-task action router (reminder/check/workflow/digest),
workflow step execution with condition and on_failure semantics, the
structured-RBAC scheduled dispatch, the infrastructure digest, mention
resolution, and the monitor/failure alert callbacks. Narrow-deps since
RFC-002 P3: live roots (``config``, the guild list) come in as provider
callables; the LLM surface comes in as the gateway (which owns the
swappable provider clients); cross-component calls (loop dispatch, agent
collection) take the components directly — construction order in
``wiring.build_components`` guarantees they exist.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

import discord

from ..odin_log import get_logger
from ..scheduler.scheduler import NonRetryableScheduleError
from ..tools import ToolResult
from .mcp_dispatch import uncertain_outcome as mcp_uncertain_outcome
from .response_guards import scrub_response_secrets
from .tool_loop import _LoopMessageProxy

if TYPE_CHECKING:
    from ..audit.logger import AuditLogger
    from ..tools.executor import ToolExecutor
    from ..tools.hosts import HostRegistry
    from .llm_gateway import LLMGateway
    from .native_tools.agents_tasks import AgentTaskTools
    from .scheduled_report import ScheduledReportPaginationService
    from .tool_loop import ToolLoopRunner

log = get_logger("discord")


@dataclass(frozen=True)
class ScheduledEventsDeps:
    """The true dependency surface of the scheduled-events handlers."""

    get_config: Callable  # live root — replaced by config hot-reload
    get_channel: Callable  # discord.Client.get_channel (bound method)
    get_guilds: Callable  # live — the guild list changes at runtime
    tool_executor: ToolExecutor
    audit: AuditLogger
    llm_gateway: LLMGateway  # owns the swappable provider clients
    tool_loop: ToolLoopRunner  # shared dispatch path
    agent_task_tools: AgentTaskTools  # agent result collection in workflows
    scheduled_reports: ScheduledReportPaginationService | None = None
    host_registry: HostRegistry | None = None


class ScheduledEventHandlers:
    def __init__(self, deps: ScheduledEventsDeps) -> None:
        self._get_config = deps.get_config
        self._get_channel = deps.get_channel
        self._get_guilds = deps.get_guilds
        self._tool_executor = deps.tool_executor
        self._host_registry = deps.host_registry
        self._audit = deps.audit
        self._llm_gateway = deps.llm_gateway
        self._tool_loop = deps.tool_loop
        self._agent_task_tools = deps.agent_task_tools
        self._scheduled_reports = deps.scheduled_reports

    async def _on_scheduled_digest(self, schedule: dict) -> None:
        """Run the daily infrastructure digest and post results."""
        channel_id = schedule.get("channel_id")
        if not channel_id:
            raise RuntimeError(f"Digest {schedule['id']} has no channel_id")

        channel = self._get_channel(int(channel_id))
        if not channel:
            raise RuntimeError(f"Digest channel {channel_id} not found")

        log.info("Running daily digest for channel %s", channel_id)
        try:
            raw = await self._format_digest_raw()
        except Exception as e:
            log.error("Digest data collection failed: %s", e)
            try:
                await channel.send(
                    scrub_response_secrets(
                        f"**Daily Infrastructure Digest**\n\nFailed to collect data: {e}"
                    )
                )
            except Exception as send_error:
                raise RuntimeError(
                    f"Digest data collection failed ({e}); failure notice delivery failed: "
                    f"{send_error}"
                ) from send_error
            raise RuntimeError(f"Digest data collection failed: {e}") from e

        # Summarize the digest — prefer Codex (free), fall back to raw truncation
        digest_messages = [
            {
                "role": "user",
                "content": f"Summarize this infrastructure status report concisely. Highlight any issues, warnings, or anomalies. If everything looks healthy, say so briefly.\n\n{raw}",  # noqa: E501
            }
        ]
        digest_system = "You are a concise infrastructure report summarizer. Output a short summary with key findings."  # noqa: E501
        try:
            if self._llm_gateway.active_client:
                summary = await self._llm_gateway.active_client.chat(
                    messages=digest_messages,
                    system=digest_system,
                    max_tokens=500,
                )
            else:
                log.warning("No Codex client for digest summary, using raw")
                summary = raw[:3000]
        except Exception as e:
            log.warning("Digest summary failed, using raw: %s", e)
            summary = raw[:3000]

        await channel.send(scrub_response_secrets(f"**Daily Infrastructure Digest**\n\n{summary}"))

        # Audit log the digest
        await self._audit.log_execution(
            user_id="system",
            user_name="scheduler",
            channel_id=channel_id,
            tool_name="digest",
            tool_input={"schedule_id": schedule.get("id")},
            approved=True,
            result_summary=summary,
            execution_time_ms=0,
        )

    async def _format_digest_raw(self) -> str:
        """Collect raw infrastructure data for the digest."""
        tasks = []
        labels = []

        # Disk + memory checks on all hosts via run_command
        aliases = (
            self._host_registry.active_aliases()
            if self._host_registry is not None
            else self._get_config().tools.hosts
        )
        for host_alias in aliases:
            tasks.append(
                self._tool_executor.execute(
                    "run_command",
                    {
                        "host": host_alias,
                        "command": "df -h --exclude-type=tmpfs --exclude-type=devtmpfs",
                    },
                )
            )
            labels.append(f"Disk ({host_alias})")
            tasks.append(
                self._tool_executor.execute(
                    "run_command",
                    {"host": host_alias, "command": "free -h"},
                )
            )
            labels.append(f"Memory ({host_alias})")

        results = await asyncio.gather(*tasks, return_exceptions=True)

        sections = []
        for label, result in zip(labels, results):
            if isinstance(result, Exception):
                sections.append(f"### {label}\nERROR: {result}")
            else:
                sections.append(f"### {label}\n{str(result)[:800]}")

        return "\n\n".join(sections)

    def _resolve_mentions(self, text: str) -> str:
        """Replace @username with proper Discord <@ID> mentions."""

        def _replace(match: re.Match) -> str:
            name = match.group(1).lower()
            for guild in self._get_guilds():
                for member in guild.members:
                    if member.name.lower() == name or (member.nick and member.nick.lower() == name):
                        return f"<@{member.id}>"
            return match.group(0)  # leave unchanged if not found

        return re.sub(r"@(\w+)", _replace, text)

    async def _execute_scheduled_tool(
        self,
        tool_name: str,
        tool_input: dict,
        channel: discord.abc.Messageable,
        requester_id: str | None,
        requester_name: str = "scheduler",
    ) -> ToolResult:
        """Unified dispatch for scheduled task tool execution.

        Routes through the same client-level dispatch as live messages and
        autonomous loops, so scheduled tasks have full tool parity.
        """
        # Pre-check RBAC so we can return a structured failure — the dispatch
        # also checks, but returns a plain denial string we'd have to guess at.
        # Empty creators are the existing administrative system schedules.
        # Make their authority explicit here, never via a falsy RBAC bypass.
        # The management API that creates these schedules is admin-only.
        from ..permissions.manager import PermissionManager

        system_scope = PermissionManager.set_request_tier("admin") if not requester_id else None
        execution_id = requester_id or "scheduler"
        msg_proxy = _LoopMessageProxy(channel, execution_id, requester_name)
        try:
            denial = self._tool_executor.check_permission(tool_name, execution_id)
            if isinstance(denial, str) and denial:
                return ToolResult(
                    output=denial, ok=False, error="permission_denied", tool_name=tool_name
                )
            result = await self._tool_loop.dispatch_loop_tool_inner(
                tool_name,
                tool_input,
                msg_proxy,
                execution_id,
            )
            if isinstance(result, ToolResult) and result.audit_metadata:
                try:
                    await self._audit.log_event(
                        event_type="scheduled_tool",
                        action=tool_name,
                        actor=requester_id or "scheduler",
                        channel_id=str(getattr(channel, "id", "")),
                        metadata=dict(result.audit_metadata),
                    )
                except Exception:
                    log.warning("Failed to audit scheduled MCP tool %s", tool_name)
        except Exception as e:
            return ToolResult(
                output=f"Error executing {tool_name}: {e}",
                ok=False,
                error="execution_error",
                tool_name=tool_name,
            )
        finally:
            if system_scope is not None:
                PermissionManager.reset_request_tier(system_scope)

        if isinstance(result, ToolResult):
            return result
        return ToolResult(output=str(result), ok=True, tool_name=tool_name)

    async def _run_scheduled_workflow(
        self,
        channel: discord.abc.Messageable,
        schedule: dict,
    ) -> bool:
        """Execute a multi-step workflow from a scheduled task.

        Returns True if all steps succeeded, False if any step failed.
        """
        steps = schedule.get("steps", [])
        desc = schedule.get("description", "Workflow")
        results: list[str] = []
        prev_output = ""
        workflow_ok = True
        # Scheduled work runs under the identity of whoever created the schedule, so
        # host-access scoping / tier limits apply (None = unrestricted system task).
        req_id = schedule.get("requester_id") or None

        for i, step in enumerate(steps):
            tool_name = step["tool_name"]
            tool_input = step.get("tool_input", {})
            condition = step.get("condition")
            step_desc = step.get("description", tool_name)

            # Evaluate condition against previous step's output
            if condition and prev_output:
                if condition.startswith("!"):
                    # Negated condition: skip if substring IS present
                    if condition[1:].lower() in prev_output.lower():
                        results.append(
                            f"**Step {i + 1}** (`{step_desc}`): skipped (condition `{condition}` met)"  # noqa: E501
                        )
                        continue
                else:
                    # Normal condition: skip if substring is NOT present
                    if condition.lower() not in prev_output.lower():
                        results.append(
                            f"**Step {i + 1}** (`{step_desc}`): skipped (condition `{condition}` not met)"  # noqa: E501
                        )
                        continue

            try:
                req_name = schedule.get("requester") or schedule.get("created_by") or "scheduler"
                # Signal to spawn_agent handler that this is a scheduled context
                if tool_name == "spawn_agent":
                    tool_input = {**tool_input, "_scheduled": True}

                result = await self._execute_scheduled_tool(
                    tool_name,
                    tool_input,
                    channel,
                    req_id,
                    req_name,
                )

                # Auto-collect agent results for spawn_agent steps in scheduled workflows.
                # Extract agent_id from spawn confirmation and wait for completion so the
                # workflow reports what the agent did, not just that it was spawned.
                render_markdown = False
                if tool_name == "spawn_agent" and isinstance(result, ToolResult) and result.ok:
                    result_str = str(result)
                    id_match = re.search(r"\(ID:\s*`([^`]+)`\)", result_str)
                    if id_match:
                        agent_id = id_match.group(1)
                        # No explicit step timeout → the collector resolves the
                        # agent's snapshotted lifetime + 60s; an explicit value
                        # is honored as-is (the lifetime deadline guarantees
                        # the underlying wait terminates either way).
                        step_timeout = step.get("timeout")
                        agent_text, agent_data = await self._agent_task_tools._collect_agent_result(
                            agent_id,
                            timeout=float(step_timeout) if step_timeout is not None else None,
                        )
                        agent_ok = agent_data["status"] == "completed"
                        result = ToolResult(output=agent_text, ok=agent_ok, tool_name="spawn_agent")
                        if agent_ok and agent_data["empty_result"]:
                            result = ToolResult(
                                output=agent_text + "\n\n⚠️ Agent completed but produced no output.",  # noqa: E501
                                ok=True,
                                tool_name="spawn_agent",
                            )
                        render_markdown = True

                prev_output = str(result)

                if isinstance(result, ToolResult) and (
                    mcp_uncertain_outcome(result) or result.uncertain_outcome
                ):
                    raise NonRetryableScheduleError(
                        f"Scheduled MCP step {tool_name} has an unknown outcome; "
                        "manual resolution is required"
                    )

                if isinstance(result, ToolResult) and not result.ok:
                    results.append(
                        f"**Step {i + 1}** (`{step_desc}`): FAILED\n```\n{str(result)[:1600]}\n```"
                    )
                    on_failure = step.get("on_failure", "abort")
                    if on_failure == "abort":
                        workflow_ok = False
                        results.append("Workflow aborted due to step failure.")
                        break
                elif render_markdown:
                    results.append(f"**Step {i + 1}** (`{step_desc}`): OK\n\n{str(result)[:1600]}")
                else:
                    results.append(
                        f"**Step {i + 1}** (`{step_desc}`): OK\n```\n{str(result)[:1600]}\n```"
                    )
            except NonRetryableScheduleError:
                raise
            except Exception as e:
                results.append(f"**Step {i + 1}** (`{step_desc}`): FAILED — {e}")
                on_failure = step.get("on_failure", "abort")
                if on_failure == "abort":
                    workflow_ok = False
                    results.append("Workflow aborted due to step failure.")
                    break

        summary = "\n".join(results)
        text = f"**Workflow: {desc}**\n{summary}"
        if len(text) > 1900:
            text = text[:1900] + "\n... (truncated)"

        try:
            await channel.send(scrub_response_secrets(text))
        except Exception as e:
            raise RuntimeError(f"Failed to post workflow results: {e}") from e

        return workflow_ok

    async def _on_schedule_failure(self, schedule: dict, consecutive: int) -> None:
        """Alert callback fired when a schedule crosses the consecutive-failure
        threshold. Previously never wired, so the alerting path was dead."""
        channel_id = schedule.get("channel_id")
        last_error = schedule.get("last_error", "unknown error")
        text = (
            f"⚠️ **Scheduled task failing:** {schedule.get('description', schedule.get('id', '?'))}\n"  # noqa: E501
            f"{consecutive} consecutive failures. Last error:\n"
            f"```\n{str(last_error)[:1000]}\n```"
        )
        try:
            channel = self._get_channel(int(channel_id)) if channel_id else None
            if channel:
                await channel.send(scrub_response_secrets(text))
            else:
                log.warning(
                    "Schedule %s failed %d times but channel %s is unavailable for alert",
                    schedule.get("id"),
                    consecutive,
                    channel_id,
                )
        except Exception as e:
            log.warning("Failed to send schedule failure alert for %s: %s", schedule.get("id"), e)

    async def _on_scheduled_task(self, schedule: dict) -> None:
        """Callback fired by the scheduler when a task is due."""
        try:
            await self._audit.log_event(
                event_type="schedule_execution",
                action=schedule.get("action", "unknown"),
                actor="scheduler",
                detail=f"Schedule {schedule.get('id', '?')}: {schedule.get('description', '')[:100]}",  # noqa: E501
                channel_id=schedule.get("channel_id", ""),
                metadata={"schedule_id": schedule.get("id"), "action": schedule.get("action")},
            )
        except Exception:
            pass
        channel_id = schedule.get("channel_id")
        if not channel_id:
            raise RuntimeError(f"Scheduled task {schedule['id']} has no channel_id")

        channel = self._get_channel(int(channel_id))
        if not channel:
            raise RuntimeError(f"Scheduled task channel {channel_id} not found")

        if schedule["action"] == "digest":
            await self._on_scheduled_digest(schedule)
            return

        if schedule["action"] == "reminder":
            msg = schedule.get("message", schedule["description"])
            # Resolve @username mentions to proper Discord <@ID> mentions
            msg = self._resolve_mentions(msg)
            try:
                await channel.send(f"**Scheduled reminder:** {msg}")
            except Exception as e:
                raise RuntimeError(f"Failed to send scheduled reminder: {e}") from e

        elif schedule["action"] == "check":
            tool_name = schedule.get("tool_name")
            tool_input = schedule.get("tool_input", {})
            req_id = schedule.get("requester_id") or None
            req_name = schedule.get("requester") or schedule.get("created_by") or "scheduler"
            try:
                result = await self._execute_scheduled_tool(
                    tool_name,  # type: ignore[arg-type]  # creation-time validation guarantees tool_name
                    tool_input,
                    channel,
                    req_id,
                    req_name,
                )
                if isinstance(result, ToolResult) and (
                    mcp_uncertain_outcome(result) or result.uncertain_outcome
                ):
                    text = f"**Scheduled check outcome unknown:** {schedule['description']}\n```\n{str(result)[:1800]}\n```"  # noqa: E501
                    try:
                        await channel.send(scrub_response_secrets(text))
                    except Exception:
                        pass
                    raise NonRetryableScheduleError(
                        "Scheduled check has an unknown outcome; manual resolution is required"
                    )
                if isinstance(result, ToolResult) and not result.ok:
                    text = f"**Scheduled check failed:** {schedule['description']}\n```\n{str(result)[:1800]}\n```"  # noqa: E501
                    try:
                        await channel.send(scrub_response_secrets(text))
                    except Exception:
                        pass
                    raise RuntimeError(f"Scheduled check failed: {str(result)[:200]}")
                else:
                    report_format = schedule.get("report_format")
                    if report_format:
                        if self._scheduled_reports is None:
                            raise RuntimeError("Scheduled report service is unavailable")
                        try:
                            # The pagination service parses JSON first and scrubs
                            # only validated strings that can reach Discord.
                            await self._scheduled_reports.post(channel, report_format, str(result))
                        except Exception as e:
                            text = (
                                f"**Scheduled report failed:** {schedule['description']}\n"
                                f"Error: {e}"
                            )
                            try:
                                await channel.send(scrub_response_secrets(text))
                            except Exception:
                                pass
                            raise RuntimeError(
                                f"Failed to render scheduled report {report_format}: {e}"
                            ) from e
                    else:
                        text = (
                            f"**Scheduled: {schedule['description']}**\n```\n"
                            f"{str(result)[:1800]}\n```"
                        )
                        await channel.send(scrub_response_secrets(text))
            except RuntimeError:
                raise
            except Exception as e:
                log.error("Scheduled task error: %s", e, exc_info=True)
                try:
                    await channel.send(
                        scrub_response_secrets(
                            f"**Scheduled task failed:** {schedule['description']}\nError: {e}"
                        )
                    )
                except Exception:
                    pass
                raise

        elif schedule["action"] == "workflow":
            ok = await self._run_scheduled_workflow(channel, schedule)
            if not ok:
                raise RuntimeError(
                    f"Scheduled workflow failed: {schedule.get('description', '')[:200]}"
                )

        else:
            raise RuntimeError(
                f"Unknown scheduled action type: {schedule['action']} "
                f"(schedule {schedule.get('id')})"
            )
