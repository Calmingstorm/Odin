"""Coverage for src/learning/reflector.py reflection paths (RFC-006 P12, safe).

Drives reflect_on_operation / session / compacted and the JSON parse/merge with a
FAKE text_fn (the LLM callback is injected via set_text_fn — no real model call)
and a real tmp learned.json. SAFE: no network, no LLM.
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.learning.reflector import ConversationReflector


def _reflector(tmp_path, text_return="[]", enabled=True, wire=True):
    r = ConversationReflector(str(tmp_path / "learned.json"), enabled=enabled)
    if wire:
        r.set_text_fn(AsyncMock(return_value=text_return))
    return r


def _entries(path):
    return json.loads(path.read_text()).get("entries", []) if path.exists() else []


class TestParseEntries:
    def test_valid_array(self):
        raw = json.dumps([{"key": "k1", "category": "operational", "content": "lesson",
                           "topic": "proj", "tags": ["a", "", "b"], "user_id": "u",
                           "confidence": "high", "supersedes": ["old"]}])
        out = ConversationReflector._parse_entries(raw)
        assert out[0]["key"] == "k1" and out[0]["tags"] == ["a", "b"]
        assert out[0]["user_id"] == "u" and out[0]["confidence"] == "high"

    def test_markdown_fenced(self):
        raw = "```json\n" + json.dumps([{"key": "k", "category": "fact",
                                        "content": "c"}]) + "\n```"
        assert ConversationReflector._parse_entries(raw)[0]["key"] == "k"

    def test_embedded_array(self):
        raw = 'Here you go: [{"key":"k","category":"correction","content":"c"}] done'
        assert len(ConversationReflector._parse_entries(raw)) == 1

    def test_invalid_and_filtered(self):
        assert ConversationReflector._parse_entries("not json at all") == []
        assert ConversationReflector._parse_entries('{"not": "a list"}') == []
        # bad category + missing fields filtered out
        raw = json.dumps([{"key": "k", "category": "bogus", "content": "c"},
                          {"key": "k2", "content": "no category"}])
        assert ConversationReflector._parse_entries(raw) == []


class TestReflectOnOperation:
    async def test_disabled_and_no_text_fn(self, tmp_path):
        r = _reflector(tmp_path, enabled=False)
        await r.reflect_on_operation("req", ["grep"], [], "resp")
        assert not (tmp_path / "learned.json").exists()  # disabled → no write
        r2 = _reflector(tmp_path, wire=False)  # enabled but no text_fn
        await r2.reflect_on_operation("req", ["grep"], [], "resp")

    async def test_no_tools_returns(self, tmp_path):
        r = _reflector(tmp_path)
        await r.reflect_on_operation("req", [], [], "resp")
        r._text_fn.assert_not_awaited()

    async def test_success_persists(self, tmp_path):
        entry = [{"key": "lesson1", "category": "operational", "content": "learned a thing"}]
        r = _reflector(tmp_path, text_return=json.dumps(entry))
        await r.reflect_on_operation(
            "deploy the thing", ["run_command"],
            [{"tool": "run_command", "input": {"cmd": "x"}, "result": "ok", "error": False}],
            "done", user_id="u1")
        saved = _entries(tmp_path / "learned.json")
        assert any(e["key"] == "lesson1" for e in saved)

    async def test_preference_gets_user_id(self, tmp_path):
        entry = [{"key": "pref1", "category": "preference", "content": "likes brief replies"}]
        r = _reflector(tmp_path, text_return=json.dumps(entry))
        await r.reflect_on_operation("req", ["t"], [], "resp", user_id="alice")
        saved = _entries(tmp_path / "learned.json")
        assert saved[0].get("user_id") == "alice"

    async def test_text_fn_exception_swallowed(self, tmp_path):
        r = _reflector(tmp_path)
        r.set_text_fn(AsyncMock(side_effect=RuntimeError("llm down")))
        await r.reflect_on_operation("req", ["t"], [], "resp")  # logged, no raise

    async def test_empty_parse_returns(self, tmp_path):
        r = _reflector(tmp_path, text_return="[]")
        await r.reflect_on_operation("req", ["t"], [], "resp")
        assert _entries(tmp_path / "learned.json") == []


class TestReflectOnSessionCompacted:
    def _msg(self, role="user", content="hi", uid=None):
        return SimpleNamespace(role=role, content=content, user_id=uid)

    async def test_session_too_short(self, tmp_path):
        r = _reflector(tmp_path)
        session = SimpleNamespace(messages=[self._msg(), self._msg()], summary="")
        await r.reflect_on_session(session)
        r._text_fn.assert_not_awaited()

    async def test_session_reflects(self, tmp_path):
        r = _reflector(tmp_path, text_return="[]")
        msgs = [self._msg(content=f"m{i}", uid="u") for i in range(4)]
        session = SimpleNamespace(messages=msgs, summary="prior context")
        await r.reflect_on_session(session, user_ids=["u"])
        r._text_fn.assert_awaited()

    async def test_compacted_too_short(self, tmp_path):
        r = _reflector(tmp_path)
        await r.reflect_on_compacted([self._msg()] * 3, "sum")
        r._text_fn.assert_not_awaited()

    async def test_compacted_reflects(self, tmp_path):
        r = _reflector(tmp_path, text_return="[]")
        await r.reflect_on_compacted([self._msg(content=f"m{i}") for i in range(6)], "sum",
                                     user_id="u")
        r._text_fn.assert_awaited()

    def test_format_conversation(self, tmp_path):
        r = _reflector(tmp_path)
        out = r._format_conversation(
            [self._msg("user", "hello", uid="u1"), self._msg("assistant", "hi")],
            summary="earlier stuff")
        assert "Summary of earlier" in out and "user_id=u1" in out


def _seed(tmp_path, entries, budget=4000):
    p = tmp_path / "learned.json"
    p.write_text(json.dumps({"version": 2, "entries": entries}))
    return ConversationReflector(str(p), injection_token_budget=budget)


class TestGetPromptSection:
    def test_empty(self, tmp_path):
        assert _seed(tmp_path, [])._read_for_injection() is not None
        assert _seed(tmp_path, []).get_prompt_section() == ""

    def test_user_scoping(self, tmp_path):
        entries = [
            {"key": "g", "category": "operational", "content": "global lesson"},
            {"key": "u1", "category": "preference", "content": "alice pref", "user_id": "alice"},
            {"key": "u2", "category": "preference", "content": "bob pref", "user_id": "bob"},
        ]
        r = _seed(tmp_path, entries)
        out = r.get_prompt_section(user_id="alice")
        assert "global lesson" in out and "alice pref" in out and "bob pref" not in out

    def test_only_other_users(self, tmp_path):
        r = _seed(tmp_path, [{"key": "x", "category": "fact", "content": "c", "user_id": "bob"}])
        assert r.get_prompt_section(user_id="alice") == ""

    def test_include_all_when_under_budget(self, tmp_path):
        r = _seed(tmp_path, [{"key": "k", "category": "operational", "content": "small"}])
        out = r.get_prompt_section(query="anything")
        assert "Learned Context" in out and "small" in out

    def test_gated_when_over_budget(self, tmp_path):
        entries = [
            {"key": "c1", "category": "correction", "content": "a correction " * 3},
            {"key": "p1", "category": "preference", "content": "a preference " * 3},
            {"key": "o1", "category": "operational", "content": "database timeout tuning " * 3},
            {"key": "f1", "category": "fact", "content": "unrelated trivia " * 3},
        ]
        r = _seed(tmp_path, entries, budget=5)  # tiny budget → gated selection
        trace = SimpleNamespace(key=lambda k: k, learned=lambda **kw: None)
        out = r.get_prompt_section(query="database timeout", trace=trace)
        assert "correction" in out  # corrections are pinned

