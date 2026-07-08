"""Coverage for src/audit/logger.py read/search/stats/rotation (RFC-006 P15, safe).

Drives a REAL AuditLogger against a tmp jsonl path: entries are written via the
logger's own log_execution/log_web_action (real _persist), then read back through
search/_match (every filter), count_by_tool, get_log_stats, initialize_chain, and
log rotation. SAFE: real file I/O in tmp only; no network, no tool dispatch.
"""
from __future__ import annotations

import pytest

from src.audit.logger import AuditLogger, _cap_tool_input


@pytest.fixture
def logger(tmp_path):
    return AuditLogger(path=str(tmp_path / "audit.jsonl"))


async def _exec(logger, **kw):
    params = dict(user_id="u1", user_name="Alice", channel_id="c1",
                  tool_name="run_command", tool_input={"host": "server"},
                  approved=True, result_summary="ok", execution_time_ms=50)
    params.update(kw)
    await logger.log_execution(**params)


class TestCapToolInput:
    def test_small_passthrough(self):
        inp = {"a": 1}
        assert _cap_tool_input(inp, 4000) is inp

    def test_oversized_truncated(self):
        out = _cap_tool_input({"blob": "x" * 200}, 20)
        assert isinstance(out, str) and out.startswith("<tool_input truncated")


class TestSearchFilters:
    async def test_each_filter(self, logger):
        await _exec(logger, tool_name="run_command", user_name="Alice",
                    tool_input={"host": "server"}, execution_time_ms=500)
        await _exec(logger, tool_name="read_file", user_name="Bob",
                    tool_input={"host": "playground"}, execution_time_ms=10,
                    error="boom")
        assert len(await logger.search()) == 2  # no filters → all
        assert len(await logger.search(tool_name="read_file")) == 1
        assert len(await logger.search(user="alice")) == 1          # case-insensitive
        assert len(await logger.search(host="server")) == 1
        assert len(await logger.search(keyword="playground")) == 1  # blob keyword
        assert len(await logger.search(has_error=True)) == 1
        assert len(await logger.search(min_duration_ms=100)) == 1   # only the 500ms one
        assert await logger.search(limit=1) != []                   # limit honoured

    async def test_date_filter_and_no_file(self, logger, tmp_path):
        # missing file → empty
        assert await AuditLogger(path=str(tmp_path / "absent.jsonl")).search() == []
        await _exec(logger)
        assert len(await logger.search(date="20")) == 1     # ISO year prefix matches
        assert await logger.search(date="1999") == []       # no such day

    async def test_status_filter_via_web_action(self, logger):
        await logger.log_web_action(method="POST", path="/x", status=200)
        assert len(await logger.search(status="200")) == 1
        assert await logger.search(status="404") == []


class TestCountAndStats:
    async def test_count_by_tool(self, logger, tmp_path):
        assert await AuditLogger(path=str(tmp_path / "absent.jsonl")).count_by_tool() == {}
        await _exec(logger, tool_name="run_command")
        await _exec(logger, tool_name="run_command")
        await _exec(logger, tool_name="read_file")
        counts = await logger.count_by_tool()
        assert counts == {"run_command": 2, "read_file": 1}
        assert list(counts)[0] == "run_command"  # most-used first

    async def test_get_log_stats(self, logger):
        await _exec(logger, tool_name="run_command")
        await _exec(logger, tool_name="read_file", error="failed")
        await logger.log_web_action(method="GET", path="/ui", status=200)
        stats = await logger.get_log_stats()
        assert stats["total"] == 3
        assert stats["errors"] == 1
        assert stats["tool_count"] == 2
        assert stats["web_actions"] == 1
        assert stats["tools"] == ["read_file", "run_command"]


class TestLogWebAction:
    async def test_success_and_error_entries(self, logger):
        await logger.log_web_action(method="POST", path="/api/x", status=201,
                                    ip="1.2.3.4", execution_time_ms=12,
                                    user_id="u9", username="Nine", label="admin",
                                    diff="- a\n+ b")
        await logger.log_web_action(method="DELETE", path="/api/y", status=500)
        entries = await logger.search()
        by_path = {e["path"]: e for e in entries}
        ok = by_path["/api/x"]
        assert ok["success"] is True and ok["actor"] == "web:u9" and ok["label"] == "admin"
        assert ok["diff"] == "- a\n+ b"
        err = by_path["/api/y"]
        assert err["success"] is False and err["error"] == "HTTP 500"


class TestChainAndRotation:
    async def test_initialize_chain_resumes(self, tmp_path):
        key = "ab12" * 16  # 64-char hex HMAC key
        path = str(tmp_path / "signed.jsonl")
        first = AuditLogger(path=path, hmac_key=key)
        await _exec(first, tool_name="run_command")
        await _exec(first, tool_name="read_file")
        # a fresh logger over the same file resumes the chain from the last entry
        second = AuditLogger(path=path, hmac_key=key)
        await second.initialize_chain()
        await _exec(second, tool_name="list_dir")     # chains onto the resumed state
        result = await second.verify_integrity()
        assert result.get("valid") is True

    async def test_rotation_creates_backup(self, tmp_path):
        # tiny cap → the second persist rotates the first entry into .1
        path = tmp_path / "rot.jsonl"
        logger = AuditLogger(path=str(path), max_bytes=150, max_files=3)
        await _exec(logger, result_summary="x" * 200)  # one entry already > cap
        await _exec(logger, result_summary="y" * 200)  # triggers rotation
        assert (tmp_path / "rot.jsonl.1").exists()
