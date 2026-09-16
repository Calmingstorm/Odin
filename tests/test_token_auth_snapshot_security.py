"""Independent F12 reproductions: store publication and live auth integrity."""
from __future__ import annotations

import json
import os

import pytest

from src.permissions import token_manager as module
from src.permissions.token_manager import ApiTokenManager, _hash_token


def entry(**overrides):
    return {"user_id": "owner", "token_hash": _hash_token("known-secret"),
            "allowed_hosts": ["localhost"], **overrides}


def manager_at(tmp_path, data=None):
    path = tmp_path / "api_tokens.json"
    path.write_text(json.dumps([entry()] if data is None else data))
    return ApiTokenManager(str(path)), path


def test_external_empty_revokes_but_cannot_disable_auth(tmp_path):
    manager, path = manager_at(tmp_path)
    assert manager.resolve("known-secret")
    path.write_text("[]")
    snapshot = manager.auth_snapshot()
    assert snapshot.credential_store_status == "valid"
    assert snapshot.credential_inventory.dynamic_usable == 0
    assert snapshot.credential_store_auth_required
    assert snapshot.resolve("known-secret") is None
    assert manager.credential_store_auth_required  # unchanged empty stays blocked
    path.write_text(json.dumps([entry()]))
    assert not manager.credential_store_auth_required
    assert manager.resolve("known-secret")


def test_corrupt_then_empty_is_not_repaired_into_anonymous(tmp_path):
    manager, path = manager_at(tmp_path)
    path.write_text("{")
    assert manager.credential_store_auth_required
    path.write_text("[]")
    assert manager.credential_store_auth_required


def test_initial_empty_store_is_still_bootstrap(tmp_path):
    manager, _ = manager_at(tmp_path, [])
    assert not manager.credential_store_auth_required
    assert not manager.dynamic_auth_required


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "guarded,allowed,blocked", [(True, True, False), (True, False, True), (False, True, True)],
)
async def test_last_removal_requires_guard_to_relax_live_protection(
    tmp_path, guarded, allowed, blocked,
):
    manager, path = manager_at(tmp_path)
    if guarded:
        manager.set_last_credential_guard(lambda inventory: allowed)
    if not allowed:
        with pytest.raises(PermissionError, match="non-loopback"):
            await manager.delete_token("owner")
        assert manager.resolve("known-secret")
        return
    assert await manager.delete_token("owner")
    assert json.loads(path.read_text()) == []
    assert manager.credential_store_auth_required is blocked


@pytest.mark.asyncio
async def test_async_guard_and_nonboolean_guard(tmp_path):
    manager, _ = manager_at(tmp_path)
    async def allow(inventory):
        assert inventory.dynamic_usable == 0
        return True
    manager.set_last_credential_guard(allow)
    assert await manager.delete_token("owner")
    await manager.create_token("new")
    manager.set_last_credential_guard(lambda _: "yes")
    with pytest.raises(TypeError, match="must return bool"):
        await manager.delete_token("new")


@pytest.mark.parametrize("unknown", ["allowed_host", "allowed_tool", "tiers", "token"])
def test_unknown_store_fields_remain_v398_compatible(tmp_path, unknown):
    manager, _ = manager_at(tmp_path, [entry(**{unknown: "restriction"})])
    assert manager.credential_store_status == "valid"
    assert not manager.credential_store_auth_required
    assert manager.resolve("known-secret") is not None


@pytest.mark.parametrize("mode", [0o666, 0o620, 0o602])
def test_legacy_writable_modes_remain_read_compatible(tmp_path, mode):
    manager, path = manager_at(tmp_path)
    assert manager.resolve("known-secret")
    path.chmod(mode)
    assert manager.credential_store_status == "valid"
    assert manager.resolve("known-secret") is not None
    assert not manager.credential_store_auth_required


@pytest.mark.parametrize("kind", ["fifo", "directory"])
def test_nonregular_store_replacement_is_denied_without_blocking(tmp_path, kind):
    manager, path = manager_at(tmp_path)
    target = tmp_path / "target"
    path.rename(target)
    if kind == "symlink":
        path.symlink_to(target)
    elif kind == "fifo":
        os.mkfifo(path)
    else:
        path.mkdir()
    assert manager.credential_store_status == "unreadable"
    assert manager.resolve("known-secret") is None


def test_symlinked_store_remains_v398_compatible(tmp_path):
    manager, path = manager_at(tmp_path)
    target = tmp_path / "target"
    path.rename(target)
    path.symlink_to(target)

    assert manager.credential_store_status == "valid"
    assert manager.resolve("known-secret") is not None


def test_open_replacement_race_rejects_mismatched_descriptor(tmp_path, monkeypatch):
    manager, path = manager_at(tmp_path)
    real_open = os.open
    def replace_before_open(name, flags, *args, **kwargs):
        path.unlink()
        path.write_text("[]")
        return real_open(name, flags, *args, **kwargs)
    monkeypatch.setattr(os, "open", replace_before_open)
    path.write_text(json.dumps([entry(label="changed")]))
    assert manager.credential_store_status == "unreadable"
    assert manager.resolve("known-secret") is None


def test_changed_during_read_and_after_read_are_rejected(tmp_path, monkeypatch):
    manager, path = manager_at(tmp_path)
    read = manager._read_store
    def mutate_after(signature):
        text = read(signature)
        path.write_text("[]")
        return text
    monkeypatch.setattr(manager, "_read_store", mutate_after)
    path.write_text(json.dumps([entry(label="changed")]))
    assert manager.credential_store_status == "unreadable"
    assert manager.credential_store_auth_required


@pytest.mark.parametrize("replace", [False, True])
def test_descriptor_read_detects_inplace_and_atomic_writer(tmp_path, monkeypatch, replace):
    manager, path = manager_at(tmp_path)
    fdopen = os.fdopen

    class RacingStream:
        def __init__(self, stream):
            self.stream = stream

        def __enter__(self):
            return self

        def __exit__(self, *args):
            self.stream.close()

        def fileno(self):
            return self.stream.fileno()

        def read(self):
            contents = self.stream.read()
            if replace:
                replacement = tmp_path / "replacement"
                replacement.write_text("[]")
                replacement.replace(path)
            else:
                path.write_text("[]")
            return contents

    monkeypatch.setattr(os, "fdopen", lambda *a, **kw: RacingStream(fdopen(*a, **kw)))
    path.write_text(json.dumps([entry(label="changed")]))
    assert manager.credential_store_status == "unreadable"
    assert manager.credential_store_auth_required
    assert manager.resolve("known-secret") is None


def test_stat_failure_is_failclosed(tmp_path, monkeypatch):
    manager, _ = manager_at(tmp_path)
    def denied():
        raise PermissionError("denied")
    monkeypatch.setattr(manager, "_stat_signature", denied)
    assert manager.credential_store_auth_required
    assert manager.resolve("known-secret") is None
    with pytest.raises(ValueError, match="invalid token store status"):
        manager._invalidate_store("anything")


def test_replacement_after_descriptor_verification_is_rejected(tmp_path, monkeypatch):
    manager, path = manager_at(tmp_path)
    fstat = os.fstat
    calls = 0

    def replace_after_fstat(fd):
        nonlocal calls
        info = fstat(fd)
        calls += 1
        if calls == 2:
            replacement = tmp_path / "replacement"
            replacement.write_text("[]")
            replacement.replace(path)
        return info

    monkeypatch.setattr(os, "fstat", replace_after_fstat)
    path.write_text(json.dumps([entry(label="changed")]))
    assert manager.credential_store_status == "unreadable"
    assert manager.credential_store_auth_required


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["create", "update", "regenerate", "delete"])
async def test_save_does_not_pin_own_candidate_to_external_signature(
    tmp_path, monkeypatch, operation,
):
    manager, path = manager_at(tmp_path)
    writer = module.write_private_atomic
    def competing_write(destination, contents):
        result = writer(destination, contents)
        writer(destination, "[]")
        return result
    monkeypatch.setattr(module, "write_private_atomic", competing_write)
    if operation == "delete":
        # Preserve one candidate credential to distinguish our deletion from []
        monkeypatch.setattr(module, "write_private_atomic", writer)
        await manager.create_token("second")
        monkeypatch.setattr(module, "write_private_atomic", competing_write)
    with pytest.raises(RuntimeError, match="changed during credential publication"):
        if operation == "create":
            await manager.create_token("new")
        elif operation == "update":
            await manager.update_token("owner", label="changed")
        elif operation == "regenerate":
            await manager.regenerate_token("owner")
        else:
            await manager.delete_token("owner")
    assert path.read_text() == "[]"
    assert manager.resolve("known-secret") is None
    assert manager.list_tokens() == []
    assert manager.credential_store_auth_required


def test_snapshot_is_coherent_and_does_not_leak_mutable_identities(tmp_path):
    manager, path = manager_at(tmp_path)
    snapshot = manager.auth_snapshot()
    snapshot.resolve("known-secret").allowed_hosts.append("elsewhere")
    assert snapshot.get("owner").allowed_hosts == ["localhost"]
    path.write_text("{")
    assert snapshot.credential_inventory.dynamic_usable == 1
    assert snapshot.resolve("known-secret")
    assert not snapshot.credential_store_auth_required
    assert manager.auth_snapshot().credential_store_auth_required
    assert manager.resolve("known-secret") is None


@pytest.mark.asyncio
async def test_external_revocation_during_guard_cannot_be_resurrected(tmp_path):
    manager, path = manager_at(tmp_path)
    revoked = await manager.create_token("revoked")

    async def guard(_):
        path.write_text("[]")
        # Another request may refresh the shared manager while the guard waits.
        assert manager.credential_store_auth_required
        return True

    manager.set_last_credential_guard(guard)
    with pytest.raises(RuntimeError, match="changed before credential publication"):
        await manager.delete_token("owner")
    assert path.read_text() == "[]"
    assert manager.resolve(revoked.token) is None
    assert manager.credential_store_auth_required


@pytest.mark.asyncio
async def test_degraded_directory_durability_still_publishes_verified_credentials(
    tmp_path, monkeypatch,
):
    manager, _ = manager_at(tmp_path)
    writer = module.write_private_atomic
    def degraded(destination, contents):
        writer(destination, contents)
        return False
    monkeypatch.setattr(module, "write_private_atomic", degraded)
    identity = await manager.create_token("new")
    assert manager.durability_degraded
    assert manager.resolve(identity.token).user_id == "new"


def test_save_rejects_invalid_in_memory_tier(tmp_path):
    manager, _ = manager_at(tmp_path)
    manager._tokens["owner"].identity.tier = "wizard"
    with pytest.raises(ValueError, match="Invalid token tier"):
        manager._save()


def test_detached_identity_requires_exact_manager_issuance(tmp_path):
    import gc
    from weakref import ref

    from src.config.schema import ApiTokenIdentity

    manager, path = manager_at(tmp_path)
    snapshot = manager.auth_snapshot()
    identity = snapshot.resolve("known-secret")
    other = snapshot.get("owner")
    assert identity is not other and identity == other
    assert manager.identity_is_current(identity)
    assert manager.identity_is_current(other)
    assert not manager.identity_is_current(ApiTokenIdentity(**identity.model_dump()))
    assert not manager.identity_is_current(identity.model_copy())
    assert not manager.identity_is_current(identity.model_copy(deep=True))
    other_manager = ApiTokenManager(str(path))
    assert not other_manager.identity_is_current(identity)
    assert not manager.identity_is_current(other_manager.resolve("known-secret"))
    # Nested policy mutations cannot change the store or retain desktop proof.
    identity.allowed_hosts.append("elsewhere")
    assert not manager.identity_is_current(identity)
    assert manager.get("owner").allowed_hosts == ["localhost"]
    assert manager.identity_is_current(other)
    weak = ref(other)
    key = id(other)
    del other
    gc.collect()
    assert weak() is None
    assert key not in manager._identity_issuer._issued


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["rotate", "update", "delete", "recreate", "reload",
                                    "empty", "corrupt", "missing", "unsafe"])
async def test_issued_identity_and_old_snapshot_cannot_cross_store_era(tmp_path, change):
    manager, path = manager_at(tmp_path)
    snapshot = manager.auth_snapshot()
    identity = snapshot.resolve("known-secret")
    assert manager.identity_is_current(identity)
    if change == "rotate":
        await manager.regenerate_token("owner")
    elif change == "update":
        await manager.update_token("owner", label="new label")
    elif change in {"delete", "recreate"}:
        await manager.delete_token("owner")
        if change == "recreate":
            await manager.create_token("owner", allowed_hosts=["localhost"])
    elif change == "reload":
        # Byte-identical replacement is still a new store era.
        replacement = tmp_path / "replacement"
        replacement.write_bytes(path.read_bytes())
        replacement.replace(path)
    elif change == "empty":
        path.write_text("[]")
    elif change == "corrupt":
        path.write_text("{")
    elif change == "missing":
        path.unlink()
    else:
        path.chmod(0o666)
    assert not manager.identity_is_current(identity)
    # Historical snapshots remain coherent but cannot mint current grants.
    assert not manager.identity_is_current(snapshot.resolve("known-secret"))
    current = manager.get("owner")
    if current is not None:
        assert manager.identity_is_current(current)
