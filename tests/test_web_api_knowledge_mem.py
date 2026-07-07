"""Route coverage for web/api/knowledge_mem.py (RFC-006 P4-continuation, CONT-1).

Per Odin's advisory: drive the real route handlers against real store / memory /
reflector interfaces backed by temp storage. Embeddings are the only external
boundary faked (``bot.embedder = None`` → the store runs FTS-only), so the
knowledge routes exercise real ingest / version / dedup / merge machinery.
"""
from __future__ import annotations

import json

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.knowledge.store import KnowledgeStore
from src.learning.reflector import ConversationReflector
from src.web.api.knowledge_mem import (
    register_knowledge,
    register_learned_context,
    register_memory_notes,
)


def _app(*registrars, bot):
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


async def _ingest(client, source, content):
    return await client.post("/api/knowledge", json={"source": source, "content": content})


# --------------------------------------------------------------------------- #
# Knowledge — real store, temp db, FTS-only (embedder=None)
# --------------------------------------------------------------------------- #
@pytest.fixture
def store(tmp_path):
    s = KnowledgeStore(tmp_path / "kb.db")
    yield s
    s.close()


@pytest.fixture
def kbot(store):
    bot = type("B", (), {})()
    bot.knowledge = store
    bot.embedder = None
    return bot


class TestKnowledgeUnavailable:
    """Every knowledge route short-circuits to 503 when the store is down."""

    async def test_all_routes_503(self):
        bot = type("B", (), {})()
        bot.knowledge = None
        async with TestClient(TestServer(_app(register_knowledge, bot=bot))) as c:
            assert (await c.get("/api/knowledge")).status == 503
            assert (await _ingest(c, "s", "c")).status == 503
            assert (await c.delete("/api/knowledge/s")).status == 503
            assert (await c.post("/api/knowledge/s/reingest")).status == 503
            assert (await c.get("/api/knowledge/search?q=x")).status == 503
            assert (await c.get("/api/knowledge/s/chunks")).status == 503
            assert (await c.get("/api/knowledge/duplicates")).status == 503
            assert (await c.post("/api/knowledge/merge", json={})).status == 503
            assert (await c.get("/api/knowledge/s/versions")).status == 503
            assert (await c.get("/api/knowledge/s/versions/1")).status == 503
            assert (await c.post("/api/knowledge/s/versions/1/restore")).status == 503
            assert (await c.get("/api/knowledge/s/versions/1/diff/2")).status == 503
            assert (await c.post("/api/knowledge/import", json={"items": []})).status == 503


class TestKnowledgeCrud:
    async def test_ingest_list_delete_roundtrip(self, kbot):
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            r = await _ingest(c, "doc.md", "hello world alpha")
            assert r.status == 201 and (await r.json())["chunks"] >= 1

            sources = await (await c.get("/api/knowledge")).json()
            assert any(s["source"] == "doc.md" for s in sources)

            r = await c.delete("/api/knowledge/doc.md")
            assert r.status == 200 and (await r.json())["chunks_removed"] >= 1
            assert (await c.delete("/api/knowledge/doc.md")).status == 404

    async def test_ingest_validation(self, kbot):
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            assert (await c.post("/api/knowledge", json={})).status == 400  # no source/content
            # an over-long source name fails validation
            assert (await _ingest(c, "x" * 5000, "c")).status == 400

    async def test_reingest(self, kbot):
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            await _ingest(c, "d.md", "some content here")
            r = await c.post("/api/knowledge/d.md/reingest")
            assert r.status == 200 and (await r.json())["source"] == "d.md"
            assert (await c.post("/api/knowledge/ghost.md/reingest")).status == 404

    async def test_search(self, kbot):
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            await _ingest(c, "d.md", "pangolins are scaly mammals")
            r = await c.get("/api/knowledge/search?q=pangolins")
            assert r.status == 200 and isinstance(await r.json(), list)
            assert (await c.get("/api/knowledge/search?q=")).status == 400
            # a non-integer limit gracefully falls back to the default (no 400)
            assert (await c.get("/api/knowledge/search?q=x&limit=notanint")).status == 200

    async def test_chunks(self, kbot):
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            await _ingest(c, "d.md", "chunk body text")
            r = await c.get("/api/knowledge/d.md/chunks")
            assert r.status == 200 and len(await r.json()) >= 1
            assert (await c.get("/api/knowledge/ghost.md/chunks")).status == 404


class TestKnowledgeDedupMerge:
    async def test_duplicates_and_merge(self, kbot):
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            # Distinct content so both sources actually persist (identical content
            # would be dedup-skipped on the second ingest and never stored).
            await _ingest(c, "a.md", "alpha body content one")
            await _ingest(c, "b.md", "beta body content two")

            dups = await (await c.get("/api/knowledge/duplicates")).json()
            assert "exact" in dups and "near" in dups
            # threshold parse fallback (bad value ignored, no crash)
            assert (await c.get("/api/knowledge/duplicates?threshold=oops")).status == 200

            r = await c.post("/api/knowledge/merge",
                             json={"keep_source": "a.md", "remove_source": "b.md"})
            assert r.status == 200 and (await r.json())["kept"] == "a.md"

    async def test_merge_validation(self, kbot):
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            assert (await c.post("/api/knowledge/merge", data="not json")).status == 400
            assert (await c.post("/api/knowledge/merge", json={"keep_source": "a"})).status == 400
            r = await c.post("/api/knowledge/merge",
                             json={"keep_source": "ghost", "remove_source": "also"})
            assert r.status == 404


class TestKnowledgeVersions:
    async def test_versions_lifecycle(self, kbot):
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            await _ingest(c, "v.md", "first version body")
            await _ingest(c, "v.md", "second version body changed")

            versions = await (await c.get("/api/knowledge/v.md/versions")).json()
            assert len(versions) >= 2

            r = await c.get("/api/knowledge/v.md/versions/1")
            assert r.status == 200 and (await r.json())["version"] == 1
            assert (await c.get("/api/knowledge/v.md/versions/999")).status == 404

            r = await c.post("/api/knowledge/v.md/versions/1/restore")
            assert r.status == 200 and (await r.json())["status"] == "restored"
            assert (await c.post("/api/knowledge/v.md/versions/999/restore")).status == 404

            r = await c.get("/api/knowledge/v.md/versions/1/diff/2")
            assert r.status == 200
            assert (await c.get("/api/knowledge/v.md/versions/1/diff/999")).status == 404


class TestKnowledgeImport:
    async def test_import_batch(self, kbot, tmp_path):
        docs = tmp_path / "docs"
        docs.mkdir()
        (docs / "one.md").write_text("imported document body one")
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            r = await c.post("/api/knowledge/import", json={"items": [
                {"type": "directory", "path": str(docs), "pattern": "**/*.md"},
                {"type": "url", "url": ""},  # missing url → recorded as failure
            ]})
            assert r.status == 200
            body = await r.json()
            assert body["total"] == 2 and body["succeeded"] >= 1 and body["failed"] >= 1

    async def test_import_validation(self, kbot):
        async with TestClient(TestServer(_app(register_knowledge, bot=kbot))) as c:
            assert (await c.post("/api/knowledge/import", data="bad")).status == 400
            assert (await c.post("/api/knowledge/import", json={"items": "notalist"})).status == 400


# --------------------------------------------------------------------------- #
# Memory notes — real round-tripping backing (load→mutate→save contract)
# --------------------------------------------------------------------------- #
def _memory_bot(initial=None):
    """A bot whose tool_executor persists memory through real copy semantics."""
    backing: dict[str, dict[str, str]] = {"global": {}}
    if initial:
        backing.update({k: dict(v) for k, v in initial.items()})

    def load():
        return {k: dict(v) for k, v in backing.items()}

    def save(data):
        backing.clear()
        backing.update({k: dict(v) for k, v in data.items()})

    bot = type("B", (), {})()
    bot.tool_executor = type("E", (), {})()
    bot.tool_executor._load_all_memory = load
    bot.tool_executor._save_all_memory = save
    bot._backing = backing
    return bot


class TestMemoryNotes:
    async def test_list(self):
        bot = _memory_bot({"global": {"a": "1", "b": "2"}, "user_5": {"x": "9"}})
        async with TestClient(TestServer(_app(register_memory_notes, bot=bot))) as c:
            body = await (await c.get("/api/memory")).json()
            assert body["global"]["count"] == 2 and set(body["global"]["keys"]) == {"a", "b"}
            assert body["user_5"]["count"] == 1

    async def test_get(self):
        bot = _memory_bot({"global": {"a": "hello"}})
        async with TestClient(TestServer(_app(register_memory_notes, bot=bot))) as c:
            r = await c.get("/api/memory/global/a")
            assert r.status == 200 and (await r.json())["value"] == "hello"
            assert (await c.get("/api/memory/global/missing")).status == 404

    async def test_set_persists(self):
        bot = _memory_bot()
        async with TestClient(TestServer(_app(register_memory_notes, bot=bot))) as c:
            assert (await c.put("/api/memory/global/k", json={"value": "v"})).status == 200
            assert (await c.put("/api/memory/global/k", json={})).status == 400  # no value
            # writing to a scope that doesn't exist yet creates it
            assert (await c.put("/api/memory/user_9/greeting", json={"value": "hi"})).status == 200
        assert bot._backing["global"]["k"] == "v"  # real persistence
        assert bot._backing["user_9"]["greeting"] == "hi"

    async def test_delete_persists(self):
        bot = _memory_bot({"global": {"gone": "soon"}})
        async with TestClient(TestServer(_app(register_memory_notes, bot=bot))) as c:
            assert (await c.delete("/api/memory/global/gone")).status == 200
            assert (await c.delete("/api/memory/global/gone")).status == 404
        assert "gone" not in bot._backing["global"]

    async def test_bulk_delete(self):
        bot = _memory_bot({"global": {"a": "1", "b": "2", "c": "3"}})
        async with TestClient(TestServer(_app(register_memory_notes, bot=bot))) as c:
            assert (await c.post("/api/memory/bulk-delete", data="bad")).status == 400
            assert (await c.post("/api/memory/bulk-delete", json={"entries": []})).status == 400
            r = await c.post("/api/memory/bulk-delete", json={"entries": [
                {"scope": "global", "key": "a"},
                {"scope": "global", "key": "c"},
                {"scope": "nope", "key": "z"},  # skipped
            ]})
            assert r.status == 200 and (await r.json())["count"] == 2
        assert set(bot._backing["global"]) == {"b"}


# --------------------------------------------------------------------------- #
# Learned context — real reflector, temp learned.json
# --------------------------------------------------------------------------- #
@pytest.fixture
def learned_bot(tmp_path):
    path = tmp_path / "learned.json"
    path.write_text(json.dumps({
        "version": 2,
        "last_reflection": "2026-07-07T00:00:00+00:00",
        "entries": [
            {"key": "e1", "category": "operational", "content": "first lesson"},
            {"key": "e2", "category": "correction", "content": "second lesson"},
        ],
    }))
    bot = type("B", (), {})()
    bot.reflector = ConversationReflector(str(path))
    return bot


class TestLearnedContext:
    async def test_list(self, learned_bot):
        async with TestClient(TestServer(_app(register_learned_context, bot=learned_bot))) as c:
            body = await (await c.get("/api/learned")).json()
            assert body["count"] == 2 and len(body["entries"]) == 2

    async def test_delete(self, learned_bot):
        async with TestClient(TestServer(_app(register_learned_context, bot=learned_bot))) as c:
            assert (await c.delete("/api/learned/e1")).status == 200
            assert (await c.delete("/api/learned/e1")).status == 404

    async def test_update(self, learned_bot):
        async with TestClient(TestServer(_app(register_learned_context, bot=learned_bot))) as c:
            r = await c.put("/api/learned/e2",
                            json={"content": "revised", "category": "preference"})
            assert r.status == 200 and (await r.json())["content"] == "revised"
            assert (await c.put("/api/learned/ghost", json={"content": "x"})).status == 404
            assert (await c.put("/api/learned/e2", data="not json")).status == 400
