"""Fake-only harness regression tests. Never connects to any display."""
import asyncio
import importlib.util
import json
import stat
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from xml.etree import ElementTree

import pytest

DIRECTORY = Path(__file__).resolve().parents[1] / "scripts" / "computer-feasibility"
sys.path.insert(0, str(DIRECTORY))
SPEC = importlib.util.spec_from_file_location(
    "scratch_support", DIRECTORY / "main_scratch_support.py")
support = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(support)


def test_private_durable_journal(tmp_path):
    path = tmp_path / "before.json"
    support.durable_json(path, {"pid": 2})
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert json.loads(path.read_text()) == {"pid": 2}
    support.durable_json(path, {"pid": 3})
    assert json.loads(path.read_text()) == {"pid": 3}
    assert not path.with_suffix(".pending").exists()


def test_explicit_bus_without_activation():
    root = ElementTree.fromstring(support.bus_config(Path("/tmp/private/socket")))
    assert root.find("listen").text == "unix:path=/tmp/private/socket"
    assert not any(root.iter("include"))
    assert not any(root.iter("servicedir"))
    assert not any(root.iter("standard_session_servicedirs"))
    assert root.find("policy/deny").get("send_member") == "StartServiceByName"


def test_cleanup_failure_does_not_suppress_next_stage(tmp_path):
    records = []
    calls = []

    async def broken():
        raise RuntimeError("worker_failure")

    async def run():
        assert not await support.stage(records, tmp_path, "worker", broken)
        assert await support.stage(records, tmp_path, "restore", lambda: calls.append("restore"))

    asyncio.run(run())
    assert calls == ["restore"]
    assert [r["ok"] for r in records] == [False, True]


def test_reported_restoration_errors_are_failure(tmp_path):
    records = []
    assert not asyncio.run(support.stage(records, tmp_path, "restore", lambda: {"errors": ["bad"]}))
    assert records[0]["result"]["errors"] == ["bad"]


def test_skipped_baseline_windows_are_not_success(tmp_path):
    records = []
    assert not asyncio.run(support.stage(records, tmp_path, 'restore',
                                         lambda: {'skipped': [123]}))
    assert not records[0]['ok']


def test_journal_failure_does_not_throw_from_cleanup(tmp_path, monkeypatch):
    def broken(*args):
        raise OSError("disk")

    monkeypatch.setattr(support, "durable_json", broken)
    assert not asyncio.run(support.stage([], tmp_path, "cleanup", lambda: None))


def test_reused_pid_not_signalled(tmp_path, monkeypatch):
    monkeypatch.setattr(support, "exact_process", lambda _: False)
    calls = []
    monkeypatch.setattr(support, "command", lambda *args: calls.append(args))
    child = SimpleNamespace(stdin=None, wait=AsyncMock(return_value=0))
    asyncio.run(support.terminate("xed", SimpleNamespace(session_user="operator"), tmp_path,
        {"xed": {"wrapper": child, "identity": {"pid": 123, "uid": 1000, "start_ticks": 4}}}))
    assert not calls
    child.wait.assert_awaited_once()


def test_ack_after_durable_identity_only(tmp_path, monkeypatch):
    events = []
    identity = {"pid": 123, "uid": 1000, "start_ticks": 4}
    stdin = SimpleNamespace(write=lambda data: events.append(("ack", data)),
                            drain=AsyncMock(), close=lambda: events.append(("close", None)))
    child = SimpleNamespace(stdin=stdin, stdout=SimpleNamespace(
        readline=AsyncMock(return_value=json.dumps(identity).encode() + b"\n")))
    create = AsyncMock(return_value=child)
    monkeypatch.setattr(support.asyncio, "create_subprocess_exec", create)
    monkeypatch.setattr(support, "exact_process", lambda _: True)
    monkeypatch.setattr(support, "durable_json",
                        lambda path, value: events.append(("durable", value)))
    args = SimpleNamespace(session_user="operator", display=":987", xauthority="/tmp/private-auth")
    processes = {}
    asyncio.run(support.launch("xed", args, tmp_path, tmp_path, processes))
    assert [e[0] for e in events] == ["durable", "ack", "close"]
    assert processes["xed"]["identity"] == identity
    argv = create.call_args.args
    assert argv[:4] == ("sudo", "-n", "-u", "operator")
    assert "DISPLAY=:987" in argv
    assert not any("dbus-run-session" in arg for arg in argv)


def test_failed_durable_write_never_acks(tmp_path, monkeypatch):
    identity = {"pid": 123, "uid": 1000, "start_ticks": 4}
    writes = []
    child = SimpleNamespace(stdin=SimpleNamespace(write=writes.append), stdout=SimpleNamespace(
        readline=AsyncMock(return_value=json.dumps(identity).encode() + b"\n")))
    monkeypatch.setattr(support.asyncio, "create_subprocess_exec", AsyncMock(return_value=child))
    monkeypatch.setattr(support, "exact_process", lambda _: True)

    def fail(*args):
        raise OSError("disk")

    monkeypatch.setattr(support, "durable_json", fail)
    args = SimpleNamespace(session_user="operator", display=":987", xauthority="/tmp/private-auth")
    with pytest.raises(OSError):
        asyncio.run(support.launch("xed", args, tmp_path, tmp_path, {}))
    assert not writes


def test_main_worker_failure_attempts_every_cleanup(tmp_path, monkeypatch, capsys):
    """Actual main orchestration, fully fake display and process primitives."""
    spec = importlib.util.spec_from_file_location(
        "scratch_main", DIRECTORY / "main-session-xed-smoke.py")
    main = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(main)
    import main_scratch_randr as randr
    import main_scratch_support as helpers
    import main_scratch_windows as windows

    from src.computer.runtime.x11_app_scope import AppScope

    calls, launched = [], []
    ident = {"pid": 999999, "uid": 1000, "start_ticks": 123}
    d = SimpleNamespace(close=lambda: calls.append("display_close"),
        screen=lambda: SimpleNamespace(root=object()),
        get_input_focus=lambda: SimpleNamespace(focus=object()))
    monkeypatch.setattr(main.display, "Display", lambda _: d)
    monkeypatch.setattr(main.pwd, "getpwnam",
                        lambda _: SimpleNamespace(pw_uid=1000, pw_gid=1000))
    monkeypatch.setattr(main.tempfile, "mkdtemp", lambda **kwargs: str(tmp_path))
    monkeypatch.setattr(main, "command", lambda *args: "")
    monkeypatch.setattr(main, "power_state", lambda: "Off")
    monkeypatch.setattr(randr, "capture", lambda _: {"baseline": True})
    monkeypatch.setattr(randr, "validate", lambda _: None)
    monkeypatch.setattr(randr, "monitor_geometry",
                        lambda *_: {"x": 0, "y": 0, "width": 1280, "height": 900})
    monkeypatch.setattr(randr, "restore", lambda *_: calls.append("randr_restore"))
    session = {"windows": {}, "pointer": [0, 0, 0], "keymap": [0] * 32, "active": [0]}
    monkeypatch.setattr(windows, "snapshot",
                        lambda _: {**session, "windows": {42: {}}} if launched else session)
    monkeypatch.setattr(windows, "validate", lambda _: None)
    monkeypatch.setattr(windows, "identity", lambda _, wid: {"xid": wid, **ident})
    monkeypatch.setattr(windows, "restore_windows", lambda *_: calls.append("window_restore"))
    monkeypatch.setattr(windows, "restore_focus_pointer", lambda *_: calls.append("focus_restore"))
    monkeypatch.setattr(AppScope, "__init__", lambda *_: None)
    monkeypatch.setattr(AppScope, "_target", lambda *_: (object(), []))
    monkeypatch.setattr(AppScope, "_pid", lambda *_: ident["pid"])
    monkeypatch.setattr(helpers, "exact_process", lambda _: True)

    async def launch(role, args, home, base, processes):
        processes[role] = {"identity": ident, "wrapper": SimpleNamespace(returncode=0)}
        if role == "xed":
            launched.append(True)

    async def terminate(role, *args):
        calls.append("terminate_" + role)
        if role == "xed":
            launched.clear()

    async def failed_worker(*args):
        raise RuntimeError("privileged_worker_failed")

    async def failed_close():
        calls.append("controller_close")
        raise RuntimeError("worker_remaining")

    service = SimpleNamespace(controller=SimpleNamespace(session=failed_worker,
        close=failed_close, store=SimpleNamespace(purge_evidence=lambda: calls.append("purge"))),
        close=AsyncMock(side_effect=lambda: calls.append("integration_close")))
    monkeypatch.setattr(main, "ComputerIntegration", lambda _: service)
    monkeypatch.setattr(helpers, "launch", launch)
    monkeypatch.setattr(helpers, "terminate", terminate)
    monkeypatch.setattr(main.asyncio, "sleep", AsyncMock())
    args = SimpleNamespace(confirm_overnight_scratch_only=True, display=":987",
                           xauthority="/tmp/fake-auth", monitor="fake", session_user="operator")
    monkeypatch.setenv("DISPLAY", ":987")
    monkeypatch.setenv("XAUTHORITY", "/tmp/fake-auth")
    import os
    old_umask = os.umask(0o077)
    try:
        assert asyncio.run(main.run(args)) == 1
    finally:
        os.umask(old_umask)
    assert calls == ["controller_close", "purge", "integration_close", "terminate_xed",
                     "terminate_bus", "randr_restore", "focus_restore", "window_restore",
                     "display_close"]
    report = json.loads(capsys.readouterr().out)
    assert not report["passed"]
    assert report["session_restored"]
