"""Host-access removal audits the committed prior entry in a real signed chain."""
import json
from types import SimpleNamespace

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.audit.logger import AuditLogger
from src.config.schema import ApiTokenIdentity, WebConfig
from src.health.server import SessionManager, _make_auth_middleware
from src.permissions.host_access import HostAccessManager
from src.web.api.security import register_host_access


async def test_removal_audits_actor_user_previous_and_no_404_entry(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    identity = ApiTokenIdentity(token="fixture-credential", user_id="operator", tier="admin")
    config = WebConfig(api_tokens=[identity])
    path = tmp_path / "audit.jsonl"
    hosts = HostAccessManager(str(tmp_path / "hosts.json"), ["alpha", "beta"])
    audit = AuditLogger(str(path), hmac_key="fixture-signing-key")
    bot = SimpleNamespace(host_access_manager=hosts, audit=audit)
    routes = web.RouteTableDef()
    register_host_access(routes, bot)
    app = web.Application(middlewares=[_make_auth_middleware(config, SessionManager())])
    app.router.add_routes(routes)
    headers = {"Authorization": f"Bearer {identity.token}"}
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/host-access/user/visitor", headers=headers,
                                    json={"allowed_hosts": ["alpha"], "default_host": "alpha"})
        assert response.status == 200
        # Another manager changes the persisted entry. The audit must capture
        # the value actually deleted, not the route manager's stale snapshot.
        other = HostAccessManager(str(tmp_path / "hosts.json"), ["alpha", "beta"])
        await other.set_user("visitor", ["beta"], "beta")
        response = await client.delete("/api/host-access/user/visitor", headers=headers)
        assert response.status == 200
        assert await response.json() == {"user_id": "visitor", "status": "override_removed"}
        before_missing = path.read_bytes()
        response = await client.delete("/api/host-access/user/visitor", headers=headers)
        assert response.status == 404
        assert path.read_bytes() == before_missing
    entries = [json.loads(line) for line in path.read_text().splitlines()]
    assert len(entries) == 2
    removed = entries[1]
    assert removed["type"] == "host_access_change"
    assert removed["action"] == "delete_user"
    assert removed["actor"] == "web:operator"
    assert removed["detail"].startswith("Removed host access for user visitor: previous=")
    assert json.loads(removed["detail"].split("previous=", 1)[1]) == {
        "allowed_hosts": ["beta"], "default_host": "beta"}
    assert identity.token not in path.read_text()
    assert removed["_prev_hmac"] == entries[0]["_hmac"]
    assert (await audit.verify_integrity())["valid"]
    restored = HostAccessManager(str(tmp_path / "hosts.json"), ["alpha", "beta"])
    assert not restored.has_user_entry("visitor")


async def test_delete_entry_retains_boolean_compatibility_and_prior_value(tmp_path):
    hosts = HostAccessManager(str(tmp_path / "hosts.json"), ["alpha"])
    await hosts.set_user("visitor", [], "")
    previous = await hosts.delete_user_entry("visitor")
    assert previous.to_dict() == {"allowed_hosts": [], "default_host": ""}
    assert await hosts.delete_user_entry("visitor") is None
    await hosts.set_user("visitor", None, "alpha")
    assert await hosts.delete_user("visitor") is True
    assert await hosts.delete_user("visitor") is False
