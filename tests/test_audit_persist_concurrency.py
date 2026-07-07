"""Regression tests for the audit-chain concurrency fix (2026-07-07).

AuditLogger._persist signed an entry (advancing the shared signer's running
chain hash) and then wrote it across an ``await`` with no lock, so two
concurrent audited actions signed in one order and wrote in another — the file
landed out of chain-order and verify_integrity() reported valid=False with zero
tampering. The fix serializes rotate→sign→write under _persist_lock.
"""
from __future__ import annotations

import json

import pytest

from src.audit.logger import AuditLogger
from src.audit.signer import AuditSigner, verify_log


async def _hammer(logger, n):
    import asyncio

    async def one(i):
        await logger.log_execution(
            user_id=f"u{i}", user_name="U", channel_id="c", tool_name="t",
            tool_input={"i": i}, approved=True, result_summary="ok",
            execution_time_ms=1)
    await asyncio.gather(*(one(i) for i in range(n)))


class TestOrderingMechanism:
    async def test_out_of_order_signed_entries_fail_verify(self, tmp_path):
        # Deterministic proof of the failure MODE: two individually-valid
        # signed entries, written to disk in the REVERSE of their sign order,
        # break file-order verification even though each HMAC is correct.
        signer = AuditSigner("k")
        a = signer.sign({"seq": 1})   # signed first
        b = signer.sign({"seq": 2})   # signed second (chains to a)
        p = tmp_path / "audit.jsonl"
        # write b BEFORE a — the reordering the race produced
        p.write_text(json.dumps(b) + "\n" + json.dumps(a) + "\n")
        result = await verify_log(p, "k")
        assert result["valid"] is False  # out-of-order signed entries caught

    async def test_in_order_signed_entries_verify(self, tmp_path):
        signer = AuditSigner("k")
        a = signer.sign({"seq": 1})
        b = signer.sign({"seq": 2})
        p = tmp_path / "audit.jsonl"
        p.write_text(json.dumps(a) + "\n" + json.dumps(b) + "\n")
        assert (await verify_log(p, "k"))["valid"] is True


class TestPersistLock:
    @pytest.mark.asyncio
    async def test_concurrent_writes_stay_chain_valid(self, tmp_path):
        # 64 concurrent audited actions must produce a verifiable chain.
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"), hmac_key="k")
        await _hammer(logger, 64)
        res = await logger.verify_integrity()
        assert res["valid"] is True and res["verified"] == 64

    @pytest.mark.asyncio
    async def test_lock_is_load_bearing(self, tmp_path, monkeypatch):
        # Same concurrency, lock swapped for a no-op context: the chain breaks.
        # This is the deterministic "sans lock fails / with lock passes" proof —
        # the lock is the only variable between this and the test above.
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"), hmac_key="k")

        class _NoLock:
            def __call__(self):  # allow `async with logger._persist_lock:`
                return self

            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

        monkeypatch.setattr(logger, "_persist_lock", _NoLock())
        await _hammer(logger, 64)
        res = await logger.verify_integrity()
        assert res["valid"] is False  # without the lock, concurrency reorders


class TestRotationUnderLock:
    @pytest.mark.asyncio
    async def test_rotation_first_entry_still_verifies(self, tmp_path):
        # Rotation resets the signer to GENESIS; the first entry of the new file
        # must chain from GENESIS and verify. Tiny max_bytes forces a rotation
        # mid-run; the invariant (rotate+sign atomic under the lock) must hold.
        logger = AuditLogger(path=str(tmp_path / "audit.jsonl"), hmac_key="k",
                             max_bytes=200, max_files=3)
        await _hammer(logger, 40)
        # the CURRENT file (post-rotation) must verify from genesis
        res = await logger.verify_integrity()
        assert res["valid"] is True
        # a rotated file was produced
        assert (tmp_path / "audit.jsonl.1").exists()
