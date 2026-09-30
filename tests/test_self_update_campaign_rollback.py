"""All updater side effects mocked; only disposable operator bytes are written."""
import subprocess
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api.self_update import register_self_update


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["config", "fetch", "merge", "pip"])
@pytest.mark.parametrize("rollback_raises", [False, True, "nonzero"])
@pytest.mark.parametrize("failure_kind", ["exception", "nonzero"])
async def test_update_exceptions_restore_bytes_even_if_rollback_fails(
    tmp_path, monkeypatch, stage, rollback_raises, failure_kind,
):
    config = tmp_path / "config.yml"
    env = tmp_path / ".env"
    config.write_bytes(b"operator config\xff")
    env.write_bytes(b"operator env\xfe")
    pip = tmp_path / ".venv" / "bin" / "pip"
    pip.parent.mkdir(parents=True)
    pip.touch()
    calls = []

    def run(cmd, **kwargs):
        calls.append(cmd)
        if "--is-inside-work-tree" in cmd:
            return SimpleNamespace(returncode=0, stdout="true", stderr="")
        if "rev-parse" in cmd:
            return SimpleNamespace(returncode=0, stdout="previous-ref", stderr="")
        if "--" in cmd and "checkout" in cmd:
            config.write_bytes(b"tracked template")
            env.write_bytes(b"tracked env")
            if stage == "config":
                if failure_kind == "nonzero":
                    return SimpleNamespace(returncode=1, stdout="", stderr="mocked failure")
                raise subprocess.TimeoutExpired("mocked", 10)
        if (stage == "fetch" and "fetch" in cmd or stage == "merge" and "merge" in cmd
                or stage == "pip" and "install" in cmd):
            if failure_kind == "nonzero":
                return SimpleNamespace(returncode=1, stdout="", stderr="mocked failure")
            raise subprocess.TimeoutExpired("mocked", 10)
        if "reset" in cmd and rollback_raises:
            if rollback_raises == "nonzero":
                return SimpleNamespace(returncode=1, stdout="", stderr="rollback refused")
            raise OSError("mocked rollback failure")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr("src.web.api.self_update._repo_root", lambda: str(tmp_path))
    monkeypatch.setattr(
        "src.web.api.self_update._ensure_local_workspace_for_update", lambda *_: None,
    )
    monkeypatch.setattr("src.web.api.self_update.subprocess.run", run)
    monkeypatch.setattr("shutil.rmtree", Mock(side_effect=AssertionError("no deletion")))
    monkeypatch.setattr(
        "src.web.api.self_update.os.kill", Mock(side_effect=AssertionError("no signals")),
    )
    monkeypatch.setattr(
        "src.web.api.self_update.restart.request_restart",
        Mock(side_effect=AssertionError("no restart")),
    )
    app = web.Application()
    routes = web.RouteTableDef()
    register_self_update(routes, SimpleNamespace())
    app.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/update/apply", json={"version": "v1.2.3"})
        assert response.status == 500
        if rollback_raises:
            assert "rollback" in (await response.json())["error"]
    assert config.read_bytes() == b"operator config\xff"
    assert env.read_bytes() == b"operator env\xfe"
    assert any("reset" in cmd for cmd in calls)


async def test_rollback_reports_operator_restore_error_without_restart(tmp_path, monkeypatch):
    from pathlib import Path
    config = tmp_path / "config.yml"
    config.write_bytes(b"operator configuration")
    calls = []

    def run(cmd, **kwargs):
        calls.append(cmd)
        stdout = "true" if "--is-inside-work-tree" in cmd else "old-ref" if "rev-parse" in cmd else ""
        return SimpleNamespace(returncode=1 if "fetch" in cmd else 0, stdout=stdout, stderr="mock failure")

    monkeypatch.setattr("src.web.api.self_update._repo_root", lambda: str(tmp_path))
    monkeypatch.setattr("src.web.api.self_update._ensure_local_workspace_for_update", lambda *_: None)
    monkeypatch.setattr("src.web.api.self_update.subprocess.run", run)
    monkeypatch.setattr(Path, "write_bytes", Mock(side_effect=OSError("restore denied")))
    restart = Mock(side_effect=AssertionError("no restart"))
    monkeypatch.setattr("src.web.api.self_update.restart.request_restart", restart)
    monkeypatch.setattr("src.web.api.self_update.os.kill", Mock(side_effect=AssertionError("no signal")))
    app = web.Application()
    routes = web.RouteTableDef()
    register_self_update(routes, SimpleNamespace())
    app.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/update/apply", json={"version": "v1.2.3"})
        assert response.status == 500
        assert "restoring config.yml failed" in (await response.json())["error"]
    assert any("reset" in cmd for cmd in calls)
    restart.assert_not_called()
