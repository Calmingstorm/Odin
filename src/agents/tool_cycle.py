"""Sequential, paired execution of one accepted agent generation."""

import asyncio
import time

from ..audit.tool_context import agent_tool_context
from ..llm.secret_scrubber import scrub_output_secrets
from ..tools.result_validator import ToolResult, _is_error_result
from .execution_context import waiting_agent
from .wait_deadlines import WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS, wait_for_agents_wrapper_timeout


def result_record(call: dict, text: str, status: str, *, uncertain: bool = False) -> dict:
    from ..tools.output_delivery import DeliveredOutput, deliver

    text = scrub_output_secrets(text)
    if (status != "succeeded" and not isinstance(text, DeliveredOutput)
            and not text.startswith(
                ("Error", "Denied", "Permission denied", "Command failed", "Script failed"))):
        text = f"Error ({status}):\n{text}"
    if call["name"] != "read_file" and not isinstance(text, DeliveredOutput):
        text = deliver(text, tool=call["name"], status=status)
    return {
        "name": call["name"],
        "tool_use_id": call["id"],
        "result": text,
        "ok": status == "succeeded",
        "status": status,
        "uncertain_outcome": uncertain,
    }


async def execute_cycle(agent, calls, execute, results, *, timeouts, default_timeout):
    """Always settle every accepted call, even on cancellation/deadline expiry.

    ``results`` is owned by the manager so partial telemetry survives unwinding.
    A cancelled dispatched operation has unknown effects, never fake success.
    """
    active = None
    try:
        for call in calls:
            lifetime = agent.max_lifetime - (time.time() - agent.created_at)
            if lifetime <= 0 or agent._cancel_event.is_set() or not agent._inbox.empty():
                break
            if call.get("parse_error"):
                results.append(
                    result_record(call, f"Error: {call['parse_error']}", "invalid_arguments")
                )
                continue
            name, arguments = call["name"], call["input"]
            timeout = wait_for_agents_wrapper_timeout(
                name,
                arguments,
                timeouts.get(name, default_timeout),
                grace_seconds=WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS,
            )
            timeout = min(timeout, lifetime)
            agent.set_phase(
                "waiting_for_children" if name == "wait_for_agents" else "executing_tool",
                time.time() + timeout,
            )

            async def dispatch():
                # wait_for schedules a child task: recheck at actual dispatch,
                # not only before yielding to the scheduler.
                nonlocal active
                if (
                    agent._cancel_event.is_set()
                    or not agent._inbox.empty()
                    or time.time() >= agent.created_at + agent.max_lifetime
                ):
                    return None
                active = call
                agent.tool_execution_count += 1
                if name not in agent.tools_used:
                    agent.tools_used.append(name)
                with agent_tool_context(agent, call):
                    return await execute(name, arguments)

            context_token = waiting_agent.set(agent if name == "wait_for_agents" else None)
            try:
                raw = await asyncio.wait_for(dispatch(), timeout=timeout)
                if active is None:
                    break
                if isinstance(raw, ToolResult):
                    status = "succeeded" if raw.ok else "failed"
                    if raw.error in {"denied", "permission_denied", "host_denied"}:
                        status = "denied"
                    if raw.uncertain_outcome:
                        status = "outcome_unknown"
                    record = result_record(
                        call, raw.output, status, uncertain=raw.uncertain_outcome)
                    if (
                        raw.ok
                        and raw.audit_metadata
                        and raw.audit_metadata.get("wait_interrupted") == "parent_message"
                    ):
                        record["status"] = "interrupted_effect_free"
                    if raw.audit_metadata:
                        record["audit_metadata"] = raw.audit_metadata
                else:
                    text = raw if isinstance(raw, str) else str(raw)
                    status = "failed" if _is_error_result(text) else "succeeded"
                    if text.startswith(
                        ("Denied", "Permission denied", "Unknown or disallowed host")
                    ):
                        status = "denied"
                    record = result_record(call, text, status)
                from ..tools.output_delivery import DeliveredOutput

                if (not record["ok"] and not isinstance(record["result"], DeliveredOutput)
                        and not record["result"].startswith(
                    ("Error", "Denied", "Permission denied", "Command failed", "Script failed")
                )):
                    record["result"] = f"Error ({record['status']}):\n{record['result']}"
            except TimeoutError:
                effect_free = name == "wait_for_agents"
                record = result_record(
                    call,
                    f"Error: Tool '{name}' timed out after {timeout}s; "
                    + ("children continue." if effect_free else "external outcome unknown."),
                    "timed_out",
                    uncertain=not effect_free,
                )
            except Exception as exc:
                record = result_record(call, f"Error: {exc}", "failed")
            finally:
                waiting_agent.reset(context_token)
            results.append(record)
            active = None
            agent.set_phase("ready")
    finally:
        if active is not None:
            effect_free = active["name"] == "wait_for_agents"
            results.append(
                result_record(
                    active,
                    "Wait interrupted; children continue."
                    if effect_free
                    else "Tool interrupted after dispatch; external outcome unknown.",
                    "interrupted_effect_free" if effect_free else "interrupted",
                    uncertain=not effect_free,
                )
            )
        for call in calls[len(results) :]:
            results.append(
                result_record(
                    call,
                    "Not executed: agent stopped or parent correction queued before dispatch.",
                    "not_executed",
                )
            )
        agent.messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": r["tool_use_id"],
                        "content": r["result"],
                        "is_error": not r["ok"],
                        "status": r["status"],
                        "uncertain_outcome": r["uncertain_outcome"],
                    }
                    for r in results
                ],
            }
        )
