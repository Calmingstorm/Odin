"""Continuation handler checks through real retained evidence, not fake pages."""

import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.tools.handlers.output import OutputTools
from src.tools.output_authorization import request_delivery_channel
from src.tools.output_delivery import deliver, delivery_scope
from src.tools.output_retention import OutputStore


def fixture(tmp_path):
    store = OutputStore(tmp_path / "evidence.sqlite")
    executor = SimpleNamespace(_current_user_id="reader", config=None,
                               _ensure_output_store=Mock(return_value=store),
                               _authorize_output=Mock(return_value=True))
    page = json.loads(deliver("界" * 20000, store=store, owner="reader", channel="room",
                              tool="read_file"))
    return executor, page


@pytest.mark.asyncio
@pytest.mark.parametrize("limit", [True, False, 0, 3, 8001, 4.0, "8000"])
async def test_invalid_limits_never_access_store(tmp_path, limit):
    executor, page = fixture(tmp_path)
    result = await OutputTools(executor)._handle_get_tool_output(
        {"cursor": page["cursor"], "limit": limit})
    assert result == "Error: limit must be an integer from 4 through 8000."
    executor._ensure_output_store.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("explicit_owner", [True, False])
@pytest.mark.parametrize("api_channel", [True, False])
async def test_effective_scope_and_repeatable_read_then_revocation(
    tmp_path, explicit_owner, api_channel,
):
    executor, page = fixture(tmp_path)
    executor._current_user_id = "reader" if explicit_owner else None
    scope_token = delivery_scope.set(("reader", "outer" if api_channel else "room"))
    channel_token = request_delivery_channel.set("room" if api_channel else "")
    try:
        handler = OutputTools(executor)
        first = await handler._handle_get_tool_output({"cursor": page["cursor"], "limit": 4})
        value = json.loads(first)
        assert value["offset_unit"] == "unicode_code_points"
        assert value["text"] == "界" * 4
        assert value["end"] - value["start"] == 4
        replay = await handler._handle_get_tool_output({"cursor": page["cursor"], "limit": 4})
        assert replay == first
        executor._authorize_output.assert_called_with("read_file", (), "reader")
        executor._authorize_output.return_value = False
        denied = await handler._handle_get_tool_output({"cursor": page["cursor"]})
        assert denied.startswith("Error:")
        assert "界" not in denied
    finally:
        request_delivery_channel.reset(channel_token)
        delivery_scope.reset(scope_token)


@pytest.mark.asyncio
async def test_missing_cursor_and_wrong_owner_fail_explicitly(tmp_path):
    executor, page = fixture(tmp_path)
    handler = OutputTools(executor)
    assert (await handler._handle_get_tool_output({})).startswith("Error:")
    executor._current_user_id = "other"
    assert (await handler._handle_get_tool_output({"cursor": page["cursor"]})).startswith("Error:")
