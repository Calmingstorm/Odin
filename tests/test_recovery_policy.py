"""Pins for the shared deadline-based recovery (src/llm/recovery.py)."""

from __future__ import annotations

import asyncio
import time

import pytest

from src.llm.circuit_breaker import CircuitOpenError
from src.llm.errors import (
    LLMAuthError,
    LLMCapacityError,
    LLMRateLimitError,
    LLMRequestError,
    LLMTransportError,
)
from src.llm.model_breaker import ModelBreakerRegistry
from src.llm.recovery import RecoveryPolicy, generate_with_recovery

FAST = RecoveryPolicy(
    deadline_seconds=0.5, backoff_base=0.01, backoff_cap=0.05, retry_after_cap=0.2
)


def scripted(*outcomes):
    """Attempt callable yielding each outcome in order (exception → raise)."""
    calls = {"n": 0}

    async def attempt():
        idx = min(calls["n"], len(outcomes) - 1)
        calls["n"] += 1
        outcome = outcomes[idx]
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    return attempt, calls


async def test_success_first_try():
    attempt, calls = scripted("ok")
    result = await generate_with_recovery(attempt, policy=FAST)
    assert result == "ok"
    assert calls["n"] == 1


async def test_capacity_then_success_is_recovered():
    attempt, calls = scripted(LLMCapacityError("overloaded"), "ok")
    result = await generate_with_recovery(attempt, policy=FAST)
    assert result == "ok"
    assert calls["n"] == 2


@pytest.mark.parametrize(
    "exc", [LLMTransportError("stream died"), CircuitOpenError("codex_api", 0.01)]
)
async def test_transport_and_client_breaker_are_retryable(exc):
    attempt, calls = scripted(exc, "ok")
    result = await generate_with_recovery(attempt, policy=FAST)
    assert result == "ok"
    assert calls["n"] == 2


async def test_deadline_exhaustion_raises_last_capacity_error():
    attempt, calls = scripted(LLMCapacityError("overloaded"))
    with pytest.raises(LLMCapacityError):
        await generate_with_recovery(attempt, policy=FAST)
    assert calls["n"] >= 2  # kept trying until the budget ran out


async def test_exactly_one_generation_failure_recorded_on_exhaustion():
    registry = ModelBreakerRegistry(cooldown_base=100.0)  # opens, waits are long
    breaker = registry.for_model("codex", "gpt-5.6-sol")
    attempt, calls = scripted(LLMCapacityError("overloaded"))
    with pytest.raises(LLMCapacityError):
        await generate_with_recovery(attempt, policy=FAST, breaker=breaker)
    # Many failed ATTEMPTS, exactly ONE generation failure counted.
    assert calls["n"] >= 2
    assert breaker.snapshot()["failed_generations"] == 1


@pytest.mark.parametrize(
    "exc",
    [
        LLMAuthError("401 no healthy account"),
        LLMRequestError("400 bad model"),
        LLMRateLimitError("429 all accounts limited"),
    ],
)
async def test_fast_fail_classes_escape_immediately(exc):
    registry = ModelBreakerRegistry()
    breaker = registry.for_model("codex", "gpt-5.6-sol")
    attempt, calls = scripted(exc)
    started = time.monotonic()
    with pytest.raises(type(exc)):
        await generate_with_recovery(attempt, policy=FAST, breaker=breaker)
    assert calls["n"] == 1
    assert time.monotonic() - started < 0.2  # no budget spent
    assert breaker.snapshot()["failed_generations"] == 0


async def test_unclassified_exception_is_never_retried():
    # The agents-path bug (bare except retrying programming defects) must
    # not be spread into the shared policy.
    attempt, calls = scripted(ValueError("defect"))
    with pytest.raises(ValueError):
        await generate_with_recovery(attempt, policy=FAST)
    assert calls["n"] == 1


async def test_retry_after_is_honoured_as_wait_floor():
    attempt, _ = scripted(LLMCapacityError("overloaded", retry_after=0.15), "ok")
    started = time.monotonic()
    result = await generate_with_recovery(attempt, policy=FAST)
    assert result == "ok"
    assert time.monotonic() - started >= 0.14


async def test_retry_after_is_capped():
    # A pathological server suggestion must not exceed retry_after_cap.
    attempt, _ = scripted(LLMCapacityError("overloaded", retry_after=500.0), "ok")
    started = time.monotonic()
    result = await generate_with_recovery(attempt, policy=FAST)
    assert result == "ok"
    assert time.monotonic() - started < 0.45  # capped at 0.2, not 500


async def test_zero_budget_gets_one_attempt_then_raises():
    # Restart-with-expired-deadline semantics: the budget bounds WAITING;
    # a single attempt is still made, then the failure surfaces.
    attempt, calls = scripted(LLMCapacityError("overloaded"))
    with pytest.raises(LLMCapacityError):
        await generate_with_recovery(attempt, policy=FAST, deadline_seconds=0.0)
    assert calls["n"] == 1


async def test_cancellation_interrupts_a_long_wait_promptly():
    cancel = asyncio.Event()
    attempt, _ = scripted(LLMCapacityError("overloaded", retry_after=10.0))
    policy = RecoveryPolicy(
        deadline_seconds=30.0, backoff_base=5.0, backoff_cap=10.0, retry_after_cap=10.0
    )

    async def fire_cancel():
        await asyncio.sleep(0.05)
        cancel.set()

    started = time.monotonic()
    canceller = asyncio.create_task(fire_cancel())
    with pytest.raises(asyncio.CancelledError):
        await generate_with_recovery(
            attempt, policy=policy, cancel_event=cancel
        )
    await canceller
    assert time.monotonic() - started < 1.0  # did not sit out the 10s wait


async def test_preset_cancel_prevents_any_attempt():
    cancel = asyncio.Event()
    cancel.set()
    attempt, calls = scripted("ok")
    with pytest.raises(asyncio.CancelledError):
        await generate_with_recovery(attempt, policy=FAST, cancel_event=cancel)
    assert calls["n"] == 0


async def test_open_breaker_is_waited_through_then_probe_succeeds():
    registry = ModelBreakerRegistry(cooldown_base=0.05, cooldown_cap=0.1)
    breaker = registry.for_model("codex", "gpt-5.6-sol")
    breaker.record_generation_failure()  # open
    assert breaker.state == "open"
    attempt, calls = scripted("ok")
    policy = RecoveryPolicy(deadline_seconds=2.0, backoff_base=0.01, backoff_cap=0.05)
    result = await generate_with_recovery(attempt, policy=policy, breaker=breaker)
    assert result == "ok"
    assert calls["n"] == 1
    assert breaker.state == "closed"  # probe success closed it


async def test_budget_consumed_by_breaker_waits_counts_generation_failure():
    registry = ModelBreakerRegistry(cooldown_base=60.0)
    breaker = registry.for_model("codex", "gpt-5.6-sol")
    breaker.record_generation_failure()  # open, cooldown far exceeds budget
    attempt, calls = scripted("ok")
    policy = RecoveryPolicy(deadline_seconds=0.1, backoff_base=0.01, backoff_cap=0.05)
    with pytest.raises(LLMCapacityError):
        await generate_with_recovery(attempt, policy=policy, breaker=breaker)
    assert calls["n"] == 0  # never admitted
    assert breaker.snapshot()["failed_generations"] == 2  # the wait-exhaust counted


async def test_on_wait_hook_is_called_and_fault_tolerant():
    seen = []

    def hook(wait, remaining, error):
        seen.append((wait, remaining, type(error).__name__))
        raise RuntimeError("hook bug must not break recovery")

    attempt, _ = scripted(LLMCapacityError("overloaded"), "ok")
    result = await generate_with_recovery(attempt, policy=FAST, on_wait=hook)
    assert result == "ok"
    assert seen and seen[0][2] == "LLMCapacityError"
