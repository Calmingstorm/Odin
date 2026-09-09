"""Delivery boundary shared by native, agent and deferred dispatchers."""

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import replace

from .media_result import image_result_parts
from .output_delivery import DeliveredOutput, deliver, delivery_scope, get_delivery_budget
from .output_retention import RetentionError
from .result_capture import result_capture
from .result_validator import ToolResult


@contextmanager
def execution_delivery_scope(owner, channel=None, *, allowed_tools=None):
    """Bind origin and full capture only for this invocation, including cancellation."""
    previous_owner, previous_channel = delivery_scope.get()
    token = delivery_scope.set((str(owner or previous_owner),
                                str(channel if channel is not None else previous_channel)))
    from .output_authorization import host_access_capture, request_tool_scope

    scope_token = request_tool_scope.set(
        allowed_tools if allowed_tools is not None else request_tool_scope.get())
    try:
        with result_capture(), host_access_capture():
            yield
    finally:
        request_tool_scope.reset(scope_token)
        delivery_scope.reset(token)


def deliver_runtime_output(executor, text, *, tool_name, tool_input, user_id,
                           channel_id=None, status="succeeded", budget=None):
    """Use the executor's authorization/store owner even for native tools."""
    method = getattr(type(executor), "deliver_output", None)
    if callable(method):
        options = {} if budget is None else {"budget": budget}
        return method(executor, text, tool_name=tool_name, tool_input=tool_input,
                      user_id=user_id, channel_id=channel_id, status=status, **options)
    # Embedded dispatchers may have no retention service. Never promise a
    # cursor or silently discard the middle in that configuration.
    return deliver(text, tool=tool_name, status=status,
                   budget=(get_delivery_budget(getattr(executor, "config", None))
                           if budget is None else budget))


def deliver_runtime_result(executor, result, **kwargs):
    if isinstance(result, ToolResult):
        from ..discord.tool_loop_helpers import ensure_failure_visible

        status = ("outcome_unknown" if result.uncertain_outcome
                  else "succeeded" if result.ok else "failed")
        text = result.output
        if result.attachments:
            retain = getattr(type(executor), "retain_attachments", None)
            try:
                if not callable(retain):
                    raise RetentionError("Binary retention unavailable.")
                reference = retain(
                    executor, result.attachments, tool_name=kwargs["tool_name"],
                    user_id=kwargs.get("user_id"), channel_id=kwargs.get("channel_id"),
                    status=status,
                )
            except (RetentionError, OSError, sqlite3.Error, UnicodeError) as exc:
                reference = {
                    "kind": "tool_attachment_manifest", "attachment_count": len(result.attachments),
                    "retention": "failed", "cursor": None,
                    "error": (str(exc) if isinstance(exc, RetentionError)
                              else "Binary retention storage unavailable.")
                             + " No bytes retained; no continuation exists. "
                             "Do not replay the tool.",
                }
            # Bundle admission is atomic. Always reserve space for its one
            # discoverable manifest cursor, even if subsequent TEXT retention
            # exhausts quota. Never truncate file references into a lost middle.
            pointer = "\n[output retention] " + json.dumps(reference, ensure_ascii=True)
            budget = get_delivery_budget(getattr(executor, "config", None)) - len(pointer)
            text = deliver_runtime_output(
                executor, ensure_failure_visible(text, result.ok), status=status,
                budget=budget, **kwargs)
            return replace(result, attachments=(), output=DeliveredOutput(text + pointer))
        return replace(result, attachments=(), output=deliver_runtime_output(
            executor, ensure_failure_visible(text, result.ok), status=status, **kwargs))
    if image_result_parts(result) is not None:
        return result
    return deliver_runtime_output(executor, result, **kwargs)
