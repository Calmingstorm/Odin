import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.learning.reflector import ConversationReflector


@pytest.mark.asyncio
@pytest.mark.parametrize("category", ["preference", "correction"])
@pytest.mark.parametrize("supplied", ["missing", None, "outsider", "known"])
@pytest.mark.parametrize("surface", ["session", "operation", "compacted"])
async def test_personal_attribution_through_production_reflection(
    tmp_path, category, supplied, surface,
):
    entry = {"key": "personal", "category": category, "content": "personal lesson marker"}
    if supplied != "missing":
        entry["user_id"] = supplied
    path = tmp_path / "learned.json"
    original = {"key": "operator_global", "category": "fact", "content": "operator global marker",
                "source": {"created_by": "operator"}}
    path.write_text(json.dumps({"version": 2, "entries": [original]}))
    reflector = ConversationReflector(str(path))
    reflector.set_text_fn(AsyncMock(return_value=json.dumps([entry])))
    messages = [SimpleNamespace(role="user", content="message", user_id="known")] * 6
    if surface == "operation":
        await reflector.reflect_on_operation("request", ["tool"], [], "response", user_id="known")
    elif surface == "session":
        await reflector.reflect_on_session(SimpleNamespace(messages=messages, summary=""),
                                           user_ids=["known", "other"])
    else:
        await reflector.reflect_on_compacted(messages, "", user_ids=["known", "other"])
    entries = json.loads(path.read_text())["entries"]
    accepted = supplied == "known" or (surface == "operation" and supplied in ("missing", None))
    if surface == "compacted" and category == "preference":
        accepted = False  # healthy compacted reflection keeps corrections/operations only
    assert any(e["key"] == "personal" for e in entries) == accepted
    if accepted:
        assert next(e for e in entries if e["key"] == "personal")["user_id"] == "known"
    unrelated = reflector.get_prompt_section(user_id="outsider")
    assert "personal lesson marker" not in unrelated
    assert "operator global marker" in unrelated
    assert next(e for e in entries if e["key"] == "operator_global")["source"] == original["source"]


@pytest.mark.asyncio
@pytest.mark.parametrize("category", ["preference", "correction"])
async def test_no_known_participant_never_becomes_global(tmp_path, category):
    reflector = ConversationReflector(str(tmp_path / "learned.json"))
    reflector.set_text_fn(AsyncMock(return_value=json.dumps([
        {"key": "personal", "category": category, "content": "unattributed"},
    ])))
    await reflector.reflect_on_operation("request", ["tool"], [], "response")
    assert "unattributed" not in reflector.get_prompt_section(user_id="unrelated")


@pytest.mark.asyncio
@pytest.mark.parametrize("supplied", [None, "outsider", "other"])
@pytest.mark.parametrize("new_key", [False, True])
async def test_reflection_consolidation_cannot_broaden_personal_scope(
    tmp_path, supplied, new_key,
):
    path = tmp_path / "learned.json"
    originals = [
        {"key": "personal", "category": "preference", "content": "private marker",
         "user_id": "known"},
        {"key": "second", "category": "correction", "content": "second marker",
         "user_id": "other"},
        {"key": "operator_global", "category": "fact", "content": "operator marker",
         "source": {"created_by": "operator"}},
    ]
    path.write_text(json.dumps({"version": 2, "entries": originals}))
    reflector = ConversationReflector(str(path))
    reflector._max_entries = 3
    reflector._consolidation_target = 3
    reflector.set_text_fn(AsyncMock(return_value=json.dumps([
        {"key": "new", "category": "operational", "content": "new operation"},
    ])))
    merged = {"key": "merged" if new_key else "personal", "category": "preference",
              "content": "private marker"}
    if supplied is not None:
        merged["user_id"] = supplied
    completion = AsyncMock(return_value=json.dumps([merged, originals[1], originals[2]]))
    reflector.set_consolidation_fn(completion)
    messages = [SimpleNamespace(role="user", content="message", user_id="known")] * 6
    await reflector.reflect_on_session(SimpleNamespace(messages=messages, summary=""),
                                       user_ids=["known", "other"])
    completion.assert_awaited_once()
    entries = json.loads(path.read_text())["entries"]
    personal = next(e for e in entries if e["content"] == "private marker")
    # A new key carrying a valid participant is permitted. Existing-key
    # ownership and omitted/unknown new-key attribution must be preserved.
    expected = "other" if new_key and supplied == "other" else "known"
    assert personal["user_id"] == expected
    assert "private marker" not in reflector.get_prompt_section(user_id="unrelated")
    assert "operator marker" in reflector.get_prompt_section(user_id="unrelated")
