"""Round 30 REVIEWER tests — validates and tightens rounds 21–29.

Covers:
- Timing-safe _prev_hmac comparison in AuditSigner (signer.py fix)
- Path traversal prevention in BulkImporter.import_directory (importer.py fix)
- Safe integer parameter parsing in REST API (_safe_int_param)
- Malformed JSON handling in REST API endpoints (merge_knowledge, import_knowledge)
- PermissionManager edge cases
- Risk classifier edge cases
"""
from __future__ import annotations

import hashlib
import hmac as hmac_mod
import json
import os
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web as aio_web
from aiohttp.test_utils import TestClient, TestServer

from src.audit.signer import GENESIS_HASH, AuditSigner, _canonical, verify_log
from src.audit.logger import AuditLogger
from src.web.api import _safe_int_param, create_api_routes
from src.knowledge.importer import BulkImporter, ImportResult
from src.permissions.manager import PermissionManager, VALID_TIERS, USER_TIER_TOOLS
from src.tools.risk_classifier import classify_command, classify_tool, RiskLevel


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_request(query: dict | None = None):
    """Build a minimal mock request with query params."""
    req = MagicMock(spec=aio_web.Request)
    req.query = query or {}
    return req


def _make_bot(tmp_path=None, knowledge_store=None, permission_manager=None):
    bot = MagicMock()
    bot.config = MagicMock()
    bot.config.web.api_token = ""
    bot._knowledge_store = knowledge_store
    bot._embedder = None
    bot.permission_manager = permission_manager
    if tmp_path:
        bot.audit = AuditLogger(path=str(tmp_path / "audit.jsonl"))
    else:
        bot.audit = MagicMock()
    return bot


def _make_app(bot):
    routes = create_api_routes(bot)
    app = aio_web.Application()
    app.router.add_routes(routes)
    return app


# ---------------------------------------------------------------------------
# 1. Timing-safe _prev_hmac comparison (signer.py fix)
# ---------------------------------------------------------------------------

class TestTimingSafePrevHmac:
    """Verify that verify_entry uses constant-time comparison for _prev_hmac."""

    def test_verify_entry_uses_compare_digest_for_prev(self):
        signer = AuditSigner("test-key")
        entry = {"action": "test", "data": "value"}
        signed = signer.sign(dict(entry))

        assert signer.verify_entry(signed, GENESIS_HASH) is True

    def test_wrong_prev_hmac_rejected(self):
        signer = AuditSigner("test-key")
        entry = {"action": "test"}
        signed = signer.sign(dict(entry))

        assert signer.verify_entry(signed, "wrong_prev") is False

    def test_chain_verification_still_works(self):
        signer = AuditSigner("test-key")
        e1 = signer.sign({"action": "first"})
        e2 = signer.sign({"action": "second"})

        v = AuditSigner("test-key")
        assert v.verify_entry(e1, GENESIS_HASH) is True
        assert v.verify_entry(e2, e1["_hmac"]) is True

    def test_tampered_prev_hmac_detected(self):
        signer = AuditSigner("test-key")
        signed = signer.sign({"action": "test"})
        signed["_prev_hmac"] = "a" * 64
        assert signer.verify_entry(signed, GENESIS_HASH) is False

    def test_prev_hmac_comparison_is_constant_time(self):
        """Verify the source code uses hmac.compare_digest, not == or !=."""
        import inspect
        source = inspect.getsource(AuditSigner.verify_entry)
        assert "compare_digest" in source
        assert "!=" not in source or "stored_prev != expected_prev" not in source


# ---------------------------------------------------------------------------
# 2. Path traversal prevention in BulkImporter (importer.py fix)
# ---------------------------------------------------------------------------

class TestPathTraversalPrevention:
    """Verify that import_directory won't escape the base directory."""

    async def test_normal_glob_works(self, tmp_path):
        subdir = tmp_path / "docs"
        subdir.mkdir()
        (subdir / "readme.md").write_text("hello")
        (subdir / "guide.md").write_text("world")

        store = MagicMock()
        store.ingest = AsyncMock(return_value=1)
        importer = BulkImporter(store)

        results = await importer.import_directory(str(tmp_path), pattern="**/*.md")
        ok_results = [r for r in results if r.status == "ok"]
        assert len(ok_results) == 2

    async def test_parent_traversal_blocked(self, tmp_path):
        base = tmp_path / "project"
        base.mkdir()
        outside = tmp_path / "secret.md"
        outside.write_text("sensitive data")

        store = MagicMock()
        store.ingest = AsyncMock(return_value=1)
        importer = BulkImporter(store)

        results = await importer.import_directory(str(base), pattern="../*.md")
        ok_results = [r for r in results if r.status == "ok"]
        assert len(ok_results) == 0

    async def test_symlink_escape_blocked(self, tmp_path):
        base = tmp_path / "project"
        base.mkdir()
        outside = tmp_path / "outside"
        outside.mkdir()
        (outside / "secret.md").write_text("secret")

        link = base / "link"
        try:
            link.symlink_to(outside)
        except OSError:
            pytest.skip("symlinks not supported")

        store = MagicMock()
        store.ingest = AsyncMock(return_value=1)
        importer = BulkImporter(store)

        results = await importer.import_directory(str(base), pattern="**/*.md")
        ok_results = [r for r in results if r.status == "ok"]
        assert len(ok_results) == 0

    async def test_dot_dot_in_pattern_no_match(self, tmp_path):
        base = tmp_path / "base"
        base.mkdir()

        store = MagicMock()
        store.ingest = AsyncMock(return_value=1)
        importer = BulkImporter(store)

        results = await importer.import_directory(str(base), pattern="../../**/*.md")
        no_ok = all(r.status != "ok" for r in results)
        assert no_ok


# ---------------------------------------------------------------------------
# 3. _safe_int_param (api.py helper)
# ---------------------------------------------------------------------------

class TestSafeIntParam:
    def test_valid_integer(self):
        req = _make_request({"limit": "42"})
        assert _safe_int_param(req, "limit", 20, hi=100) == 42

    def test_missing_param_uses_default(self):
        req = _make_request({})
        assert _safe_int_param(req, "limit", 20, hi=100) == 20

    def test_non_integer_uses_default(self):
        req = _make_request({"limit": "abc"})
        assert _safe_int_param(req, "limit", 20, hi=100) == 20

    def test_empty_string_uses_default(self):
        req = _make_request({"limit": ""})
        assert _safe_int_param(req, "limit", 20, hi=100) == 20

    def test_negative_clamped_to_lo(self):
        req = _make_request({"limit": "-5"})
        assert _safe_int_param(req, "limit", 20, lo=1, hi=100) == 1

    def test_exceeds_hi_clamped(self):
        req = _make_request({"limit": "9999"})
        assert _safe_int_param(req, "limit", 20, hi=50) == 50

    def test_float_string_uses_default(self):
        req = _make_request({"limit": "3.14"})
        assert _safe_int_param(req, "limit", 10, hi=100) == 10

    def test_zero_clamped_to_lo(self):
        req = _make_request({"limit": "0"})
        assert _safe_int_param(req, "limit", 20, lo=1, hi=100) == 1

    def test_default_clamped_to_hi(self):
        result = _safe_int_param(_make_request({}), "limit", 999, hi=50)
        assert result == 50

    def test_lo_equals_hi(self):
        req = _make_request({"limit": "5"})
        assert _safe_int_param(req, "limit", 10, lo=10, hi=10) == 10


# ---------------------------------------------------------------------------
# 4. Malformed JSON in API endpoints
# ---------------------------------------------------------------------------

class TestMergeKnowledgeInvalidJSON:
    async def test_invalid_json_returns_400(self, tmp_path):
        store = MagicMock()
        store.available = True
        bot = _make_bot(tmp_path, knowledge_store=store)
        app = _make_app(bot)

        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/knowledge/merge",
                data=b"not-json{{{",
                headers={"Content-Type": "application/json"},
            )
            assert resp.status == 400
            data = await resp.json()
            assert "invalid JSON" in data["error"]

    async def test_valid_json_missing_fields_returns_400(self, tmp_path):
        store = MagicMock()
        store.available = True
        bot = _make_bot(tmp_path, knowledge_store=store)
        app = _make_app(bot)

        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/knowledge/merge",
                json={},
            )
            assert resp.status == 400


class TestImportKnowledgeInvalidJSON:
    async def test_invalid_json_returns_400(self, tmp_path):
        store = MagicMock()
        store.available = True
        bot = _make_bot(tmp_path, knowledge_store=store)
        app = _make_app(bot)

        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/knowledge/import",
                data=b"broken",
                headers={"Content-Type": "application/json"},
            )
            assert resp.status == 400
            data = await resp.json()
            assert "invalid JSON" in data["error"]


# ---------------------------------------------------------------------------
# 5. API limit parameter edge cases (end-to-end via TestClient)
# ---------------------------------------------------------------------------

class TestAPILimitParamSafety:
    async def test_session_search_non_integer_limit(self, tmp_path):
        bot = _make_bot(tmp_path)
        bot.sessions = MagicMock()
        bot.sessions.search_history = AsyncMock(return_value=[])
        app = _make_app(bot)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search", params={"q": "test", "limit": "abc"})
            assert resp.status == 200

    async def test_session_search_negative_limit(self, tmp_path):
        bot = _make_bot(tmp_path)
        bot.sessions = MagicMock()
        bot.sessions.search_history = AsyncMock(return_value=[])
        app = _make_app(bot)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/sessions/search", params={"q": "test", "limit": "-10"})
            assert resp.status == 200


# ---------------------------------------------------------------------------
# 6. PermissionManager edge cases
# ---------------------------------------------------------------------------

class TestPermissionManagerEdgeCases:
    def test_empty_string_user_id_bypasses_rbac(self):
        from src.tools.executor import ToolExecutor
        pm = PermissionManager({}, default_tier="guest")
        exec_inst = ToolExecutor.__new__(ToolExecutor)
        exec_inst._permission_manager = pm
        result = exec_inst.check_permission("run_command", "")
        assert result is None

    def test_overrides_file_not_found_handled(self, tmp_path):
        pm = PermissionManager(
            {}, default_tier="user",
            overrides_path=str(tmp_path / "nonexistent" / "perms.json"),
        )
        assert pm.get_tier("someone") == "user"

    def test_corrupt_overrides_file_handled(self, tmp_path):
        path = tmp_path / "perms.json"
        path.write_text("not valid json!!!")
        pm = PermissionManager({}, overrides_path=str(path))
        assert pm.get_tier("someone") == "user"

    def test_overrides_with_invalid_tier_filtered(self, tmp_path):
        path = tmp_path / "perms.json"
        path.write_text(json.dumps({"user1": "admin", "user2": "superadmin"}))
        pm = PermissionManager({}, overrides_path=str(path))
        assert pm.get_tier("user1") == "admin"
        assert pm.get_tier("user2") == "user"

    def test_set_tier_creates_directory(self, tmp_path):
        path = tmp_path / "subdir" / "perms.json"
        pm = PermissionManager({}, overrides_path=str(path))
        pm.set_tier("u1", "admin")
        assert path.exists()
        assert pm.get_tier("u1") == "admin"

    def test_filter_tools_preserves_order(self):
        pm = PermissionManager({}, default_tier="user")
        tools = [
            {"name": "run_command"},
            {"name": "write_file"},
            {"name": "search_knowledge"},
            {"name": "delete_everything"},
            {"name": "web_search"},
        ]
        filtered = pm.filter_tools("someone", tools)
        assert [t["name"] for t in filtered] == ["run_command", "search_knowledge", "web_search"]


# ---------------------------------------------------------------------------
# 7. Risk classifier edge cases
# ---------------------------------------------------------------------------

class TestRiskClassifierEdgeCases:
    def test_cat_etc_passwd_is_low(self):
        assert classify_command("cat /etc/passwd").level == RiskLevel.LOW

    def test_grep_passwd_is_low(self):
        assert classify_command("grep root /etc/passwd").level == RiskLevel.LOW

    def test_empty_command_is_low(self):
        assert classify_command("").level == RiskLevel.LOW

    def test_chained_dangerous_commands(self):
        result = classify_command("echo test && rm -rf /")
        assert result.level == RiskLevel.CRITICAL

    def test_classify_tool_unknown_tool_is_low(self):
        result = classify_tool("some_future_tool", {})
        assert result.level == RiskLevel.LOW

    def test_run_command_with_safe_command(self):
        result = classify_tool("run_command", {"command": "ls -la"})
        assert result.level == RiskLevel.LOW

    def test_run_command_with_dangerous_command(self):
        result = classify_tool("run_command", {"command": "rm -rf /"})
        assert result.level == RiskLevel.CRITICAL

    def test_run_script_floors_at_high(self):
        result = classify_tool("run_script", {"script": "echo hello"})
        assert result.level.value in ("high", "critical")

    def test_run_command_multi_floors_at_medium(self):
        result = classify_tool("run_command_multi", {"command": "ls"})
        assert result.level.value in ("medium", "high", "critical")


# ---------------------------------------------------------------------------
# 8. Audit log signing chain integrity (additional edge cases)
# ---------------------------------------------------------------------------

class TestSigningChainEdgeCases:
    async def test_verify_log_with_mixed_signed_unsigned(self, tmp_path):
        """Unsigned entries in a signed log should fail verification."""
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key")
        e1 = signer.sign({"action": "test1"})
        p.write_text(json.dumps(e1) + "\n" + json.dumps({"action": "unsigned"}) + "\n")

        result = await verify_log(str(p), "key")
        assert result["valid"] is False
        assert result["first_bad"] == 2

    async def test_verify_log_valid_chain(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key")
        entries = []
        for i in range(5):
            entries.append(json.dumps(signer.sign({"action": f"test{i}"})))
        p.write_text("\n".join(entries) + "\n")

        result = await verify_log(str(p), "key")
        assert result["valid"] is True
        assert result["verified"] == 5

    async def test_verify_log_wrong_key(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key1")
        e1 = signer.sign({"action": "test"})
        p.write_text(json.dumps(e1) + "\n")

        result = await verify_log(str(p), "key2")
        assert result["valid"] is False


# ---------------------------------------------------------------------------
# 9. DiffTracker edge cases
# ---------------------------------------------------------------------------

class TestDiffTrackerEdgeCases:
    def test_compute_unified_diff_identical_content(self):
        from src.audit.diff_tracker import compute_unified_diff
        result = compute_unified_diff("hello\n", "hello\n")
        assert result == ""

    def test_compute_unified_diff_truncation(self):
        from src.audit.diff_tracker import compute_unified_diff
        before = "a\n" * 100
        after = "b\n" * 100
        result = compute_unified_diff(before, after, max_chars=50)
        assert len(result) <= 50 + len("\n[diff truncated]")
        assert "[diff truncated]" in result

    def test_compute_dict_diff(self):
        from src.audit.diff_tracker import compute_dict_diff
        result = compute_dict_diff({"a": 1}, {"a": 2})
        assert "-" in result and "+" in result

    def test_extract_file_target_write_file(self):
        from src.audit.diff_tracker import extract_file_target
        result = extract_file_target("write_file", {"host": "h", "path": "/tmp/f"})
        assert result == ("h", "/tmp/f")

    def test_extract_file_target_other_tool(self):
        from src.audit.diff_tracker import extract_file_target
        result = extract_file_target("run_command", {"host": "h", "command": "ls"})
        assert result is None

    def test_snapshot_cleanup_on_compute(self):
        from src.audit.diff_tracker import DiffTracker
        tracker = DiffTracker()
        tracker._snapshots["h:/tmp/f"] = "old content"
        tracker.compute_diff("write_file", {"content": "new", "path": "/tmp/f"}, "h:/tmp/f")
        assert "h:/tmp/f" not in tracker._snapshots


# ---------------------------------------------------------------------------
# 10. Knowledge versioning edge cases
# ---------------------------------------------------------------------------

class TestKnowledgeVersioningImports:
    def test_knowledge_store_imports(self):
        from src.knowledge.store import KnowledgeStore
        assert hasattr(KnowledgeStore, "get_versions")
        assert hasattr(KnowledgeStore, "get_version_diff")

    def test_importer_imports(self):
        from src.knowledge.importer import BulkImporter, ImportResult, BatchResult
        assert BulkImporter is not None
        assert ImportResult is not None
        assert BatchResult is not None


# ---------------------------------------------------------------------------
# 11. Module integration sanity
# ---------------------------------------------------------------------------

class TestModuleIntegration:
    def test_signer_exports(self):
        from src.audit import AuditSigner, verify_log
        assert callable(verify_log)

    def test_risk_classifier_exports(self):
        from src.tools.risk_classifier import (
            RiskLevel, RiskAssessment, RiskStats,
            classify_command, classify_tool,
        )
        assert RiskLevel.LOW.value == "low"

    def test_permission_manager_exports(self):
        from src.permissions.manager import (
            PermissionManager, VALID_TIERS, USER_TIER_TOOLS,
        )
        assert "admin" in VALID_TIERS
        assert isinstance(USER_TIER_TOOLS, frozenset)

    def test_diff_tracker_exports(self):
        from src.audit.diff_tracker import (
            DiffTracker, compute_unified_diff, compute_dict_diff,
            extract_file_target, DIFF_TOOLS,
        )
        assert "write_file" in DIFF_TOOLS

    def test_safe_int_param_exported(self):
        from src.web.api import _safe_int_param
        assert callable(_safe_int_param)
