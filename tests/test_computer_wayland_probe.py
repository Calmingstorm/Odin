"""Admission/isolation tests; fake replies NEVER count as compositor qualification."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest

from src.computer.runtime import wayland_probe as probe
from src.computer.runtime.assets import wayland_probe_private as private


def identity(**changes):
    obj = SimpleNamespace(path="/usr/bin/gnome-shell", device="0:1", inode=5, sha256="a" * 64)
    values = dict(binding_digest="b" * 64, compositor_name="gnome-shell", backend="native",
                  pid=123, uid=1003, start_ticks=42, boot_id="test", session_id=100,
                  eis_peer_pid=123, eis_peer_uid=1003, shell_owner=":1.2", version="48.7",
                  executable=obj, libraries=(SimpleNamespace(**{**vars(obj), "path": "/usr/lib/libmutter-16.so"}),))
    return SimpleNamespace(**(values | changes))


@pytest.mark.parametrize("changes", [dict(backend="unknown"), dict(eis_peer_pid=4),
    dict(eis_peer_uid=0), dict(shell_owner="org.fake"), dict(binding_digest="true"),
    dict(libraries=()), dict(pid=1)])
def test_identity_refused_without_starting_process(changes):
    result = asyncio.run(probe.qualify(identity(**changes)))
    assert result.state == "refused"
    assert result.probe_scope == "unmeasured"


def test_device_format_normalization_and_mismatch():
    assert private.device_equal("00:0a", "0:a")
    assert not private.device_equal("0:a", "0:b")
    assert not private.device_equal("garbage", "0:b")


def test_runtime_library_selector_is_case_sensitive():
    assert private.relevant_library("/usr/lib/libGLX.so.1")
    assert private.relevant_library("/usr/lib/libEGL.so.1")
    assert not private.relevant_library("/usr/lib/libglib-2.0.so.0")


def test_sandbox_no_host_runtime_home_display_or_devices(tmp_path):
    marker = tmp_path / "marker"
    marker.write_text(json.dumps({"nonce": "c" * 64}))
    argv = probe._sandbox_argv(marker)
    assert "--unshare-all" in argv and "--clearenv" in argv
    assert "--dev-bind" not in argv and "--share-net" not in argv
    assert "--die-with-parent" in argv
    bound = [argv[i + 1] for i, value in enumerate(argv) if value == "--ro-bind"]
    assert not any(path in bound for path in ("/run", "/tmp", "/home", "/dev", "/"))
    assert ":0" not in argv and "DBUS_SESSION_BUS_ADDRESS" not in argv


def test_private_guard_refuses_ambient_before_any_desktop(monkeypatch):
    monkeypatch.delenv("ODIN_WAYLAND_PROBE_NONCE", raising=False)
    with pytest.raises(RuntimeError, match="nonce_missing"):
        private.assert_private_environment()


def test_assets_import_does_not_load_gi_or_connect_display():
    env = {"PATH": "/usr/bin:/bin"}
    completed = subprocess.run([sys.executable, "-c",
        "import src.computer.runtime.wayland_probe; import sys; assert 'gi' not in sys.modules"],
        cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True, timeout=5)
    assert completed.returncode == 0, completed.stderr


def test_pidfd_cleanup_does_not_signal_reaped_pid(monkeypatch):
    class Done:
        returncode = 0
        pid = os.getpid()
    monkeypatch.setattr(probe.signal, "pidfd_send_signal", lambda *args: pytest.fail("signaled exited"))
    asyncio.run(probe._cleanup(Done(), 99))


def test_owned_gate_reaps_real_double_fork_in_separate_supervisor(tmp_path):
    gate = probe._ASSETS / "wayland_probe_gate.py"
    code = """import os,time
if os.fork()==0:
 if os.fork()==0: time.sleep(30)
 os._exit(0)
time.sleep(.05)
"""
    # Entire subreaper test is a separate process, never the live test runner.
    harness = ("import importlib.util,ctypes; "
               f"s=importlib.util.spec_from_file_location('gate',{str(gate)!r}); "
               "m=importlib.util.module_from_spec(s);s.loader.exec_module(m); "
               "assert ctypes.CDLL(None).prctl(36,1,0,0,0)==0; "
               f"assert m.supervise([{sys.executable!r},'-c',{code!r}])==0; "
               "import pathlib,os; assert not pathlib.Path(f'/proc/self/task/{os.getpid()}/children').read_text().strip()")
    result = subprocess.run([sys.executable, "-c", harness], capture_output=True, timeout=5)
    assert result.returncode == 0, result.stderr


def test_measurement_requires_every_expected_mapping(monkeypatch):
    obj = {"path": "/usr/bin/gnome-shell", "device": "0:1", "inode": 5, "sha256": "a" * 64}
    monkeypatch.setattr(private.os, "readlink", lambda path: obj["path"])
    monkeypatch.setattr(private, "measured_object", lambda path: obj)
    monkeypatch.setattr(private, "mapped_objects", lambda pid: [])
    with pytest.raises(RuntimeError, match="mapped_stack_mismatch"):
        private.require_same_stack({"executable": obj, "libraries": [obj]}, 123)


def test_probe_event_checks_do_not_accept_state_only(monkeypatch):
    asset = probe._ASSETS / "wayland_probe_session.py"
    monkeypatch.syspath_prepend(str(probe._ASSETS))
    spec = importlib.util.spec_from_file_location("trial", asset)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    trial = module.Trial({})
    try:
        trial.rows = [{"kind": "sample", "keys": [], "buttons": [], "state": 0,
                       "active": True, "focused": True}]
        assert trial.clean_after(0)
        assert not trial.event_after(0, "button_release", button=1)
        assert not trial.event_after(0, "key_release", key=65505)
    finally:
        trial.selector.close()
