"""Ranked metadata retains complete matches before legacy snippet formatting."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.background_task import _execute_tool
from src.discord.native_tools.knowledge import KnowledgeTools
from src.tools.output_delivery import RankedOutput


@pytest.mark.parametrize("kind", ["history", "knowledge", "background"])
async def test_ranked_snapshot_preserves_original_order_and_oversized_match(kind):
    records = [
        {"id": "second", "source": "second.md", "score": 0.9, "timestamp": 1700000000,
         "type": "user", "content": "second ranked\n" + "漢é" * 10000},
        {"id": "first", "source": "first.md", "score": 0.8, "timestamp": 1700000001,
         "type": "assistant", "content": "first by name, last by rank"},
    ]
    store = SimpleNamespace(search_hybrid=AsyncMock(return_value=records))
    sessions = SimpleNamespace(search_history=AsyncMock(return_value=records))
    tools = KnowledgeTools(
        sessions=sessions, get_knowledge_store=lambda: store, embedder=object(), audit=None
    )
    if kind == "background":
        output = await _execute_tool(
            "search_knowledge", {"query": "rank"}, MagicMock(), MagicMock(),
            store, object(), "requester",
        )
    else:
        output = await getattr(tools, f"_handle_search_{kind}")({"query": "rank"})
    assert isinstance(output, RankedOutput)
    assert len(output) < 2000  # old short snippets remain str-compatible
    assert len(output.matches) == 2
    assert records[0]["content"] in output.matches[0]
    assert records[1]["content"] in output.matches[1]
    snapshot = output.matches
    records.reverse()
    records[0]["content"] = "changed after the query"
    assert output.matches == snapshot
    assert "changed after the query" not in "".join(output.matches)
    search = sessions.search_history if kind == "history" else store.search_hybrid
    assert search.await_count == 1


async def test_short_knowledge_result_format_is_unchanged():
    store = SimpleNamespace(search_hybrid=AsyncMock(return_value=[
        {"source": "doc.md", "score": 0.5, "content": "short\ntext"},
    ]))
    tools = KnowledgeTools(
        sessions=None, get_knowledge_store=lambda: store, embedder=object(), audit=None
    )
    output = await tools._handle_search_knowledge({"query": "q"})
    assert output == "**Found 1 result(s) for 'q':**\n\n**[doc.md]** (score: 0.5)\nshort text"
    assert output.matches == ("**[doc.md]** (score: 0.5)\nshort\ntext",)
