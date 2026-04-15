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

        # -- LLM cost tracking --
        cost_source = self._sources.get("cost_tracker")
        if cost_source:
            try:
                cost_data = cost_source()
                if cost_data:
                    sections.append(_format_metric(
                        "odin_llm_input_tokens_total",
                        cost_data.get("total_input_tokens", 0),
                        metric_type="counter",
                        help_text="Total estimated LLM input tokens",
                    ))
                    sections.append(_format_metric(
                        "odin_llm_output_tokens_total",
                        cost_data.get("total_output_tokens", 0),
                        metric_type="counter",
                        help_text="Total estimated LLM output tokens",
                    ))
                    sections.append(_format_metric(
                        "odin_llm_cost_usd_total",
                        cost_data.get("total_cost_usd", 0),
                        metric_type="counter",
                        help_text="Total estimated LLM cost in USD",
                    ))
                    sections.append(_format_metric(
                        "odin_llm_requests_total",
                        cost_data.get("total_requests", 0),
                        metric_type="counter",
                        help_text="Total LLM API requests",
                    ))
                    by_user = cost_data.get("by_user", {})
                    if by_user:
                        sections.append(f"# HELP odin_llm_user_cost_usd LLM cost in USD by user")
                        sections.append(f"# TYPE odin_llm_user_cost_usd counter")
                        for uid, info in sorted(by_user.items()):
                            sections.append(_format_metric(
                                "odin_llm_user_cost_usd", info.get("cost_usd", 0),
                                labels={"user": uid},
                                include_header=False,
                            ))
                    by_channel = cost_data.get("by_channel", {})
                    if by_channel:
                        sections.append(f"# HELP odin_llm_channel_cost_usd LLM cost in USD by channel")
                        sections.append(f"# TYPE odin_llm_channel_cost_usd counter")
                        for cid, info in sorted(by_channel.items()):
                            sections.append(_format_metric(
                                "odin_llm_channel_cost_usd", info.get("cost_usd", 0),
                                labels={"channel": cid},
                                include_header=False,
                            ))
            except Exception:
                pass

        # -- Session token budget --
        session_tokens_source = self._sources.get("session_tokens")
        if session_tokens_source:
            try:
                token_data = session_tokens_source()
                if token_data:
                    sections.append(_format_metric(
                        "odin_session_tokens_total",
                        token_data.get("total_tokens", 0),
                        help_text="Total estimated tokens across all active sessions",
                    ))
                    sections.append(_format_metric(
                        "odin_session_token_budget",
                        token_data.get("token_budget", 0),
                        help_text="Configured per-session token budget",
                    ))
                    sections.append(_format_metric(
                        "odin_sessions_over_budget",
                        token_data.get("over_budget_count", 0),
                        help_text="Number of sessions exceeding token budget",
                    ))
                    per_session = token_data.get("per_session", {})
                    if per_session:
                        sections.append(f"# HELP odin_session_tokens Estimated tokens per session")
                        sections.append(f"# TYPE odin_session_tokens gauge")
                        for cid, tokens in sorted(per_session.items()):
                            sections.append(_format_metric(
                                "odin_session_tokens", tokens,
                                labels={"channel": cid},
                                include_header=False,
                            ))
            except Exception:
                pass

        # -- Trajectories --
        trajectory_source = self._sources.get("trajectories")
        if trajectory_source:
            try:
                traj_data = trajectory_source()
                if traj_data:
                    sections.append(_format_metric(
                        "odin_trajectories_saved_total",
                        traj_data.get("trajectories_saved_total", 0),
                        help_text="Total trajectory turns saved to disk",
                    ))
            except Exception:
                pass

        # -- Bulkheads --
        bulkhead_source = self._sources.get("bulkheads")
        if bulkhead_source:
            try:
                bh_data = bulkhead_source()
                if bh_data:
                    bh_count = bh_data.pop("bulkhead_count", 0)
                    sections.append(_format_metric(
                        "odin_bulkhead_count", bh_count,
                        help_text="Number of registered bulkheads",
                    ))
                    active_keys = sorted(
                        k for k in bh_data if k.endswith("_active")
                    )
                    if active_keys:
                        sections.append(
                            "# HELP odin_bulkhead_active Current active operations per bulkhead"
                        )
                        sections.append("# TYPE odin_bulkhead_active gauge")
                        for key in active_keys:
                            name = key.replace("bulkhead_", "").replace("_active", "")
                            sections.append(_format_metric(
                                "odin_bulkhead_active", bh_data[key],
                                labels={"bulkhead": name},
                                include_header=False,
                            ))
                    rejected_keys = sorted(
                        k for k in bh_data if k.endswith("_rejected")
                    )
                    if rejected_keys:
                        sections.append(
                            "# HELP odin_bulkhead_rejected_total Rejected requests per bulkhead"
                        )
                        sections.append("# TYPE odin_bulkhead_rejected_total counter")
                        for key in rejected_keys:
                            name = key.replace("bulkhead_", "").replace("_rejected", "")
                            sections.append(_format_metric(
                                "odin_bulkhead_rejected_total", bh_data[key],
                                labels={"bulkhead": name},
                                include_header=False,
                            ))
                    total_keys = sorted(
                        k for k in bh_data if k.endswith("_total")
                    )
                    if total_keys:
                        sections.append(
                            "# HELP odin_bulkhead_operations_total Total operations per bulkhead"
                        )
                        sections.append("# TYPE odin_bulkhead_operations_total counter")
                        for key in total_keys:
                            name = key.replace("bulkhead_", "").replace("_total", "")
                            sections.append(_format_metric(
                                "odin_bulkhead_operations_total", bh_data[key],
                                labels={"bulkhead": name},
                                include_header=False,
                            ))
            except Exception:
                pass

        # -- SSH Connection Pool --
        ssh_pool_source = self._sources.get("ssh_pool")
        if ssh_pool_source:
            try:
                pool_data = ssh_pool_source()
                if pool_data:
                    sections.append(_format_metric(
                        "odin_ssh_pool_active_connections",
                        pool_data.get("ssh_pool_active_connections", 0),
                        help_text="Active SSH ControlMaster connections",
                    ))
                    sections.append(_format_metric(
                        "odin_ssh_pool_total_opened",
                        pool_data.get("ssh_pool_total_opened", 0),
                        help_text="Total SSH connections opened",
                        metric_type="counter",
                    ))
                    sections.append(_format_metric(
                        "odin_ssh_pool_total_reused",
                        pool_data.get("ssh_pool_total_reused", 0),
                        help_text="Total SSH connections reused via multiplexing",
                        metric_type="counter",
                    ))
            except Exception:
                pass

        # -- HTTP Connection Pool --
        http_pool_source = self._sources.get("http_pool")
        if http_pool_source:
            try:
                pool_data = http_pool_source()
                if pool_data:
                    sections.append(_format_metric(
                        "odin_http_pool_active_connections",
                        pool_data.get("http_pool_active_connections", 0),
                        help_text="Active HTTP keepalive connections",
                    ))
                    sections.append(_format_metric(
                        "odin_http_pool_max_connections",
                        pool_data.get("http_pool_max_connections", 0),
                        help_text="HTTP connection pool max size",
                    ))
                    sections.append(_format_metric(
                        "odin_http_pool_total_requests",
                        pool_data.get("http_pool_total_requests", 0),
                        help_text="Total HTTP requests made via pool",
                        metric_type="counter",
                    ))
            except Exception:
                pass

        return "\n".join(sections) + "\n"
