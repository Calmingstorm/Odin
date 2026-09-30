"""Synthetic filesystem regressions for credential publication and manual login."""
import json
import os
import stat

import pytest

from scripts.codex_login import _save_creds
from src.llm import codex_auth as ca


def test_secure_writer_ignores_preexisting_unsafe_temp(tmp_path, monkeypatch):
    path = tmp_path / "accounts.json"
    unsafe = path.with_suffix(".tmp")
    unsafe.write_text("unrelated")
    unsafe.chmod(0o644)
    real_write = os.write

    def checked_write(fd, data):
        assert stat.S_IMODE(os.fstat(fd).st_mode) == 0o600
        return real_write(fd, data)

    monkeypatch.setattr(ca.os, "write", checked_write)
    ca._atomic_write_secure(path, '{"synthetic": true}')
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert unsafe.read_text() == "unrelated"


def test_secure_writer_completes_short_writes(tmp_path, monkeypatch):
    path = tmp_path / "accounts.json"
    real_write = os.write
    monkeypatch.setattr(ca.os, "write", lambda fd, data: real_write(fd, data[:5]))
    ca._atomic_write_secure(path, json.dumps({"synthetic": "long value"}))
    assert json.loads(path.read_text()) == {"synthetic": "long value"}


@pytest.mark.parametrize("failure", ["zero", "error"])
def test_secure_writer_failure_preserves_destination(tmp_path, monkeypatch, failure):
    path = tmp_path / "accounts.json"
    path.write_text("old")

    def fail(fd, data):
        if failure == "error":
            raise OSError("synthetic failure")
        return 0

    monkeypatch.setattr(ca.os, "write", fail)
    with pytest.raises(OSError):
        ca._atomic_write_secure(path, "new")
    assert path.read_text() == "old"
    assert list(tmp_path.iterdir()) == [path]


def test_manual_login_adds_and_deduplicates_accounts(tmp_path):
    path = tmp_path / "accounts.json"
    a = {"account_id": "A", "access_token": "synthetic-A", "label": "first"}
    b = {"account_id": "B", "access_token": "synthetic-B"}
    path.write_text(json.dumps([a, b]))
    c = {"account_id": "C", "access_token": "synthetic-C"}
    _save_creds(c, path)
    rows = json.loads(path.read_text())
    assert rows[:2] == [a, b]
    assert {key: value for key, value in rows[2].items() if key != "_authorization_revision"} == c
    assert rows[2]["_authorization_revision"]
    _save_creds({"account_id": "A", "access_token": "synthetic-new"}, path)
    rows = json.loads(path.read_text())
    assert len(rows) == 3 and rows[0]["label"] == "first"
    assert rows[0]["access_token"] == "synthetic-new"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_manual_login_secure_before_first_write(tmp_path, monkeypatch):
    real_write = os.write

    def checked_write(fd, data):
        assert stat.S_IMODE(os.fstat(fd).st_mode) == 0o600
        return real_write(fd, data)

    monkeypatch.setattr(ca.os, "write", checked_write)
    _save_creds({"access_token": "synthetic"}, tmp_path / "new.json")


def test_manual_login_write_failure_preserves_pool(tmp_path, monkeypatch):
    path = tmp_path / "accounts.json"
    path.write_text('[{"access_token": "synthetic-A"}]')
    original = path.read_text()
    monkeypatch.setattr(ca.os, "write", lambda fd, data: 0)
    with pytest.raises(OSError):
        _save_creds({"access_token": "synthetic-B"}, path)
    assert path.read_text() == original
