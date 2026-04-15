"""Tests for Prometheus metrics endpoint and MetricsCollector.

Covers:
- /metrics endpoint returns text/plain Prometheus format
- Process info metrics (odin_up, odin_start_time_seconds, odin_uptime_seconds)
- Tool execution metrics (calls, errors, timeouts per tool)
- Component health metrics
- Circuit breaker metrics
- Session count metrics
- Scheduler count metrics
- Autonomous loop count metrics
- Label escaping
- Error resilience (broken sources don't crash)
- MetricsCollector in isolation
"""

from __future__ import annotations

import time

import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import WebhookConfig
from src.health.metrics import MetricsCollector, _escape_label_value, _format_metric
from src.health.server import HealthServer


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_server(*, ready: bool = True) -> HealthServer:
    cfg = WebhookConfig(enabled=False)
    server = HealthServer(port=0, webhook_config=cfg)
    if ready:
        server.set_ready(True)
    return server


# ---------------------------------------------------------------------------
# MetricsCollector unit tests
# ---------------------------------------------------------------------------

class TestMetricsCollector:
    def test_render_minimal(self):
        mc = MetricsCollector()
        output = mc.render()
        assert "odin_up 0" in output
        assert "odin_start_time_seconds" in output
        assert "odin_uptime_seconds" in output

    def test_render_ready(self):
        mc = MetricsCollector()
        mc.set_ready(True)
        output = mc.render()
        assert "odin_up 1" in output

    def test_render_not_ready(self):
        mc = MetricsCollector()
        mc.set_ready(False)
        output = mc.render()
        assert "odin_up 0" in output

    def test_tool_metrics(self):
        mc = MetricsCollector()
        mc.register_source("tools", lambda: {
            "run_command": {"calls": 10, "errors": 2, "timeouts": 1},
            "read_file": {"calls": 5, "errors": 0, "timeouts": 0},
        })
        output = mc.render()
        assert 'odin_tool_calls_total{tool="run_command"} 10' in output
        assert 'odin_tool_errors_total{tool="run_command"} 2' in output
        assert 'odin_tool_timeouts_total{tool="run_command"} 1' in output
        assert 'odin_tool_calls_total{tool="read_file"} 5' in output
        assert 'odin_tool_errors_total{tool="read_file"} 0' in output

    def test_tool_metrics_empty(self):
        mc = MetricsCollector()
        mc.register_source("tools", lambda: {})
        output = mc.render()
        # No tool metrics when empty
        assert "odin_tool_calls_total" not in output

    def test_component_health_metrics(self):
        mc = MetricsCollector()
        mc.set_component_check(lambda: {
            "database": {"healthy": True, "detail": "connected"},
            "llm": {"healthy": False, "detail": "circuit open"},
        })
        output = mc.render()
        assert 'odin_component_healthy{component="database"} 1' in output
        assert 'odin_component_healthy{component="llm"} 0' in output

    def test_component_health_empty(self):
        mc = MetricsCollector()
        mc.set_component_check(lambda: {})
        output = mc.render()
        assert "odin_component_healthy" not in output

    def test_circuit_breaker_metrics(self):
        class FakeCB:
            state = "closed"
            _failure_count = 0

        mc = MetricsCollector()
        mc.register_source("circuit_breaker", lambda: FakeCB())
        output = mc.render()
        assert "odin_circuit_breaker_state 0" in output
        assert "odin_circuit_breaker_failures 0" in output

    def test_circuit_breaker_open(self):
        class FakeCB:
            state = "open"
            _failure_count = 5

        mc = MetricsCollector()
        mc.register_source("circuit_breaker", lambda: FakeCB())
        output = mc.render()
        assert "odin_circuit_breaker_state 2" in output
        assert "odin_circuit_breaker_failures 5" in output

    def test_circuit_breaker_half_open(self):
        class FakeCB:
            state = "half_open"
            _failure_count = 3

        mc = MetricsCollector()
        mc.register_source("circuit_breaker", lambda: FakeCB())
        output = mc.render()
        assert "odin_circuit_breaker_state 1" in output

    def test_session_count(self):
        mc = MetricsCollector()
        mc.register_source("sessions", lambda: 7)
        output = mc.render()
        assert "odin_active_sessions 7" in output

    def test_scheduler_count(self):
        mc = MetricsCollector()
        mc.register_source("scheduler", lambda: 12)
        output = mc.render()
        assert "odin_schedules_total 12" in output

    def test_loop_count(self):
        mc = MetricsCollector()
        mc.register_source("loops", lambda: 3)
        output = mc.render()
        assert "odin_active_loops 3" in output

    def test_broken_source_does_not_crash(self):
        mc = MetricsCollector()
        mc.register_source("tools", lambda: (_ for _ in ()).throw(RuntimeError("boom")))
        mc.register_source("sessions", lambda: 5)
        output = mc.render()
        # Tool metrics absent but sessions still present
        assert "odin_tool_calls_total" not in output
        assert "odin_active_sessions 5" in output

    def test_broken_component_check_does_not_crash(self):
        mc = MetricsCollector()

        def bad_check():
            raise RuntimeError("check failed")

        mc.set_component_check(bad_check)
        output = mc.render()
        # Should still render process info
        assert "odin_up" in output
        assert "odin_component_healthy" not in output

    def test_help_and_type_headers(self):
        mc = MetricsCollector()
        mc.set_ready(True)
        output = mc.render()
        assert "# HELP odin_up" in output
        assert "# TYPE odin_up gauge" in output
        assert "# HELP odin_uptime_seconds" in output

    def test_ends_with_newline(self):
        mc = MetricsCollector()
        output = mc.render()
        assert output.endswith("\n")

    def test_uptime_is_positive(self):
        mc = MetricsCollector()
        output = mc.render()
        for line in output.split("\n"):
            if line.startswith("odin_uptime_seconds "):
                val = float(line.split()[-1])
                assert val >= 0


# ---------------------------------------------------------------------------
# Label escaping
# ---------------------------------------------------------------------------

class TestLabelEscaping:
    def test_escape_backslash(self):
        assert _escape_label_value("a\\b") == "a\\\\b"

    def test_escape_double_quote(self):
        assert _escape_label_value('a"b') == 'a\\"b'

    def test_escape_newline(self):
        assert _escape_label_value("a\nb") == "a\\nb"

    def test_escape_combined(self):
        assert _escape_label_value('a\\"\n') == 'a\\\\\\"\\n'

    def test_no_escape_needed(self):
        assert _escape_label_value("run_command") == "run_command"


# ---------------------------------------------------------------------------
# _format_metric
# ---------------------------------------------------------------------------

class TestFormatMetric:
    def test_simple_gauge(self):
        result = _format_metric("test_metric", 42, help_text="A test")
        assert "# HELP test_metric A test" in result
        assert "# TYPE test_metric gauge" in result
        assert "test_metric 42" in result

    def test_counter_with_labels(self):
        result = _format_metric(
            "test_total", 10,
            metric_type="counter",
            labels={"method": "GET", "status": "200"},
        )
        assert "# TYPE test_total counter" in result
        assert 'test_total{method="GET",status="200"} 10' in result

    def test_no_header(self):
        result = _format_metric("test_val", 5, include_header=False)
        assert "# HELP" not in result
        assert "# TYPE" not in result
        assert "test_val 5" in result

    def test_labels_sorted(self):
        result = _format_metric(
            "m", 1,
            labels={"z_label": "z", "a_label": "a"},
            include_header=False,
        )
        assert 'a_label="a",z_label="z"' in result


# ---------------------------------------------------------------------------
# /metrics HTTP endpoint
# ---------------------------------------------------------------------------

class TestMetricsEndpoint:
    async def test_metrics_returns_200(self):
        server = _make_server(ready=True)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/metrics")
            assert resp.status == 200
            text = await resp.text()
            assert "odin_up 1" in text

    async def test_metrics_content_type(self):
        server = _make_server(ready=True)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/metrics")
            ct = resp.headers.get("Content-Type", "")
            assert "text/plain" in ct

    async def test_metrics_when_not_ready(self):
        server = _make_server(ready=False)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/metrics")
            assert resp.status == 200  # /metrics always returns 200
            text = await resp.text()
            assert "odin_up 0" in text

    async def test_metrics_with_components(self):
        server = _make_server(ready=True)
        server.register_component("db", lambda: (True, "ok"))
        server.register_component("cache", lambda: (False, "down"))
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/metrics")
            text = await resp.text()
            assert 'odin_component_healthy{component="db"} 1' in text
            assert 'odin_component_healthy{component="cache"} 0' in text

    async def test_metrics_with_tool_source(self):
        server = _make_server(ready=True)
        server.metrics.register_source("tools", lambda: {
            "run_command": {"calls": 5, "errors": 1, "timeouts": 0},
        })
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/metrics")
            text = await resp.text()
            assert 'odin_tool_calls_total{tool="run_command"} 5' in text
            assert 'odin_tool_errors_total{tool="run_command"} 1' in text

    async def test_metrics_with_session_source(self):
        server = _make_server(ready=True)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/metrics")
            text = await resp.text()
            # Default sessions source returns 0
            assert "odin_active_sessions 0" in text

    async def test_metrics_accessible_without_auth(self):
        """Verify /metrics is in the auth-skip list and accessible without token."""
        from src.health.server import _AUTH_SKIP_PREFIXES
        assert any("/metrics".startswith(p) for p in _AUTH_SKIP_PREFIXES)

    async def test_metrics_includes_all_sections(self):
        server = _make_server(ready=True)
        server.register_component("test_comp", lambda: (True, "ok"))
        server.metrics.register_source("tools", lambda: {
            "web_search": {"calls": 3, "errors": 0, "timeouts": 0},
        })
        server.metrics.register_source("scheduler", lambda: 4)
        server.metrics.register_source("loops", lambda: 2)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/metrics")
            text = await resp.text()
            assert "odin_up 1" in text
            assert "odin_start_time_seconds" in text
            assert "odin_uptime_seconds" in text
            assert "odin_component_healthy" in text
            assert "odin_tool_calls_total" in text
            assert "odin_schedules_total 4" in text
            assert "odin_active_loops 2" in text
            assert "odin_active_sessions 0" in text


# ---------------------------------------------------------------------------
# HealthServer.metrics property
# ---------------------------------------------------------------------------

class TestHealthServerMetricsProperty:
    def test_metrics_property_returns_collector(self):
        server = _make_server()
        assert isinstance(server.metrics, MetricsCollector)

    def test_set_ready_syncs_to_collector(self):
        server = _make_server(ready=False)
        output = server.metrics.render()
        assert "odin_up 0" in output
        server.set_ready(True)
        output = server.metrics.render()
        assert "odin_up 1" in output

    def test_register_component_syncs_to_collector(self):
        server = _make_server(ready=True)
        server.register_component("my_comp", lambda: (True, "fine"))
        output = server.metrics.render()
        assert 'odin_component_healthy{component="my_comp"} 1' in output
