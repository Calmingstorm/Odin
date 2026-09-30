"""Learned-store integrity and policy behavior using real temporary stores."""
import asyncio
import copy
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from src.learning.reflector import (
    _HARD_CONTENT_CHARS,
    _TRUNCATION_MARKER,
    ConversationReflector,
)


def test_live_learning_policy_provider_failure_disables_automatic_injection(tmp_path, caplog):
    enabled = [True]

    def provider():
        if enabled[0] is None:
            raise RuntimeError("fixture policy source unavailable")
        return enabled[0]

    path = tmp_path / "learned.json"
    reflector = ConversationReflector(str(path), enabled_provider=provider)
    reflector._save({"version": 2, "entries": [
        {"key": "policy", "category": "operational", "content": "A scoped fixture lesson."},
    ]})
    token = reflector._policy_token()
    assert "scoped fixture lesson" in reflector.get_prompt_section()
    enabled[0] = None
    assert not reflector.is_enabled()
    assert reflector.get_prompt_section() == ""
    assert "enabled-state provider failed" in caplog.text
    enabled[0] = True
    assert reflector.is_enabled()
    assert not reflector._policy_allows(token)
    assert reflector.get_all_entries()[0]["key"] == "policy"


def test_long_replacement_retains_damage_flag_word_boundary_and_other_owner(tmp_path):
    path = tmp_path / "learned.json"
    reflector = ConversationReflector(str(path))
    existing = [
        {"key": "same", "category": "operational", "content": "Old", "user_id": "alice"},
        {"key": "same", "category": "operational", "content": "Bob", "user_id": "bob"},
    ]
    long_content = "word " * (_HARD_CONTENT_CHARS // 5 + 40)
    merged = reflector._merge_entries(existing, [{
        "key": "same", "category": "operational", "content": long_content, "user_id": "alice",
    }])
    reflector._save({"version": 2, "entries": merged})
    by_owner = {entry["user_id"]: entry for entry in reflector.get_all_entries()}
    assert by_owner["alice"]["damaged"] is True
    clipped = by_owner["alice"]["content"]
    assert len(clipped) <= _HARD_CONTENT_CHARS
    assert clipped.endswith("word" + _TRUNCATION_MARKER)
    assert by_owner["bob"]["content"] == "Bob"
    assert "damaged" not in by_owner["bob"]


def test_corrupt_nonlist_entries_fail_closed_with_original_backup(tmp_path):
    path = tmp_path / "learned.json"
    raw = json.dumps({"version": 2, "entries": {"not": "a corpus"}})
    path.write_text(raw)
    reflector = ConversationReflector(str(path))
    assert reflector.get_all_entries() == []
    assert reflector.get_prompt_section() == ""
    assert reflector.update_entry("not", content="replacement") is None
    assert path.read_text() == raw
    assert any(p.read_text() == raw for p in tmp_path.glob("learned.json.corrupt*"))


@pytest.mark.parametrize("backend", ["missing", "empty", "error"])
async def test_consolidation_failure_pins_personal_rules_over_recent_trivia(tmp_path, backend):
    reflector = ConversationReflector(str(tmp_path / "learned.json"), consolidation_target=1)
    entries = [
        {"key": "rule", "category": "correction", "content": "Keep this explicit rule.",
         "user_id": "alice", "updated_at": "2020-01-01T00:00:00+00:00"},
        {"key": "trivia", "category": "operational", "content": "Recent fixture fact.",
         "updated_at": datetime.now(UTC).isoformat()},
    ]
    calls = []

    async def completion(messages, system):
        calls.append((messages, system))
        if backend == "error":
            raise RuntimeError("fixture backend unavailable")
        return "[]"

    if backend != "missing":
        reflector.set_consolidation_fn(completion)
    result = await reflector._consolidate(entries)
    assert result == [entries[0]]
    assert len(calls) == (0 if backend == "missing" else 1)
    reflector._save({"version": 2, "entries": result})
    assert reflector.get_all_entries()[0]["user_id"] == "alice"


async def test_disable_during_damage_repair_preserves_all_original_entries(tmp_path):
    reflector = ConversationReflector(str(tmp_path / "learned.json"), consolidation_target=1)
    entries = [{"key": f"damage_{i}", "category": "correction", "content": "Original lesson",
                "damaged": True} for i in range(3)]
    before = copy.deepcopy(entries)
    entered, release = asyncio.Event(), asyncio.Event()
    calls = []

    async def repair(messages, system):
        calls.append((messages, system))
        entered.set()
        await release.wait()
        return "A repaired lesson that must not be adopted."

    reflector.set_consolidation_fn(repair)
    task = asyncio.create_task(reflector._consolidate(entries))
    await entered.wait()
    reflector.observe_enabled_state(False)
    release.set()
    assert await task == before
    assert entries == before
    assert len(calls) == 1
    assert not reflector._path.exists()


async def test_expired_only_consolidation_does_not_call_backend(tmp_path):
    reflector = ConversationReflector(str(tmp_path / "learned.json"))
    calls = []

    async def completion(messages, system):
        calls.append(messages)
        return "[]"

    reflector.set_consolidation_fn(completion)
    old = (datetime.now(UTC) - timedelta(days=181)).isoformat()
    assert await reflector._consolidate([
        {"key": "old", "category": "fact", "content": "Stale lesson.", "updated_at": old},
    ]) == []
    assert calls == []


@pytest.mark.parametrize("backend", ["missing", "error"])
async def test_session_reflection_backend_failure_never_changes_learned_store(
    tmp_path, caplog, backend
):
    path = tmp_path / "learned.json"
    reflector = ConversationReflector(str(path))
    reflector._save({"version": 2, "entries": [
        {"key": "existing", "category": "operational", "content": "Keep this fixture lesson."},
    ]})
    before = path.read_bytes()
    calls = []

    async def completion(messages, system):
        calls.append(messages)
        raise RuntimeError("fixture backend unavailable")

    if backend == "error":
        reflector.set_text_fn(completion)
    session = SimpleNamespace(messages=[
        SimpleNamespace(role="user", content=f"Fixture message {i}", user_id="alice")
        for i in range(5)
    ], summary="")
    await reflector.reflect_on_session(session, user_id="alice")
    assert path.read_bytes() == before
    assert len(calls) == (1 if backend == "error" else 0)
    assert ("Reflection API call failed" if backend == "error"
            else "No text completion backend configured") in caplog.text


async def test_operation_over_capacity_consolidates_with_real_backend_and_persists(tmp_path):
    path = tmp_path / "learned.json"
    reflector = ConversationReflector(str(path), max_entries=1, consolidation_target=1)
    reflector._save({"version": 2, "entries": [
        {"key": "first", "category": "operational", "content": "Old description."},
    ]})
    calls = []

    async def reflection(messages, system):
        calls.append("reflect")
        return json.dumps([
            {"key": "second", "category": "operational", "content": "Updated description."},
        ])

    async def consolidate(messages, system):
        calls.append("consolidate")
        assert "Old description" in messages[0]["content"]
        assert "Updated description" in messages[0]["content"]
        return json.dumps([
            {"key": "second", "category": "operational", "content": "Updated description."},
        ])

    reflector.set_text_fn(reflection)
    reflector.set_consolidation_fn(consolidate)
    await reflector.reflect_on_operation("fixture", ["run_command"], [], "fixture result")
    assert calls == ["reflect", "consolidate"]
    saved = reflector.get_all_entries()
    assert len(saved) == 1
    assert saved[0]["key"] == "second"
    assert saved[0]["source"] == {"created_by": "operation"}
    assert saved[0]["created_at"]
    assert json.loads(path.read_text())["last_reflection"]
