"""Background task delegation — run multi-step tool sequences without blocking conversation.

The LLM constructs a list of steps upfront, the user approves once, and the task
runs in the background with progress updates via an editable Discord message.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

import discord

from ..audit.diff_tracker import DIFF_TOOLS, DiffTracker
from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger
from ..search.errors import InvalidSearchQuery
from ..tools.executor import _ERROR_RESULT_PREFIXES
from ..tools.result_validator import ToolResult
from ..tools.risk_classifier import classify_tool
from .tool_loop_helpers import _scrub_tool_input_for_storage, ensure_failure_visible

_EMAIL_BODY_TOOLS = frozenset({"email_send"})


def _scrub_email_input(tool_name: str, tool_input: dict) -> dict:
    if tool_name.startswith("mcp_"):
        return _scrub_tool_input_for_storage(tool_name, tool_input)
    if tool_name not in _EMAIL_BODY_TOOLS or not isinstance(tool_input, dict):
        return tool_input
    cleaned = dict(tool_input)
    body = cleaned.get("body", "")
    cleaned["body"] = f"[redacted email body: {len(body)} chars]"
    if "attachments" in cleaned and cleaned["attachments"]:
        from pathlib import Path

        cleaned["attachments"] = [Path(p).name for p in cleaned["attachments"]]
    return cleaned


if TYPE_CHECKING:
    from ..audit.logger import AuditLogger
    from ..knowledge.store import KnowledgeStore
    from ..search.embedder import LocalEmbedder
    from ..tools.executor import ToolExecutor
    from ..tools.mcp import MCPManager
    from ..tools.skill_manager import SkillManager

# Type for background chat callback: takes (messages, system, output_budget) -> response text
CodexCallback = Callable[[list[dict], str, int], Awaitable[str]]

log = get_logger("background_task")

# Tools that cannot run in background tasks (need Discord/interactive context)
BLOCKED_TOOLS = {
    "purge_messages",
    "browser_screenshot",
    "generate_file",
    "post_file",
    "browser_click",
    "browser_fill",
    "browser_evaluate",
    "delegate_task",  # no nesting
    "schedule_task",
    "update_schedule",
    "delete_schedule",
    "create_skill",
    "edit_skill",
    "delete_skill",
    "start_loop",
    "stop_loop",  # need LoopManager from client
    "spawn_agent",
    "send_to_agent",
    "kill_agent",  # no agent nesting
}

MAX_STEPS = 200
PROGRESS_UPDATE_INTERVAL = 2.0  # seconds between Discord message edits


@dataclass
class StepResult:
    index: int
    tool_name: str
    description: str
    status: str  # "ok", "error", "skipped", "cancelled"
    output: str = ""
    elapsed_ms: int = 0
    audit_metadata: dict | None = None


@dataclass
class BackgroundTask:
    task_id: str
    description: str
    steps: list[dict]
    channel: discord.abc.Messageable
    requester: str
    requester_id: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    status: str = "running"  # running, completed, failed, cancelled
    results: list[StepResult] = field(default_factory=list)
    current_step: int = 0
    _cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    _asyncio_task: asyncio.Task | None = field(default=None, repr=False)

    def cancel(self) -> None:
        """Signal cooperative cancellation (observed between steps)."""
        self._cancel_event.set()

    async def request_cancel(self) -> bool:
        """Cancel a running task and wait for it to settle.

        Idempotent: returns ``False`` if the task already reached a terminal
        state (a completed/failed task that finished first wins). The terminal
        status and the cooperative event are set BEFORE the asyncio task is
        cancelled, so the runner's cancellation cleanup sees the decision. The
        settlement wait is shielded so cancelling the caller (the ``cancel_task``
        tool turn itself) cannot sever the runner mid-cleanup — its subprocess /
        SSH teardown runs to completion.
        """
        if self.status != "running":
            return False
        self.status = "cancelled"
        self._cancel_event.set()
        t = self._asyncio_task
        if t is not None and not t.done() and t is not asyncio.current_task():
            t.cancel()
            try:
                await asyncio.shield(t)
            except asyncio.CancelledError:
                # t's own cancellation acknowledgement — unless OUR turn was
                # cancelled (t not yet done), in which case propagate and let
                # the shielded runner keep settling.
                if not t.done():
                    raise
            except Exception:
                pass  # runner raised during its own teardown; already cancelled
        return True


async def run_background_task(
    task: BackgroundTask,
    executor: ToolExecutor,
    skill_manager: SkillManager,
    knowledge_store: KnowledgeStore | None = None,
    embedder: LocalEmbedder | None = None,
    audit_logger: AuditLogger | None = None,
    codex_callback: CodexCallback | None = None,
    mcp_manager: MCPManager | None = None,
) -> None:
    """Execute a background task's steps sequentially with progress updates."""

    # Post initial progress message
    progress_msg = await _send_progress(task, None)

    variables: dict[str, str] = {}
    prev_output = ""
    last_update = time.monotonic()
    diff_tracker = DiffTracker()

    for i, step in enumerate(task.steps):
        # Check cancellation
        if task._cancel_event.is_set():
            task.status = "cancelled"
            task.results.append(
                StepResult(
                    index=i,
                    tool_name=step.get("tool_name", ""),
                    description=step.get("description", ""),
                    status="cancelled",
                )
            )
            break

        task.current_step = i
        tool_name = step["tool_name"]
        tool_input = step.get("tool_input", {})
        condition = step.get("condition")
        on_failure = step.get("on_failure", "abort")
        step_desc = step.get("description", tool_name)
        store_as = step.get("store_as")

        # Variable substitution in tool_input string values
        tool_input = _substitute_vars(tool_input, variables, prev_output)

        # Evaluate condition
        if condition and prev_output:
            if not _check_condition(condition, prev_output):
                task.results.append(
                    StepResult(
                        index=i,
                        tool_name=tool_name,
                        description=step_desc,
                        status="skipped",
                        output=f"Condition not met: {condition}",
                    )
                )
                # Update progress periodically
                now = time.monotonic()
                if now - last_update >= PROGRESS_UPDATE_INTERVAL:
                    progress_msg = await _send_progress(task, progress_msg)
                    last_update = now
                continue

        # Check blocked tools
        if tool_name in BLOCKED_TOOLS:
            task.results.append(
                StepResult(
                    index=i,
                    tool_name=tool_name,
                    description=step_desc,
                    status="error",
                    output=f"Tool '{tool_name}' cannot run in background tasks.",
                )
            )
            if on_failure == "abort":
                task.status = "failed"
                break
            continue

        # Capture before-state for diff-tracked tools
        snapshot_key: str | None = None
        if tool_name in DIFF_TOOLS:
            try:
                snapshot_key = await diff_tracker.capture_before(tool_name, tool_input, executor)
            except Exception:
                pass

        # Execute the tool
        t0 = time.monotonic()
        try:
            output = await _execute_tool(
                tool_name,
                tool_input,
                executor,
                skill_manager,
                knowledge_store,
                embedder,
                task.requester,
                step_desc=step_desc,
                mcp_manager=mcp_manager,
                requester_id=task.requester_id,
            )
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            structured_ok: bool | None = None
            structured_metadata: dict | None = None
            if isinstance(output, ToolResult):
                structured_ok = output.ok
                structured_metadata = output.audit_metadata
                # Same canonical marking the chat/loop pipelines apply: a
                # structurally-failed result gets an explicit Error prefix so
                # the posted step output cannot read as success.
                output = ensure_failure_visible(str(output), output.ok)
            output = scrub_output_secrets(output)
            prev_output = output

            if store_as:
                variables[store_as] = output

            # Compute diff for file-modifying tools
            action_diff: str | None = None
            if snapshot_key is not None:
                try:
                    action_diff = diff_tracker.compute_diff(tool_name, tool_input, snapshot_key)
                except Exception:
                    pass

            # Structured failure signal first (ToolResult.ok), then the
            # error-string heuristic for plain-string handler branches.
            if structured_ok is not None:
                is_error = not structured_ok
            else:
                is_error = _is_error_output(output)
            task.results.append(
                StepResult(
                    index=i,
                    tool_name=tool_name,
                    description=step_desc,
                    status="error" if is_error else "ok",
                    output=output[:500],
                    elapsed_ms=elapsed_ms,
                    audit_metadata=structured_metadata,
                )
            )

            # Classify risk level for observability
            risk_assessment = classify_tool(tool_name, tool_input)

            if audit_logger:
                try:
                    log_kwargs: dict = dict(
                        user_id=task.requester_id,
                        user_name=task.requester,
                        channel_id=str(getattr(task.channel, "id", "")),
                        tool_name=tool_name,
                        tool_input=_scrub_email_input(tool_name, tool_input),
                        approved=True,
                        result_summary=output,
                        execution_time_ms=elapsed_ms,
                        risk_level=risk_assessment.level.value,
                        risk_reason=risk_assessment.reason,
                        audit_metadata=structured_metadata,
                    )
                    if is_error:
                        log_kwargs["error"] = output[:500]
                    if action_diff:
                        log_kwargs["diff"] = action_diff
                    await audit_logger.log_execution(**log_kwargs)
                except Exception:
                    log.warning("Failed to audit log step %d of task %s", i, task.task_id)

            # Abort on detected error if on_failure policy requires it
            if is_error and on_failure == "abort":
                task.status = "failed"
                break

        except Exception as e:
            # Cancellation is authoritative: a cancel that arrived while this
            # step ran (or a cleanup exception surfacing during it) must NOT be
            # masked as a failure — that would fire the summary + the forbidden
            # post-cancel LLM follow-up.
            if task._cancel_event.is_set():
                task.status = "cancelled"
                break
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            error_msg = str(e)
            task.results.append(
                StepResult(
                    index=i,
                    tool_name=tool_name,
                    description=step_desc,
                    status="error",
                    output=error_msg[:500],
                    elapsed_ms=elapsed_ms,
                )
            )

            err_risk = classify_tool(tool_name, tool_input)
            if audit_logger:
                try:
                    await audit_logger.log_execution(
                        user_id=task.requester_id,
                        user_name=task.requester,
                        channel_id=str(getattr(task.channel, "id", "")),
                        tool_name=tool_name,
                        tool_input=_scrub_email_input(tool_name, tool_input),
                        approved=True,
                        result_summary=error_msg,
                        execution_time_ms=elapsed_ms,
                        error=error_msg[:500],
                        risk_level=err_risk.level.value,
                        risk_reason=err_risk.reason,
                    )
                except Exception:
                    log.warning("Failed to audit log step %d of task %s", i, task.task_id)
            if on_failure == "abort":
                task.status = "failed"
                break

        # Update progress
        now = time.monotonic()
        if now - last_update >= PROGRESS_UPDATE_INTERVAL:
            progress_msg = await _send_progress(task, progress_msg)
            last_update = now

    # A cancel that landed between steps (or right at the end) wins.
    if task._cancel_event.is_set() and task.status == "running":
        task.status = "cancelled"

    if task.status == "cancelled":
        # Post only the final progress line — no summary and no LLM follow-up
        # (cancellation won; there is nothing to conclude).
        await _send_progress(task, progress_msg)
    else:
        # Render the terminal outcome, but keep task.status == 'running' so a
        # cancel arriving during the summary / (potentially long) LLM follow-up
        # is still honored (request_cancel refuses once the status is terminal).
        # Publish the real terminal status only AFTER post-processing settles.
        terminal = "failed" if task.status == "failed" else "completed"
        task.status = "running"
        await _send_progress(task, progress_msg, status_override=terminal)
        await _send_summary(task, status_override=terminal)
        if codex_callback and not task._cancel_event.is_set():
            await _send_conversational_followup(task, codex_callback, status_override=terminal)
        if task.status == "running":  # not cancelled mid-follow-up
            task.status = terminal

    log.info(
        "Background task %s finished: %s (%d/%d steps)",
        task.task_id,
        task.status,
        len(task.results),
        len(task.steps),
    )


def _get_default_host(executor: ToolExecutor) -> str:
    """Get the first configured host alias, falling back to 'localhost'."""
    try:
        hosts = executor.config.hosts
        if hosts and isinstance(hosts, dict):
            return next(iter(hosts))
    except (AttributeError, StopIteration):
        pass
    return "localhost"


def _is_error_output(output: str) -> bool:
    """Detect error strings returned as successful results by executor/handlers."""
    if not output:
        return False
    # executor.execute() returns "Error executing <tool>: <msg>" on exception
    if output.startswith("Error executing "):
        return True
    # executor.execute() returns "Unknown tool: <name>" for missing handlers
    if output.startswith("Unknown tool: "):
        return True
    # executor.execute() returns "Permission denied: ..." for RBAC violations
    if output.startswith("Permission denied: "):
        return True
    # The executor's own canonical error grammar ("Error…", "Command failed",
    # "Script failed", "Blocked…", "Unknown or disallowed host") — the same
    # prefix set ensure_failure_visible treats as already-visible failures.
    if output.startswith(_ERROR_RESULT_PREFIXES):
        return True
    return False


async def _execute_tool(
    tool_name: str,
    tool_input: dict,
    executor: ToolExecutor,
    skill_manager: SkillManager,
    knowledge_store: KnowledgeStore | None,
    embedder: LocalEmbedder | None,
    requester: str,
    step_desc: str = "",
    mcp_manager: MCPManager | None = None,
    requester_id: str = "",
) -> str | ToolResult:
    """Execute a single tool, routing to the right handler.

    The executor path returns the structured ToolResult (the caller consumes
    .ok); every other branch returns a plain string.
    """
    # This dispatcher has several special-cased built-ins below which never
    # enter ToolExecutor.execute(). Apply the SAME live policy at this shared
    # background/scheduled entry point before RBAC, handler selection, store
    # access, skill lookup, or any other effect. The policy's disabled set is
    # restricted to the static built-in universe, so skills and MCP tools pass
    # through untouched.
    from ..tools.builtin_policy import BuiltinToolPolicy, disabled_rejection

    policy = getattr(executor, "_builtin_policy", None)
    if isinstance(policy, BuiltinToolPolicy) and policy.is_disabled(tool_name):
        return disabled_rejection(tool_name)

    # Central RBAC gate for deferred/background execution. Skills, MCP, and the
    # knowledge tools below bypass ToolExecutor.execute() (the only place
    # check_permission runs), and even the final execute() call only enforces
    # once requester_id is threaded through. Enforce for EVERY tool when we know
    # who requested it, so a scoped token's tier/host limits still apply to work
    # deferred to a background task or schedule.
    if requester_id:
        _denial = executor.check_permission(tool_name, requester_id)
        if isinstance(_denial, str) and _denial:  # denial is a str message; None = allowed
            return _denial
    # Knowledge base tools need special handling (not in executor)
    if tool_name == "ingest_document" and knowledge_store and embedder:
        source = tool_input.get("source", "")
        content = tool_input.get("content", "")
        if not source or not content:
            return "Both 'source' and 'content' are required."
        count = await knowledge_store.ingest(
            content=content,
            source=source,
            embedder=embedder,
            uploader=requester,
        )
        return f"Ingested '{source}' ({count} chunks)."

    if tool_name == "search_knowledge" and knowledge_store and embedder:
        query = tool_input.get("query", "")
        limit = min(tool_input.get("limit", 5), 10)
        try:
            results = await knowledge_store.search_hybrid(query, embedder, limit=limit)
        except InvalidSearchQuery:
            return "Invalid query: unsupported control character."
        except Exception:
            log.exception("Background knowledge search failed")
            return "Search failed while searching the knowledge base."
        if not results:
            return f"No results for '{query}'."
        lines = [
            f"[{r['source']}] (score: {r.get('score', r.get('rrf_score', 0))}): "
            f"{r['content'][:200]}"
            for r in results
        ]
        return "\n".join(lines)

    if tool_name == "list_knowledge" and knowledge_store:
        sources = knowledge_store.list_sources()
        if not sources:
            return "Knowledge base is empty."
        return "\n".join(f"- {s['source']} ({s['chunks']} chunks)" for s in sources)

    if tool_name == "bulk_ingest_knowledge" and knowledge_store:
        items = tool_input.get("items")
        if not items or not isinstance(items, list):
            return "items (array) is required."
        from ..knowledge.importer import BulkImporter

        importer = BulkImporter(knowledge_store, embedder)
        batch = await importer.import_batch(items, uploader=requester)
        lines = [
            f"Bulk import: {batch.succeeded} succeeded, {batch.failed} failed, "
            f"{batch.skipped} skipped"
        ]
        for r in batch.results:
            tag = r["status"].upper()
            detail = f" ({r['chunks']} chunks)" if r["chunks"] else ""
            err = f" — {r['error']}" if r["error"] else ""
            lines.append(f"  [{tag}] {r['source']}{detail}{err}")
        return "\n".join(lines)

    # Skills
    if tool_name == "invoke_skill":
        target_name = tool_input.get("name")
        if not target_name:
            return "Error: invoke_skill requires 'name'."
        if not skill_manager.has_skill(target_name):
            return f"Error: skill '{target_name}' not found or disabled."
        skill_input = tool_input.get("input") or {}
        if not isinstance(skill_input, dict):
            return "Error: invoke_skill 'input' must be an object."
        return await skill_manager.execute(target_name, skill_input)
    if skill_manager.has_skill(tool_name):
        return await skill_manager.execute(tool_name, tool_input)

    # MCP tools (namespaced as mcp_<server>_<tool>)
    if mcp_manager is not None and mcp_manager.has_tool(tool_name):
        from .mcp_dispatch import dispatch_mcp_tool

        # Shared seam (P3): typed outcome → structured ToolResult; callers
        # consume .ok so a failed/uncertain MCP step aborts per on_failure.
        return await dispatch_mcp_tool(mcp_manager, tool_name, tool_input)

    # Built-in tools via executor — default missing required fields
    if "host" not in tool_input:
        tool_input = {**tool_input, "host": _get_default_host(executor)}
    # run_command/run_script: if 'command'/'script' missing, let executor handle it
    # (it will return an error that _is_error_output catches)
    # Return the structured result — run_background_task consumes .ok so a
    # failed tool can no longer masquerade as a successful step (soak finding
    # 2026-07-05; same failure class PR #130 fixed for the chat loop).
    return await executor.execute(tool_name, tool_input, user_id=requester_id or None)


def _substitute_vars(
    tool_input: dict,
    variables: dict[str, str],
    prev_output: str,
) -> dict:
    """Replace {prev_output} and {var.name} in string values."""
    result = {}
    for key, value in tool_input.items():
        if isinstance(value, str):
            value = value.replace("{prev_output}", prev_output)
            for var_name, var_value in variables.items():
                value = value.replace(f"{{var.{var_name}}}", var_value)
            result[key] = value
        else:
            result[key] = value
    return result


def _check_condition(condition: str, prev_output: str) -> bool:
    """Check if a condition is met against previous output."""
    prev_lower = prev_output.lower()
    if condition.startswith("!"):
        # Negated: true if substring is NOT present
        return condition[1:].lower() not in prev_lower
    else:
        # Normal: true if substring IS present
        return condition.lower() in prev_lower


async def _send_progress(
    task: BackgroundTask,
    existing_msg: discord.Message | None,
    status_override: str | None = None,
) -> discord.Message | None:
    """Post or edit a progress message in the channel.

    ``status_override`` renders the terminal outcome while ``task.status`` is
    deliberately kept ``running`` (cancellable) through post-processing.
    """
    status = status_override or task.status
    total = len(task.steps)
    done = len(task.results)
    ok = sum(1 for r in task.results if r.status == "ok")
    errors = sum(1 for r in task.results if r.status == "error")
    skipped = sum(1 for r in task.results if r.status == "skipped")

    # Status emoji
    if status == "completed":
        status_icon = "DONE"
    elif status == "failed":
        status_icon = "FAILED"
    elif status == "cancelled":
        status_icon = "CANCELLED"
    else:
        status_icon = f"Step {task.current_step + 1}/{total}"

    # Build progress bar
    if total > 0:
        pct = done / total
        filled = int(pct * 20)
        bar = "\u2588" * filled + "\u2591" * (20 - filled)
        progress_line = f"`[{bar}]` {done}/{total}"
    else:
        progress_line = "No steps"

    lines = [
        f"**Background Task: {task.description}** ({status_icon})",
        f"ID: `{task.task_id}` | {progress_line}",
    ]

    if ok or errors or skipped:
        lines.append(f"OK: {ok} | Errors: {errors} | Skipped: {skipped}")

    # When finished, show ALL steps; while running, show last 3
    # Use the effective (possibly overridden) status: task.status is kept
    # 'running' during finalization so the follow-up stays cancellable, but the
    # final render must still show all results + the full report attachment.
    is_finished = status in ("completed", "failed", "cancelled")
    show_results = task.results if is_finished else task.results[-3:]
    if show_results:
        lines.append("")
        for r in show_results:
            icon = {"ok": "+", "error": "!", "skipped": "-", "cancelled": "x"}.get(r.status, "?")
            output_preview = r.output.split("\n")[0][:120]  # first line, truncated
            lines.append(f"`[{icon}]` Step {r.index + 1} ({r.description}): {output_preview}")

    text = "\n".join(lines)

    try:
        if len(text) > 1900 and is_finished:
            # Too long for Discord — post a short summary in the message,
            # attach the full report as a file
            import io

            short = "\n".join(lines[:3])  # header + progress bar + counts
            short += f"\n\nFull report attached ({len(task.results)} steps)."
            file_bytes = text.encode("utf-8")
            discord_file = discord.File(
                io.BytesIO(file_bytes),
                filename=f"task_{task.task_id}_report.txt",
            )
            if existing_msg:
                await existing_msg.edit(content=short)
                await task.channel.send(file=discord_file)
            else:
                await task.channel.send(content=short, file=discord_file)
            return existing_msg
        elif len(text) > 1900:
            text = text[:1900] + "\n..."

        if existing_msg:
            await existing_msg.edit(content=text)
            return existing_msg
        else:
            return await task.channel.send(text)
    except Exception as e:
        log.warning("Failed to update progress message: %s", e)
        return existing_msg


async def _send_summary(task: BackgroundTask, status_override: str | None = None) -> None:
    """Post a natural language summary of the completed task."""
    status = status_override or task.status
    ok = [r for r in task.results if r.status == "ok"]
    errors = [r for r in task.results if r.status == "error"]

    lines = [f"**Task complete: {task.description}**"]

    if status == "completed" and not errors:
        lines.append(f"All {len(ok)} steps succeeded.")
    elif status == "completed" and errors:
        lines.append(f"{len(ok)} succeeded, {len(errors)} failed.")
    elif status == "failed":
        lines.append(
            f"Task aborted after {len(task.results)} of {len(task.steps)} steps "
            f"({len(errors)} error(s))."
        )
    elif status == "cancelled":
        lines.append(f"Task was cancelled after {len(task.results)} of {len(task.steps)} steps.")

    # Include all results with their output
    if ok or errors:
        lines.append("")
        for r in task.results:
            if r.status == "skipped":
                continue
            # Show meaningful output, not just truncated first line
            output = r.output.strip()
            if len(output) > 200:
                output = output[:200] + "..."
            lines.append(f"**{r.description}**: {output}")

    text = "\n".join(lines)

    try:
        if len(text) > 1900:
            import io

            short_lines = lines[:3]  # header + status line
            short = "\n".join(short_lines) + "\n\nFull summary attached."
            file_bytes = text.encode("utf-8")
            discord_file = discord.File(
                io.BytesIO(file_bytes),
                filename=f"task_{task.task_id}_summary.txt",
            )
            await task.channel.send(content=short, file=discord_file)
        else:
            await task.channel.send(text)
    except Exception as e:
        log.warning("Failed to send task summary: %s", e)


async def _send_conversational_followup(
    task: BackgroundTask,
    codex_callback: CodexCallback,
    status_override: str | None = None,
) -> None:
    """Generate and post an LLM-written conversational summary of the task results."""
    # Build a concise context of what happened
    result_lines = []
    for r in task.results:
        icon = {"ok": "OK", "error": "ERROR", "skipped": "SKIPPED"}.get(r.status, r.status)
        output_preview = r.output.strip()[:150] if r.output else ""
        result_lines.append(f"[{icon}] {r.description}: {output_preview}")

    results_text = "\n".join(result_lines) if result_lines else "No step results."

    messages = [
        {
            "role": "user",
            "content": (
                f"A background task just finished. Summarize the results conversationally.\n\n"
                f"Task: {task.description}\n"
                f"Status: {status_override or task.status}\n"
                f"Requested by: {task.requester}\n\n"
                f"Step results:\n{results_text}\n\n"
                f"Write a concise, personality-infused summary (2-4 sentences). "
                f"Highlight any failures. Do NOT repeat every step — focus on the outcome."
            ),
        }
    ]
    system = (
        "You are Odin, the All-Father — a capable but eternally vigilant infrastructure guardian. "
        "Summarize this background task result conversationally. Be concise and direct."
    )

    try:
        response = await codex_callback(messages, system, 200)
        # A cancel may have won while the callback ran — e.g. a callback that
        # swallows CancelledError and returns normally. Never post a follow-up
        # after cancellation.
        if task._cancel_event.is_set():
            return
        response = scrub_output_secrets(response.strip())
        if response:
            await task.channel.send(response)
    except Exception as e:
        log.warning("Failed to generate conversational follow-up for task %s: %s", task.task_id, e)


def create_task_id() -> str:
    return uuid.uuid4().hex[:8]
