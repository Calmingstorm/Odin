"""Deadline-based recovery for logical LLM generations.

THE shared retry policy across chat, agents, and autonomous loops — one
implementation replacing the three divergent ones (tool_loop's
CircuitOpenError-only sleep-and-retry, the agents' bare-``except`` double
attempt, the loop manager's consecutive-error counter feeding).

Design rules (settled with Odin, 2026-07-30):

- **A monotonic DEADLINE, never an attempt count.** Default five minutes per
  logical generation. Callers resuming a persisted turn pass the remaining
  budget (computed from the checkpoint's UTC deadline) via
  ``deadline_seconds`` — a restart must not grant a fresh five minutes.
  The budget bounds WAITING between attempts, deliberately NOT an in-flight
  attempt: healthy xhigh generations legitimately stream >10 minutes, and
  killing them at a recovery wall is exactly the v3.58.2 disease
  (hardcoded 600s total killing healthy generations). In-flight attempts
  are bounded by the client's own transport limits (request_timeout /
  stream_stall_timeout) and are cancellable via ``cancel_event`` at any
  moment (/stop interrupts the await itself, not just the sleeps).
- **Retryable**: ``LLMCapacityError``, ``LLMTransportError``, and
  ``CircuitOpenError`` (the client breaker — recovery waits THROUGH it
  rather than treating it as terminal). Full-jitter backoff capped at
  ``backoff_cap``; a server-suggested ``retry_after`` is honoured as a floor
  (clamped to ``retry_after_cap``), and every wait is bounded by the
  remaining budget.
- **Fast-fail**: ``LLMAuthError``, ``LLMRequestError``, and
  ``LLMRateLimitError`` — rate-limit is deliberate: by the time the client
  raises it, internal account rotation is already exhausted, and cycling
  limited accounts for five minutes would change quota semantics.
- **No bare ``except``**: an unclassified exception is a programming defect
  and escapes immediately (retrying defects was the agents-path bug — fixed
  here, not spread).
- **Model-breaker discipline**: one admission per attempt via the
  token-resolution protocol; exactly ONE ``record_generation_failure`` when
  the whole generation exhausts on capacity. Non-capacity outcomes abandon
  the probe without escalating.
- **Cancellable**: waits race the caller's cancel event; cancellation
  propagates as ``asyncio.CancelledError`` and always releases a held probe.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypeVar

from ..odin_log import get_logger
from .backoff import compute_backoff
from .circuit_breaker import CircuitOpenError
from .errors import (
    LLMAuthError,
    LLMCapacityError,
    LLMRateLimitError,
    LLMRequestError,
    LLMTransportError,
)
from .model_breaker import AdmissionToken, ModelCapacityBreaker

log = get_logger("llm_recovery")

T = TypeVar("T")

DEFAULT_GENERATION_DEADLINE = 300.0
DEFAULT_BACKOFF_BASE = 1.0
DEFAULT_BACKOFF_CAP = 45.0
# Precedent: every existing consumer clamps a server-suggested retry_after
# to 90s (tool_loop, agents/manager, autonomous_loop).
DEFAULT_RETRY_AFTER_CAP = 90.0


@dataclass(frozen=True)
class RecoveryPolicy:
    """Knobs for one recovery run; config-backed via ``llm_recovery:``."""

    deadline_seconds: float = DEFAULT_GENERATION_DEADLINE
    backoff_base: float = DEFAULT_BACKOFF_BASE
    backoff_cap: float = DEFAULT_BACKOFF_CAP
    retry_after_cap: float = DEFAULT_RETRY_AFTER_CAP


def _check_cancel(cancel_event: asyncio.Event | None) -> None:
    if cancel_event is not None and cancel_event.is_set():
        raise asyncio.CancelledError("cancelled during LLM recovery")


async def _sleep_cancellable(seconds: float, cancel_event: asyncio.Event | None) -> None:
    """Sleep, waking immediately (as CancelledError) if the event fires."""
    if seconds <= 0:
        return
    if cancel_event is None:
        await asyncio.sleep(seconds)
        return
    try:
        await asyncio.wait_for(cancel_event.wait(), timeout=seconds)
    except TimeoutError:
        return
    raise asyncio.CancelledError("cancelled during LLM recovery wait")


async def _attempt_cancellable(
    attempt: Callable[[], Awaitable[T]], cancel_event: asyncio.Event | None
) -> T:
    """Run one attempt racing the caller's cancel event.

    /stop must interrupt an IN-FLIGHT provider await, not only the waits
    between attempts (review blocker #3, PR #242). On cancellation the
    attempt task is cancelled and awaited — aiohttp unwinds its transport
    cleanly — before CancelledError propagates to the caller (which
    releases any held breaker probe).
    """
    if cancel_event is None:
        return await attempt()
    attempt_task = asyncio.ensure_future(attempt())
    cancel_task = asyncio.ensure_future(cancel_event.wait())
    try:
        done, _ = await asyncio.wait(
            {attempt_task, cancel_task}, return_when=asyncio.FIRST_COMPLETED
        )
        if attempt_task in done:
            return attempt_task.result()
        raise asyncio.CancelledError("cancelled during LLM attempt")
    finally:
        # Cancellation of the RECOVERY OWNER task lands here too (round-2
        # blocker #4, PR #242): both helper tasks — including a still-live
        # provider attempt — must be cancelled AND awaited before control
        # leaves, so shutdown/task-cancellation never orphans an in-flight
        # request while the caller releases its breaker probe.
        for helper in (attempt_task, cancel_task):
            if not helper.done():
                helper.cancel()
            with contextlib.suppress(BaseException):
                await helper


def _notify_wait(
    on_wait: Callable[[float, float, BaseException], None] | None,
    wait: float,
    remaining: float,
    error: BaseException,
) -> None:
    if on_wait is None:
        return
    try:
        on_wait(wait, remaining, error)
    except Exception:  # pragma: no cover - observability hook must not kill recovery
        log.debug("recovery on_wait hook failed", exc_info=True)


async def generate_with_recovery(
    attempt: Callable[[], Awaitable[T]],
    *,
    policy: RecoveryPolicy,
    breaker: ModelCapacityBreaker | None = None,
    deadline_seconds: float | None = None,
    cancel_event: asyncio.Event | None = None,
    on_wait: Callable[[float, float, BaseException], None] | None = None,
    retry_circuit_open: bool = True,
) -> T:
    """Run one logical LLM generation with deadline-based recovery.

    ``attempt`` is called repeatedly until it succeeds, a non-retryable
    error escapes, cancellation fires, or the budget is exhausted — in which
    case the last error is re-raised (after counting one generation failure
    on the model breaker when that error is capacity-class).

    ``retry_circuit_open=False`` makes ``CircuitOpenError`` fast-fail
    instead of being waited through — the autonomous-loop path re-raises it
    to the loop manager, which owns pacing between iterations (pinned
    policy asymmetry).
    """
    budget = policy.deadline_seconds if deadline_seconds is None else deadline_seconds
    deadline = time.monotonic() + max(0.0, budget)
    retry_index = 0
    last_error: BaseException | None = None

    def _exhausted() -> BaseException:
        error = last_error
        if error is None:
            # Budget consumed entirely by breaker-paced waits: capacity is
            # the story even though this generation never got an attempt.
            error = LLMCapacityError(
                "LLM recovery budget exhausted waiting for capacity"
                + (f" ({breaker.name})" if breaker is not None else ""),
            )
        if isinstance(error, LLMCapacityError) and breaker is not None:
            breaker.record_generation_failure()
        return error

    while True:
        _check_cancel(cancel_event)

        # -- model-breaker admission (single-probe pacing while open) --
        token: AdmissionToken | None = None
        if breaker is not None:
            admission = breaker.acquire_attempt()
            while not isinstance(admission, AdmissionToken):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise _exhausted()
                wait = min(float(admission), remaining)
                _notify_wait(
                    on_wait,
                    wait,
                    remaining,
                    last_error
                    or LLMCapacityError(f"model breaker open ({breaker.name})"),
                )
                await _sleep_cancellable(wait, cancel_event)
                _check_cancel(cancel_event)
                admission = breaker.acquire_attempt()
            token = admission

        # -- one attempt (raced against /stop) ------------------------
        try:
            result = await _attempt_cancellable(attempt, cancel_event)
        except asyncio.CancelledError:
            if breaker is not None and token is not None:
                breaker.abandon(token)
            raise
        except LLMCapacityError as exc:
            if breaker is not None and token is not None:
                breaker.attempt_failed_capacity(token)
            last_error = exc
        except (LLMAuthError, LLMRequestError, LLMRateLimitError):
            if breaker is not None and token is not None:
                breaker.abandon(token)
            raise
        except CircuitOpenError as exc:
            if breaker is not None and token is not None:
                breaker.abandon(token)
            if not retry_circuit_open:
                raise
            last_error = exc
        except LLMTransportError as exc:
            if breaker is not None and token is not None:
                breaker.abandon(token)
            last_error = exc
        except Exception:
            # Unclassified = programming defect. Never retried here.
            if breaker is not None and token is not None:
                breaker.abandon(token)
            raise
        else:
            if breaker is not None and token is not None:
                breaker.attempt_succeeded(token)
            return result

        # -- retryable failure: wait within the remaining budget ------
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise _exhausted()
        jitter = compute_backoff(retry_index, policy.backoff_base, policy.backoff_cap)
        suggested = getattr(last_error, "retry_after", None)
        floor = 0.0
        if isinstance(suggested, (int, float)) and suggested > 0:
            floor = min(float(suggested), policy.retry_after_cap)
        wait = min(remaining, max(jitter, floor))
        retry_index += 1
        _notify_wait(on_wait, wait, remaining, last_error)
        await _sleep_cancellable(wait, cancel_event)
