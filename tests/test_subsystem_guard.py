"""Tests for src.health.subsystem_guard — graceful degradation guard."""
from __future__ import annotations

import json
import time

import pytest

from src.health.subsystem_guard import (
    DEFAULT_DEGRADED_THRESHOLD,
    DEFAULT_UNAVAILABLE_THRESHOLD,
    DegradationStats,
    SubsystemGuard,
    SubsystemInfo,
    SubsystemState,
    _DEFAULT_MESSAGES,
    _FALLBACK_MESSAGE,
)


# ---------------------------------------------------------------------------
# SubsystemState enum
# ---------------------------------------------------------------------------


class TestSubsystemState:
    def test_values(self):
        assert SubsystemState.AVAILABLE.value == "available"
        assert SubsystemState.DEGRADED.value == "degraded"
        assert SubsystemState.UNAVAILABLE.value == "unavailable"

    def test_count(self):
        assert len(SubsystemState) == 3

    def test_str_inheritance(self):
        assert isinstance(SubsystemState.AVAILABLE, str)
        assert SubsystemState.AVAILABLE == "available"


# ---------------------------------------------------------------------------
# SubsystemInfo dataclass
# ---------------------------------------------------------------------------


class TestSubsystemInfo:
    def test_defaults(self):
        info = SubsystemInfo(name="test")
        assert info.name == "test"
        assert info.state == SubsystemState.AVAILABLE
        assert info.consecutive_failures == 0
        assert info.total_failures == 0
        assert info.total_successes == 0
        assert info.last_failure_reason == ""
        assert info.last_failure_at == 0.0
        assert info.last_success_at == 0.0
        assert info.registered_at > 0

    def test_to_dict_minimal(self):
        info = SubsystemInfo(name="knowledge")
        d = info.to_dict()
        assert d["name"] == "knowledge"
        assert d["state"] == "available"
        assert d["consecutive_failures"] == 0
        # No optional fields present when empty
        assert "last_failure_reason" not in d
        assert "last_failure_at" not in d
        assert "last_success_at" not in d

    def test_to_dict_with_failure(self):
        info = SubsystemInfo(
            name="browser",
            state=SubsystemState.DEGRADED,
            consecutive_failures=3,
            total_failures=5,
            last_failure_reason="timeout",
            last_failure_at=100.0,
        )
        d = info.to_dict()
        assert d["state"] == "degraded"
        assert d["consecutive_failures"] == 3
        assert d["total_failures"] == 5
        assert d["last_failure_reason"] == "timeout"
        assert d["last_failure_at"] == 100.0

    def test_to_dict_with_success(self):
        info = SubsystemInfo(name="voice", last_success_at=200.0, total_successes=10)
        d = info.to_dict()
        assert d["total_successes"] == 10
        assert d["last_success_at"] == 200.0

    def test_slots(self):
        info = SubsystemInfo(name="test")
        assert hasattr(info, "__slots__")


# ---------------------------------------------------------------------------
# DegradationStats
# ---------------------------------------------------------------------------


class TestDegradationStats:
    def test_initial(self):
        stats = DegradationStats()
        assert stats.total_checks == 0
        assert stats.total_blocked == 0
        assert stats.total_transitions == 0
        assert stats.transition_log == []

    def test_record_check_not_blocked(self):
        stats = DegradationStats()
        stats.record_check(blocked=False)
        assert stats.total_checks == 1
        assert stats.total_blocked == 0

    def test_record_check_blocked(self):
        stats = DegradationStats()
        stats.record_check(blocked=True)
        assert stats.total_checks == 1
        assert stats.total_blocked == 1

    def test_record_transition(self):
        stats = DegradationStats()
        stats.record_transition(
            "knowledge", SubsystemState.AVAILABLE, SubsystemState.DEGRADED, "db error",
        )
        assert stats.total_transitions == 1
        assert len(stats.transition_log) == 1
        entry = stats.transition_log[0]
        assert entry["subsystem"] == "knowledge"
        assert entry["from"] == "available"
        assert entry["to"] == "degraded"
        assert entry["reason"] == "db error"
        assert "at" in entry

    def test_transition_log_capped(self):
        stats = DegradationStats()
        for i in range(250):
            stats.record_transition(
                "test", SubsystemState.AVAILABLE, SubsystemState.DEGRADED, f"err{i}",
            )
        assert len(stats.transition_log) == 200
        assert stats.total_transitions == 250

    def test_as_dict(self):
        stats = DegradationStats()
        stats.record_check(blocked=True)
        stats.record_transition(
            "x", SubsystemState.AVAILABLE, SubsystemState.DEGRADED, "fail",
        )
        d = stats.as_dict()
        assert d["total_checks"] == 1
        assert d["total_blocked"] == 1
        assert d["total_transitions"] == 1
        assert len(d["recent_transitions"]) == 1

    def test_as_dict_recent_transitions_capped_at_20(self):
        stats = DegradationStats()
        for i in range(30):
            stats.record_transition(
                "x", SubsystemState.AVAILABLE, SubsystemState.DEGRADED, f"err{i}",
            )
        d = stats.as_dict()
        assert len(d["recent_transitions"]) == 20

    def test_as_dict_json_serializable(self):
        stats = DegradationStats()
        stats.record_check(blocked=True)
        stats.record_transition(
            "x", SubsystemState.AVAILABLE, SubsystemState.UNAVAILABLE, "crash",
        )
        json.dumps(stats.as_dict())  # should not raise


# ---------------------------------------------------------------------------
# SubsystemGuard — registration
# ---------------------------------------------------------------------------


class TestGuardRegistration:
    def test_register(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        assert "knowledge" in guard.registered

    def test_register_idempotent(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.register("knowledge")
        assert guard.registered.count("knowledge") == 1

    def test_register_custom_state(self):
        guard = SubsystemGuard()
        guard.register("voice", initial_state=SubsystemState.DEGRADED)
        assert guard.get_state("voice") == SubsystemState.DEGRADED

    def test_registered_order(self):
        guard = SubsystemGuard()
        guard.register("a")
        guard.register("b")
        guard.register("c")
        assert guard.registered == ["a", "b", "c"]


# ---------------------------------------------------------------------------
# SubsystemGuard — state queries
# ---------------------------------------------------------------------------


class TestGuardStateQueries:
    def test_get_state_registered(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        assert guard.get_state("knowledge") == SubsystemState.AVAILABLE

    def test_get_state_unregistered(self):
        guard = SubsystemGuard()
        assert guard.get_state("unknown") is None

    def test_is_available_true(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        assert guard.is_available("knowledge") is True

    def test_is_available_degraded(self):
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.DEGRADED)
        assert guard.is_available("knowledge") is False

    def test_is_available_unavailable(self):
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.UNAVAILABLE)
        assert guard.is_available("knowledge") is False

    def test_is_available_unregistered_defaults_true(self):
        guard = SubsystemGuard()
        assert guard.is_available("unknown") is True

    def test_is_usable_available(self):
        guard = SubsystemGuard()
        guard.register("voice")
        assert guard.is_usable("voice") is True

    def test_is_usable_degraded(self):
        guard = SubsystemGuard()
        guard.register("voice", initial_state=SubsystemState.DEGRADED)
        assert guard.is_usable("voice") is True

    def test_is_usable_unavailable(self):
        guard = SubsystemGuard()
        guard.register("voice", initial_state=SubsystemState.UNAVAILABLE)
        assert guard.is_usable("voice") is False

    def test_is_usable_unregistered_defaults_true(self):
        guard = SubsystemGuard()
        assert guard.is_usable("unknown") is True


# ---------------------------------------------------------------------------
# SubsystemGuard — check()
# ---------------------------------------------------------------------------


class TestGuardCheck:
    def test_check_available_returns_none(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        assert guard.check("knowledge") is None

    def test_check_degraded_returns_none(self):
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.DEGRADED)
        assert guard.check("knowledge") is None

    def test_check_unavailable_returns_message(self):
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.UNAVAILABLE)
        msg = guard.check("knowledge")
        assert msg is not None
        assert "Knowledge store" in msg
        assert "unavailable" in msg

    def test_check_unregistered_returns_none(self):
        guard = SubsystemGuard()
        assert guard.check("unknown") is None

    def test_check_uses_default_message(self):
        for name, expected_msg in _DEFAULT_MESSAGES.items():
            guard = SubsystemGuard()
            guard.register(name, initial_state=SubsystemState.UNAVAILABLE)
            assert guard.check(name) == expected_msg

    def test_check_uses_fallback_message(self):
        guard = SubsystemGuard()
        guard.register("custom_subsystem", initial_state=SubsystemState.UNAVAILABLE)
        msg = guard.check("custom_subsystem")
        assert "custom_subsystem" in msg
        assert "unavailable" in msg

    def test_check_updates_stats_blocked(self):
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.UNAVAILABLE)
        guard.check("knowledge")
        assert guard.stats.total_checks == 1
        assert guard.stats.total_blocked == 1

    def test_check_updates_stats_not_blocked(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.check("knowledge")
        assert guard.stats.total_checks == 1
        assert guard.stats.total_blocked == 0


# ---------------------------------------------------------------------------
# SubsystemGuard — explicit state transitions
# ---------------------------------------------------------------------------


class TestGuardExplicitTransitions:
    def test_mark_available(self):
        guard = SubsystemGuard()
        guard.register("voice", initial_state=SubsystemState.UNAVAILABLE)
        guard.mark_available("voice")
        assert guard.get_state("voice") == SubsystemState.AVAILABLE

    def test_mark_available_resets_failures(self):
        guard = SubsystemGuard()
        guard.register("voice")
        guard.record_failure("voice", "err")
        guard.record_failure("voice", "err")
        guard.mark_available("voice")
        info = guard.get_subsystem("voice")
        assert info.consecutive_failures == 0

    def test_mark_available_noop_if_already_available(self):
        guard = SubsystemGuard()
        guard.register("voice")
        guard.mark_available("voice")
        assert guard.stats.total_transitions == 0

    def test_mark_available_unregistered_noop(self):
        guard = SubsystemGuard()
        guard.mark_available("unknown")  # should not raise

    def test_mark_degraded(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.mark_degraded("knowledge", "high latency")
        assert guard.get_state("knowledge") == SubsystemState.DEGRADED
        assert guard.stats.total_transitions == 1

    def test_mark_degraded_noop_if_already_degraded(self):
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.DEGRADED)
        guard.mark_degraded("knowledge", "still bad")
        assert guard.stats.total_transitions == 0

    def test_mark_unavailable(self):
        guard = SubsystemGuard()
        guard.register("browser")
        guard.mark_unavailable("browser", "playwright crashed")
        assert guard.get_state("browser") == SubsystemState.UNAVAILABLE
        assert guard.stats.total_transitions == 1

    def test_mark_unavailable_noop_if_already_unavailable(self):
        guard = SubsystemGuard()
        guard.register("browser", initial_state=SubsystemState.UNAVAILABLE)
        guard.mark_unavailable("browser", "still down")
        assert guard.stats.total_transitions == 0

    def test_mark_unavailable_unregistered_noop(self):
        guard = SubsystemGuard()
        guard.mark_unavailable("unknown")


# ---------------------------------------------------------------------------
# SubsystemGuard — record_failure threshold transitions
# ---------------------------------------------------------------------------


class TestGuardRecordFailure:
    def test_first_failure_stays_available(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        state = guard.record_failure("knowledge", "db timeout")
        assert state == SubsystemState.AVAILABLE
        info = guard.get_subsystem("knowledge")
        assert info.consecutive_failures == 1
        assert info.total_failures == 1

    def test_threshold_to_degraded(self):
        guard = SubsystemGuard(degraded_threshold=3)
        guard.register("knowledge")
        for i in range(2):
            guard.record_failure("knowledge", f"err{i}")
        assert guard.get_state("knowledge") == SubsystemState.AVAILABLE
        state = guard.record_failure("knowledge", "err2")
        assert state == SubsystemState.DEGRADED
        assert guard.stats.total_transitions == 1

    def test_threshold_to_unavailable(self):
        guard = SubsystemGuard(degraded_threshold=3, unavailable_threshold=5)
        guard.register("knowledge")
        for i in range(5):
            guard.record_failure("knowledge", f"err{i}")
        assert guard.get_state("knowledge") == SubsystemState.UNAVAILABLE

    def test_failure_records_timestamp(self):
        guard = SubsystemGuard()
        guard.register("voice")
        before = time.monotonic()
        guard.record_failure("voice", "err")
        after = time.monotonic()
        info = guard.get_subsystem("voice")
        assert before <= info.last_failure_at <= after

    def test_failure_records_reason(self):
        guard = SubsystemGuard()
        guard.register("voice")
        guard.record_failure("voice", "connection reset")
        info = guard.get_subsystem("voice")
        assert info.last_failure_reason == "connection reset"

    def test_failure_unregistered_returns_available(self):
        guard = SubsystemGuard()
        state = guard.record_failure("unknown", "err")
        assert state == SubsystemState.AVAILABLE

    def test_consecutive_failures_accumulate(self):
        guard = SubsystemGuard()
        guard.register("mcp")
        for i in range(7):
            guard.record_failure("mcp", f"err{i}")
        info = guard.get_subsystem("mcp")
        assert info.consecutive_failures == 7
        assert info.total_failures == 7

    def test_failure_empty_reason(self):
        guard = SubsystemGuard()
        guard.register("voice")
        guard.record_failure("voice")
        info = guard.get_subsystem("voice")
        assert info.last_failure_reason == ""


# ---------------------------------------------------------------------------
# SubsystemGuard — record_success auto-recovery
# ---------------------------------------------------------------------------


class TestGuardRecordSuccess:
    def test_success_resets_consecutive_failures(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.record_failure("knowledge", "err")
        guard.record_failure("knowledge", "err")
        guard.record_success("knowledge")
        info = guard.get_subsystem("knowledge")
        assert info.consecutive_failures == 0
        assert info.total_failures == 2
        assert info.total_successes == 1

    def test_success_recovers_from_degraded(self):
        guard = SubsystemGuard(degraded_threshold=2)
        guard.register("voice")
        guard.record_failure("voice", "err")
        guard.record_failure("voice", "err")
        assert guard.get_state("voice") == SubsystemState.DEGRADED
        state = guard.record_success("voice")
        assert state == SubsystemState.AVAILABLE

    def test_success_recovers_from_unavailable(self):
        guard = SubsystemGuard(degraded_threshold=2, unavailable_threshold=3)
        guard.register("browser")
        for _ in range(3):
            guard.record_failure("browser", "err")
        assert guard.get_state("browser") == SubsystemState.UNAVAILABLE
        state = guard.record_success("browser")
        assert state == SubsystemState.AVAILABLE

    def test_success_records_timestamp(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        before = time.monotonic()
        guard.record_success("knowledge")
        after = time.monotonic()
        info = guard.get_subsystem("knowledge")
        assert before <= info.last_success_at <= after

    def test_success_on_available_no_transition(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.record_success("knowledge")
        assert guard.stats.total_transitions == 0

    def test_success_unregistered_returns_available(self):
        guard = SubsystemGuard()
        state = guard.record_success("unknown")
        assert state == SubsystemState.AVAILABLE


# ---------------------------------------------------------------------------
# SubsystemGuard — observability
# ---------------------------------------------------------------------------


class TestGuardObservability:
    def test_get_subsystem(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        info = guard.get_subsystem("knowledge")
        assert info is not None
        assert info.name == "knowledge"

    def test_get_subsystem_unknown(self):
        guard = SubsystemGuard()
        assert guard.get_subsystem("unknown") is None

    def test_get_status_empty(self):
        guard = SubsystemGuard()
        status = guard.get_status()
        assert status["overall"] == "healthy"
        assert status["subsystems"] == []
        assert status["total"] == 0

    def test_get_status_all_available(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.register("voice")
        status = guard.get_status()
        assert status["overall"] == "healthy"
        assert status["available_count"] == 2
        assert status["degraded_count"] == 0
        assert status["unavailable_count"] == 0

    def test_get_status_with_degraded(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.register("voice", initial_state=SubsystemState.DEGRADED)
        status = guard.get_status()
        assert status["overall"] == "partial"
        assert status["degraded_count"] == 1

    def test_get_status_with_unavailable(self):
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.UNAVAILABLE)
        guard.register("voice")
        status = guard.get_status()
        assert status["overall"] == "degraded"
        assert status["unavailable_count"] == 1

    def test_get_status_thresholds(self):
        guard = SubsystemGuard(degraded_threshold=5, unavailable_threshold=15)
        status = guard.get_status()
        assert status["thresholds"]["degraded"] == 5
        assert status["thresholds"]["unavailable"] == 15

    def test_get_status_includes_stats(self):
        guard = SubsystemGuard()
        status = guard.get_status()
        assert "stats" in status
        assert "total_checks" in status["stats"]

    def test_get_status_json_serializable(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.register("voice", initial_state=SubsystemState.DEGRADED)
        guard.record_failure("knowledge", "err")
        json.dumps(guard.get_status())  # should not raise

    def test_get_unavailable_names(self):
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.UNAVAILABLE)
        guard.register("voice")
        guard.register("browser", initial_state=SubsystemState.UNAVAILABLE)
        names = guard.get_unavailable_names()
        assert set(names) == {"knowledge", "browser"}

    def test_get_unavailable_names_empty(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        assert guard.get_unavailable_names() == []

    def test_get_degraded_names(self):
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.DEGRADED)
        guard.register("voice")
        assert guard.get_degraded_names() == ["knowledge"]


# ---------------------------------------------------------------------------
# SubsystemGuard — threshold configuration
# ---------------------------------------------------------------------------


class TestGuardThresholdConfig:
    def test_default_thresholds(self):
        assert DEFAULT_DEGRADED_THRESHOLD == 3
        assert DEFAULT_UNAVAILABLE_THRESHOLD == 10

    def test_custom_thresholds(self):
        guard = SubsystemGuard(degraded_threshold=5, unavailable_threshold=15)
        guard.register("knowledge")
        for _ in range(4):
            guard.record_failure("knowledge", "err")
        assert guard.get_state("knowledge") == SubsystemState.AVAILABLE
        guard.record_failure("knowledge", "err")
        assert guard.get_state("knowledge") == SubsystemState.DEGRADED

    def test_degraded_threshold_minimum_1(self):
        guard = SubsystemGuard(degraded_threshold=0)
        guard.register("knowledge")
        # threshold clamped to 1, so first failure triggers degraded
        guard.record_failure("knowledge", "err")
        assert guard.get_state("knowledge") == SubsystemState.DEGRADED

    def test_unavailable_threshold_above_degraded(self):
        guard = SubsystemGuard(degraded_threshold=5, unavailable_threshold=3)
        # unavailable should be clamped to degraded+1 = 6
        guard.register("knowledge")
        for _ in range(5):
            guard.record_failure("knowledge", "err")
        assert guard.get_state("knowledge") == SubsystemState.DEGRADED
        guard.record_failure("knowledge", "err")
        assert guard.get_state("knowledge") == SubsystemState.UNAVAILABLE


# ---------------------------------------------------------------------------
# SubsystemGuard — full lifecycle scenarios
# ---------------------------------------------------------------------------


class TestGuardLifecycle:
    def test_failure_recovery_cycle(self):
        guard = SubsystemGuard(degraded_threshold=2, unavailable_threshold=4)
        guard.register("knowledge")

        # Normal
        assert guard.get_state("knowledge") == SubsystemState.AVAILABLE

        # Failures push to degraded
        guard.record_failure("knowledge", "timeout")
        guard.record_failure("knowledge", "timeout")
        assert guard.get_state("knowledge") == SubsystemState.DEGRADED

        # More failures push to unavailable
        guard.record_failure("knowledge", "timeout")
        guard.record_failure("knowledge", "timeout")
        assert guard.get_state("knowledge") == SubsystemState.UNAVAILABLE

        # check() blocks
        assert guard.check("knowledge") is not None

        # Single success recovers
        guard.record_success("knowledge")
        assert guard.get_state("knowledge") == SubsystemState.AVAILABLE
        assert guard.check("knowledge") is None

    def test_intermittent_failures_dont_escalate(self):
        guard = SubsystemGuard(degraded_threshold=3)
        guard.register("voice")

        guard.record_failure("voice", "err")
        guard.record_failure("voice", "err")
        guard.record_success("voice")  # resets counter
        guard.record_failure("voice", "err")
        guard.record_failure("voice", "err")
        # Only 2 consecutive, not 3
        assert guard.get_state("voice") == SubsystemState.AVAILABLE

    def test_multiple_subsystems_independent(self):
        guard = SubsystemGuard(degraded_threshold=2)
        guard.register("knowledge")
        guard.register("voice")
        guard.register("browser")

        for _ in range(2):
            guard.record_failure("knowledge", "err")
        assert guard.get_state("knowledge") == SubsystemState.DEGRADED
        assert guard.get_state("voice") == SubsystemState.AVAILABLE
        assert guard.get_state("browser") == SubsystemState.AVAILABLE

    def test_stats_track_full_lifecycle(self):
        guard = SubsystemGuard(degraded_threshold=2, unavailable_threshold=3)
        guard.register("knowledge")

        guard.record_failure("knowledge", "err")
        guard.record_failure("knowledge", "err")  # → DEGRADED
        guard.record_failure("knowledge", "err")  # → UNAVAILABLE
        guard.check("knowledge")                   # blocked
        guard.record_success("knowledge")          # → AVAILABLE

        assert guard.stats.total_transitions == 3  # available→degraded, degraded→unavailable, unavailable→available
        assert guard.stats.total_blocked == 1
        assert guard.stats.total_checks == 1


# ---------------------------------------------------------------------------
# Default messages
# ---------------------------------------------------------------------------


class TestDefaultMessages:
    def test_all_known_subsystems_have_messages(self):
        expected = {"knowledge", "voice", "browser", "mcp", "monitoring", "sessions", "scheduler"}
        assert set(_DEFAULT_MESSAGES.keys()) == expected

    def test_all_messages_mention_unavailable(self):
        for name, msg in _DEFAULT_MESSAGES.items():
            assert "unavailable" in msg, f"Message for {name} should mention 'unavailable'"

    def test_all_messages_mention_other_tools(self):
        for name, msg in _DEFAULT_MESSAGES.items():
            assert "Other tools remain functional" in msg, f"Message for {name} should reassure about other tools"

    def test_fallback_message_template(self):
        msg = _FALLBACK_MESSAGE.format(name="custom")
        assert "custom" in msg
        assert "unavailable" in msg


# ---------------------------------------------------------------------------
# GracefulDegradationConfig
# ---------------------------------------------------------------------------


class TestGracefulDegradationConfig:
    def test_defaults(self):
        from src.config.schema import GracefulDegradationConfig
        cfg = GracefulDegradationConfig()
        assert cfg.enabled is True
        assert cfg.degraded_threshold == 3
        assert cfg.unavailable_threshold == 10

    def test_custom_values(self):
        from src.config.schema import GracefulDegradationConfig
        cfg = GracefulDegradationConfig(
            enabled=False, degraded_threshold=5, unavailable_threshold=20,
        )
        assert cfg.enabled is False
        assert cfg.degraded_threshold == 5
        assert cfg.unavailable_threshold == 20

    def test_in_main_config(self):
        from src.config.schema import Config, DiscordConfig
        cfg = Config(discord=DiscordConfig(token="test", prefix="!"))
        assert cfg.graceful_degradation.enabled is True
        assert cfg.graceful_degradation.degraded_threshold == 3

    def test_from_dict(self):
        from src.config.schema import Config, DiscordConfig
        cfg = Config(
            discord=DiscordConfig(token="test", prefix="!"),
            graceful_degradation={"enabled": False, "degraded_threshold": 7},
        )
        assert cfg.graceful_degradation.enabled is False
        assert cfg.graceful_degradation.degraded_threshold == 7


# ---------------------------------------------------------------------------
# sync_guard_from_health bridge
# ---------------------------------------------------------------------------


class TestSyncGuardFromHealth:
    def test_sync_down_records_failure(self):
        from src.health.checker import sync_guard_from_health
        guard = SubsystemGuard()
        guard.register("knowledge")
        health = {
            "components": [
                {"name": "knowledge", "status": "down", "detail": "db crash"},
            ],
        }
        sync_guard_from_health(health, guard)
        info = guard.get_subsystem("knowledge")
        assert info.consecutive_failures == 1

    def test_sync_ok_records_success(self):
        from src.health.checker import sync_guard_from_health
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.record_failure("knowledge", "err")
        health = {
            "components": [
                {"name": "knowledge", "status": "ok", "detail": "fine"},
            ],
        }
        sync_guard_from_health(health, guard)
        info = guard.get_subsystem("knowledge")
        assert info.consecutive_failures == 0

    def test_sync_degraded_records_failure(self):
        from src.health.checker import sync_guard_from_health
        guard = SubsystemGuard()
        guard.register("sessions")
        health = {
            "components": [
                {"name": "sessions", "status": "degraded", "detail": "over budget"},
            ],
        }
        sync_guard_from_health(health, guard)
        info = guard.get_subsystem("sessions")
        assert info.consecutive_failures == 1

    def test_sync_unconfigured_ignored(self):
        from src.health.checker import sync_guard_from_health
        guard = SubsystemGuard()
        guard.register("voice")
        health = {
            "components": [
                {"name": "voice", "status": "unconfigured", "detail": "not enabled"},
            ],
        }
        sync_guard_from_health(health, guard)
        info = guard.get_subsystem("voice")
        assert info.consecutive_failures == 0
        assert info.total_successes == 0

    def test_sync_skips_unregistered(self):
        from src.health.checker import sync_guard_from_health
        guard = SubsystemGuard()
        guard.register("knowledge")
        health = {
            "components": [
                {"name": "discord", "status": "ok", "detail": "online"},
                {"name": "knowledge", "status": "down", "detail": "err"},
            ],
        }
        sync_guard_from_health(health, guard)
        # Only knowledge was affected (discord is not registered)
        assert guard.get_subsystem("knowledge").consecutive_failures == 1
        assert guard.get_state("discord") is None

    def test_sync_empty_components(self):
        from src.health.checker import sync_guard_from_health
        guard = SubsystemGuard()
        guard.register("knowledge")
        sync_guard_from_health({"components": []}, guard)
        assert guard.get_subsystem("knowledge").consecutive_failures == 0

    def test_sync_missing_components_key(self):
        from src.health.checker import sync_guard_from_health
        guard = SubsystemGuard()
        guard.register("knowledge")
        sync_guard_from_health({}, guard)
        assert guard.get_subsystem("knowledge").consecutive_failures == 0

    def test_sync_multiple_subsystems(self):
        from src.health.checker import sync_guard_from_health
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.register("voice")
        guard.register("browser")
        health = {
            "components": [
                {"name": "knowledge", "status": "down", "detail": "crash"},
                {"name": "voice", "status": "ok", "detail": "connected"},
                {"name": "browser", "status": "degraded", "detail": "slow"},
            ],
        }
        sync_guard_from_health(health, guard)
        assert guard.get_subsystem("knowledge").consecutive_failures == 1
        assert guard.get_subsystem("voice").total_successes == 1
        assert guard.get_subsystem("browser").consecutive_failures == 1

    def test_sync_repeated_drives_to_unavailable(self):
        from src.health.checker import sync_guard_from_health
        guard = SubsystemGuard(degraded_threshold=2, unavailable_threshold=4)
        guard.register("knowledge")
        health_down = {
            "components": [
                {"name": "knowledge", "status": "down", "detail": "err"},
            ],
        }
        for _ in range(4):
            sync_guard_from_health(health_down, guard)
        assert guard.get_state("knowledge") == SubsystemState.UNAVAILABLE


# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------


class TestImports:
    def test_all_public_symbols(self):
        from src.health import subsystem_guard
        expected = {
            "SubsystemState", "SubsystemInfo", "SubsystemGuard",
            "DegradationStats", "DEFAULT_DEGRADED_THRESHOLD",
            "DEFAULT_UNAVAILABLE_THRESHOLD",
        }
        exported = {
            name for name in dir(subsystem_guard)
            if not name.startswith("_") and name[0].isupper()
        }
        assert expected.issubset(exported)

    def test_checker_bridge_importable(self):
        from src.health.checker import sync_guard_from_health
        assert callable(sync_guard_from_health)


# ---------------------------------------------------------------------------
# API endpoint dict structure
# ---------------------------------------------------------------------------


class TestAPIEndpoint:
    def test_get_status_dict_keys(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.register("voice")
        status = guard.get_status()
        expected_keys = {
            "overall", "subsystems", "available_count", "degraded_count",
            "unavailable_count", "total", "thresholds", "stats",
        }
        assert set(status.keys()) == expected_keys

    def test_get_status_subsystem_dict_keys(self):
        guard = SubsystemGuard()
        guard.register("knowledge")
        status = guard.get_status()
        sub = status["subsystems"][0]
        assert "name" in sub
        assert "state" in sub
        assert "consecutive_failures" in sub


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_shared_stats_object(self):
        stats = DegradationStats()
        guard1 = SubsystemGuard(stats=stats)
        guard2 = SubsystemGuard(stats=stats)
        guard1.register("a")
        guard2.register("b")
        guard1.check("a")
        guard2.check("b")
        assert stats.total_checks == 2

    def test_record_failure_then_success_then_failure(self):
        guard = SubsystemGuard(degraded_threshold=2)
        guard.register("knowledge")
        guard.record_failure("knowledge", "err")
        guard.record_failure("knowledge", "err")
        assert guard.get_state("knowledge") == SubsystemState.DEGRADED
        guard.record_success("knowledge")
        assert guard.get_state("knowledge") == SubsystemState.AVAILABLE
        guard.record_failure("knowledge", "err")
        assert guard.get_state("knowledge") == SubsystemState.AVAILABLE  # only 1 consecutive

    def test_mark_degraded_then_record_success(self):
        guard = SubsystemGuard()
        guard.register("voice")
        guard.mark_degraded("voice", "manual")
        guard.record_success("voice")
        assert guard.get_state("voice") == SubsystemState.AVAILABLE

    def test_mark_unavailable_then_record_success(self):
        guard = SubsystemGuard()
        guard.register("voice")
        guard.mark_unavailable("voice", "manual")
        guard.record_success("voice")
        assert guard.get_state("voice") == SubsystemState.AVAILABLE

    def test_concurrent_failure_and_success_tracking(self):
        guard = SubsystemGuard(degraded_threshold=3, unavailable_threshold=6)
        guard.register("mcp")
        # Simulate: 2 failures, 1 success, 3 failures → degraded
        guard.record_failure("mcp", "err")
        guard.record_failure("mcp", "err")
        guard.record_success("mcp")
        guard.record_failure("mcp", "err")
        guard.record_failure("mcp", "err")
        guard.record_failure("mcp", "err")
        assert guard.get_state("mcp") == SubsystemState.DEGRADED
        info = guard.get_subsystem("mcp")
        assert info.total_failures == 5
        assert info.total_successes == 1

    def test_get_status_overall_priority(self):
        """unavailable takes priority over degraded for overall status."""
        guard = SubsystemGuard()
        guard.register("knowledge", initial_state=SubsystemState.DEGRADED)
        guard.register("voice", initial_state=SubsystemState.UNAVAILABLE)
        status = guard.get_status()
        assert status["overall"] == "degraded"  # unavailable present = degraded overall
