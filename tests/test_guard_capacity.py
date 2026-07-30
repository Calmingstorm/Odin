"""Pins for the SubsystemGuard capacity fix (design settled with Odin 2026-07-30).

The trap being closed: check() short-circuits BEFORE the call, record_success
can then never fire, and mark_available had no production caller — so ten
guard increments latched an llm_* key UNAVAILABLE until restart. With 5-min
recovery, a capacity outage would have reached that latch in 1-2 turns
("fail quicker" — forbidden). The fix, pinned here:

- typed capacity failures and client-breaker echoes NEVER feed the sticky
  counter (the model-scoped breaker owns capacity admission);
- capacity marks a self-expiring transient DEGRADED (visibility only);
- bypass-path successes (agents/loops) clear a latched guard via
  notify_generation_success, driven by immutable response provenance only.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

import src.health.subsystem_guard as sg
from src.discord.llm_gateway import LLMGateway
from src.health.subsystem_guard import SubsystemGuard, SubsystemState
from src.llm.circuit_breaker import CircuitOpenError
from src.llm.errors import LLMCapacityError


def _cfg(active="codex"):
    return SimpleNamespace(llm_provider=SimpleNamespace(active_provider=active))


def _guard():
    guard = SubsystemGuard()
    guard.register("llm_codex")
    return guard


def _gw(client, guard):
    return LLMGateway(
        get_config=_cfg,
        codex_client=client,
        ollama_client=None,
        kimi_client=None,
        subsystem_guard=guard,
        auxiliary_llm_client=None,
        cost_tracker=None,
        sessions=MagicMock(),
        reflector=MagicMock(),
    )


async def _call(gw):
    return await gw.call_with_tools(messages=[], system="s", tools=[])


class TestCapacityExcludedFromGuardCounter:
    async def test_capacity_error_never_increments_counter(self):
        guard = _guard()
        client = SimpleNamespace(
            chat_with_tools=AsyncMock(side_effect=LLMCapacityError("overloaded")),
            model="gpt-5.6-sol",
        )
        gw = _gw(client, guard)
        for _ in range(25):  # far past both thresholds
            with pytest.raises(LLMCapacityError):
                await _call(gw)
        info = guard.get_subsystem("llm_codex")
        assert info.consecutive_failures == 0
        # Visibility: transiently DEGRADED, never UNAVAILABLE, never blocking.
        assert guard.get_state("llm_codex") == SubsystemState.DEGRADED
        assert guard.check("llm_codex") is None

    async def test_circuit_open_error_never_increments_counter(self):
        guard = _guard()
        client = SimpleNamespace(
            chat_with_tools=AsyncMock(side_effect=CircuitOpenError("codex_api", 30.0)),
            model="gpt-5.6-sol",
        )
        gw = _gw(client, guard)
        for _ in range(25):
            with pytest.raises(CircuitOpenError):
                await _call(gw)
        assert guard.get_subsystem("llm_codex").consecutive_failures == 0
        assert guard.get_state("llm_codex") != SubsystemState.UNAVAILABLE

    async def test_real_failures_still_count_and_latch(self):
        guard = _guard()
        client = SimpleNamespace(
            chat_with_tools=AsyncMock(side_effect=RuntimeError("real breakage")),
            model="gpt-5.6-sol",
        )
        gw = _gw(client, guard)
        for _ in range(10):
            with pytest.raises(RuntimeError):
                await _call(gw)
        assert guard.get_state("llm_codex") == SubsystemState.UNAVAILABLE
        assert guard.check("llm_codex") is not None


class TestTransientDegraded:
    def test_transient_expires_on_read(self, monkeypatch):
        clock = {"now": 1000.0}
        monkeypatch.setattr(
            sg, "time", SimpleNamespace(monotonic=lambda: clock["now"], time=lambda: 0.0)
        )
        guard = _guard()
        guard.mark_degraded_transient("llm_codex", "capacity", expires_in=120.0)
        assert guard.get_state("llm_codex") == SubsystemState.DEGRADED
        clock["now"] += 121.0
        assert guard.get_state("llm_codex") == SubsystemState.AVAILABLE
        assert guard.get_subsystem("llm_codex").transient_until is None

    def test_transient_never_downgrades_unavailable(self):
        guard = _guard()
        guard.mark_unavailable("llm_codex", "dead")
        guard.mark_degraded_transient("llm_codex", "capacity")
        assert guard.get_state("llm_codex") == SubsystemState.UNAVAILABLE

    def test_unregistered_names_are_noops(self):
        guard = _guard()
        guard.mark_degraded_transient("ghost", "capacity")
        guard.mark_degraded("ghost", "manual")
        assert guard.get_state("ghost") is None

    def test_transient_never_converts_counter_degraded(self, monkeypatch):
        clock = {"now": 1000.0}
        monkeypatch.setattr(
            sg, "time", SimpleNamespace(monotonic=lambda: clock["now"], time=lambda: 0.0)
        )
        guard = _guard()
        for _ in range(3):  # counter-driven DEGRADED
            guard.record_failure("llm_codex", "real")
        assert guard.get_state("llm_codex") == SubsystemState.DEGRADED
        guard.mark_degraded_transient("llm_codex", "capacity", expires_in=1.0)
        clock["now"] += 100.0
        # A real degradation must NOT lapse on a transient expiry.
        assert guard.get_state("llm_codex") == SubsystemState.DEGRADED

    def test_real_failure_supersedes_transient(self, monkeypatch):
        clock = {"now": 1000.0}
        monkeypatch.setattr(
            sg, "time", SimpleNamespace(monotonic=lambda: clock["now"], time=lambda: 0.0)
        )
        guard = _guard()
        guard.mark_degraded_transient("llm_codex", "capacity", expires_in=60.0)
        guard.record_failure("llm_codex", "real")
        clock["now"] += 120.0
        # The counter owns it now; expiry must not clear it...
        assert guard.get_subsystem("llm_codex").transient_until is None
        # ...and a success does.
        guard.record_success("llm_codex")
        assert guard.get_state("llm_codex") == SubsystemState.AVAILABLE

    def test_status_snapshot_flags_transient(self):
        guard = _guard()
        guard.mark_degraded_transient("llm_codex", "capacity")
        snap = guard.get_status()
        entry = next(s for s in snap["subsystems"] if s["name"] == "llm_codex")
        assert entry.get("transient") is True


class TestNotifyGenerationSuccess:
    def test_bypass_success_clears_latched_guard(self):
        guard = _guard()
        for _ in range(10):
            guard.record_failure("llm_codex", "boom")
        assert guard.get_state("llm_codex") == SubsystemState.UNAVAILABLE
        gw = _gw(SimpleNamespace(model="gpt-5.6-sol"), guard)
        gw.notify_generation_success("codex")
        assert guard.get_state("llm_codex") == SubsystemState.AVAILABLE
        assert guard.check("llm_codex") is None

    def test_missing_provenance_is_a_noop_never_a_guess(self):
        guard = _guard()
        for _ in range(10):
            guard.record_failure("llm_codex", "boom")
        gw = _gw(SimpleNamespace(model="gpt-5.6-sol"), guard)
        gw.notify_generation_success(None)
        gw.notify_generation_success("")
        assert guard.get_state("llm_codex") == SubsystemState.UNAVAILABLE

    def test_no_guard_is_tolerated(self):
        gw = _gw(SimpleNamespace(model="gpt-5.6-sol"), None)
        gw.notify_generation_success("codex")  # must not raise
