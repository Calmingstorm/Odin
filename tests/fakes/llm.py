"""Scripted fake LLM provider for characterization tests.

Plays a pre-scripted sequence of ``LLMResponse`` objects through
``chat_with_tools`` and plain strings through ``chat``, recording every
call it receives (messages, system prompt, tools) so tests can assert the
exact message-list shape the tool loop constructs per iteration.

Installable at BOTH seams the client currently uses:

- ``bot.llm_gateway.codex_client = FakeLLM(...)`` — the chat tool loop reaches the LLM
  via ``_codex_call`` → the ``llm_client`` property, which resolves to
  ``codex_client`` under the default ``active_provider: codex``.
- The autonomous loop (``_run_loop_iteration``) calls
  ``self.llm_client.chat_with_tools`` directly — same attribute, so the
  same installation covers it. (RFC-001 §4.3: the loop path deliberately
  bypasses ``_codex_call``'s cost/router/guard wiring.)

Script entries may be:
- ``LLMResponse``   — returned as-is
- ``Exception``     — raised (e.g. ``CircuitOpenError``, ``RuntimeError``)
- ``callable``      — invoked with no args at consume time; may return an
                      ``LLMResponse`` or raise. Useful for side effects
                      like setting a cancel event between iterations.
"""

from __future__ import annotations

import copy

from src.llm.types import LLMResponse, ToolCall


def text_response(text: str, *, input_tokens: int = 10, output_tokens: int = 5) -> LLMResponse:
    """A plain final-text response (ends the tool loop)."""
    return LLMResponse(
        text=text,
        tool_calls=[],
        stop_reason="end_turn",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


def tool_call_response(
    *calls: tuple[str, dict],
    text: str = "",
    id_prefix: str = "call",
    input_tokens: int = 10,
    output_tokens: int = 5,
) -> LLMResponse:
    """A response containing one or more tool calls.

    ``calls`` are (tool_name, tool_input) pairs; ids are generated as
    ``{id_prefix}-{n}`` so tests can assert tool_use/tool_result pairing.
    """
    tool_calls = [
        ToolCall(id=f"{id_prefix}-{i}", name=name, input=tool_input)
        for i, (name, tool_input) in enumerate(calls, 1)
    ]
    return LLMResponse(
        text=text,
        tool_calls=tool_calls,
        stop_reason="tool_use",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


def parse_error_call(tool_name: str, error: str = "invalid JSON in arguments") -> LLMResponse:
    """A tool call whose arguments failed to parse (parse_error set).

    The dispatcher must NOT execute the tool; it must bounce the error back.
    """
    return LLMResponse(
        text="",
        tool_calls=[ToolCall(id="parse-err-1", name=tool_name, input={}, parse_error=error)],
        stop_reason="tool_use",
    )


class FakeLLM:
    """Scripted LLM provider recording all calls.

    Attributes:
        calls: recorded ``chat_with_tools`` invocations, each a dict with
            deep-copied ``messages`` plus ``system`` and ``tools``.
        chat_calls: recorded plain ``chat`` invocations (classifier, guest
            route, compaction, handoff).
    """

    def __init__(
        self,
        responses: list | None = None,
        chat_responses: list | None = None,
        model: str = "fake-model",
    ) -> None:
        self.responses = list(responses or [])
        self.chat_responses = list(chat_responses or [])
        self.model = model
        self.calls: list[dict] = []
        self.chat_calls: list[dict] = []

    # -- seams ------------------------------------------------------------

    async def chat_with_tools(
        self, messages: list, system: str = "", tools: list | None = None, **kwargs
    ):
        self.calls.append(
            {
                "messages": copy.deepcopy(messages),
                "system": system,
                "tools": tools,
                "kwargs": dict(kwargs),
            }
        )
        if not self.responses:
            raise AssertionError(
                f"FakeLLM script exhausted after {len(self.calls)} chat_with_tools call(s) — "
                "the code under test made more LLM calls than the test scripted."
            )
        item = self.responses.pop(0)
        if callable(item) and not isinstance(item, LLMResponse):
            item = item()
        if isinstance(item, BaseException):
            raise item
        # Compliant-provider behavior: stamp execution provenance from the
        # values the request "carried" (model override else configured
        # model), exactly like the real providers. Scripted responses that
        # set their own provenance win — never overwrite a non-empty stamp.
        if isinstance(item, LLMResponse) and not item.provenance_model:
            item.provenance_provider = "fake"
            item.provenance_model = kwargs.get("model") or self.model
            item.provenance_reasoning_effort = kwargs.get("reasoning_effort")
        return item

    async def chat(self, messages: list, system: str = "", **kwargs) -> str:
        self.chat_calls.append(
            {
                "messages": copy.deepcopy(messages),
                "system": system,
                "kwargs": dict(kwargs),
            }
        )
        if not self.chat_responses:
            # The completion classifier calls chat() after every tool-using
            # turn and swallows exceptions (fail-open) — a strict exhaustion
            # error here would be silently eaten. Default to "COMPLETE" so
            # unrelated tests don't have to script the classifier; tests that
            # characterize the classifier script chat_responses explicitly.
            return "COMPLETE"
        item = self.chat_responses.pop(0)
        if callable(item) and not isinstance(item, str):
            item = item()
        if isinstance(item, BaseException):
            raise item
        return item

    async def close(self) -> None:  # provider contract
        return None

    # -- assertion helpers -------------------------------------------------

    @property
    def exhausted(self) -> bool:
        return not self.responses and not self.chat_responses

    def messages_of_call(self, index: int) -> list:
        """The deep-copied message list the given chat_with_tools call received."""
        return self.calls[index]["messages"]

    def developer_messages_of_call(self, index: int) -> list[str]:
        """Contents of role=developer messages in the given call, in order."""
        return [
            m["content"]
            for m in self.calls[index]["messages"]
            if isinstance(m, dict)
            and m.get("role") == "developer"
            and isinstance(m.get("content"), str)
        ]
