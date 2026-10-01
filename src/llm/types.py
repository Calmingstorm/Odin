"""Backend-agnostic types for LLM responses with tool calling."""

from __future__ import annotations

from dataclasses import dataclass, field

from .tool_replay import CodexReplay, ReplayCarrier


class ChatText(str):
    """String-compatible direct reply carrying result-scoped accounting facts.

    ``reasoning_tokens`` is a provider-reported subset of output, not an
    extra output charge. Missing/malformed reports remain None, never zero.
    ``input_tokens``/``output_tokens`` retain legacy provider semantics;
    consumers prefer the separate authoritative server counts when present.
    ``duration_ms`` covers the logical generation (including internal retries).
    """

    model: str
    input_tokens: int
    output_tokens: int
    reasoning_tokens: int | None
    server_input_tokens: int | None
    server_output_tokens: int | None
    cached_tokens: int | None
    cache_write_tokens: int | None
    actual_cost_usd: float | None
    duration_ms: int
    provenance_provider: str
    provenance_model: str
    provenance_reasoning_effort: str | None
    provenance_upstream_provider: str | None
    input_token_provenance: str
    output_token_provenance: str
    estimated_input_tokens: int | None
    account_key: str | None

    def __new__(
        cls, text: str, *, model: str, input_tokens: int, output_tokens: int,
        reasoning_tokens: int | None = None,
        server_input_tokens: int | None = None,
        server_output_tokens: int | None = None,
        cached_tokens: int | None = None,
        cache_write_tokens: int | None = None,
        actual_cost_usd: float | None = None,
        duration_ms: int = 0,
        provenance_provider: str = "",
        provenance_model: str = "",
        provenance_reasoning_effort: str | None = None,
        provenance_upstream_provider: str | None = None,
        input_token_provenance: str = "",
        output_token_provenance: str = "",
        estimated_input_tokens: int | None = None,
        account_key: str | None = None,
    ):
        value = super().__new__(cls, text)
        value.model = model
        value.input_tokens = input_tokens
        value.output_tokens = output_tokens
        value.reasoning_tokens = reasoning_tokens
        value.server_input_tokens = server_input_tokens
        value.server_output_tokens = server_output_tokens
        value.cached_tokens = cached_tokens
        value.cache_write_tokens = cache_write_tokens
        value.actual_cost_usd = actual_cost_usd
        value.duration_ms = duration_ms
        value.provenance_provider = provenance_provider
        value.provenance_model = provenance_model
        value.provenance_reasoning_effort = provenance_reasoning_effort
        value.provenance_upstream_provider = provenance_upstream_provider
        value.input_token_provenance = input_token_provenance
        value.output_token_provenance = output_token_provenance
        value.estimated_input_tokens = estimated_input_tokens
        value.account_key = account_key
        return value

    @classmethod
    def from_response(cls, response: LLMResponse, *, model: str) -> ChatText:
        """Copy accounting without changing legacy estimate semantics.

        Counts belong to this result, never the provider's mutable last-call
        counters. Authoritative server counts remain separate from estimates.
        """
        return cls(response.text, model=model, **{
            name: getattr(response, name) for name in (
                "input_tokens", "output_tokens", "reasoning_tokens",
                "server_input_tokens", "server_output_tokens", "cached_tokens",
                "cache_write_tokens", "actual_cost_usd", "duration_ms",
                "provenance_provider", "provenance_model",
                "provenance_reasoning_effort", "provenance_upstream_provider",
                "input_token_provenance", "output_token_provenance",
                "estimated_input_tokens", "account_key",
            )
        })


@dataclass(slots=True, init=False)
class ToolCall(ReplayCarrier):
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

    def __init__(
        self, id: str, name: str, input: dict, parse_error: str | None = None,
        codex_replay: CodexReplay | None = None,
    ):
        self.id = id
        self.name = name
        self.input = input
        self.parse_error = parse_error
        # Inherited non-dataclass slot: neither repr nor asdict can expose it.
        self._set_codex_replay(codex_replay)


@dataclass(slots=True)
class LLMResponse:
    """Normalized response from any LLM backend.

    Unifies LLM backend responses into a single structure that
    the tool loop can consume.
    """

    text: str = ""
    # Opaque provider reasoning, retained only by an explicit profile policy.
    reasoning_content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    stop_reason: str = "end_turn"  # "end_turn" or "tool_use"
    input_tokens: int = 0
    output_tokens: int = 0
    duration_ms: int = 0  # accepted logical generation; excludes tools
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
    # OpenRouter's actual routed upstream. Distinct from provenance_provider,
    # which remains Odin's configured compatible lane.
    provenance_upstream_provider: str | None = None
    # Server-authoritative accepted input, parsed strictly from the provider's
    # usage echo (absent/malformed ⇒ None). NEVER derived from the client
    # estimate above — the observer refuses estimates; ``input_tokens`` keeps
    # its historical estimate meaning untouched.
    server_input_tokens: int | None = None
    # Server-authoritative accepted output, when the provider reports it.
    # Kept separate from ``output_tokens``, whose historical meaning includes
    # estimates on providers that do not echo usage.
    server_output_tokens: int | None = None
    # Explicit provenance for the normalized estimate fields.  Empty keeps old
    # provider/test construction source-compatible and resolves to unknown.
    estimated_input_tokens: int | None = None
    input_token_provenance: str = ""
    output_token_provenance: str = ""
    # Opaque installation-local key of the account that served THIS attempt
    # (HMAC over the stable non-secret account id — never a raw identifier).
    # None when no stable account identity or key material exists; such
    # attempts are disqualified from account-scoped evidence.
    account_key: str | None = None
    # Prompt-cache attribution from the provider's usage echo
    # (``usage.input_tokens_details.cached_tokens`` / ``cache_write_tokens``),
    # strictly parsed.  These are SUBSETS of the accepted input, never added
    # to totals; None = the provider reported nothing (distinct from 0).
    cached_tokens: int | None = None
    cache_write_tokens: int | None = None
    # Provider-reported actual request cost. None on providers that do not
    # return real-money usage; never synthesized from Codex rates.
    actual_cost_usd: float | None = None
    # Reported subset of output tokens, not additional billed output.
    reasoning_tokens: int | None = None

    @property
    def is_tool_use(self) -> bool:
        return self.stop_reason == "tool_use" or len(self.tool_calls) > 0
