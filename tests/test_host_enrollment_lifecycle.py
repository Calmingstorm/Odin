"""Enrollment probes and real content-addressed trust-file lifecycle (#658)."""

from __future__ import annotations

import asyncio
import base64
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ToolHost
from src.tools.hosts import HostEnrollmentManager, HostRegistry, HostTrustError, control
from src.tools.hosts.trust import fingerprint_public_key
from src.tools.ssh_options import known_hosts_option


def _key(seed: bytes = b"enrollment-key") -> str:
    return "ssh-ed25519 " + base64.b64encode(seed).decode("ascii")


def _host(**overrides) -> ToolHost:
    return ToolHost(**{
        "address": "example.invalid", "ssh_user": "deploy", "os": "linux",
        "host_id": "06eebf65-8f6e-4c36-9acc-ce393fb34642",
        "trust_mode": "pinned", "host_keys": [_key()], **overrides,
    })


async def _prepare(manager, monkeypatch, *, key=None, existing=None, trust_mode="pinned"):
    key = key or _key()
    monkeypatch.setattr(manager, "scan", AsyncMock(return_value=(key,)))
    monkeypatch.setattr(manager, "scan_ca", AsyncMock(return_value=(key,)))
    return await manager.prepare("build", {
        "address": "example.invalid", "ssh_user": "deploy", "os": "linux",
        "trust_mode": trust_mode, "expected_fingerprints": [fingerprint_public_key(key)],
        "candidate_fingerprints": [fingerprint_public_key(key)], "confirm_tofu": True,
    }, allow_tofu=True, existing=existing)


def _probe(monkeypatch, code=0, output=b"odin-host-test linux\n"):
    probe = AsyncMock(return_value=(code, output))
    monkeypatch.setattr(control, "_run_argv", probe)
    return probe


def _clock(monkeypatch, monotonic):
    # Replace only control's module binding, never the shared stdlib/loop clock.
    monkeypatch.setattr(control, "time", SimpleNamespace(monotonic=monotonic, time=time.time))


@pytest.mark.parametrize(("code", "output", "platform", "ok"), [
    (255, b"deploy@example.invalid: Permission denied (publickey).", "", False),
    (255, b"Connection refused", "", False),
    (0, b"", "", False),
    (0, b"notice odin-host-test linux\n", "", False),
    (0, b"notice\nodin-host-test linux\n", "", False),
    (0, b" odin-host-test linux\n", "", False),
    (0, b"odin-host-test linux\n", "linux", True),
    (0, b"odin-host-test macos\n", "macos", False),
    (0, b"odin-host-test unknown\n", "unknown", False),
    (1, b"odin-host-test linux\n", "linux", False),
])
async def test_platform_requires_probe_prefix(monkeypatch, tmp_path, code, output, platform, ok):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    candidate = await _prepare(manager, monkeypatch)
    _probe(monkeypatch, code, output)
    result = (await manager.test(candidate.token)).test_result
    assert result["platform"] == platform
    assert result["ok"] is ok
    if output.startswith(b"odin-host-test ") and code == 0 and not ok:
        assert result["detail"].startswith("platform mismatch:")


async def test_timeout_has_no_platform(monkeypatch, tmp_path):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    candidate = await _prepare(manager, monkeypatch)
    monkeypatch.setattr(control, "_run_argv", AsyncMock(side_effect=TimeoutError))
    result = (await manager.test(candidate.token)).test_result
    assert result["platform"] == ""
    assert not result["ok"]
    manager.discard(candidate.token)
    assert not list(tmp_path.glob("*.known_hosts"))


@pytest.mark.parametrize("trust_mode", ["pinned", "ca", "tofu"])
@pytest.mark.parametrize("cleanup", ["discard", "prune", "get", "prepare"])
async def test_abandoned_test_removes_real_trust_file(monkeypatch, tmp_path, trust_mode, cleanup):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    candidate = await _prepare(manager, monkeypatch, trust_mode=trust_mode)
    _probe(monkeypatch, 255, b"Permission denied (publickey).")
    await manager.test(candidate.token)
    paths = list(tmp_path.glob("*.known_hosts"))
    assert len(paths) == 1
    assert _key() in paths[0].read_text()
    if cleanup == "discard":
        manager.discard(candidate.token)
        manager.discard(candidate.token)
    else:
        _clock(monkeypatch, lambda: candidate.created_monotonic + 901)
        if cleanup == "prune":
            manager._prune()
        elif cleanup == "get":
            with pytest.raises(HostTrustError, match="unknown or expired"):
                manager.get(candidate.token)
        else:
            await _prepare(manager, monkeypatch)
    assert not paths[0].exists()
    assert candidate.token not in manager._candidates


@pytest.mark.parametrize("enabled", [True, False])
@pytest.mark.parametrize("cleanup", ["discard", "prune"])
async def test_active_trust_survives_candidate_cleanup(monkeypatch, tmp_path, enabled, cleanup):
    host = _host(enabled=enabled)
    registry = HostRegistry({"build": host}, trust_dir=tmp_path)
    manager = HostEnrollmentManager(registry)
    path = Path(registry.get("build").known_hosts_path)
    payload = path.read_bytes()
    candidate = await _prepare(manager, monkeypatch, existing=host)
    _probe(monkeypatch)
    await manager.test(candidate.token)
    if cleanup == "discard":
        manager.discard(candidate.token)
    else:
        _clock(monkeypatch, lambda: candidate.created_monotonic + 901)
        manager._prune()
    assert path.read_bytes() == payload


async def test_committed_candidate_discard_preserves_trust(monkeypatch, tmp_path):
    registry = HostRegistry({}, trust_dir=tmp_path)
    manager = HostEnrollmentManager(registry)
    candidate = await _prepare(manager, monkeypatch)
    _probe(monkeypatch)
    candidate = await manager.test(candidate.token)
    registry.publish({"build": candidate.as_tool_host()})
    path = Path(registry.get("build").known_hosts_path)
    manager.discard(candidate.token)  # The WebUI commit lifecycle.
    assert path.exists()
    lease = registry.acquire("build")
    assert lease is not None
    lease.release()


async def test_shared_pending_trust_survives_until_last_discard(monkeypatch, tmp_path):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    first = await _prepare(manager, monkeypatch, existing=_host())
    second = await _prepare(manager, monkeypatch, existing=_host())
    _probe(monkeypatch)
    await manager.test(first.token)
    path, = tmp_path.glob("*.known_hosts")
    manager.discard(first.token)
    assert path.exists()  # Even the untested second candidate references it.
    await manager.test(second.token)
    assert list(tmp_path.glob("*.known_hosts")) == [path]
    manager.discard(second.token)
    assert not path.exists()


async def test_changed_key_cleanup_keeps_active_and_other_candidate(monkeypatch, tmp_path):
    host = _host()
    registry = HostRegistry({"build": host}, trust_dir=tmp_path)
    manager = HostEnrollmentManager(registry)
    active_path = Path(registry.get("build").known_hosts_path)
    first = await _prepare(manager, monkeypatch, key=_key(b"new"), existing=host)
    second = await _prepare(manager, monkeypatch, key=_key(b"other"), existing=host)
    _probe(monkeypatch)
    await manager.test(first.token)
    first_path, = set(tmp_path.glob("*.known_hosts")) - {active_path}
    await manager.test(second.token)
    second_path, = set(tmp_path.glob("*.known_hosts")) - {active_path, first_path}
    manager.discard(first.token)
    assert not first_path.exists()
    assert active_path.exists() and second_path.exists()
    manager.discard(second.token)
    assert active_path.exists() and not second_path.exists()


async def test_retired_leased_trust_is_not_candidate_owned(monkeypatch, tmp_path):
    host = _host()
    registry = HostRegistry({"build": host}, trust_dir=tmp_path)
    lease = registry.acquire("build")
    path = Path(lease.target.known_hosts_path)
    manager = HostEnrollmentManager(registry)
    candidate = await _prepare(manager, monkeypatch, existing=host)
    _probe(monkeypatch)
    await manager.test(candidate.token)
    registry.publish({"build": _host(host_keys=[_key(b"replacement")])})
    manager.discard(candidate.token)
    assert path.exists()
    lease.release()


async def test_active_trust_replaced_during_probe_is_never_candidate_owned(monkeypatch, tmp_path):
    host = _host()
    registry = HostRegistry({"build": host}, trust_dir=tmp_path)
    manager = HostEnrollmentManager(registry)
    candidate = await _prepare(manager, monkeypatch, existing=host)
    path = Path(registry.get("build").known_hosts_path)

    async def probe(*_args):
        registry.publish({"build": _host(host_keys=[_key(b"replacement")])})
        return 0, b"odin-host-test linux\n"

    monkeypatch.setattr(control, "_run_argv", probe)
    await manager.test(candidate.token)
    manager.discard(candidate.token)
    assert path.exists()


async def test_legacy_and_local_do_not_own_trust_files(monkeypatch, tmp_path):
    legacy_path = tmp_path / "legacy-known-hosts"
    legacy_path.write_text("public legacy trust\n")
    registry = HostRegistry({}, trust_dir=tmp_path, legacy_known_hosts_path=str(legacy_path))
    manager = HostEnrollmentManager(registry)
    local = await manager.prepare("local", {
        "address": "127.0.0.1", "confirm_local": True,
    }, allow_tofu=False)
    legacy = await manager.prepare("legacy", {
        "address": "example.invalid", "trust_mode": "legacy",
    }, allow_tofu=False, existing=ToolHost(address="example.invalid"))
    _probe(monkeypatch)
    await manager.test(local.token)
    await manager.test(legacy.token)
    manager.discard(local.token)
    manager.discard(legacy.token)
    assert legacy_path.read_text() == "public legacy trust\n"
    assert not manager._candidate_trust


async def test_consume_transfers_trust_without_deleting(monkeypatch, tmp_path):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    candidate = await _prepare(manager, monkeypatch)
    _probe(monkeypatch)
    await manager.test(candidate.token)
    path, = tmp_path.glob("*.known_hosts")
    manager.consume(candidate.token)
    manager._prune()
    assert path.exists()


async def test_discard_during_test_defers_cleanup_and_does_not_resurrect(monkeypatch, tmp_path):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    candidate = await _prepare(manager, monkeypatch)
    started, finish = asyncio.Event(), asyncio.Event()

    async def probe(*_args):
        started.set()
        await finish.wait()
        return 0, b"odin-host-test linux\n"

    monkeypatch.setattr(control, "_run_argv", probe)
    task = asyncio.create_task(manager.test(candidate.token))
    await started.wait()
    path, = tmp_path.glob("*.known_hosts")
    manager.discard(candidate.token)
    assert path.exists()
    finish.set()
    await task
    assert candidate.token not in manager._candidates
    assert not path.exists()


async def test_locked_publication_defers_candidate_cleanup(monkeypatch, tmp_path):
    registry = HostRegistry({}, trust_dir=tmp_path)
    lock = asyncio.Lock()
    manager = HostEnrollmentManager(registry, publication_lock=lock)
    candidate = await _prepare(manager, monkeypatch)
    _probe(monkeypatch)
    candidate = await manager.test(candidate.token)
    path, = tmp_path.glob("*.known_hosts")
    async with lock:
        staged = registry.stage({"build": candidate.as_tool_host()})
        manager.discard(candidate.token)
        assert path.exists()
        registry.publish_staged(staged)
    manager._prune()
    assert path.exists()


async def test_cleanup_retries_unlink_error_without_breaking_discard(monkeypatch, tmp_path):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    candidate = await _prepare(manager, monkeypatch)
    _probe(monkeypatch)
    await manager.test(candidate.token)
    path, = tmp_path.glob("*.known_hosts")
    with monkeypatch.context() as patch:
        patch.setattr(Path, "unlink", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError()))
        manager.discard(candidate.token)
    assert path.exists()
    manager._prune()
    assert not path.exists()


async def test_enrollment_known_hosts_option_quotes_whitespace(monkeypatch, tmp_path):
    trust_dir = tmp_path / "host trust"
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=trust_dir))
    candidate = await _prepare(manager, monkeypatch)
    probe = _probe(monkeypatch)
    await manager.test(candidate.token)
    path, = trust_dir.glob("*.known_hosts")
    argv = probe.call_args.args[0]
    assert known_hosts_option(str(path)) in argv
    assert known_hosts_option(str(path)).startswith('UserKnownHostsFile="')


async def test_locked_commit_transfers_ownership_before_removal(monkeypatch, tmp_path):
    registry = HostRegistry({}, trust_dir=tmp_path)
    lock = asyncio.Lock()
    manager = HostEnrollmentManager(registry, publication_lock=lock)
    candidate = await _prepare(manager, monkeypatch)
    _probe(monkeypatch)
    candidate = await manager.test(candidate.token)
    path, = tmp_path.glob("*.known_hosts")
    async with lock:
        registry.publish({"build": candidate.as_tool_host()})
        manager.discard(candidate.token)
        assert not manager._candidate_trust
    registry.publish({})
    manager._prune()
    assert path.exists()


async def test_prune_expired_shared_candidate_keeps_fresh_pending_trust(monkeypatch, tmp_path):
    clock = [1000.0]
    _clock(monkeypatch, lambda: clock[0])
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    first = await _prepare(manager, monkeypatch, existing=_host())
    _probe(monkeypatch)
    await manager.test(first.token)
    path, = tmp_path.glob("*.known_hosts")
    clock[0] += 500
    second = await _prepare(manager, monkeypatch, existing=_host())
    clock[0] += 500
    manager._prune()
    assert first.token not in manager._candidates
    assert second.token in manager._candidates
    assert path.exists()
    manager.discard(second.token)
    assert not path.exists()


async def test_untested_and_unknown_candidates_leave_unrelated_files_alone(monkeypatch, tmp_path):
    unrelated = tmp_path / "unrelated.known_hosts"
    unrelated.write_text("public unrelated trust\n")
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    candidate = await _prepare(manager, monkeypatch)
    manager.discard(candidate.token)
    manager.discard("unknown-candidate")
    manager._prune()
    assert unrelated.read_text() == "public unrelated trust\n"
    assert list(tmp_path.glob("*.known_hosts")) == [unrelated]


async def test_imported_legacy_candidate_cleans_only_pinned_trust(monkeypatch, tmp_path):
    legacy_path = tmp_path / "legacy-known-hosts"
    legacy_path.write_text(f"example.invalid {_key()}\n")
    registry = HostRegistry({}, trust_dir=tmp_path, legacy_known_hosts_path=str(legacy_path))
    manager = HostEnrollmentManager(registry)
    _probe(monkeypatch, output=legacy_path.read_bytes())
    candidate = await manager.import_legacy("build", ToolHost(address="example.invalid"))
    _probe(monkeypatch)
    await manager.test(candidate.token)
    path, = tmp_path.glob("*.known_hosts")
    manager.discard(candidate.token)
    assert not path.exists()
    assert legacy_path.read_text() == f"example.invalid {_key()}\n"


async def test_cancelled_probe_releases_cleanup_deferral(monkeypatch, tmp_path):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    candidate = await _prepare(manager, monkeypatch)
    started = asyncio.Event()

    async def probe(*_args):
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(control, "_run_argv", probe)
    task = asyncio.create_task(manager.test(candidate.token))
    await started.wait()
    manager.discard(candidate.token)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not manager._testing
    assert not list(tmp_path.glob("*.known_hosts"))


async def test_mismatched_active_trust_survives_failed_test_discard(monkeypatch, tmp_path):
    host = _host()
    registry = HostRegistry({"build": host}, trust_dir=tmp_path)
    manager = HostEnrollmentManager(registry)
    candidate = await _prepare(manager, monkeypatch, existing=host)
    path = Path(registry.get("build").known_hosts_path)
    _probe(monkeypatch, 255, b"Host key verification failed.")
    await manager.test(candidate.token)
    assert registry.get("build").trust_state == "mismatch"
    manager.discard(candidate.token)
    assert path.exists()


async def test_parallel_probes_keep_expired_trust_until_last_finishes(monkeypatch, tmp_path):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    candidate = await _prepare(manager, monkeypatch)
    started = asyncio.Event()
    finishes = [asyncio.Event(), asyncio.Event()]
    calls = []

    async def probe(*_args):
        index = len(calls)
        calls.append(index)
        if len(calls) == 2:
            started.set()
        await finishes[index].wait()
        return 0, b"odin-host-test linux\n"

    monkeypatch.setattr(control, "_run_argv", probe)
    tasks = [asyncio.create_task(manager.test(candidate.token)) for _ in range(2)]
    await started.wait()
    path, = tmp_path.glob("*.known_hosts")
    _clock(monkeypatch, lambda: candidate.created_monotonic + 901)
    manager._prune()
    assert path.exists()
    finishes[0].set()
    await tasks[0]
    assert path.exists()
    assert manager._testing[candidate.token] == 1
    finishes[1].set()
    await tasks[1]
    assert candidate.token not in manager._candidates
    assert not manager._testing
    assert not path.exists()
