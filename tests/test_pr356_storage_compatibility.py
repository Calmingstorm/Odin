"""Fail-before/fix proof for PR356 initialization storage compatibility."""

from __future__ import annotations

import fcntl
from pathlib import Path

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.initialization import (
    InitializationError,
    InitializationMode,
    InitializationStore,
    InstallationBinding,
)
from src.config.schema import WebConfig
from src.config.startup_context import provision_initialization_parent
from src.health.server import SessionManager, _make_auth_middleware, _make_bootstrap_gate_middleware


class _LegacyOnboarding:
    def __init__(self, state):
        self._state = state

    async def state(self):
        return self._state


async def _ordinary_api(request):
    return web.json_response({"ok": True})


def _store(path: Path) -> InitializationStore:
    return InitializationStore(
        path, InstallationBinding("pr356", (path.parent / "config.yml").absolute())
    )


@pytest.mark.parametrize("tree_mode", [0o775, 0o755])
def test_source_and_deb_trees_provision_private_store(tmp_path, tree_mode):
    install = tmp_path / "install"
    install.mkdir(mode=tree_mode)
    install.chmod(tree_mode)
    data = install / "data"
    data.mkdir(mode=tree_mode)
    data.chmod(tree_mode)
    state_path = data / "initialization" / "state.json"

    provision_initialization_parent(state_path)
    store = _store(state_path)
    assert store.state(legacy_loopback_restricted=False).mode is InitializationMode.COMPLETE
    assert state_path.parent.stat().st_mode & 0o777 == 0o700
    assert state_path.stat().st_mode & 0o777 == 0o600


def test_symlinked_data_pins_target_and_refuses_rebind_and_leaf_symlinks(tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir(mode=0o700)
    second.mkdir(mode=0o700)
    alias = tmp_path / "data"
    alias.symlink_to(first, target_is_directory=True)
    store = _store(alias / "state.json")
    assert store.provision_fresh().mode is InitializationMode.PENDING

    alias.unlink()
    alias.symlink_to(second, target_is_directory=True)
    assert store.state().mode is InitializationMode.RECOVERY

    target = second / "target"
    target.write_text("{}")
    (second / "state.json").symlink_to(target)
    assert _store(alias / "state.json").state().mode is InitializationMode.RECOVERY
    (second / "state.json").unlink()
    (second / ".state.json.lock").unlink()
    (second / ".state.json.lock").symlink_to(second / "lock-target")
    assert (
        _store(alias / "state.json").state(legacy_loopback_restricted=False).mode
        is InitializationMode.RECOVERY
    )


def test_constructor_resolution_failure_does_not_escape(tmp_path, monkeypatch):
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    original = Path.resolve

    def fail_resolution(path, *args, **kwargs):
        if path == private:
            raise RuntimeError("symlink loop")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "resolve", fail_resolution)
    assert (
        _store(private / "state.json").state(legacy_loopback_restricted=True).mode
        is InitializationMode.COMPLETE
    )


def test_missing_parent_beneath_unwritable_tree_is_verified_legacy(tmp_path):
    install = tmp_path / "readonly"
    install.mkdir(mode=0o555)
    install.chmod(0o555)
    store = _store(install / "missing" / "state.json")
    try:
        state = store.state(legacy_loopback_restricted=False)
    finally:
        install.chmod(0o755)
    assert state.mode.value == "legacy"
    assert state.loopback_restricted is False


@pytest.mark.asyncio
async def test_lock_failure_is_legacy_and_authenticated_api_passes(tmp_path, monkeypatch):
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    store = _store(private / "state.json")

    real_flock = fcntl.flock
    monkeypatch.setattr(
        fcntl, "flock", lambda *args, **kwargs: (_ for _ in ()).throw(OSError("no lock"))
    )
    state = store.state(legacy_loopback_restricted=False)
    assert state.mode.value == "legacy"

    app = web.Application(
        middlewares=[
            _make_bootstrap_gate_middleware(),
            _make_auth_middleware(WebConfig(api_token="valid-token"), SessionManager()),
        ]
    )
    app["onboarding"] = _LegacyOnboarding(state)
    app.router.add_get("/api/ordinary", _ordinary_api)
    async with TestClient(TestServer(app)) as client:
        response = await client.get(
            "/api/ordinary", headers={"Authorization": "Bearer valid-token"}
        )
        assert response.status == 200

    monkeypatch.setattr(fcntl, "flock", real_flock)
    with pytest.raises(InitializationError):
        store.complete(lambda: None)
    with pytest.raises(InitializationError):
        store.set_bind_decision(loopback_restricted=True, explicit_widening=False)


def test_failed_migration_reproves_absence(tmp_path, monkeypatch):
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    store = _store(private / "state.json")

    def fail_after_corruption(state):
        store.path.write_text("{corrupt")
        store.path.chmod(0o600)
        raise InitializationError("write failed")

    monkeypatch.setattr(store, "_write_locked", fail_after_corruption)
    assert store.state(legacy_loopback_restricted=False).mode is InitializationMode.RECOVERY


def test_corrupt_unsafe_and_vanished_records_remain_recovery(tmp_path):
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    corrupt = _store(private / "corrupt.json")
    corrupt.path.write_text("not json")
    corrupt.path.chmod(0o600)
    assert corrupt.state(legacy_loopback_restricted=False).mode is InitializationMode.RECOVERY

    unsafe = _store(private / "unsafe.json")
    unsafe.path.write_text("{}")
    unsafe.path.chmod(0o644)
    assert unsafe.state(legacy_loopback_restricted=False).mode is InitializationMode.RECOVERY

    vanished = _store(private / "vanished.json")
    vanished.provision_fresh()
    vanished.path.unlink()
    assert vanished.state(legacy_loopback_restricted=False).mode is InitializationMode.RECOVERY


def test_parent_vanishing_during_failed_write_is_recovery(tmp_path, monkeypatch):
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    store = _store(private / "state.json")
    moved = tmp_path / "moved"

    def fail_after_disappearance(state):
        private.rename(moved)
        raise InitializationError("write failed")

    monkeypatch.setattr(store, "_write_locked", fail_after_disappearance)
    assert store.state(legacy_loopback_restricted=False).mode is InitializationMode.RECOVERY


def test_failed_lock_observes_record_and_later_absence_stays_recovery(tmp_path, monkeypatch):
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    path = private / "state.json"
    path.write_text("{corrupt")
    path.chmod(0o600)
    store = _store(path)
    real_flock = fcntl.flock
    monkeypatch.setattr(
        fcntl, "flock", lambda *args, **kwargs: (_ for _ in ()).throw(OSError("no lock"))
    )

    assert store.state(legacy_loopback_restricted=False).mode is InitializationMode.RECOVERY
    path.unlink()
    monkeypatch.setattr(fcntl, "flock", real_flock)
    assert store.state(legacy_loopback_restricted=False).mode is InitializationMode.RECOVERY
