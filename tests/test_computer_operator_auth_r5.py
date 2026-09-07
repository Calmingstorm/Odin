"""Real HTTP auth/login/session/token stores; only desktop backend is harmless."""
import asyncio
from contextlib import asynccontextmanager, contextmanager
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, Config
from src.health.server import SessionManager, _make_auth_middleware
from src.permissions.host_access import HostAccessManager
from src.permissions.token_manager import ApiTokenManager
from src.web.api.computer import register_computer
from src.web.api.security import register_auth
from src.web.computer_binding import operator_binding, operator_context_authorized, operator_scope
from tests.test_computer_api import Controller


@contextmanager
def bound_operator(bot, owner, sid):
    """Unit boundary fixture builds the same managed-session grant as HTTP."""
    import time

    from src.web.computer_binding import operator_binding, operator_scope

    principal = ApiTokenIdentity(token="fixture-only", user_id=owner, tier="admin")
    web_config = getattr(bot.config, "web", None)
    if web_config is None:
        bot.config.web = SimpleNamespace(api_token="", api_tokens=[principal])
    else:
        previous = web_config.api_tokens
        web_config.api_tokens = [principal]
    sessions = SessionManager()
    sessions._sessions[sid] = time.monotonic()
    sessions._identities[sid] = principal
    request = SimpleNamespace(_api_identity=principal, _session_id=sid, _session_managed=True,
        app={"session_manager": sessions}, query={})
    binding = operator_binding(bot, request)
    assert binding is not None
    try:
        with operator_scope(binding):
            yield
    finally:
        if web_config is None:
            del bot.config.web
        else:
            web_config.api_tokens = previous


class Backend(Controller):
    def check(self, owner_id, web_session_id):
        assert owner_id == "alice" and web_session_id

    async def operator_recover(self, session_id, generation, **actor):
        self.check(**actor)
        self.calls.append(("recover", session_id, generation))
        return {"state": "closed", "owner_id": "alice"}

    async def operator_acknowledge_legacy(self, acknowledgment, **kwargs):
        assert acknowledgment == "ACKNOWLEDGE UNVERIFIED CLEANUP " + kwargs["session_id"]
        return await self.operator_recover(**kwargs)


ROUTES = [
    ("GET", "/api/computer", None),
    ("POST", "/api/computer/stop", {}),
    ("POST", "/api/computer/pause", {}),
    ("POST", "/api/computer/observe", {}),
    ("GET", "/api/computer/evidence/opaque-frame", None),
    ("POST", "/api/computer/export", {"name": "drawing.png"}),
    ("GET", "/api/computer/download/opaque-artifact", None),
    ("POST", "/api/computer/enabled", {"enabled": True}),
    ("POST", "/api/computer/recover", {"session_id": "computer-session", "generation": 1}),
    ("POST", "/api/computer/acknowledge_legacy", {
        "session_id": "computer-session", "generation": 1,
        "acknowledgment": "ACKNOWLEDGE UNVERIFIED CLEANUP computer-session"}),
]


@asynccontextmanager
async def harness(tmp_path, *, source="dynamic", scope=None, prepare=None, backend=None):
    config = Config(discord={"token": "fixture-only"})
    config.computer.enabled = True
    tokens = ApiTokenManager(str(tmp_path / "tokens.json"))
    values = {"user_id": "alice", **(scope or {})}
    if source == "dynamic":
        identity = await tokens.create_token(**values)
    else:
        identity = ApiTokenIdentity(token="fixture-backing-credential", **values)
        config.web.api_tokens = [identity]
    config.web.api_token = "fixture-unrelated-admin"
    sessions = SessionManager(timeout_minutes=10)
    backend = backend or Backend()
    permission = SimpleNamespace(host=True, tool=True)
    bot = SimpleNamespace(config=config, api_token_manager=tokens, computer=backend,
        host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: permission.host),
        tool_executor=SimpleNamespace(
            check_permission=lambda *_: None if permission.tool else "denied"))

    async def toggle(value):
        backend.calls.append("enabled")
        config.computer.enabled = value
    bot.computer_set_enabled = toggle
    app = web.Application(middlewares=[_make_auth_middleware(config.web, sessions)])
    app["session_manager"], app["token_manager"] = sessions, tokens
    routes = web.RouteTableDef()
    register_auth(routes, bot)
    register_computer(routes, bot)
    app.router.add_routes(routes)
    if prepare:
        app.on_response_prepare.append(prepare)
    async with TestClient(TestServer(app)) as client:
        login = await client.post("/api/auth/login", json={"token": identity.token})
        assert login.status == 200
        sid = (await login.json())["session_id"]
        yield SimpleNamespace(client=client, headers={"Authorization": "Bearer " + sid},
            raw_headers={"Authorization": "Bearer " + identity.token}, sid=sid,
            sessions=sessions, tokens=tokens, bot=bot, backend=backend, permission=permission)


@pytest.mark.parametrize("source", ["dynamic", "static"])
async def test_live_managed_browser_all_operator_routes(tmp_path, source):
    async with harness(tmp_path, source=source) as h:
        for method, path, body in ROUTES:
            response = await h.client.request(method, path, json=body, headers=h.headers)
            assert response.status == 200, (path, await response.text())
        assert "enabled" in h.backend.calls


@pytest.mark.parametrize("source", ["dynamic", "static"])
@pytest.mark.parametrize("kind", ["delete", "rotate", "raw", "hosts", "empty_hosts", "tools",
                                  "host_policy", "tool_policy", "logout", "tier"])
async def test_all_operator_routes_fail_closed(tmp_path, source, kind):
    scope = {"hosts": {"allowed_hosts": ["elsewhere"]},
             "empty_hosts": {"allowed_hosts": []},
             "tools": {"allowed_tools": ["search_history"]},
             "tier": {"tier": "user"}}.get(kind)
    async with harness(tmp_path, source=source, scope=scope) as h:
        if kind == "delete":
            if source == "dynamic":
                await h.tokens.delete_token("alice")
            else:
                h.bot.config.web.api_tokens.clear()
        elif kind == "rotate":
            if source == "dynamic":
                await h.tokens.regenerate_token("alice")
            else:
                h.bot.config.web.api_tokens = [h.bot.config.web.api_tokens[0].model_copy(
                    update={"token": "new-fixture-credential"})]
        elif kind == "logout":
            h.sessions.destroy(h.sid)
        elif kind == "host_policy":
            h.permission.host = False
        elif kind == "tool_policy":
            h.permission.tool = False
        for method, path, body in ROUTES:
            response = await h.client.request(method, path, json=body,
                headers=h.raw_headers if kind == "raw" else h.headers)
            assert response.status in {401, 403, 404}, (path, await response.text())
            assert b"fixture" not in await response.read()
        assert h.backend.calls == []


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize("revocation", ["delete", "scope", "logout"])
async def test_revalidate_after_backend_await(tmp_path, route, revocation):
    async with harness(tmp_path) as h:
        method, path, body = route
        operation = "status" if path == "/api/computer" else path.split("/")[3]
        name = "operator_" + operation
        original = (h.bot.computer_set_enabled if operation == "enabled"
                    else getattr(h.backend, name))

        async def revoked(*args, **kwargs):
            result = await original(*args, **kwargs)
            if revocation == "delete":
                await h.tokens.delete_token("alice")
            elif revocation == "scope":
                await h.tokens.update_token("alice", allowed_tools=["search_history"])
            else:
                h.sessions.destroy(h.sid)
            return result

        if operation == "enabled":
            h.bot.computer_set_enabled = revoked
        else:
            setattr(h.backend, name, revoked)
        response = await h.client.request(method, path, json=body, headers=h.headers)
        assert response.status == 404, (path, await response.text())
        assert b"fixture" not in await response.read()


@pytest.mark.parametrize("path", ["/api/computer/evidence/opaque-frame",
                                  "/api/computer/download/opaque-artifact"])
async def test_binary_prepare_hook_revocation_sends_no_private_bytes(tmp_path, path):
    holder = []

    async def revoke(request, response):
        if request.path == path:
            await holder[0].tokens.delete_token("alice")
    async with harness(tmp_path, prepare=revoke) as h:
        holder.append(h)
        response = await h.client.get(path, headers=h.headers)
        assert response.status == 404
        assert await response.json() == {"error": "Not found or no longer authorized"}
        assert "Content-Disposition" not in response.headers


async def test_grant_is_current_task_local_and_not_forged_context(tmp_path):
    from src.computer.integration import ComputerIntegration
    from src.computer.models import RequestContext

    class Checks(Backend):
        async def operator_status(self, **actor):
            context = RequestContext(actor["owner_id"], ComputerIntegration.web_binding(
                actor["web_session_id"]), "web-operator", "localhost", surface="webui")
            assert operator_context_authorized(context)
            assert not await asyncio.create_task(check_child(context))
            await asyncio.sleep(0)
            assert operator_context_authorized(context)
            self.context = context
            return await super().operator_status(**actor)

    async def check_child(context):
        return operator_context_authorized(context)

    async with harness(tmp_path, backend=Checks()) as h:
        assert (await h.client.get("/api/computer", headers=h.headers)).status == 200
        assert not operator_context_authorized(h.backend.context)


async def test_safety_stop_when_disabled_is_minimal_and_not_raw_authority(tmp_path):
    async with harness(tmp_path) as h:
        h.bot.config.computer.enabled = False
        response = await h.client.post("/api/computer/stop", headers=h.headers)
        assert await response.json() == {"state": "cancelled"}
        assert (await h.client.post("/api/computer/stop", headers=h.raw_headers)).status == 404
        assert (await h.client.post("/api/computer/observe", headers=h.headers)).status == 503


async def test_real_controller_checks_live_grant_after_capture(tmp_path):
    from src.computer.controller import ComputerController
    from src.computer.integration import ComputerIntegration
    from src.computer.models import RequestContext
    from src.computer.store import ComputerStore
    from tests.test_computer_contract_r1 import Stub

    async with harness(tmp_path) as h:
        stub = Stub()
        store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
        integration = ComputerIntegration(h.bot, controller=ComputerController(
            store, lambda _: stub, lambda ctx: integration._authorize(ctx), enabled=True))
        h.bot.computer_authorize_context = lambda ctx: (
            operator_context_authorized(ctx) if ctx.turn_id == "web-operator" else True)
        context = RequestContext("alice", "room", "turn", "localhost")
        await integration.controller.session(context, {"operation": "start", "app": "xed"})
        original = stub.observe

        async def revoked_capture(*args, **kwargs):
            result = await original(*args, **kwargs)
            await h.tokens.delete_token("alice")
            return result
        stub.observe = revoked_capture
        h.backend.operator_observe = integration.operator_observe
        try:
            response = await h.client.post("/api/computer/observe", headers=h.headers)
            assert response.status == 404
            assert "frame" not in await response.text()
            assert not integration._authorize(RequestContext(
                "alice", integration.web_binding(h.sid), "web-operator", "localhost",
                surface="webui"))
        finally:
            await integration.close()
            store.close()


async def test_binary_revocation_after_headers_aborts_body(tmp_path, monkeypatch):
    from aiohttp import ClientError

    from src.web.api.computer import _AuthorizedResponse

    original = _AuthorizedResponse._write_headers
    async with harness(tmp_path) as h:
        async def revoke(response):
            await original(response)
            await h.tokens.delete_token("alice")
        monkeypatch.setattr(_AuthorizedResponse, "_write_headers", revoke)
        try:
            response = await h.client.get("/api/computer/evidence/opaque-frame", headers=h.headers)
            content = await response.read()
        except ClientError:
            pass
        else:
            assert not content


async def test_static_legacy_login_and_rotation(tmp_path):
    async with harness(tmp_path) as h:
        response = await h.client.post("/api/auth/login", json={"token": "fixture-unrelated-admin"})
        sid = (await response.json())["session_id"]
        headers = {"Authorization": "Bearer " + sid}

        async def status(**actor):
            assert actor["owner_id"] == "api-admin"
            return {"state": "closed", "owner_id": "api-admin"}
        h.backend.operator_status = status
        assert (await h.client.get("/api/computer", headers=headers)).status == 200
        h.bot.config.web.api_token = "rotated-fixture"
        assert (await h.client.get("/api/computer", headers=headers)).status == 404


@pytest.mark.parametrize("source", ["dynamic", "static"])
async def test_credential_hosts_override_default_for_every_operator_route(tmp_path, source):
    manager = HostAccessManager(str(tmp_path / "host-policy.json"),
                                available_hosts=["localhost", "playground"])
    await manager.set_default_policy(["playground"], "playground")
    before = (tmp_path / "host-policy.json").read_bytes()
    async with harness(tmp_path, source=source,
                       scope={"allowed_hosts": ["localhost"]}) as h:
        h.bot.host_access_manager = manager
        for method, path, body in ROUTES:
            response = await h.client.request(method, path, json=body, headers=h.headers)
            assert response.status == 200, (path, await response.text())
        assert not manager.has_user_entry("alice")
        assert not manager.is_host_allowed("alice", "localhost")
        assert (tmp_path / "host-policy.json").read_bytes() == before


@pytest.mark.parametrize("hosts,entry,available,allowed", [
    (["localhost"], "absent", ["localhost", "playground"], True),
    (["localhost"], [], ["localhost", "playground"], False),
    (["localhost"], ["playground"], ["localhost", "playground"], False),
    (["localhost"], ["localhost"], ["localhost", "playground"], True),
    (["localhost"], None, ["localhost", "playground"], True),
    ([], "absent", ["localhost", "playground"], False),
    (["playground"], ["localhost"], ["localhost", "playground"], False),
    (None, "absent", ["localhost", "playground"], False),
    (None, ["localhost"], ["localhost", "playground"], True),
    (["localhost"], "absent", ["playground"], False),
])
async def test_operator_effective_host_policy(tmp_path, hosts, entry, available, allowed):
    manager = HostAccessManager(str(tmp_path / "host-policy.json"), available_hosts=available)
    await manager.set_default_policy(["playground"], "playground")
    if entry != "absent":
        await manager.set_user("alice", entry, "")
    async with harness(tmp_path, scope={"allowed_hosts": hosts}) as h:
        h.bot.host_access_manager = manager
        response = await h.client.get("/api/computer", headers=h.headers)
        assert response.status == (200 if allowed else 404)


async def test_operator_scope_covers_real_integration_and_restores_on_exception(tmp_path):
    from src.computer.integration import ComputerIntegration
    from src.computer.models import RequestContext

    manager = HostAccessManager(str(tmp_path / "host-policy.json"),
                                available_hosts=["localhost", "playground"])
    await manager.set_default_policy(["playground"], "playground")
    async with harness(tmp_path, scope={"allowed_hosts": ["localhost"]}) as h:
        h.bot.host_access_manager = manager
        identity = h.sessions.get_identity(h.sid)
        request = SimpleNamespace(_api_identity=identity, _session_id=h.sid,
            _session_managed=True, app={"session_manager": h.sessions,
                                       "token_manager": h.tokens}, query={})
        binding = operator_binding(h.bot, request)
        assert binding is not None
        context = RequestContext("alice", ComputerIntegration.web_binding(h.sid),
                                 "web-operator", "localhost", surface="webui")
        integration = SimpleNamespace(bot=h.bot)
        outer = HostAccessManager.set_request_host_scope(["playground"])
        try:
            assert binding[2]()
            assert manager.get_allowed_hosts("alice") == ["playground"]
            with pytest.raises(RuntimeError, match="fixture failure"):
                with operator_scope(binding):
                    assert ComputerIntegration._authorize(integration, context)
                    await asyncio.sleep(0)
                    assert ComputerIntegration._authorize(integration, context)
                    raise RuntimeError("fixture failure")
            assert manager.get_allowed_hosts("alice") == ["playground"]
            assert not operator_context_authorized(context)
            assert binding[2]()  # response delivery is outside operator_scope
            await manager.set_user("alice", [], "")
            assert not binding[2]()  # an explicit deny still revokes the grant
        finally:
            HostAccessManager.reset_request_host_scope(outer)
        assert not manager.is_host_allowed("alice", "localhost")


@pytest.mark.parametrize("revocation", ["policy", "credential", "inventory", "error"])
async def test_real_host_scope_revalidated_after_await(tmp_path, revocation):
    manager = HostAccessManager(str(tmp_path / "host-policy.json"),
                                available_hosts=["localhost", "playground"])
    await manager.set_default_policy(["playground"], "playground")
    async with harness(tmp_path, scope={"allowed_hosts": ["localhost"]}) as h:
        h.bot.host_access_manager = manager
        original = h.backend.operator_status

        async def revoked(**actor):
            assert manager.is_host_allowed("alice", "localhost")
            result = await original(**actor)
            if revocation == "policy":
                await manager.set_user("alice", [], "")
            elif revocation == "credential":
                await h.tokens.update_token("alice", allowed_hosts=["playground"])
            elif revocation == "inventory":
                manager.set_available_hosts(["playground"])
            else:
                def failed(*_):
                    raise RuntimeError("fixture policy lookup failure")
                manager.is_host_allowed = failed
            return result

        h.backend.operator_status = revoked
        response = await h.client.get("/api/computer", headers=h.headers)
        assert response.status == 404
        assert await response.json() == {"error": "Not found or no longer authorized"}
        assert manager.get_allowed_hosts("unrelated") == ["playground"]
