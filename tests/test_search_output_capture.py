"""Ranked metadata retains complete matches before legacy snippet formatting."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.background_task import _execute_tool_captured
from src.discord.native_tools.knowledge import KnowledgeTools
from src.tools.output_delivery import RankedOutput, deliver, render_page
from src.tools.output_retention import OutputStore
from tests.test_source_output_delivery import _reconstruct


@pytest.mark.parametrize("kind", ["history", "knowledge", "background"])
async def test_ranked_snapshot_preserves_original_order_and_oversized_match(kind, tmp_path):
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
        output = await _execute_tool_captured(
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
    retained = OutputStore(tmp_path / "ranked.sqlite")
    initial = deliver(output, store=retained, owner="reader", channel="channel",
                      tool="search_history" if kind == "history" else "search_knowledge")
    assert _reconstruct(initial, OutputStore(retained.path)) == "\n\n".join(snapshot)
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
    assert isinstance(output, str) and not output.recovery_required
    assert deliver(output) == output


async def test_short_history_and_background_formats_are_unchanged():
    from datetime import datetime

    timestamp = 1700000000
    sessions = SimpleNamespace(search_history=AsyncMock(return_value=[
        {"timestamp": timestamp, "type": "user", "content": "short\ntext"},
    ]))
    tools = KnowledgeTools(
        sessions=sessions, get_knowledge_store=lambda: None, embedder=object(), audit=None
    )
    output = await tools._handle_search_history({"query": "q"})
    date = datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M")
    assert output == f"**Found 1 result(s) for 'q':**\n[{date}] (user): short text"
    assert isinstance(output, str) and not output.recovery_required
    assert deliver(output) == output
    store = SimpleNamespace(search_hybrid=AsyncMock(return_value=[
        {"source": "doc.md", "score": 0.5, "content": "short\ntext"},
    ]))
    background = await _execute_tool_captured(
        "search_knowledge", {"query": "q"}, MagicMock(), MagicMock(),
        store, object(), "requester",
    )
    assert background == "[doc.md] (score: 0.5): short\ntext"
    assert isinstance(background, str) and not background.recovery_required
    assert deliver(background) == background


def test_search_whole_match_counts_and_oversized_continuation(tmp_path):
    matches = ("first " + "a" * 1800, "second " + "b" * 1800,
               "oversized " + "漢é" * 10000, "last " + "z" * 800)
    output = RankedOutput("short legacy snippets", matches=matches)
    store = OutputStore(tmp_path / "matches.sqlite")
    initial = deliver(output, store=store, owner="reader", channel="channel",
                      tool="search_knowledge", budget=4000)
    page = json.loads(initial)
    assert page["matches"]["showing"] == 1
    assert page["matches"]["deferred"] == 3
    assert page["matches"]["total_returned"] == 4
    assert page["head"] == matches[0] + "\n\n"
    fragments = []
    complete = page["matches"]["showing"]
    while page["cursor"]:
        snapshot, offset = store.read(page["cursor"], owner="reader", channel="channel",
                                      authorize=lambda tool, hosts: True)
        page = json.loads(render_page(snapshot, offset=offset, budget=4000))
        assert page["end"] > offset
        complete += page["matches"]["showing"]
        assert page["matches"]["deferred"] == 4 - complete
        fragments.append(page["matches"]["fragment"])
    assert complete == 4
    assert any(fragments)
    assert page["matches"]["deferred"] == 0
    assert _reconstruct(initial, store) == "\n\n".join(matches)
