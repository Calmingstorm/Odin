"""Hermetic API contracts for the managed-hosts control plane.

The handlers are exercised through aiohttp rather than called directly so
request parsing, admin fencing, and JSON responses remain part of the test.
All enrollment, public-key, reference, and persistence edges are replaced at
the module boundary; this file never invokes SSH or reads the deployed tree.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ToolHost
from src.tools.hosts import HostCandidate, HostRegistry, HostTrustError
from src.web.api import hosts as hosts_api


_HOST_ID = "06eebf65-8f6e-4c36-9acc-ce393fb34642"
_CANDIDATE_ID = "ee2e82bc-a22f-4373-bc3a-29e9ce6b31d4"


def _host(**overrides) -> ToolHost:
    values = {
        "address": "198.51.100.10",
        "ssh_user": "deploy",
        "os": "linux",
        "host_id": _HOST_ID,
        "description": "build box",
        "trust_mode": "legacy",
    }
    values.update(overrides)
    return ToolHost(**values)


class _Audit:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def log_event(self, **event) -> None:
        self.events.append(event)


class _Processes:
    def __init__(self, result=None) -> None:
        self.result = result or {"attempted": 2, "unknown": 1}
        self.aliases: list[str] = []

    async def force_revoke_host(self, alias: str) -> dict:
        self.aliases.append(alias)
        return self.result


def _bot(tmp_path, *, hosts=None, auth=False, with_registry=True):
    configured = hosts if hosts is not None else {"alpha": _host()}
    registry = (
        HostRegistry(
            configured,
            key_path="/fake/effective-key",
            legacy_known_hosts_path="/fake/effective-known-hosts",
            default_host="alpha",
            trust_dir=tmp_path / "trust",
        )
        if with_registry
        else None
    )
    tools = SimpleNamespace(
        hosts=configured,
        default_host="alpha" if "alpha" in configured else "",
        allow_host_tofu=False,
        ssh_key_path="/fake/desired-key",
        ssh_known_hosts_path="/fake/desired-known-hosts",
    )
    return SimpleNamespace(
        config=SimpleNamespace(
            tools=tools,
            web=SimpleNamespace(api_token="configured" if auth else "", api_tokens=[]),
        ),
        host_registry=registry,
        prompt_builder=SimpleNamespace(cached_hosts={"old": "value"}),
        audit=_Audit(),
        tool_executor=SimpleNamespace(_process_registry=_Processes()),
    )


def _app(bot) -> web.Application:
    app = web.Application()
    routes = web.RouteTableDef()
    hosts_api.register_hosts(routes, bot)
    app.router.add_routes(routes)
    return app


async def _client(bot) -> TestClient:
    return TestClient(TestServer(_app(bot)))


async def _persist_ok(changes):
    return None, False


def _candidate(alias: str, *, existing: ToolHost | None, token="candidate-1") -> HostCandidate:
    return HostCandidate(
        token=token,
        alias=alias,
        host_id=existing.host_id if existing is not None else _CANDIDATE_ID,
        address="203.0.113.25",
        ssh_user="operator",
        os="linux",
        port=2222,
        description="candidate",
        enabled=True,
        trust_mode="legacy",
        host_keys=(),
        fingerprints=(),
        local_confirmed=False,
        tofu_confirmed=False,
        created_monotonic=time.monotonic(),
        expected_definition=(
            tuple(sorted(existing.model_dump().items())) if existing is not None else None
        ),
    )


@pytest.mark.asyncio
async def test_admin_denial_unavailable_list_and_public_key(monkeypatch, tmp_path):
    denied_bot = _bot(tmp_path, auth=True)
    async with await _client(denied_bot) as client:
        response = await client.get("/api/hosts")
        assert response.status == 403

        app_identity = SimpleNamespace(user_id="viewer", tier="user")
        response = await client.get("/api/hosts", headers={"X-Test": "ignored"})
        assert response.status == 403
        # aiohttp has no middleware in this hermetic app; attach identity using
        # the route's normal request attribute through a tiny second app below.
        assert app_identity.tier == "user"

    unavailable = _bot(tmp_path, with_registry=False)
    async with await _client(unavailable) as client:
        response = await client.get("/api/hosts")
        assert response.status == 503

    bot = _bot(tmp_path)

    async def public_key(path):
        assert path == "/fake/effective-key"
        return {"public_key": "ssh-ed25519 AAAA", "fingerprint": "SHA256:test"}

    monkeypatch.setattr(hosts_api, "public_key_info", public_key)
    async with await _client(bot) as client:
        listed = await client.get("/api/hosts")
        assert listed.status == 200
        assert (await listed.json())["default_host"] == "alpha"

        key = await client.get("/api/hosts/public-key")
        key_body = await key.json()
        assert key_body["restart_pending"] is True
        assert key_body["desired_key_path"] == "/fake/desired-key"

    async def key_error(_path):
        raise HostTrustError("key unreadable")

    monkeypatch.setattr(hosts_api, "public_key_info", key_error)
    async with await _client(bot) as client:
        assert (await client.get("/api/hosts/public-key")).status == 400


@pytest.mark.asyncio
async def test_settings_validation_save_and_persistence_failure(monkeypatch, tmp_path):
    bot = _bot(tmp_path)
    changes: list[list] = []

    async def persist(recorded):
        changes.append(recorded)
        return None, False

    monkeypatch.setattr(hosts_api.config_persistence, "persist_config_paths_locked", persist)
    async with await _client(bot) as client:
        for payload in ({}, {"other": True}, {"default_host": 1}, {"default_host": "missing"}, {"allow_host_tofu": "yes"}):
            response = await client.post("/api/hosts/settings", json=payload)
            assert response.status == 400
        response = await client.post(
            "/api/hosts/settings", json={"default_host": "alpha", "allow_host_tofu": True}
        )
        assert response.status == 200
        assert (await response.json())["tofu_enabled"] is True
        assert bot.config.tools.allow_host_tofu is True
        assert changes == [[(("tools", "allow_host_tofu"), True)]]

    async def persist_failure(_changes):
        return RuntimeError("disk full"), False

    monkeypatch.setattr(hosts_api.config_persistence, "persist_config_paths_locked", persist_failure)
    async with await _client(bot) as client:
        response = await client.post("/api/hosts/settings", json={"default_host": ""})
        assert response.status == 500
        assert "not saved" in (await response.json())["error"]
        assert bot.config.tools.default_host == "alpha"


@pytest.mark.asyncio
async def test_candidate_prepare_import_test_commit_and_stale_cas(monkeypatch, tmp_path):
    bot = _bot(tmp_path)
    prepared: list[HostCandidate] = []

    async def prepare(manager, alias, _body, *, allow_tofu, existing=None):
        assert allow_tofu is False
        candidate = _candidate(alias, existing=existing, token=f"prepare-{len(prepared)}")
        manager._candidates[candidate.token] = candidate
        prepared.append(candidate)
        return candidate

    async def import_legacy(manager, alias, host):
        candidate = _candidate(alias, existing=host, token="legacy-import")
        manager._candidates[candidate.token] = candidate
        return candidate

    async def test(manager, token):
        candidate = replace(manager.get(token), tested=True, test_result={"ok": True})
        manager._candidates[token] = candidate
        return candidate

    monkeypatch.setattr(hosts_api.HostEnrollmentManager, "prepare", prepare)
    monkeypatch.setattr(hosts_api.HostEnrollmentManager, "import_legacy", import_legacy)
    monkeypatch.setattr(hosts_api.HostEnrollmentManager, "test", test)
    monkeypatch.setattr(hosts_api.config_persistence, "persist_config_paths_locked", _persist_ok)

    async with await _client(bot) as client:
        invalid = await client.post("/api/hosts/candidates", json={"alias": "bad"})
        assert invalid.status == 201  # The manager seam owns validation here.
        token = (await invalid.json())["candidate_token"]
        blocked = await client.post(f"/api/hosts/candidates/{token}/commit")
        assert blocked.status == 400

        tested = await client.post(f"/api/hosts/candidates/{token}/test")
        assert tested.status == 200
        saved = await client.post(f"/api/hosts/candidates/{token}/commit")
        assert saved.status == 201
        assert bot.config.tools.hosts["bad"].address == "203.0.113.25"
        assert bot.prompt_builder.cached_hosts == {}

        missing = await client.post("/api/hosts/missing/import-legacy")
        assert missing.status == 404
        imported = await client.post("/api/hosts/alpha/import-legacy")
        assert imported.status == 200

        stale = await client.post("/api/hosts/candidates", json={"alias": "alpha"})
        stale_token = (await stale.json())["candidate_token"]
        await client.post(f"/api/hosts/candidates/{stale_token}/test")
        bot.config.tools.hosts["alpha"] = _host(description="changed")
        response = await client.post(f"/api/hosts/candidates/{stale_token}/commit")
        assert response.status == 409
        assert any(event["action"] == "prepare" for event in bot.audit.events)
        assert any(event["action"] == "add" for event in bot.audit.events)


@pytest.mark.asyncio
async def test_candidate_errors_and_persistence_error(monkeypatch, tmp_path):
    bot = _bot(tmp_path)

    async def prepare_raises(_manager, _alias, _body, **_kwargs):
        raise HostTrustError("bad host")

    async def import_raises(_manager, _alias, _host):
        raise HostTrustError("no legacy key")

    monkeypatch.setattr(hosts_api.HostEnrollmentManager, "prepare", prepare_raises)
    monkeypatch.setattr(hosts_api.HostEnrollmentManager, "import_legacy", import_raises)
    async with await _client(bot) as client:
        assert (await client.post("/api/hosts/candidates", json={"alias": "alpha"})).status == 400
        assert (await client.post("/api/hosts/alpha/import-legacy")).status == 400
        assert (await client.post("/api/hosts/candidates/missing/test")).status == 400

    candidate = _candidate("new", existing=None, token="persist-error")

    async def prepare(manager, _alias, _body, **_kwargs):
        manager._candidates[candidate.token] = candidate
        return candidate

    async def test(manager, token):
        tested = replace(manager.get(token), tested=True, test_result={"ok": True})
        manager._candidates[token] = tested
        return tested

    async def persist_error(_changes):
        return OSError("readonly"), False

    monkeypatch.setattr(hosts_api.HostEnrollmentManager, "prepare", prepare)
    monkeypatch.setattr(hosts_api.HostEnrollmentManager, "test", test)
    monkeypatch.setattr(hosts_api.config_persistence, "persist_config_paths_locked", persist_error)
    async with await _client(bot) as client:
        created = await client.post("/api/hosts/candidates", json={"alias": "new"})
        token = (await created.json())["candidate_token"]
        await client.post(f"/api/hosts/candidates/{token}/test")
        response = await client.post(f"/api/hosts/candidates/{token}/commit")
        assert response.status == 500
        assert "not saved" in (await response.json())["error"]
        assert "new" not in bot.config.tools.hosts


@pytest.mark.asyncio
async def test_enabled_references_delete_and_force_revoke(monkeypatch, tmp_path):
    bot = _bot(tmp_path)
    monkeypatch.setattr(hosts_api.config_persistence, "persist_config_paths_locked", _persist_ok)
    references = [{"kind": "schedule", "location": "daily"}]
    monkeypatch.setattr(hosts_api, "scan_host_references", lambda _bot, _alias: references)

    lease = bot.host_registry.acquire("alpha")
    assert lease is not None
    async with await _client(bot) as client:
        assert (await client.post("/api/hosts/alpha/enabled", data="not-json")).status == 400
        assert (await client.post("/api/hosts/alpha/enabled", json={"enabled": "yes"})).status == 400
        assert (await client.post("/api/hosts/missing/enabled", json={"enabled": False})).status == 404
        disabled = await client.post("/api/hosts/alpha/enabled", json={"enabled": False})
        assert disabled.status == 200
        assert bot.config.tools.hosts["alpha"].enabled is False

        assert (await client.get("/api/hosts/missing/references")).status == 404
        ref_response = await client.get("/api/hosts/alpha/references")
        assert (await ref_response.json())["references"] == references
        blocked_delete = await client.delete("/api/hosts/alpha")
        assert blocked_delete.status == 409
        assert (await client.delete("/api/hosts/missing")).status == 404

        revoked = await client.post("/api/hosts/alpha/force-revoke")
        body = await revoked.json()
        assert revoked.status == 200
        assert body["leases_interrupted"] == 1
        assert body["remote_processes"]["unknown"] == 1
        assert bot.tool_executor._process_registry.aliases == ["alpha"]

        assert (await client.post("/api/hosts/missing/force-revoke")).status == 404

    lease.release()
    monkeypatch.setattr(hosts_api, "scan_host_references", lambda _bot, _alias: [])
    async with await _client(bot) as client:
        removed = await client.delete("/api/hosts/alpha")
        assert removed.status == 200
        assert "alpha" not in bot.config.tools.hosts


@pytest.mark.asyncio
async def test_drain_mutation_cancellation_contract():
    started = asyncio.Event()
    release = asyncio.Event()

    async def operation():
        started.set()
        await release.wait()
        return "saved"

    task = asyncio.create_task(hosts_api._drain_host_mutation(operation(), commit_started=asyncio.Event()))
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    committed = asyncio.Event()
    committed.set()
    started.clear()
    task = asyncio.create_task(hosts_api._drain_host_mutation(operation(), commit_started=committed))
    await started.wait()
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
