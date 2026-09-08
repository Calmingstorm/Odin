"""Default-off catalogue and privacy contracts use no GUI or running service."""

from types import SimpleNamespace

import pytest

from src.config.schema import ComputerUseConfig, Config
from src.discord.tool_catalog import ToolCatalog
from src.discord.tool_loop_helpers import _scrub_tool_input_for_storage
from src.tools.defs.computer import COMPUTER_TOOL_NAMES, computer_definitions


def catalog(config, skills=(), mcp=()):
    return ToolCatalog(
        get_config=lambda: config,
        skill_manager=SimpleNamespace(get_tool_definitions=lambda: list(skills)),
        get_mcp_definitions=lambda: list(mcp),
    )


def test_default_off_and_explicit_enable_preserve_existing_definitions():
    config = Config(discord={"token": "fixture"})
    before = catalog(config).merged_definitions()
    assert not COMPUTER_TOOL_NAMES & {item["name"] for item in before}
    config.computer.enabled = True
    after = catalog(config).merged_definitions()
    assert [item for item in after if item["name"] not in COMPUTER_TOOL_NAMES] == before
    assert [item["name"] for item in after[-3:]] == [
        "computer_session", "computer_observe", "computer_act",
    ]


@pytest.mark.parametrize("kind", ["skills", "mcp"])
def test_enabling_cannot_silently_shadow_existing_tool(kind):
    config = Config(discord={"token": "fixture"}, computer={"enabled": True})
    with pytest.raises(ValueError, match="collision"):
        catalog(config, **{kind: [{"name": "computer_act"}]}).merged_definitions()


def test_definitions_are_independent_and_absent_from_static_catalogue():
    from src.tools.registry import get_tool_definitions

    assert not COMPUTER_TOOL_NAMES & {item["name"] for item in get_tool_definitions()}
    first = computer_definitions()
    first[0]["name"] = "changed"
    assert computer_definitions()[0]["name"] == "computer_session"


def test_disabled_same_name_skill_is_not_changed():
    config = Config(discord={"token": "fixture"})
    skill = {"name": "computer_act", "description": "Existing custom tool"}
    assert skill in catalog(config, skills=[skill]).merged_definitions()


def test_no_model_configurable_environment_or_resources():
    with pytest.raises(ValueError):
        ComputerUseConfig(display=":fake")
    with pytest.raises(ValueError):
        ComputerUseConfig(storage_dir=" \n ")
    for tool in computer_definitions():
        assert not {"host", "display", "executable", "command", "sudo"} & set(
            tool["input_schema"]["properties"]
        )


def test_desktop_input_storage_never_keeps_typed_or_expected_text():
    source = {"text": "private sentence", "expect": {"text_equals": "private sentence"},
              "action_id": "one", "points": [[10, 20]]}
    cleaned = _scrub_tool_input_for_storage("computer_act", source)
    assert "private sentence" not in str(cleaned)
    assert cleaned["action_id"] == "one"
    assert source["text"] == "private sentence"
    assert _scrub_tool_input_for_storage("ordinary", source) is source
