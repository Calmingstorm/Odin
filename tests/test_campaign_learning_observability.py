import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from src.learning.reflector import ConversationReflector


@pytest.mark.asyncio
async def test_reflections_keep_colliding_keys_and_supersession_within_owner(tmp_path):
    reflector = ConversationReflector(str(tmp_path / "learned.json"))
    completion = AsyncMock()
    reflector.set_text_fn(completion)
    for owner, content in [("alice", "Alice uses Vim"), ("bob", "Bob uses Emacs")]:
        completion.return_value = json.dumps([
            {"key": "preferred_editor", "category": "preference", "content": content},
            {"key": "old_editor", "category": "preference", "content": content},
        ])
        await reflector.reflect_on_operation("editor", ["tool"], [], "done", user_id=owner)
    entries = reflector.get_all_entries()
    assert len(entries) == 4
    assert "Bob uses Emacs" not in reflector.get_prompt_section(user_id="alice")
    reflector._apply_use_stamps(entries)
    assert all(e.get("last_used_at") for e in entries if e["user_id"] == "alice")
    assert not any(e.get("last_used_at") for e in entries if e["user_id"] == "bob")
    completion.return_value = json.dumps([
        {"key": "preferred_editor", "category": "preference", "content": "Bob uses Nano",
         "supersedes": ["old_editor"]},
    ])
    await reflector.reflect_on_operation("editor", ["tool"], [], "done", user_id="bob")
    assert "Alice uses Vim" not in completion.await_args.args[0][0]["content"]
    entries = reflector.get_all_entries()
    assert len(entries) == 3
    assert any(e["key"] == "old_editor" and e["user_id"] == "alice" for e in entries)
    assert "Alice uses Vim" in reflector.get_prompt_section(user_id="alice")
    assert "Bob uses Nano" in reflector.get_prompt_section(user_id="bob")


@pytest.mark.asyncio
async def test_personal_collision_cannot_replace_or_supersede_shared_lesson(tmp_path):
    path = tmp_path / "learned.json"
    originals = [
        {"key": key, "category": "preference", "content": "operator shared"}
        for key in ("editor", "old_editor")
    ]
    path.write_text(json.dumps({"version": 2, "entries": originals}))
    reflector = ConversationReflector(str(path))
    reflector.set_text_fn(AsyncMock(return_value=json.dumps([
        {"key": "editor", "category": "preference", "content": "personal",
         "supersedes": ["old_editor"]},
    ])))
    await reflector.reflect_on_operation("editor", ["tool"], [], "done", user_id="bob")
    assert len(reflector.get_all_entries()) == 3
    assert "personal" not in reflector.get_prompt_section(user_id="alice")


@pytest.mark.asyncio
@pytest.mark.parametrize("omit_owner", [False, True])
async def test_consolidation_keeps_colliding_owner_metadata(tmp_path, omit_owner):
    reflector = ConversationReflector(str(tmp_path / "learned.json"))
    reflector._consolidation_target = 1
    old = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    originals = [
        {"key": "editor", "category": "preference", "content": owner,
         "user_id": owner, "created_at": old, "source": {"owner": owner}}
        for owner in ("alice", "bob")
    ]
    returned = [{k: v for k, v in e.items() if k != "source"} for e in originals]
    if omit_owner:
        returned[0].pop("user_id")
    reflector.set_consolidation_fn(AsyncMock(return_value=json.dumps(returned)))
    result = await reflector._consolidate(originals)
    assert len(result) == 2
    assert all(e["source"]["owner"] == e["user_id"] for e in result)
    assert all(e["created_at"] == old for e in result)


@pytest.mark.asyncio
async def test_updated_old_used_lesson_survives_real_consolidation(tmp_path):
    path = tmp_path / "learned.json"
    old = (datetime.now(UTC) - timedelta(days=400)).isoformat()
    path.write_text(json.dumps({"version": 2, "entries": [
        {"key": "lesson", "category": "operational", "content": "old",
         "created_at": old, "updated_at": old, "last_used_at": old},
    ]}))
    reflector = ConversationReflector(str(path))
    assert await reflector.update_entry_async("lesson", "freshly edited")
    result = await reflector._consolidate(reflector.get_all_entries())
    assert [e["content"] for e in result] == ["freshly edited"]


@pytest.mark.parametrize("fresh_field", ["updated_at", "last_used_at", "created_at"])
def test_expiry_uses_newest_valid_activity(tmp_path, fresh_field):
    reflector = ConversationReflector(str(tmp_path / "learned.json"))
    old = (datetime.now(UTC) - timedelta(days=400)).isoformat()
    stale = {"key": "stale", "category": "fact", "content": "stale",
             "created_at": old, "updated_at": old, "last_used_at": old}
    recent = dict(stale, key="recent")
    recent[fresh_field] = datetime.now(UTC).isoformat()
    # In-memory defense: an invalid old candidate must not obscure good evidence.
    if fresh_field != "last_used_at":
        recent["last_used_at"] = "invalid"
    assert reflector._expire_entries([stale, recent]) == [recent]
