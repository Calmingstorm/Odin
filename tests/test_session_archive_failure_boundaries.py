"""Archive restoration/search must survive malformed names and files."""

import json
from unittest.mock import AsyncMock

import pytest

from src.sessions.manager import SessionManager


def _manager(tmp_path, **kwargs):
    return SessionManager(max_history=8, max_age_hours=24,
                          persist_dir=str(tmp_path), **kwargs)


def test_restore_falls_back_from_bad_name_and_corrupt_newest(tmp_path):
    archives = tmp_path / "archive"
    archives.mkdir()
    (archives / "room_1.json").write_text(json.dumps({
        "channel_id": "room", "messages": [
            {"role": "user", "content": "preserved", "timestamp": 1},
        ],
    }))
    (archives / "room_9999999999.json").write_text("{truncated")
    malformed = archives / "room_invalid.json"
    malformed.write_text("{truncated")
    assert _manager(tmp_path).get_or_create("room").messages[0].content == "preserved"


def test_restore_invalid_timestamp_uses_file_mtime(tmp_path):
    archives = tmp_path / "archive"
    archives.mkdir()
    (archives / "room_invalid.json").write_text(json.dumps({
        "channel_id": "room", "summary": "old context",
    }))
    assert _manager(tmp_path).get_or_create("room").summary == "old context"


@pytest.mark.asyncio
async def test_archive_search_skips_corrupt_file_and_keeps_good_matches(tmp_path):
    archives = tmp_path / "archive"
    archives.mkdir()
    (archives / "room_2.json").write_text("{truncated")
    (archives / "room_1.json").write_text(json.dumps({
        "channel_id": "room", "messages": [
            {"role": "user", "content": "needle survives", "timestamp": 1},
        ],
    }))
    results = await _manager(tmp_path).search_history("needle", channel_id="room")
    assert [r["content"] for r in results] == ["needle survives"]


def test_archive_search_early_limit_and_corrupt_file_fallback(tmp_path):
    archives = tmp_path / "archive"
    archives.mkdir()
    (archives / "room_2.json").write_text("{truncated")
    (archives / "room_1.json").write_text(json.dumps({
        "channel_id": "room", "messages": [
            {"role": "user", "content": "needle survives", "timestamp": 1},
            {"role": "user", "content": "needle newest", "timestamp": 2},
        ],
    }))
    result = _manager(tmp_path)._search_archives("needle", 1, channel_id="room")
    assert len(result) == 1
    assert result[0]["content"] == "needle newest"


@pytest.mark.asyncio
async def test_safe_index_catches_failed_vector_io(tmp_path):
    vector = AsyncMock()
    vector.index_session.side_effect = OSError("synthetic vector disk failure")
    manager = _manager(tmp_path, vector_store=vector)
    await manager._safe_index(tmp_path / "archive" / "not-written.json")
    vector.index_session.assert_awaited_once()
