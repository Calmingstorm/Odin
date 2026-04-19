"""Tests for the new REST endpoints exposing runbook/trajectory/affordance features."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api import create_api_routes


def _make_bot(tmp_path: Path | None = None) -> MagicMock:
    bot = MagicMock()
    bot.config = MagicMock()
    bot.config.tools = MagicMock()
    bot.config.tools.audit_log_path = str((tmp_path or Path("/tmp")) / "audit.jsonl")
    bot.tool_executor = MagicMock()
    bot.audit = MagicMock()
    return bot


def _iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _write_audit(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")


async def _client(bot: MagicMock) -> TestClient:
    app = web.Application()
    routes = create_api_routes(bot)
    app.router.add_routes(routes)
    return TestClient(TestServer(app))


class TestRunbooksDetectEndpoint:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_audit_file(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with await _client(bot) as client:
            resp = await client.get("/api/runbooks/detect")
            assert resp.status == 200
            data = await resp.json()
            assert data["total"] == 0
            assert data["suggestions"] == []

    @pytest.mark.asyncio
    async def test_returns_suggestions_when_patterns_present(self, tmp_path):
        audit = tmp_path / "audit.jsonl"
        base = datetime(2026, 4, 18, 10, 0, 0)
        rows: list[dict] = []
        for i in range(3):
            t = base + timedelta(hours=i)
            rows.append({
                "timestamp": _iso(t),
                "user_id": "alice", "user_name": "alice", "channel_id": "c1",
                "tool_name": "http_probe",
                "tool_input": {"host": "hostA"},
                "error": None,
            })
            rows.append({
                "timestamp": _iso(t + timedelta(seconds=10)),
                "user_id": "alice", "user_name": "alice", "channel_id": "c1",
                "tool_name": "validate_action",
                "tool_input": {"host": "hostA"},
                "error": None,
            })
        _write_audit(audit, rows)
        bot = _make_bot(tmp_path)
        async with await _client(bot) as client:
            resp = await client.get("/api/runbooks/detect?min_frequency=3&lookback_days=30")
            assert resp.status == 200
            data = await resp.json()
            assert data["total"] >= 1
            assert any(
                s["sequence"] == ["http_probe", "validate_action"]
                for s in data["suggestions"]
            )


class TestRunbooksSynthesizeEndpoint:
    @pytest.mark.asyncio
    async def test_rejects_missing_sequence(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with await _client(bot) as client:
            resp = await client.post("/api/runbooks/synthesize", json={})
            assert resp.status == 400

    @pytest.mark.asyncio
    async def test_generates_source_for_ad_hoc_sequence(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with await _client(bot) as client:
            resp = await client.post(
                "/api/runbooks/synthesize",
                json={"sequence": ["http_probe", "read_file"], "skill_name": "my test"},
            )
            assert resp.status == 200
            data = await resp.json()
            assert "SKILL_DEFINITION" in data["source"]
            assert "async def execute" in data["source"]
            assert "context.execute_tool('http_probe'" in data["source"]
            assert "safe steps" in data["summary"]


class TestTrajectoryReplayEndpoints:
    @pytest.mark.asyncio
    async def test_replay_missing_returns_404(self, tmp_path):
        bot = _make_bot(tmp_path)
        with patch("src.trajectories.saver.TrajectorySaver.find_by_message_id", return_value=None):
            async with await _client(bot) as client:
                resp = await client.get("/api/trajectories/replay/unknown-id")
                assert resp.status == 404

    @pytest.mark.asyncio
    async def test_replay_returns_summary(self, tmp_path):
        bot = _make_bot(tmp_path)
        fake_entry = {
            "message_id": "m1",
            "channel_id": "c1",
            "user_id": "alice",
            "user_name": "alice",
            "timestamp": "2026-04-18T10:00:00Z",
            "user_content": "do the thing",
            "system_prompt": "SECRET SYSTEM PROMPT DO NOT LEAK",
            "history": [{"role": "user", "content": "old stuff"}],
            "iterations": [],
            "tools_used": [],
            "is_error": False,
            "final_response": "done",
            "total_input_tokens": 10,
            "total_output_tokens": 5,
            "total_duration_ms": 100,
        }
        with patch(
            "src.trajectories.saver.TrajectorySaver.find_by_message_id",
            return_value=fake_entry,
        ):
            async with await _client(bot) as client:
                resp = await client.get("/api/trajectories/replay/m1")
                assert resp.status == 200
                data = await resp.json()
                assert data["message_id"] == "m1"
                assert "trajectory replay" in data["summary"]
                assert "do the thing" in data["summary"]
                # Scoped metadata instead of full entry.
                assert "metadata" in data
                assert data["metadata"]["tools_used"] == []
                assert "system_prompt" not in data
                assert "history" not in data
                # And never the system prompt / history even nested.
                blob = json.dumps(data)
                assert "SECRET SYSTEM PROMPT DO NOT LEAK" not in blob
                assert "old stuff" not in blob

    @pytest.mark.asyncio
    async def test_diff_requires_both_params(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with await _client(bot) as client:
            resp = await client.get("/api/trajectories/diff?a=m1")
            assert resp.status == 400

    @pytest.mark.asyncio
    async def test_diff_returns_narrative(self, tmp_path):
        bot = _make_bot(tmp_path)
        e1 = {"message_id": "m1", "user_content": "x", "iterations": [], "is_error": False}
        e2 = {"message_id": "m2", "user_content": "x", "iterations": [], "is_error": False}
        with patch(
            "src.trajectories.saver.TrajectorySaver.find_by_message_id",
            side_effect=lambda mid: e1 if mid == "m1" else e2,
        ):
            async with await _client(bot) as client:
                resp = await client.get("/api/trajectories/diff?a=m1&b=m2")
                assert resp.status == 200
                data = await resp.json()
                assert "trajectory diff" in data["diff"]


class TestAffordancesEndpoint:
    @pytest.mark.asyncio
    async def test_returns_table(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with await _client(bot) as client:
            resp = await client.get("/api/affordances")
            assert resp.status == 200
            data = await resp.json()
            table = data["affordances"]
            assert "run_command" in table
            entry = table["run_command"]
            assert entry["cost"] == "medium"
            assert entry["risk"] == "high"
