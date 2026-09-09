"""Provisioning uses disposable files only, never desktop/service activation."""

import asyncio
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer import provisioning
from src.computer.manager import ComputerLifecycle
from src.computer.provisioning import ComputerProvisioningError, open_private_directory
from src.computer.store import ComputerStore
from src.config.schema import ComputerUseConfig, Config
from tests.test_computer_lifecycle_r5 import fake_factory


def lifecycle(path, *, enabled=False, persist=None):
    bot = SimpleNamespace(config=Config(discord={"token": "test"}, computer={
        "enabled": enabled, "storage_dir": str(path)}))
    return ComputerLifecycle(bot, factory=fake_factory, persist=persist or AsyncMock(
        return_value=(None, False)))


@pytest.mark.asyncio
@pytest.mark.parametrize("startup", [True, False])
async def test_enabled_startup_and_enable_create_private_nested_storage(tmp_path, startup):
    root = tmp_path / "missing" / "computer"
    manager = lifecycle(root, enabled=startup)
    if startup:
        await manager.start()
    else:
        await manager.set_enabled(True)
    assert manager.enabled
    assert root.stat().st_mode & 0o777 == 0o700
    assert root.parent.stat().st_mode & 0o777 == 0o700
    before = root.stat().st_ino
    await manager.set_enabled(False)
    await manager.set_enabled(True)
    assert root.stat().st_ino == before
    await manager.close()


@pytest.mark.asyncio
async def test_disabled_snapshot_and_start_do_not_touch_storage(tmp_path):
    root = tmp_path / "absent"
    manager = lifecycle(root)
    await manager.start()
    assert manager.snapshot()["runtime_enabled"] is False
    assert not root.exists()


@pytest.mark.asyncio
async def test_failed_provisioning_does_not_save_or_publish_authority(tmp_path):
    root = tmp_path / "public"
    root.mkdir(mode=0o755)
    persist = AsyncMock(return_value=(None, False))
    manager = lifecycle(root, persist=persist)
    with pytest.raises(ComputerProvisioningError) as error:
        await manager.set_enabled(True)
    assert error.value.outcome == "not_applied"
    assert not manager.enabled and manager._service is None
    assert not manager.bot.config.computer.enabled
    assert manager.generation == 0
    persist.assert_not_called()
    assert root.stat().st_mode & 0o777 == 0o755
    assert not manager.grant_allows("computer_act", "a", "c")


@pytest.mark.parametrize("platform", ["x11", "wayland"])
async def test_incomplete_target_is_a_typed_non_applied_preflight(tmp_path, platform):
    manager = lifecycle(tmp_path / "state")
    manager.settings.platform = platform
    manager.settings.environment = "existing_session"
    with pytest.raises(ComputerProvisioningError) as error:
        await manager.set_enabled(True)
    assert error.value.code == "computer_target_incomplete"
    assert error.value.outcome == "not_applied"
    manager._persist.assert_not_called()
    assert not manager.enabled and manager._service is None
    assert not (tmp_path / "state").exists()


async def test_missing_native_dependencies_are_typed_before_enable(tmp_path, monkeypatch):
    from src.computer.runtime import profile

    manager = lifecycle(tmp_path / "state")
    manager._factory = None

    def missing():
        raise RuntimeError("private dependency diagnostics")

    monkeypatch.setattr(profile, "preflight", missing)
    with pytest.raises(ComputerProvisioningError) as error:
        await manager.set_enabled(True)
    assert error.value.code == "computer_dependency_unavailable"
    assert "private dependency" not in error.value.message
    assert error.value.outcome == "not_applied"
    manager._persist.assert_not_called()
    assert not manager.enabled and manager._service is None


@pytest.mark.parametrize("location", ["leaf", "ancestor"])
def test_symlinks_rejected_without_creating_target(tmp_path, location):
    target = tmp_path / "outside"
    link = tmp_path / "link"
    link.symlink_to(target, target_is_directory=True)
    with pytest.raises(ComputerProvisioningError, match="unsafe"):
        open_private_directory(link if location == "leaf" else link / "storage")
    assert not target.exists()


def test_authoritative_running_root_and_parent_traversal_rejected(tmp_path, monkeypatch):
    install = tmp_path / "source-install"
    install.mkdir()
    monkeypatch.setattr(provisioning, "runtime_install_root", lambda: install)
    for path in (install, install / "data", tmp_path / "x" / ".." / "data"):
        with pytest.raises(ComputerProvisioningError):
            open_private_directory(path)
    assert list(install.iterdir()) == []
    with pytest.raises(ComputerProvisioningError):
        ComputerStore(install / "receipts.db", tmp_path / "evidence")


def test_world_writable_nonsticky_ancestor_refused(tmp_path):
    parent = tmp_path / "unsafe"
    parent.mkdir()
    parent.chmod(0o777)
    with pytest.raises(ComputerProvisioningError):
        open_private_directory(parent / "storage")
    assert not (parent / "storage").exists()


@pytest.mark.parametrize("raced", ["symlink", "public_directory"])
def test_raced_creation_validates_winner(tmp_path, monkeypatch, raced):
    path = tmp_path / "storage"
    victim = tmp_path / "untouched"
    original = os.mkdir

    def mkdir(name, mode=0o777, *, dir_fd=None):
        if name == "storage":
            if raced == "symlink":
                path.symlink_to(victim, target_is_directory=True)
            else:
                original(name, 0o755, dir_fd=dir_fd)
            raise FileExistsError
        return original(name, mode, dir_fd=dir_fd)

    monkeypatch.setattr(os, "mkdir", mkdir)
    with pytest.raises(ComputerProvisioningError):
        open_private_directory(path)
    assert not victim.exists()


def source_user(tmp_path, monkeypatch):
    # Use an isolated virtual UID boundary for selection tests, while filesystem
    # safety is exercised separately against the real process UID above/below.
    install = tmp_path / "source"
    install.mkdir()
    monkeypatch.setattr(provisioning, "runtime_install_root", lambda: install)
    monkeypatch.setattr(provisioning.os, "geteuid", lambda: 1234)
    original_stat = Path.stat

    def source_stat(self, *args, **kwargs):
        if self == install:
            return SimpleNamespace(st_uid=1234)
        return original_stat(self, *args, **kwargs)

    monkeypatch.setattr(Path, "stat", source_stat)
    default = tmp_path / "system" / "computer"
    monkeypatch.setattr(provisioning, "DEFAULT_STORAGE", default)
    monkeypatch.setenv("XDG_STATE_HOME", str(tmp_path / "state"))
    opened = []

    def opened_directory(path):
        opened.append(path)
        return os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)

    monkeypatch.setattr(provisioning, "open_private_directory", opened_directory)
    implicit = ComputerUseConfig()
    # Preserve implicit field provenance while replacing only the fixture default.
    implicit.__dict__["storage_dir"] = str(default)
    return implicit, default, opened


def test_only_implicit_default_selects_xdg_and_copy_preserves_provenance(tmp_path, monkeypatch):
    implicit, default, opened = source_user(tmp_path, monkeypatch)
    selected = provisioning.provision_storage(implicit.model_copy(deep=True))
    assert selected == tmp_path / "state" / "odin" / "computer"
    explicit = ComputerUseConfig(storage_dir=str(default))
    assert provisioning.provision_storage(explicit) == default
    custom = ComputerUseConfig(storage_dir=str(tmp_path / "configured"))
    assert provisioning.provision_storage(custom) == tmp_path / "configured"
    assert opened == [selected, default, tmp_path / "configured"]


def test_existing_default_receipts_never_hidden_by_fallback(tmp_path, monkeypatch):
    implicit, default, _ = source_user(tmp_path, monkeypatch)
    default.mkdir(parents=True)
    receipt = default / "receipts.db"
    receipt.write_bytes(b"existing receipts")
    assert provisioning.provision_storage(implicit) == default
    assert receipt.read_bytes() == b"existing receipts"


@pytest.mark.parametrize("startup", [False, True])
@pytest.mark.asyncio
async def test_fallback_is_durably_pinned_before_authority(tmp_path, monkeypatch, startup):
    manager = lifecycle(tmp_path / "initial", enabled=startup)
    selected = tmp_path / "state" / "computer"
    monkeypatch.setattr("src.computer.manager.provision_storage", lambda _: selected)
    events = []

    async def save(changes):
        assert not manager.enabled
        events.extend(changes)
        return None, False

    manager._persist = save
    if startup:
        await manager.start()
    else:
        await manager.set_enabled(True)
    assert (("computer", "storage_dir"), str(selected)) in events
    assert manager.bot.config.computer.storage_dir == str(selected)
    assert manager.settings.storage_dir == str(selected)
    assert "storage_dir" not in manager.snapshot()["restart_required"]
    await manager.close()


def test_contract_only_emits_canonical_safe_fields():
    error = ComputerProvisioningError("/private/path/secret")
    assert isinstance(error, ValueError)
    assert error.code == "storage_unavailable"
    assert error.outcome == "not_applied"
    assert "/private" not in str(error) + error.remedy


def test_store_reopen_preserves_receipts(tmp_path):
    root = tmp_path / "new"
    store = ComputerStore(root / "state.db", root / "evidence")
    store.db.execute("INSERT INTO receipts VALUES ('s','a','hash','done','{}')")
    store.close()
    reopened = ComputerStore(root / "state.db", root / "evidence")
    assert reopened.db.execute("SELECT action_id FROM receipts").fetchone()[0] == "a"
    reopened.close()


@pytest.mark.parametrize("filename", ["state.db", "state.db-wal", "state.db-shm"])
def test_store_refuses_unsafe_sqlite_files_without_modifying_them(tmp_path, filename):
    path = tmp_path / filename
    path.write_bytes(b"untouched")
    path.chmod(0o644)
    with pytest.raises(ComputerProvisioningError):
        ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    assert path.read_bytes() == b"untouched"
    assert path.stat().st_mode & 0o777 == 0o644


@pytest.mark.asyncio
@pytest.mark.parametrize("startup", [False, True])
async def test_failed_fallback_persistence_never_enables(tmp_path, monkeypatch, startup):
    manager = lifecycle(tmp_path / "initial", enabled=startup)
    selected = tmp_path / "state" / "computer"
    monkeypatch.setattr("src.computer.manager.provision_storage", lambda _: selected)
    manager._persist = AsyncMock(return_value=(OSError("not writable"), False))
    with pytest.raises(RuntimeError, match="not saved"):
        if startup:
            await manager.start()
        else:
            await manager.set_enabled(True)
    assert not manager.enabled and manager._service is None
    assert manager.bot.config.computer.storage_dir == str(tmp_path / "initial")
    assert manager.settings.storage_dir == str(tmp_path / "initial")


@pytest.mark.asyncio
async def test_fallback_does_not_overwrite_deferred_operator_selection(tmp_path, monkeypatch):
    manager = lifecycle(tmp_path / "initial")
    manager.bot.config.computer.storage_dir = str(tmp_path / "operator-choice")
    monkeypatch.setattr("src.computer.manager.provision_storage", lambda _: tmp_path / "xdg")
    with pytest.raises(ComputerProvisioningError) as error:
        await manager.set_enabled(True)
    assert error.value.code == "storage_selection_required"
    assert manager.bot.config.computer.storage_dir == str(tmp_path / "operator-choice")
    manager._persist.assert_not_called()


def test_missing_default_permission_error_never_falls_back(tmp_path, monkeypatch):
    implicit, default, opened = source_user(tmp_path, monkeypatch)
    original = Path.lstat

    def unavailable(self):
        if self == default:
            raise PermissionError("private OS details")
        return original(self)

    monkeypatch.setattr(Path, "lstat", unavailable)
    with pytest.raises(ComputerProvisioningError) as error:
        provisioning.provision_storage(implicit)
    assert error.value.code == "storage_selection_required"
    assert not opened


def test_relative_xdg_state_home_refused(tmp_path, monkeypatch):
    implicit, _, opened = source_user(tmp_path, monkeypatch)
    monkeypatch.setenv("XDG_STATE_HOME", "relative")
    with pytest.raises(ComputerProvisioningError):
        provisioning.provision_storage(implicit)
    assert not opened


def test_existing_owner_mismatch_refused(tmp_path, monkeypatch):
    path = tmp_path / "private"
    path.mkdir(mode=0o700)
    original = os.fstat

    def foreign(fd):
        info = original(fd)
        if info.st_ino == path.stat().st_ino:
            fields = list(info)
            fields[4] = 12345
            return os.stat_result(fields)
        return info

    monkeypatch.setattr(os, "fstat", foreign)
    with pytest.raises(ComputerProvisioningError) as error:
        open_private_directory(path)
    assert error.value.code == "storage_not_private"


@pytest.mark.parametrize("kind", ["symlink", "hardlink", "fifo"])
def test_unsafe_database_objects_refused_without_touching_target(tmp_path, kind):
    target = tmp_path / "target"
    target.write_bytes(b"preserve")
    target.chmod(0o600)
    database = tmp_path / "state.db"
    if kind == "symlink":
        database.symlink_to(target)
    elif kind == "hardlink":
        os.link(target, database)
    else:
        os.mkfifo(database, 0o600)
    with pytest.raises(ComputerProvisioningError):
        ComputerStore(database, tmp_path / "evidence")
    assert target.read_bytes() == b"preserve"


@pytest.mark.asyncio
async def test_startup_cancel_during_fallback_save_discards_candidate(tmp_path, monkeypatch):
    manager = lifecycle(tmp_path / "initial", enabled=True)
    monkeypatch.setattr("src.computer.manager.provision_storage", lambda _: tmp_path / "xdg")
    entered = asyncio.Event()
    candidate = fake_factory()
    manager._factory = lambda *a, **k: candidate

    async def save(changes):
        entered.set()
        await asyncio.Event().wait()

    manager._persist = save
    task = asyncio.create_task(manager.start())
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert manager._service is None and not manager.enabled
    candidate.close.assert_awaited_once()
