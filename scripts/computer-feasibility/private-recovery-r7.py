#!/usr/bin/python3
"""Finite private recovery qualification, under owned-test-supervisor-r6.py.

Nested Xephyr/Xvfb in private mount/PID/net
namespaces. No production guard bypass. Fixture windows are not native apps;
extension availability is not hardware DPMS evidence. No inherited display.
"""

import argparse
import hashlib
import json
import os
import shutil
import signal
import subprocess
import tempfile
import time
import traceback
from pathlib import Path


def write(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def wait(check, seconds=10):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if check():
            return
        time.sleep(0.05)
    raise RuntimeError("bounded_readiness_or_postcondition_timeout")


class Children:
    def __init__(self):
        self.rows = []

    def spawn(self, name, argv, env):
        with Path("/workspace/" + name + ".log").open("w") as log:
            p = subprocess.Popen(argv, env=env, stdout=log, stderr=log)
        self.rows.append((name, p, os.pidfd_open(p.pid)))
        return p

    def close(self):
        report = []
        for name, p, fd in reversed(self.rows):
            try:
                if p.poll() is None:
                    signal.pidfd_send_signal(fd, signal.SIGTERM)
                try:
                    p.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    signal.pidfd_send_signal(fd, signal.SIGKILL)
                    p.wait(timeout=3)
                report.append({"name": name, "pid": p.pid, "returncode": p.returncode})
            finally:
                os.close(fd)
        return report


def fixture():
    assert os.environ.get("DISPLAY") == ":172"
    assert not any(Path("/home").iterdir()) and not Path("/tmp/.X11-unix/X0").exists()
    assert Path("/workspace/private.auth").is_file()
    from Xlib import X, display

    d = display.Display()
    windows = []
    for n in range(2):
        w = d.screen().root.create_window(
            150 + n * 380,
            180 + n * 170,
            280,
            180,
            0,
            d.screen().root_depth,
            X.InputOutput,
            X.CopyFromParent,
            background_pixel=0x305070 + n * 0x202000,
        )
        w.set_wm_name("private-r7-fixture-" + str(n))
        w.set_wm_class("private-r7", "PrivateRecoveryFixture")
        w.map()
        windows.append(w)
    d.sync()
    write(Path("/workspace/fixture.json"), {"pid": os.getpid(), "windows": [w.id for w in windows]})
    stop = False

    def terminate(_number, _frame):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, terminate)
    deadline = time.monotonic() + 180
    while not stop and time.monotonic() < deadline:
        while d.pending_events():
            d.next_event()
        d.sync()
        time.sleep(0.05)
    d.close()
    return 0


def inner(backend):
    assert os.geteuid() == 0
    assert not any(Path("/home").iterdir()) and not Path("/tmp/.X11-unix/X0").exists()
    assert not Path("/dev/dri").exists() and not Path("/dev/input").exists()
    assert "DISPLAY" not in os.environ and "XAUTHORITY" not in os.environ
    import main_scratch_randr as randr
    import main_scratch_windows as windows
    from Xlib import X, display

    home = Path("/workspace/home")
    home.mkdir(mode=0o700)
    authority = Path("/workspace/private.auth")
    authority.touch(mode=0o600)
    env = {
        "PATH": "/usr/bin:/bin",
        "LANG": "C.UTF-8",
        "HOME": str(home),
        "XAUTHORITY": str(authority),
        "DISPLAY": ":172",
        "XDG_CONFIG_HOME": str(home / "config"),
        "XDG_CACHE_HOME": str(home / "cache"),
        "XDG_DATA_HOME": str(home / "data"),
        "XDG_RUNTIME_DIR": str(home),
        "PYTHONDONTWRITEBYTECODE": "1",
        "LIBGL_ALWAYS_SOFTWARE": "1",
        "__EGL_VENDOR_LIBRARY_FILENAMES": "/usr/share/glvnd/egl_vendor.d/50_mesa.json",
    }
    subprocess.run(
        ["/usr/bin/xauth", "-f", str(authority)],
        input="".join("add :" + str(n) + " . " + os.urandom(16).hex() + "\n" for n in (171, 172)),
        text=True,
        env=env,
        timeout=5,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    children = Children()
    result = {
        "backend": backend,
        "namespace_isolated": True,
        "native_app_evidence": False,
        "hardware_dpms_evidence": False,
        "success": False,
    }
    d = None

    def ready(name):
        return (
            subprocess.run(
                ["/usr/bin/xdpyinfo"],
                env={**env, "DISPLAY": name},
                timeout=2,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            ).returncode
            == 0
        )

    try:
        children.spawn(
            "xvfb",
            [
                "/usr/bin/Xvfb",
                ":171",
                "-screen",
                "0",
                "1600x1100x24",
                "-auth",
                str(authority),
                "-nolisten",
                "tcp",
                "-noreset",
                "-extension",
                "GLX",
            ],
            env,
        )
        wait(lambda: ready(":171"))
        children.spawn(
            "xephyr",
            [
                "/usr/bin/Xephyr",
                ":172",
                "-screen",
                "1280x900",
                "-resizeable",
                "-auth",
                str(authority),
                "-nolisten",
                "tcp",
                "-noreset",
                "-extension",
                "GLX",
            ],
            {**env, "DISPLAY": ":171"},
        )
        wait(lambda: ready(":172"))
        rejected = {}
        for name in (":171", ":172"):
            rejected[name] = (
                subprocess.run(
                    ["/usr/bin/xdpyinfo"],
                    env={**env, "DISPLAY": name, "XAUTHORITY": "/nonexistent"},
                    timeout=2,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                ).returncode
                != 0
            )
        result["unauthorized_connections_rejected"] = rejected
        assert all(rejected.values())
        os.environ.update(env)
        d = display.Display(":172")
        result["extensions"] = list(d.list_extensions())
        result["dpms"] = {
            "extension_present": d.has_extension("DPMS"),
            "classification": "query-only; no power request or hardware proof",
        }
        with Path("/workspace/xrandr-before.txt").open("w") as stream:
            subprocess.run(
                ["/usr/bin/xrandr", "--current", "--verbose"],
                env=env,
                timeout=5,
                check=True,
                stdout=stream,
                stderr=subprocess.STDOUT,
            )
        baseline = None
        try:
            baseline = randr.capture(d)
            write(Path("/workspace/randr-before.json"), baseline)
            randr.validate(baseline)
            result["randr_preflight"] = "accepted"
        except Exception as exc:
            result["randr_preflight"] = {"type": type(exc).__name__, "detail": str(exc)}
            baseline = None
        wm = children.spawn("openbox", ["/usr/bin/openbox", "--sm-disable"], env)
        wait(
            lambda: d.screen().root.get_full_property(d.intern_atom("_NET_SUPPORTING_WM_CHECK"), 0)
        )
        time.sleep(1)
        app = children.spawn(
            "fixture", ["/usr/bin/python3", "/code/private-recovery-r7.py", "--fixture"], env
        )
        wait(lambda: Path("/workspace/fixture.json").exists())
        f = json.loads(Path("/workspace/fixture.json").read_text())
        visible, hidden = f["windows"]
        try:
            wait(lambda: set((visible, hidden)) <= set(windows.snapshot(d)["clients"]))
        finally:
            write(Path("/workspace/windows-readiness.json"), windows.snapshot(d))
            with Path("/workspace/window-tree.txt").open("w") as stream:
                subprocess.run(
                    ["/usr/bin/xwininfo", "-root", "-tree"],
                    env=env,
                    timeout=3,
                    stdout=stream,
                    stderr=subprocess.STDOUT,
                )
            result["fixture_pid_poll_at_readiness"] = app.poll()
        windows._send(d, hidden, "WM_CHANGE_STATE", [3, 0, 0, 0, 0])
        windows._send(d, visible, "_NET_ACTIVE_WINDOW", [2, X.CurrentTime, 0, 0, 0])
        wait(
            lambda: "_NET_WM_STATE_HIDDEN" in windows.snapshot(d)["windows"][hidden]["state_names"]
        )
        time.sleep(0.3)
        before = windows.snapshot(d)
        windows.validate(before)
        write(Path("/workspace/windows-before.json"), before)
        result["fixture_baseline"] = {
            "owner": before["windows"][hidden]["identity"],
            "wm_pid": wm.pid,
            "app_pid": app.pid,
        }
        if baseline is not None:
            output = next(o for o in baseline["outputs"] if o["crtc"])
            target = next(
                m
                for m in baseline["modes"]
                if m["id"] in output["modes"] and m["width"] == 800 and m["height"] == 600
            )
            changed = subprocess.run(
                ["/usr/bin/xrandr", "--output", output["name"], "--mode", hex(target["id"])],
                env=env,
                capture_output=True,
                text=True,
                timeout=5,
            )
            result["topology_change_command"] = {
                "returncode": changed.returncode,
                "stdout": changed.stdout,
                "stderr": changed.stderr,
            }
            if changed.returncode:
                raise RuntimeError("private_topology_mutation_failed")
            time.sleep(0.3)
            altered = randr.capture(d)
            write(Path("/workspace/randr-altered.json"), altered)
            assert altered != baseline
            result["actual_topology_changed"] = True
            result["randr_restore_return"] = randr.restore(d, baseline)
            after_randr = randr.capture(d)
            write(Path("/workspace/randr-after.json"), after_randr)
            assert after_randr == baseline
            assert randr.restore(d, baseline) is False
            result["exact_topology_restored"] = True
        else:
            result["actual_topology_changed"] = False
            result["exact_topology_restored"] = False
        # Controlled movement is independent of any resize-induced WM behavior.
        for wid in (visible, hidden):
            x, y, _, _ = before["windows"][wid]["geometry"]
            windows._send(
                d, wid, "_NET_MOVERESIZE_WINDOW", [10 | (3 << 8) | (2 << 12), x + 40, y + 35, 0, 0]
            )
        wait(
            lambda: (
                windows.snapshot(d)["windows"][hidden]["geometry"][:2]
                != before["windows"][hidden]["geometry"][:2]
            )
        )
        altered_windows = windows.snapshot(d)
        write(Path("/workspace/windows-altered.json"), altered_windows)
        result["default_restore"] = windows.restore_windows(d, before)
        assert any(row["xid"] == hidden for row in result["default_restore"]["errors"])
        assert windows.snapshot(d)["windows"][hidden] == altered_windows["windows"][hidden]
        hidden_resource = d.create_resource_object("window", hidden)
        hidden_resource.change_attributes(event_mask=X.StructureNotifyMask)
        d.sync()
        while d.pending_events():
            d.next_event()
        result["hidden_opt_in_restore"] = windows.restore_windows(
            d, before, restore_hidden_position=True
        )
        assert not result["hidden_opt_in_restore"]["errors"]
        assert hidden in result["hidden_opt_in_restore"]["restored"]
        d.sync()
        hidden_events = []
        while d.pending_events():
            notification = d.next_event()
            if getattr(getattr(notification, "window", None), "id", None) == hidden:
                hidden_events.append(notification.type)
        result["hidden_restore_structure_events"] = hidden_events
        assert X.MapNotify not in hidden_events and X.UnmapNotify not in hidden_events
        assert windows.snapshot(d)["active"] == before["active"]
        result["focus_pointer_restore"] = windows.restore_focus_pointer(d, before)
        assert not result["focus_pointer_restore"]["errors"]
        after_windows = windows.snapshot(d)
        write(Path("/workspace/windows-after.json"), after_windows)
        assert after_windows["windows"][hidden] == before["windows"][hidden]
        assert all(
            windows._same(after_windows["windows"][w], before["windows"][w], before)
            for w in (visible, hidden)
        )
        assert app.poll() is None and wm.poll() is None
        assert all(
            after_windows["windows"][w]["identity"] == before["windows"][w]["identity"]
            for w in (visible, hidden)
        )
        result["fixture_survivors"] = {
            "both_same_xid_pid_start_ticks": True,
            "hidden_exact_record_restored": True,
            "visible_geometry_state_restored": True,
            "scope": "harmless Xlib fixture process; not native app content/lifecycle",
        }
        result["window_qualification_passed"] = True
        result["success"] = baseline is not None
    except Exception as exc:
        result["failure"] = {
            "type": type(exc).__name__,
            "detail": str(exc),
            "traceback": traceback.format_exc(),
        }
    finally:
        if d is not None:
            d.close()
        result["owned_cleanup"] = children.close()
        authority.unlink(missing_ok=True)
        result["authority_removed"] = not authority.exists()
        write(Path("/workspace/result.json"), result)
        print(json.dumps(result), flush=True)
    return 0 if result["success"] else 2


def outer(backend):
    if os.geteuid() != 0:
        raise RuntimeError("run_as_root_beneath_owned_supervisor")
    out = Path(tempfile.mkdtemp(prefix="r7-private-recovery-", dir="/tmp"))
    source = Path(__file__).resolve().parent
    code = out / "code"
    code.mkdir()
    hashes = {}
    for name in ("private-recovery-r7.py", "main_scratch_randr.py", "main_scratch_windows.py"):
        shutil.copy2(source / name, code / name)
        hashes[name] = hashlib.sha256((code / name).read_bytes()).hexdigest()
    workspace = out / "workspace"
    workspace.mkdir()
    argv = [
        "/usr/bin/bwrap",
        "--unshare-all",
        "--die-with-parent",
        "--new-session",
        "--ro-bind",
        "/usr",
        "/usr",
        "--symlink",
        "usr/bin",
        "/bin",
        "--symlink",
        "usr/sbin",
        "/sbin",
        "--symlink",
        "usr/lib",
        "/lib",
        "--symlink",
        "usr/lib64",
        "/lib64",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--tmpfs",
        "/tmp",
        "--dir",
        "/etc",
        "--dir",
        "/home",
        "--ro-bind",
        "/etc/fonts",
        "/etc/fonts",
        "--ro-bind",
        "/etc/X11",
        "/etc/X11",
        "--ro-bind",
        str(code),
        "/code",
        "--bind",
        str(workspace),
        "/workspace",
        "--chdir",
        "/workspace",
        "--clearenv",
        "--setenv",
        "PATH",
        "/usr/bin:/bin",
        "--setenv",
        "LANG",
        "C.UTF-8",
        "--setenv",
        "PYTHONDONTWRITEBYTECODE",
        "1",
        "/usr/bin/python3",
        "/code/private-recovery-r7.py",
        "--inner",
        "--backend",
        backend,
    ]
    with (out / "namespace.log").open("w") as log:
        p = subprocess.Popen(
            argv, env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, stdout=log, stderr=log
        )
        fd = os.pidfd_open(p.pid)
        try:
            try:
                status = p.wait(timeout=230)
            except subprocess.TimeoutExpired:
                signal.pidfd_send_signal(fd, signal.SIGKILL)
                status = p.wait(timeout=5)
        finally:
            os.close(fd)
    report = {
        "artifact_directory": str(out),
        "namespace_returncode": status,
        "source_sha256": hashes,
        "backend": backend,
    }
    write(out / "outer.json", report)
    print(json.dumps(report), flush=True)
    return status if status >= 0 else 128 - status


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", choices=("xephyr",), default="xephyr")
    parser.add_argument("--inner", action="store_true")
    parser.add_argument("--fixture", action="store_true")
    args = parser.parse_args()
    raise SystemExit(
        fixture() if args.fixture else inner(args.backend) if args.inner else outer(args.backend)
    )
