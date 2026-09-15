"""Offline orchestration tests. Fakes here never claim native qualification."""

import asyncio
import importlib.util
import json
import os
from dataclasses import replace
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "takeover_driver", ROOT / "scripts/computer-feasibility/hyprland-takeover-qualification.py")
driver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(driver)


def test_private_records_create_only_reject_unsafe_and_symlink(tmp_path):
    tmp_path.chmod(0o700)
    target = tmp_path / "record.json"
    driver.private_write(target, {"recovery_capability": "never-public"})
    assert target.stat().st_mode & 0o777 == 0o600
    assert driver.private_read(target)["recovery_capability"] == "never-public"
    with pytest.raises(FileExistsError):
        driver.private_write(target, {})
    link = tmp_path / "link"
    link.symlink_to(target)
    with pytest.raises(OSError):
        driver.private_read(link)
    target.chmod(0o644)
    with pytest.raises(driver.narrow.Refusal):
        driver.private_read(target)
    tmp_path.chmod(0o755)
    with pytest.raises(driver.narrow.Refusal):
        driver.private_write(tmp_path / "unsafe", {})


def test_report_redacts_nested_private_capability():
    row = {"owner": {"recovery_capability": "secret", "pid": 42}, "rows": [{"token": "secret"}]}
    report = json.dumps(driver.recovery.redact(row))
    assert "secret" not in report
    assert '42' in report


@pytest.mark.parametrize("argv", [["driver"], ["driver", "--owner-worker", "/private"]])
def test_guest_boundary_precedes_parent_and_worker(monkeypatch, argv):
    monkeypatch.setattr(driver.socket, "gethostname", lambda: "not-the-lab")
    monkeypatch.setattr(driver.sys, "argv", argv)
    with pytest.raises(driver.narrow.Refusal, match="disposable KVM guest required"):
        driver.main()


def test_static_bad_authority_reason_survives_redaction():
    row = {"bad_authority_refusal": "hyprland_owner_adoption_authority_refused"}
    assert driver.recovery.redact(row) == row


def make_handle():
    from src.computer.runtime.hyprland_identity import ExecutableTrust, HyprlandIdentity, ProcessPin
    from src.computer.runtime.hyprland_scope import HyprlandOwnerHandle
    trust = ExecutableTrust("/approved/Hyprland", "a" * 64, "0.55.2", "b" * 40)
    process = ProcessPin(20, os.geteuid(), 100, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                         1, 2, 3, 4, 5, "a" * 64)
    return HyprlandOwnerHandle(HyprlandIdentity(process, trust), "i1-" + "c" * 32,
                               "d" * 48, "e" * 48, 21, os.geteuid(), "101",
                               22, os.geteuid(), "102", "f" * 48)


@pytest.mark.parametrize("lost_ack", [False, True])
def test_phase_order_and_lost_ack_never_resends(tmp_path, monkeypatch, lost_ack):
    tmp_path.chmod(0o700)
    original = make_handle()
    successor = replace(original, recovery_pid=os.getpid(), recovery_start_ticks="555")
    calls = []
    monkeypatch.setattr(
        driver.narrow, "pin", lambda pid, uid: {"pid": pid, "uid": uid, "start_ticks": 555}
    )

    class Provider:
        async def reconnect_owner(self, owner, *, command_id, query_only=False):
            assert driver.private_read(tmp_path / "takeover-intent.json")["original"] == (
                driver.owner_handle_to_record(original)
            )
            calls.append(("adopt", query_only))
            assert owner == original
            if not query_only and self.lose_adoption_ack:
                raise driver.AckDiscarded()
            return successor

        def row(self, command_id, retired=False):
            return {**{key: getattr(successor, key) for key in driver.recovery.IDENTITY},
                    "command_id": command_id, "owner_matched": True, "revoked": True,
                    "ledger_empty": True, "release_ack": True, "unknown_release": False,
                    "receiver_release_verified": False, "retired": retired,
                    "native_resources_retired": retired, "retirement_evidence_version": 1,
                    "retirement_evidence_kind": (
                        "exact-client-resources-destroyed" if retired else "unavailable"
                    )}

        async def reconcile_owner(self, owner, *, command_id):
            assert driver.owner_handle_from_record(
                driver.private_read(tmp_path / "adopted-owner.json")
            ) == successor
            assert driver.private_read(tmp_path / "release-intent.json")["command_id"] == command_id
            calls.append(("release", False))
            return self.row(command_id)

        async def owner_status(self, owner, *, command_id):
            calls.append(("release", True))
            return self.row(command_id)

        async def retire_owner(self, owner, *, command_id):
            assert driver.private_read(tmp_path / "retire-intent.json")["command_id"] == command_id
            calls.append(("retire", False))
            return self.row(command_id, True)

    report = asyncio.run(
        driver.adopt_and_release(Provider(), original, tmp_path, lost_ack=lost_ack)
    )
    assert calls.count(("adopt", False)) == 1
    assert calls.count(("adopt", True)) == (2 if lost_ack else 1)
    assert calls.count(("release", False)) == 1
    assert calls[-1] == ("retire", False)
    assert report["release"]["receiver_release_verified"] is False
    assert original.recovery_capability not in json.dumps(report)


def test_descriptor_legacy_and_capability_refusals():
    record = driver.owner_handle_to_record(make_handle())
    for mutation in ("version", "capability"):
        malformed = json.loads(json.dumps(record))
        if mutation == "version":
            malformed["version"] = 1
        else:
            malformed["owner"]["recovery_capability"] = ""
        with pytest.raises(driver.HyprlandScopeFailure):
            driver.owner_handle_from_record(malformed)


def test_failed_durable_intent_prevents_native_dispatch(tmp_path):
    tmp_path.chmod(0o700)
    driver.private_write(tmp_path / "takeover-intent.json", {})

    class Provider:
        async def reconnect_owner(self, *args, **kwargs):
            pytest.fail("dispatched after failed persistence")

    with pytest.raises(FileExistsError):
        asyncio.run(driver.adopt_and_release(Provider(), make_handle(), tmp_path))


def test_ambiguous_adoption_queries_only_and_stops_without_evidence(tmp_path):
    tmp_path.chmod(0o700)
    calls = []

    class Provider:
        async def reconnect_owner(self, owner, *, command_id, query_only=False):
            calls.append(query_only)
            raise driver.HyprlandScopeFailure("hyprland_scope_unavailable")

        async def reconcile_owner(self, *args, **kwargs):
            pytest.fail("release without confirmed adoption")

    with pytest.raises(driver.HyprlandScopeFailure):
        asyncio.run(driver.adopt_and_release(Provider(), make_handle(), tmp_path))
    assert calls == [False, True]
    assert not (tmp_path / "adopted-owner.json").exists()
    assert not (tmp_path / "release-intent.json").exists()
