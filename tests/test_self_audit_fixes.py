"""Tests for PR #18 — Odin's self-audit findings, fixed.

Each class locks the behavior of one finding-and-fix pair so future
edits can't silently regress the security/correctness properties.
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ====================================================================
# Finding #1 — Grafana webhook fail-close
# ====================================================================

class TestGrafanaWebhookFailClose:
    """_webhook_grafana and _webhook_generic used to accept
    unauthenticated POSTs whenever the shared secret was empty.
    _verify_shared_secret now fails closed."""

    def test_verify_shared_secret_rejects_empty_secret(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        hs = HealthServer.__new__(HealthServer)
        hs._webhook_config = WebhookConfig(secret="")
        assert hs._verify_shared_secret("any-value") is False

    def test_verify_shared_secret_rejects_bad_token(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        hs = HealthServer.__new__(HealthServer)
        hs._webhook_config = WebhookConfig(secret="correct-secret")
        assert hs._verify_shared_secret("wrong") is False

    def test_verify_shared_secret_accepts_matching_token(self):
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        hs = HealthServer.__new__(HealthServer)
        hs._webhook_config = WebhookConfig(secret="correct-secret")
        assert hs._verify_shared_secret("correct-secret") is True

    def test_verify_shared_secret_rejects_empty_header(self):
        """An operator-supplied empty header with a real secret config
        must also fail — empty is not 'match anything'."""
        from src.health.server import HealthServer
        from src.config.schema import WebhookConfig
        hs = HealthServer.__new__(HealthServer)
        hs._webhook_config = WebhookConfig(secret="secret")
        assert hs._verify_shared_secret("") is False


# ====================================================================
# Finding #2 — /api/setup/complete gate after first boot
# ====================================================================

class TestSetupCompleteGate:
    @pytest.mark.asyncio
    async def test_setup_complete_returns_409_when_already_setup(self, tmp_path, monkeypatch):
        """After first boot, the wizard endpoint must refuse to rewrite
        config/env silently."""
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        # Work in a tmpdir so is_setup_needed can see pre-configured files.
        monkeypatch.chdir(tmp_path)
        (tmp_path / "config.yml").write_text(
            "discord:\n  token: real-token\n"
            "tools:\n  hosts:\n    localhost:\n      address: 127.0.0.1\n"
        )
        (tmp_path / ".env").write_text("DISCORD_TOKEN=configured\n")

        bot = MagicMock()
        bot.config = MagicMock()
        bot.config.tools = MagicMock()
        bot.config.tools.audit_log_path = str(tmp_path / "audit.jsonl")
        bot.tool_executor = MagicMock()
        bot.audit = MagicMock()

        app = web.Application()
        app.router.add_routes(create_api_routes(bot))
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/setup/complete",
                json={"discord_token": "new-token"},
            )
            assert resp.status == 409
            data = await resp.json()
            assert "setup already complete" in data["error"]


# ====================================================================
# Finding #3 — SQLite write serialization
# ====================================================================

class TestKnowledgeStoreConcurrency:
    def test_busy_timeout_set(self, tmp_path):
        """Constructor must configure busy_timeout so contended writes
        wait instead of erroring."""
        from src.knowledge.store import KnowledgeStore
        store = KnowledgeStore(str(tmp_path / "k.db"))
        try:
            row = store._conn.execute("PRAGMA busy_timeout").fetchone()
            assert row[0] == 30000
        finally:
            store.close()

    def test_write_lock_exists(self, tmp_path):
        """An asyncio.Lock must exist for write serialization."""
        from src.knowledge.store import KnowledgeStore
        store = KnowledgeStore(str(tmp_path / "k.db"))
        try:
            assert isinstance(store._write_lock, asyncio.Lock)
        finally:
            store.close()

    @pytest.mark.asyncio
    async def test_concurrent_ingest_serializes_cleanly(self, tmp_path):
        """Smoke test: 10 concurrent small ingests under the lock should
        complete without SQLite misuse errors. This is the scenario
        Odin's stress test showed producing a graveyard of errors."""
        from src.knowledge.store import KnowledgeStore
        from src.search.fts import FullTextIndex

        fts = FullTextIndex(str(tmp_path / "fts.db"))
        store = KnowledgeStore(str(tmp_path / "k.db"), fts_index=fts)
        try:
            async def _one(i: int) -> int:
                return await store.ingest(
                    f"content body {i} " * 20,
                    source=f"source-{i}",
                )
            results = await asyncio.gather(*[_one(i) for i in range(10)])
            # All ingests should have succeeded with at least 1 chunk
            assert all(r >= 1 for r in results), (
                f"concurrent ingests produced non-positive chunk counts: {results}"
            )
        finally:
            store.close()


# ====================================================================
# Finding #4 — trajectory_path / audit_log_path in config schema
# ====================================================================

class TestConfigSchemaFields:
    def test_trajectory_path_has_default(self):
        from src.config.schema import ToolsConfig
        cfg = ToolsConfig()
        assert cfg.trajectory_path == "./data/trajectories"

    def test_trajectory_path_honored_from_yaml(self):
        """Explicit value survives Pydantic — no more silent drop."""
        from src.config.schema import ToolsConfig
        cfg = ToolsConfig(trajectory_path="/custom/traj/path")
        assert cfg.trajectory_path == "/custom/traj/path"

    def test_audit_log_path_has_default(self):
        from src.config.schema import ToolsConfig
        cfg = ToolsConfig()
        assert cfg.audit_log_path == "./data/audit.jsonl"

    def test_audit_log_path_honored_from_yaml(self):
        from src.config.schema import ToolsConfig
        cfg = ToolsConfig(audit_log_path="/custom/audit.jsonl")
        assert cfg.audit_log_path == "/custom/audit.jsonl"




