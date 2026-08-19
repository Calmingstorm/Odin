"""Typed LLM provider errors.

Classified from structured provider signals (SSE error events, HTTP status
exhaustion) instead of leaving every failure a bare ``RuntimeError`` string.
The recovery layer keys its retry/fast-fail decision on these types; the
subsystem guard and circuit breakers key their counting on them.

Compatibility constraints (both load-bearing):

- Every class subclasses ``RuntimeError``: legacy consumers catching
  ``RuntimeError``/``Exception`` keep working, and message text keeps the
  provider's bounded shape.
- ``retry_after`` is a plain attribute (``float | None``) because two
  consumers discover it by duck typing (``hasattr(err, "retry_after")``):
  ``src/agents/manager.py`` and ``src/tools/autonomous_loop.py``.

Only whitelisted, safe fields ride on the exception: ``provider``,
``model``, ``retry_after``, ``code`` (the provider's structured error code,
e.g. ``context_length_exceeded`` — consumers key recovery decisions on it
instead of substring-matching message text). Raise sites never embed raw
response bytes in the message: HTTP-status branches embed a bounded,
structure-aware descriptor (status + token-validated MIME + byte count
for edge-shaped bodies; sanitized known JSON error fields for structured
ones — see ``openai_codex._describe_error_body``), and SSE terminal
events get the same known-field treatment (``CodexStreamError``), so no
LLMError message ever carries an HTML fragment. User-facing presentation
still goes through ``format_user_facing_error`` at the boundary —
defense in depth, never single-layer.
"""

from __future__ import annotations


class LLMError(RuntimeError):
    """Base for typed LLM provider failures.

    ``retryable`` documents the default recovery treatment; the recovery
    policy makes the actual decision by isinstance checks so subclasses
    stay the single source of truth.
    """

    retryable: bool = False

    def __init__(
        self,
        message: str,
        *,
        provider: str | None = None,
        model: str | None = None,
        retry_after: float | None = None,
        code: str | None = None,
        server_input_tokens: int | None = None,
        account_key: str | None = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.model = model
        self.retry_after = retry_after
        self.code = code
        # Provider-truth evidence (context-budget campaign phase 2): the
        # server-authoritative input count from an authoritative failure
        # event when present (never a client estimate), and the opaque
        # installation-local key of the account that served the failing
        # attempt (never a raw identifier). A rejection without
        # authoritative usage is an occurrence, not a numeric bound.
        self.server_input_tokens = server_input_tokens
        self.account_key = account_key


class LLMCapacityError(LLMError):
    """The model tier is out of capacity (e.g. ``server_is_overloaded``).

    Model-scoped: every account sees the same failure, so account rotation
    must never be triggered by this class. Retryable — the deadline-based
    recovery policy owns the wait; it counts once per failed logical
    generation toward the model-scoped breaker.
    """

    retryable = True


class LLMRateLimitError(LLMError):
    """Account quota exhausted (HTTP 429) after internal rotation ran out.

    Account-scoped. The provider client has already marked accounts limited
    and rotated through the pool by the time this is raised, so the outer
    recovery policy FAST-FAILS it — spending the recovery budget cycling
    accounts already marked limited would change quota semantics.
    """

    retryable = False


class LLMTransportError(LLMError):
    """Connection/stream transport failure after the client's own retries."""

    retryable = True


class LLMAuthError(LLMError):
    """Authentication failed with no healthy account left. Fast-fail."""

    retryable = False


class LLMRequestError(LLMError):
    """The request itself is invalid (bad model, malformed input). Fast-fail."""

    retryable = False
