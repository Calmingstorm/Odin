"""Tests for the learned-context overhaul (memory systems PR).

Invariants under test:
- stored content is NEVER silently truncated — oversized text is clipped
  at a sentence boundary, explicitly marked, and flagged damaged
- the v1→v2 migration detects legacy chop damage and is idempotent
- consolidation passes damaged entries through unmerged
- category-aware expiry: corrections/preferences never auto-expire
- supersession removes superseded keys
- injection: include-all-when-fits, pinned corrections/preferences when
  gated, user-scope isolation, last_used_at stamping via locked writes
"""
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest

from src.learning.reflector import (
    _HARD_CONTENT_CHARS,
    _LEARNED_SCHEMA_VERSION,
    _TRUNCATION_MARKER,
    ConversationReflector,
    _clip_content,
    _looks_chopped,
)


def _entry(key, category="operational", content="a lesson.", **kw):
    e = {"key": key, "category": category, "content": content}
    e.update(kw)
    return e


def _write_store(path, entries, version=_LEARNED_SCHEMA_VERSION):
    path.write_text(json.dumps({
        "version": version, "last_reflection": None, "entries": entries,
    }))


class TestClipContent:
    def test_short_content_untouched(self):
        e = _entry("k", content="short lesson.")
        assert _clip_content(e)["content"] == "short lesson."
        assert "damaged" not in e

    def test_oversized_clipped_with_marker_and_flag(self):
        text = ("A useful sentence. " * 100).strip()  # ~1900 chars
        e = _entry("k", content=text)
        _clip_content(e)
        assert len(e["content"]) <= _HARD_CONTENT_CHARS
        assert e["content"].endswith(_TRUNCATION_MARKER)
        assert e["damaged"] is True
        # Clip landed on a sentence boundary, not mid-word
        body = e["content"][: -len(_TRUNCATION_MARKER)]
        assert body.rstrip().endswith(".")


class TestLooksChopped:
    def test_long_mid_sentence_is_chopped(self):
        assert _looks_chopped("x" * 790 + " For job-search r")

    def test_long_complete_sentence_is_not(self):
        assert not _looks_chopped("x" * 790 + " This ends properly.")

    def test_short_content_is_not(self):
        assert not _looks_chopped("short fragment without punct")


class TestMigration:
    def test_v1_chopped_entries_flagged(self, tmp_path):
        path = tmp_path / "learned.json"
        chopped = "y" * 795 + " and then it just"
        clean = "z" * 700 + " but this one ends fine."
        _write_store(path, [
            _entry("damaged_one", content=chopped),
            _entry("clean_one", content=clean),
        ], version=1)

        r = ConversationReflector(str(path))
        data = r._load()
        assert data["version"] == _LEARNED_SCHEMA_VERSION
        by_key = {e["key"]: e for e in data["entries"]}
        assert by_key["damaged_one"]["damaged"] is True
        assert by_key["damaged_one"]["content"].endswith(_TRUNCATION_MARKER)
        # Damage marking appends, never removes surviving text
        assert chopped in by_key["damaged_one"]["content"]
        assert "damaged" not in by_key["clean_one"]

    def test_migration_backfills_confidence_and_source(self, tmp_path):
        path = tmp_path / "learned.json"
        _write_store(path, [
            _entry("c", category="correction"),
            _entry("o", category="operational"),
        ], version=1)
        data = ConversationReflector(str(path))._load()
        by_key = {e["key"]: e for e in data["entries"]}
        assert by_key["c"]["confidence"] == "high"
        assert by_key["o"]["confidence"] == "medium"
        assert by_key["o"]["source"] == {"created_by": "legacy"}

    def test_migration_idempotent(self, tmp_path):
        path = tmp_path / "learned.json"
        _write_store(path, [_entry("k", content="v" * 800)], version=1)
        r = ConversationReflector(str(path))
        r._load()
        first = path.read_text()
        r._load()
        assert path.read_text() == first


class TestMergeEntries:
    def test_supersession_removes_old_keys(self):
        existing = [_entry("old_rule"), _entry("unrelated")]
        new = [_entry("new_rule", supersedes=["old_rule"])]
        merged = ConversationReflector._merge_entries(existing, new)
        keys = {e["key"] for e in merged}
        assert keys == {"unrelated", "new_rule"}

    def test_clean_update_repairs_damaged_entry(self):
        existing = [_entry("k", content="old chopped", damaged=True)]
        new = [_entry("k", content="fresh complete lesson.")]
        merged = ConversationReflector._merge_entries(existing, new)
        assert merged[0]["content"] == "fresh complete lesson."
        assert "damaged" not in merged[0]

    def test_oversized_new_entry_never_silently_chopped(self):
        new = [_entry("big", content="A point. " * 200)]
        merged = ConversationReflector._merge_entries([], new)
        assert merged[0]["content"].endswith(_TRUNCATION_MARKER)
        assert merged[0]["damaged"] is True


class TestCategoryExpiry:
    def _aged(self, key, category, days):
        ts = (datetime.now(UTC) - timedelta(days=days)).isoformat(timespec="seconds")
        return _entry(key, category=category, created_at=ts, updated_at=ts)

    def test_corrections_and_preferences_never_expire(self, tmp_path):
        r = ConversationReflector(str(tmp_path / "l.json"))
        entries = [
            self._aged("c", "correction", 400),
            self._aged("p", "preference", 400),
        ]
        assert len(r._expire_entries(entries)) == 2

    def test_stale_operational_expires(self, tmp_path):
        r = ConversationReflector(str(tmp_path / "l.json"))
        entries = [self._aged("o", "operational", 200)]
        assert r._expire_entries(entries) == []

    def test_recently_used_operational_survives(self, tmp_path):
        r = ConversationReflector(str(tmp_path / "l.json"))
        e = self._aged("o", "operational", 200)
        e["last_used_at"] = datetime.now(UTC).isoformat(timespec="seconds")
        assert len(r._expire_entries([e])) == 1


class TestConsolidationDamagePassThrough:
    @pytest.mark.asyncio
    async def test_damaged_entries_bypass_the_llm(self, tmp_path):
        r = ConversationReflector(str(tmp_path / "l.json"), consolidation_target=2)
        seen_prompts = []

        async def fake_text_fn(messages, system):
            seen_prompts.append(messages[0]["content"])
            return json.dumps([_entry("merged", content="merged lesson.")])

        r.set_text_fn(fake_text_fn)
        now = datetime.now(UTC).isoformat(timespec="seconds")
        entries = [
            _entry("a", content="lesson a.", created_at=now, updated_at=now),
            _entry("b", content="lesson b.", created_at=now, updated_at=now),
            _entry("hurt", content="chopped tex" + _TRUNCATION_MARKER,
                   damaged=True, created_at=now, updated_at=now),
        ]
        result = await r._consolidate(entries)
        keys = {e["key"] for e in result}
        assert "hurt" in keys  # passed through unmerged
        assert "hurt" not in seen_prompts[0]  # never sent to the LLM

    @pytest.mark.asyncio
    async def test_llm_failure_falls_back_without_data_loss(self, tmp_path):
        r = ConversationReflector(str(tmp_path / "l.json"), consolidation_target=5)

        async def broken(messages, system):
            raise RuntimeError("api down")

        r.set_text_fn(broken)
        now = datetime.now(UTC).isoformat(timespec="seconds")
        entries = [
            _entry(f"k{i}", content=f"lesson {i}.", created_at=now, updated_at=now)
            for i in range(3)
        ]
        result = await r._consolidate(entries)
        assert len(result) == 3


class TestConsolidationSkipAndCompact:
    @pytest.mark.asyncio
    async def test_skip_when_candidates_within_target(self, tmp_path):
        """When candidates <= target, _text_fn must NOT be called."""
        r = ConversationReflector(str(tmp_path / "l.json"),
                                  max_entries=10, consolidation_target=8)
        call_count = 0

        async def spy_text_fn(messages, system):
            nonlocal call_count
            call_count += 1
            return "[]"

        r.set_text_fn(spy_text_fn)
        now = datetime.now(UTC).isoformat(timespec="seconds")
        entries = [
            _entry(f"k{i}", content=f"lesson {i}.", created_at=now, updated_at=now)
            for i in range(5)
        ]
        # 5 candidates, target 8 → skip
        result = await r._consolidate(entries)
        assert call_count == 0
        assert len(result) == 5
        assert {e["key"] for e in result} == {f"k{i}" for i in range(5)}

    @pytest.mark.asyncio
    async def test_skip_preserves_damaged(self, tmp_path):
        """Skip path must preserve both candidates and damaged entries."""
        r = ConversationReflector(str(tmp_path / "l.json"),
                                  max_entries=10, consolidation_target=8)
        r.set_text_fn(None)
        now = datetime.now(UTC).isoformat(timespec="seconds")
        entries = [
            _entry("a", content="lesson a.", created_at=now, updated_at=now),
            _entry("b", content="lesson b.", created_at=now, updated_at=now),
            _entry("hurt", content="chopped" + _TRUNCATION_MARKER,
                   damaged=True, created_at=now, updated_at=now),
        ]
        # 2 candidates, target 7 (8-1 damaged) → skip
        result = await r._consolidate(entries)
        keys = {e["key"] for e in result}
        assert keys == {"a", "b", "hurt"}

    def test_compact_for_prompt_strips_metadata(self):
        entries = [
            _entry("k1", content="lesson one.",
                   topic="infra", tags=["ssh"], confidence="high",
                   user_id="42",
                   created_at="2026-01-01T00:00:00", updated_at="2026-06-01T00:00:00",
                   last_used_at="2026-06-20T00:00:00",
                   source={"created_by": "reflection"}),
        ]
        compact_json = ConversationReflector._compact_for_prompt(entries)
        compact = json.loads(compact_json)
        assert len(compact) == 1
        item = compact[0]
        # Preserved
        assert item["key"] == "k1"
        assert item["category"] == "operational"
        assert item["content"] == "lesson one."
        assert item["topic"] == "infra"
        assert item["tags"] == ["ssh"]
        assert item["confidence"] == "high"
        assert item["user_id"] == "42"
        # Stripped
        assert "created_at" not in item
        assert "updated_at" not in item
        assert "last_used_at" not in item
        assert "source" not in item

    def test_compact_for_prompt_omits_absent_optional_fields(self):
        entries = [_entry("bare", content="minimal.")]
        compact = json.loads(ConversationReflector._compact_for_prompt(entries))
        item = compact[0]
        assert "topic" not in item
        assert "tags" not in item
        assert "user_id" not in item


class TestInjection:
    def _store(self, tmp_path, entries):
        path = tmp_path / "learned.json"
        _write_store(path, entries)
        return path

    def test_include_all_when_corpus_fits(self, tmp_path):
        path = self._store(tmp_path, [
            _entry(f"k{i}", content=f"lesson number {i}.") for i in range(10)
        ])
        r = ConversationReflector(str(path), injection_token_budget=4000)
        section = r.get_prompt_section(query="completely unrelated query text")
        assert section.count("- [") == 10

    def test_gating_pins_corrections_and_preferences(self, tmp_path):
        entries = [
            _entry("corr", category="correction", content="never do the bad thing."),
            _entry("pref", category="preference", content="user likes terse output.",
                   user_id="42"),
        ]
        entries += [
            _entry(f"op{i}", content=f"operational detail about {topic}.")
            for i, topic in enumerate(
                ["minecraft", "genealogy", "eve", "wow", "ffxi", "nginx",
                 "dns", "grafana", "loki", "docker", "incus", "pihole",
                 "ansible", "tailscale", "plex", "gitea"]
            )
        ]
        path = self._store(tmp_path, entries)
        # Budget forces gating (whole corpus doesn't fit) but is large enough
        # that the gated selection — pinned corrections/preferences plus the
        # top-K relevant operational — fits without being trimmed.
        r = ConversationReflector(str(path), injection_token_budget=185)
        section = r.get_prompt_section(user_id="42", query="fix the nginx config")
        assert "never do the bad thing." in section
        assert "user likes terse output." in section
        assert "operational detail about nginx." in section

    def test_other_users_entries_never_leak(self, tmp_path):
        path = self._store(tmp_path, [
            _entry("mine", category="preference", content="my pref.", user_id="42"),
            _entry("theirs", category="preference", content="their secret pref.", user_id="99"),
            _entry("global", content="global lesson."),
        ])
        r = ConversationReflector(str(path))
        section = r.get_prompt_section(user_id="42", query="anything")
        assert "my pref." in section
        assert "their secret pref." not in section
        assert "global lesson." in section

    def test_no_query_includes_all_in_scope_when_within_budget(self, tmp_path):
        path = self._store(tmp_path, [
            _entry(f"k{i}", content="x" * 600 + ".") for i in range(40)
        ])
        # Budget large enough to hold the whole corpus → include all.
        r = ConversationReflector(str(path), injection_token_budget=10_000)
        section = r.get_prompt_section(query=None)
        assert section.count("- [") == 40

    def test_no_query_still_enforces_budget(self, tmp_path):
        # The old bug: a query-less caller injected the whole corpus regardless
        # of the budget. Now the budget is a hard cap even without a query.
        path = self._store(tmp_path, [
            _entry(f"k{i}", content="x" * 600 + ".") for i in range(40)
        ])
        r = ConversationReflector(str(path), injection_token_budget=500)
        section = r.get_prompt_section(query=None)
        n = section.count("- [")
        assert 0 < n < 40  # trimmed to fit — not all, not nothing

    @pytest.mark.asyncio
    async def test_use_stamps_persist_via_locked_write(self, tmp_path):
        path = self._store(tmp_path, [_entry("used_one", content="a lesson.")])
        r = ConversationReflector(str(path))
        r.get_prompt_section(query="a lesson")
        assert r._use_stamps  # recorded in memory

        async def fake_text_fn(messages, system):
            return json.dumps([_entry("new_one", content="another lesson.")])

        r.set_text_fn(fake_text_fn)
        await r.reflect_on_operation(
            user_request="do something substantial",
            tools_used=["run_command"] * 6,
            tool_details=[{"tool": "run_command"}],
            final_response="done",
        )
        data = json.loads(path.read_text())
        by_key = {e["key"]: e for e in data["entries"]}
        assert "last_used_at" in by_key["used_one"]
        assert not r._use_stamps

    def test_mtime_cache_invalidation(self, tmp_path):
        path = self._store(tmp_path, [_entry("k1", content="first.")])
        r = ConversationReflector(str(path))
        assert "first." in r.get_prompt_section()
        # External write (e.g. WebUI edit) must be picked up via mtime
        import os
        import time as _time
        _write_store(path, [_entry("k2", content="second.")])
        os.utime(path, (_time.time() + 5, _time.time() + 5))
        section = r.get_prompt_section()
        assert "second." in section and "first." not in section


class TestTopicChangeRemoved:
    def test_session_manager_has_no_detector(self):
        from src.sessions.manager import SessionManager
        assert not hasattr(SessionManager, "detect_topic_change")

    def test_no_topic_change_constants(self):
        import src.sessions.manager as m
        assert not any(name.startswith("TOPIC_CHANGE") for name in dir(m))
