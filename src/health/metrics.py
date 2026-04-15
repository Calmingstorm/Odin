"""Prometheus exposition format metrics for Odin.

Generates /metrics output in Prometheus text format (text/plain; version=0.0.4).
No external dependencies — the exposition format is trivially serializable.

Usage:
    collector = MetricsCollector()
    collector.register_source("tools", lambda: executor.get_metrics())
    text = collector.render()
"""
from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any


# Type for a callable that returns arbitrary metric data
MetricSource = Callable[[], Any]


def _escape_label_value(v: str) -> str:
    """Escape a Prometheus label value (backslash, double-quote, newline)."""
    return v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _format_metric(
    name: str,
    value: float | int,
    *,
    metric_type: str = "gauge",
    help_text: str = "",
    labels: dict[str, str] | None = None,
    include_header: bool = True,
) -> str:
    """Format a single metric line in Prometheus exposition format."""
    lines = []
    if include_header:
        if help_text:
            lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} {metric_type}")
    if labels:
        label_str = ",".join(
            f'{k}="{_escape_label_value(str(v))}"' for k, v in sorted(labels.items())
        )
        lines.append(f"{name}{{{label_str}}} {value}")
    else:
        lines.append(f"{name} {value}")
    return "\n".join(lines)


class MetricsCollector:
    """Collects and renders Prometheus-format metrics from registered sources."""

    def __init__(self) -> None:
        self._start_time = time.time()
        self._sources: dict[str, MetricSource] = {}
        self._ready = False
        self._component_check: Callable[[], dict[str, dict]] | None = None

    def set_ready(self, ready: bool) -> None:
        self._ready = ready

    def set_component_check(self, check: Callable[[], dict[str, dict]]) -> None:
        """Register the component health checker from HealthServer."""
        self._component_check = check

    def register_source(self, name: str, source: MetricSource) -> None:
        """Register a named metric source.

        Sources are callables that return data used to generate metrics.
        Supported source names and their expected return types:
        - "tools": dict[str, dict[str, int]] from ToolExecutor.get_metrics()
        - "circuit_breaker": CircuitBreaker instance (has .state, ._failure_count)
        - "sessions": SessionManager instance (has .active_count)
        - "scheduler": callable returning int (schedule count)
        - "loops": callable returning int (active loop count)
        """
        self._sources[name] = source

    def render(self) -> str:
        """Render all metrics in Prometheus exposition format."""
        sections: list[str] = []

        # -- Process info --
        sections.append(_format_metric(
            "odin_up", 1 if self._ready else 0,
            help_text="Whether the Odin bot is ready (1=ready, 0=starting)",
        ))
        sections.append(_format_metric(
            "odin_start_time_seconds", self._start_time,
            metric_type="gauge",
            help_text="Unix timestamp when Odin started",
        ))
        uptime = time.time() - self._start_time
        sections.append(_format_metric(
            "odin_uptime_seconds", round(uptime, 1),
            metric_type="gauge",
            help_text="Seconds since Odin started",
        ))

        # -- Component health --
        if self._component_check:
            try:
                components = self._component_check()
                if components:
                    sections.append(f"# HELP odin_component_healthy Component health status (1=healthy, 0=unhealthy)")
                    sections.append(f"# TYPE odin_component_healthy gauge")
                    for name, info in sorted(components.items()):
                        healthy = 1 if info.get("healthy") else 0
                        sections.append(
                            _format_metric(
                                "odin_component_healthy", healthy,
                                labels={"component": name},
                                include_header=False,
                            )
                        )
            except Exception:
                pass

        # -- Tool execution metrics --
        tool_source = self._sources.get("tools")
        if tool_source:
            try:
                tool_metrics = tool_source()
                if tool_metrics:
                    sections.append(f"# HELP odin_tool_calls_total Total tool invocations")
                    sections.append(f"# TYPE odin_tool_calls_total counter")
                    for tool_name, counts in sorted(tool_metrics.items()):
                        calls = counts.get("calls", 0)
                        sections.append(_format_metric(
                            "odin_tool_calls_total", calls,
                            labels={"tool": tool_name},
                            include_header=False,
                        ))
                    sections.append(f"# HELP odin_tool_errors_total Total tool errors")
                    sections.append(f"# TYPE odin_tool_errors_total counter")
                    for tool_name, counts in sorted(tool_metrics.items()):
                        errors = counts.get("errors", 0)
                        sections.append(_format_metric(
                            "odin_tool_errors_total", errors,
                            labels={"tool": tool_name},
                            include_header=False,
                        ))
                    sections.append(f"# HELP odin_tool_timeouts_total Total tool timeouts")
                    sections.append(f"# TYPE odin_tool_timeouts_total counter")
                    for tool_name, counts in sorted(tool_metrics.items()):
                        timeouts = counts.get("timeouts", 0)
                        sections.append(_format_metric(
                            "odin_tool_timeouts_total", timeouts,
                            labels={"tool": tool_name},
                            include_header=False,
                        ))
            except Exception:
                pass

        # -- Circuit breaker --
        cb_source = self._sources.get("circuit_breaker")
        if cb_source:
            try:
                cb = cb_source()
                state_map = {"closed": 0, "half_open": 1, "open": 2}
                state_val = state_map.get(cb.state, -1)
                sections.append(_format_metric(
                    "odin_circuit_breaker_state",
                    state_val,
                    help_text="Circuit breaker state (0=closed, 1=half_open, 2=open)",
                ))
                sections.append(_format_metric(
                    "odin_circuit_breaker_failures",
                    cb._failure_count,
                    metric_type="gauge",
                    help_text="Current consecutive failure count",
                ))
            except Exception:
                pass

        # -- Sessions --
        session_source = self._sources.get("sessions")
        if session_source:
            try:
                count = session_source()
                sections.append(_format_metric(
                    "odin_active_sessions", count,
                    help_text="Number of active web sessions",
                ))
            except Exception:
                pass

        # -- Scheduler --
        sched_source = self._sources.get("scheduler")
        if sched_source:
            try:
                count = sched_source()
                sections.append(_format_metric(
                    "odin_schedules_total", count,
                    help_text="Number of configured schedules",
                ))
            except Exception:
                pass

        # -- Autonomous loops --
        loop_source = self._sources.get("loops")
        if loop_source:
            try:
                count = loop_source()
                sections.append(_format_metric(
                    "odin_active_loops", count,
                    help_text="Number of running autonomous loops",
                ))
            except Exception:
                pass

        return "\n".join(sections) + "\n"
