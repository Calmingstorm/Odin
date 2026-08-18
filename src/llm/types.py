"""Backend-agnostic types for LLM responses with tool calling."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class ToolCall:
    """A single tool call extracted from an LLM response.

    Works with OpenAI (function_call items) and internal tool_use blocks.
    """

    id: str  # call_id (OpenAI) or internal tool_use_id
    name: str  # tool name
    input: dict  # parsed tool arguments
    # Set when the model's arguments were not valid JSON. The dispatcher must
    # NOT execute such a call with the empty input — feed the error back to
    # the model instead so it can retry with valid arguments.
    parse_error: str | None = None


@dataclass(slots=True)
class LLMResponse:
    """Normalized response from any LLM backend.

    Unifies LLM backend responses into a single structure that
    the tool loop can consume.
    """

    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    stop_reason: str = "end_turn"  # "end_turn" or "tool_use"
    input_tokens: int = 0
    output_tokens: int = 0
    # Execution provenance: the frozen provider identity and the serialized
    # model/effort of the successful outbound request. Providers stamp these
    # from the SAME pre-await locals the request body was built from — the
    # only layer that stays truthful across gateway routing, retries, and
    # live config reloads. Empty/None = unknown; consumers must record it as
    # unknown, never substitute a call-site guess. reasoning_effort None
    # means "not sent/not applicable" — distinct from the literal Codex
    # effort string "none".
    provenance_provider: str = ""
    provenance_model: str = ""
    provenance_reasoning_effort: str | None = None
    # Server-authoritative accepted input, parsed strictly from the provider's
    # usage echo (absent/malformed ⇒ None). NEVER derived from the client
    # estimate above — the observer refuses estimates; ``input_tokens`` keeps
    # its historical estimate meaning untouched.
    server_input_tokens: int | None = None
    # Opaque installation-local key of the account that served THIS attempt
    # (HMAC over the stable non-secret account id — never a raw identifier).
    # None when no stable account identity or key material exists; such
    # attempts are disqualified from account-scoped evidence.
    account_key: str | None = None

    @property
    def is_tool_use(self) -> bool:
        return self.stop_reason == "tool_use" or len(self.tool_calls) > 0
