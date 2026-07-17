"""Corruption fail-closed for the small JSON stores (memory / learned / lists /
skill memory).

Before this fix every store's loader returned an EMPTY store on ANY read/parse
error and the next save wrote that back — silently wiping the whole corpus
while reporting success. Now: mutations REFUSE (never overwrite) and preserve a
backup; reads DEGRADE to empty without crashing.
"""
from __future__ import annotations

import json
import logging
import threading
from types import SimpleNamespace

import pytest

from src.json_store import StoreCorruptError
from src.tools.executor import ToolExecutor
from src.tools.handlers.state import StateTools

CORRUPT = "{ this is not valid json "


def _state_tools(tmp_path):
    """A real StateTools wired to a real ToolExecutor's strict memory loader."""
    ex = ToolExecutor(memory_path=str(tmp_path / "memory.json"))
    deps = SimpleNamespace(
        memory_path=lambda: ex._memory_path,
        memory_lock=lambda: ex._memory_lock,
        lists_lock=lambda: ex._lists_lock,
        load_all_memory=ex._load_all_memory,
        save_all_memory=ex._save_all_memory,
    )
    st = StateTools.__new__(StateTools)
    st._deps = deps
    st._load_all_memory = ex._load_all_memory
    st._save_all_memory = ex._save_all_memory
    return st, ex


class TestMemoryJson:
    def test_strict_load_raises_and_backs_up(self, tmp_path):
        p = tmp_path / "memory.json"
        p.write_text(CORRUPT)
        ex = ToolExecutor(memory_path=str(p))
        with pytest.raises(StoreCorruptError):
            ex._load_all_memory()
        assert p.read_text() == CORRUPT  # live file untouched
        assert list(tmp_path.glob("memory.json.corrupt-*"))  # backup preserved

    def test_read_path_degrades(self, tmp_path):
        p = tmp_path / "memory.json"
        p.write_text(CORRUPT)
        ex = ToolExecutor(memory_path=str(p))
        assert ex._load_memory_for_user("u1") == {}  # no crash, empty
        assert ex._load_memory() == {}

    async def test_save_refuses_and_does_not_wipe(self, tmp_path):
        p = tmp_path / "memory.json"
        p.write_text(CORRUPT)
        st, _ex = _state_tools(tmp_path)
        out = await st._handle_memory_manage(
            {"action": "save", "scope": "global", "key": "k", "value": "v"}, user_id="u1"
        )
        assert "corrupt" in out.lower()
        assert "Saved" not in out
        assert p.read_text() == CORRUPT  # NOT wiped

    async def test_top_level_wrong_shape_refuses(self, tmp_path):
        p = tmp_path / "memory.json"
        p.write_text('["a list, not an object"]')
        st, _ex = _state_tools(tmp_path)
        out = await st._handle_memory_manage(
            {"action": "save", "scope": "global", "key": "k", "value": "v"}, user_id="u1"
        )
        assert "corrupt" in out.lower()
        assert p.read_text() == '["a list, not an object"]'

    async def test_section_wrong_shape_refuses(self, tmp_path):
        p = tmp_path / "memory.json"
        p.write_text('{"global": ["not a dict"]}')
        st, _ex = _state_tools(tmp_path)
        out = await st._handle_memory_manage(
            {"action": "save", "scope": "global", "key": "k", "value": "v"}, user_id="u1"
        )
        assert "corrupt" in out.lower()

    async def test_missing_file_saves_normally(self, tmp_path):
        st, _ex = _state_tools(tmp_path)  # no memory.json yet
        out = await st._handle_memory_manage(
            {"action": "save", "scope": "global", "key": "k", "value": "v"}, user_id="u1"
        )
        assert "Saved" in out
        assert (tmp_path / "memory.json").exists()
        got = await st._handle_memory_manage({"action": "get", "key": "k"}, user_id="u1")
        assert "v" in got

    async def test_get_list_delete_actions_refuse_on_corrupt(self, tmp_path):
        st, _ex = _state_tools(tmp_path)
        (tmp_path / "memory.json").write_text("{bad json")
        for action in ("get", "list", "delete"):
            out = await st._handle_memory_manage(
                {"action": action, "key": "k"}, user_id="u1"
            )
            assert "corrupt" in out.lower()


class TestListsJson:
    async def test_list_mutation_refuses_on_corrupt(self, tmp_path):
        lp = tmp_path / "lists.json"
        lp.write_text(CORRUPT)
        st, _ex = _state_tools(tmp_path)
        out = await st._handle_manage_list(
            {"action": "add", "list_name": "groceries", "items": ["milk"]}, user_id="u1"
        )
        assert "corrupt" in out.lower()
        assert lp.read_text() == CORRUPT  # NOT wiped

    async def test_list_add_works_when_missing(self, tmp_path):
        st, _ex = _state_tools(tmp_path)
        out = await st._handle_manage_list(
            {"action": "add", "list_name": "groceries", "items": ["milk"]}, user_id="u1"
        )
        assert "corrupt" not in out.lower()
        assert (tmp_path / "lists.json").exists()

    def test_load_lists_returns_valid_data(self, tmp_path):
        st, _ex = _state_tools(tmp_path)
        (tmp_path / "lists.json").write_text('{"g": {"owner": "shared", "items": []}}')
        expected = {"g": {"owner": "shared", "items": []}}
        # Both the read and the write loader return the valid store unchanged
        # (no degrade, no migration).
        assert st._load_lists() == expected
        assert st._load_lists_for_write() == expected

    def test_load_lists_for_write_no_path(self, tmp_path):
        st, _ex = _state_tools(tmp_path)
        st._deps.memory_path = lambda: None  # no store path -> empty guard
        assert st._load_lists_for_write() == {}


class TestLearnedJson:
    def _reflector(self, tmp_path):
        from src.learning.reflector import ConversationReflector

        return ConversationReflector(learned_path=str(tmp_path / "learned.json"))

    def test_delete_refuses_no_wipe(self, tmp_path):
        p = tmp_path / "learned.json"
        p.write_text(CORRUPT)
        r = self._reflector(tmp_path)
        assert r.delete_entry("k") is False
        assert p.read_text() == CORRUPT
        assert list(tmp_path.glob("learned.json.corrupt-*"))

    def test_update_refuses_no_wipe(self, tmp_path):
        p = tmp_path / "learned.json"
        p.write_text(CORRUPT)
        r = self._reflector(tmp_path)
        assert r.update_entry("k", content="x") is None
        assert p.read_text() == CORRUPT

    def test_read_degrades(self, tmp_path):
        p = tmp_path / "learned.json"
        p.write_text(CORRUPT)
        r = self._reflector(tmp_path)
        assert r.get_all_entries() == []  # no crash

    async def test_reflection_merge_skips_on_corrupt_without_wipe(self, tmp_path):
        p = tmp_path / "learned.json"
        p.write_text(CORRUPT)
        before = p.read_bytes()
        r = self._reflector(tmp_path)
        r._enabled = True

        async def _text_fn(messages, system):
            return '[{"key":"k1","category":"operational","content":"a lesson","topic":"t"}]'

        r.set_text_fn(_text_fn)
        # The prompt-context read degrades to empty, but the merge uses the
        # strict loader and REFUSES — the corpus must not be overwritten.
        await r.reflect_on_operation("req", ["tool"], [{"tool": "x"}], "resp", is_error=False)
        assert p.read_bytes() == before

    async def test_session_reflection_skips_on_corrupt_without_wipe(self, tmp_path):
        from types import SimpleNamespace

        p = tmp_path / "learned.json"
        p.write_text(CORRUPT)
        before = p.read_bytes()
        r = self._reflector(tmp_path)
        r._enabled = True

        async def _text_fn(messages, system):
            return '[{"key":"k","category":"operational","content":"c","topic":"t"}]'

        r.set_text_fn(_text_fn)
        session = SimpleNamespace(
            messages=[
                SimpleNamespace(role="user", content="hi"),
                SimpleNamespace(role="assistant", content="hello there"),
                SimpleNamespace(role="user", content="bye"),
            ],
            summary="",
        )
        # _reflect refuses at its strict load (before merging) — no wipe.
        await r.reflect_on_session(session)
        assert p.read_bytes() == before

    def test_delete_works_on_valid_store(self, tmp_path):
        p = tmp_path / "learned.json"
        p.write_text(
            json.dumps(
                {
                    "version": 2,
                    "last_reflection": None,
                    "entries": [{"key": "k", "content": "c", "category": "operational"}],
                }
            )
        )
        r = self._reflector(tmp_path)
        assert r.delete_entry("k") is True


class TestSkillMemory:
    def _ctx(self, tmp_path):
        from src.tools.skill_context import SkillContext

        sc = SkillContext.__new__(SkillContext)
        sc._memory_path = tmp_path / "skill_mem.json"
        sc._skill_memory_lock = threading.Lock()
        sc._log = logging.getLogger("test.skill")
        return sc

    def test_remember_refuses_no_wipe(self, tmp_path):
        p = tmp_path / "skill_mem.json"
        p.write_text(CORRUPT)
        sc = self._ctx(tmp_path)
        sc.remember("k", "v")  # refuses (void), does not raise
        assert p.read_text() == CORRUPT  # NOT wiped
        assert list(tmp_path.glob("skill_mem.json.corrupt-*"))

    def test_recall_degrades(self, tmp_path):
        (tmp_path / "skill_mem.json").write_text(CORRUPT)
        sc = self._ctx(tmp_path)
        assert sc.recall("k") is None  # no crash

    def test_remember_works_when_missing(self, tmp_path):
        sc = self._ctx(tmp_path)
        sc.remember("k", "v")
        assert sc.recall("k") == "v"
