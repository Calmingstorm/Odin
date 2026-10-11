"""Delete lists without changing clear, ownership, or migration semantics."""

import json

import pytest

from src.tools.execution_outcome import ToolFailure
from src.tools.registry import TOOL_MAP
from tests.test_handlers_state_lists import _make


@pytest.mark.parametrize("clear_first", [False, True])
async def test_delete_persists_removal_and_preserves_other_lists(tmp_path, clear_first):
    tools, _ = _make(tmp_path)
    for name in ("todo", "keep"):
        await tools._handle_manage_list(
            {"action": "add", "list_name": name, "items": ["entry"]}, user_id="owner"
        )
    if clear_first:
        await tools._handle_manage_list({"action": "clear", "list_name": "todo"})
        assert "todo" in tools._load_lists()
        assert tools._load_lists()["todo"]["items"] == []

    result = await tools._handle_manage_list({"action": "delete", "list_name": " TODO "})
    assert result == "Deleted the 'todo' list."
    restarted, _ = _make(tmp_path)
    assert set(restarted._load_lists()) == {"keep"}
    assert "todo" not in await restarted._handle_manage_list({"action": "list_all"})


async def test_delete_unknown_is_refused_without_writing(tmp_path):
    tools, _ = _make(tmp_path)
    result = await tools._handle_manage_list({"action": "delete", "list_name": "missing"})
    assert isinstance(result, ToolFailure)
    assert result == "The 'missing' list doesn't exist."
    assert not (tmp_path / "lists.json").exists()


async def test_delete_personal_list_requires_ownership(tmp_path):
    tools, _ = _make(tmp_path)
    await tools._handle_manage_list(
        {"action": "add", "list_name": "secret", "items": ["x"], "owner": "personal"},
        user_id="owner",
    )
    before = (tmp_path / "lists.json").read_bytes()
    assert "don't have access" in await tools._handle_manage_list(
        {"action": "delete", "list_name": "secret"}, user_id="intruder"
    )
    assert (tmp_path / "lists.json").read_bytes() == before
    assert "Deleted" in await tools._handle_manage_list(
        {"action": "delete", "list_name": "secret"}, user_id="owner"
    )


async def test_delete_last_migrated_list_does_not_resurrect_it(tmp_path):
    (tmp_path / "grocery_list.json").write_text(json.dumps({"items": [{"name": "Bread"}]}))
    tools, _ = _make(tmp_path)
    assert "Bread" in await tools._handle_manage_list({"action": "show", "list_name": "grocery"})
    assert "Deleted" in await tools._handle_manage_list(
        {"action": "delete", "list_name": "grocery"}
    )
    restarted, _ = _make(tmp_path)
    assert restarted._load_lists() == {}
    assert "No lists exist" in await restarted._handle_manage_list({"action": "list_all"})


def test_delete_in_tool_schema():
    assert "delete" in TOOL_MAP["manage_list"]["input_schema"]["properties"]["action"]["enum"]
