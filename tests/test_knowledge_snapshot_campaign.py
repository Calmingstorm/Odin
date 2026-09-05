from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.knowledge.store import KnowledgeStore
from src.web.api.knowledge_mem import register_knowledge


@pytest.mark.asyncio
@pytest.mark.parametrize("body", ["  boundary\t\n\ntext\n  ",
                                 " ".join(f"word{i:05}" for i in range(1500)),
                                 "first paragraph\n\nsecond paragraph\n"])
async def test_real_reingest_preserves_full_snapshot(tmp_path, body):
    store = KnowledgeStore(tmp_path / "knowledge.db")
    await store.ingest(body, "document")
    routes = web.RouteTableDef()
    register_knowledge(routes, SimpleNamespace(knowledge=store, embedder=None))
    app = web.Application()
    app.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        for _ in range(3):
            response = await client.post("/api/knowledge/document/reingest")
            assert response.status == 200
            assert store.get_source_snapshot("document").encode() == body.encode()
            hashes = store._conn.execute(
                "SELECT DISTINCT doc_content_hash FROM knowledge_chunks",
            ).fetchall()
            assert hashes == [(store._content_hash(body),)]
    store.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["missing", "stale", "failed_snapshot"])
async def test_route_refuses_missing_or_stale_snapshot_without_changes(
    tmp_path, failure, monkeypatch,
):
    store = KnowledgeStore(tmp_path / "knowledge.db")
    await store.ingest("original", "document")
    if failure == "missing":
        store._conn.execute("DELETE FROM knowledge_versions")
        store._conn.commit()
    elif failure == "stale":
        store._conn.execute("UPDATE knowledge_versions SET content='stale'")
        store._conn.commit()
    else:
        monkeypatch.setattr(store, "_record_version", lambda *args, **kwargs: 0)
        await store.ingest("replacement", "document")
    before = store._conn.execute("SELECT * FROM knowledge_chunks").fetchall()
    routes = web.RouteTableDef()
    register_knowledge(routes, SimpleNamespace(knowledge=store, embedder=None))
    app = web.Application()
    app.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/knowledge/document/reingest")
        assert response.status == 409
        assert "refusing reconstruction" in (await response.json())["error"]
    assert store._conn.execute("SELECT * FROM knowledge_chunks").fetchall() == before
    store.close()
