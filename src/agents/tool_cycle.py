"""Sequential, paired execution of one accepted agent generation."""

import asyncio
import time

from ..llm.secret_scrubber import scrub_output_secrets
from ..tools.result_validator import ToolResult, _is_error_result
from .wait_deadlines import WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS, wait_for_agents_wrapper_timeout


def result_record(call: dict, text: str, status: str, *, uncertain: bool = False) -> dict:
    return {
        "name": call["name"],
        "tool_use_id": call["id"],
        "result": scrub_output_secrets(text),
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
            if lifetime <= 0 or agent._cancel_event.is_set():
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
            agent.last_activity = time.time()
            agent.tool_execution_count += 1
            if name not in agent.tools_used:
                agent.tools_used.append(name)
            active = call
            try:
                raw = await asyncio.wait_for(execute(name, arguments), timeout=timeout)
                if isinstance(raw, ToolResult):
                    status = "succeeded" if raw.ok else "failed"
                    if raw.error in {"denied", "permission_denied", "host_denied"}:
                        status = "denied"
                    if raw.uncertain_outcome:
                        status = "outcome_unknown"
                    record = result_record(call, str(raw), status, uncertain=raw.uncertain_outcome)
                    if raw.audit_metadata:
                        record["audit_metadata"] = raw.audit_metadata
                else:
                    text = str(raw)
                    status = "failed" if _is_error_result(text) else "succeeded"
                    if text.startswith(
                        ("Denied", "Permission denied", "Unknown or disallowed host")
                    ):
                        status = "denied"
                    record = result_record(call, text, status)
                if record["status"] != "succeeded" and not record["result"].startswith(
                    ("Error", "Denied", "Permission denied", "Command failed", "Script failed")
                ):
                    record["result"] = f"Error ({record['status']}):\n{record['result']}"
            except TimeoutError:
                record = result_record(
                    call,
                    f"Error: Tool '{name}' timed out after {timeout}s; external outcome unknown.",
                    "timed_out",
                    uncertain=True,
                )
            except Exception as exc:
                record = result_record(call, f"Error: {exc}", "failed")
            results.append(record)
            active = None
            agent.last_activity = time.time()
    finally:
        if active is not None:
            results.append(
                result_record(
                    active,
                    "Tool interrupted after dispatch; external outcome unknown.",
                    "interrupted",
                    uncertain=True,
                )
            )
        for call in calls[len(results) :]:
            results.append(
                result_record(
                    call, "Not executed: agent interrupted before dispatch.", "not_executed"
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
