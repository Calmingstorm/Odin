"""Sequential, paired execution of one accepted agent generation."""

import asyncio
import time

from ..audit.tool_context import agent_tool_context
from ..llm.secret_scrubber import scrub_output_secrets
from ..tools.media_result import (
    append_image_messages,
    image_evidence_digest,
    tool_image_content,
)
from ..tools.output_delivery import evidence_digest
from ..tools.result_validator import ToolResult, _is_error_result
from .execution_context import agent_dispatch, waiting_agent
from .wait_deadlines import WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS, wait_for_agents_wrapper_timeout

# Results for calls a cycle held back before dispatch. Only the parent-message
# text is ever read by a model: a stopped or expired agent ends at the loop head
# before its next generation.
NOT_RUN_TEXTS = {
    "parent_message": (
        "Not run: a message from your parent arrived before this call was dispatched. "
        "This is not a tool failure or an agent stop; this call did not execute. Read the "
        "[Message from parent] below, then reissue this call only if it is still needed and "
        "consistent with that message."
    ),
    "stopped": "Not run: this agent was stopped before this call started.",
    "lifetime": "Not run: this agent reached its lifetime limit before this call started.",
}
NOT_RUN_FALLBACK = "Not run: this call was not dispatched because the tool batch ended early."


def hold_back_cause(agent, now: float | None = None) -> str | None:
    """Why the next call must not start, if it must not: stopped, then lifetime,
    then a queued parent message."""
    if agent._cancel_event.is_set():
        return "stopped"
    if (time.time() if now is None else now) >= agent.created_at + agent.max_lifetime:
        return "lifetime"
    if not agent._inbox.empty():
        return "parent_message"
    return None


def result_record(call: dict, text: str, status: str, *, uncertain: bool = False) -> dict:
    from ..tools.output_delivery import DeliveredOutput, deliver

    text = scrub_output_secrets(text)
    # A held-back call never ran, so it cannot have failed: its text says why.
    if (status not in ("succeeded", "not_executed") and not isinstance(text, DeliveredOutput)
            and not text.startswith(
                ("Error", "Denied", "Permission denied", "Command failed", "Script failed"))):
        text = f"Error ({status}):\n{text}"
    if call["name"] != "read_file" and not isinstance(text, DeliveredOutput):
        text = deliver(text, tool=call["name"], status=status)
    return {
        "name": call["name"],
        "tool_use_id": call["id"],
        "result": text,
        "evidence_digest": text.evidence_digest if isinstance(text, DeliveredOutput) else "",
        "ok": status == "succeeded",
        "status": status,
        "uncertain_outcome": uncertain,
    }


async def execute_cycle(
    agent,
    calls,
    execute,
    results,
    *,
    timeouts,
    default_timeout,
    timeout_resolver=None,
):
    """Always settle every accepted call, even on cancellation/deadline expiry.

    ``results`` is owned by the manager so partial telemetry survives unwinding.
    A cancelled dispatched operation has unknown effects, never fake success.
    """
    active = None
    cause = None  # captured where a call is held back; names the remaining calls' result
    image_messages: list[dict] = []
    try:
        for call in calls:
            # One clock sample admits the call and bounds its wait, so an admitted
            # call always has time left to reach the dispatch recheck.
            now = time.time()
            cause = hold_back_cause(agent, now)
            if cause is not None:
                break
            lifetime = agent.max_lifetime - (now - agent.created_at)
            if call.get("parse_error"):
                results.append(
                    result_record(call, f"Error: {call['parse_error']}", "invalid_arguments")
                )
                continue
            name, arguments = call["name"], call["input"]
            if timeout_resolver is not None:
                # Production agents share the foreground/loop resolver: built-in
                # budgets, executor recovery allowance, dispatch settlement, and
                # wait_for_agents' argument-derived native grace all stay one
                # contract. The map fallback remains for standalone callers.
                timeout = float(timeout_resolver(name, arguments))
            else:
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
                nonlocal active, cause
                cause = hold_back_cause(agent)
                if cause is not None:
                    return None
                active = call
                agent.tool_execution_count += 1
                if name not in agent.tools_used:
                    agent.tools_used.append(name)
                with agent_tool_context(agent, call), agent_dispatch(agent, call):
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
                    if raw.image_blocks:
                        # Append only to model messages, not result records:
                        # those feed trajectory/audit/repetition text consumers.
                        append_image_messages(image_messages, tool_image_content(
                            list(raw.image_blocks), name, call["id"]))
                        # The record keeps only a digest of the pixels, so the
                        # repetition guard sees a changed image as new evidence
                        # even when the tool text is identical.
                        record["evidence_digest"] = image_evidence_digest(
                            evidence_digest(record["result"]), raw.image_blocks)
                else:
                    from ..tools.execution_outcome import ToolFailure

                    text = raw if isinstance(raw, str) else str(raw)
                    status = "failed" if _is_error_result(text) else "succeeded"
                    if text.startswith(
                        ("Denied", "Permission denied", "Unknown or disallowed host")
                    ):
                        status = "denied"
                    uncertain = isinstance(raw, ToolFailure) and raw.uncertain_outcome
                    if uncertain:
                        status = "outcome_unknown"
                    record = result_record(call, text, status, uncertain=uncertain)
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
                from ..tools.effect_classifier import ToolEffectClass, classify_tool_effect

                uncertain = classify_tool_effect(name, arguments) != (
                    ToolEffectClass.EFFECT_FREE_OBSERVATION)
                record = result_record(call, f"Error: {exc}",
                                       "outcome_unknown" if uncertain else "failed",
                                       uncertain=uncertain)
            finally:
                waiting_agent.reset(context_token)
            results.append(record)
            active = None
            agent.set_phase("ready")
    except asyncio.CancelledError:
        if cause is None:
            cause = "stopped"
        raise
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
        # Any other unwind (an exception outside a call) keeps its own record;
        # these calls only say they never ran.
        not_run = NOT_RUN_TEXTS.get(cause or "", NOT_RUN_FALLBACK)
        for call in calls[len(results) :]:
            results.append(result_record(call, not_run, "not_executed"))
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
        agent.messages.extend(image_messages)
