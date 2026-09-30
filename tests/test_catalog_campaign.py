from unittest.mock import MagicMock

import pytest

from src.config.schema import Config, EmailConfig
from src.discord.tool_catalog import ToolCatalog
from src.tools.builtin_policy import BUILTIN_TOOL_NAMES, BuiltinToolPolicy


@pytest.mark.parametrize("enabled", [False, True])
def test_browser_and_knowledge_backend_visibility(enabled):
    config = Config(discord={"token": ""}, browser={"enabled": enabled},
                    search={"enabled": enabled})
    names = {d["name"] for d in ToolCatalog(get_config=lambda: config,
             skill_manager=MagicMock(get_tool_definitions=lambda: [])).merged_definitions()}
    for name in ("browser_screenshot", "browser_read_page", "browser_read_table", "browser_click",
                 "browser_fill", "browser_evaluate", "search_knowledge", "ingest_document",
                 "bulk_ingest_knowledge", "list_knowledge", "delete_knowledge"):
        assert (name in names) is enabled


def test_email_visibility_tracks_effective_startup_backend_after_desired_save():
    desired = Config(discord={"token": ""}, email={"enabled": True})
    effective = EmailConfig(enabled=False)
    catalog = ToolCatalog(get_config=lambda: desired,
                          get_email_config=lambda: effective,
                          skill_manager=MagicMock(get_tool_definitions=lambda: []))
    assert "email_search" in catalog.backend_hidden_names()
    assert "email_search" not in {d["name"] for d in catalog.merged_definitions()}
    # Conversely a desired disable does not claim a still-live backend vanished.
    effective.enabled = True
    desired.email.enabled = False
    catalog.invalidate()
    assert "email_search" not in catalog.backend_hidden_names()
    assert "email_search" in {d["name"] for d in catalog.merged_definitions()}


@pytest.mark.parametrize("name", ["computer_session", "computer_observe", "computer_act"])
def test_computer_disable_universe_matches_catalog_and_dispatch(name):
    config = Config(discord={"token": ""}, computer={"enabled": True},
                    tools={"disabled_tools": [name]})
    assert name in BUILTIN_TOOL_NAMES
    assert BuiltinToolPolicy(lambda: config).is_disabled(name)
    catalog = ToolCatalog(get_config=lambda: config,
                          skill_manager=MagicMock(get_tool_definitions=lambda: []))
    assert name not in {d["name"] for d in catalog.merged_definitions()}
