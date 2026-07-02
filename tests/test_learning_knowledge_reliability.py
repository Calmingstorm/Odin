"""Tests for learning/knowledge reliability fixes (PR4).

Covers:
- learned-injection budget is a hard cap (query-less and gated paths)
- consolidation fallback pins corrections/preferences over recent trivia
- reflector delete/update async wrappers take the lock (no resurrection)
- working memory is capped per section (bounded prompt injection)
- knowledge delete_source/merge_sources async wrappers take the write lock
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from src.learning.reflector import ConversationReflector


def _entry(key, category="operational", content="a lesson.", **kw):
    e = {"key": key, "category": category, "content": content,
         "updated_at": kw.pop("updated_at", "2026-01-01T00:00:00+00:00")}
    e.update(kw)
    return e


def _store(tmp_path, entries) -> str:
    path = tmp_path / "learned.json"
    path.write_text(json.dumps({
        "version": 2, "last_reflection": None, "entries": entries,
    }))
    return str(path)


# ---------------------------------------------------------------------------
# Injection budget hard cap
# ---------------------------------------------------------------------------

def test_queryless_injection_respects_budget(tmp_path):
    path = _store(tmp_path, [_entry(f"k{i}", content="x" * 600 + ".") for i in range(30)])
    r = ConversationReflector(path, injection_token_budget=400)
    section = r.get_prompt_section(query=None)
    # Rough token check: the section must not blow the budget by much.
    assert len(section) // 4 <= 400 + 200  # small formatting slack
    assert section.count("- [") < 30


def test_injection_keeps_at_least_one_entry(tmp_path):
    # A single entry larger than the whole budget still gets injected (better
    # than silently injecting nothing).
    path = _store(tmp_path, [_entry("big", content="y" * 4000 + ".")])
    r = ConversationReflector(path, injection_token_budget=50)
    section = r.get_prompt_section(query=None)
    assert section.count("- [") == 1


def test_gated_injection_prioritizes_corrections(tmp_path):
    entries = [_entry("c", category="correction", content="pinned correction.")]
    entries += [_entry(f"op{i}", content="x" * 300 + ".") for i in range(20)]
    path = _store(tmp_path, entries)
    r = ConversationReflector(path, injection_token_budget=200)
    section = r.get_prompt_section(query="something", user_id=None)
    # The correction survives the budget trim even though it's outnumbered.
    assert "pinned correction." in section


# ---------------------------------------------------------------------------
# Consolidation fallback pinning
# ---------------------------------------------------------------------------

async def test_consolidation_fallback_pins_corrections(tmp_path):
    # Old corrections must survive when the consolidation LLM fails, even
    # against newer operational trivia.
    corrections = [
        _entry(f"corr{i}", category="correction", content=f"old correction {i}.",
               updated_at="2020-01-01T00:00:00+00:00")
        for i in range(5)
    ]
    trivia = [
        _entry(f"op{i}", category="operational", content=f"recent trivia {i}.",
               updated_at="2026-06-01T00:00:00+00:00")
        for i in range(30)
    ]
    r = ConversationReflector(
        _store(tmp_path, []), max_entries=40, consolidation_target=10,
    )
    # No text_fn configured → consolidation takes the fallback path.
    result = await r._consolidate(corrections + trivia)
    kept_keys = {e["key"] for e in result}
    for i in range(5):
        assert f"corr{i}" in kept_keys  # all corrections pinned


async def test_consolidation_fallback_pins_preferences(tmp_path):
    prefs = [
        _entry(f"pref{i}", category="preference", content=f"old pref {i}.",
               updated_at="2020-01-01T00:00:00+00:00")
        for i in range(4)
    ]
    trivia = [
        _entry(f"op{i}", category="operational", content=f"trivia {i}.",
               updated_at="2026-06-01T00:00:00+00:00")
        for i in range(20)
    ]
    r = ConversationReflector(_store(tmp_path, []), max_entries=25, consolidation_target=6)
    result = await r._consolidate(prefs + trivia)
    kept_keys = {e["key"] for e in result}
    for i in range(4):
        assert f"pref{i}" in kept_keys


# ---------------------------------------------------------------------------
# Reflector async delete/update under lock
# ---------------------------------------------------------------------------

async def test_delete_entry_async_removes_and_persists(tmp_path):
    path = _store(tmp_path, [_entry("a"), _entry("b")])
    r = ConversationReflector(path)
    assert await r.delete_entry_async("a") is True
    keys = {e["key"] for e in r.get_all_entries()}
    assert keys == {"b"}


async def test_delete_entry_async_not_resurrected_by_concurrent_reflection(tmp_path):
    """A delete while a reflection holds the lock must apply to post-reflection
    data, not be overwritten by the reflection's stale snapshot."""
    path = _store(tmp_path, [_entry("keep"), _entry("victim")])
    r = ConversationReflector(path)

    release = asyncio.Event()

    async def _slow_text_fn(messages, system):
        await release.wait()
        return "[]"  # no new entries

    r.set_text_fn(_slow_text_fn)

    # Start a reflection that grabs the lock and stalls inside the LLM call.
    reflect_task = asyncio.create_task(
        r._reflect("some conversation", full=True, user_ids=[]),
    )
    await asyncio.sleep(0.05)  # let it acquire the lock

    # Delete must block on the lock until the reflection finishes.
    del_task = asyncio.create_task(r.delete_entry_async("victim"))
    await asyncio.sleep(0.05)
    assert not del_task.done()  # blocked on the lock

    release.set()
    await reflect_task
    assert await del_task is True

    keys = {e["key"] for e in r.get_all_entries()}
    assert "victim" not in keys  # stayed deleted
    assert "keep" in keys


async def test_update_entry_async_applies(tmp_path):
    path = _store(tmp_path, [_entry("a", content="before.")])
    r = ConversationReflector(path)
    updated = await r.update_entry_async("a", content="after.")
    assert updated is not None and updated["content"] == "after."
    assert r.get_all_entries()[0]["content"] == "after."


# ---------------------------------------------------------------------------
# Working memory cap
# ---------------------------------------------------------------------------

async def test_working_memory_capped_per_section(tmp_path, monkeypatch):
    import src.tools.executor as ex_mod
    from src.tools.executor import ToolExecutor

    monkeypatch.setattr(ex_mod, "MEMORY_MAX_KEYS_PER_SECTION", 5)

    execu = ToolExecutor.__new__(ToolExecutor)
    execu._memory_path = tmp_path / "memory.json"
    execu._memory_lock = asyncio.Lock()

    # Write more keys than the cap into the global section.
    for i in range(8):
        await execu._handle_memory_manage(
            {"action": "save", "key": f"note{i}", "value": f"v{i}", "scope": "global"},
        )

    data = json.loads((tmp_path / "memory.json").read_text())
    assert len(data["global"]) == 5
    # Oldest evicted, newest retained.
    assert "note0" not in data["global"]
    assert "note7" in data["global"]


async def test_working_memory_update_existing_key_no_growth(tmp_path, monkeypatch):
    import src.tools.executor as ex_mod
    from src.tools.executor import ToolExecutor
    monkeypatch.setattr(ex_mod, "MEMORY_MAX_KEYS_PER_SECTION", 5)

    execu = ToolExecutor.__new__(ToolExecutor)
    execu._memory_path = tmp_path / "memory.json"
    execu._memory_lock = asyncio.Lock()
    for _ in range(3):
        await execu._handle_memory_manage(
            {"action": "save", "key": "k", "value": "v", "scope": "global"},
        )
    data = json.loads((tmp_path / "memory.json").read_text())
    assert list(data["global"].keys()) == ["k"]


# ---------------------------------------------------------------------------
# Knowledge store async wrappers take the write lock
# ---------------------------------------------------------------------------

async def test_delete_source_async_holds_write_lock(tmp_path, monkeypatch):
    from src.knowledge.store import KnowledgeStore

    store = KnowledgeStore.__new__(KnowledgeStore)
    store._write_lock = asyncio.Lock()
    lock_seen = {}

    def _fake_delete(source, **kw):
        lock_seen["locked"] = store._write_lock.locked()
        return 3

    store.delete_source = _fake_delete  # type: ignore[method-assign]
    deleted = await store.delete_source_async("doc")
    assert deleted == 3
    assert lock_seen["locked"] is True  # ran under the write lock


async def test_merge_sources_async_holds_write_lock(tmp_path):
    from src.knowledge.store import KnowledgeStore

    store = KnowledgeStore.__new__(KnowledgeStore)
    store._write_lock = asyncio.Lock()
    seen = {}

    def _fake_merge(keep, remove):
        seen["locked"] = store._write_lock.locked()
        return 2

    store.merge_sources = _fake_merge  # type: ignore[method-assign]
    assert await store.merge_sources_async("a", "b") == 2
    assert seen["locked"] is True
