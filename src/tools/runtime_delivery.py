"""Delivery boundary shared by native, agent and deferred dispatchers."""

from contextlib import contextmanager
from dataclasses import replace

from .output_delivery import deliver, delivery_scope, get_delivery_budget
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
                           channel_id=None, status="succeeded"):
    """Use the executor's authorization/store owner even for native tools."""
    method = getattr(type(executor), "deliver_output", None)
    if callable(method):
        return method(executor, text, tool_name=tool_name, tool_input=tool_input,
                      user_id=user_id, channel_id=channel_id, status=status)
    # Embedded dispatchers may have no retention service. Never promise a
    # cursor or silently discard the middle in that configuration.
    return deliver(text, tool=tool_name, status=status,
                   budget=get_delivery_budget(getattr(executor, "config", None)))


def deliver_runtime_result(executor, result, **kwargs):
    if isinstance(result, ToolResult):
        from ..discord.tool_loop_helpers import ensure_failure_visible

        status = ("outcome_unknown" if result.uncertain_outcome
                  else "succeeded" if result.ok else "failed")
        return replace(result, output=deliver_runtime_output(
            executor, ensure_failure_visible(result.output, result.ok), status=status, **kwargs))
    if isinstance(result, dict) and "__image_block__" in result:
        return result
    return deliver_runtime_output(executor, result, **kwargs)
