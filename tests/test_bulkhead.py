"""Tests for bulkhead isolation — concurrency limiting, config, executor integration,
planner gather isolation, Prometheus metrics, and REST API."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.tools.bulkhead import Bulkhead, BulkheadFullError, BulkheadRegistry
from src.config.schema import BulkheadConfig, ToolHost, ToolsConfig


# =====================================================================
# Bulkhead core
# =====================================================================


class TestBulkhead:
    @pytest.mark.asyncio
    async def test_acquire_and_release(self):
        bh = Bulkhead("test", max_concurrent=2)
        assert bh.active == 0
        assert bh.total == 0
        async with bh.acquire():
            assert bh.active == 1
            assert bh.total == 1
        assert bh.active == 0
        assert bh.total == 1

    @pytest.mark.asyncio
    async def test_concurrent_limit(self):
        bh = Bulkhead("test", max_concurrent=2)
        acquired = []

        async def _worker(idx: int):
            async with bh.acquire():
                acquired.append(idx)
                assert bh.active <= 2
                await asyncio.sleep(0.01)

        await asyncio.gather(*[_worker(i) for i in range(5)])
        assert bh.total == 5
        assert bh.active == 0
        assert len(acquired) == 5

    @pytest.mark.asyncio
    async def test_reject_when_queue_full(self):
        bh = Bulkhead("test", max_concurrent=1, max_queued=1)
        gate = asyncio.Event()

        async def _hold():
            async with bh.acquire():
                await gate.wait()

        # Fill the active slot
        hold_task = asyncio.create_task(_hold())
        await asyncio.sleep(0.01)
        assert bh.active == 1

        # Fill the queue slot
        async def _queue():
            async with bh.acquire():
                pass

        queue_task = asyncio.create_task(_queue())
        await asyncio.sleep(0.01)
        assert bh.queued == 1

        # Third should be rejected
        with pytest.raises(BulkheadFullError) as exc_info:
            async with bh.acquire():
                pass
        assert "test" in str(exc_info.value)
        assert bh.rejected == 1

        gate.set()
        await hold_task
        await queue_task

    @pytest.mark.asyncio
    async def test_error_tracking(self):
        bh = Bulkhead("test", max_concurrent=5)
        with pytest.raises(ValueError):
            async with bh.acquire():
                raise ValueError("boom")
        assert bh.errors == 1
        assert bh.active == 0
        assert bh.total == 1

    @pytest.mark.asyncio
    async def test_metrics(self):
        bh = Bulkhead("ssh", max_concurrent=10, max_queued=20)
        async with bh.acquire():
            m = bh.get_metrics()
            assert m["active"] == 1
        m = bh.get_metrics()
        assert m["name"] == "ssh"
        assert m["max_concurrent"] == 10
        assert m["max_queued"] == 20
        assert m["total"] == 1
        assert m["active"] == 0
        assert m["errors"] == 0
        assert m["rejected"] == 0

    def test_properties(self):
        bh = Bulkhead("test", max_concurrent=5, max_queued=10)
        assert bh.name == "test"
        assert bh.max_concurrent == 5
        assert bh.max_queued == 10
        assert bh.active == 0
        assert bh.queued == 0
        assert bh.total == 0
        assert bh.rejected == 0
        assert bh.errors == 0

    @pytest.mark.asyncio
    async def test_no_queue_limit_means_unlimited_queuing(self):
        bh = Bulkhead("test", max_concurrent=1, max_queued=0)
        gate = asyncio.Event()
        acquired_count = 0

        async def _worker():
            nonlocal acquired_count
            async with bh.acquire():
                acquired_count += 1
                await gate.wait()

        tasks = [asyncio.create_task(_worker()) for _ in range(5)]
        await asyncio.sleep(0.05)
        assert bh.active == 1
        # All others queued without rejection
        assert bh.rejected == 0

        gate.set()
        await asyncio.gather(*tasks)
        assert acquired_count == 5


# =====================================================================
# BulkheadRegistry
# =====================================================================


class TestBulkheadRegistry:
    def test_register_and_get(self):
        reg = BulkheadRegistry()
        bh = reg.register("ssh", max_concurrent=10, max_queued=20)
        assert bh.name == "ssh"
        assert reg.get("ssh") is bh

    def test_get_missing(self):
        reg = BulkheadRegistry()
        assert reg.get("nonexistent") is None

    def test_get_or_create_new(self):
        reg = BulkheadRegistry()
        bh = reg.get_or_create("ssh", max_concurrent=10)
        assert bh.name == "ssh"
        assert reg.get("ssh") is bh

    def test_get_or_create_existing(self):
        reg = BulkheadRegistry()
        bh1 = reg.register("ssh", max_concurrent=10)
        bh2 = reg.get_or_create("ssh", max_concurrent=99)
        assert bh1 is bh2
        assert bh2.max_concurrent == 10

    def test_names(self):
        reg = BulkheadRegistry()
        reg.register("ssh", 10)
        reg.register("browser", 3)
        assert sorted(reg.names) == ["browser", "ssh"]

    def test_get_all_metrics(self):
        reg = BulkheadRegistry()
        reg.register("ssh", 10)
        reg.register("subprocess", 20)
        m = reg.get_all_metrics()
        assert "ssh" in m
        assert "subprocess" in m
        assert m["ssh"]["max_concurrent"] == 10

    def test_get_prometheus_metrics(self):
        reg = BulkheadRegistry()
        reg.register("ssh", 10)
        m = reg.get_prometheus_metrics()
        assert m["bulkhead_count"] == 1
        assert "bulkhead_ssh_active" in m
        assert "bulkhead_ssh_total" in m
        assert "bulkhead_ssh_rejected" in m
        assert "bulkhead_ssh_errors" in m
        assert "bulkhead_ssh_max_concurrent" in m

    def test_empty_registry_metrics(self):
        reg = BulkheadRegistry()
        m = reg.get_prometheus_metrics()
        assert m == {"bulkhead_count": 0}


# =====================================================================
# BulkheadFullError
# =====================================================================


class TestBulkheadFullError:
    def test_message(self):
        err = BulkheadFullError("ssh", 10, 20)
        assert "ssh" in str(err)
        assert err.bulkhead_name == "ssh"


# =====================================================================
# BulkheadConfig
# =====================================================================


class TestBulkheadConfig:
    def test_defaults(self):
        cfg = BulkheadConfig()
        assert cfg.ssh_max_concurrent == 10
        assert cfg.subprocess_max_concurrent == 20
        assert cfg.browser_max_concurrent == 3
        assert cfg.ssh_max_queued == 20
        assert cfg.subprocess_max_queued == 40
        assert cfg.browser_max_queued == 6

    def test_custom(self):
        cfg = BulkheadConfig(ssh_max_concurrent=5, browser_max_queued=10)
        assert cfg.ssh_max_concurrent == 5
        assert cfg.browser_max_queued == 10

    def test_on_tools_config(self):
        tc = ToolsConfig()
        assert isinstance(tc.bulkhead, BulkheadConfig)
        assert tc.bulkhead.ssh_max_concurrent == 10

    def test_custom_on_tools_config(self):
        tc = ToolsConfig(bulkhead=BulkheadConfig(ssh_max_concurrent=3))
        assert tc.bulkhead.ssh_max_concurrent == 3

    def test_from_dict(self):
        tc = ToolsConfig(**{"bulkhead": {"ssh_max_concurrent": 7}})
        assert tc.bulkhead.ssh_max_concurrent == 7
        assert tc.bulkhead.subprocess_max_concurrent == 20

    def test_without_bulkhead(self):
        tc = ToolsConfig()
        assert tc.bulkhead.ssh_max_concurrent == 10


# =====================================================================
# Executor bulkhead integration
# =====================================================================


class TestExecutorBulkheadIntegration:
    def test_executor_has_bulkhead_registry(self):
        from src.tools.executor import ToolExecutor
        ex = ToolExecutor()
        assert hasattr(ex, "bulkheads")
        assert isinstance(ex.bulkheads, BulkheadRegistry)

    def test_executor_creates_three_bulkheads(self):
        from src.tools.executor import ToolExecutor
        ex = ToolExecutor()
        assert ex.bulkheads.get("ssh") is not None
        assert ex.bulkheads.get("subprocess") is not None
        assert ex.bulkheads.get("browser") is not None

    def test_executor_bulkhead_config_applied(self):
        from src.tools.executor import ToolExecutor
        cfg = ToolsConfig(bulkhead=BulkheadConfig(ssh_max_concurrent=3))
        ex = ToolExecutor(config=cfg)
        ssh_bh = ex.bulkheads.get("ssh")
        assert ssh_bh.max_concurrent == 3

    @pytest.mark.asyncio
    async def test_ssh_command_uses_bulkhead(self):
        from src.tools.executor import ToolExecutor
        cfg = ToolsConfig(
            hosts={"srv": ToolHost(address="10.0.0.1", ssh_user="root", os="linux")},
            bulkhead=BulkheadConfig(ssh_max_concurrent=2),
        )
        ex = ToolExecutor(config=cfg)
        ssh_bh = ex.bulkheads.get("ssh")

        with patch("src.tools.executor.run_ssh_command", new_callable=AsyncMock) as mock_ssh:
            mock_ssh.return_value = (0, "ok")
            await ex._exec_command("10.0.0.1", "echo hi")
            mock_ssh.assert_called_once()
            assert ssh_bh.total == 1
            assert ssh_bh.active == 0

    @pytest.mark.asyncio
    async def test_local_command_uses_subprocess_bulkhead(self):
        from src.tools.executor import ToolExecutor
        ex = ToolExecutor()
        sub_bh = ex.bulkheads.get("subprocess")

        with patch("src.tools.executor.run_local_command", new_callable=AsyncMock) as mock_local:
            mock_local.return_value = (0, "ok")
            await ex._exec_command("127.0.0.1", "echo hi")
            mock_local.assert_called_once()
            assert sub_bh.total == 1

    @pytest.mark.asyncio
    async def test_ssh_bulkhead_full_returns_error(self):
        from src.tools.executor import ToolExecutor
        cfg = ToolsConfig(
            bulkhead=BulkheadConfig(ssh_max_concurrent=1, ssh_max_queued=1),
        )
        ex = ToolExecutor(config=cfg)
        ssh_bh = ex.bulkheads.get("ssh")
        gate = asyncio.Event()

        async def _slow_ssh(*a, **kw):
            await gate.wait()
            return (0, "ok")

        with patch("src.tools.executor.run_ssh_command", side_effect=_slow_ssh):
            # Fill active slot
            t1 = asyncio.create_task(ex._exec_command("10.0.0.1", "cmd1"))
            await asyncio.sleep(0.01)
            # Fill queue slot
            t2 = asyncio.create_task(ex._exec_command("10.0.0.1", "cmd2"))
            await asyncio.sleep(0.01)
            # Third should get error (not exception)
            code, output = await ex._exec_command("10.0.0.1", "cmd3")
            assert code == 1
            assert "SSH bulkhead full" in output

            gate.set()
            await t1
            await t2

    @pytest.mark.asyncio
    async def test_subprocess_bulkhead_full_returns_error(self):
        from src.tools.executor import ToolExecutor
        cfg = ToolsConfig(
            bulkhead=BulkheadConfig(subprocess_max_concurrent=1, subprocess_max_queued=1),
        )
        ex = ToolExecutor(config=cfg)
        gate = asyncio.Event()

        async def _slow_local(*a, **kw):
            await gate.wait()
            return (0, "ok")

        with patch("src.tools.executor.run_local_command", side_effect=_slow_local):
            t1 = asyncio.create_task(ex._exec_command("127.0.0.1", "cmd1"))
            await asyncio.sleep(0.01)
            t2 = asyncio.create_task(ex._exec_command("localhost", "cmd2"))
            await asyncio.sleep(0.01)
            code, output = await ex._exec_command("localhost", "cmd3")
            assert code == 1
            assert "subprocess bulkhead full" in output

            gate.set()
            await t1
            await t2

    @pytest.mark.asyncio
    async def test_browser_bulkhead_wraps_handler(self):
        from src.tools.executor import ToolExecutor
        cfg = ToolsConfig(
            bulkhead=BulkheadConfig(browser_max_concurrent=2),
        )
        mock_browser = MagicMock()
        ex = ToolExecutor(config=cfg, browser_manager=mock_browser)
        browser_bh = ex.bulkheads.get("browser")

        with patch("src.tools.browser.handle_browser_read_page", new_callable=AsyncMock) as mock_handler:
            mock_handler.return_value = "page content"
            result = await ex._handle_browser_read_page({"url": "http://example.com"})
            assert result == "page content"
            assert browser_bh.total == 1


# =====================================================================
# Planner gather isolation
# =====================================================================


class TestPlannerGatherIsolation:
    @pytest.mark.asyncio
    async def test_step_exception_does_not_crash_gather(self):
        from src.odin.planner import Planner
        from src.odin.registry import ToolRegistry
        from src.odin.types import PlanSpec, StepSpec, StepStatus

        class GoodTool:
            def execute(self, params, ctx):
                return "ok"

        class BadTool:
            def execute(self, params, ctx):
                raise RuntimeError("kaboom")

        registry = ToolRegistry()
        registry.register("good", GoodTool)
        registry.register("bad", BadTool)

        plan = PlanSpec(
            name="test",
            steps=[
                StepSpec(id="s1", tool="good", params={}),
                StepSpec(id="s2", tool="bad", params={}),
            ],
        )

        planner = Planner(registry)
        result = await planner.execute(plan)
        # s1 should succeed, s2 should fail — both recorded, no crash
        assert result.steps["s1"].status == StepStatus.SUCCESS
        assert result.steps["s2"].status == StepStatus.FAILED

    @pytest.mark.asyncio
    async def test_parallel_steps_both_recorded(self):
        from src.odin.planner import Planner
        from src.odin.registry import ToolRegistry
        from src.odin.types import PlanSpec, StepSpec, StepStatus

        class SlowGood:
            async def execute(self, params, ctx):
                await asyncio.sleep(0.01)
                return "done"

        class SlowBad:
            async def execute(self, params, ctx):
                await asyncio.sleep(0.01)
                raise Exception("fail")

        registry = ToolRegistry()
        registry.register("slow_good", SlowGood)
        registry.register("slow_bad", SlowBad)

        plan = PlanSpec(
            name="parallel-test",
            steps=[
                StepSpec(id="a", tool="slow_good", params={}),
                StepSpec(id="b", tool="slow_bad", params={}),
            ],
        )

        planner = Planner(registry)
        result = await planner.execute(plan)
        assert "a" in result.steps
        assert "b" in result.steps
        assert result.steps["a"].status == StepStatus.SUCCESS
        assert result.steps["b"].status == StepStatus.FAILED

    @pytest.mark.asyncio
    async def test_failed_step_cascades_to_dependents(self):
        from src.odin.planner import Planner
        from src.odin.registry import ToolRegistry
        from src.odin.types import PlanSpec, StepSpec, StepStatus

        class OkTool:
            def execute(self, params, ctx):
                return "ok"

        class FailTool:
            def execute(self, params, ctx):
                raise RuntimeError("nope")

        registry = ToolRegistry()
        registry.register("ok", OkTool)
        registry.register("fail", FailTool)

        plan = PlanSpec(
            name="cascade-test",
            steps=[
                StepSpec(id="root", tool="fail", params={}),
                StepSpec(id="child", tool="ok", params={}, depends_on=["root"]),
            ],
        )

        planner = Planner(registry)
        result = await planner.execute(plan)
        assert result.steps["root"].status == StepStatus.FAILED
        assert result.steps["child"].status == StepStatus.SKIPPED


# =====================================================================
# Prometheus metrics
# =====================================================================


class TestBulkheadPrometheusMetrics:
    def test_metrics_rendered(self):
        from src.health.metrics import MetricsCollector
        reg = BulkheadRegistry()
        reg.register("ssh", 10)
        reg.register("subprocess", 20)
        collector = MetricsCollector()
        collector.register_source("bulkheads", reg.get_prometheus_metrics)
        output = collector.render()
        assert "odin_bulkhead_count" in output
        assert "odin_bulkhead_active" in output
        assert 'bulkhead="ssh"' in output
        assert 'bulkhead="subprocess"' in output

    def test_metrics_absent(self):
        from src.health.metrics import MetricsCollector
        collector = MetricsCollector()
        output = collector.render()
        assert "odin_bulkhead" not in output

    def test_metrics_empty_registry(self):
        from src.health.metrics import MetricsCollector
        reg = BulkheadRegistry()
        collector = MetricsCollector()
        collector.register_source("bulkheads", reg.get_prometheus_metrics)
        output = collector.render()
        assert "odin_bulkhead_count 0" in output

    @pytest.mark.asyncio
    async def test_metrics_update_after_operations(self):
        from src.health.metrics import MetricsCollector
        reg = BulkheadRegistry()
        bh = reg.register("ssh", 10)
        async with bh.acquire():
            pass
        async with bh.acquire():
            pass
        collector = MetricsCollector()
        collector.register_source("bulkheads", reg.get_prometheus_metrics)
        output = collector.render()
        assert "odin_bulkhead_operations_total" in output

    def test_rejected_metrics(self):
        from src.health.metrics import MetricsCollector
        reg = BulkheadRegistry()
        reg.register("ssh", 10)
        collector = MetricsCollector()
        collector.register_source("bulkheads", reg.get_prometheus_metrics)
        output = collector.render()
        assert "odin_bulkhead_rejected_total" in output


# =====================================================================
# REST API
# =====================================================================


class TestBulkheadAPI:
    @pytest.mark.asyncio
    async def test_get_bulkheads(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        app = web.Application()
        routes = web.RouteTableDef()

        mock_bot = MagicMock()
        reg = BulkheadRegistry()
        reg.register("ssh", 10, 20)
        reg.register("subprocess", 20, 40)
        mock_executor = MagicMock()
        mock_executor.bulkheads = reg
        mock_bot.executor = mock_executor

        @routes.get("/api/tools/bulkheads")
        async def handler(_request):
            return web.json_response(mock_bot.executor.bulkheads.get_all_metrics())

        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/tools/bulkheads")
            assert resp.status == 200
            data = await resp.json()
            assert "ssh" in data
            assert data["ssh"]["max_concurrent"] == 10
            assert data["subprocess"]["max_concurrent"] == 20

    @pytest.mark.asyncio
    async def test_get_bulkheads_unavailable(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer

        app = web.Application()
        routes = web.RouteTableDef()

        mock_bot = MagicMock(spec=[])

        @routes.get("/api/tools/bulkheads")
        async def handler(_request):
            executor = getattr(mock_bot, "executor", None)
            if executor is None or not hasattr(executor, "bulkheads"):
                return web.json_response({"error": "bulkheads not available"}, status=503)
            return web.json_response(executor.bulkheads.get_all_metrics())

        app.router.add_routes(routes)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/tools/bulkheads")
            assert resp.status == 503


# =====================================================================
# _build_bulkhead_registry
# =====================================================================


class TestBuildBulkheadRegistry:
    def test_from_default_config(self):
        from src.tools.executor import _build_bulkhead_registry
        cfg = ToolsConfig()
        reg = _build_bulkhead_registry(cfg)
        ssh = reg.get("ssh")
        assert ssh is not None
        assert ssh.max_concurrent == 10
        assert ssh.max_queued == 20
        sub = reg.get("subprocess")
        assert sub is not None
        assert sub.max_concurrent == 20
        browser = reg.get("browser")
        assert browser is not None
        assert browser.max_concurrent == 3

    def test_from_custom_config(self):
        from src.tools.executor import _build_bulkhead_registry
        cfg = ToolsConfig(bulkhead=BulkheadConfig(
            ssh_max_concurrent=5,
            subprocess_max_concurrent=8,
            browser_max_concurrent=1,
        ))
        reg = _build_bulkhead_registry(cfg)
        assert reg.get("ssh").max_concurrent == 5
        assert reg.get("subprocess").max_concurrent == 8
        assert reg.get("browser").max_concurrent == 1


# =====================================================================
# Full Config round-trip
# =====================================================================


class TestConfigRoundTrip:
    def test_full_config_with_bulkhead(self):
        from src.config.schema import Config
        cfg = Config(
            discord={"token": "test"},
            tools={"bulkhead": {"ssh_max_concurrent": 5}},
        )
        assert cfg.tools.bulkhead.ssh_max_concurrent == 5
        assert cfg.tools.bulkhead.subprocess_max_concurrent == 20

    def test_full_config_without_bulkhead(self):
        from src.config.schema import Config
        cfg = Config(discord={"token": "test"})
        assert isinstance(cfg.tools.bulkhead, BulkheadConfig)
        assert cfg.tools.bulkhead.ssh_max_concurrent == 10

    def test_model_dump_includes_bulkhead(self):
        cfg = ToolsConfig(bulkhead=BulkheadConfig(ssh_max_concurrent=3))
        d = cfg.model_dump()
        assert "bulkhead" in d
        assert d["bulkhead"]["ssh_max_concurrent"] == 3


# =====================================================================
# Isolation semantics — SSH failures don't affect Codex
# =====================================================================


class TestIsolationSemantics:
    @pytest.mark.asyncio
    async def test_ssh_errors_dont_block_local(self):
        """SSH failures must not prevent local subprocess execution."""
        from src.tools.executor import ToolExecutor
        cfg = ToolsConfig(
            bulkhead=BulkheadConfig(ssh_max_concurrent=2),
        )
        ex = ToolExecutor(config=cfg)

        with patch("src.tools.executor.run_ssh_command", new_callable=AsyncMock) as mock_ssh, \
             patch("src.tools.executor.run_local_command", new_callable=AsyncMock) as mock_local:
            mock_ssh.side_effect = Exception("SSH is down")
            mock_local.return_value = (0, "local ok")

            # SSH command fails (exception propagates through bulkhead)
            with pytest.raises(Exception, match="SSH is down"):
                await ex._exec_command("10.0.0.1", "ssh cmd")
            # SSH bulkhead tracked the error
            ssh_bh = ex.bulkheads.get("ssh")
            assert ssh_bh.errors == 1
            # But local still works — separate bulkhead
            code_local, output = await ex._exec_command("127.0.0.1", "local cmd")
            assert code_local == 0
            assert output == "local ok"

    @pytest.mark.asyncio
    async def test_ssh_bulkhead_tracks_errors(self):
        from src.tools.executor import ToolExecutor
        cfg = ToolsConfig(
            bulkhead=BulkheadConfig(ssh_max_concurrent=5),
        )
        ex = ToolExecutor(config=cfg)

        with patch("src.tools.executor.run_ssh_command", new_callable=AsyncMock) as mock_ssh:
            mock_ssh.side_effect = Exception("connection refused")
            with pytest.raises(Exception, match="connection refused"):
                await ex._exec_command("10.0.0.1", "test")
            ssh_bh = ex.bulkheads.get("ssh")
            assert ssh_bh.errors == 1

    @pytest.mark.asyncio
    async def test_separate_bulkheads_independent(self):
        """Each bulkhead has its own semaphore — they don't share capacity."""
        from src.tools.executor import ToolExecutor
        ex = ToolExecutor()
        ssh_bh = ex.bulkheads.get("ssh")
        sub_bh = ex.bulkheads.get("subprocess")
        # They are distinct objects
        assert ssh_bh is not sub_bh
        assert ssh_bh._semaphore is not sub_bh._semaphore

    @pytest.mark.asyncio
    async def test_tool_execute_catches_bulkhead_error(self):
        """When bulkhead is full, execute() returns error string, not exception."""
        from src.tools.executor import ToolExecutor
        cfg = ToolsConfig(
            hosts={"srv": ToolHost(address="10.0.0.1", ssh_user="root", os="linux")},
            bulkhead=BulkheadConfig(ssh_max_concurrent=1, ssh_max_queued=1),
        )
        ex = ToolExecutor(config=cfg)
        gate = asyncio.Event()

        async def _slow_ssh(*a, **kw):
            await gate.wait()
            return (0, "ok")

        with patch("src.tools.executor.run_ssh_command", side_effect=_slow_ssh):
            # Fill active + queue
            t1 = asyncio.create_task(ex._exec_command("10.0.0.1", "c1"))
            await asyncio.sleep(0.01)
            t2 = asyncio.create_task(ex._exec_command("10.0.0.1", "c2"))
            await asyncio.sleep(0.01)

            # run_command via execute() should return error string
            result = await ex.execute("run_command", {"host": "srv", "command": "c3"})
            assert "SSH bulkhead full" in result

            gate.set()
            await t1
            await t2
