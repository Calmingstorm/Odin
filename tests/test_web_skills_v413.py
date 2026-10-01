"""Skills campaign: real modules, persisted flags, routes and native dispatch."""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.discord.native_tools.skills_tools import SkillTools
from src.discord.prompts import PromptBuilder
from src.discord.tool_catalog import ToolCatalog
from src.tools.skill_manager import SkillManager
from src.web.api.skills_api import register_skills


def code(name="demo", result="ok"):
    return (f'SKILL_DEFINITION = {{"name": "{name}", "description": "demo", '
            '"input_schema": {"type": "object", "properties": {}}}\n'
            f'async def execute(inp, context):\n    return {result!r}\n')


def bot_for(tmp_path):
    manager = SkillManager(str(tmp_path / "skills"), MagicMock())
    config = Config(discord={"token": "fixture-only"})
    prompt = PromptBuilder(get_config=lambda: config, context_loader=None,
                           reflector=None, skill_manager=manager, tool_executor=None,
                           channel_state=None, get_codex_client=lambda: None)
    return SimpleNamespace(skill_manager=manager, prompt_builder=prompt,
                           tool_catalog=ToolCatalog(get_config=lambda: config,
                                                    skill_manager=manager),
                           audit=SimpleNamespace(count_by_tool=AsyncMock(return_value={})))


def app_for(bot):
    routes = web.RouteTableDef()
    register_skills(routes, bot)
    app = web.Application()
    app.add_routes(routes)
    return app


async def test_disabled_edit_test_and_reload_keep_prompt_catalog_exclusion(tmp_path):
    bot = bot_for(tmp_path)
    manager = bot.skill_manager
    manager.create_skill("demo", code())
    manager.create_skill("active", code("active"))
    (manager.skills_dir / "broken.py").write_text("invalid Python syntax here")
    # Reload the real persisted module format, including failed entries.
    manager._load_all()
    async with TestClient(TestServer(app_for(bot))) as client:
        assert "demo" in bot.prompt_builder.cached_skills_list_text()
        assert "demo" in {d["name"] for d in bot.tool_catalog.merged_definitions()}
        assert (await client.post("/api/skills/demo/disable")).status == 200
        saved = await client.put("/api/skills/demo", json={"code": code(result="updated")})
        assert saved.status == 200
        body = await (await client.get("/api/skills")).json()
        assert {s["name"]: s["status"] for s in body} == {
            "active": "loaded", "demo": "disabled", "broken": "error"}
        source = next(s for s in body if s["name"] == "demo")["code"]
        assert source == code(result="updated").strip()
        execute = AsyncMock(return_value="must not run")
        manager._skills["demo"].execute_fn = execute
        tested = await (await client.post("/api/skills/demo/test")).json()
        assert tested["is_error"] and "disabled" in tested["result"]
        execute.assert_not_awaited()
        assert bot.prompt_builder.cached_skills_list_text() == "- `active`: demo"
        names = {d["name"] for d in bot.tool_catalog.merged_definitions()}
        assert "demo" not in names and "broken" not in names
        reloaded = SkillManager(str(manager.skills_dir), MagicMock())
        assert not reloaded.is_enabled("demo")
        assert reloaded.get_tool_definitions() == manager.get_tool_definitions()
        assert (await client.post("/api/skills/demo/enable")).status == 200
        assert "demo" in bot.prompt_builder.cached_skills_list_text()
        assert "demo" in {d["name"] for d in bot.tool_catalog.merged_definitions()}


async def test_failed_delete_is_web_only_and_clears_disk_error_restart(tmp_path):
    bot = bot_for(tmp_path)
    manager = bot.skill_manager
    path = manager.skills_dir / "broken.py"
    path.write_text("invalid Python syntax here")
    manager._load_all()
    handler = SkillTools(skill_manager=manager, tool_catalog=bot.tool_catalog,
                         prompt_builder=bot.prompt_builder, channel_state=None)
    result, _ = await handler.dispatch(
        "delete_skill", {"name": "broken"}, message=SimpleNamespace(), user_id="fixture",
        skill_file_delivery="send", effects=SimpleNamespace(rebuild_system_prompt=False))
    assert "not found" in result and path.exists()
    assert "broken.py" in manager.definition_errors
    async with TestClient(TestServer(app_for(bot))) as client:
        assert (await client.delete("/api/skills/broken")).status == 200
        assert not path.exists() and "broken.py" not in manager.definition_errors
        assert await (await client.get("/api/skills")).json() == []
        assert (await client.delete("/api/skills/broken")).status == 404
    assert SkillManager(str(manager.skills_dir), MagicMock()).list_skills() == []


async def test_failed_delete_unlink_failure_preserves_card(tmp_path, monkeypatch):
    bot = bot_for(tmp_path)
    path = bot.skill_manager.skills_dir / "broken.py"
    path.write_text("invalid Python syntax here")
    bot.skill_manager._load_all()
    original = Path.unlink

    def denied(candidate, *args, **kwargs):
        if candidate == path:
            raise PermissionError("fixture refuses deletion")
        return original(candidate, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", denied)
    async with TestClient(TestServer(app_for(bot))) as client:
        assert (await client.delete("/api/skills/broken")).status == 500
        assert path.exists() and "broken.py" in bot.skill_manager.definition_errors
        assert (await (await client.get("/api/skills")).json())[0]["status"] == "error"


@pytest.mark.parametrize("enabled", [True, False])
async def test_api_activation_storage_failure_has_no_published_change(
    tmp_path, monkeypatch, enabled
):
    bot = bot_for(tmp_path)
    manager = bot.skill_manager
    manager.create_skill("demo", code())
    if not enabled:
        manager.disable_skill("demo")
    prompt_before = bot.prompt_builder.cached_skills_list_text()
    catalog_before = bot.tool_catalog.merged_definitions()

    def denied(*args):
        raise PermissionError("fixture refuses ledger write")

    monkeypatch.setattr("src.tools.skill_manager.os.replace", denied)
    route = "disable" if enabled else "enable"
    async with TestClient(TestServer(app_for(bot))) as client:
        assert (await client.post(f"/api/skills/demo/{route}")).status == 500
    assert manager.is_enabled("demo") == enabled
    assert SkillManager(str(manager.skills_dir), MagicMock()).is_enabled("demo") == enabled
    assert bot.prompt_builder.cached_skills_list_text() == prompt_before
    assert bot.tool_catalog.merged_definitions() == catalog_before


def test_failed_delete_never_removes_loaded_alias_or_user_path(tmp_path):
    manager = bot_for(tmp_path).skill_manager
    artifact = manager.skills_dir / "custom_filename.py"
    artifact.write_text(code())
    manager._load_all()
    # A failed edit may leave a diagnostic on the filename of a loaded module.
    manager.definition_errors[artifact.name] = "rejected edit"
    assert "not found" in manager.delete_failed_skill("custom_filename")
    assert artifact.exists() and manager.has_skill("demo")
    assert "not found" in manager.delete_failed_skill("../custom_filename")
    assert "not found" in manager.delete_failed_skill("demo")


def test_failed_delete_clears_stale_record_when_file_already_removed(tmp_path):
    manager = bot_for(tmp_path).skill_manager
    path = manager.skills_dir / "broken.py"
    path.write_text("invalid Python syntax here")
    manager._load_all()
    path.unlink()
    assert "deleted" in manager.delete_failed_skill("broken")
    assert "broken.py" not in manager.definition_errors
