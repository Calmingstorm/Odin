"""Tests for trajectory saving — TrajectorySaver, TrajectoryTurn, API endpoints, metrics."""
from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import WebhookConfig
from src.health.metrics import MetricsCollector
from src.health.server import HealthServer
from src.trajectories.saver import (
    DEFAULT_TRAJECTORY_DIR,
    ToolIteration,
    TrajectorySaver,
    TrajectoryTurn,
    _collect_tools_used,
    _trajectory_filename,
)


# ---------------------------------------------------------------------------
# ToolIteration
# ---------------------------------------------------------------------------

class TestToolIteration:
    def test_defaults(self):
        it = ToolIteration(iteration=0)
        assert it.iteration == 0
        assert it.tool_calls == []
        assert it.tool_results == []
        assert it.llm_text == ""
        assert it.input_tokens == 0
        assert it.output_tokens == 0
        assert it.duration_ms == 0

    def test_with_data(self):
        it = ToolIteration(
            iteration=1,
            tool_calls=[{"name": "run_command", "input": {"cmd": "ls"}}],
            tool_results=[{"name": "run_command", "output": "file.txt"}],
            llm_text="I'll list the files",
            input_tokens=100,
            output_tokens=50,
            duration_ms=1200,
        )
        assert it.iteration == 1
        assert len(it.tool_calls) == 1
        assert it.tool_calls[0]["name"] == "run_command"
        assert it.input_tokens == 100
        assert it.duration_ms == 1200


# ---------------------------------------------------------------------------
# TrajectoryTurn
# ---------------------------------------------------------------------------

class TestTrajectoryTurn:
    def test_defaults(self):
        t = TrajectoryTurn()
        assert t.message_id == ""
        assert t.channel_id == ""
        assert t.user_id == ""
        assert t.source == "discord"
        assert t.iterations == []
        assert t.tools_used == []
        assert t.is_error is False
        assert t.handoff is False
        assert t.total_input_tokens == 0
        assert t.total_output_tokens == 0

    def test_add_iteration(self):
        t = TrajectoryTurn()
        it = t.add_iteration(
            iteration=0,
            tool_calls=[{"name": "read_file", "input": {"path": "/tmp/x"}}],
            tool_results=[{"name": "read_file", "output": "contents"}],
            input_tokens=200,
            output_tokens=50,
            duration_ms=500,
        )
        assert len(t.iterations) == 1
        assert it.iteration == 0
        assert it.input_tokens == 200

    def test_add_multiple_iterations(self):
        t = TrajectoryTurn()
        t.add_iteration(iteration=0, input_tokens=100, output_tokens=30, duration_ms=200)
        t.add_iteration(iteration=1, input_tokens=150, output_tokens=40, duration_ms=300)
        assert len(t.iterations) == 2

    def test_finalize_sets_totals(self):
        t = TrajectoryTurn(user_content="hello", system_prompt="You are Odin")
        t.add_iteration(
            iteration=0,
            tool_calls=[{"name": "run_command", "input": {"cmd": "ls"}}],
            input_tokens=200,
            output_tokens=50,
            duration_ms=500,
        )
        t.add_iteration(
            iteration=1,
            tool_calls=[{"name": "read_file", "input": {"path": "/x"}}],
            input_tokens=300,
            output_tokens=60,
            duration_ms=700,
        )
        t.finalize("Here are the results", is_error=False, handoff=True)
        assert t.final_response == "Here are the results"
        assert t.total_input_tokens == 500
        assert t.total_output_tokens == 110
        assert t.total_duration_ms == 1200
        assert t.handoff is True
        assert t.tools_used == ["run_command", "read_file"]

    def test_finalize_fallback_token_estimate(self):
        t = TrajectoryTurn(
            user_content="What is the weather?",
            system_prompt="You are Odin, the All-Father.",
        )
        t.finalize("The weather is fine.", is_error=False)
        assert t.total_input_tokens > 0

    def test_finalize_error(self):
        t = TrajectoryTurn()
        t.finalize("Something went wrong", is_error=True)
        assert t.is_error is True

    def test_to_dict_structure(self):
        t = TrajectoryTurn(
            message_id="123",
            channel_id="456",
            user_id="789",
            user_name="testuser",
            timestamp="2026-04-15T00:00:00",
            source="web",
            user_content="hello",
            system_prompt="sys prompt here",
        )
        t.add_iteration(
            iteration=0,
            tool_calls=[{"name": "run_command", "input": {"cmd": "ls"}}],
            tool_results=[{"name": "run_command", "output": "ok"}],
            input_tokens=100,
            output_tokens=50,
            duration_ms=300,
        )
        t.finalize("response text")
        d = t.to_dict()

        assert d["message_id"] == "123"
        assert d["channel_id"] == "456"
        assert d["user_id"] == "789"
        assert d["user_name"] == "testuser"
        assert d["source"] == "web"
        assert d["system_prompt_length"] == len("sys prompt here")
        assert d["history_length"] == 0
        assert d["iteration_count"] == 1
        assert len(d["iterations"]) == 1
        assert d["final_response"] == "response text"
        assert d["tools_used"] == ["run_command"]
        assert d["total_input_tokens"] == 100
        assert d["total_output_tokens"] == 50
        assert d["total_duration_ms"] == 300

    def test_to_dict_excludes_full_system_prompt(self):
        t = TrajectoryTurn(system_prompt="a" * 5000)
        t.finalize("")
        d = t.to_dict()
        assert "system_prompt" not in d
        assert d["system_prompt_length"] == 5000

    def test_to_dict_serializable(self):
        t = TrajectoryTurn(
            message_id="1", channel_id="2", user_content="hi",
            system_prompt="sp",
        )
        t.add_iteration(iteration=0, input_tokens=10, output_tokens=5)
        t.finalize("reply")
        d = t.to_dict()
        serialized = json.dumps(d, default=str)
        assert isinstance(serialized, str)
        parsed = json.loads(serialized)
        assert parsed["message_id"] == "1"


# ---------------------------------------------------------------------------
# _collect_tools_used
# ---------------------------------------------------------------------------

class TestCollectToolsUsed:
    def test_empty(self):
        assert _collect_tools_used([]) == []

    def test_single(self):
        its = [ToolIteration(iteration=0, tool_calls=[{"name": "run_command"}])]
        assert _collect_tools_used(its) == ["run_command"]

    def test_dedup_preserves_order(self):
        its = [
            ToolIteration(iteration=0, tool_calls=[
                {"name": "run_command"},
                {"name": "read_file"},
            ]),
            ToolIteration(iteration=1, tool_calls=[
                {"name": "run_command"},
                {"name": "write_file"},
            ]),
        ]
        result = _collect_tools_used(its)
        assert result == ["run_command", "read_file", "write_file"]

    def test_missing_name_key(self):
        its = [ToolIteration(iteration=0, tool_calls=[{"input": {}}])]
        assert _collect_tools_used(its) == []


# ---------------------------------------------------------------------------
# _trajectory_filename
# ---------------------------------------------------------------------------

class TestTrajectoryFilename:
    def test_format(self):
        from datetime import datetime, timezone
        dt = datetime(2026, 4, 15, 12, 0, 0, tzinfo=timezone.utc)
        assert _trajectory_filename(dt) == "2026-04-15.jsonl"

    def test_different_dates(self):
        from datetime import datetime, timezone
        dt1 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        dt2 = datetime(2026, 12, 31, tzinfo=timezone.utc)
        assert _trajectory_filename(dt1) == "2026-01-01.jsonl"
        assert _trajectory_filename(dt2) == "2026-12-31.jsonl"


# ---------------------------------------------------------------------------
# TrajectorySaver
# ---------------------------------------------------------------------------

class TestTrajectorySaver:
    @pytest.fixture
    def saver(self, tmp_path):
        return TrajectorySaver(directory=str(tmp_path / "trajectories"))

    @pytest.fixture
    def sample_turn(self):
        t = TrajectoryTurn(
            message_id="msg-1",
            channel_id="chan-1",
            user_id="user-1",
            user_name="TestUser",
            user_content="list files in /tmp",
            system_prompt="You are Odin.",
            source="discord",
        )
        t.add_iteration(
            iteration=0,
            tool_calls=[{"name": "run_command", "input": {"cmd": "ls /tmp"}}],
            tool_results=[{"name": "run_command", "output": "file1.txt\nfile2.txt"}],
            input_tokens=200,
            output_tokens=50,
            duration_ms=800,
        )
        t.finalize("Here are the files in /tmp:\n- file1.txt\n- file2.txt")
        return t

    async def test_save_creates_file(self, saver, sample_turn):
        path = await saver.save(sample_turn)
        assert path.exists()
        assert path.suffix == ".jsonl"

    async def test_save_writes_valid_json(self, saver, sample_turn):
        path = await saver.save(sample_turn)
        with open(path) as f:
            line = f.readline()
        data = json.loads(line)
        assert data["message_id"] == "msg-1"
        assert data["channel_id"] == "chan-1"
        assert data["user_id"] == "user-1"
        assert data["tools_used"] == ["run_command"]

    async def test_save_increments_count(self, saver, sample_turn):
        assert saver.count == 0
        await saver.save(sample_turn)
        assert saver.count == 1
        await saver.save(sample_turn)
        assert saver.count == 2

    async def test_save_appends_to_same_file(self, saver, sample_turn):
        path1 = await saver.save(sample_turn)
        path2 = await saver.save(sample_turn)
        assert path1 == path2
        with open(path1) as f:
            lines = f.readlines()
        assert len(lines) == 2

    async def test_save_sets_timestamp_if_empty(self, saver):
        t = TrajectoryTurn(message_id="m1")
        t.finalize("")
        await saver.save(t)
        assert t.timestamp != ""

    async def test_save_preserves_existing_timestamp(self, saver):
        t = TrajectoryTurn(message_id="m1", timestamp="2026-01-01T00:00:00")
        t.finalize("")
        await saver.save(t)
        assert t.timestamp == "2026-01-01T00:00:00"

    async def test_save_creates_directory(self, tmp_path):
        deep_path = str(tmp_path / "a" / "b" / "c" / "trajectories")
        saver = TrajectorySaver(directory=deep_path)
        t = TrajectoryTurn(message_id="m1")
        t.finalize("")
        path = await saver.save(t)
        assert path.exists()

    async def test_save_includes_token_counts(self, saver, sample_turn):
        path = await saver.save(sample_turn)
        with open(path) as f:
            data = json.loads(f.readline())
        assert data["total_input_tokens"] == 200
        assert data["total_output_tokens"] == 50

    async def test_save_includes_duration(self, saver, sample_turn):
        path = await saver.save(sample_turn)
        with open(path) as f:
            data = json.loads(f.readline())
        assert data["total_duration_ms"] == 800


class TestTrajectorySaverSaveFromData:
    @pytest.fixture
    def saver(self, tmp_path):
        return TrajectorySaver(directory=str(tmp_path / "trajectories"))

    async def test_save_from_data(self, saver):
        iterations = [
            ToolIteration(
                iteration=0,
                tool_calls=[{"name": "run_command", "input": {"cmd": "ls"}}],
                tool_results=[{"name": "run_command", "output": "ok"}],
                input_tokens=100,
                output_tokens=30,
                duration_ms=400,
            ),
        ]
        path = await saver.save_from_data(
            message_id="m1",
            channel_id="c1",
            user_id="u1",
            user_name="User1",
            user_content="list files",
            system_prompt="Odin",
            history=[],
            iterations=iterations,
            final_response="Done",
            tools_used=["run_command"],
            source="web",
        )
        assert path.exists()
        with open(path) as f:
            data = json.loads(f.readline())
        assert data["source"] == "web"
        assert data["tools_used"] == ["run_command"]
        assert saver.count == 1


# ---------------------------------------------------------------------------
# TrajectorySaver.list_files / read_file / search
# ---------------------------------------------------------------------------

class TestTrajectorySaverListFiles:
    async def test_list_empty(self, tmp_path):
        saver = TrajectorySaver(directory=str(tmp_path / "empty"))
        files = await saver.list_files()
        assert files == []

    async def test_list_files(self, tmp_path):
        d = tmp_path / "traj"
        d.mkdir()
        (d / "2026-04-14.jsonl").write_text("{}\n")
        (d / "2026-04-15.jsonl").write_text("{}\n")
        (d / "not-a-jsonl.txt").write_text("nope")
        saver = TrajectorySaver(directory=str(d))
        files = await saver.list_files()
        assert "2026-04-14.jsonl" in files
        assert "2026-04-15.jsonl" in files
        assert "not-a-jsonl.txt" not in files


class TestTrajectorySaverReadFile:
    async def test_read_nonexistent(self, tmp_path):
        saver = TrajectorySaver(directory=str(tmp_path))
        entries = await saver.read_file("nonexistent.jsonl")
        assert entries == []

    async def test_read_file(self, tmp_path):
        d = tmp_path / "traj"
        d.mkdir()
        data = [
            {"message_id": "1", "channel_id": "c1"},
            {"message_id": "2", "channel_id": "c2"},
            {"message_id": "3", "channel_id": "c3"},
        ]
        (d / "test.jsonl").write_text("\n".join(json.dumps(r) for r in data) + "\n")
        saver = TrajectorySaver(directory=str(d))
        entries = await saver.read_file("test.jsonl")
        assert len(entries) == 3
        # Most recent first
        assert entries[0]["message_id"] == "3"

    async def test_read_file_with_limit(self, tmp_path):
        d = tmp_path / "traj"
        d.mkdir()
        lines = "\n".join(json.dumps({"id": str(i)}) for i in range(10))
        (d / "test.jsonl").write_text(lines + "\n")
        saver = TrajectorySaver(directory=str(d))
        entries = await saver.read_file("test.jsonl", limit=3)
        assert len(entries) == 3


class TestTrajectorySaverFindByMessageId:
    @pytest.fixture
    def saver_with_data(self, tmp_path):
        d = tmp_path / "traj"
        d.mkdir()
        data = [
            {"message_id": "msg-1", "channel_id": "c1", "user_id": "u1"},
            {"message_id": "msg-2", "channel_id": "c2", "user_id": "u2"},
            {"message_id": "msg-3", "channel_id": "c1", "user_id": "u1"},
        ]
        (d / "2026-04-15.jsonl").write_text(
            "\n".join(json.dumps(r) for r in data) + "\n"
        )
        return TrajectorySaver(directory=str(d))

    async def test_find_existing(self, saver_with_data):
        entry = await saver_with_data.find_by_message_id("msg-2")
        assert entry is not None
        assert entry["message_id"] == "msg-2"
        assert entry["channel_id"] == "c2"

    async def test_find_not_found(self, saver_with_data):
        entry = await saver_with_data.find_by_message_id("nonexistent")
        assert entry is None

    async def test_find_empty_directory(self, tmp_path):
        saver = TrajectorySaver(directory=str(tmp_path / "empty"))
        entry = await saver.find_by_message_id("msg-1")
        assert entry is None

    async def test_find_across_files(self, tmp_path):
        d = tmp_path / "traj"
        d.mkdir()
        (d / "2026-04-14.jsonl").write_text(
            json.dumps({"message_id": "old-msg", "channel_id": "c1"}) + "\n"
        )
        (d / "2026-04-15.jsonl").write_text(
            json.dumps({"message_id": "new-msg", "channel_id": "c2"}) + "\n"
        )
        saver = TrajectorySaver(directory=str(d))
        entry = await saver.find_by_message_id("old-msg")
        assert entry is not None
        assert entry["message_id"] == "old-msg"

    async def test_find_returns_most_recent_file_first(self, tmp_path):
        d = tmp_path / "traj"
        d.mkdir()
        (d / "2026-04-14.jsonl").write_text(
            json.dumps({"message_id": "dup", "channel_id": "old"}) + "\n"
        )
        (d / "2026-04-15.jsonl").write_text(
            json.dumps({"message_id": "dup", "channel_id": "new"}) + "\n"
        )
        saver = TrajectorySaver(directory=str(d))
        entry = await saver.find_by_message_id("dup")
        assert entry is not None
        assert entry["channel_id"] == "new"


class TestTrajectorySaverSearch:
    @pytest.fixture
    def saver_with_data(self, tmp_path):
        d = tmp_path / "traj"
        d.mkdir()
        data = [
            {"message_id": "1", "channel_id": "c1", "user_id": "u1",
             "tools_used": ["run_command"], "is_error": False},
            {"message_id": "2", "channel_id": "c2", "user_id": "u1",
             "tools_used": ["read_file"], "is_error": True},
            {"message_id": "3", "channel_id": "c1", "user_id": "u2",
             "tools_used": ["run_command", "read_file"], "is_error": False},
        ]
        (d / "2026-04-15.jsonl").write_text(
            "\n".join(json.dumps(r) for r in data) + "\n"
        )
        return TrajectorySaver(directory=str(d))

    async def test_search_all(self, saver_with_data):
        results = await saver_with_data.search()
        assert len(results) == 3

    async def test_search_by_channel(self, saver_with_data):
        results = await saver_with_data.search(channel_id="c1")
        assert len(results) == 2
        assert all(r["channel_id"] == "c1" for r in results)

    async def test_search_by_user(self, saver_with_data):
        results = await saver_with_data.search(user_id="u1")
        assert len(results) == 2

    async def test_search_by_tool(self, saver_with_data):
        results = await saver_with_data.search(tool_name="read_file")
        assert len(results) == 2

    async def test_search_errors_only(self, saver_with_data):
        results = await saver_with_data.search(errors_only=True)
        assert len(results) == 1
        assert results[0]["is_error"] is True

    async def test_search_with_limit(self, saver_with_data):
        results = await saver_with_data.search(limit=1)
        assert len(results) == 1

    async def test_search_combined_filters(self, saver_with_data):
        results = await saver_with_data.search(channel_id="c1", tool_name="run_command")
        assert len(results) == 2


# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------

class TestTrajectoryPrometheusMetrics:
    def test_get_prometheus_metrics(self):
        saver = TrajectorySaver.__new__(TrajectorySaver)
        saver._count = 42
        metrics = saver.get_prometheus_metrics()
        assert metrics == {"trajectories_saved_total": 42}

    def test_metrics_rendered(self):
        mc = MetricsCollector()
        mc.register_source("trajectories", lambda: {"trajectories_saved_total": 10})
        rendered = mc.render()
        assert "odin_trajectories_saved_total" in rendered
        assert "10" in rendered

    def test_metrics_absent(self):
        mc = MetricsCollector()
        rendered = mc.render()
        assert "odin_trajectories_saved_total" not in rendered

    def test_metrics_zero(self):
        mc = MetricsCollector()
        mc.register_source("trajectories", lambda: {"trajectories_saved_total": 0})
        rendered = mc.render()
        assert "odin_trajectories_saved_total" in rendered

    async def test_metrics_in_endpoint(self):
        cfg = WebhookConfig(enabled=False)
        server = HealthServer(port=0, webhook_config=cfg)
        server.set_ready(True)
        saver = TrajectorySaver.__new__(TrajectorySaver)
        saver._count = 7
        server.metrics.register_source("trajectories", saver.get_prometheus_metrics)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/metrics")
            text = await resp.text()
            assert "odin_trajectories_saved_total 7" in text


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------

def _make_bot_with_saver():
    bot = MagicMock()
    saver = MagicMock()
    saver.list_files = AsyncMock(return_value=["2026-04-15.jsonl"])
    saver.count = 5
    saver.read_file = AsyncMock(return_value=[
        {"message_id": "1", "channel_id": "c1", "tools_used": ["run_command"]},
    ])
    saver.search = AsyncMock(return_value=[
        {"message_id": "1", "channel_id": "c1"},
    ])
    saver.find_by_message_id = AsyncMock(return_value={
        "message_id": "1", "channel_id": "c1", "tools_used": ["run_command"],
        "iterations": [], "final_response": "Done",
    })
    bot.trajectory_saver = saver
    bot.config = MagicMock()
    bot.config.web = MagicMock()
    bot.config.web.api_token = ""
    return bot


def _make_bot_without_saver():
    bot = MagicMock(spec=[])
    bot.config = MagicMock()
    bot.config.web = MagicMock()
    bot.config.web.api_token = ""
    return bot


def _make_app(bot):
    from src.web.api import setup_api
    app = web.Application()
    setup_api(app, bot)
    return app


class TestTrajectoryAPI:
    async def test_list_trajectories(self):
        bot = _make_bot_with_saver()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories")
            assert resp.status == 200
            data = await resp.json()
            assert data["files"] == ["2026-04-15.jsonl"]
            assert data["count"] == 5

    async def test_get_trajectory_file(self):
        bot = _make_bot_with_saver()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories/2026-04-15.jsonl")
            assert resp.status == 200
            data = await resp.json()
            assert len(data["entries"]) == 1
            assert data["entries"][0]["message_id"] == "1"

    async def test_get_trajectory_file_invalid_name(self):
        bot = _make_bot_with_saver()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories/notjsonl.txt")
            assert resp.status == 400

    async def test_search_trajectories(self):
        bot = _make_bot_with_saver()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories/search/query?channel_id=c1")
            assert resp.status == 200
            data = await resp.json()
            assert len(data["results"]) == 1


class TestTrajectoryMessageAPI:
    async def test_get_by_message_id(self):
        bot = _make_bot_with_saver()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories/message/1")
            assert resp.status == 200
            data = await resp.json()
            assert data["entry"]["message_id"] == "1"

    async def test_get_by_message_id_not_found(self):
        bot = _make_bot_with_saver()
        bot.trajectory_saver.find_by_message_id = AsyncMock(return_value=None)
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories/message/nonexistent")
            assert resp.status == 404

    async def test_get_by_message_id_unavailable(self):
        bot = _make_bot_without_saver()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories/message/1")
            assert resp.status == 503


class TestTrajectoryAPIUnavailable:
    async def test_list_returns_503(self):
        bot = _make_bot_without_saver()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories")
            assert resp.status == 503

    async def test_get_returns_503(self):
        bot = _make_bot_without_saver()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories/test.jsonl")
            assert resp.status == 503

    async def test_search_returns_503(self):
        bot = _make_bot_without_saver()
        app = _make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/trajectories/search/query")
            assert resp.status == 503


# ---------------------------------------------------------------------------
# Import smoke test
# ---------------------------------------------------------------------------

class TestTrajectoryImports:
    def test_import_from_package(self):
        from src.trajectories import TrajectorySaver, TrajectoryTurn, ToolIteration
        assert TrajectorySaver is not None
        assert TrajectoryTurn is not None
        assert ToolIteration is not None

    def test_default_directory_constant(self):
        assert DEFAULT_TRAJECTORY_DIR == "./data/trajectories"
