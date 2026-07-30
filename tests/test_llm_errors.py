"""Pins for the typed LLM error hierarchy (src/llm/errors.py).

The compatibility contracts here are load-bearing:
- RuntimeError subclassing keeps every legacy `except RuntimeError` working.
- `.retry_after` as a plain attribute keeps the two duck-typed consumers
  (agents/manager.py, tools/autonomous_loop.py) working unchanged.
"""

from __future__ import annotations

import pytest

from src.llm import (
    LLMAuthError,
    LLMCapacityError,
    LLMError,
    LLMRateLimitError,
    LLMRequestError,
    LLMTransportError,
)

ALL_TYPES = [
    LLMCapacityError,
    LLMRateLimitError,
    LLMTransportError,
    LLMAuthError,
    LLMRequestError,
]


@pytest.mark.parametrize("exc_type", ALL_TYPES)
def test_every_type_is_runtimeerror_and_llmerror(exc_type):
    err = exc_type("boom")
    assert isinstance(err, RuntimeError)
    assert isinstance(err, LLMError)
    assert str(err) == "boom"


@pytest.mark.parametrize("exc_type", ALL_TYPES)
def test_retry_after_duck_typing_contract(exc_type):
    # hasattr must be True even when unset — consumers read it after hasattr().
    bare = exc_type("x")
    assert hasattr(bare, "retry_after")
    assert bare.retry_after is None

    carrying = exc_type("x", retry_after=12.5)
    assert carrying.retry_after == 12.5


@pytest.mark.parametrize("exc_type", ALL_TYPES)
def test_whitelisted_fields_default_none(exc_type):
    err = exc_type("x")
    assert err.provider is None
    assert err.model is None

    stamped = exc_type("x", provider="codex", model="gpt-5.6-sol")
    assert stamped.provider == "codex"
    assert stamped.model == "gpt-5.6-sol"


def test_retryable_classification():
    assert LLMCapacityError.retryable is True
    assert LLMTransportError.retryable is True
    # Rate-limit is deliberately NOT retryable at the recovery layer: the
    # client has already rotated accounts by the time it raises (round-3
    # clarification — quota semantics must remain exactly today's).
    assert LLMRateLimitError.retryable is False
    assert LLMAuthError.retryable is False
    assert LLMRequestError.retryable is False
    assert LLMError.retryable is False


def test_base_llmerror_catches_all_subtypes():
    for exc_type in ALL_TYPES:
        with pytest.raises(LLMError):
            raise exc_type("x")


class TestCodexStreamErrorClassification:
    """Pins for _stream_error_from_event / CodexStreamError.is_capacity."""

    # Byte-for-byte the event shape observed in the live journal during the
    # 2026-07-29/30 sol degradation (110 occurrences on 07-30 alone).
    LIVE_OVERLOAD_EVENT = {
        "type": "error",
        "error": {
            "type": "service_unavailable_error",
            "code": "server_is_overloaded",
            "message": "Our servers are currently overloaded. Please try again later.",
            "param": None,
        },
        "sequence_number": 2,
    }

    def _build(self, event_type, event):
        from src.llm.openai_codex import _stream_error_from_event

        return _stream_error_from_event(event_type, event)

    def test_live_overload_event_classifies_as_capacity(self):
        exc = self._build("error", self.LIVE_OVERLOAD_EVENT)
        assert exc.is_capacity is True
        assert exc.error_type == "service_unavailable_error"
        assert exc.error_code == "server_is_overloaded"
        assert exc.retry_after is None
        # Historical message shape preserved: "{event_type}: {json[:500]}".
        assert str(exc).startswith("error: ")
        assert "server_is_overloaded" in str(exc)

    def test_server_error_code_is_capacity(self):
        exc = self._build("error", {"type": "error", "error": {"code": "server_error"}})
        assert exc.is_capacity is True

    def test_response_failed_nested_error_object(self):
        event = {
            "type": "response.failed",
            "response": {"error": {"type": "service_unavailable_error"}},
        }
        exc = self._build("response.failed", event)
        assert exc.is_capacity is True
        assert str(exc).startswith("response.failed: ")

    def test_non_capacity_error_stays_transport_classified(self):
        event = {"type": "error", "error": {"type": "invalid_request_error", "code": "nope"}}
        exc = self._build("error", event)
        assert exc.is_capacity is False

    def test_absent_error_object_tolerated(self):
        exc = self._build("response.failed", {"type": "response.failed"})
        assert exc.is_capacity is False
        assert exc.error_type is None
        assert exc.error_code is None

    def test_retry_after_numeric_extraction(self):
        event = {"type": "error", "error": {"code": "server_is_overloaded", "retry_after": 30}}
        exc = self._build("error", event)
        assert exc.retry_after == 30.0

        junk = {"type": "error", "error": {"code": "server_is_overloaded", "retry_after": "soon"}}
        assert self._build("error", junk).retry_after is None

    def test_capacity_markers_are_the_settled_set(self):
        from src.llm.openai_codex import _CAPACITY_ERROR_MARKERS

        assert _CAPACITY_ERROR_MARKERS == {
            "service_unavailable_error",
            "server_is_overloaded",
            "server_error",
        }
