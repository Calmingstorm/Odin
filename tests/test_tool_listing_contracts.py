"""Model-facing listings exercise real managers, modules and native renderers."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.agents.manager import AgentInfo, AgentManager
from src.config.schema import Config
from src.discord.native_tools.agents_tasks import AgentTaskTools
from src.discord.native_tools.skills_tools import SkillTools
from src.tools.registry import TOOL_MAP
from src.tools.skill_manager import SkillManager


def _module(name):
    return (
        f'SKILL_DEFINITION = {{"name": "{name}", "description": "demo", '
        '"input_schema": {"type": "object", "properties": {}}}\n'
        'async def execute(inp, context):\n    return "ok"\n'
    )


async def _list_skills(manager):
    handler = object.__new__(SkillTools)
    handler.skill_manager = manager
    output, _ = await handler.dispatch(
        "list_skills", {}, message=SimpleNamespace(), user_id="tester",
        skill_file_delivery="send", effects=SimpleNamespace(),
    )
    return output


async def test_skill_listing_loaded_disabled_and_load_error(tmp_path):
    (tmp_path / "enabled.py").write_text(_module("enabled"))
    (tmp_path / "disabled.py").write_text(_module("disabled"))
    (tmp_path / "broken.py").write_text("this is not valid Python syntax\n")
    manager = SkillManager(str(tmp_path), MagicMock())
    manager.disable_skill("disabled")
    manager = SkillManager(str(tmp_path), MagicMock())
    statuses = {s["name"]: s["status"] for s in manager.list_skills()}
    assert statuses == {"enabled": "loaded", "disabled": "disabled", "broken": "error"}
    output = await _list_skills(manager)
    assert "**enabled** [enabled]" in output
    assert "**disabled** [disabled]" in output
    assert "**broken** [load error]" in output
    assert not manager.has_skill("broken")
    assert {d["name"] for d in manager.get_tool_definitions()} == {"enabled"}


async def test_rejected_create_or_edit_does_not_add_failed_listing(tmp_path):
    manager = SkillManager(str(tmp_path), MagicMock())
    manager.create_skill("good", _module("good"))
    manager.create_skill("bad", "invalid syntax here")
    manager.edit_skill("good", "invalid syntax here")
    assert [s["name"] for s in manager.list_skills()] == ["good"]
    assert "[load error]" not in await _list_skills(manager)


@pytest.mark.parametrize("failure", ["read", "spec", "execute"])
async def test_module_load_failures_are_visible_without_exposing_source(
    tmp_path, monkeypatch, failure
):
    from pathlib import Path

    import src.tools.skill_manager as skills_module

    path = tmp_path / "broken.py"
    path.write_text(_module("broken").split("async def", 1)[0])
    if failure == "read":
        original = Path.read_text

        def read_text(file, *args, **kwargs):
            if file == path:
                raise PermissionError("sensitive internal detail")
            return original(file, *args, **kwargs)

        monkeypatch.setattr(Path, "read_text", read_text)
    elif failure == "spec":
        monkeypatch.setattr(skills_module.importlib.util, "spec_from_file_location",
                            lambda *args: None)
    manager = SkillManager(str(tmp_path), MagicMock())
    output = await _list_skills(manager)
    assert "**broken** [load error]" in output
    assert "sensitive internal detail" not in output
    assert not manager.has_skill("broken")


async def test_documented_create_skill_example_is_executable(tmp_path):
    description = TOOL_MAP["create_skill"]["description"]
    example = description.split("Minimal module example:\n", 1)[1].split("\n\n", 1)[0]
    manager = SkillManager(str(tmp_path), MagicMock())
    assert "created and loaded successfully" in manager.create_skill("hello", example)
    assert await manager.execute("hello", {}) == "Hello"


@pytest.mark.parametrize("executed", [False, True])
def test_agent_listing_models_and_effort_from_real_records(executed):
    manager = AgentManager()
    for name, effort in [("gpt-6.1-sol", "high"), ("gpt-6-luna", "medium")]:
        info = AgentInfo(name, name, "test", "test-channel", "tester", "tester",
                         model_override=name, reasoning_effort_override=effort)
        if executed:
            info.has_executed = True
            info.last_provider = "codex"
            info.last_model = name
            info.last_reasoning_effort = effort
        manager._agents[name] = info
    handler = object.__new__(AgentTaskTools)
    handler._agent_manager = manager
    handler._get_config = lambda: Config(discord={"token": "test-token"})
    output = handler._handle_list_agents(
        SimpleNamespace(channel=SimpleNamespace(id="test-channel"))
    )
    assert "model=gpt-6.1-sol" in output and "effort=high" in output
    assert "model=gpt-6-luna" in output and "effort=medium" in output
    assert ("last_execution" if executed else "spawn_override_pending") in output


def test_executed_agent_missing_provenance_never_falls_back_to_requested():
    manager = AgentManager()
    info = AgentInfo("unknown", "unknown", "test", "channel", "tester", "tester",
                     model_override="gpt-6.1-sol", reasoning_effort_override="high",
                     has_executed=True)
    manager._agents[info.id] = info
    handler = object.__new__(AgentTaskTools)
    handler._agent_manager = manager
    handler._get_config = lambda: Config(discord={"token": "test-token"})
    output = handler._handle_list_agents(SimpleNamespace(channel=SimpleNamespace(id="channel")))
    assert "model=unknown [last_execution]" in output
    assert "effort=unknown [last_execution]" in output
    assert "gpt-6.1-sol" not in output
