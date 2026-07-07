"""Coverage for StateTools — memory_manage + manage_list (RFC-006 P3, ≥85%).

Drives the real handler bodies via a StateTools wired to tmp-file-backed
memory (in-dict) and lists (real json). memory_manage bounds prompt bloat
via the LRU-by-write cap; manage_list is the grocery/list CRUD with ownership.
"""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from src.tools.handlers.state import MEMORY_MAX_KEYS_PER_SECTION, StateTools


@pytest.fixture
def tools(tmp_path):
    mem = {}
    memory_path = tmp_path / "memory.json"
    deps = SimpleNamespace(
        memory_path=lambda: memory_path,
        memory_lock=lambda: asyncio.Lock(),
        lists_lock=lambda: asyncio.Lock(),
    )
    st = StateTools.__new__(StateTools)
    st._deps = deps
    st._load_all_memory = lambda: json.loads(json.dumps(mem))  # deep copy snapshot
    def _save(all_mem):
        mem.clear()
        mem.update(all_mem)
    st._save_all_memory = _save
    return st


class TestMemoryManage:
    @pytest.mark.asyncio
    async def test_missing_action(self, tools):
        assert "requires an 'action'" in await tools._handle_memory_manage({})

    @pytest.mark.asyncio
    async def test_save_get_personal_and_global(self, tools):
        await tools._handle_memory_manage(
            {"action": "save", "key": "k", "value": "v"}, user_id="u1")
        got = await tools._handle_memory_manage({"action": "get", "key": "k"}, user_id="u1")
        assert "personal" in got and "v" in got
        await tools._handle_memory_manage(
            {"action": "save", "scope": "global", "key": "g", "value": "gv"})
        got_g = await tools._handle_memory_manage({"action": "get", "key": "g"})
        assert "global" in got_g and "gv" in got_g

    @pytest.mark.asyncio
    async def test_save_requires_key_and_value(self, tools):
        assert "required" in await tools._handle_memory_manage({"action": "save", "key": "k"})

    @pytest.mark.asyncio
    async def test_get_missing_key_and_no_key(self, tools):
        assert "'key' is required" in await tools._handle_memory_manage({"action": "get"})
        assert "No note found" in await tools._handle_memory_manage(
            {"action": "get", "key": "absent"})

    @pytest.mark.asyncio
    async def test_list_empty_then_populated(self, tools):
        assert "No notes" in await tools._handle_memory_manage({"action": "list"})
        await tools._handle_memory_manage(
            {"action": "save", "scope": "global", "key": "g", "value": "gv"})
        await tools._handle_memory_manage(
            {"action": "save", "key": "p", "value": "pv"}, user_id="u1")
        listing = await tools._handle_memory_manage({"action": "list"}, user_id="u1")
        assert "Global notes" in listing and "Your personal notes" in listing

    @pytest.mark.asyncio
    async def test_delete_personal_global_and_absent(self, tools):
        await tools._handle_memory_manage(
            {"action": "save", "key": "k", "value": "v"}, user_id="u1")
        assert "Deleted personal" in await tools._handle_memory_manage(
            {"action": "delete", "key": "k"}, user_id="u1")
        await tools._handle_memory_manage(
            {"action": "save", "scope": "global", "key": "g", "value": "gv"})
        assert "Deleted global" in await tools._handle_memory_manage(
            {"action": "delete", "key": "g"})
        assert "No note found" in await tools._handle_memory_manage(
            {"action": "delete", "key": "ghost"})
        assert "'key' is required" in await tools._handle_memory_manage({"action": "delete"})

    @pytest.mark.asyncio
    async def test_cap_evicts_oldest(self, tools):
        for i in range(MEMORY_MAX_KEYS_PER_SECTION + 3):
            await tools._handle_memory_manage(
                {"action": "save", "scope": "global", "key": f"k{i}", "value": str(i)})
        # first-written keys evicted; the just-written one survives
        last = await tools._handle_memory_manage(
            {"action": "get", "key": f"k{MEMORY_MAX_KEYS_PER_SECTION + 2}"})
        assert "No note found" not in last
        assert "No note found" in await tools._handle_memory_manage({"action": "get", "key": "k0"})

    @pytest.mark.asyncio
    async def test_save_without_user_falls_to_global(self, tools):
        r = await tools._handle_memory_manage({"action": "save", "key": "k", "value": "v"})
        assert "global note" in r

    @pytest.mark.asyncio
    async def test_unknown_action(self, tools):
        assert "Unknown memory action" in await tools._handle_memory_manage(
            {"action": "frobnicate"})


class TestManageList:
    async def _add(self, tools, items, name="grocery", **kw):
        return await tools._handle_manage_list(
            {"action": "add", "list_name": name, "items": items, **kw})

    @pytest.mark.asyncio
    async def test_add_show_and_dedup(self, tools):
        await self._add(tools, ["Milk", "Eggs"])
        again = await self._add(tools, ["milk", "Bread"])
        assert "Already on the list" in again and "Bread" in again
        shown = await tools._handle_manage_list({"action": "show", "list_name": "grocery"})
        assert "Milk" in shown and "Eggs" in shown and "Bread" in shown

    @pytest.mark.asyncio
    async def test_list_all(self, tools):
        assert "No lists exist" in await tools._handle_manage_list({"action": "list_all"})
        await self._add(tools, ["Milk"])
        allv = await tools._handle_manage_list({"action": "list_all"})
        assert "grocery" in allv and "1 items" in allv

    @pytest.mark.asyncio
    async def test_remove_and_not_found(self, tools):
        await self._add(tools, ["Milk", "Eggs"])
        r = await tools._handle_manage_list(
            {"action": "remove", "list_name": "grocery", "items": ["Milk", "Ghost"]})
        assert "Removed" in r and "Not found: Ghost" in r

    @pytest.mark.asyncio
    async def test_mark_done_and_undone(self, tools):
        await self._add(tools, ["Milk"])
        done = await tools._handle_manage_list(
            {"action": "mark_done", "list_name": "grocery", "items": ["Milk"]})
        assert "Marked done: Milk" in done
        undone = await tools._handle_manage_list(
            {"action": "mark_undone", "list_name": "grocery", "items": ["Milk"]})
        assert "Marked undone: Milk" in undone

    @pytest.mark.asyncio
    async def test_clear(self, tools):
        await self._add(tools, ["Milk", "Eggs"])
        cleared = await tools._handle_manage_list({"action": "clear", "list_name": "grocery"})
        assert "Cleared 2 item(s)" in cleared
        assert "already empty" in await tools._handle_manage_list(
            {"action": "clear", "list_name": "grocery"})

    @pytest.mark.asyncio
    async def test_show_empty_and_missing(self, tools):
        assert "is empty" in await tools._handle_manage_list(
            {"action": "show", "list_name": "nope"})
        assert "list_name is required" in await tools._handle_manage_list({"action": "show"})

    @pytest.mark.asyncio
    async def test_personal_ownership_isolation(self, tools):
        # u1 creates a personal list; u2 cannot see or access it.
        await tools._handle_manage_list(
            {"action": "add", "list_name": "secret", "items": ["x"], "owner": "personal"},
            user_id="u1")
        denied = await tools._handle_manage_list(
            {"action": "show", "list_name": "secret"}, user_id="u2")
        assert "don't have access" in denied
        allv = await tools._handle_manage_list({"action": "list_all"}, user_id="u2")
        assert "secret" not in allv

    @pytest.mark.asyncio
    async def test_remove_and_markdone_on_missing_list(self, tools):
        assert "doesn't exist" in await tools._handle_manage_list(
            {"action": "remove", "list_name": "nope", "items": ["x"]})
        assert "doesn't exist" in await tools._handle_manage_list(
            {"action": "mark_done", "list_name": "nope", "items": ["x"]})

    @pytest.mark.asyncio
    async def test_unknown_action(self, tools):
        await self._add(tools, ["Milk"])
        assert "Unknown action" in await tools._handle_manage_list(
            {"action": "frobnicate", "list_name": "grocery"})


class TestListMigrationAndFormat:
    def test_migrates_old_grocery_file(self, tools, tmp_path):
        old = tmp_path / "grocery_list.json"
        old.write_text(json.dumps({"items": [
            {"name": "Milk", "added_by": "u1", "added_at": "2026-01-01T00:00:00"}]}))
        lists = tools._load_lists()
        assert "grocery" in lists and lists["grocery"]["items"][0]["name"] == "Milk"

    def test_load_lists_no_path(self):
        st = StateTools.__new__(StateTools)
        st._deps = SimpleNamespace(memory_path=lambda: None)
        assert st._load_lists() == {}

    def test_format_list_with_done_and_timestamp(self):
        out = StateTools._format_list("grocery", {"items": [
            {"name": "Milk", "done": True, "added_by": "u1", "added_at": "2026-01-02T00:00:00"},
            {"name": "Eggs", "done": False},
        ]})
        assert "~~Milk~~" in out and "Jan 02" in out and "Eggs" in out

    def test_format_list_bad_timestamp_ignored(self):
        out = StateTools._format_list("g", {"items": [
            {"name": "X", "added_at": "not-a-date"}]})
        assert "X" in out  # no crash on unparseable timestamp

    def test_format_empty(self):
        assert "is empty" in StateTools._format_list("g", {"items": []})
