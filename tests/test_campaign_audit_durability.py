import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest

from src.audit.logger import AuditLogger
from src.audit.signer import verify_log


async def test_failed_open_never_advances_signer(tmp_path):
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), hmac_key="fixture")
    await logger._persist({"seq": 1})
    predecessor = logger._signer.prev_hmac
    with patch("src.audit.logger.aiofiles.open", side_effect=OSError("open failure")):
        await logger._persist({"seq": 2})
    assert logger._signer.prev_hmac == predecessor
    await logger._persist({"seq": 3})
    result = await verify_log(path, "fixture")
    assert result["valid"] and result["verified"] == 2


@pytest.mark.parametrize("failure", ["write", "partial", "flush", "fsync", "close"])
async def test_uncertain_append_is_preserved_and_quarantined(tmp_path, failure):
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), hmac_key="fixture")
    await logger._persist({"seq": 1})
    predecessor = logger._signer.prev_hmac
    before = path.read_bytes()

    class FailingAppend:
        async def __aenter__(self):
            self.handle = path.open("a")
            return self

        async def write(self, line):
            if failure == "partial":
                self.handle.write(line[:12])
            if failure in {"write", "partial"}:
                raise OSError("write outcome uncertain")
            return self.handle.write(line)

        async def flush(self):
            if failure == "flush":
                raise OSError("flush outcome uncertain")
            self.handle.flush()

        def fileno(self):
            if failure == "fsync":
                raise OSError("fsync outcome uncertain")
            return self.handle.fileno()

        async def __aexit__(self, *args):
            self.handle.close()
            if failure == "close":
                raise OSError("close outcome uncertain")

    callback = AsyncMock()
    logger.set_event_callback(callback)
    with patch("src.audit.logger.aiofiles.open", return_value=FailingAppend()):
        await logger._persist({"seq": 2})
    damaged = path.read_bytes()
    assert damaged.startswith(before)
    assert logger._signer.prev_hmac == predecessor
    assert logger.durability_degraded
    assert logger.repair_required
    await logger._persist({"seq": 3})
    assert path.read_bytes() == damaged
    # Quarantine survives process recreation; no repair or historical cleanup.
    reopened = AuditLogger(str(path), hmac_key="fixture")
    await reopened.initialize_chain()
    await reopened._persist({"seq": 4})
    assert reopened.repair_required
    assert path.read_bytes() == damaged
    assert callback.call_count == 2
    assert callback.call_args.args[0]["audit_durability"] == "repair_required"


async def test_successful_append_commits_actual_predecessor(tmp_path):
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), hmac_key="fixture")
    await logger._persist({"seq": 1})
    row = json.loads(path.read_text())
    assert logger._signer.prev_hmac == row["_hmac"]
    assert not logger.durability_degraded


@pytest.mark.parametrize("damage", ["hmac", "partial", "nonobject", "unsigned_gap"])
async def test_startup_never_accepts_unverified_chain(tmp_path, damage):
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), hmac_key="fixture")
    await logger._persist({"seq": 1})
    if damage == "hmac":
        row = json.loads(path.read_text())
        row["seq"] = 99
        path.write_text(json.dumps(row) + "\n")
    else:
        with path.open("a") as stream:
            stream.write({"partial": '{"seq":', "nonobject": '[]\n',
                          "unsigned_gap": '{}\n'}[damage])
    before = path.read_bytes()
    reopened = AuditLogger(str(path), hmac_key="fixture")
    await reopened._persist({"seq": 2})
    assert reopened.repair_required and reopened.durability_degraded
    assert path.read_bytes() == before


async def test_failed_intent_publication_never_starts_append(tmp_path):
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), hmac_key="fixture")
    await logger._persist({"seq": 1})
    before = path.read_bytes()
    with patch("src.audit.logger.write_private_atomic", side_effect=OSError("intent")):
        await logger._persist({"seq": 2})
    assert path.read_bytes() == before
    reopened = AuditLogger(str(path), hmac_key="fixture")
    await reopened._persist({"seq": 3})
    result = await verify_log(path, "fixture")
    assert result["valid"] and result["verified"] == 2


async def test_cancelled_append_retains_lock_until_worker_settles(tmp_path):
    import aiofiles

    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), hmac_key="fixture")
    await logger._persist({"seq": 0})
    entered, release = asyncio.Event(), asyncio.Event()
    real_open = aiofiles.open

    class PausedAppend:
        async def __aenter__(self):
            self.context = real_open(path, "a", encoding="utf-8")
            self.stream = await self.context.__aenter__()
            return self

        async def write(self, line):
            entered.set()
            await release.wait()
            return await self.stream.write(line)

        async def flush(self):
            await self.stream.flush()

        def fileno(self):
            return self.stream.fileno()

        async def __aexit__(self, *args):
            return await self.context.__aexit__(*args)

    with patch("src.audit.logger.aiofiles.open", side_effect=lambda *a, **k: PausedAppend()):
        first = asyncio.create_task(logger._persist({"seq": 1}))
        await entered.wait()
        assert logger._repair_marker.exists()
        first.cancel()
        second = asyncio.create_task(logger._persist({"seq": 2}))
        await asyncio.sleep(0)
        first.cancel()
        await asyncio.sleep(0)
        assert not first.done() and not second.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await first
        await second
    result = await verify_log(path, "fixture")
    assert result["valid"] and result["verified"] == 3
    assert not logger._repair_marker.exists()
