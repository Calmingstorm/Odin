"""Coverage for src/tools/handlers/state.py list + memory ops (RFC-006 P21, safe).

StateTools instantiated via HandlerBase.__new__ with only the touched deps
(memory_path / memory_lock / lists_lock accessors + load/save memory callables).
manage_list runs against a REAL tmp lists.json; memory_manage runs against an
in-memory dict. Covers every list action, the grocery migration, and the
memory save/get/list/delete/eviction paths. SAFE: dict logic + tmp-file I/O only.
"""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import patch

from src.tools.handlers.state import StateTools


def _make(tmp_path, memory=None):
    memory = memory if memory is not None else {}
    mlock, llock = asyncio.Lock(), asyncio.Lock()
    deps = SimpleNamespace(
        memory_path=lambda: tmp_path / "memory.json",
        memory_lock=lambda: mlock,
        lists_lock=lambda: llock,
    )
    st = StateTools.__new__(StateTools)
    st._deps = deps  # type: ignore[assignment]  # SimpleNamespace fake of HandlerDeps
    st._load_all_memory = lambda: json.loads(json.dumps(memory))  # type: ignore[attr-defined]

    def _save(m):
        memory.clear()
        memory.update(m)

    st._save_all_memory = _save  # type: ignore[attr-defined]
    return st, memory


class TestMemoryManage:
    async def test_requires_action(self, tmp_path):
        st, _ = _make(tmp_path)
        assert "requires an 'action'" in await st._handle_memory_manage({})

    async def test_save_get_list_delete(self, tmp_path):
        st, mem = _make(tmp_path)
        assert "Saved global note 'k'" in await st._handle_memory_manage(
            {"action": "save", "key": "k", "value": "v", "scope": "global"})
        assert "**k** (global): v" in await st._handle_memory_manage(
            {"action": "get", "key": "k"})
        assert "Global notes" in await st._handle_memory_manage({"action": "list"})
        assert "Deleted global note 'k'" in await st._handle_memory_manage(
            {"action": "delete", "key": "k"})
        assert "No note found" in await st._handle_memory_manage({"action": "get", "key": "k"})

    async def test_personal_scope_and_missing_key(self, tmp_path):
        st, _ = _make(tmp_path)
        await st._handle_memory_manage(
            {"action": "save", "key": "p", "value": "pv"}, user_id="u1")   # personal
        assert "(personal): pv" in await st._handle_memory_manage(
            {"action": "get", "key": "p"}, user_id="u1")
        assert "'key' is required" in await st._handle_memory_manage({"action": "get"})
        assert "required for save" in await st._handle_memory_manage({"action": "save", "key": "x"})
        assert "Unknown memory action" in await st._handle_memory_manage({"action": "bogus"})


class TestManageList:
    async def test_add_show_and_list_all(self, tmp_path):
        st, _ = _make(tmp_path)
        out = await st._handle_manage_list(
            {"action": "add", "list_name": "Groceries", "items": ["Milk", "Eggs", "milk"]},
            user_id="u1")
        assert "Added to 'groceries': Milk, Eggs" in out and "Already on the list: milk" in out
        assert "Milk" in await st._handle_manage_list(
            {"action": "show", "list_name": "groceries"}, user_id="u1")
        assert "groceries" in await st._handle_manage_list({"action": "list_all"}, user_id="u1")

    async def test_remove_mark_done_undone_clear(self, tmp_path):
        st, _ = _make(tmp_path)
        await st._handle_manage_list(
            {"action": "add", "list_name": "todo", "items": ["Task A", "Task B"]}, user_id="u1")
        assert "Marked done: Task A" in await st._handle_manage_list(
            {"action": "mark_done", "list_name": "todo", "items": ["task a"]}, user_id="u1")
        assert "Marked undone: Task A" in await st._handle_manage_list(
            {"action": "mark_undone", "list_name": "todo", "items": ["task a"]}, user_id="u1")
        assert "Removed from 'todo': Task B" in await st._handle_manage_list(
            {"action": "remove", "list_name": "todo", "items": ["task b"]}, user_id="u1")
        assert "Cleared 1 item" in await st._handle_manage_list(
            {"action": "clear", "list_name": "todo"}, user_id="u1")

    async def test_guards_and_access(self, tmp_path):
        st, _ = _make(tmp_path)
        assert "list_name is required" in await st._handle_manage_list(
            {"action": "show", "list_name": ""}, user_id="u1")
        assert "Unknown action" in await st._handle_manage_list(
            {"action": "frobnicate", "list_name": "x"}, user_id="u1")
        assert "No lists exist yet" in await st._handle_manage_list(
            {"action": "list_all"}, user_id="u1")
        # a personal list owned by someone else is invisible to another user
        await st._handle_manage_list(
            {"action": "add", "list_name": "secret", "items": ["x"], "owner": "personal"},
            user_id="owner")
        assert "don't have access" in await st._handle_manage_list(
            {"action": "show", "list_name": "secret"}, user_id="intruder")

    async def test_grocery_migration(self, tmp_path):
        st, _ = _make(tmp_path)
        # legacy grocery_list.json next to memory.json is migrated on first load
        old = tmp_path / "grocery_list.json"
        old.write_text(json.dumps({"items": [{"name": "Bread", "added_by": "u1"}]}))
        out = await st._handle_manage_list({"action": "show", "list_name": "grocery"}, user_id="u1")
        assert "Bread" in out
        assert (tmp_path / "lists.json").exists()   # migration persisted


class TestManageListEdges:
    async def _add(self, st, name="l", items=("real",), user="u1"):
        return await st._handle_manage_list(
            {"action": "add", "list_name": name, "items": list(items)}, user_id=user)

    async def test_no_items_guards(self, tmp_path):
        st, _ = _make(tmp_path)
        await self._add(st)
        for action, phrase in [("add", "to add"), ("remove", "to remove"),
                               ("mark_done", "as done"), ("mark_undone", "as undone")]:
            out = await st._handle_manage_list(
                {"action": action, "list_name": "l", "items": []}, user_id="u1")
            assert phrase in out

    async def test_blank_name_items_skipped(self, tmp_path):
        st, _ = _make(tmp_path)
        await self._add(st)
        for action in ("add", "remove", "mark_done", "mark_undone"):
            await st._handle_manage_list(
                {"action": action, "list_name": "l", "items": ["   "]}, user_id="u1")  # skipped

    async def test_not_found_and_missing_list(self, tmp_path):
        st, _ = _make(tmp_path)
        await self._add(st)
        assert "Not found" in await st._handle_manage_list(
            {"action": "mark_done", "list_name": "l", "items": ["zzz"]}, user_id="u1")
        assert "Not found" in await st._handle_manage_list(
            {"action": "mark_undone", "list_name": "l", "items": ["zzz"]}, user_id="u1")
        assert "doesn't exist" in await st._handle_manage_list(
            {"action": "mark_undone", "list_name": "nope", "items": ["x"]}, user_id="u1")

    async def test_remove_empties_and_listall_shows_done(self, tmp_path):
        st, _ = _make(tmp_path)
        await self._add(st, name="l", items=("only",))
        assert "now empty" in await st._handle_manage_list(
            {"action": "remove", "list_name": "l", "items": ["only"]}, user_id="u1")
        await self._add(st, name="m", items=("x",))
        await st._handle_manage_list(
            {"action": "mark_done", "list_name": "m", "items": ["x"]}, user_id="u1")
        assert "done)" in await st._handle_manage_list({"action": "list_all"}, user_id="u1")

    async def test_corrupt_lists_and_grocery_tolerated(self, tmp_path):
        st, _ = _make(tmp_path)
        (tmp_path / "lists.json").write_text("{ broken json")           # corrupt lists.json
        assert "No lists exist" in await st._handle_manage_list(
            {"action": "list_all"}, user_id="u1")
        (tmp_path / "lists.json").unlink()
        (tmp_path / "grocery_list.json").write_text("{ broken grocery")  # corrupt migration source
        assert "No lists exist" in await st._handle_manage_list(
            {"action": "list_all"}, user_id="u1")

    async def test_memory_eviction_break_on_self(self, tmp_path):
        st, _ = _make(tmp_path)
        # cap 0 → the just-written key is the oldest, so the eviction loop breaks on it
        with patch("src.tools.handlers.state.MEMORY_MAX_KEYS_PER_SECTION", 0):
            out = await st._handle_memory_manage(
                {"action": "save", "key": "k", "value": "v", "scope": "global"})
        assert "Saved global note 'k'" in out
