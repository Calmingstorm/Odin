import json
from datetime import UTC, datetime, timedelta

import pytest

from src.audit.logger import AuditLogger
from src.audit.diff_tracker import compute_dict_diff, compute_unified_diff
from src.observability.aggregates import failure_aggregates


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


def test_failures_include_rotations_and_evidence_before_old_tail_limit(tmp_path):
    path = tmp_path / "audit.jsonl"
    now = datetime.now(UTC)

    def failure(hours):
        return json.dumps({"timestamp": (now - timedelta(hours=hours)).isoformat(),
                           "failure": {"class": "timeout"}, "tool_name": "tool"}) + "\n"

    path.write_text(failure(1) + json.dumps({"padding": "x" * (4 * 1024 * 1024)}) + "\n")
    path.with_name(path.name + ".1").write_text(failure(2) + failure(30))
    result = failure_aggregates(str(path))
    assert result["classified"] == 2
    assert result["trends"] == [{"class": "timeout", "current": 2, "previous": 1, "delta": 1}]
    assert result["coverage"]["generations"] == 2
    assert result["coverage"]["complete_retained_scan"] is True


@pytest.mark.asyncio
async def test_failures_use_logger_snapshot_and_exclude_later_appends(tmp_path):
    logger = AuditLogger(str(tmp_path / "audit.jsonl"))
    row = json.dumps({"timestamp": datetime.now(UTC).isoformat(),
                      "failure": {"class": "timeout"}, "tool_name": "tool"}) + "\n"
    logger.path.write_text(row)
    snapshot = await logger.open_read_snapshot()
    try:
        with logger.path.open("a") as handle:
            handle.write(row)
        result = failure_aggregates(str(logger.path), snapshot=snapshot)
        assert result["classified"] == 1
        assert not snapshot[0][0].closed
    finally:
        for handle, _stat in snapshot:
            handle.close()


@pytest.mark.parametrize("terminal_newline", [False, True])
def test_unified_diff_frames_headers_and_content(terminal_newline):
    ending = "\n" if terminal_newline else ""
    result = compute_unified_diff("old" + ending, "new" + ending, label="sample")
    lines = result.splitlines()
    assert lines[:3] == ["--- a/sample", "+++ b/sample", "@@ -1 +1 @@"]
    assert "-old" in lines and "+new" in lines
    assert ("\\ No newline at end of file" in lines) is not terminal_newline


def test_dict_diff_is_valid_line_framed_patch():
    lines = compute_dict_diff({"x": 1}, {"x": 2}).splitlines()
    assert lines[:3] == ["--- a/config", "+++ b/config", "@@ -1,3 +1,3 @@"]
    assert '-  "x": 1' in lines
    assert '+  "x": 2' in lines
