"""Tests for src/monitoring/resource_usage.py — resource usage stats collector."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, PropertyMock, patch


def _mock_sessions(bot, sessions_dict: dict | None = None):
    """Configure bot.sessions mock with public API methods."""
    d = sessions_dict if sessions_dict is not None else {}
    bot.sessions.count.return_value = len(d)
    bot.sessions.items_snapshot.return_value = list(d.items())

import pytest

from src.monitoring.resource_usage import (
    DirStats,
    KnowledgeStats,
    SessionStats,
    TrajectoryStats,
    collect_all,
    collect_knowledge_stats,
    collect_session_stats,
    collect_trajectory_stats,
    scan_directory,
    scan_file,
)


# ---------------------------------------------------------------------------
# DirStats
# ---------------------------------------------------------------------------

class TestDirStats:
    def test_default_values(self):
        ds = DirStats()
        assert ds.path == ""
        assert ds.file_count == 0
        assert ds.total_bytes == 0

    def test_to_dict(self):
        ds = DirStats(path="/tmp/test", file_count=5, total_bytes=2048)
        d = ds.to_dict()
        assert d["path"] == "/tmp/test"
        assert d["file_count"] == 5
        assert d["total_bytes"] == 2048
        assert d["total_mb"] == 0.0  # 2048 bytes < 1 MB

    def test_to_dict_large_size(self):
        ds = DirStats(path="/data", file_count=100, total_bytes=10 * 1024 * 1024)
        d = ds.to_dict()
        assert d["total_mb"] == 10.0

    def test_to_dict_zero_bytes(self):
        ds = DirStats()
        d = ds.to_dict()
        assert d["total_mb"] == 0.0

    def test_to_dict_fractional_mb(self):
        ds = DirStats(total_bytes=1_500_000)
        d = ds.to_dict()
        assert d["total_mb"] == pytest.approx(1.43, abs=0.01)


# ---------------------------------------------------------------------------
# SessionStats
# ---------------------------------------------------------------------------

class TestSessionStats:
    def test_default_values(self):
        ss = SessionStats()
        assert ss.active_count == 0
        assert ss.total_tokens == 0
        assert ss.total_messages == 0
        assert ss.over_budget_count == 0
        assert ss.token_budget == 0
        assert isinstance(ss.persist_dir, DirStats)
        assert ss.per_session == []

    def test_to_dict(self):
        ss = SessionStats(
            active_count=3,
            total_tokens=15000,
            total_messages=42,
            over_budget_count=1,
            token_budget=256000,
        )
        d = ss.to_dict()
        assert d["active_count"] == 3
        assert d["total_tokens"] == 15000
        assert d["total_messages"] == 42
        assert d["over_budget_count"] == 1
        assert d["token_budget"] == 256000
        assert "persist_dir" in d
        assert isinstance(d["per_session"], list)

    def test_to_dict_with_per_session(self):
        ss = SessionStats(per_session=[{"channel_id": "123", "tokens": 5000}])
        d = ss.to_dict()
        assert len(d["per_session"]) == 1
        assert d["per_session"][0]["channel_id"] == "123"

    def test_independent_persist_dir(self):
        s1 = SessionStats()
        s2 = SessionStats()
        s1.persist_dir.total_bytes = 999
        assert s2.persist_dir.total_bytes == 0


# ---------------------------------------------------------------------------
# KnowledgeStats
# ---------------------------------------------------------------------------

class TestKnowledgeStats:
    def test_default_values(self):
        ks = KnowledgeStats()
        assert ks.available is False
        assert ks.chunk_count == 0
        assert ks.source_count == 0
        assert ks.vector_search is False
        assert isinstance(ks.db_file, DirStats)
        assert ks.sources == []

    def test_to_dict(self):
        ks = KnowledgeStats(
            available=True,
            chunk_count=500,
            source_count=10,
            vector_search=True,
        )
        d = ks.to_dict()
        assert d["available"] is True
        assert d["chunk_count"] == 500
        assert d["source_count"] == 10
        assert d["vector_search"] is True
        assert "db_file" in d
        assert isinstance(d["sources"], list)

    def test_to_dict_with_sources(self):
        ks = KnowledgeStats(sources=[
            {"source": "doc.md", "chunks": 5, "uploader": "admin"},
        ])
        d = ks.to_dict()
        assert len(d["sources"]) == 1
        assert d["sources"][0]["source"] == "doc.md"


# ---------------------------------------------------------------------------
# TrajectoryStats
# ---------------------------------------------------------------------------

class TestTrajectoryStats:
    def test_default_values(self):
        ts = TrajectoryStats()
        assert ts.message_count == 0
        assert ts.agent_count == 0
        assert isinstance(ts.message_dir, DirStats)
        assert isinstance(ts.agent_dir, DirStats)
        assert ts.message_files == []
        assert ts.agent_files == []

    def test_to_dict(self):
        ts = TrajectoryStats(message_count=50, agent_count=10)
        d = ts.to_dict()
        assert d["message_count"] == 50
        assert d["agent_count"] == 10
        assert d["total_count"] == 60

    def test_to_dict_combined_bytes(self):
        ts = TrajectoryStats()
        ts.message_dir = DirStats(total_bytes=1024)
        ts.agent_dir = DirStats(total_bytes=2048)
        d = ts.to_dict()
        assert d["combined_bytes"] == 3072
        assert d["combined_mb"] == pytest.approx(0.0, abs=0.01)

    def test_to_dict_files_lists(self):
        ts = TrajectoryStats(
            message_files=["2024-01-01.jsonl", "2024-01-02.jsonl"],
            agent_files=["2024-01-01.jsonl"],
        )
        d = ts.to_dict()
        assert len(d["message_files"]) == 2
        assert len(d["agent_files"]) == 1

    def test_independent_dirs(self):
        t1 = TrajectoryStats()
        t2 = TrajectoryStats()
        t1.message_dir.total_bytes = 999
        assert t2.message_dir.total_bytes == 0


# ---------------------------------------------------------------------------
# scan_directory
# ---------------------------------------------------------------------------

class TestScanDirectory:
    def test_existing_directory(self):
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "a.txt").write_text("hello")
            (Path(td) / "b.txt").write_text("world!!")
            ds = scan_directory(td)
            assert ds.file_count == 2
            assert ds.total_bytes == 5 + 7
            assert ds.path == td

    def test_nonexistent_directory(self):
        ds = scan_directory("/nonexistent/path/xyz")
        assert ds.file_count == 0
        assert ds.total_bytes == 0

    def test_empty_directory(self):
        with tempfile.TemporaryDirectory() as td:
            ds = scan_directory(td)
            assert ds.file_count == 0
            assert ds.total_bytes == 0

    def test_with_subdirectories(self):
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "file.txt").write_text("data")
            subdir = Path(td) / "sub"
            subdir.mkdir()
            (subdir / "nested.txt").write_text("nested")
            ds = scan_directory(td)
            assert ds.file_count == 1  # only top-level files

    def test_path_object(self):
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "x.txt").write_text("x")
            ds = scan_directory(Path(td))
            assert ds.file_count == 1


# ---------------------------------------------------------------------------
# scan_file
# ---------------------------------------------------------------------------

class TestScanFile:
    def test_existing_file(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            f.write(b"abcdef")
            f.flush()
            try:
                ds = scan_file(f.name)
                assert ds.file_count == 1
                assert ds.total_bytes == 6
                assert ds.path == f.name
            finally:
                os.unlink(f.name)

    def test_nonexistent_file(self):
        ds = scan_file("/nonexistent/file.db")
        assert ds.file_count == 0
        assert ds.total_bytes == 0

    def test_directory_instead_of_file(self):
        with tempfile.TemporaryDirectory() as td:
            ds = scan_file(td)
            assert ds.file_count == 0
            assert ds.total_bytes == 0


# ---------------------------------------------------------------------------
# collect_session_stats
# ---------------------------------------------------------------------------

class TestCollectSessionStats:
    def test_no_session_manager(self):
        bot = MagicMock(spec=[])
        stats = collect_session_stats(bot)
        assert stats.active_count == 0
        assert stats.total_tokens == 0

    def test_none_session_manager(self):
        bot = MagicMock()
        bot.sessions = None
        stats = collect_session_stats(bot)
        assert stats.active_count == 0

    def test_sessions_not_dict(self):
        bot = MagicMock()
        bot.sessions.count.return_value = 0
        bot.sessions.items_snapshot.return_value = []
        stats = collect_session_stats(bot)
        assert stats.active_count == 0

    def test_with_sessions(self):
        bot = MagicMock()
        session1 = MagicMock()
        session1.estimated_tokens = 5000
        session1.messages = [1, 2, 3]
        session1.summary = "test summary"
        session2 = MagicMock()
        session2.estimated_tokens = 8000
        session2.messages = [1, 2]
        session2.summary = ""
        _mock_sessions(bot, {"ch1": session1, "ch2": session2})
        bot.sessions.token_budget = 128000
        bot.sessions.persist_directory = "/nonexistent/sessions"
        stats = collect_session_stats(bot)
        assert stats.active_count == 2
        assert stats.total_tokens == 13000
        assert stats.total_messages == 5
        assert stats.over_budget_count == 0
        assert len(stats.per_session) == 2

    def test_over_budget_sessions(self):
        bot = MagicMock()
        session1 = MagicMock()
        session1.estimated_tokens = 200000
        session1.messages = []
        session1.summary = ""
        _mock_sessions(bot, {"ch1": session1})
        bot.sessions.token_budget = 128000
        bot.sessions.persist_directory = "/nonexistent"
        stats = collect_session_stats(bot)
        assert stats.over_budget_count == 1

    def test_per_session_data(self):
        bot = MagicMock()
        session1 = MagicMock()
        session1.estimated_tokens = 1000
        session1.messages = [1]
        session1.summary = "has summary"
        _mock_sessions(bot, {"chan_42": session1})
        bot.sessions.token_budget = 128000
        bot.sessions.persist_directory = "/nonexistent"
        stats = collect_session_stats(bot)
        assert len(stats.per_session) == 1
        ps = stats.per_session[0]
        assert ps["channel_id"] == "chan_42"
        assert ps["tokens"] == 1000
        assert ps["messages"] == 1
        assert ps["has_summary"] is True

    def test_zero_token_budget(self):
        bot = MagicMock()
        session1 = MagicMock()
        session1.estimated_tokens = 5000
        session1.messages = []
        session1.summary = ""
        _mock_sessions(bot, {"ch1": session1})
        bot.sessions.token_budget = 0
        bot.sessions.persist_directory = "/nonexistent"
        stats = collect_session_stats(bot)
        assert stats.over_budget_count == 0

    def test_exception_handling(self):
        bot = MagicMock()
        bot.sessions.count.side_effect = Exception("boom")
        stats = collect_session_stats(bot)
        assert stats.active_count == 0

    def test_persist_dir_scanning(self):
        bot = MagicMock()
        _mock_sessions(bot, {})
        bot.sessions.token_budget = 128000
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "sess.json").write_text("{}")
            bot.sessions.persist_directory = td
            stats = collect_session_stats(bot)
            assert stats.persist_dir.file_count == 1


# ---------------------------------------------------------------------------
# collect_knowledge_stats
# ---------------------------------------------------------------------------

class TestCollectKnowledgeStats:
    def test_no_knowledge_store(self):
        bot = MagicMock(spec=[])
        stats = collect_knowledge_stats(bot)
        assert stats.available is False
        assert stats.chunk_count == 0

    def test_none_knowledge(self):
        bot = MagicMock()
        bot.knowledge = None
        stats = collect_knowledge_stats(bot)
        assert stats.available is False

    def test_unavailable_knowledge(self):
        bot = MagicMock()
        bot.knowledge.available = False
        stats = collect_knowledge_stats(bot)
        assert stats.available is False

    def test_with_knowledge(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 100
        bot.knowledge._has_vec = True
        bot.knowledge.list_sources.return_value = [
            {"source": "doc.md", "chunks": 5, "uploader": "admin"},
            {"source": "faq.md", "chunks": 3, "uploader": "system"},
        ]
        bot.knowledge._db_path = None
        bot.knowledge._conn = None
        stats = collect_knowledge_stats(bot)
        assert stats.available is True
        assert stats.chunk_count == 100
        assert stats.vector_search is True
        assert stats.source_count == 2
        assert len(stats.sources) == 2

    def test_fts_only(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 50
        bot.knowledge._has_vec = False
        bot.knowledge.list_sources.return_value = []
        bot.knowledge._db_path = None
        bot.knowledge._conn = None
        stats = collect_knowledge_stats(bot)
        assert stats.vector_search is False

    def test_db_path_attribute(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 0
        bot.knowledge._has_vec = False
        bot.knowledge.list_sources.return_value = []
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            f.write(b"testdata")
            f.flush()
            bot.knowledge._db_path = f.name
            try:
                stats = collect_knowledge_stats(bot)
                assert stats.db_file.file_count == 1
                assert stats.db_file.total_bytes == 8
            finally:
                os.unlink(f.name)

    def test_db_via_pragma(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 0
        bot.knowledge._has_vec = False
        bot.knowledge.list_sources.return_value = []
        bot.knowledge._db_path = None
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            f.write(b"pragma-test")
            f.flush()
            bot.knowledge._conn.execute.return_value.fetchone.return_value = (0, "main", f.name)
            try:
                stats = collect_knowledge_stats(bot)
                assert stats.db_file.file_count == 1
            finally:
                os.unlink(f.name)

    def test_list_sources_exception(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 10
        bot.knowledge._has_vec = False
        bot.knowledge.list_sources.side_effect = Exception("db error")
        bot.knowledge._db_path = None
        bot.knowledge._conn = None
        stats = collect_knowledge_stats(bot)
        assert stats.chunk_count == 10
        assert stats.source_count == 0

    def test_exception_handling(self):
        bot = MagicMock()
        type(bot).knowledge = PropertyMock(side_effect=Exception("boom"))
        stats = collect_knowledge_stats(bot)
        assert stats.available is False

    def test_sources_field_mapping(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 5
        bot.knowledge._has_vec = False
        bot.knowledge.list_sources.return_value = [
            {"source": "test.pdf", "chunks": 3, "uploader": "user1", "extra": "ignored"},
        ]
        bot.knowledge._db_path = None
        bot.knowledge._conn = None
        stats = collect_knowledge_stats(bot)
        assert stats.sources[0] == {"source": "test.pdf", "chunks": 3, "uploader": "user1"}


# ---------------------------------------------------------------------------
# collect_trajectory_stats
# ---------------------------------------------------------------------------

class TestCollectTrajectoryStats:
    def test_no_trajectory_saver(self):
        bot = MagicMock(spec=[])
        stats = collect_trajectory_stats(bot)
        assert stats.message_count == 0
        assert stats.agent_count == 0

    def test_none_trajectory_saver(self):
        bot = MagicMock()
        bot.trajectory_saver = None
        bot.agent_trajectory_saver = None
        stats = collect_trajectory_stats(bot)
        assert stats.message_count == 0
        assert stats.agent_count == 0

    def test_with_message_trajectories(self):
        bot = MagicMock()
        bot.agent_trajectory_saver = None
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "2024-01-01.jsonl").write_text('{"a":1}\n')
            (Path(td) / "2024-01-02.jsonl").write_text('{"b":2}\n')
            type(bot.trajectory_saver).count = PropertyMock(return_value=42)
            bot.trajectory_saver.directory = Path(td)
            stats = collect_trajectory_stats(bot)
            assert stats.message_count == 42
            assert stats.message_dir.file_count == 2
            assert len(stats.message_files) == 2
            assert "2024-01-01.jsonl" in stats.message_files

    def test_with_agent_trajectories(self):
        bot = MagicMock()
        bot.trajectory_saver = None
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "2024-01-01.jsonl").write_text('{"agent":1}\n')
            type(bot.agent_trajectory_saver).count = PropertyMock(return_value=7)
            bot.agent_trajectory_saver.directory = Path(td)
            stats = collect_trajectory_stats(bot)
            assert stats.agent_count == 7
            assert stats.agent_dir.file_count == 1
            assert len(stats.agent_files) == 1

    def test_both_trajectories(self):
        bot = MagicMock()
        with tempfile.TemporaryDirectory() as td1:
            with tempfile.TemporaryDirectory() as td2:
                (Path(td1) / "2024-01-01.jsonl").write_text('{"m":1}\n')
                (Path(td2) / "2024-01-01.jsonl").write_text('{"a":1}\n')
                type(bot.trajectory_saver).count = PropertyMock(return_value=10)
                bot.trajectory_saver.directory = Path(td1)
                type(bot.agent_trajectory_saver).count = PropertyMock(return_value=5)
                bot.agent_trajectory_saver.directory = Path(td2)
                stats = collect_trajectory_stats(bot)
                assert stats.message_count == 10
                assert stats.agent_count == 5

    def test_nonexistent_directory(self):
        bot = MagicMock()
        bot.agent_trajectory_saver = None
        type(bot.trajectory_saver).count = PropertyMock(return_value=0)
        bot.trajectory_saver.directory = Path("/nonexistent/trajectories")
        stats = collect_trajectory_stats(bot)
        assert stats.message_count == 0
        assert stats.message_files == []

    def test_ignores_non_jsonl_files(self):
        bot = MagicMock()
        bot.agent_trajectory_saver = None
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "2024-01-01.jsonl").write_text('{"a":1}\n')
            (Path(td) / "readme.txt").write_text("not jsonl")
            type(bot.trajectory_saver).count = PropertyMock(return_value=1)
            bot.trajectory_saver.directory = Path(td)
            stats = collect_trajectory_stats(bot)
            assert len(stats.message_files) == 1
            assert stats.message_files[0] == "2024-01-01.jsonl"

    def test_exception_handling_message(self):
        bot = MagicMock()
        bot.agent_trajectory_saver = None
        type(bot).trajectory_saver = PropertyMock(side_effect=Exception("boom"))
        stats = collect_trajectory_stats(bot)
        assert stats.message_count == 0

    def test_exception_handling_agent(self):
        bot = MagicMock()
        bot.trajectory_saver = None
        type(bot).agent_trajectory_saver = PropertyMock(side_effect=Exception("boom"))
        stats = collect_trajectory_stats(bot)
        assert stats.agent_count == 0

    def test_count_as_callable(self):
        bot = MagicMock()
        bot.agent_trajectory_saver = None
        count_fn = MagicMock(return_value=99)
        bot.trajectory_saver.count = count_fn
        bot.trajectory_saver.directory = Path("/nonexistent/traj")
        stats = collect_trajectory_stats(bot)
        assert stats.message_count == 99


# ---------------------------------------------------------------------------
# collect_all
# ---------------------------------------------------------------------------

class TestCollectAll:
    def _make_bot(self):
        bot = MagicMock()
        _mock_sessions(bot, {})
        bot.sessions.token_budget = 128000
        bot.sessions.persist_directory = "/nonexistent/sessions"
        bot.knowledge = None
        bot.trajectory_saver = None
        bot.agent_trajectory_saver = None
        return bot

    def test_returns_all_sections(self):
        bot = self._make_bot()
        result = collect_all(bot)
        assert "sessions" in result
        assert "knowledge" in result
        assert "trajectories" in result
        assert "storage_total_bytes" in result
        assert "storage_total_mb" in result
        assert "collected_at" in result

    def test_collected_at_is_iso(self):
        bot = self._make_bot()
        result = collect_all(bot)
        from datetime import datetime
        dt = datetime.fromisoformat(result["collected_at"])
        assert dt is not None

    def test_storage_total_aggregation(self):
        bot = self._make_bot()
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "file.json").write_text("x" * 1000)
            bot.sessions.persist_directory = td
            result = collect_all(bot)
            assert result["storage_total_bytes"] >= 1000

    def test_sessions_section_has_keys(self):
        bot = self._make_bot()
        result = collect_all(bot)
        s = result["sessions"]
        assert "active_count" in s
        assert "total_tokens" in s
        assert "total_messages" in s
        assert "persist_dir" in s

    def test_knowledge_section_has_keys(self):
        bot = self._make_bot()
        result = collect_all(bot)
        k = result["knowledge"]
        assert "available" in k
        assert "chunk_count" in k
        assert "source_count" in k
        assert "db_file" in k

    def test_trajectories_section_has_keys(self):
        bot = self._make_bot()
        result = collect_all(bot)
        t = result["trajectories"]
        assert "message_count" in t
        assert "agent_count" in t
        assert "total_count" in t
        assert "combined_bytes" in t
        assert "combined_mb" in t

    def test_zero_storage_total(self):
        bot = self._make_bot()
        result = collect_all(bot)
        assert result["storage_total_mb"] == 0.0

    def test_with_all_subsystems(self):
        bot = MagicMock()
        session1 = MagicMock()
        session1.estimated_tokens = 5000
        session1.messages = [1, 2]
        session1.summary = ""
        _mock_sessions(bot, {"ch1": session1})
        bot.sessions.token_budget = 128000
        bot.sessions.persist_directory = "/nonexistent"

        bot.knowledge.available = True
        bot.knowledge.count.return_value = 50
        bot.knowledge._has_vec = True
        bot.knowledge.list_sources.return_value = []
        bot.knowledge._db_path = None
        bot.knowledge._conn = None

        bot.trajectory_saver = None
        bot.agent_trajectory_saver = None

        result = collect_all(bot)
        assert result["sessions"]["active_count"] == 1
        assert result["knowledge"]["chunk_count"] == 50


# ---------------------------------------------------------------------------
# REST API endpoint
# ---------------------------------------------------------------------------

class TestResourceUsageAPI:
    @staticmethod
    def _make_bot():
        bot = MagicMock()
        bot.is_ready.return_value = True
        bot.guilds = []
        _mock_sessions(bot, {})
        bot.sessions.token_budget = 128000
        bot.sessions.persist_directory = "/nonexistent"
        bot.sessions.get_session_token_usage.return_value = {}
        bot.sessions.get_token_metrics.return_value = {}
        bot.sessions.get_activity_metrics.return_value = {}
        bot.knowledge = None
        bot.trajectory_saver = None
        bot.agent_trajectory_saver = None
        bot.cost_tracker.get_totals.return_value = {}
        bot.cost_tracker.get_summary.return_value = {}
        bot.loop_manager.active_count = 0
        bot.scheduler.list_all.return_value = []
        bot.agent_manager._agents = {}
        bot.tool_executor._process_registry._processes = {}
        bot.tool_executor.config.hosts = {}
        bot.tool_executor.ssh_pool = None
        bot.tool_executor._browser_manager = None
        bot.infra_watcher = None
        bot.config.web.api_token = ""
        bot.config.web.session_timeout_minutes = 30
        bot.config.model_dump.return_value = {}
        bot.skill_manager.list_skills.return_value = []
        bot._merged_tool_definitions.return_value = []
        bot._start_time = 0
        return bot

    @pytest.mark.asyncio
    async def test_resource_usage_endpoint(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = self._make_bot()
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/resource-usage")
            assert resp.status == 200
            data = await resp.json()
            assert "sessions" in data
            assert "knowledge" in data
            assert "trajectories" in data
            assert "storage_total_bytes" in data
            assert "collected_at" in data

    @pytest.mark.asyncio
    async def test_resource_usage_has_session_data(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = self._make_bot()
        session1 = MagicMock()
        session1.estimated_tokens = 3000
        session1.messages = [1]
        session1.summary = ""
        _mock_sessions(bot, {"ch1": session1})

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/resource-usage")
            data = await resp.json()
            assert data["sessions"]["active_count"] == 1
            assert data["sessions"]["total_tokens"] == 3000

    @pytest.mark.asyncio
    async def test_resource_usage_has_trajectory_section(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = self._make_bot()
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/resource-usage")
            data = await resp.json()
            traj = data["trajectories"]
            assert "message_count" in traj
            assert "agent_count" in traj
            assert "total_count" in traj


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

class TestExports:
    def test_module_imports(self):
        from src.monitoring.resource_usage import (
            DirStats,
            KnowledgeStats,
            SessionStats,
            TrajectoryStats,
            collect_all,
            collect_knowledge_stats,
            collect_session_stats,
            collect_trajectory_stats,
            scan_directory,
            scan_file,
        )
        assert callable(collect_all)
        assert callable(scan_directory)
        assert callable(scan_file)

    def test_init_exports(self):
        from src.monitoring import (
            DirStats,
            KnowledgeStats,
            SessionStats,
            TrajectoryStats,
            collect_all,
            collect_knowledge_stats,
            collect_session_stats,
            collect_trajectory_stats,
            scan_directory,
            scan_file,
        )
        assert callable(collect_all)

    def test_dirstats_is_dataclass(self):
        import dataclasses
        assert dataclasses.is_dataclass(DirStats)

    def test_session_stats_is_dataclass(self):
        import dataclasses
        assert dataclasses.is_dataclass(SessionStats)

    def test_knowledge_stats_is_dataclass(self):
        import dataclasses
        assert dataclasses.is_dataclass(KnowledgeStats)

    def test_trajectory_stats_is_dataclass(self):
        import dataclasses
        assert dataclasses.is_dataclass(TrajectoryStats)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_scan_directory_with_file_path(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"test")
            try:
                ds = scan_directory(f.name)
                assert ds.file_count == 0
            finally:
                os.unlink(f.name)

    def test_collect_all_empty_bot(self):
        bot = MagicMock(spec=[])
        result = collect_all(bot)
        assert result["sessions"]["active_count"] == 0
        assert result["knowledge"]["available"] is False
        assert result["trajectories"]["message_count"] == 0
        assert result["storage_total_bytes"] == 0

    def test_session_stats_no_persist_dir_attr(self):
        bot = MagicMock()
        _mock_sessions(bot, {})
        bot.sessions.token_budget = 0
        del bot.sessions.persist_directory
        stats = collect_session_stats(bot)
        assert isinstance(stats.persist_dir, DirStats)

    def test_knowledge_no_db_path_no_conn(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 0
        bot.knowledge._has_vec = False
        bot.knowledge.list_sources.return_value = []
        bot.knowledge._db_path = None
        bot.knowledge._conn = None
        stats = collect_knowledge_stats(bot)
        assert stats.db_file.file_count == 0

    def test_trajectory_count_is_property(self):
        bot = MagicMock()
        bot.agent_trajectory_saver = None
        type(bot.trajectory_saver).count = PropertyMock(return_value=33)
        bot.trajectory_saver.directory = Path("/nonexistent")
        stats = collect_trajectory_stats(bot)
        assert stats.message_count == 33

    def test_collect_all_storage_total_sums(self):
        bot = MagicMock()
        _mock_sessions(bot, {})
        bot.sessions.token_budget = 0
        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "s1.json").write_text("x" * 500)
            bot.sessions.persist_directory = td
            bot.knowledge = None
            bot.trajectory_saver = None
            bot.agent_trajectory_saver = None
            result = collect_all(bot)
            assert result["storage_total_bytes"] >= 500

    def test_dirstats_to_dict_includes_all_keys(self):
        ds = DirStats(path="/x", file_count=1, total_bytes=100)
        d = ds.to_dict()
        assert set(d.keys()) == {"path", "file_count", "total_bytes", "total_mb"}

    def test_session_stats_to_dict_includes_all_keys(self):
        ss = SessionStats()
        d = ss.to_dict()
        expected_keys = {"active_count", "total_tokens", "total_messages",
                         "over_budget_count", "token_budget", "persist_dir", "per_session"}
        assert set(d.keys()) == expected_keys

    def test_knowledge_stats_to_dict_includes_all_keys(self):
        ks = KnowledgeStats()
        d = ks.to_dict()
        expected_keys = {"available", "chunk_count", "source_count",
                         "vector_search", "db_file", "sources"}
        assert set(d.keys()) == expected_keys

    def test_trajectory_stats_to_dict_includes_all_keys(self):
        ts = TrajectoryStats()
        d = ts.to_dict()
        expected_keys = {"message_count", "agent_count", "total_count",
                         "message_dir", "agent_dir", "combined_bytes", "combined_mb",
                         "message_files", "agent_files"}
        assert set(d.keys()) == expected_keys
