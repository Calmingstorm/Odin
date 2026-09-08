"""Standalone process fixtures only. Never access an existing graphical session."""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SUPERVISOR = ROOT / "scripts/computer-feasibility/owned-test-supervisor-r6.py"
HARNESS = SUPERVISOR.with_name("main-session-app-smoke-r6.py")


def harness_module():
    sys.path.insert(0, str(HARNESS.parent))
    spec = importlib.util.spec_from_file_location("scratch_apps_r6", HARNESS)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_svg_semantic_validation_no_external_entities():
    module = harness_module()
    valid = b'<svg xmlns="http://www.w3.org/2000/svg"><text><tspan>test</tspan></text></svg>'
    assert module.verify_svg(valid, "test")["text_elements"] == 1
    with pytest.raises(RuntimeError, match="mismatch"):
        module.verify_svg(valid, "other")
    with pytest.raises(RuntimeError, match="unexpected_svg_encoding"):
        module.verify_svg(b"<!DOCTYPE svg>" + valid, "test")


def test_harness_refuses_without_authorization_before_display(monkeypatch):
    from types import SimpleNamespace

    module = harness_module()
    with pytest.raises(RuntimeError, match="authorization_required"):
        module.validate_args(SimpleNamespace(confirm_scratch_only=False))


@pytest.mark.parametrize(
    ("role", "argv"),
    [
        ("xed", ["xed", "--standalone", "--new-window"]),
        ("inkscape", ["inkscape"]),
        (
            "dbus-daemon",
            ["dbus-daemon", "--nofork", "--nopidfile", "--config-file=/fixture/bus.conf"],
        ),
    ],
)
def test_fixed_inkscape_exec_preserves_xed_launcher(monkeypatch, capsys, role, argv):
    import io
    from contextlib import nullcontext
    from types import SimpleNamespace

    spec = importlib.util.spec_from_file_location(
        "inert_scratch_launcher", HARNESS.with_name("main_scratch_launcher.py")
    )
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    events = []
    environment = {
        "DISPLAY": ":987",
        "HOME": "/fixture/home",
        "DBUS_SESSION_BUS_ADDRESS": "unix:path=/fixture/bus",
    }

    class ExecTransferred(BaseException):
        pass

    def execve(executable, arguments, env):
        events.append(("exec", executable, arguments, env))
        # Real exec does not return to subsequent role branches.
        raise ExecTransferred

    def ready(read, write, error, timeout):
        assert read == [launcher.sys.stdin] and write == error == [] and timeout == 10
        return read, [], []

    monkeypatch.setattr(
        launcher,
        "os",
        SimpleNamespace(
            getuid=lambda: 1000,
            geteuid=lambda: 1000,
            getpid=lambda: 12345,
            environ=environment,
            devnull="/fixture/devnull",
            execve=execve,
            dup2=lambda source, target: events.append(("dup2", source, target)),
        ),
    )
    monkeypatch.setattr(
        launcher, "signal", SimpleNamespace(alarm=lambda seconds: events.append(("alarm", seconds)))
    )
    monkeypatch.setattr(launcher, "select", SimpleNamespace(select=ready))
    monkeypatch.setattr(
        launcher, "sys", SimpleNamespace(stdin=SimpleNamespace(buffer=io.BytesIO(b"GO\n")))
    )
    monkeypatch.setattr(
        launcher, "identity", lambda pid: {"pid": pid, "uid": 1000, "start_ticks": 42}
    )

    def inert_open(path, mode, buffering):
        assert (path, mode, buffering) == ("/fixture/devnull", "r+b", 0)
        return nullcontext(SimpleNamespace(fileno=lambda: 91))

    monkeypatch.setattr(launcher, "open", inert_open, raising=False)
    monkeypatch.setattr(
        sys,
        "argv",
        ["launcher", "bus" if role == "dbus-daemon" else role, "--config", "/fixture/bus.conf"],
    )
    with pytest.raises(ExecTransferred):
        launcher.main()
    assert events == [
        ("alarm", 12),
        ("alarm", 0),
        ("dup2", 91, 0),
        ("dup2", 91, 1),
        ("dup2", 91, 2),
        ("exec", "/usr/bin/" + role, argv, environment),
    ]
    assert events[-1][3] is environment
    assert json.loads(capsys.readouterr().out) == {"pid": 12345, "uid": 1000, "start_ticks": 42}


def test_harness_preflight_failure_purges_content_and_records_stages(tmp_path, monkeypatch, capsys):
    import asyncio
    from types import SimpleNamespace

    module = harness_module()
    monkeypatch.setattr(module, "validate_args", lambda _: None)
    monkeypatch.setattr(module, "validate_journal", lambda _: tmp_path)
    monkeypatch.setattr(module.pwd, "getpwnam", lambda _: SimpleNamespace(pw_uid=1000, pw_gid=1000))
    monkeypatch.setattr(module.os, "chown", lambda *_: None)
    monkeypatch.setattr(module, "command", lambda *_: "")
    closed = []
    monkeypatch.setattr(
        module.display, "Display", lambda _: SimpleNamespace(close=lambda: closed.append(True))
    )

    def unsupported(_):
        raise RuntimeError("private_topology_unsupported")

    monkeypatch.setattr(module.randr, "capture", unsupported)
    monkeypatch.setenv("DISPLAY", ":987")
    monkeypatch.setenv("XAUTHORITY", "/tmp/private-fake-authority")
    args = SimpleNamespace(
        display=":987",
        xauthority="/tmp/private-fake-authority",
        session_user="fake",
        journal=str(tmp_path),
        monitor="screen",
        private_qualification=False,
    )
    old = module.os.umask(0o077)
    try:
        assert asyncio.run(module.run(args)) == 1
    finally:
        module.os.umask(old)
    report = json.loads(capsys.readouterr().out)
    assert not report["passed"] and report["screenshots_purged"]
    assert report["cleanup_complete"] and report["session_restored"] is None
    assert not report["baseline_validated"] and not report["task_complete"]
    assert report["failure"]["code"] == "private_topology_unsupported"
    assert closed and not (tmp_path / "home").exists()
    assert [row["stage"] for row in report["stages"]] == [
        "task",
        "terminate_inkscape",
        "terminate_bus",
        "close_x_connection",
        "remove_private-state",
        "remove_home",
    ]


def supervisor_module():
    spec = importlib.util.spec_from_file_location("owned_supervisor_test", SUPERVISOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_unreadable_proc_census_fails_closed(monkeypatch):
    module = supervisor_module()
    monkeypatch.setattr(module.Path, "iterdir", lambda _: [Path("/proc/999999")])

    def denied(_):
        raise PermissionError("denied")

    monkeypatch.setattr(module, "metadata", denied)
    rows, complete = module.tree(123)
    assert rows == {} and not complete
    with pytest.raises(RuntimeError, match="standalone_process_required"):
        module.become_subreaper()


def test_exited_proc_is_normal_census_race(monkeypatch):
    module = supervisor_module()
    monkeypatch.setattr(module.Path, "iterdir", lambda _: [Path("/proc/999999")])

    def gone(_):
        raise FileNotFoundError("gone")

    monkeypatch.setattr(module, "metadata", gone)
    assert module.tree(123) == ({}, True)


def test_failed_preflight_never_reports_clean_if_final_scan_recovers(tmp_path, monkeypatch):
    module = supervisor_module()

    def incomplete():
        raise RuntimeError("standalone_process_required")

    monkeypatch.setattr(module, "become_subreaper", incomplete)
    monkeypatch.setattr(module, "tree", lambda _: ({}, True))
    report = tmp_path / "result.json"
    assert module.supervise(["must-not-launch"], 1, 1, report) == 125
    result = json.loads(report.read_text())
    assert result["primary_pid"] is None and not result["cleanup_ok"]


def run_owned(tmp_path, code, deadline=3):
    report = tmp_path / "report.json"
    proc = subprocess.run(
        [
            sys.executable,
            str(SUPERVISOR),
            "--deadline",
            str(deadline),
            "--grace",
            ".2",
            "--report",
            str(report),
            "--",
            sys.executable,
            "-c",
            code,
        ],
        capture_output=True,
        text=True,
        timeout=10,
    )
    return proc, json.loads(report.read_text())


@pytest.mark.parametrize("code", [0, 7])
def test_owner_status_preserved(tmp_path, code):
    proc, report = run_owned(tmp_path, f"raise SystemExit({code})")
    assert proc.returncode == code
    assert report["primary_returncode"] == code
    assert report["cleanup_ok"] and not report["residuals"]


def test_adopted_descendant_reaped_and_unrelated_child_untouched(tmp_path):
    sibling = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        code = (
            "import os,time,signal; p=os.fork(); "
            "signal.signal(signal.SIGTERM, signal.SIG_IGN) if p==0 else None; "
            "time.sleep(30) if p==0 else time.sleep(.15); os._exit(9)"
        )
        proc, report = run_owned(tmp_path, code)
        assert proc.returncode == 9 and report["primary_returncode"] == 9
        assert report["cleanup_ok"] and not report["residuals"]
        assert report["reaped"]
        assert any(row["signal"] == 9 for row in report["signals"])
        assert sibling.poll() is None
        for row in report["reaped"]:
            assert not Path(f"/proc/{row['identity']['pid']}").exists()
    finally:
        sibling.terminate()
        sibling.wait(timeout=3)


def test_deadline_is_finite_and_reaps_primary_and_child(tmp_path):
    proc, report = run_owned(
        tmp_path,
        "import os,time,signal; signal.signal(signal.SIGTERM, signal.SIG_IGN); "
        "os.fork(); time.sleep(30)",
        deadline=0.2,
    )
    assert proc.returncode == 124
    assert report["deadline_exceeded"] and report["primary_returncode"] == -9
    assert report["cleanup_ok"] and report["seconds"] < 5
    assert report["reaped"]


def test_no_existing_journal_overwrite_or_launch(tmp_path):
    report = tmp_path / "report.json"
    report.write_text("original")
    proc = subprocess.run(
        [
            sys.executable,
            str(SUPERVISOR),
            "--deadline",
            "1",
            "--report",
            str(report),
            "--",
            sys.executable,
            "-c",
            'print("LAUNCHED")',
        ],
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert proc.returncode != 0 and "LAUNCHED" not in proc.stdout
    assert report.read_text() == "original"


def test_invalid_deadline_does_not_launch(tmp_path):
    proc = subprocess.run(
        [
            sys.executable,
            str(SUPERVISOR),
            "--deadline",
            "nan",
            "--report",
            str(tmp_path / "report"),
            "--",
            sys.executable,
            "-c",
            'print("LAUNCHED")',
        ],
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert proc.returncode != 0 and "LAUNCHED" not in proc.stdout
    assert not (tmp_path / "report").exists()


def test_unqualified_main_task_is_disabled(monkeypatch):
    from types import SimpleNamespace

    module = harness_module()
    monkeypatch.setattr(module, "PRIVATE_TASK_QUALIFIED", False)
    with pytest.raises(RuntimeError, match="not_privately_qualified"):
        module.validate_args(SimpleNamespace(confirm_scratch_only=True))


def test_main_journal_cannot_target_existing_home_or_relative_path(tmp_path):
    module = harness_module()
    home = tmp_path / "home"
    home.mkdir()
    for path in (str(home), "/tmp", ".", "/tmp/cu-r6-other/../home"):
        with pytest.raises(RuntimeError, match="scratch_journal_required"):
            module.validate_journal(path)


def test_drawing_points_use_latest_crop_scale_and_monitor_origin():
    from types import SimpleNamespace

    from src.computer.geometry import AffineTransform

    module = harness_module()
    obs = SimpleNamespace(
        delivered_to_source=AffineTransform(2, 0, 100, 0, 2, 50), width=600, height=400
    )
    points = module.delivered_points(obs, {"x": 2000, "y": 0}, (2140, 90, 1200, 840), [[530, 310]])
    assert points == [[285, 175]]
    with pytest.raises(RuntimeError, match="outside_scratch_client"):
        module.delivered_points(obs, {"x": 2000, "y": 0}, (2140, 90, 1200, 840), [[1300, 310]])


def test_shape_artifact_verifier_checks_native_nonempty_shapes():
    module = harness_module()
    blob = (
        b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/>'
        b'<ellipse rx="10" ry="15"/></svg>'
    )
    assert module.verify_shapes(blob)["rectangles"] == 1
    with pytest.raises(RuntimeError, match="empty_native_shape"):
        module.verify_shapes(blob.replace(b'width="10"', b'width="0"'))


def test_power_restoration_only_restores_recorded_state(monkeypatch):
    module = harness_module()
    commands = []
    states = iter(["On", "Off"])
    monkeypatch.setattr(module, "power_state", lambda: next(states))
    monkeypatch.setattr(module, "command", lambda *args: commands.append(args))
    assert module.restore_power("Off") == {"power": "Off", "changed": True}
    assert commands == [("xset", "dpms", "force", "off")]


def test_power_restoration_noop_and_unknown_refusal(monkeypatch):
    module = harness_module()
    commands = []
    monkeypatch.setattr(module, "command", lambda *args: commands.append(args))
    monkeypatch.setattr(module, "power_state", lambda: "Off")
    assert module.restore_power("Off")["changed"] is False
    with pytest.raises(RuntimeError, match="unavailable"):
        module.restore_power("unavailable")
    assert not commands


@pytest.mark.parametrize("fault", ["validation", "task", "cancelled", "controller"])
def test_orchestration_outcomes_and_unvalidated_baseline_never_repaired(
    tmp_path, monkeypatch, capsys, fault
):
    import asyncio
    import os
    from types import SimpleNamespace as NS  # noqa: N814 - concise fake constructor
    from unittest.mock import AsyncMock

    module = harness_module()
    calls = []
    monkeypatch.setattr(module, "validate_args", lambda _: None)
    monkeypatch.setattr(module, "validate_journal", lambda _: tmp_path)
    monkeypatch.setattr(module.pwd, "getpwnam", lambda _: NS(pw_uid=1000, pw_gid=1000))
    monkeypatch.setattr(module.os, "chown", lambda *_: None)
    monkeypatch.setattr(module, "command", lambda *_: "")
    monkeypatch.setattr(module, "power_state", lambda: "Off")
    d = NS(close=lambda: calls.append("close_display"))
    monkeypatch.setattr(module.display, "Display", lambda _: d)
    monkeypatch.setattr(module.randr, "capture", lambda _: {})
    monkeypatch.setattr(module.randr, "validate", lambda _: None)
    monkeypatch.setattr(
        module.randr, "monitor_geometry", lambda *_: {"x": 0, "y": 0, "width": 1280, "height": 900}
    )
    monkeypatch.setattr(module.randr, "restore", lambda *_: calls.append("topology"))
    monkeypatch.setattr(module.windows, "snapshot", lambda _: {"active": [10]})
    monkeypatch.setattr(module.windows, "assert_input_idle", lambda _: None)

    def validate(_):
        if fault == "validation":
            raise RuntimeError("baseline_unsupported")

    monkeypatch.setattr(module.windows, "validate", validate)
    monkeypatch.setattr(module.windows, "restore_windows", lambda *_, **kw: calls.append("windows"))
    monkeypatch.setattr(module.windows, "restore_focus_pointer", lambda *_: calls.append("focus"))
    monkeypatch.setattr(module, "restore_power", lambda _: calls.append("power"))
    controller = NS(
        close=AsyncMock(),
        _live={},
        store=NS(
            find_session=lambda _: None,
            cleanup=lambda _: None,
            purge_evidence=lambda: calls.append("purge"),
        ),
    )
    if fault == "controller":
        controller._live["unreleased"] = object()
    monkeypatch.setattr(
        module, "ComputerIntegration", lambda _: NS(controller=controller, close=AsyncMock())
    )

    async def launch(*_):
        if fault == "cancelled":
            asyncio.current_task().cancel()
            await asyncio.sleep(0)
        raise RuntimeError("deliberate_launch_failure")

    monkeypatch.setattr(module, "launch", launch)
    monkeypatch.setenv("DISPLAY", ":987")
    monkeypatch.setenv("XAUTHORITY", "/tmp/private-fake-authority")
    args = NS(
        display=":987",
        xauthority="/tmp/private-fake-authority",
        session_user="fake",
        journal=str(tmp_path),
        monitor="screen",
        private_qualification=False,
    )
    old = os.umask(0o077)
    try:
        assert asyncio.run(module.run(args)) == 1
    finally:
        os.umask(old)
    report = json.loads(capsys.readouterr().out)
    assert not report["passed"] and not report["task_complete"]
    assert report["cleanup_complete"] == (fault != "controller")
    if fault in {"validation", "controller"}:
        assert not set(calls) & {"topology", "windows", "focus", "power"}
    else:
        assert [name for name in calls if name in {"topology", "windows", "focus", "power"}] == [
            "topology",
            "windows",
            "focus",
            "power",
        ]
        assert report["session_restored"]
    if fault == "cancelled":
        assert report["failure"]["code"] == "cooperative_task_deadline"
    if fault == "controller":
        assert report["manual_actions"]
