"""Fake-only descriptor failures and alias races in retained audit verification."""

import builtins
import json
import os

import pytest

import src.audit.logger as logger_mod
from src.audit.logger import AuditLogger
from src.audit.signer import AuditSigner

KEY = "fixture-signing-key"


def _signed_file(path, number):
    entry = AuditSigner(KEY).sign({"number": number})
    path.write_text(json.dumps(entry) + "\n")


@pytest.mark.asyncio
async def test_fstat_failure_reports_unreadable_generation_and_closes_handle(
    tmp_path, monkeypatch,
):
    active = tmp_path / "audit.jsonl"
    rotated = tmp_path / "audit.jsonl.1"
    _signed_file(active, 0)
    _signed_file(rotated, 1)
    logger = AuditLogger(str(active), hmac_key=KEY, max_files=1)
    original_open = builtins.open
    original_fstat = os.fstat
    failed_handles = []

    def tracked_open(path, mode):
        handle = original_open(path, mode)
        if path == rotated:
            failed_handles.append(handle)
        return handle

    def one_failed_stat(fd):
        if failed_handles and fd == failed_handles[0].fileno():
            raise OSError("synthetic fstat failure")
        return original_fstat(fd)

    monkeypatch.setattr(logger_mod, "open", tracked_open, raising=False)
    monkeypatch.setattr(logger_mod.os, "fstat", one_failed_stat)
    report = await logger.verify_integrity()

    assert failed_handles and failed_handles[0].closed
    assert report["valid"] is False
    assert [(s["file"], s["status"], s["error"]) for s in report["segments"]] == [
        (active.name, "verified", None), (rotated.name, "unreadable", "OSError"),
    ]


@pytest.mark.asyncio
async def test_hardlinked_rotation_alias_is_not_double_counted(tmp_path):
    active = tmp_path / "audit.jsonl"
    alias = tmp_path / "audit.jsonl.1"
    _signed_file(active, 0)
    os.link(active, alias)
    logger = AuditLogger(str(active), hmac_key=KEY, max_files=1)

    report = await logger.verify_integrity()

    assert report["valid"] is True
    assert report["total"] == report["verified"] == 1
    assert [segment["file"] for segment in report["segments"]] == [active.name]


@pytest.mark.asyncio
async def test_unexpected_snapshot_failure_closes_all_prior_descriptors(tmp_path, monkeypatch):
    active = tmp_path / "audit.jsonl"
    first = tmp_path / "audit.jsonl.1"
    second = tmp_path / "audit.jsonl.2"
    _signed_file(active, 0)
    _signed_file(first, 1)
    _signed_file(second, 2)
    logger = AuditLogger(str(active), hmac_key=KEY, max_files=2)
    original_open = builtins.open
    opened = []

    def interrupted_open(path, mode):
        if path == second:
            raise RuntimeError("synthetic unexpected snapshot interruption")
        handle = original_open(path, mode)
        opened.append(handle)
        return handle

    monkeypatch.setattr(logger_mod, "open", interrupted_open, raising=False)
    with pytest.raises(RuntimeError, match="synthetic unexpected snapshot interruption"):
        await logger.verify_integrity()

    assert len(opened) == 2
    assert all(handle.closed for handle in opened)
