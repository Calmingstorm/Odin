"""Provider fallback and probe ownership without transport calls."""
import asyncio
from contextlib import asynccontextmanager

import pytest

from src.llm.auxiliary import AuxiliaryLLMClient
from src.llm.circuit_breaker import CircuitBreaker, CircuitOpenError
from src.llm.errors import LLMIncompleteResponseError


class Transport:
    def __init__(self, model, outcome):
        self.model = model
        self.outcome = outcome
        self.requests = []
        self.leases = 0
        self.breaker = CircuitBreaker(model)

    @asynccontextmanager
    async def generation_lease(self):
        self.leases += 1
        try:
            yield
        finally:
            self.leases -= 1

    async def chat(self, messages, system, **kwargs):
        assert self.leases == 1
        self.requests.append((messages, system, kwargs))
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


async def test_aux_partial_generation_propagates_without_primary_retry():
    error = LLMIncompleteResponseError("accepted partial generation")
    aux = Transport("aux", error)
    primary = Transport("primary", "must not run")
    wrapper = AuxiliaryLLMClient(aux, primary)
    with pytest.raises(LLMIncompleteResponseError) as caught:
        await wrapper.chat([{"role": "user", "content": "fixture"}], "system", task="reflection")
    assert caught.value is error
    assert len(aux.requests) == 1
    assert primary.requests == []
    assert aux.leases == primary.leases == wrapper._inflight == 0
    assert wrapper._idle.is_set()
    assert wrapper._aux_calls == wrapper._fallback_calls == 0


async def test_aux_fallback_uses_captured_main_model_not_transport_default():
    aux = Transport("aux", RuntimeError("fixture transient failure"))
    primary = Transport("transport-default", "fallback answer")
    wrapper = AuxiliaryLLMClient(aux, primary, primary_model="selected-main")
    result = await wrapper.chat([], "system", task="compaction", max_tokens=123)
    assert result == "fallback answer"
    assert primary.requests == [([], "system", {"max_tokens": 123, "model": "selected-main"})]
    assert wrapper._fallback_calls == 1
    assert aux.leases == primary.leases == wrapper._inflight == 0


@pytest.mark.parametrize("late_result", ["success", "failure"])
async def test_late_closed_generation_cannot_settle_another_tasks_recovery_probe(
    monkeypatch, late_result
):
    clock = [0.0]
    monkeypatch.setattr("src.llm.circuit_breaker.time.monotonic", lambda: clock[0])
    breaker = CircuitBreaker("fixture", failure_threshold=1, recovery_timeout=10)
    late_ready, late_finish = asyncio.Event(), asyncio.Event()

    async def late_request():
        breaker.check()
        late_ready.set()
        await late_finish.wait()
        if late_result == "success":
            breaker.record_success()
        else:
            breaker.record_failure()

    late = asyncio.create_task(late_request())
    await late_ready.wait()
    breaker.record_failure()
    clock[0] = 11
    breaker.check()
    owner = breaker._probe_owner
    late_finish.set()
    await late
    assert breaker.state == "half_open"
    assert breaker._probe_owner is owner
    assert breaker._failure_count == 1
    assert breaker._last_failure_time == 0
    with pytest.raises(CircuitOpenError):
        breaker.check()
    breaker.record_success()
    assert breaker.state == "closed"
    assert breaker._probe_owner is None
    breaker.check()


def test_half_open_without_owner_remains_fail_closed():
    # Defensive state guard: even an inconsistent/restored internal state must
    # not admit an unowned second recovery request.
    breaker = CircuitBreaker("fixture", recovery_timeout=15)
    breaker._state = "half_open"
    with pytest.raises(CircuitOpenError) as caught:
        breaker.check()
    assert caught.value.provider == "fixture"
    assert caught.value.retry_after == 15
    assert breaker._probe_owner is None
