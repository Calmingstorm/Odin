"""Pins for the model-scoped capacity breaker (src/llm/model_breaker.py).

The three properties Odin's design requires, each pinned here:
- counted once per failed LOGICAL GENERATION (not per HTTP attempt);
- true single-probe half-open (exactly one caller admitted, others wait);
- adaptive cooldown that escalates on failed probes and resets on success.

Plus the token-attribution property: only the probe holder's failure can
escalate or release the probe slot.
"""

from __future__ import annotations

import src.llm.model_breaker as mb
from src.llm.model_breaker import AdmissionToken


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def monotonic(self) -> float:
        return self.now


def make_breaker(monkeypatch, **kwargs):
    clock = FakeClock()
    monkeypatch.setattr(mb, "time", clock)
    breaker = mb.ModelCapacityBreaker("codex:gpt-5.6-sol", **kwargs)
    return breaker, clock


def admitted(result) -> bool:
    return isinstance(result, AdmissionToken)


def test_closed_admits_everyone(monkeypatch):
    breaker, _ = make_breaker(monkeypatch)
    assert breaker.state == "closed"
    assert admitted(breaker.acquire_attempt())
    assert admitted(breaker.acquire_attempt())


def test_opens_only_at_generation_threshold(monkeypatch):
    breaker, _ = make_breaker(monkeypatch, generation_threshold=2)
    breaker.record_generation_failure()
    assert breaker.state == "closed"
    breaker.record_generation_failure()
    assert breaker.state == "open"


def test_attempt_failures_never_open_a_closed_breaker(monkeypatch):
    # Per-attempt capacity failures inside a generation's recovery window
    # must NOT open the breaker — only generation-level counting does.
    breaker, _ = make_breaker(monkeypatch)
    for _ in range(20):
        token = breaker.acquire_attempt()
        assert admitted(token)
        breaker.attempt_failed_capacity(token)
    assert breaker.state == "closed"
    assert admitted(breaker.acquire_attempt())


def test_open_breaker_paces_callers_until_cooldown(monkeypatch):
    breaker, clock = make_breaker(monkeypatch, cooldown_base=30.0)
    breaker.record_generation_failure()
    wait = breaker.acquire_attempt()
    assert isinstance(wait, float) and 0 < wait <= 30.0
    clock.now += 10.0
    wait2 = breaker.acquire_attempt()
    assert isinstance(wait2, float) and wait2 < wait


def test_single_probe_half_open(monkeypatch):
    breaker, clock = make_breaker(monkeypatch, cooldown_base=30.0)
    breaker.record_generation_failure()
    clock.now += 31.0
    # First caller past the cooldown claims THE probe slot.
    token = breaker.acquire_attempt()
    assert admitted(token)
    assert breaker.state == "probing"
    # Every other concurrent caller keeps waiting.
    assert breaker.acquire_attempt() == mb._PROBE_PENDING_WAIT
    assert breaker.acquire_attempt() == mb._PROBE_PENDING_WAIT


def test_probe_success_closes_and_resets(monkeypatch):
    breaker, clock = make_breaker(monkeypatch, cooldown_base=30.0)
    breaker.record_generation_failure()
    clock.now += 31.0
    token = breaker.acquire_attempt()
    assert admitted(token)
    breaker.attempt_succeeded(token)
    assert breaker.state == "closed"
    assert admitted(breaker.acquire_attempt())
    snap = breaker.snapshot()
    assert snap["failed_generations"] == 0
    assert snap["consecutive_opens"] == 0


def test_probe_failure_escalates_cooldown(monkeypatch):
    breaker, clock = make_breaker(monkeypatch, cooldown_base=30.0, cooldown_cap=300.0)
    breaker.record_generation_failure()  # open #1: cooldown 30
    clock.now += 31.0
    token = breaker.acquire_attempt()
    assert admitted(token)
    breaker.attempt_failed_capacity(token)  # open #2: cooldown 60
    wait = breaker.acquire_attempt()
    assert isinstance(wait, float) and 55.0 < wait <= 60.0
    clock.now += 61.0
    token = breaker.acquire_attempt()
    assert admitted(token)
    breaker.attempt_failed_capacity(token)  # open #3: cooldown 120
    wait = breaker.acquire_attempt()
    assert isinstance(wait, float) and 115.0 < wait <= 120.0


def test_cooldown_caps(monkeypatch):
    breaker, clock = make_breaker(monkeypatch, cooldown_base=30.0, cooldown_cap=100.0)
    breaker.record_generation_failure()
    for _ in range(6):  # keep failing probes well past the cap
        clock.now += 101.0
        token = breaker.acquire_attempt()
        assert admitted(token)
        breaker.attempt_failed_capacity(token)
    wait = breaker.acquire_attempt()
    assert isinstance(wait, float) and wait <= 100.0


def test_abandon_releases_probe_without_escalation(monkeypatch):
    breaker, clock = make_breaker(monkeypatch, cooldown_base=30.0)
    breaker.record_generation_failure()
    clock.now += 31.0
    token = breaker.acquire_attempt()
    assert admitted(token)
    before = breaker.snapshot()["consecutive_opens"]
    breaker.abandon(token)
    # Slot free again immediately — next caller becomes the probe.
    assert admitted(breaker.acquire_attempt())
    assert breaker.snapshot()["consecutive_opens"] == before


def test_stray_token_cannot_resolve_someone_elses_probe(monkeypatch):
    # A caller admitted while the breaker was CLOSED fails after the breaker
    # opened and another caller claimed the probe. Its resolution must not
    # escalate or release the probe slot.
    breaker, clock = make_breaker(monkeypatch, cooldown_base=30.0)
    stray = breaker.acquire_attempt()  # admitted while closed
    assert admitted(stray)
    breaker.record_generation_failure()  # opens
    clock.now += 31.0
    probe = breaker.acquire_attempt()
    assert admitted(probe)
    assert breaker.state == "probing"

    opens_before = breaker.snapshot()["consecutive_opens"]
    breaker.attempt_failed_capacity(stray)  # stray failure arrives late
    assert breaker.state == "probing"  # probe still held
    assert breaker.snapshot()["consecutive_opens"] == opens_before
    breaker.abandon(stray)  # stray abandon can't release it either
    assert breaker.state == "probing"

    breaker.attempt_succeeded(probe)
    assert breaker.state == "closed"


def test_success_resets_cooldown_escalation(monkeypatch):
    breaker, clock = make_breaker(monkeypatch, cooldown_base=30.0, cooldown_cap=300.0)
    breaker.record_generation_failure()
    clock.now += 31.0
    token = breaker.acquire_attempt()
    assert admitted(token)
    breaker.attempt_failed_capacity(token)  # escalated to 60
    clock.now += 61.0
    token = breaker.acquire_attempt()
    assert admitted(token)
    breaker.attempt_succeeded(token)  # closed, escalation reset
    breaker.record_generation_failure()  # re-open: cooldown back at base
    wait = breaker.acquire_attempt()
    assert isinstance(wait, float) and wait <= 30.0


def test_registry_get_or_create_and_keying(monkeypatch):
    registry = mb.ModelBreakerRegistry()
    a = registry.for_model("codex", "gpt-5.6-sol")
    b = registry.for_model("codex", "gpt-5.6-sol")
    c = registry.for_model("codex", "gpt-5.6-terra")
    assert a is b
    assert a is not c
    assert a.name == "codex:gpt-5.6-sol"
    # Effective-model keying: sol capacity trouble never blocks terra.
    a.record_generation_failure()
    assert a.state == "open"
    assert c.state == "closed"
    snap = registry.snapshot()
    assert set(snap) == {"codex:gpt-5.6-sol", "codex:gpt-5.6-terra"}
    assert snap["codex:gpt-5.6-sol"]["state"] == "open"


def test_registry_tolerates_missing_identity():
    registry = mb.ModelBreakerRegistry()
    breaker = registry.for_model("", "")
    assert breaker.name == "unknown:unknown"
