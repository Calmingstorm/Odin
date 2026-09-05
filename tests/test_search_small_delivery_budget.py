"""A smaller configured cap must retain ranking metadata for short matches."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.discord.native_tools.knowledge import KnowledgeTools
from src.tools.output_delivery import deliver, render_page
from src.tools.output_retention import OutputStore


async def test_short_matches_keep_original_format_and_page_at_lower_budget(tmp_path):
    records = [{"source": f"doc-{i}.md", "score": 1, "content": "text\n" + str(i) * 180}
               for i in range(8)]
    knowledge = SimpleNamespace(search_hybrid=AsyncMock(return_value=records))
    tools = KnowledgeTools(sessions=None, get_knowledge_store=lambda: knowledge,
                           embedder=object(), audit=None)
    result = await tools._handle_search_knowledge({"query": "q", "limit": 8})
    assert result.recovery_required is False
    assert deliver(result, budget=12000) == result
    store = OutputStore(tmp_path / "outputs.sqlite")
    page = json.loads(deliver(result, store=store, owner="owner", channel="channel",
                              tool="search_knowledge", budget=1600))
    total_shown = page["matches"]["showing"]
    assert total_shown > 0 and not page["matches"]["fragment"]
    pieces = [page["head"]]
    while page["cursor"]:
        snapshot, offset = store.read(page["cursor"], owner="owner", channel="channel",
                                      authorize=lambda *_: True)
        page = json.loads(render_page(snapshot, offset=offset, budget=1600))
        assert not page["matches"]["fragment"]
        total_shown += page["matches"]["showing"]
        pieces.append(page["text"])
    assert total_shown == 8
    assert "".join(pieces) == "\n\n".join(result.matches)
    knowledge.search_hybrid.assert_awaited_once()
