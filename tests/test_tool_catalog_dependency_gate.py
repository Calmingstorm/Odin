"""Environment-gated tool-catalog coverage independent of installed extras."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from src.config.schema import Config
from src.discord.tool_catalog import ToolCatalog


def test_missing_pdf_dependency_is_hidden_with_actionable_log():
    config = Config(discord={"token": "pin"}, permissions={"default_tier": "admin"})
    catalog = ToolCatalog(
        get_config=lambda: config,
        skill_manager=MagicMock(get_tool_definitions=lambda: []),
    )

    with (
        patch("src.discord.tool_catalog.importlib.util.find_spec", return_value=None),
        patch("src.discord.tool_catalog.log.info") as info,
    ):
        names = {tool["name"] for tool in catalog.merged_definitions()}

    assert "analyze_pdf" not in names
    assert any(
        "analyze_pdf hidden from the tool catalog" in str(call.args[0])
        for call in info.call_args_list
    )
