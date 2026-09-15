"""Serialized behavior for the narrow A1 initialization-state foundation."""

from __future__ import annotations

import json
import multiprocessing
import os
import stat
import threading
from pathlib import Path

import pytest

from src.config.initialization import (
    InitializationAlreadyCompleteError,
    InitializationCommittedDurabilityError,
    InitializationError,
    InitializationMode,
    InitializationReentrancyError,
    InitializationStore,
    InstallationBinding,
)


def make_store(tmp_path, installation_id="install-a"):
    config = tmp_path / "active.yml"
    config.write_text("web: {}\n")
    return InitializationStore(
        tmp_path / "state.json", InstallationBinding(installation_id, config)
    )


def _process_complete(state_path: str, config_path: str, queue) -> None:
    store = InitializationStore(
        Path(state_path), InstallationBinding("install-a", Path(config_path))
    )
    try:
        store.complete(lambda: queue.put("publisher"))
        queue.put("complete")
    except InitializationAlreadyCompleteError:
        queue.put("already-complete")


def test_fresh_provision_serializes_pending_and_separate_bind_decision(tmp_path):
    store = make_store(tmp_path)
    state = store.provision_fresh()
    payload = json.loads(store.path.read_text())
    assert state.mode is InitializationMode.PENDING
    assert state.setup_allowed is True
    assert payload["mode"] == "pending"
    assert payload["loopback_restricted"] is True
    assert payload["explicit_widening"] is False

    changed = store.set_bind_decision(loopback_restricted=False, explicit_widening=True)
    assert changed.mode is InitializationMode.PENDING
    assert changed.loopback_restricted is False
    assert changed.explicit_widening is True


def test_recordless_legacy_install_requires_verified_bind_policy_then_migrates(tmp_path):
    store = make_store(tmp_path)
    assert store.state().mode is InitializationMode.RECOVERY
    assert not store.path.exists()
    state = store.state(legacy_loopback_restricted=False)
    assert state.mode is InitializationMode.COMPLETE
    assert state.setup_allowed is False
    assert state.loopback_restricted is False
    assert state.explicit_widening is False
    assert json.loads(store.path.read_text())["mode"] == "complete"


@pytest.mark.parametrize("raw", [b"not json", b'{"mode":"pending"}', b"\xff"])
def test_corrupt_records_need_recovery_and_never_reopen_setup(tmp_path, raw):
    store = make_store(tmp_path)
    store.path.write_bytes(raw)
    state = store.state()
    assert state.mode is InitializationMode.RECOVERY
    assert state.setup_allowed is False
    assert store.path.read_bytes() == raw


def test_identity_mismatch_is_recovery_not_new_setup(tmp_path):
    first = make_store(tmp_path, "install-a")
    first.provision_fresh()
    second = make_store(tmp_path, "install-b")
    state = second.state()
    assert state.mode is InitializationMode.RECOVERY
    assert "active installation" in state.detail
    with pytest.raises(InitializationError):
        second.provision_fresh()


def test_completion_survives_credential_deletion(tmp_path):
    store = make_store(tmp_path)
    credential = tmp_path / "discord-token"
    credential.write_text("present once")
    store.provision_fresh()
    assert store.complete(lambda: credential.unlink()) is None
    assert store.state().mode is InitializationMode.COMPLETE
    assert not credential.exists()


def test_failed_final_publication_leaves_pending_for_recovery(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()

    with pytest.raises(RuntimeError, match="config write failed"):
        store.complete(lambda: (_ for _ in ()).throw(RuntimeError("config write failed")))

    assert store.state().mode is InitializationMode.PENDING


def test_completion_publication_failure_does_not_claim_complete(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    store.provision_fresh()
    original = store._write_locked

    def fail_complete(state):
        if state.mode is InitializationMode.COMPLETE:
            raise InitializationError("disk full")
        return original(state)

    monkeypatch.setattr(store, "_write_locked", fail_complete)
    with pytest.raises(InitializationError, match="disk full"):
        store.complete(lambda: "published")
    assert json.loads(store.path.read_text())["mode"] == "pending"


def test_concurrent_completion_runs_one_publisher_and_one_final_publication(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    entered = threading.Barrier(2)
    publishers = []
    outcomes = []

    def complete(name):
        entered.wait()
        try:
            outcomes.append(store.complete(lambda: publishers.append(name)))
        except InitializationAlreadyCompleteError:
            outcomes.append("already-complete")

    threads = [threading.Thread(target=complete, args=(name,)) for name in ("one", "two")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(publishers) == 1
    assert outcomes.count("already-complete") == 1
    assert store.state().mode is InitializationMode.COMPLETE


def test_multiprocess_completion_runs_one_publisher(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    context = multiprocessing.get_context("spawn")
    queue = context.Queue()
    processes = [
        context.Process(
            target=_process_complete,
            args=(str(store.path), str(tmp_path / "active.yml"), queue),
        )
        for _ in range(2)
    ]
    for process in processes:
        process.start()
    for process in processes:
        process.join(15)
        assert process.exitcode == 0
    outcomes = [queue.get(timeout=2) for _ in range(3)]
    assert outcomes.count("publisher") == 1
    assert outcomes.count("already-complete") == 1


def test_unsafe_parent_and_lock_symlinks_are_rejected(tmp_path):
    target = tmp_path / "target"
    target.mkdir(mode=0o700)
    unsafe = tmp_path / "unsafe"
    unsafe.symlink_to(target, target_is_directory=True)
    store = InitializationStore(
        unsafe / "state.json", InstallationBinding("install-a", tmp_path / "active.yml")
    )
    with pytest.raises(InitializationError):
        store.provision_fresh()

    store = make_store(tmp_path)
    store._lock_path.symlink_to(tmp_path / "lock-target")
    with pytest.raises(InitializationError):
        store.provision_fresh()


def test_replace_failure_cleans_temp_and_fsync_failure_is_committed(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    original_replace = os.replace
    monkeypatch.setattr(
        os, "replace", lambda *args, **kwargs: (_ for _ in ()).throw(OSError("replace"))
    )
    with pytest.raises(InitializationError):
        store.provision_fresh()
    assert not list(tmp_path.glob(".state.json.*.tmp"))

    monkeypatch.setattr(os, "replace", original_replace)
    original_fsync = os.fsync
    calls = 0

    def fail_directory_fsync(fd):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("directory fsync")
        return original_fsync(fd)

    monkeypatch.setattr(os, "fsync", fail_directory_fsync)
    with pytest.raises(InitializationCommittedDurabilityError):
        store.provision_fresh()
    assert store.state().mode is InitializationMode.PENDING
    assert stat.S_IMODE(store.path.stat().st_mode) == 0o600


def test_invalid_serialized_types_are_recovery(tmp_path):
    store = make_store(tmp_path)
    store.path.write_text(json.dumps({
        "version": 1,
        "mode": "pending",
        "installation_id": "install-a",
        "config_path": str(tmp_path / "active.yml"),
        "loopback_restricted": "yes",
        "explicit_widening": False,
    }))
    assert store.state().mode is InitializationMode.RECOVERY


@pytest.mark.parametrize(
    "payload",
    [
        b'{"version":true,"mode":"pending","installation_id":"install-a","config_path":"x","loopback_restricted":true,"explicit_widening":false}',
        b'{"version":1,"version":1,"mode":"pending","installation_id":"install-a","config_path":"x","loopback_restricted":true,"explicit_widening":false}',
        b'{"version":1,"mode":"pending","installation_id":"install-a","config_path":"x","loopback_restricted":true,"explicit_widening":true}',
    ],
)
def test_ambiguous_or_invalid_state_combinations_are_recovery(tmp_path, payload):
    store = make_store(tmp_path)
    store.path.write_bytes(payload)
    assert store.state().mode is InitializationMode.RECOVERY


def test_state_file_symlink_is_recovery_not_followed(tmp_path):
    store = make_store(tmp_path)
    target = tmp_path / "target.json"
    target.write_text("{}")
    store.path.symlink_to(target)
    assert store.state().mode is InitializationMode.RECOVERY
    assert target.read_text() == "{}"


def test_unsafe_state_mode_is_recovery(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    store.path.chmod(0o644)
    assert store.state().mode is InitializationMode.RECOVERY


def test_bind_decision_allows_legacy_unrestricted_without_explicit_widening(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    changed = store.set_bind_decision(loopback_restricted=False, explicit_widening=False)
    assert changed.explicit_widening is False
    with pytest.raises(ValueError):
        store.set_bind_decision(loopback_restricted=True, explicit_widening=True)
    with pytest.raises(ValueError):
        store.set_bind_decision(loopback_restricted=1, explicit_widening=False)


@pytest.mark.parametrize("config_path", ["relative.yml", "/bad\npath"])
def test_binding_rejects_malformed_config_path(tmp_path, config_path):
    with pytest.raises(ValueError):
        InitializationStore(
            tmp_path / "state.json", InstallationBinding("install-a", Path(config_path))
        )


def test_parent_replacement_is_rejected_before_publish(tmp_path, monkeypatch):
    parent = tmp_path / "parent"
    parent.mkdir(mode=0o700)
    config = tmp_path / "active.yml"
    config.write_text("web: {}\n")
    store = InitializationStore(parent / "state.json", InstallationBinding("install-a", config))
    original = store._check_parent_identity
    replaced = False

    def replace_before_check(fd):
        nonlocal replaced
        if not replaced:
            replaced = True
            parent.rename(tmp_path / "old-parent")
            parent.mkdir(mode=0o700)
        original(fd)

    monkeypatch.setattr(store, "_check_parent_identity", replace_before_check)
    with pytest.raises(InitializationError, match="rebound"):
        store.provision_fresh()
    assert not (parent / "state.json").exists()


def test_foreign_owned_ancestor_is_rejected(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    original_fstat = os.fstat

    def foreign_fstat(fd):
        result = original_fstat(fd)
        if stat.S_ISDIR(result.st_mode):
            return os.stat_result(
                (
                    result.st_mode,
                    result.st_ino,
                    result.st_dev,
                    result.st_nlink,
                    424242,
                    result.st_gid,
                    result.st_size,
                    result.st_atime,
                    result.st_mtime,
                    result.st_ctime,
                )
            )
        return result

    monkeypatch.setattr(os, "fstat", foreign_fstat)
    with pytest.raises(InitializationError):
        store.provision_fresh()


def test_complete_callback_reentry_is_rejected_without_corrupting_lock_state(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    with pytest.raises(InitializationReentrancyError):
        store.complete(lambda: store.state())
    assert store.state().mode is InitializationMode.PENDING
