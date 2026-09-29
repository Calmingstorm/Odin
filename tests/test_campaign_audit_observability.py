import json

import pytest

from src.audit.logger import AuditLogger


@pytest.mark.asyncio
async def test_log_stats_retained_rotation_matches_search_and_tool_inventory(tmp_path):
    logger = AuditLogger(str(tmp_path / "audit.jsonl"), max_bytes=1, max_files=3)
    await logger.log_execution(user_id="user", user_name="User", tool_name="old_tool",
                               channel_id="channel", approved=True,
                               tool_input={}, result_summary="failed", execution_time_ms=1,
                               error="failure")
    await logger.log_execution(user_id="user", user_name="User", tool_name="new_tool",
                               channel_id="channel", approved=True,
                               tool_input={}, result_summary="done", execution_time_ms=1)
    stats = await logger.get_log_stats()
    assert stats["total"] == len(await logger.search(limit=100)) == 2
    assert stats["tools"] == sorted(await logger.count_by_tool()) == ["new_tool", "old_tool"]
    assert stats["errors"] == 1


@pytest.mark.asyncio
async def test_stats_stable_snapshot_survives_rotation_after_open(tmp_path, monkeypatch):
    logger = AuditLogger(str(tmp_path / "audit.jsonl"))
    logger.path.write_text(json.dumps({"tool_name": "old_tool"}) + "\n")
    original = logger._open_read_snapshot

    async def rotate_after_open():
        snapshot = await original()
        logger.path.rename(logger.path.with_name(logger.path.name + ".1"))
        logger.path.write_text(json.dumps({"tool_name": "new_tool"}) + "\n")
        return snapshot

    monkeypatch.setattr(logger, "_open_read_snapshot", rotate_after_open)
    stats = await logger.get_log_stats()
    assert stats["total"] == 1
    assert stats["tools"] == ["old_tool"]


@pytest.mark.asyncio
async def test_stats_empty_shape_and_rotation_without_active_file(tmp_path):
    logger = AuditLogger(str(tmp_path / "audit.jsonl"))
    assert await logger.get_log_stats() == {
        "total": 0, "errors": 0, "tool_count": 0, "tools": [], "web_actions": 0,
    }
    logger.path.with_name(logger.path.name + ".1").write_text(
        json.dumps({"type": "web_action", "tool_name": "config_update"}) + "\n"
    )
    assert (await logger.get_log_stats())["tools"] == ["config_update"]
