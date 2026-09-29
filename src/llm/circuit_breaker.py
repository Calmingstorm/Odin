"""Lightweight circuit breaker for API provider health tracking.

Prevents cascading failures when an API provider is down by failing fast
instead of waiting through retries on every request. After a configurable
number of consecutive failures, the breaker "opens" and rejects requests
immediately for a recovery period, then allows a single probe request to
check if the provider has recovered.

States:
- closed: Requests flow normally. Failures increment a counter.
- open: Requests fail immediately with CircuitOpenError. Transitions to
  half_open after recovery_timeout seconds.
- half_open: One probe request is allowed through. Success → closed,
  failure → open (with reset recovery timer).
"""
from __future__ import annotations

import asyncio
import threading
import time
from functools import wraps


def breaker_call(method):
    """Settle probe ownership even when a transport is cancelled or rejects locally."""
    @wraps(method)
    async def call(self, *args, **kwargs):
        self.breaker.check()
        try:
            return await method(self, *args, **kwargs)
        finally:
            self.breaker.abandon()
    return call


def _caller():
    try:
        return asyncio.current_task() or threading.current_thread()
    except RuntimeError:
        return threading.current_thread()


class CircuitOpenError(Exception):
    """Raised when a circuit breaker is open and requests should not be attempted."""

    def __init__(self, provider: str, retry_after: float, model: str | None = None) -> None:
        self.provider = provider
        self.retry_after = retry_after
        # Optional effective-model stamp for model-scoped diagnostics;
        # existing two-arg raise sites are unchanged.
        self.model = model
        super().__init__(
            f"{provider} is temporarily unavailable (retry in {retry_after:.0f}s)"
        )


class CircuitBreaker:
    """Simple circuit breaker for API provider health tracking.

    Thread-safe: state mutations are protected by a lock so that concurrent
    callers of record_success/record_failure do not race.

    Parameters
    ----------
    name : str
        Human-readable provider name (e.g. "codex_api").
    failure_threshold : int
        Consecutive failures before the breaker opens. Default 3.
    recovery_timeout : float
        Seconds to wait in open state before allowing a probe. Default 60.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        recovery_timeout: float = 60.0,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failure_count = 0
        self._last_failure_time = 0.0
        self._state = "closed"
        self._probe_owner = None
        self._lock = threading.Lock()

    @property
    def state(self) -> str:
        """Current breaker state, accounting for recovery timeout expiry."""
        with self._lock:
            if self._state == "open":
                if time.monotonic() - self._last_failure_time >= self.recovery_timeout:
                    return "half_open"
            return self._state

    def check(self) -> None:
        """Raise CircuitOpenError if the breaker is open.

        Call before making an API request. Does nothing when closed or
        half_open (allowing a probe request through).
        """
        with self._lock:
            current = self._state
            if self._probe_owner is not None:
                raise CircuitOpenError(self.name, self.recovery_timeout)
            if current == "open":
                elapsed = time.monotonic() - self._last_failure_time
                if elapsed < self.recovery_timeout:
                    remaining = self.recovery_timeout - elapsed
                    raise CircuitOpenError(self.name, max(0.0, remaining))
                self._state = "half_open"
                self._probe_owner = _caller()
            elif current == "half_open":
                raise CircuitOpenError(self.name, self.recovery_timeout)

    def abandon(self) -> None:
        """Release only this caller's probe, without counting a provider failure."""
        with self._lock:
            if self._probe_owner is _caller():
                self._probe_owner = None
                if self._state == "half_open":
                    self._state = "open"  # elapsed timer allows the next probe immediately

    def record_success(self) -> None:
        """Record a successful API call. Resets failure count, closes breaker."""
        with self._lock:
            if self._probe_owner is not None and self._probe_owner is not _caller():
                return
            self._failure_count = 0
            self._state = "closed"
            self._probe_owner = None

    def record_failure(self) -> None:
        """Record a failed API call. Opens breaker after threshold is reached."""
        with self._lock:
            if self._probe_owner is not None and self._probe_owner is not _caller():
                return
            self._failure_count += 1
            self._last_failure_time = time.monotonic()
            if self._failure_count >= self.failure_threshold:
                self._state = "open"
