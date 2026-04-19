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


# ====================================================================
# Finding #5 — _tokenize preserves short technical tokens
# ====================================================================

class TestTokenizeShortTechnical:
    def test_db_preserved(self):
        from src.trajectories.replay import _tokenize
        assert "db" in _tokenize("restart the db")

    def test_k8s_preserved(self):
        from src.trajectories.replay import _tokenize
        assert "k8s" in _tokenize("check k8s pods")

    def test_io_vm_tls_all_preserved(self):
        from src.trajectories.replay import _tokenize
        toks = _tokenize("the io on the vm is failing tls")
        assert {"io", "vm", "tls"}.issubset(toks)

    def test_common_english_shorts_still_dropped(self):
        """'to', 'of', 'in' are noise — must not be kept."""
        from src.trajectories.replay import _tokenize
        toks = _tokenize("go to the office in the morning of april")
        assert "to" not in toks
        assert "of" not in toks
        assert "in" not in toks


# ====================================================================
# Finding #6 — load_trajectory_index skips old partition files
# ====================================================================

class TestTrajectoryIndexPrefilter:
    def test_old_partitions_skipped(self, tmp_path):
        """Files whose YYYY-MM-DD is well before since_epoch are not opened."""
        from src.learning.runbook_detector import load_trajectory_index
        # Write two partitions: one very old, one current.
        old_file = tmp_path / "2024-01-15.jsonl"
        old_file.write_text(json.dumps({
            "timestamp": "2024-01-15T10:00:00Z",
            "channel_id": "c", "user_id": "a", "user_content": "ancient",
            "is_error": False,
        }) + "\n")
        new_file = tmp_path / "2026-04-19.jsonl"
        new_file.write_text(json.dumps({
            "timestamp": "2026-04-19T10:00:00Z",
            "channel_id": "c", "user_id": "a", "user_content": "current",
            "is_error": False,
        }) + "\n")
        # since_epoch = start of 2026-04-18 UTC — old file's date is way before,
        # new file is after.
        cutoff = datetime(2026, 4, 18, tzinfo=timezone.utc).timestamp()
        index = load_trajectory_index(tmp_path, since_epoch=cutoff)
        # Only the new entry should be indexed.
        entries = [r for recs in index.values() for r in recs]
        assert len(entries) == 1
        assert entries[0].user_content == "current"

    def test_non_standard_filename_not_skipped(self, tmp_path):
        """Filenames that don't match YYYY-MM-DD.jsonl are scanned (we
        don't want to accidentally skip operator-renamed files)."""
        from src.learning.runbook_detector import load_trajectory_index
        odd = tmp_path / "weird-name.jsonl"
        odd.write_text(json.dumps({
            "timestamp": "2026-04-19T10:00:00Z",
            "channel_id": "c", "user_id": "a", "user_content": "odd",
            "is_error": False,
        }) + "\n")
        cutoff = datetime(2024, 1, 1, tzinfo=timezone.utc).timestamp()
        index = load_trajectory_index(tmp_path, since_epoch=cutoff)
        entries = [r for recs in index.values() for r in recs]
        assert any(r.user_content == "odd" for r in entries)


# ====================================================================
# Finding #7 — trajectory dedup in suggestion building
# ====================================================================

class TestTrajectoryDedup:
    def test_same_trajectory_counted_once(self, tmp_path):
        """Two audit sessions matched to the SAME trajectory should
        contribute a single entry to linked_session_count and
        error_session_fraction."""
        from src.learning.runbook_detector import detect_patterns

        audit = tmp_path / "audit.jsonl"
        traj = tmp_path / "trajectories"
        traj.mkdir()

        # One trajectory turn, two sessions that will both match it.
        t0 = datetime(2026, 4, 18, 10, 0, 0, tzinfo=timezone.utc)
        traj_rec = {
            "timestamp": t0.isoformat().replace("+00:00", "Z"),
            "channel_id": "c1",
            "user_id": "alice",
            "user_name": "alice",
            "user_content": "single user turn with two tool sessions",
            "is_error": True,
            "iterations": [],
        }
        (traj / "2026-04-18.jsonl").write_text(json.dumps(traj_rec) + "\n")

        # Two sessions, both within the 15-min skew window of the turn.
        rows = []
        # Need at least min_frequency=2 distinct sessions
        # Three sessions total so the pattern qualifies
        for i, offset in enumerate([30, 300, 600]):
            sess_start = t0 + timedelta(seconds=offset)
            rows.append({
                "timestamp": (sess_start).isoformat().replace("+00:00", "Z"),
                "user_id": "alice", "user_name": "alice", "channel_id": "c1",
                "tool_name": "read_file",
                "tool_input": {"host": "hostA"},
                "error": None,
            })
            rows.append({
                "timestamp": (sess_start + timedelta(seconds=5)).isoformat().replace("+00:00", "Z"),
                "user_id": "alice", "user_name": "alice", "channel_id": "c1",
                "tool_name": "http_probe",
                "tool_input": {"host": "hostA"},
                "error": None,
            })
        with audit.open("w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")

        now = datetime(2026, 4, 18, 15, 0, 0, tzinfo=timezone.utc)
        # Use a long session_gap_seconds so adjacent tool runs form
        # separate sessions (each offset is > 300s gap threshold).
        suggestions = detect_patterns(
            audit, min_frequency=3, lookback_days=30,
            trajectories_dir=traj,
            session_gap_seconds=100,  # forces 3 separate sessions
            now=now,
        )
        assert suggestions
        s = suggestions[0]
        # Without dedup: linked_session_count would be 3 (one per session
        # all pointing at the same trajectory). With dedup: 1.
        assert s.linked_session_count == 1, (
            f"trajectory dedup failed: linked_session_count = "
            f"{s.linked_session_count}, expected 1"
        )
        # Error fraction also reflects the single distinct trajectory.
        assert s.error_session_fraction == 1.0


# ====================================================================
# Finding #8 — empty-sequence synthesis rejected
# ====================================================================

class TestEmptySequenceRejected:
    def test_empty_sequence_raises(self):
        from src.learning.runbook_detector import RunbookSuggestion
        from src.learning.runbook_synthesizer import synthesize_runbook_code
        s = RunbookSuggestion(
            sequence=[], frequency=0, session_count=0,
            hosts=[], actors=[], first_seen="", last_seen="",
            sample_inputs=[],
        )
        with pytest.raises(ValueError, match="empty sequence"):
            synthesize_runbook_code(s)


# ====================================================================
# Finding #9 — all-safe + empty samples downgrades to hybrid
# ====================================================================

class TestClassifyEmptySamples:
    def test_all_safe_with_populated_samples_is_executable(self):
        from src.learning.runbook_synthesizer import (
            CLASSIFICATION_EXECUTABLE,
            classify_sequence,
        )
        samples = [
            {"tool_name": "http_probe", "host": "h", "input": {"host": "h"}},
            {"tool_name": "read_file", "host": "h", "input": {"host": "h", "path": "/x"}},
        ]
        assert classify_sequence(
            ["http_probe", "read_file"], samples,
        ) == CLASSIFICATION_EXECUTABLE

    def test_all_safe_with_empty_inputs_downgrades_to_hybrid(self):
        """Odin #9: a safe-sequence with empty captured inputs would
        have classified executable under the old rule even though the
        generated skill would call tools with empty dicts."""
        from src.learning.runbook_synthesizer import (
            CLASSIFICATION_HYBRID,
            classify_sequence,
        )
        samples = [
            {"tool_name": "http_probe", "host": None, "input": {}},
            {"tool_name": "read_file", "host": None, "input": {}},
        ]
        assert classify_sequence(
            ["http_probe", "read_file"], samples,
        ) == CLASSIFICATION_HYBRID

    def test_all_safe_with_missing_sample_list_still_executable(self):
        """Back-compat: when no sample_inputs is provided at all,
        behavior falls through to the original executable path."""
        from src.learning.runbook_synthesizer import (
            CLASSIFICATION_EXECUTABLE,
            classify_sequence,
        )
        assert classify_sequence(
            ["http_probe", "read_file"], None,
        ) == CLASSIFICATION_EXECUTABLE
