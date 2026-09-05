import json
from unittest.mock import patch

import pytest

from src.audit.logger import AuditLogger
from src.audit.signer import AuditSigner


@pytest.mark.parametrize("marker", [False, True])
@pytest.mark.parametrize("damage", ["hmac", "json", "nonobject", "hmac_type"])
async def test_old_break_reports_first_line_and_resumes_actual_tail(
    tmp_path, caplog, marker, damage,
):
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), hmac_key="fixture")
    for seq in range(4):
        await logger._persist({"seq": seq})
    lines = path.read_text().splitlines()
    row = json.loads(lines[1])
    row["seq"] = "historically modified"
    if damage == "hmac_type":
        row["_hmac"] = 7
    lines[1] = {"json": "{broken", "nonobject": "null"}.get(damage, json.dumps(row))
    path.write_text("\n".join(lines) + "\n")
    before = path.read_bytes()
    tail = json.loads(lines[-1])["_hmac"]
    if marker:
        logger._repair_marker.write_text("old pending append")
    reopened = AuditLogger(str(path), hmac_key="fixture")
    await reopened.initialize_chain()
    assert "historical chain break at line 2" in caplog.text
    assert reopened._signer.prev_hmac == tail
    assert not reopened.repair_required and not reopened._repair_marker.exists()
    for seq in (4, 5):
        await reopened._persist({"seq": seq})
        assert reopened.durability_degraded
    assert path.read_bytes().startswith(before)
    appended = [json.loads(line) for line in path.read_bytes()[len(before):].splitlines()]
    signer = AuditSigner("fixture")
    assert signer.verify_entry(appended[0], tail)
    assert signer.verify_entry(appended[1], appended[0]["_hmac"])
    report = await reopened.verify_integrity()
    assert not report["valid"]
    assert report["first_bad"] == 2
    assert report["durability"] == "degraded"


@pytest.mark.parametrize("tail", ['{"seq":', '{"seq": 2}', '{broken\n'])
async def test_uncertain_tail_keeps_marker_and_bytes(tmp_path, tail):
    path = tmp_path / "audit.jsonl"
    path.write_text(tail)
    logger = AuditLogger(str(path), hmac_key="fixture")
    await logger._persist({"seq": 3})
    assert logger.repair_required and logger._repair_marker.exists()
    assert (await logger.verify_integrity())["durability"] == "repair_required"
    assert path.read_text() == tail


async def test_unsigned_complete_tail_settles_stale_marker(tmp_path):
    path = tmp_path / "audit.jsonl"
    path.write_text('{"seq": 1}\n')
    path.with_name(path.name + ".repair-required").write_text("pending")
    logger = AuditLogger(str(path))
    await logger._persist({"seq": 2})
    assert not logger.repair_required and not logger._repair_marker.exists()
    assert len(path.read_text().splitlines()) == 2


async def test_unreadable_tail_degrades_without_inventing_append_intent(tmp_path):
    path = tmp_path / "audit.jsonl"
    path.write_text('{"seq": 1}\n')
    before = path.read_bytes()
    logger = AuditLogger(str(path), hmac_key="fixture")
    with patch("src.audit.logger.aiofiles.open", side_effect=OSError("unreadable")):
        await logger._persist({"seq": 2})
    assert logger.durability_degraded and not logger.repair_required
    assert not logger._repair_marker.exists() and path.read_bytes() == before
    await logger._persist({"seq": 3})
    assert (await logger.verify_integrity())["valid"]


async def test_stale_marker_cleanup_failure_preserves_fence_until_next_boot(tmp_path, monkeypatch):
    path = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(path), hmac_key="fixture")
    await logger._persist({"seq": 1})
    with path.open("a") as stream:
        stream.write("\n\n")
    before = path.read_bytes()
    logger._repair_marker.write_text("stale")
    reopened = AuditLogger(str(path), hmac_key="fixture")
    original = type(path).unlink

    def refuse_marker(target, *args, **kwargs):
        if target == reopened._repair_marker:
            raise OSError("cannot clear marker")
        return original(target, *args, **kwargs)

    with monkeypatch.context() as scoped:
        scoped.setattr(type(path), "unlink", refuse_marker)
        await reopened.initialize_chain()
        await reopened.initialize_chain()  # once per boot, even when fenced
        await reopened._persist({"seq": 2})
    assert path.read_bytes() == before and reopened.repair_required
    recovered = AuditLogger(str(path), hmac_key="fixture")
    await recovered._persist({"seq": 3})
    assert not recovered.repair_required and not recovered._repair_marker.exists()
    assert path.read_bytes().startswith(before)
    assert (await recovered.verify_integrity())["valid"]
