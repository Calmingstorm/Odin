"""Learned-store integrity and policy behavior using real temporary stores."""
import json

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
