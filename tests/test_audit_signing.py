"""Tests for audit log HMAC chain signing — Round 27.

Covers: AuditSigner, verify_log, AuditLogger signing integration,
chain initialization, verify_integrity, AuditConfig, REST /api/audit/verify.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.audit.signer import GENESIS_HASH, AuditSigner, _canonical, verify_log
from src.audit.logger import AuditLogger


# ---------------------------------------------------------------------------
# _canonical helper
# ---------------------------------------------------------------------------

class TestCanonical:
    def test_sorted_keys(self):
        result = _canonical({"z": 1, "a": 2, "_prev_hmac": "x"})
        parsed = json.loads(result)
        assert list(parsed.keys()) == ["_prev_hmac", "a", "z"]

    def test_excludes_hmac(self):
        result = _canonical({"a": 1, "_hmac": "secret"})
        assert "_hmac" not in result

    def test_no_whitespace(self):
        result = _canonical({"a": 1, "b": [1, 2]})
        assert " " not in result

    def test_preserves_prev_hmac(self):
        result = _canonical({"_prev_hmac": "abc", "data": 1})
        parsed = json.loads(result)
        assert parsed["_prev_hmac"] == "abc"

    def test_empty_dict(self):
        result = _canonical({})
        assert result == "{}"

    def test_nested_dict(self):
        result = _canonical({"a": {"z": 1, "a": 2}})
        parsed = json.loads(result)
        assert parsed == {"a": {"z": 1, "a": 2}}

    def test_default_str_for_non_serializable(self):
        from datetime import datetime, timezone
        dt = datetime(2025, 1, 1, tzinfo=timezone.utc)
        result = _canonical({"ts": dt})
        assert "2025" in result


# ---------------------------------------------------------------------------
# GENESIS_HASH
# ---------------------------------------------------------------------------

class TestGenesisHash:
    def test_is_64_zeros(self):
        assert GENESIS_HASH == "0" * 64

    def test_is_string(self):
        assert isinstance(GENESIS_HASH, str)


# ---------------------------------------------------------------------------
# AuditSigner
# ---------------------------------------------------------------------------

class TestAuditSigner:
    def test_init_sets_key(self):
        signer = AuditSigner("test-key")
        assert signer._key == b"test-key"

    def test_init_prev_hmac_is_genesis(self):
        signer = AuditSigner("key")
        assert signer.prev_hmac == GENESIS_HASH

    def test_sign_adds_hmac_fields(self):
        signer = AuditSigner("key")
        entry = {"tool_name": "test", "data": 42}
        result = signer.sign(entry)
        assert "_hmac" in result
        assert "_prev_hmac" in result
        assert result is entry  # mutates in place

    def test_sign_first_entry_prev_is_genesis(self):
        signer = AuditSigner("key")
        entry = {"a": 1}
        signer.sign(entry)
        assert entry["_prev_hmac"] == GENESIS_HASH

    def test_sign_chains_hmac(self):
        signer = AuditSigner("key")
        e1 = {"seq": 1}
        signer.sign(e1)
        e2 = {"seq": 2}
        signer.sign(e2)
        assert e2["_prev_hmac"] == e1["_hmac"]
        assert e1["_hmac"] != e2["_hmac"]

    def test_sign_deterministic(self):
        s1 = AuditSigner("key")
        s2 = AuditSigner("key")
        e1 = {"a": 1}
        e2 = {"a": 1}
        s1.sign(e1)
        s2.sign(e2)
        assert e1["_hmac"] == e2["_hmac"]

    def test_sign_different_keys_different_hmacs(self):
        s1 = AuditSigner("key1")
        s2 = AuditSigner("key2")
        e1 = {"a": 1}
        e2 = {"a": 1}
        s1.sign(e1)
        s2.sign(e2)
        assert e1["_hmac"] != e2["_hmac"]

    def test_sign_updates_prev_hmac(self):
        signer = AuditSigner("key")
        entry = {"a": 1}
        signer.sign(entry)
        assert signer.prev_hmac == entry["_hmac"]

    def test_prev_hmac_setter(self):
        signer = AuditSigner("key")
        signer.prev_hmac = "abc123"
        assert signer.prev_hmac == "abc123"

    def test_hmac_is_sha256_hex(self):
        signer = AuditSigner("key")
        entry = {"a": 1}
        signer.sign(entry)
        assert len(entry["_hmac"]) == 64
        int(entry["_hmac"], 16)  # valid hex

    def test_sign_three_entry_chain(self):
        signer = AuditSigner("key")
        entries = [{"seq": i} for i in range(3)]
        for e in entries:
            signer.sign(e)
        assert entries[0]["_prev_hmac"] == GENESIS_HASH
        assert entries[1]["_prev_hmac"] == entries[0]["_hmac"]
        assert entries[2]["_prev_hmac"] == entries[1]["_hmac"]


# ---------------------------------------------------------------------------
# AuditSigner.verify_entry
# ---------------------------------------------------------------------------

class TestVerifyEntry:
    def test_valid_entry(self):
        signer = AuditSigner("key")
        entry = {"data": "test"}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(entry, GENESIS_HASH)

    def test_tampered_data(self):
        signer = AuditSigner("key")
        entry = {"data": "test"}
        signer.sign(entry)
        entry["data"] = "tampered"
        verifier = AuditSigner("key")
        assert not verifier.verify_entry(entry, GENESIS_HASH)

    def test_tampered_hmac(self):
        signer = AuditSigner("key")
        entry = {"data": "test"}
        signer.sign(entry)
        entry["_hmac"] = "a" * 64
        verifier = AuditSigner("key")
        assert not verifier.verify_entry(entry, GENESIS_HASH)

    def test_wrong_prev(self):
        signer = AuditSigner("key")
        entry = {"data": "test"}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert not verifier.verify_entry(entry, "wrong_prev")

    def test_missing_hmac_field(self):
        signer = AuditSigner("key")
        entry = {"data": "test", "_prev_hmac": GENESIS_HASH}
        assert not signer.verify_entry(entry, GENESIS_HASH)

    def test_missing_prev_hmac_field(self):
        signer = AuditSigner("key")
        entry = {"data": "test", "_hmac": "abc"}
        assert not signer.verify_entry(entry, GENESIS_HASH)

    def test_wrong_key_fails(self):
        signer = AuditSigner("key1")
        entry = {"data": "test"}
        signer.sign(entry)
        verifier = AuditSigner("key2")
        assert not verifier.verify_entry(entry, GENESIS_HASH)

    def test_chain_verification(self):
        signer = AuditSigner("key")
        e1 = {"seq": 1}
        signer.sign(e1)
        e2 = {"seq": 2}
        signer.sign(e2)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(e1, GENESIS_HASH)
        assert verifier.verify_entry(e2, e1["_hmac"])

    def test_entry_with_extra_fields(self):
        signer = AuditSigner("key")
        entry = {"data": "test", "extra": "field"}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(entry, GENESIS_HASH)

    def test_entry_with_diff(self):
        signer = AuditSigner("key")
        entry = {"tool_name": "write_file", "diff": "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new"}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(entry, GENESIS_HASH)


# ---------------------------------------------------------------------------
# verify_log (async, file-level)
# ---------------------------------------------------------------------------

class TestVerifyLog:
    async def test_empty_file(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        p.write_text("")
        result = await verify_log(p, "key")
        assert result["valid"] is True
        assert result["total"] == 0
        assert result["verified"] == 0

    async def test_nonexistent_file(self, tmp_path):
        p = tmp_path / "missing.jsonl"
        result = await verify_log(p, "key")
        assert result["valid"] is True
        assert result["total"] == 0

    async def test_valid_chain(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key")
        lines = []
        for i in range(5):
            entry = {"seq": i, "data": f"entry-{i}"}
            signer.sign(entry)
            lines.append(json.dumps(entry, default=str))
        p.write_text("\n".join(lines) + "\n")
        result = await verify_log(p, "key")
        assert result["valid"] is True
        assert result["total"] == 5
        assert result["verified"] == 5
        assert result["first_bad"] is None
        assert result["error"] is None

    async def test_tampered_entry(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key")
        entries = []
        for i in range(3):
            entry = {"seq": i}
            signer.sign(entry)
            entries.append(entry)
        # Tamper with entry 1
        entries[1]["seq"] = 999
        lines = [json.dumps(e, default=str) for e in entries]
        p.write_text("\n".join(lines) + "\n")
        result = await verify_log(p, "key")
        assert result["valid"] is False
        assert result["first_bad"] == 2  # 1-indexed
        assert "HMAC verification failed" in result["error"]

    async def test_deleted_entry(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key")
        entries = []
        for i in range(3):
            entry = {"seq": i}
            signer.sign(entry)
            entries.append(entry)
        # Delete the middle entry (chain break)
        lines = [json.dumps(entries[0], default=str), json.dumps(entries[2], default=str)]
        p.write_text("\n".join(lines) + "\n")
        result = await verify_log(p, "key")
        assert result["valid"] is False
        assert result["first_bad"] == 2

    async def test_reordered_entries(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key")
        entries = []
        for i in range(3):
            entry = {"seq": i}
            signer.sign(entry)
            entries.append(entry)
        # Swap entries 1 and 2
        lines = [
            json.dumps(entries[0], default=str),
            json.dumps(entries[2], default=str),
            json.dumps(entries[1], default=str),
        ]
        p.write_text("\n".join(lines) + "\n")
        result = await verify_log(p, "key")
        assert result["valid"] is False

    async def test_invalid_json_line(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        p.write_text("not valid json\n")
        result = await verify_log(p, "key")
        assert result["valid"] is False
        assert "invalid JSON" in result["error"]

    async def test_missing_hmac_field(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        entry = {"data": "unsigned"}
        p.write_text(json.dumps(entry) + "\n")
        result = await verify_log(p, "key")
        assert result["valid"] is False
        assert "missing _hmac" in result["error"]

    async def test_wrong_key(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key1")
        entry = {"data": "test"}
        signer.sign(entry)
        p.write_text(json.dumps(entry, default=str) + "\n")
        result = await verify_log(p, "key2")
        assert result["valid"] is False

    async def test_blank_lines_skipped(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key")
        entry = {"data": "test"}
        signer.sign(entry)
        p.write_text("\n" + json.dumps(entry, default=str) + "\n\n")
        result = await verify_log(p, "key")
        assert result["valid"] is True
        assert result["total"] == 1

    async def test_single_entry(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        signer = AuditSigner("key")
        entry = {"data": "only"}
        signer.sign(entry)
        p.write_text(json.dumps(entry, default=str) + "\n")
        result = await verify_log(p, "key")
        assert result["valid"] is True
        assert result["total"] == 1
        assert result["verified"] == 1


# ---------------------------------------------------------------------------
# AuditLogger with signing
# ---------------------------------------------------------------------------

class TestAuditLoggerSigning:
    async def test_no_signing_by_default(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        assert logger._signer is None

    async def test_signing_enabled_with_key(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"), hmac_key="secret")
        assert logger._signer is not None

    async def test_empty_key_disables_signing(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"), hmac_key="")
        assert logger._signer is None

    async def test_log_execution_adds_hmac(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="secret")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="run_command", tool_input={"cmd": "ls"},
            approved=True, result_summary="ok", execution_time_ms=10,
        )
        line = p.read_text().strip()
        entry = json.loads(line)
        assert "_hmac" in entry
        assert "_prev_hmac" in entry
        assert entry["_prev_hmac"] == GENESIS_HASH

    async def test_log_execution_without_signing(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p))
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="run_command", tool_input={"cmd": "ls"},
            approved=True, result_summary="ok", execution_time_ms=10,
        )
        line = p.read_text().strip()
        entry = json.loads(line)
        assert "_hmac" not in entry
        assert "_prev_hmac" not in entry

    async def test_log_web_action_adds_hmac(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="secret")
        await logger.log_web_action(
            method="PUT", path="/api/config", status=200,
        )
        line = p.read_text().strip()
        entry = json.loads(line)
        assert "_hmac" in entry
        assert entry["_prev_hmac"] == GENESIS_HASH

    async def test_chain_across_mixed_entries(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="secret")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="run_command", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=10,
        )
        await logger.log_web_action(method="GET", path="/api/test", status=200)
        lines = p.read_text().strip().split("\n")
        e1 = json.loads(lines[0])
        e2 = json.loads(lines[1])
        assert e1["_prev_hmac"] == GENESIS_HASH
        assert e2["_prev_hmac"] == e1["_hmac"]

    async def test_signed_log_verifiable(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="mykey")
        for i in range(5):
            await logger.log_execution(
                user_id="u1", user_name="test", channel_id="c1",
                tool_name=f"tool_{i}", tool_input={},
                approved=True, result_summary="ok", execution_time_ms=i,
            )
        result = await verify_log(p, "mykey")
        assert result["valid"] is True
        assert result["verified"] == 5

    async def test_diff_field_included_in_hmac(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="secret")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="write_file", tool_input={"path": "/tmp/x"},
            approved=True, result_summary="ok", execution_time_ms=10,
            diff="--- a\n+++ b\n-old\n+new",
        )
        line = p.read_text().strip()
        entry = json.loads(line)
        assert entry["diff"] == "--- a\n+++ b\n-old\n+new"
        assert "_hmac" in entry
        # Tampering the diff should break verification
        entry["diff"] = "tampered"
        verifier = AuditSigner("secret")
        assert not verifier.verify_entry(entry, GENESIS_HASH)

    async def test_error_field_included_in_hmac(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="secret")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="run_command", tool_input={},
            approved=True, result_summary="failed", execution_time_ms=10,
            error="command not found",
        )
        result = await verify_log(p, "secret")
        assert result["valid"] is True


# ---------------------------------------------------------------------------
# AuditLogger.initialize_chain
# ---------------------------------------------------------------------------

class TestInitializeChain:
    async def test_resumes_from_last_entry(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger1 = AuditLogger(path=str(p), hmac_key="key")
        await logger1.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="t1", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=1,
        )
        last_hmac = logger1._signer.prev_hmac

        # New logger reading same file
        logger2 = AuditLogger(path=str(p), hmac_key="key")
        assert logger2._signer.prev_hmac == GENESIS_HASH  # before init
        await logger2.initialize_chain()
        assert logger2._signer.prev_hmac == last_hmac

        # Append from new logger and verify entire chain
        await logger2.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="t2", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=2,
        )
        result = await verify_log(p, "key")
        assert result["valid"] is True
        assert result["verified"] == 2

    async def test_no_op_when_no_signer(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        await logger.initialize_chain()  # should not raise

    async def test_no_op_when_file_missing(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "missing.jsonl"), hmac_key="key")
        await logger.initialize_chain()
        assert logger._signer.prev_hmac == GENESIS_HASH

    async def test_handles_empty_file(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        p.write_text("")
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.initialize_chain()
        assert logger._signer.prev_hmac == GENESIS_HASH

    async def test_handles_unsigned_entries(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        p.write_text(json.dumps({"data": "unsigned"}) + "\n")
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.initialize_chain()
        assert logger._signer.prev_hmac == GENESIS_HASH

    async def test_handles_corrupt_json(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        p.write_text("not json\n")
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.initialize_chain()
        assert logger._signer.prev_hmac == GENESIS_HASH


# ---------------------------------------------------------------------------
# AuditLogger.verify_integrity
# ---------------------------------------------------------------------------

class TestVerifyIntegrity:
    async def test_valid_log(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="key")
        for i in range(3):
            await logger.log_execution(
                user_id="u1", user_name="test", channel_id="c1",
                tool_name=f"tool_{i}", tool_input={},
                approved=True, result_summary="ok", execution_time_ms=i,
            )
        result = await logger.verify_integrity()
        assert result["valid"] is True
        assert result["verified"] == 3

    async def test_tampered_log(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="t1", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=1,
        )
        # Tamper
        content = p.read_text()
        entry = json.loads(content.strip())
        entry["tool_name"] = "tampered"
        p.write_text(json.dumps(entry, default=str) + "\n")

        result = await logger.verify_integrity()
        assert result["valid"] is False

    async def test_no_signing_returns_error(self, tmp_path):
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        result = await logger.verify_integrity()
        assert result["valid"] is False
        assert "not enabled" in result["error"]

    async def test_empty_log(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        p.write_text("")
        logger = AuditLogger(path=str(p), hmac_key="key")
        result = await logger.verify_integrity()
        assert result["valid"] is True
        assert result["total"] == 0


# ---------------------------------------------------------------------------
# AuditConfig
# ---------------------------------------------------------------------------

class TestAuditConfig:
    def test_default_empty_key(self):
        from src.config.schema import AuditConfig
        cfg = AuditConfig()
        assert cfg.hmac_key == ""

    def test_custom_key(self):
        from src.config.schema import AuditConfig
        cfg = AuditConfig(hmac_key="my-secret-key")
        assert cfg.hmac_key == "my-secret-key"

    def test_config_has_audit_field(self):
        from src.config.schema import Config
        cfg = Config(discord={"token": "test"})
        assert hasattr(cfg, "audit")
        assert cfg.audit.hmac_key == ""

    def test_config_with_audit_key(self):
        from src.config.schema import Config
        cfg = Config(discord={"token": "test"}, audit={"hmac_key": "secret"})
        assert cfg.audit.hmac_key == "secret"


# ---------------------------------------------------------------------------
# REST API /api/audit/verify
# ---------------------------------------------------------------------------

class TestAuditVerifyAPI:
    def _make_bot(self, audit_logger):
        bot = MagicMock()
        bot.audit = audit_logger
        bot.config = MagicMock()
        bot.config.web.api_token = ""
        return bot

    async def test_valid_log_returns_200(self, tmp_path):
        from aiohttp.test_utils import TestClient, TestServer
        from aiohttp import web as aio_web
        from src.web.api import create_api_routes

        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="t1", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=1,
        )
        bot = self._make_bot(logger)
        routes = create_api_routes(bot)
        app = aio_web.Application()
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/verify")
            assert resp.status == 200
            data = await resp.json()
            assert data["valid"] is True
            assert data["verified"] == 1

    async def test_tampered_log_returns_409(self, tmp_path):
        from aiohttp.test_utils import TestClient, TestServer
        from aiohttp import web as aio_web
        from src.web.api import create_api_routes

        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="t1", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=1,
        )
        # Tamper
        content = p.read_text()
        entry = json.loads(content.strip())
        entry["tool_name"] = "tampered"
        p.write_text(json.dumps(entry, default=str) + "\n")

        bot = self._make_bot(logger)
        routes = create_api_routes(bot)
        app = aio_web.Application()
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/verify")
            assert resp.status == 409
            data = await resp.json()
            assert data["valid"] is False

    async def test_no_signing_returns_error(self, tmp_path):
        from aiohttp.test_utils import TestClient, TestServer
        from aiohttp import web as aio_web
        from src.web.api import create_api_routes

        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"))
        bot = self._make_bot(logger)
        routes = create_api_routes(bot)
        app = aio_web.Application()
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/verify")
            assert resp.status == 409
            data = await resp.json()
            assert data["valid"] is False
            assert "not enabled" in data["error"]

    async def test_empty_signed_log_returns_200(self, tmp_path):
        from aiohttp.test_utils import TestClient, TestServer
        from aiohttp import web as aio_web
        from src.web.api import create_api_routes

        p = tmp_path / "audit.jsonl"
        p.write_text("")
        logger = AuditLogger(path=str(p), hmac_key="key")
        bot = self._make_bot(logger)
        routes = create_api_routes(bot)
        app = aio_web.Application()
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/audit/verify")
            assert resp.status == 200
            data = await resp.json()
            assert data["valid"] is True


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------

class TestModuleImports:
    def test_import_signer(self):
        from src.audit.signer import AuditSigner
        assert AuditSigner is not None

    def test_import_verify_log(self):
        from src.audit.signer import verify_log
        assert verify_log is not None

    def test_import_genesis_hash(self):
        from src.audit.signer import GENESIS_HASH
        assert GENESIS_HASH is not None

    def test_import_canonical(self):
        from src.audit.signer import _canonical
        assert _canonical is not None

    def test_signer_in_audit_init(self):
        from src.audit import AuditSigner, verify_log
        assert AuditSigner is not None
        assert verify_log is not None


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_unicode_in_entry(self):
        signer = AuditSigner("key")
        entry = {"data": "日本語テスト"}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(entry, GENESIS_HASH)

    def test_empty_string_values(self):
        signer = AuditSigner("key")
        entry = {"a": "", "b": ""}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(entry, GENESIS_HASH)

    def test_large_entry(self):
        signer = AuditSigner("key")
        entry = {"data": "x" * 10000}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(entry, GENESIS_HASH)

    def test_nested_complex_structure(self):
        signer = AuditSigner("key")
        entry = {"a": [1, {"b": [2, 3]}, "c"], "d": {"e": {"f": True}}}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(entry, GENESIS_HASH)

    def test_null_values(self):
        signer = AuditSigner("key")
        entry = {"a": None, "b": None}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(entry, GENESIS_HASH)

    def test_boolean_values(self):
        signer = AuditSigner("key")
        entry = {"approved": True, "error": False}
        signer.sign(entry)
        verifier = AuditSigner("key")
        assert verifier.verify_entry(entry, GENESIS_HASH)

    async def test_callback_still_fires_with_signing(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="key")
        events = []
        logger.set_event_callback(AsyncMock(side_effect=lambda e: events.append(e)))
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="t1", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=1,
        )
        assert len(events) == 1
        assert "_hmac" in events[0]

    async def test_search_returns_signed_entries(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="t1", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=1,
        )
        results = await logger.search(tool_name="t1")
        assert len(results) == 1
        assert "_hmac" in results[0]

    async def test_count_by_tool_works_with_signed(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="run_command", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=1,
        )
        counts = await logger.count_by_tool()
        assert counts["run_command"] == 1

    async def test_search_diffs_works_with_signed(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="write_file", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=1,
            diff="some diff",
        )
        results = await logger.search_diffs()
        assert len(results) == 1
        assert results[0]["diff"] == "some diff"

    async def test_log_stats_work_with_signed(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="key")
        await logger.log_execution(
            user_id="u1", user_name="test", channel_id="c1",
            tool_name="t1", tool_input={},
            approved=True, result_summary="ok", execution_time_ms=1,
        )
        stats = await logger.get_log_stats()
        assert stats["total"] == 1

    async def test_long_chain_integrity(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(p), hmac_key="chain-test")
        for i in range(50):
            await logger.log_execution(
                user_id="u1", user_name="test", channel_id="c1",
                tool_name=f"tool_{i}", tool_input={"i": i},
                approved=True, result_summary=f"result_{i}",
                execution_time_ms=i,
            )
        result = await logger.verify_integrity()
        assert result["valid"] is True
        assert result["verified"] == 50
