"""Composition-root contract for generic scheduled-report services."""
from __future__ import annotations

import ast
from pathlib import Path

from src.discord.scheduled_report import PAGINATED_EMBED_V1

ROOT = Path(__file__).resolve().parents[1]


def test_registry_and_pagination_service_are_bot_components():
    source = (ROOT / "src/discord/wiring.py").read_text()
    tree = ast.parse(source)
    component_fields = set()
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "BotComponents":
            component_fields = {
                item.target.id
                for item in node.body
                if isinstance(item, ast.AnnAssign)
                and isinstance(item.target, ast.Name)
            }
    assert {"scheduled_report_renderers", "scheduled_reports"} <= component_fields
    assert "register(PaginatedEmbedV1Renderer())" in source
    assert PAGINATED_EMBED_V1 == "paginated_embed_v1"


def test_pagination_is_injected_directly_into_reaction_cog():
    source = (ROOT / "src/discord/cogs/reaction_triggers.py").read_text()
    assert "components = cast(Any, bot).components" in source
    assert "pagination=components.scheduled_reports" in source
    assert "bot.__dict__" not in source
    assert "getattr(bot" not in source


def test_state_path_comes_from_configured_scheduler_persistence_root():
    source = (ROOT / "src/discord/wiring.py").read_text()
    assert "services.scheduler.data_path.parent.resolve()" in source
    assert 'data_path="./data/scheduled_reports.json"' not in source
