"""Live evidence authorization fences and task-local scope cleanup."""

import asyncio
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.tools import output_authorization as auth


def identity(**kwargs):
    fields = dict(user_id="reader", allowed_tools=None, allowed_hosts=None, tier="admin")
    return SimpleNamespace(**(fields | kwargs))


def fixture(*, dynamic=False, session=False):
    entry = identity()
    manager = Mock()
    manager.resolve.return_value = entry if dynamic else None
    manager.get.return_value = entry
    sessions = Mock()
    sessions.validate.return_value = True
    sessions.get_identity.return_value = entry
    web = SimpleNamespace(api_tokens=[], resolve_api_identity=Mock(return_value=entry))
    bot = SimpleNamespace(api_token_manager=manager, config=SimpleNamespace(web=web))
    request = SimpleNamespace(headers={"Authorization": "Bearer synthetic-credential"},
                              query={}, app={"session_manager": sessions},
                              _session_managed=session, _api_identity=entry, path="/api/execute")
    return bot, request, manager, sessions


@pytest.mark.asyncio
async def test_nested_capture_collects_child_hosts_without_leaking():
    target = SimpleNamespace(alias="fixture", runtime_key="one", address="example.test")
    lease = SimpleNamespace(target=target)
    before = auth.accessed_hosts.get()
    assert auth.record_host(None) is None
    assert auth.record_host(lease) is lease
    with auth.host_access_capture():
        collector = auth.accessed_hosts.get()

        async def child():
            with auth.host_access_capture():
                assert auth.accessed_hosts.get() is collector
                assert auth.record_host(lease) is lease

        await asyncio.gather(child(), child())
        assert len(collector) == 1
        first = next(iter(collector.values()))
        target.address = "changed.example.test"
        assert auth.host_binding(target)["identity"] != first["identity"]
    assert auth.accessed_hosts.get() is before


@pytest.mark.parametrize("dynamic", [False, True])
@pytest.mark.parametrize("query", [False, True])
def test_live_revocation_restores_scope_even_on_exception(dynamic, query):
    bot, request, manager, _ = fixture(dynamic=dynamic)
    if query:
        request.headers = {}
        request.query = {"token": "synthetic-credential"}
    before = (auth.request_scope_id.get(), auth.request_scope_authorizer.get(),
              auth.request_host_authorizer.get(), auth.request_delivery_channel.get())
    with pytest.raises(RuntimeError), auth.web_output_scope(bot, request):
        assert len(auth.request_scope_id.get()) == 64
        assert auth.request_delivery_channel.get() == "api-execute"
        assert auth.tool_scope_allows("read_file")
        assert auth.request_host_authorizer.get()("fixture")
        manager.resolve.return_value = None
        bot.config.web.resolve_api_identity.return_value = None
        assert not auth.tool_scope_allows("read_file")
        assert not auth.request_host_authorizer.get()("fixture")
        raise RuntimeError("cancelled")
    assert (auth.request_scope_id.get(), auth.request_scope_authorizer.get(),
            auth.request_host_authorizer.get(), auth.request_delivery_channel.get()) == before


@pytest.mark.parametrize("tier,scope", [("guest", None), ("user", None),
                                       ("user", ["read_file", "run_command"]),
                                       ("admin", ["read_file"])])
def test_tier_and_scope_intersection(tier, scope):
    from src.permissions.manager import USER_TIER_TOOLS

    bot, request, _, _ = fixture()
    bot.config.web.resolve_api_identity.return_value = identity(
        tier=tier, allowed_tools=scope, allowed_hosts=["fixture"])
    request.path = "/api/chat"
    with auth.web_output_scope(bot, request):
        expected = set() if tier == "guest" else (scope if tier == "admin" else (
            USER_TIER_TOOLS if scope is None else set(scope) & USER_TIER_TOOLS))
        assert auth.request_scope_authorizer.get()() == expected
        assert auth.request_host_authorizer.get()("fixture")
        assert not auth.request_host_authorizer.get()("other")
        assert auth.request_delivery_channel.get() == ""


def test_session_tracks_identity_and_fails_closed_after_removal():
    bot, request, manager, sessions = fixture(session=True)
    with auth.web_output_scope(bot, request):
        assert auth.tool_scope_allows("read_file")
        manager.get.return_value = identity(allowed_tools=["search_history"])
        assert not auth.tool_scope_allows("read_file")
        manager.get.return_value = None
        bot.config.web.api_tokens = [identity(allowed_tools=["read_file"])]
        assert auth.tool_scope_allows("read_file")
        bot.config.web.api_tokens = []
        assert not auth.tool_scope_allows("read_file")
        sessions.validate.return_value = False
        assert not auth.request_host_authorizer.get()("fixture")


@pytest.mark.parametrize("origin", [None, identity(user_id="api-admin")])
def test_admin_session_fallback_and_missing_manager(origin):
    bot, request, manager, _ = fixture(session=True)
    request._api_identity = origin
    manager.get.return_value = None
    with auth.web_output_scope(bot, request):
        assert auth.tool_scope_allows("read_file")
    request.app = {}
    with auth.web_output_scope(bot, request):
        assert not auth.tool_scope_allows("read_file")


def test_missing_bearer_and_dynamic_manager_removal():
    bot, request, _, _ = fixture(dynamic=True)
    with auth.web_output_scope(bot, request):
        bot.api_token_manager = None
        assert not auth.tool_scope_allows("read_file")
    request.headers = {}
    before = auth.request_scope_id.get()
    with auth.web_output_scope(bot, request):
        assert auth.request_scope_id.get() == before


@pytest.mark.parametrize("bearer", ["synthetic-credential", None, 42])
def test_websocket_live_policy_and_cleanup(bearer):
    manager = SimpleNamespace(_policy_authorized=Mock(return_value=True))
    ws = SimpleNamespace(_odin_identity=identity(allowed_tools=["read_file"],
                                                allowed_hosts=["fixture"]),
                         _odin_credential_policy=SimpleNamespace(bearer=bearer, source="test"))
    before = (auth.request_scope_id.get(), auth.request_scope_authorizer.get(),
              auth.request_host_authorizer.get())
    with auth.websocket_output_scope(manager, ws):
        assert len(auth.request_scope_id.get()) == 64
        assert auth.tool_scope_allows("read_file")
        assert not auth.tool_scope_allows("run_command")
        assert auth.request_host_authorizer.get()("fixture")
        assert not auth.request_host_authorizer.get()("other")
        manager._policy_authorized.return_value = False
        assert not auth.tool_scope_allows("read_file")
        assert not auth.request_host_authorizer.get()("fixture")
    assert (auth.request_scope_id.get(), auth.request_scope_authorizer.get(),
            auth.request_host_authorizer.get()) == before


def test_static_tool_scope_intersects_live_scope():
    scope_token = auth.request_tool_scope.set({"read_file"})
    resolver_token = auth.request_scope_authorizer.set(lambda: None)
    try:
        assert auth.tool_scope_allows("read_file")
        assert not auth.tool_scope_allows("run_command")
        auth.request_scope_authorizer.set(lambda: set())
        assert not auth.tool_scope_allows("read_file")
    finally:
        auth.request_scope_authorizer.reset(resolver_token)
        auth.request_tool_scope.reset(scope_token)
