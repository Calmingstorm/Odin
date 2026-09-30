"""Real WebUI skills run with the same task-local authority as web chat."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, ToolsConfig, WebConfig
from src.health.server import SessionManager, _make_auth_middleware
from src.permissions.host_access import HostAccessManager
from src.permissions.manager import PermissionManager
from src.tools.executor import ToolExecutor
from src.tools.output_authorization import web_output_scope
from src.tools.skill_manager import SkillManager
from src.web.api.skills_api import register_skills
from src.web.chat import process_web_chat


def setup_bot(tmp_path, identity):
    permissions = PermissionManager({}, "user", str(tmp_path / "permissions.json"))
    hosts = HostAccessManager(str(tmp_path / "hosts.json"), ["alpha", "beta"])
    config = ToolsConfig(
        hosts={name: {"address": "127.0.0.1", "ssh_user": "root"}
               for name in ["alpha", "beta"]},
        audit_log_path=str(tmp_path / "audit.jsonl"),
    )
    executor = ToolExecutor(config, permission_manager=permissions, host_access_manager=hosts)
    executor._exec_command = AsyncMock(return_value=(0, "transport output"))
    manager = SkillManager(str(tmp_path / "skills"), executor)
    bot = SimpleNamespace(skill_manager=manager, permissions=permissions,
                          host_access_manager=hosts, api_token_manager=None,
                          config=SimpleNamespace(web=WebConfig(api_tokens=[identity])))
    return bot, executor


def skill_code(body):
    return ("SKILL_DEFINITION = {'name': 'demo', 'description': 'test', "
            "'input_schema': {'type': 'object', 'properties': {}}}\n"
            f"async def execute(inp, context):\n    {body}\n")


def app_for(bot, *, session=False):
    sessions = SessionManager()
    credential = bot.config.web.api_tokens[0].token
    if session:
        credential, _ = sessions.create(bot.config.web.api_tokens[0])
        sessions.set_auth_source(credential, "static")
    app = web.Application(middlewares=[_make_auth_middleware(bot.config.web, sessions)])
    app["session_manager"] = sessions
    routes = web.RouteTableDef()
    register_skills(routes, bot)
    app.router.add_routes(routes)
    return app, credential


@pytest.mark.parametrize("session", [False, True])
@pytest.mark.parametrize("tier,scope,host,per_user,expected", [
    ("admin", None, "alpha", None, "transport output"),
    ("admin", ["alpha"], "beta", None, "Unknown or disallowed host: beta"),
    ("admin", ["alpha"], "beta", ["alpha", "beta"], "Unknown or disallowed host: beta"),
    ("admin", ["alpha", "beta"], "beta", ["alpha"], "Unknown or disallowed host: beta"),
    ("user", None, "alpha", None, "Permission denied"),
    ("guest", None, "alpha", None, "Permission denied"),
])
async def test_skill_test_matches_chat_host_and_tier(
    tmp_path, monkeypatch, session, tier, scope, host, per_user, expected,
):
    monkeypatch.chdir(tmp_path)
    identity = ApiTokenIdentity(token="fixture-credential", user_id="signed-user",
                                tier=tier, allowed_hosts=scope, default_host="alpha")
    bot, executor = setup_bot(tmp_path, identity)
    if per_user is not None:
        await bot.host_access_manager.set_user(identity.user_id, per_user, "alpha")
    bot.skill_manager.create_skill("demo", skill_code(
        f"return await context.run_on_host({host!r}, 'printf safe')"))

    # Exercise chat's actual context wrapper, replacing only the model boundary
    # with the exact selected-skill dispatch that chat would perform.
    async def chat_dispatch(*args):
        return await bot.skill_manager.execute("demo", {}, requester_id=args[3])

    monkeypatch.setattr("src.web.chat._do_process_web_chat", chat_dispatch)
    request = SimpleNamespace(headers={"Authorization": f"Bearer {identity.token}"},
                              path="/api/chat", app={})
    with web_output_scope(bot, request):
        chat_result = await process_web_chat(
            bot, "test", identity.user_id, user_id=identity.user_id,
            tier=identity.tier, token_allowed_hosts=identity.allowed_hosts,
            token_default_host=identity.default_host, persist_channel_lock=False,
        )
    executor._exec_command.reset_mock()
    app, credential = app_for(bot, session=session)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/skills/demo/test",
                                     headers={"Authorization": f"Bearer {credential}"})
        payload = await response.json()
        assert response.status == 200
    assert expected in payload["result"]
    assert payload["result"] == chat_result
    assert payload["is_error"] is False  # Historical result/error contract.
    if expected == "transport output":
        executor._exec_command.assert_awaited_once()
    else:
        executor._exec_command.assert_not_awaited()
    # Request-scoped grants do not leak into the next request or task.
    assert bot.permissions.get_tier(identity.user_id) == "user"
    assert bot.host_access_manager.get_allowed_hosts(identity.user_id) == (
        per_user if per_user is not None else ["alpha", "beta"])


@pytest.mark.parametrize("body,status,result,is_error", [
    ("return 'ok'", 200, "ok", False),
    ("raise RuntimeError('skill failed')", 200, "Skill error: skill failed", True),
])
async def test_skill_result_error_reporting_unchanged(
    tmp_path, monkeypatch, body, status, result, is_error,
):
    monkeypatch.chdir(tmp_path)
    identity = ApiTokenIdentity(token="fixture-credential", user_id="admin", tier="admin")
    bot, _ = setup_bot(tmp_path, identity)
    bot.skill_manager.create_skill("demo", skill_code(body))
    app, credential = app_for(bot)
    async with TestClient(TestServer(app)) as client:
        headers = {"Authorization": f"Bearer {credential}"}
        response = await client.post("/api/skills/demo/test", headers=headers)
        assert response.status == status
        assert await response.json() == {"result": result, "is_error": is_error}
        assert (await client.post("/api/skills/missing/test", headers=headers)).status == 404


async def test_skill_test_enforces_selected_skill_and_nested_tool_scope(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    identity = ApiTokenIdentity(token="fixture-credential", user_id="admin", tier="admin",
                                allowed_tools=["demo"])
    bot, executor = setup_bot(tmp_path, identity)
    bot.skill_manager.create_skill("demo", skill_code(
        "return await context.run_on_host('alpha', 'printf safe')"))
    app, credential = app_for(bot)
    async with TestClient(TestServer(app)) as client:
        headers = {"Authorization": f"Bearer {credential}"}
        response = await client.post("/api/skills/demo/test", headers=headers)
        assert "Permission denied" in (await response.json())["result"]
        identity.allowed_tools = ["run_command"]
        response = await client.post("/api/skills/demo/test", headers=headers)
        assert "Permission denied" in (await response.json())["result"]
    executor._exec_command.assert_not_awaited()


async def test_manager_failure_preserves_500_contract_and_cleans_identity_scope(
    tmp_path, monkeypatch,
):
    monkeypatch.chdir(tmp_path)
    identity = ApiTokenIdentity(token="fixture-credential", user_id="admin", tier="admin",
                                allowed_hosts=["alpha"], default_host="alpha")
    bot, _ = setup_bot(tmp_path, identity)
    bot.skill_manager.create_skill("demo", skill_code("return 'ok'"))

    def fail_config(*args):
        assert bot.permissions.get_tier("admin") == "admin"
        assert bot.host_access_manager.get_allowed_hosts("admin") == ["alpha"]
        raise RuntimeError("fixture manager failure")

    monkeypatch.setattr(bot.skill_manager, "get_skill_config", fail_config)
    app, credential = app_for(bot)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/skills/demo/test",
                                     headers={"Authorization": f"Bearer {credential}"})
        assert response.status == 500
        payload = await response.json()
        assert payload["is_error"] is True
        assert payload["result"]
    assert bot.permissions.get_tier("admin") == "user"
    assert bot.host_access_manager.get_allowed_hosts("admin") == ["alpha", "beta"]
