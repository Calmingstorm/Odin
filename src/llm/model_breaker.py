"""Model-scoped capacity breakers.

Capacity exhaustion (``server_is_overloaded``) is a property of a MODEL
TIER, not of an account or a client instance: every account sees the same
failure, and rebuilding a client on live reload does not change upstream
capacity. So capacity admission gets its own breaker, keyed by
``provider:effective-model`` and owned by a registry that lives in
``BotServices`` — client rebuilds and live reloads never reset it.

Differences from ``CircuitBreaker`` (which keeps its per-client role for
transport/auth/429 counting):

- **Counted per failed logical generation**, not per HTTP attempt. The
  recovery layer calls :meth:`ModelCapacityBreaker.record_generation_failure`
  exactly once when a whole generation's recovery budget is exhausted.
- **True single-probe half-open.** When the cooldown elapses, exactly one
  caller is admitted as the probe; everyone else keeps waiting until the
  probe resolves. (``CircuitBreaker.check()`` lets every concurrent caller
  through after the timeout — documented gap.)
- **Adaptive cooldown.** Consecutive opens double the cooldown up to a cap,
  so a long outage probes progressively less often; any success resets it.

Thread-safe; methods are cheap and callable from async code without
awaiting. Waiters poll — the registry deliberately has no cross-event-loop
signalling.
"""

from __future__ import annotations

import threading
import time

from ..odin_log import get_logger

log = get_logger("model_breaker")

DEFAULT_GENERATION_THRESHOLD = 1
DEFAULT_COOLDOWN_BASE = 30.0
DEFAULT_COOLDOWN_CAP = 300.0

# How soon a waiter should poll again while another caller holds the probe.
_PROBE_PENDING_WAIT = 5.0


class AdmissionToken:
    """Opaque admission handle returned by :meth:`acquire_attempt`.

    Resolution methods take the token so only the caller that actually holds
    the probe slot can escalate or release it — a concurrent non-probe
    failure (admitted earlier, while the breaker was still closed) must
    never resolve someone else's probe.
    """

    __slots__ = ()


class ModelCapacityBreaker:
    """Capacity breaker for one ``provider:model`` pair."""

    def __init__(
        self,
        name: str,
        *,
        generation_threshold: int = DEFAULT_GENERATION_THRESHOLD,
        cooldown_base: float = DEFAULT_COOLDOWN_BASE,
        cooldown_cap: float = DEFAULT_COOLDOWN_CAP,
    ) -> None:
        self.name = name
        self.generation_threshold = max(1, generation_threshold)
        self.cooldown_base = max(1.0, cooldown_base)
        self.cooldown_cap = max(self.cooldown_base, cooldown_cap)
        self._open = False
        self._probe_token: AdmissionToken | None = None
        self._failed_generations = 0
        self._consecutive_opens = 0
        self._opened_at = 0.0
        self._lock = threading.Lock()

    # -- introspection -------------------------------------------------

    @property
    def state(self) -> str:
        with self._lock:
            if not self._open:
                return "closed"
            return "probing" if self._probe_token is not None else "open"

    @property
    def is_closed(self) -> bool:
        with self._lock:
            return not self._open

    def _current_cooldown(self) -> float:
        # Lock held by caller. First open waits cooldown_base, each
        # consecutive re-open doubles it up to the cap.
        exponent = max(0, self._consecutive_opens - 1)
        return min(self.cooldown_cap, self.cooldown_base * (2.0**exponent))

    def snapshot(self) -> dict:
        with self._lock:
            cooldown = self._current_cooldown() if self._open else 0.0
            elapsed = time.monotonic() - self._opened_at if self._open else 0.0
            remaining = max(0.0, cooldown - elapsed) if self._open else 0.0
            return {
                "name": self.name,
                "state": (
                    "closed"
                    if not self._open
                    else ("probing" if self._probe_token is not None else "open")
                ),
                "failed_generations": self._failed_generations,
                "consecutive_opens": self._consecutive_opens,
                "cooldown_seconds": cooldown,
                # Pure observation: an elapsed cooldown makes the breaker
                # probe-ELIGIBLE, but only acquire_attempt() ever claims the
                # probe slot — a snapshot must never fabricate "probing".
                "cooldown_remaining_seconds": remaining,
                "probe_eligible": bool(
                    self._open and remaining <= 0.0 and self._probe_token is None
                ),
            }

    # -- attempt admission ---------------------------------------------

    def acquire_attempt(self) -> AdmissionToken | float:
        """Ask to make one attempt against the model.

        Returns an :class:`AdmissionToken` when admitted — either the
        breaker is closed, or the cooldown has elapsed and THIS caller now
        holds the single probe slot. The caller must resolve every admitted
        attempt with exactly one of :meth:`attempt_succeeded`,
        :meth:`attempt_failed_capacity`, or :meth:`abandon`, passing the
        token back. Returns a positive number of seconds to wait otherwise.
        """
        with self._lock:
            if not self._open:
                return AdmissionToken()
            elapsed = time.monotonic() - self._opened_at
            cooldown = self._current_cooldown()
            if elapsed < cooldown:
                return max(0.1, cooldown - elapsed)
            if self._probe_token is not None:
                return _PROBE_PENDING_WAIT
            token = AdmissionToken()
            self._probe_token = token
            log.info("Model breaker %s: admitting half-open probe", self.name)
            return token

    def attempt_succeeded(self, token: AdmissionToken) -> None:
        """Any successful generation attempt: close and reset everything."""
        with self._lock:
            was_open = self._open
            self._open = False
            if self._probe_token is token:
                self._probe_token = None
            self._failed_generations = 0
            self._consecutive_opens = 0
        if was_open:
            log.info("Model breaker %s: attempt succeeded — closed", self.name)

    def attempt_failed_capacity(self, token: AdmissionToken) -> None:
        """A capacity failure on one admitted attempt.

        Does NOT count toward generation failures (the recovery layer owns
        that). Its job is probe resolution: a failed PROBE re-opens with an
        escalated cooldown. A non-probe admission (granted while the breaker
        was still closed) resolves as a no-op here.
        """
        with self._lock:
            if self._open and self._probe_token is token:
                self._probe_token = None
                self._consecutive_opens += 1
                self._opened_at = time.monotonic()
                log.info(
                    "Model breaker %s: probe failed — cooldown now %.0fs",
                    self.name,
                    self._current_cooldown(),
                )

    def abandon(self, token: AdmissionToken) -> None:
        """The admitted attempt ended without a capacity verdict.

        Covers cancellation and non-capacity failures (auth, transport,
        request errors say nothing about model capacity). Releases the probe
        slot without escalating — the cooldown that admitted the probe has
        already elapsed, so the next caller may probe immediately.
        """
        with self._lock:
            if self._probe_token is token:
                self._probe_token = None

    # -- generation-level counting -------------------------------------

    def record_generation_failure(self) -> None:
        """One whole logical generation exhausted its recovery budget."""
        with self._lock:
            self._failed_generations += 1
            if not self._open and self._failed_generations >= self.generation_threshold:
                self._open = True
                self._probe_token = None
                self._consecutive_opens += 1
                self._opened_at = time.monotonic()
                log.warning(
                    "Model breaker %s: OPEN after %d failed generation(s) "
                    "(cooldown %.0fs)",
                    self.name,
                    self._failed_generations,
                    self._current_cooldown(),
                )


class ModelBreakerRegistry:
    """Get-or-create registry of :class:`ModelCapacityBreaker` by key.

    Owned by ``BotServices`` so breaker state survives provider client
    rebuilds and live config reloads. Keys are ``f"{provider}:{model}"`` —
    always the EFFECTIVE model of the request (per-request overrides
    included), per the round-3 clarification.
    """

    def __init__(
        self,
        *,
        generation_threshold: int = DEFAULT_GENERATION_THRESHOLD,
        cooldown_base: float = DEFAULT_COOLDOWN_BASE,
        cooldown_cap: float = DEFAULT_COOLDOWN_CAP,
    ) -> None:
        self._generation_threshold = generation_threshold
        self._cooldown_base = cooldown_base
        self._cooldown_cap = cooldown_cap
        self._breakers: dict[str, ModelCapacityBreaker] = {}
        self._lock = threading.Lock()

    def for_model(self, provider: str, model: str) -> ModelCapacityBreaker:
        key = f"{provider or 'unknown'}:{model or 'unknown'}"
        with self._lock:
            breaker = self._breakers.get(key)
            if breaker is None:
                breaker = ModelCapacityBreaker(
                    key,
                    generation_threshold=self._generation_threshold,
                    cooldown_base=self._cooldown_base,
                    cooldown_cap=self._cooldown_cap,
                )
                self._breakers[key] = breaker
            return breaker

    def snapshot(self) -> dict[str, dict]:
        with self._lock:
            breakers = dict(self._breakers)
        return {key: breaker.snapshot() for key, breaker in breakers.items()}
