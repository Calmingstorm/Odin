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
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src import restart
from src.web.api.self_update import register_self_update


def _app(bot=None):
    routes = web.RouteTableDef()
    register_self_update(routes, bot or MagicMock())
    app = web.Application()
    app.router.add_routes(routes)
    return app


def _run_ok(cmd, **kw):
    """A fake subprocess.run: every git/gh call succeeds, nothing executes.

    The worktree probe answers "true" — `git rev-parse --is-inside-work-tree`
    is what abstracts a directory .git from a linked worktree's FILE .git,
    which is exactly why the handler asks git instead of the filesystem.
    """
    if "--is-inside-work-tree" in cmd:
        return CompletedProcess(cmd, 0, stdout="true\n", stderr="")
    if any("releases/latest" in str(a) for a in cmd):
        return CompletedProcess(cmd, 0, stdout="v3.55.0\n", stderr="")  # resolve "latest"
    if "rev-parse" in cmd:
        return CompletedProcess(cmd, 0, stdout="abc123def456\n", stderr="")
    if "diff" in cmd:
        return CompletedProcess(cmd, 0, stdout="", stderr="")  # clean worktree
    return CompletedProcess(cmd, 0, stdout="", stderr="")


def _git_ok_but_resolve_fails(cmd, **kw):
    """Worktree probe passes; the gh release resolution fails."""
    if "--is-inside-work-tree" in cmd:
        return CompletedProcess(cmd, 0, stdout="true\n", stderr="")
    return CompletedProcess(cmd, 1, stdout="", stderr="")


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
        # reached after the worktree probe but before any release resolution
        with patch("subprocess.run", side_effect=_run_ok):
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "not-a-version"})
                assert r.status == 400 and "Invalid version format" in (await r.json())["error"]
        assert restart.restart_requested() is False

    async def test_resolve_latest_failure(self):
        with patch("subprocess.run", side_effect=_git_ok_but_resolve_fails):
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "latest"})
                assert r.status == 502
        assert restart.restart_requested() is False

    async def test_dirty_worktree_409(self):
        def _dirty(cmd, **kw):
            if "--is-inside-work-tree" in cmd:
                return CompletedProcess(cmd, 0, stdout="true\n", stderr="")
            if "diff" in cmd:
                return CompletedProcess(cmd, 0, stdout="src/foo.py\nsrc/bar.py", stderr="")
            return CompletedProcess(cmd, 0, stdout="", stderr="")
        with patch("subprocess.run", side_effect=_dirty), \
             patch("os.path.exists", return_value=False):
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "v3.55.0"})
                assert r.status == 409 and "unexpected modifications" in (await r.json())["error"]
        assert restart.restart_requested() is False

    async def test_step_failure_rolls_back(self):
        def _fail_merge(cmd, **kw):
            if "--is-inside-work-tree" in cmd:
                return CompletedProcess(cmd, 0, stdout="true\n", stderr="")
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
        assert restart.restart_requested() is False

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
        # main() re-execs in place after shutdown only because this was set
        assert restart.restart_requested() is True

    async def test_refuses_when_the_workspace_cannot_be_provisioned(self):
        """PR #239 round-4 blocker 1: this updater re-execs IN PLACE, so systemd
        never starts the service and never applies StateDirectory=. If the local
        command workspace cannot be provisioned, the update must be REFUSED —
        otherwise it completes and Odin cannot run a single local command
        afterwards (verified against the live install during review)."""
        with patch(
            "src.web.api.self_update._ensure_local_workspace_for_update",
            return_value=(
                "Create it before updating: sudo install -d -m 0700 "
                "-o odin -g odin /var/lib/odin-workspace"
            ),
        ), patch("subprocess.run", side_effect=_run_ok) as run:
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "latest"})
                assert r.status == 409
                body = await r.json()
                assert "update refused" in body["error"]
                assert "install -d -m 0700" in body["error"], "must stay actionable"
        # Refusal happens BEFORE the repository is touched.
        assert not any(
            "merge" in " ".join(map(str, call.args[0]))
            for call in run.call_args_list
            if call.args and isinstance(call.args[0], list)
        ), "the update must not have been committed"

    async def test_refuses_a_blank_persisted_workspace_before_touching_the_repo(self):
        """PR #239 round-7 blocker: the persisted-config path, end to end.

        local_working_dir accepts free strings and can be blanked through
        PUT /api/config. The preflight used to treat a present-but-blank value
        as "nothing configured" and validate the DEFAULT instead, so the update
        was approved while the restarted process loaded the blank value and
        failed closed on every local command.

        Nothing is stubbed here except the exec primitives: this drives the real
        preflight from a live bot config.
        """
        bot = SimpleNamespace(
            config=SimpleNamespace(
                tools=SimpleNamespace(
                    local_working_dir="   ",
                    audit_log_path=None,
                    trajectory_path=None,
                )
            )
        )
        with patch("subprocess.run", side_effect=_run_ok) as run:
            async with TestClient(TestServer(_app(bot))) as c:
                r = await c.post("/api/update/apply", json={"version": "latest"})
                assert r.status == 409
                assert "update refused" in (await r.json())["error"]
        assert not any(
            "merge" in " ".join(map(str, call.args[0]))
            for call in run.call_args_list
            if call.args and isinstance(call.args[0], list)
        ), "the update must not have been committed"
        assert restart.restart_requested() is False

    async def test_unexpected_exception_500(self):
        # subprocess raising mid-flow (inside the try) surfaces as a 500
        def _boom(cmd, **kw):
            if "--is-inside-work-tree" in cmd:
                return CompletedProcess(cmd, 0, stdout="true\n", stderr="")
            if "diff" in cmd:
                raise RuntimeError("git exploded")
            return CompletedProcess(cmd, 0, stdout="", stderr="")
        with patch("subprocess.run", side_effect=_boom), \
             patch("os.path.exists", return_value=False):
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "v3.55.0"})
                assert r.status == 500 and "git exploded" in (await r.json())["error"]
        assert restart.restart_requested() is False

    async def test_bad_json_defaults_to_latest(self):
        # invalid JSON → data={} → target defaults to "latest" → resolve attempt
        with patch("subprocess.run", side_effect=_git_ok_but_resolve_fails):
            async with TestClient(TestServer(_app())) as c:
                assert (await c.post("/api/update/apply", data="notjson")).status == 502


class TestNonGitInstall:
    """.deb installs ship /opt/odin without a repository — the endpoint must
    answer a friendly 409 BEFORE resolving releases or mutating anything,
    and must never arm the restart flag on that path."""

    async def test_non_git_checkout_409_before_any_resolution(self):
        commands: list = []

        def _not_git(cmd, **kw):
            commands.append(cmd)
            if "--is-inside-work-tree" in cmd:
                return CompletedProcess(
                    cmd, 128, stdout="", stderr="fatal: not a git repository"
                )
            return CompletedProcess(cmd, 0, stdout="v9.9.9\n", stderr="")

        with patch("subprocess.run", side_effect=_not_git), \
             patch("os.kill") as kill:
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "latest"})
                assert r.status == 409
                assert "not a git checkout" in (await r.json())["error"]
        # detection ran first and nothing else was attempted — no gh resolve,
        # no git mutation
        assert all("--is-inside-work-tree" in c for c in commands)
        assert restart.restart_requested() is False
        kill.assert_not_called()

    async def test_git_binary_missing_entirely_409(self):
        with patch("subprocess.run", side_effect=FileNotFoundError("git")):
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "latest"})
                assert r.status == 409
        assert restart.restart_requested() is False

    async def test_rev_parse_false_output_409(self):
        # rev-parse can exit 0 with "false" (e.g. inside .git itself)
        def _false(cmd, **kw):
            if "--is-inside-work-tree" in cmd:
                return CompletedProcess(cmd, 0, stdout="false\n", stderr="")
            return CompletedProcess(cmd, 0, stdout="", stderr="")

        with patch("subprocess.run", side_effect=_false):
            async with TestClient(TestServer(_app())) as c:
                assert (
                    await c.post("/api/update/apply", json={"version": "latest"})
                ).status == 409


class TestStopAllLoops:
    async def test_stop_all(self):
        bot = MagicMock()
        bot.loop_manager.stop_loop.return_value = "stopped 3 loops"
        async with TestClient(TestServer(_app(bot))) as c:
            body = await (await c.post("/api/loops/stop-all")).json()
            assert body["result"] == "stopped 3 loops"
            bot.loop_manager.stop_loop.assert_called_once_with("all")


class TestRepoRootAndMetadataHygiene:
    """Regressions for the field report of self-update misreporting its
    version: base pointed at <repo>/src after the RFC-003 package split
    (pip reinstall silently skipped — src/.venv never exists), and stale
    odin_bot.egg-info metadata kept get_version() on the old release."""

    def test_repo_root_contains_pyproject(self):
        import os

        from src.web.api.self_update import _repo_root
        root = _repo_root()
        assert os.path.isfile(os.path.join(root, "pyproject.toml"))
        # the old 3-dirname derivation landed here — never again
        assert not root.rstrip(os.sep).endswith(os.sep + "src")

    async def test_apply_pip_installs_repo_root_and_clears_egg_info(self):
        import asyncio
        import os

        from src.web.api.self_update import _repo_root
        loop = asyncio.get_running_loop()
        root = _repo_root()
        commands: list = []

        def _capture(cmd, **kw):
            commands.append(cmd)
            return _run_ok(cmd, **kw)

        def _exists(path):
            # only the venv pip probe answers True so the install step runs
            return path.endswith(os.path.join(".venv", "bin", "pip"))

        def _isdir(path):
            return path.endswith("odin_bot.egg-info")

        with patch("subprocess.run", side_effect=_capture), \
             patch("os.path.exists", side_effect=_exists), \
             patch("os.path.isdir", side_effect=_isdir), \
             patch("shutil.rmtree") as rmtree, \
             patch("os.walk", return_value=[]), \
             patch.object(loop, "call_later", lambda d, cb, *a: MagicMock()), \
             patch("os.kill") as kill:
            async with TestClient(TestServer(_app())) as c:
                r = await c.post("/api/update/apply", json={"version": "v3.55.0"})
                assert r.status == 200

        # stale build metadata is removed from the REPO ROOT before install
        rmtree.assert_called_once()
        assert rmtree.call_args.args[0] == os.path.join(root, "odin_bot.egg-info")
        # pip reinstall actually runs, against the repo root (not <repo>/src)
        pip_suffix = os.path.join(".venv", "bin", "pip")
        pip_cmds = [c for c in commands if c and str(c[0]).endswith(pip_suffix)]
        assert pip_cmds, "pip reinstall step never ran"
        assert pip_cmds[0][0] == os.path.join(root, ".venv", "bin", "pip")
        assert pip_cmds[0][-1] == root
        kill.assert_not_called()
