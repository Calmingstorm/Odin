"""#397/#398: a cancelled persistence worker keeps its store lock until the worker
has physically finished, so it can never publish a stale snapshot over a later,
acknowledged write. Real stores in tmp_path; the only fake is a threading gate
that parks the first worker (models a slow disk)."""
from __future__ import annotations

import asyncio
import json
import threading
from types import SimpleNamespace

import pytest

from src.knowledge.store import KnowledgeStore
from src.learning.reflector import ConversationReflector
from src.search.fts import FullTextIndex
from src.tools.executor import ToolExecutor


def _gate(obj, attr, monkeypatch, *, unbound=None):
    """Park only the FIRST call of obj.attr until release is set."""
    entered, release = threading.Event(), threading.Event()
    real = getattr(obj, attr) if unbound is None else unbound
    calls = {"n": 0}

    def gated(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            entered.set()
            release.wait(5)
        return real(*args, **kwargs) if unbound is None else real(obj, *args, **kwargs)

    monkeypatch.setattr(obj, attr, gated)
    return entered, release


async def _cancel_while_parked(task, entered, lock):
    """Cancel (twice) while the worker is parked; the lock must stay owned."""
    await asyncio.to_thread(entered.wait, 5)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    for _ in range(20):
        await asyncio.sleep(0)
    assert not task.done(), "cancelled caller returned while its worker was still running"
    assert lock.locked(), "lock released while the admitted worker was still running"


@pytest.fixture
def kstore(tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts_index=fts)
    yield store
    store.close()
    fts._conn.close()


def _rows(store, source):
    return [r[0] for r in store._conn.execute(
        "SELECT content FROM knowledge_chunks WHERE source=? ORDER BY chunk_index", (source,))]


async def test_cancelled_ingest_cannot_overwrite_later_stored_document(kstore, monkeypatch):
    entered, release = _gate(kstore, "_write_chunks_sync", monkeypatch)
    first = asyncio.create_task(kstore.ingest("first stale content", "runbook.md"))
    await _cancel_while_parked(first, entered, kstore._write_lock)
    second = asyncio.create_task(kstore.ingest("second current content", "runbook.md"))
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await first
    outcome = await second
    assert outcome.status == "stored"
    assert _rows(kstore, "runbook.md") == ["second current content"]
    assert kstore.get_source_snapshot("runbook.md") == "second current content"


async def test_cancelled_delete_cannot_remove_later_stored_document(kstore, monkeypatch):
    await kstore.ingest("version one text", "doc.md")
    entered, release = _gate(kstore, "delete_source", monkeypatch)
    first = asyncio.create_task(kstore.delete_source_async("doc.md"))
    await _cancel_while_parked(first, entered, kstore._write_lock)
    second = asyncio.create_task(kstore.ingest("version two text", "doc.md"))
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await first
    assert (await second).status == "stored"
    assert _rows(kstore, "doc.md") == ["version two text"]


@pytest.fixture
def executor(tmp_path):
    mem = tmp_path / "memory.json"
    mem.write_text(json.dumps({"global": {"old": "X"}}))
    return ToolExecutor(memory_path=str(mem)), mem


@pytest.mark.parametrize("first_input", [
    {"action": "save", "scope": "global", "key": "cancelled", "value": "A"},
    {"action": "delete", "key": "old"},
])
async def test_cancelled_memory_tool_write_cannot_erase_later_save(
        executor, monkeypatch, first_input):
    ex, mem = executor
    entered, release = _gate(
        ex, "_save_all_memory", monkeypatch, unbound=ToolExecutor._save_all_memory)
    first = asyncio.create_task(ex.state_tools._handle_memory_manage(dict(first_input)))
    await _cancel_while_parked(first, entered, ex._memory_lock)
    second = asyncio.create_task(ex.state_tools._handle_memory_manage(
        {"action": "save", "scope": "global", "key": "later", "value": "B"}))
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await first
    assert await second == "Saved global note 'later'."
    assert json.loads(mem.read_text())["global"]["later"] == "B"


async def test_cancelled_rest_memory_write_cannot_erase_later_save(executor, monkeypatch):
    from aiohttp import web

    from src.web.api.knowledge_mem import register_memory_notes

    ex, mem = executor
    routes = web.RouteTableDef()
    register_memory_notes(routes, SimpleNamespace(tool_executor=ex))
    put = next(r.handler for r in routes if r.method == "PUT")

    def request(key, value):
        async def body():
            return {"value": value}
        return SimpleNamespace(match_info={"scope": "global", "key": key}, json=body,
                               _api_identity=None, query={})

    entered, release = _gate(
        ex, "_save_all_memory", monkeypatch, unbound=ToolExecutor._save_all_memory)
    first = asyncio.create_task(put(request("cancelled", "A")))
    await _cancel_while_parked(first, entered, ex._memory_lock)
    second = asyncio.create_task(put(request("later", "B")))
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await first
    assert (await second).status == 200
    assert json.loads(mem.read_text())["global"]["later"] == "B"


async def test_cancelled_list_write_cannot_erase_later_add(executor, monkeypatch):
    ex, _mem = executor
    st = ex.state_tools
    entered, release = _gate(st, "_save_lists", monkeypatch)
    first = asyncio.create_task(st._handle_manage_list(
        {"action": "add", "list_name": "grocery", "items": ["cancelled-item"]}, user_id="u"))
    await _cancel_while_parked(first, entered, ex._lists_lock)
    second = asyncio.create_task(st._handle_manage_list(
        {"action": "add", "list_name": "grocery", "items": ["later-item"]}, user_id="u"))
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await first
    assert "later-item" in await second
    names = [i["name"] for i in json.loads(st._lists_path().read_text())["grocery"]["items"]]
    assert "later-item" in names


async def test_cancelled_learned_delete_cannot_revert_later_update(tmp_path, monkeypatch):
    refl = ConversationReflector(learned_path=str(tmp_path / "learned.json"), enabled=True)
    store = refl._empty_store()
    stamp = "2026-01-01T00:00:00+00:00"
    store["entries"] = [
        {"key": k, "category": "operational", "content": c,
         "created_at": stamp, "updated_at": stamp}
        for k, c in (("a", "Alpha lesson."), ("b", "Beta lesson."))
    ]
    refl._save(store)
    entered, release = _gate(refl, "_save", monkeypatch)
    first = asyncio.create_task(refl.delete_entry_async("a"))
    await _cancel_while_parked(first, entered, refl._lock)
    second = asyncio.create_task(refl.update_entry_async("b", content="Beta lesson, updated."))
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await first
    assert (await second)["content"] == "Beta lesson, updated."
    stored = json.loads((tmp_path / "learned.json").read_text())["entries"]
    entries = {e["key"]: e["content"] for e in stored}
    assert entries == {"b": "Beta lesson, updated."}
