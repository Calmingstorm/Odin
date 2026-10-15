"""Knowledge reads never stall the event loop while a worker thread holds the store.

The knowledge store serializes its shared connection with a thread lock, which
a write holds through FTS replacement and verification. Every caller on the
event loop must therefore read through a worker thread. Each test holds the
lock from another thread for a second, as a long write would, and requires a
10 ms heartbeat on the event loop to keep running while the call waits.
"""
from __future__ import annotations

import asyncio
import threading
import time
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.discord.background_task import _execute_tool_captured
from src.discord.native_tools.knowledge import KnowledgeTools
from src.knowledge.importer import BulkImporter
from src.knowledge.store import KnowledgeStore
from src.web.api.config_admin import register_discord_config

HOLD_SECONDS = 1.0
MAX_LOOP_GAP_SECONDS = 0.3
DOCUMENT = "The release checklist names each step and who owns it."


@pytest.fixture
async def store(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    knowledge = KnowledgeStore(str(tmp_path / "knowledge.db"))
    assert knowledge.available
    assert await knowledge.ingest(DOCUMENT, "checklist.md", dedup=False) > 0
    yield knowledge
    knowledge.close()


async def _while_held(store, call):
    """Run *call* while another thread holds the store's lock; return (gap, result, waited).

    An independent clock ends the hold, never the event loop, so a call that
    blocks the loop shows up as one long heartbeat gap instead of a deadlock.
    """
    acquired = threading.Event()

    def hold():
        with store._conn_lock:
            acquired.set()
            time.sleep(HOLD_SECONDS)

    gaps, stop, beating = [], asyncio.Event(), asyncio.Event()

    async def heartbeat():
        last = time.monotonic()
        beating.set()
        while not stop.is_set():
            await asyncio.sleep(0.01)
            now = time.monotonic()
            gaps.append(now - last)
            last = now

    holder = threading.Thread(target=hold, daemon=True)
    holder.start()
    assert acquired.wait(5)
    beat = asyncio.create_task(heartbeat())
    # Beat first: a call that blocks before its first await must still show up.
    await beating.wait()
    started = time.monotonic()
    try:
        result = await asyncio.wait_for(call(), 10)
    finally:
        waited = time.monotonic() - started
        stop.set()
        await beat
        holder.join(5)
    return max(gaps), result, waited


def _assert_responsive(gap, waited):
    # The call really waited for the store, and the loop kept running meanwhile.
    assert waited >= HOLD_SECONDS * 0.8
    assert gap < MAX_LOOP_GAP_SECONDS


async def _get(bot, path):
    routes = web.RouteTableDef()
    register_discord_config(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.get(path)
        assert response.status == 200
        return await response.json()


async def test_health_components_route(store):
    gap, body, waited = await _while_held(
        store, lambda: _get(SimpleNamespace(knowledge=store), "/api/health/components"))
    _assert_responsive(gap, waited)
    knowledge = next(c for c in body["components"] if c["name"] == "knowledge")
    assert knowledge["status"] == "ok" and knowledge["metadata"]["chunks"] == 1


async def test_resource_usage_route(store):
    gap, body, waited = await _while_held(
        store, lambda: _get(SimpleNamespace(knowledge=store), "/api/resource-usage"))
    _assert_responsive(gap, waited)
    assert body["knowledge"]["chunk_count"] == 1
    assert body["knowledge"]["sources"][0]["source"] == "checklist.md"


async def test_list_knowledge_tool(store):
    tools = KnowledgeTools(sessions=None, get_knowledge_store=lambda: store, embedder=None,
                           audit=None)

    async def call():
        result = tools._handle_list_knowledge()  # awaited when it is a coroutine, as dispatch does
        return await result if asyncio.iscoroutine(result) else result

    gap, text, waited = await _while_held(store, call)
    _assert_responsive(gap, waited)
    assert "checklist.md" in text


async def test_background_task_list_knowledge(store):
    gap, text, waited = await _while_held(store, lambda: _execute_tool_captured(
        "list_knowledge", {}, None, None, store, None, "tester"))
    _assert_responsive(gap, waited)
    assert text == "- checklist.md (1 chunks)"


async def test_file_import_legacy_lookup(store, tmp_path):
    path = tmp_path / "notes.md"
    path.write_text("Deploys wait for an idle turn before restarting.\n")
    importer = BulkImporter(store, None)
    gap, result, waited = await _while_held(
        store, lambda: importer._import_resolved_file(path, "tester"))
    _assert_responsive(gap, waited)
    assert result.status == "ok"


async def test_pdf_import_legacy_lookup(store):
    assert await store.ingest("Extracted PDF text.", "a.pdf", dedup=False) > 0
    importer = BulkImporter(store, None)
    gap, result, waited = await _while_held(store, lambda: importer._existing_legacy_pdf(
        "https://example.com/a.pdf", "example.com/a.pdf", "Extracted PDF text."))
    _assert_responsive(gap, waited)
    assert result is not None and result.source == "a.pdf"
