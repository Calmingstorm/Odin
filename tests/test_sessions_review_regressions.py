"""Review regressions exercise the real session manager and route handlers."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web

from src.config.schema import Config
from src.discord.channel_logger import ChannelLogger
from src.search.fts import FullTextIndex
from src.search.vectorstore import SessionVectorStore
from src.sessions.manager import Session, SessionManager
from src.web.api.sessions_chat import register_chat, register_sessions
from src.web.chat import process_web_chat


@pytest.fixture
def manager(tmp_path):
    return SessionManager(max_history=20, max_age_hours=24,
                          persist_dir=str(tmp_path / "sessions"),
                          token_budget=1, adaptive_compaction=False)


def handler(registrar, bot, name):
    routes = web.RouteTableDef()
    registrar(routes, bot)
    return next(route.handler for route in routes if route.handler.__name__ == name)


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", ["", " \n\t ", None])
async def test_empty_compaction_uses_deterministic_nonempty_fallback(manager, reply):
    manager.set_compaction_fn(AsyncMock(return_value=reply))
    for i in range(120):
        manager.add_message("channel", "user", f"source fact {i}", user_id="alice")
    history = await manager.get_task_history("channel", current_query="source fact")
    session = manager.get("channel")
    assert len(session.messages) == 20
    assert session.summary_segments[0]["fallback"] is True
    assert session.summary_segments[0]["summary"].strip()
    assert "source fact 0" in session.summary_segments[0]["summary"]
    assert any("compaction fallback" in str(message) for message in history)
    manager.save()
    saved = json.loads((manager.persist_dir / "channel.json").read_text())
    assert saved["summary_segments"][0]["summary"].strip()


@pytest.mark.asyncio
async def test_rolling_summary_presence_reaches_metrics_list_and_detail(manager):
    manager.set_compaction_fn(AsyncMock(return_value="Earlier facts and decisions"))
    for i in range(120):
        manager.add_message("alice", "user", f"source fact {i}")
    await manager.get_task_history("alice", current_query="facts")
    session = manager.get("alice")
    assert session.summary == "" and session.summary_segments
    assert session.has_summary
    assert manager.get_session_token_usage()["alice"]["has_summary"] is True
    bot = SimpleNamespace(sessions=manager, config=Config(discord={"token": "test"}),
                          api_token_manager=None)
    listed = await handler(register_sessions, bot, "list_sessions")(SimpleNamespace())
    assert json.loads(listed.text)[0]["has_summary"] is True
    detail = await handler(register_sessions, bot, "get_session")(
        SimpleNamespace(match_info={"channel_id": "alice"}))
    assert "Earlier facts" in json.loads(detail.text)["summary"]
    assert not Session("blank", summary=" \t", summary_segments=[{"summary": "\n"}]).has_summary
    assert Session("legacy", summary="legacy facts").has_summary


@pytest.mark.asyncio
async def test_non_admin_scoped_search_parity_and_forbidden_scope(manager):
    scoped = "web:alice:session:project"
    for cid in ["alice", scoped, "web:bob:session:project", "alice-not-owned"]:
        manager.add_message(cid, "user", "needle", user_id="alice")
    bot = SimpleNamespace(sessions=manager)
    search = handler(register_sessions, bot, "search_sessions")
    identity = SimpleNamespace(user_id="alice", tier="user")

    def request(query):
        return SimpleNamespace(query=query, _api_identity=identity)

    response = await search(request({"q": "needle", "channel_id": scoped}))
    assert response.status == 200
    assert [r["channel_id"] for r in json.loads(response.text)["results"]] == [scoped]
    response = await search(request({"q": "needle"}))
    assert {r["channel_id"] for r in json.loads(response.text)["results"]} == {"alice", scoped}
    for denied in ["web:bob:session:project", "alice-not-owned"]:
        assert (await search(request({"q": "needle", "channel_id": denied}))).status == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["success", "failure", "cancelled"])
async def test_execute_never_persists_sessions_or_reset_metadata(manager, outcome):
    bot = MagicMock()
    bot.sessions = manager
    bot.config = Config(discord={"token": "test"})
    bot.api_token_manager = None
    execute = handler(register_chat, bot, "execute")
    channels = []

    async def chat(bot, content, channel_id, **kwargs):
        channels.append(channel_id)
        assert kwargs["persist_channel_lock"] is False
        manager.add_message(channel_id, "user", content, user_id="alice")
        manager.add_message(channel_id, "assistant", "answer")
        # Both per-turn and concurrent background/shutdown saves skip it.
        await asyncio.to_thread(manager.save)
        await asyncio.to_thread(manager.save_all)
        manager._archive_session(channel_id)
        assert not list(manager.persist_dir.glob("*.json"))
        if outcome == "failure":
            raise RuntimeError("provider failed")
        if outcome == "cancelled":
            raise asyncio.CancelledError()
        return {"response": "answer", "tools_used": [], "is_error": False}

    request = SimpleNamespace(json=AsyncMock(return_value={"prompt": "question"}),
                              headers={}, path="/api/execute")
    with patch("src.web.api.process_web_chat", new=chat):
        for _ in range(3):
            if outcome == "success":
                assert (await execute(request)).status == 200
            else:
                error = RuntimeError if outcome == "failure" else asyncio.CancelledError
                with pytest.raises(error):
                    await execute(request)
    assert len(set(channels)) == 3
    assert manager.count() == 0
    assert manager._dirty == set()
    assert manager._reset_epochs == manager._mutation_revisions == manager._continuity_source == {}
    assert manager._ephemeral_channels == set()
    assert list(manager.persist_dir.iterdir()) == []
    manager.add_message("persistent", "user", "preserved")
    manager.save()
    manager.reset("persistent")
    assert "persistent" in manager._reset_epochs


@pytest.mark.asyncio
async def test_channel_fts_eligibility_before_limit(manager, tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    logger = ChannelLogger(str(tmp_path / "logs"))
    try:
        for i, (cid, ts) in enumerate([("other", 200), ("wanted", 50), ("wanted", 150),
                                       ("wanted", 250)]):
            fts.index_channel_messages([{"message_id": str(i), "content": "needle",
                                         "author": "author", "channel_id": cid, "ts": ts}])
        manager._reset_epochs["wanted"] = 175
        manager.set_channel_search(logger, fts)
        results = await manager.search_history("needle", limit=1, channel_id="wanted", after=100)
        assert len(results) == 1
        assert results[0]["timestamp"] == 250
        results = await manager.search_history("needle", limit=1, channel_id="wanted", before=0)
        assert results == []
    finally:
        fts._conn.close()


@pytest.mark.asyncio
async def test_hybrid_eligibility_before_limit_with_real_fts(manager, tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    vector = SessionVectorStore(str(tmp_path / "vectors.db"), fts_index=fts)
    try:
        for doc_id, cid, ts in [("other", "other", 250), ("purged", "wanted", 50),
                                ("expired", "wanted", 150), ("eligible", "wanted", 250)]:
            assert fts.index_session(doc_id, "needle", cid, ts)
        manager._vector_store = vector
        manager._reset_epochs["wanted"] = 100
        results = await manager.search_history("needle", limit=1, channel_id="wanted", after=200)
        assert len(results) == 1 and results[0]["doc_id"] == "eligible"
    finally:
        vector._conn.close()
        fts._conn.close()


@pytest.mark.asyncio
async def test_execute_real_chat_history_and_save_are_ephemeral(manager):
    bot = MagicMock()
    bot.sessions = manager
    bot.config = Config(discord={"token": "test"})
    bot.api_token_manager = None
    bot.llm_gateway.codex_client = object()
    bot.prompt_builder.build_full_prompt.return_value = "System prompt"
    bot.turn_recorder._new_context_trace.return_value = None
    bot.delivery.set_status = AsyncMock()
    channels = []

    async def run(message, history, **kwargs):
        cid = str(message.channel.id)
        channels.append(cid)
        assert manager.exists(cid)
        assert history[-1]["content"].endswith("question")
        await asyncio.to_thread(manager.save_all)
        assert not list(manager.persist_dir.glob("*.json"))
        return "answer", False, False, [], None

    bot.tool_loop.run = AsyncMock(side_effect=run)
    execute = handler(register_chat, bot, "execute")
    request = SimpleNamespace(json=AsyncMock(return_value={"prompt": "question"}),
                              headers={}, path="/api/execute")
    with patch("src.web.api.process_web_chat", new=process_web_chat):
        response = await execute(request)
    assert response.status == 200
    assert json.loads(response.text)["response"] == "answer"
    assert len(channels) == 1 and manager.count() == 0
    assert manager._reset_epochs == manager._mutation_revisions == {}
    assert list(manager.persist_dir.iterdir()) == []


@pytest.mark.asyncio
async def test_ranked_channel_duplicate_candidates_cannot_hide_next_match(manager, tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    logger = ChannelLogger(str(tmp_path / "logs"))
    try:
        manager.add_message("wanted", "user", "needle")
        timestamp = manager.get("wanted").messages[0].timestamp
        records = [{"message_id": str(i), "content": "needle", "author": "alice",
                    "channel_id": "wanted", "ts": timestamp} for i in range(6)]
        records.append({"message_id": "distinct", "content": "needle", "author": "alice",
                        "channel_id": "wanted", "ts": timestamp + 1})
        fts.index_channel_messages(records)
        manager.set_channel_search(logger, fts)
        results = await manager.search_history("needle", limit=2)
        assert len(results) == 2
        assert {r["timestamp"] for r in results} == {timestamp, timestamp + 1}
    finally:
        fts._conn.close()


def test_ephemeral_administrative_clear_remains_memory_only(manager):
    with manager.ephemeral("api-unique"):
        manager.add_message("api-unique", "user", "temporary")
        revision = manager.mutation_revision("api-unique")
        assert manager.clear_all() == 1
        assert manager.mutation_revision("api-unique") > revision
        manager.add_message("api-unique", "assistant", "finishing")
        manager.save_all()
        assert list(manager.persist_dir.iterdir()) == []
    assert manager._mutation_revisions == manager._reset_epochs == {}


def test_ephemeral_lifecycle_refuses_existing_persistent_session(manager):
    manager.add_message("persistent", "user", "preserve")
    manager.save()
    with pytest.raises(ValueError, match="new and unique"):
        with manager.ephemeral("persistent"):
            pass
    assert manager.get("persistent").messages[0].content == "preserve"
    assert (manager.persist_dir / "persistent.json").exists()


@pytest.mark.asyncio
async def test_author_filtered_fallback_duplicates_do_not_consume_limit(manager, tmp_path):
    log_dir = tmp_path / "logs"
    logger = ChannelLogger(str(log_dir))
    manager.add_message("wanted", "user", "needle", user_id="alice")
    timestamp = manager.get("wanted").messages[0].timestamp
    records = [{"content": "needle", "author_id": "alice", "channel_id": "wanted",
                "ts": timestamp} for _ in range(4)]
    records.append({"content": "needle distinct", "author_id": "alice",
                    "channel_id": "wanted", "ts": timestamp - 1})
    (log_dir / "wanted.jsonl").write_text("\n".join(json.dumps(r) for r in records) + "\n")
    manager.set_channel_search(logger)
    results = await manager.search_history("needle", limit=2, channel_id="wanted", user_id="alice")
    assert len(results) == 2
    assert {r["timestamp"] for r in results} == {timestamp, timestamp - 1}
