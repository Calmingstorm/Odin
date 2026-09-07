"""Browser identity reaches real foreground admission; raw API automation does not."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ApiTokenIdentity, Config
from src.health.server import SessionManager
from src.web.computer_binding import browser_binding
from tests.test_computer_lifecycle_r5 import owner


def request_for(bot, identity, sessions, sid, tokens):
    return SimpleNamespace(_api_identity=identity, _session_id=sid, _session_managed=True,
                           app={"session_manager": sessions, "token_manager": tokens}, query={})


def browser():
    identity = ApiTokenIdentity(token="test-credential", user_id="alice",
                                username="Alice", tier="admin")
    sessions = SessionManager(timeout_minutes=10)
    sid, _ = sessions.create(identity)
    current = [identity]
    tokens = SimpleNamespace(resolve=lambda credential: current[0]
                             if credential == identity.token else None)
    bot = SimpleNamespace(config=Config(discord={"token": "test"}))
    request = request_for(bot, identity, sessions, sid, tokens)
    return bot, request, sessions, current


@pytest.mark.parametrize("revocation", ["logout", "expiry", "delete", "tier", "scope"])
def test_bound_authentication_is_live_and_does_not_extend_expiry(revocation):
    bot, request, sessions, current = browser()
    stamp = sessions._sessions[request._session_id]
    binding = browser_binding(bot, request)
    assert binding is not None and binding[0] == request._session_id
    assert binding[1]() is True
    assert sessions._sessions[request._session_id] == stamp
    if revocation == "logout":
        sessions.destroy(request._session_id)
    elif revocation == "expiry":
        sessions._sessions[request._session_id] -= 601
    elif revocation == "delete":
        current[0] = None
    elif revocation == "tier":
        current[0] = current[0].model_copy(update={"tier": "user"})
    else:
        current[0] = current[0].model_copy(update={"allowed_hosts": ["elsewhere"]})
    assert binding[1]() is False


@pytest.mark.parametrize("surface", ["raw", "user", "query", "unbound"])
def test_no_desktop_authority_from_api_token_or_unbound_transport(surface):
    bot, request, _, _ = browser()
    if surface == "raw":
        request._session_managed = False
    elif surface == "user":
        request._api_identity.tier = "user"
    elif surface == "query":
        request.query = {"token": "not-accepted"}
    else:
        request._session_id = "caller-chosen"
    assert browser_binding(bot, request) is None


async def test_session_revocation_stops_owned_foreground_while_model_waits(tmp_path, monkeypatch):
    from src.computer.controller import ComputerController
    from src.computer.integration import ComputerIntegration
    from src.computer.store import ComputerStore
    from tests.test_computer_contract_r1 import Stub

    monkeypatch.setattr("src.computer.integration.require_vision", lambda _: None)
    backend = Stub()
    valid = [True]

    def factory(bot, *, settings):
        store = ComputerStore(tmp_path / "private" / "db", tmp_path / "private" / "evidence")
        integration = ComputerIntegration(bot, settings=settings, controller=ComputerController(
            store, lambda _: backend, lambda ctx: integration._authorize(ctx), enabled=True))
        integration._owns_store = True
        return integration

    _, manager = owner(tmp_path, factory=factory)
    await manager.set_enabled(True)
    message = SimpleNamespace(author=SimpleNamespace(id="alice"),
        channel=SimpleNamespace(id="room"),
        _odin_source="web", _computer_web_session_id="private-browser-session",
        _computer_web_authorized=lambda: valid[0])
    st = SimpleNamespace(user_id="alice", _req_id="turn", message=message,
                         policy=SimpleNamespace(trajectory_source="discord"))
    block = SimpleNamespace(name="computer_session", id="start", input={"operation": "start"})
    with manager.foreground(st, block):
        result = await manager._handle_computer_session({"operation": "start", "app": "xed"})
        assert result.ok
    context = manager._service._context(st)
    assert context.surface == "webui" and "private-browser-session" not in context.channel_id
    valid[0] = False
    assert not manager.authorize_context(context)
    async with asyncio.timeout(1):
        while manager._service.controller.store.find_session(context).state != "cancelled":
            await asyncio.sleep(0.01)
    assert backend.stopped
    assert manager._service.controller.store.find_session(context).state == "cancelled"
    await manager.close()


async def test_route_binding_is_server_owned_not_chat_session_input(monkeypatch):
    import src.web.api as api
    from src.web.api.sessions_chat import _pkg_process_web_chat

    bot, request, _, _ = browser()
    request.path = "/api/chat"
    request.headers = {}
    # Exercise route bridge with the unrelated generic output scope isolated.
    from contextlib import nullcontext
    monkeypatch.setattr("src.tools.output_authorization.web_output_scope", lambda *_: nullcontext())
    receive = AsyncMock(return_value={"response": "ordinary"})
    monkeypatch.setattr(api, "process_web_chat", receive)
    await _pkg_process_web_chat(bot, "hello", "caller-chat-continuity", _request=request)
    assert receive.await_args.kwargs["computer_binding"][0] == request._session_id
    assert receive.await_args.args[2] == "caller-chat-continuity"
    request.path = "/api/execute"
    await _pkg_process_web_chat(bot, "hello", "ephemeral", _request=request)
    assert "computer_binding" not in receive.await_args.kwargs
