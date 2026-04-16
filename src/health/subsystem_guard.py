"""Subsystem availability guard — graceful degradation for Odin.

Tracks which subsystems are healthy, degraded, or unavailable so the bot
continues running when individual components fail.  Tool handlers consult
the guard before calling into a subsystem and receive a user-friendly
error message instead of a crash when the subsystem is down.

Failure counting is automatic: callers invoke ``record_failure`` and
``record_success`` after subsystem interactions.  Consecutive failures
beyond configurable thresholds trigger DEGRADED → UNAVAILABLE transitions.
Successes decrement the counter, allowing auto-recovery.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from ..odin_log import get_logger

log = get_logger("health.subsystem_guard")


# ── Subsystem state ──────────────────────────────────────────────────

class SubsystemState(str, Enum):
    """Availability state of a tracked subsystem."""
    AVAILABLE = "available"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"


# ── Per-subsystem record ─────────────────────────────────────────────

@dataclass(slots=True)
class SubsystemInfo:
    """Mutable tracking record for a single subsystem."""
    name: str
    state: SubsystemState = SubsystemState.AVAILABLE
    consecutive_failures: int = 0
    total_failures: int = 0
    total_successes: int = 0
    last_failure_reason: str = ""
    last_failure_at: float = 0.0
    last_success_at: float = 0.0
    registered_at: float = field(default_factory=time.monotonic)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "name": self.name,
            "state": self.state.value,
            "consecutive_failures": self.consecutive_failures,
            "total_failures": self.total_failures,
            "total_successes": self.total_successes,
        }
        if self.last_failure_reason:
            d["last_failure_reason"] = self.last_failure_reason
        if self.last_failure_at:
            d["last_failure_at"] = self.last_failure_at
        if self.last_success_at:
            d["last_success_at"] = self.last_success_at
        return d


# ── Aggregate stats ──────────────────────────────────────────────────

@dataclass
class DegradationStats:
    """Counters for the REST API / observability."""
    total_checks: int = 0
    total_blocked: int = 0
    total_transitions: int = 0
    transition_log: list[dict[str, Any]] = field(default_factory=list)

    # Keep at most this many transition log entries
    _MAX_LOG = 200

    def record_check(self, blocked: bool) -> None:
        self.total_checks += 1
        if blocked:
            self.total_blocked += 1

    def record_transition(
        self, name: str, from_state: SubsystemState, to_state: SubsystemState, reason: str,
    ) -> None:
        self.total_transitions += 1
        entry = {
            "subsystem": name,
            "from": from_state.value,
            "to": to_state.value,
            "reason": reason,
            "at": time.time(),
        }
        self.transition_log.append(entry)
        if len(self.transition_log) > self._MAX_LOG:
            self.transition_log = self.transition_log[-self._MAX_LOG:]

    def as_dict(self) -> dict[str, Any]:
        return {
            "total_checks": self.total_checks,
            "total_blocked": self.total_blocked,
            "total_transitions": self.total_transitions,
            "recent_transitions": self.transition_log[-20:],
        }


# ── Default degradation messages per subsystem ───────────────────────

_DEFAULT_MESSAGES: dict[str, str] = {
    "knowledge": (
        "Knowledge store is currently unavailable. "
        "Text search and document ingestion are offline. "
        "Other tools remain functional."
    ),
    "voice": (
        "Voice subsystem is currently unavailable. "
        "Voice channel commands are offline. "
        "Other tools remain functional."
    ),
    "browser": (
        "Browser automation is currently unavailable. "
        "Web scraping and browser tools are offline. "
        "Other tools remain functional."
    ),
    "mcp": (
        "MCP (Model Context Protocol) servers are currently unavailable. "
        "External MCP tools are offline. "
        "Other tools remain functional."
    ),
    "monitoring": (
        "Infrastructure monitoring is currently unavailable. "
        "Proactive alerts are paused. "
        "Other tools remain functional."
    ),
    "sessions": (
        "Session manager is currently unavailable. "
        "Conversation history may not persist. "
        "Other tools remain functional."
    ),
    "scheduler": (
        "Task scheduler is currently unavailable. "
        "Scheduled tasks are paused. "
        "Other tools remain functional."
    ),
}

_FALLBACK_MESSAGE = "Subsystem '{name}' is currently unavailable. Other tools remain functional."


# ── Thresholds ───────────────────────────────────────────────────────

DEFAULT_DEGRADED_THRESHOLD = 3
DEFAULT_UNAVAILABLE_THRESHOLD = 10


# ── Main guard class ─────────────────────────────────────────────────

class SubsystemGuard:
    """Central registry of subsystem health for graceful degradation.

    Usage::

        guard = SubsystemGuard()
        guard.register("knowledge")
        guard.register("voice")

        # Before using a subsystem:
        err = guard.check("knowledge")
        if err:
            return err  # user-friendly message

        # After a successful subsystem call:
        guard.record_success("knowledge")

        # After a failed subsystem call:
        guard.record_failure("knowledge", "sqlite3.OperationalError: ...")
    """

    __slots__ = (
        "_subsystems", "_degraded_threshold", "_unavailable_threshold",
        "stats",
    )

    def __init__(
        self,
        *,
        degraded_threshold: int = DEFAULT_DEGRADED_THRESHOLD,
        unavailable_threshold: int = DEFAULT_UNAVAILABLE_THRESHOLD,
        stats: DegradationStats | None = None,
    ) -> None:
        self._subsystems: dict[str, SubsystemInfo] = {}
        self._degraded_threshold = max(1, degraded_threshold)
        self._unavailable_threshold = max(
            self._degraded_threshold + 1, unavailable_threshold,
        )
        self.stats = stats or DegradationStats()

    # ── Registration ─────────────────────────────────────────────────

    def register(self, name: str, *, initial_state: SubsystemState = SubsystemState.AVAILABLE) -> None:
        """Register a subsystem for tracking."""
        if name in self._subsystems:
            return  # idempotent
        self._subsystems[name] = SubsystemInfo(name=name, state=initial_state)
        log.debug("Registered subsystem %r (state=%s)", name, initial_state.value)

    @property
    def registered(self) -> list[str]:
        return list(self._subsystems)

    # ── State queries ────────────────────────────────────────────────

    def get_state(self, name: str) -> SubsystemState | None:
        """Return the current state of *name*, or None if unregistered."""
        info = self._subsystems.get(name)
        return info.state if info else None

    def is_available(self, name: str) -> bool:
        """True only when the subsystem is fully AVAILABLE."""
        info = self._subsystems.get(name)
        if info is None:
            return True  # unregistered = not tracked = assume available
        return info.state == SubsystemState.AVAILABLE

    def is_usable(self, name: str) -> bool:
        """True when AVAILABLE or DEGRADED (partial functionality OK)."""
        info = self._subsystems.get(name)
        if info is None:
            return True
        return info.state != SubsystemState.UNAVAILABLE

    def check(self, name: str) -> str | None:
        """Return an error message if *name* is UNAVAILABLE, else None.

        This is the primary integration point for tool handlers::

            err = guard.check("knowledge")
            if err:
                return err
        """
        info = self._subsystems.get(name)
        if info is None:
            self.stats.record_check(blocked=False)
            return None
        if info.state == SubsystemState.UNAVAILABLE:
            self.stats.record_check(blocked=True)
            msg = _DEFAULT_MESSAGES.get(name, _FALLBACK_MESSAGE.format(name=name))
            return msg
        self.stats.record_check(blocked=False)
        return None

    # ── Explicit state transitions ───────────────────────────────────

    def mark_available(self, name: str) -> None:
        """Force a subsystem back to AVAILABLE (e.g. after manual recovery)."""
        info = self._subsystems.get(name)
        if info is None:
            return
        old = info.state
        info.consecutive_failures = 0
        if old == SubsystemState.AVAILABLE:
            return
        info.state = SubsystemState.AVAILABLE
        self.stats.record_transition(name, old, SubsystemState.AVAILABLE, "manual recovery")
        log.info("Subsystem %r manually marked AVAILABLE (was %s)", name, old.value)

    def mark_degraded(self, name: str, reason: str = "") -> None:
        """Force a subsystem to DEGRADED."""
        info = self._subsystems.get(name)
        if info is None:
            return
        old = info.state
        if old == SubsystemState.DEGRADED:
            return
        info.state = SubsystemState.DEGRADED
        if reason:
            info.last_failure_reason = reason
        self.stats.record_transition(name, old, SubsystemState.DEGRADED, reason or "manual")
        log.warning("Subsystem %r marked DEGRADED: %s", name, reason or "manual")

    def mark_unavailable(self, name: str, reason: str = "") -> None:
        """Force a subsystem to UNAVAILABLE."""
        info = self._subsystems.get(name)
        if info is None:
            return
        old = info.state
        if old == SubsystemState.UNAVAILABLE:
            return
        info.state = SubsystemState.UNAVAILABLE
        if reason:
            info.last_failure_reason = reason
        self.stats.record_transition(name, old, SubsystemState.UNAVAILABLE, reason or "manual")
        log.warning("Subsystem %r marked UNAVAILABLE: %s", name, reason or "manual")

    # ── Automatic threshold-based transitions ────────────────────────

    def record_failure(self, name: str, reason: str = "") -> SubsystemState:
        """Record a failed interaction with *name*.

        Increments the consecutive-failure counter and transitions state
        when thresholds are crossed.  Returns the (possibly new) state.
        """
        info = self._subsystems.get(name)
        if info is None:
            return SubsystemState.AVAILABLE  # not tracked

        info.consecutive_failures += 1
        info.total_failures += 1
        info.last_failure_at = time.monotonic()
        if reason:
            info.last_failure_reason = reason

        old = info.state

        if info.consecutive_failures >= self._unavailable_threshold:
            new = SubsystemState.UNAVAILABLE
        elif info.consecutive_failures >= self._degraded_threshold:
            new = SubsystemState.DEGRADED
        else:
            new = old  # no transition

        if new != old:
            info.state = new
            self.stats.record_transition(name, old, new, reason or f"{info.consecutive_failures} consecutive failures")
            log.warning(
                "Subsystem %r transitioned %s → %s after %d failures: %s",
                name, old.value, new.value, info.consecutive_failures, reason,
            )

        return info.state

    def record_success(self, name: str) -> SubsystemState:
        """Record a successful interaction with *name*.

        Resets the consecutive-failure counter and transitions back to
        AVAILABLE when appropriate.  Returns the (possibly new) state.
        """
        info = self._subsystems.get(name)
        if info is None:
            return SubsystemState.AVAILABLE

        info.consecutive_failures = 0
        info.total_successes += 1
        info.last_success_at = time.monotonic()

        old = info.state
        if old != SubsystemState.AVAILABLE:
            info.state = SubsystemState.AVAILABLE
            self.stats.record_transition(name, old, SubsystemState.AVAILABLE, "success after recovery")
            log.info("Subsystem %r recovered → AVAILABLE", name)

        return info.state

    # ── Observability ────────────────────────────────────────────────

    def get_subsystem(self, name: str) -> SubsystemInfo | None:
        return self._subsystems.get(name)

    def get_status(self) -> dict[str, Any]:
        """Full status snapshot for the REST API."""
        subsystems = [info.to_dict() for info in self._subsystems.values()]
        available_count = sum(1 for i in self._subsystems.values() if i.state == SubsystemState.AVAILABLE)
        degraded_count = sum(1 for i in self._subsystems.values() if i.state == SubsystemState.DEGRADED)
        unavailable_count = sum(1 for i in self._subsystems.values() if i.state == SubsystemState.UNAVAILABLE)
        total = len(self._subsystems)

        if unavailable_count > 0:
            overall = "degraded"
        elif degraded_count > 0:
            overall = "partial"
        else:
            overall = "healthy"

        return {
            "overall": overall,
            "subsystems": subsystems,
            "available_count": available_count,
            "degraded_count": degraded_count,
            "unavailable_count": unavailable_count,
            "total": total,
            "thresholds": {
                "degraded": self._degraded_threshold,
                "unavailable": self._unavailable_threshold,
            },
            "stats": self.stats.as_dict(),
        }

    def get_unavailable_names(self) -> list[str]:
        """Return names of all UNAVAILABLE subsystems (for system prompt hints)."""
        return [
            info.name for info in self._subsystems.values()
            if info.state == SubsystemState.UNAVAILABLE
        ]

    def get_degraded_names(self) -> list[str]:
        """Return names of all DEGRADED subsystems."""
        return [
            info.name for info in self._subsystems.values()
            if info.state == SubsystemState.DEGRADED
        ]
