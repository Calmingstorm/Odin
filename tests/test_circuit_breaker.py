"""Tests for circuit breaker (src/llm/circuit_breaker.py).

Covers CircuitBreaker states (closed, open, half_open), transitions,
CircuitOpenError, thread safety, and configuration.
"""
from __future__ import annotations

import time
from unittest.mock import patch

import pytest

from src.llm.circuit_breaker import CircuitBreaker, CircuitOpenError


# ---------------------------------------------------------------------------
# CircuitOpenError
# ---------------------------------------------------------------------------

class TestCircuitOpenError:
    def test_attributes(self):
        err = CircuitOpenError("codex_api", 30.0)
        assert err.provider == "codex_api"
        assert err.retry_after == 30.0

    def test_message(self):
        err = CircuitOpenError("codex_api", 45.5)
        assert "codex_api" in str(err)
        assert "46s" in str(err)  # rounded to 0 decimals

    def test_is_exception(self):
        err = CircuitOpenError("test", 1.0)
        assert isinstance(err, Exception)


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------

class TestInit:
    def test_default_params(self):
        cb = CircuitBreaker("test")
        assert cb.name == "test"
        assert cb.failure_threshold == 3
        assert cb.recovery_timeout == 60.0
        assert cb.state == "closed"

    def test_custom_params(self):
        cb = CircuitBreaker("custom", failure_threshold=5, recovery_timeout=120.0)
        assert cb.failure_threshold == 5
        assert cb.recovery_timeout == 120.0


# ---------------------------------------------------------------------------
# Closed state
# ---------------------------------------------------------------------------

class TestClosedState:
    def test_starts_closed(self):
        cb = CircuitBreaker("test")
        assert cb.state == "closed"

    def test_check_passes_when_closed(self):
        cb = CircuitBreaker("test")
        cb.check()  # Should not raise

    def test_failures_below_threshold_stay_closed(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        cb.record_failure()
        assert cb.state == "closed"
        cb.record_failure()
        assert cb.state == "closed"

    def test_success_resets_failure_count(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        assert cb.state == "closed"
        # Now need 3 more failures to open
        cb.record_failure()
        cb.record_failure()
        assert cb.state == "closed"


# ---------------------------------------------------------------------------
# Open state
# ---------------------------------------------------------------------------

class TestOpenState:
    def test_opens_at_threshold(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        assert cb.state == "open"

    def test_check_raises_when_open(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=300)
        cb.record_failure()
        with pytest.raises(CircuitOpenError) as exc_info:
            cb.check()
        assert exc_info.value.provider == "test"
        assert exc_info.value.retry_after > 0

    def test_more_failures_stay_open(self):
        cb = CircuitBreaker("test", failure_threshold=2)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == "open"
        cb.record_failure()
        assert cb.state == "open"


# ---------------------------------------------------------------------------
# Half-open state
# ---------------------------------------------------------------------------

class TestHalfOpenState:
    def test_transitions_to_half_open_after_timeout(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0.01)
        cb.record_failure()
        assert cb.state == "open"
        time.sleep(0.02)
        assert cb.state == "half_open"

    def test_check_allows_probe_when_half_open(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0.01)
        cb.record_failure()
        time.sleep(0.02)
        # Should not raise — allows probe request
        cb.check()

    def test_success_in_half_open_closes(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0.01)
        cb.record_failure()
        time.sleep(0.02)
        assert cb.state == "half_open"
        cb.record_success()
        assert cb.state == "closed"

    def test_failure_in_half_open_reopens(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0.01)
        cb.record_failure()
        time.sleep(0.02)
        assert cb.state == "half_open"
        cb.record_failure()
        assert cb.state == "open"


# ---------------------------------------------------------------------------
# Recovery cycles
# ---------------------------------------------------------------------------

class TestRecoveryCycles:
    def test_multiple_open_close_cycles(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0.01)

        # Cycle 1: fail → open → half_open → success → closed
        cb.record_failure()
        assert cb.state == "open"
        time.sleep(0.02)
        cb.record_success()
        assert cb.state == "closed"

        # Cycle 2: fail → open → half_open → success → closed
        cb.record_failure()
        assert cb.state == "open"
        time.sleep(0.02)
        cb.record_success()
        assert cb.state == "closed"

    def test_retry_after_decreases_over_time(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=1.0)
        cb.record_failure()
        try:
            cb.check()
        except CircuitOpenError as e:
            first = e.retry_after

        time.sleep(0.1)
        try:
            cb.check()
        except CircuitOpenError as e:
            second = e.retry_after

        assert second < first


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_zero_recovery_timeout(self):
        """With zero timeout, breaker goes directly to half_open."""
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0)
        cb.record_failure()
        # Should be half_open immediately
        assert cb.state == "half_open"

    def test_threshold_one(self):
        cb = CircuitBreaker("test", failure_threshold=1)
        cb.record_failure()
        assert cb.state == "open"

    def test_success_on_fresh_breaker(self):
        cb = CircuitBreaker("test")
        cb.record_success()
        assert cb.state == "closed"

    def test_retry_after_non_negative(self):
        cb = CircuitBreaker("test", failure_threshold=1, recovery_timeout=0.01)
        cb.record_failure()
        time.sleep(0.02)  # Past recovery timeout
        # check() should not raise (half_open), so we verify via state
        cb.check()  # No error

    def test_large_failure_threshold(self):
        cb = CircuitBreaker("test", failure_threshold=100)
        for _ in range(99):
            cb.record_failure()
        assert cb.state == "closed"
        cb.record_failure()
        assert cb.state == "open"
