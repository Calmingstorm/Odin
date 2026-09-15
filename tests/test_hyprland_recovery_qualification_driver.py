"""Offline driver validation only, not native qualification evidence."""

import hashlib
import importlib.util
import os
from pathlib import Path

import pytest


@pytest.fixture
def driver():
    path = (
        Path(__file__).resolve().parents[1]
        / "scripts/computer-feasibility/hyprland-recovery-qualification.py"
    )
    spec = importlib.util.spec_from_file_location("recovery_driver_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_redacts_capability(driver):
    assert driver.redact({
        "recovery_capability": "private", "rows": [{"scope_token": "secret"}]
    }) == {
        "recovery_capability": "[REDACTED]", "rows": [{"scope_token": "[REDACTED]"}]}


@pytest.mark.parametrize(
    "field", ["plugin_epoch", "ledger_id", "recovery_pid", "guardian_start_ticks"]
)
def test_owner_mismatch(driver, field):
    owner = dict.fromkeys(driver.IDENTITY, "same")
    with pytest.raises(driver.narrow.Refusal, match="owner mismatch"):
        driver.validate({**owner, "ok": True, field: "other"}, owner, "one")


def evidence(driver):
    owner = dict.fromkeys(driver.IDENTITY, "same")
    return owner, {**owner, "ok": True, "command_id": "one", "release_ack": True,
                   "revoked": True, "ledger_empty": True, "owner_matched": True,
                   "unknown_release": False, "receiver_release_verified": False}


@pytest.mark.parametrize("field", ["release_ack", "revoked", "ledger_empty", "owner_matched"])
def test_release_requires_every_fact(driver, field):
    owner, row = evidence(driver)
    driver.validate(row, owner, "one")
    row[field] = False
    with pytest.raises(driver.narrow.Refusal, match="release unproven"):
        driver.validate(row, owner, "one")


def test_retirement_never_clears_unknown(driver):
    owner, row = evidence(driver)
    row.update(unknown_release=True, retired=True, native_resources_retired=True)
    with pytest.raises(driver.narrow.Refusal, match="release unproven"):
        driver.validate(row, owner, "one")


def test_native_ack_is_not_receiver_proof(driver):
    owner, row = evidence(driver)
    row["receiver_release_verified"] = True
    with pytest.raises(driver.narrow.Refusal, match="false receiver claim"):
        driver.validate(row, owner, "one")


def test_wrong_command_refuses(driver):
    owner, row = evidence(driver)
    with pytest.raises(driver.narrow.Refusal, match="command mismatch"):
        driver.validate(row, owner, "other")


def cli_args():
    args = []
    for name in ("wayland-socket", "scope-socket", "manifest", "guardian", "capture",
                 "receiver", "output-name", "log-dir"):
        args.extend(["--" + name, "/unused"])
    for name in ("compositor-pid", "logical-width", "logical-height"):
        args.extend(["--" + name, "100"])
    return args


def test_cli_refuses_workstation_before_constructing_harness(driver, monkeypatch, capsys):
    monkeypatch.setattr(driver.socket, "gethostname", lambda: "workstation")
    monkeypatch.setattr(driver, "Recovery", lambda args: pytest.fail("harness constructed"))
    with pytest.raises(SystemExit) as error:
        driver.main(cli_args())
    assert error.value.code == 2
    assert "requires the odin-hyprland-lab guest" in capsys.readouterr().err


def test_cli_guest_enters_harness_without_native_execution(driver, monkeypatch):
    monkeypatch.setattr(driver.socket, "gethostname", lambda: "odin-hyprland-lab")

    class FakeRecovery:
        def __init__(self, args):
            assert args.compositor_pid == 100
            assert args.lost_ack is True

        def run(self):
            return 7

    monkeypatch.setattr(driver, "Recovery", FakeRecovery)
    assert driver.main([*cli_args(), "--lost-ack"]) == 7


@pytest.fixture
def image(tmp_path):
    path = tmp_path / "plugin.so"
    path.write_bytes(b"guest fixture image")
    path.chmod(0o600)
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def test_image_hash_returns_exact_identity(driver, image):
    path, digest = image
    checked = driver.checked_image(path, digest, os.getuid())
    assert (checked.st_dev, checked.st_ino) == (path.stat().st_dev, path.stat().st_ino)


def test_image_symlink_refused(driver, image, tmp_path):
    path, digest = image
    link = tmp_path / "link.so"
    link.symlink_to(path)
    with pytest.raises(OSError):
        driver.checked_image(link, digest, os.getuid())


def test_image_hash_mismatch_refused(driver, image):
    path, _ = image
    with pytest.raises(driver.narrow.Refusal, match="plugin hash mismatch"):
        driver.checked_image(path, "0" * 64, os.getuid())


def test_image_writable_mode_refused(driver, image):
    path, digest = image
    path.chmod(0o622)
    with pytest.raises(driver.narrow.Refusal, match="type/owner/mode invalid"):
        driver.checked_image(path, digest, os.getuid())


@pytest.mark.parametrize("change", ["replace", "modify", "symlink"])
def test_image_changed_during_hash_refused(driver, image, monkeypatch, change):
    path, digest = image
    original_read = os.read
    changed = False

    def read_then_change(fd, size):
        nonlocal changed
        data = original_read(fd, size)
        if not changed:
            changed = True
            if change == "modify":
                with path.open("ab") as output:
                    output.write(b"changed")
            else:
                old = path.with_suffix(".old")
                path.rename(old)
                if change == "symlink":
                    path.symlink_to(old)
                else:
                    path.write_bytes(data)
                    path.chmod(0o600)
        return data

    monkeypatch.setattr(driver.os, "read", read_then_change)
    with pytest.raises(driver.narrow.Refusal, match="plugin changed while hashed"):
        driver.checked_image(path, digest, os.getuid())


def test_image_fifo_refused_without_blocking(driver, tmp_path):
    path = tmp_path / "fifo"
    os.mkfifo(path, 0o600)
    with pytest.raises(driver.narrow.Refusal, match="type/owner/mode invalid"):
        driver.checked_image(path, "0" * 64, os.getuid())
