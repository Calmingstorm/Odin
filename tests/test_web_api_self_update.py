"""Coverage for src/web/api/self_update.py (RFC-006 P7).

SAFETY: apply_update runs real `git reset --hard` / `checkout master` and
`os.kill(getpid(), SIGTERM)`. Every test stubs ALL exec primitives —
`subprocess.run`, `os.kill`, `os.path.exists`, `os.walk` — so the destructive
actions are impossible by construction (per the "never let a test run a
destructive command" rule). No real git command, signal, or filesystem walk
ever executes; we assert only on request parsing and response shaping.
"""
from __future__ import annotations

from subprocess import CompletedProcess
from unittest.mock import MagicMock, patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api.self_update import register_self_update


def _app(bot=None):
    routes = web.RouteTableDef()
    register_self_update(routes, bot or MagicMock())
    app = web.Application()
    app.router.add_routes(routes)
    return app


def _run_ok(cmd, **kw):
    """A fake subprocess.run: every git/gh call succeeds, nothing executes."""
    if any("releases/latest" in str(a) for a in cmd):
        return CompletedProcess(cmd, 0, stdout="v3.55.0\n", stderr="")  # resolve "latest"
    if "rev-parse" in cmd:
        return CompletedProcess(cmd, 0, stdout="abc123def456\n", stderr="")
    if "diff" in cmd:
        return CompletedProcess(cmd, 0, stdout="", stderr="")  # clean worktree
    return CompletedProcess(cmd, 0, stdout="", stderr="")


class TestCheckUpdate:
    async def test_gh_failure_502(self):
        with patch("subprocess.run",
                   return_value=CompletedProcess([], 1, stdout="", stderr="boom")):
            async with TestClient(TestServer(_app())) as c:
                assert (await c.get("/api/update/check")).status == 502

    async def test_update_available(self):
        gh = CompletedProcess([], 0, stdout="v99.0.0\nchangelog here", stderr="")
        with patch("subprocess.run", return_value=gh):
            async with TestClient(TestServer(_app())) as c:
                body = await (await c.get("/api/update/check")).json()
                assert body["latest"] == "v99.0.0" and body["update_available"] is True
                assert body["changelog"] == "changelog here"

    async def test_exception_502(self):
        with patch("subprocess.run", side_effect=RuntimeError("no gh")):
            async with TestClient(TestServer(_app())) as c:
                assert (await c.get("/api/update/check")).status == 502


class TestApplyUpdate:
    async def test_invalid_version_format(self):
        # reached before any git op — pass an explicit bad tag (not "latest")
        async with TestClient(TestServer(_app())) as c:
            r = await c.post("/api/update/apply", json={"version": "not-a-version"})
            assert r.status == 400 and "Invalid version format" in (await r.json())["error"]

    async def test_resolve_latest_failure(self):
        with patch("subprocess.run",
                   return_value=CompletedProcess([], 1, stdout="", stderr="")):
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "latest"})
                assert r.status == 502

    async def test_dirty_worktree_409(self):
        def _dirty(cmd, **kw):
            if "diff" in cmd:
                return CompletedProcess(cmd, 0, stdout="src/foo.py\nsrc/bar.py", stderr="")
            return CompletedProcess(cmd, 0, stdout="", stderr="")
        with patch("subprocess.run", side_effect=_dirty), \
             patch("os.path.exists", return_value=False):
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "v3.55.0"})
                assert r.status == 409 and "unexpected modifications" in (await r.json())["error"]

    async def test_step_failure_rolls_back(self):
        def _fail_merge(cmd, **kw):
            if "rev-parse" in cmd:
                return CompletedProcess(cmd, 0, stdout="prevsha123", stderr="")
            if "merge" in cmd:
                return CompletedProcess(cmd, 1, stdout="", stderr="not fast-forward")
            return CompletedProcess(cmd, 0, stdout="", stderr="")
        with patch("subprocess.run", side_effect=_fail_merge), \
             patch("os.path.exists", return_value=False), \
             patch("os.kill") as kill:
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "v3.55.0"})
                assert r.status == 500 and "fast-forward to release tag failed" in (
                    await r.json())["error"]
            kill.assert_not_called()

    async def test_success_schedules_restart(self):
        # SAFETY (Odin's #200 blocker): the handler does
        #   asyncio.get_event_loop().call_later(2, lambda: os.kill(getpid(), 15))
        # The lambda resolves os.kill at FIRE time, not schedule time — patching
        # os.kill alone would let a real SIGTERM fire if the loop outlives the
        # test. Stub the RUNNING loop's call_later so the restart callback is
        # recorded but never actually scheduled — impossible by construction.
        # (Patching asyncio.get_event_loop wholesale breaks aiohttp, which uses
        # the loop during the request; narrow the patch to call_later only.)
        import asyncio
        loop = asyncio.get_running_loop()
        recorded: list = []

        def _stub_call_later(delay, cb, *a):
            recorded.append((delay, cb))
            return MagicMock()  # a TimerHandle-shaped no-op; nothing is scheduled

        with patch("subprocess.run", side_effect=_run_ok), \
             patch("os.path.exists", return_value=False), \
             patch("os.walk", return_value=[]), \
             patch.object(loop, "call_later", _stub_call_later), \
             patch("os.kill") as kill:
            async with TestClient(TestServer(_app())) as c:
                # "latest" → resolved to v3.55.0 by _run_ok
                r = await c.post("/api/update/apply", json={"version": "latest"})
                assert r.status == 200
                body = await r.json()
                assert body["status"] == "updating" and body["version"] == "v3.55.0"
        # the restart was scheduled with a 2s delay + a callback, but our stub
        # never registers the SIGTERM callback on a live loop
        assert any(delay == 2 and callable(cb) for delay, cb in recorded)
        kill.assert_not_called()

    async def test_unexpected_exception_500(self):
        # subprocess raising mid-flow (inside the try) surfaces as a 500
        def _boom(cmd, **kw):
            if "diff" in cmd:
                raise RuntimeError("git exploded")
            return CompletedProcess(cmd, 0, stdout="", stderr="")
        with patch("subprocess.run", side_effect=_boom), \
             patch("os.path.exists", return_value=False):
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "v3.55.0"})
                assert r.status == 500 and "git exploded" in (await r.json())["error"]

    async def test_bad_json_defaults_to_latest(self):
        # invalid JSON → data={} → target defaults to "latest" → resolve attempt
        with patch("subprocess.run",
                   return_value=CompletedProcess([], 1, stdout="", stderr="")):
            async with TestClient(TestServer(_app())) as c:
                assert (await c.post("/api/update/apply", data="notjson")).status == 502


class TestStopAllLoops:
    async def test_stop_all(self):
        bot = MagicMock()
        bot.loop_manager.stop_loop.return_value = "stopped 3 loops"
        async with TestClient(TestServer(_app(bot))) as c:
            body = await (await c.post("/api/loops/stop-all")).json()
            assert body["result"] == "stopped 3 loops"
            bot.loop_manager.stop_loop.assert_called_once_with("all")
