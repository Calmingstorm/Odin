"""Disposable Xvfb evidence for task-owned XI2 master removal.

This is deliberately a standalone child of owned-test-supervisor-r6.py. It
uses a high PID-derived display, exact child PIDs only, and never consults
DISPLAY from the caller.
"""
from __future__ import annotations

import asyncio
import json
import os
import select
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.computer.runtime import x11_owned_device as owned  # noqa: E402
from src.computer.runtime.x11_attached import X11AttachedBackend  # noqa: E402
from src.computer.runtime.x11_session_lifecycle import input_lease  # noqa: E402


def environment(authority):
    return {"PATH": "/usr/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
            "HOME": "/nonexistent", "XAUTHORITY": authority,
            "PYTHONDONTWRITEBYTECODE": "1"}


def settle(child):
    """Reap this exact test child, never a display-wide process pattern."""
    if child.poll() is None:
        child.terminate()
    try:
        child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=2)
    assert not Path(f"/proc/{child.pid}").exists(), "exact child was not reaped"


def wait_server(server, lock, socket_path):
    deadline = time.monotonic() + 3
    while not (lock.exists() and socket_path.exists()):
        assert server.poll() is None and time.monotonic() < deadline
        time.sleep(.02)
    assert int(lock.read_text()) == server.pid


def prefix(char):
    return "Odin session " + char * 32


def xinput(*args):
    result = subprocess.run(["/usr/bin/xinput", *map(str, args)],
                            timeout=3, capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    return result


def xinput_id(name):
    return int(xinput("list", "--id-only", name).stdout.strip())


def held_and_physical_restore(display_name):
    """Real session endpoints release held input and recover a foreign slave."""
    native = observer = None
    try:
        native = owned.SessionXTest(display_name, prefix("a"), create=True)
        observer = owned.SessionXTest(display_name, prefix("a"))
        assert observer.identity() == native.identity()  # Existing, non-creating open.
        observer.close()
        observer = None
        pointer, _keyboard, _xp, _xk = native._owned_pair(native._topology())
        # These events target task XTEST endpoints, never core endpoints.
        native.key(38, True)
        native.button(1, True)
        assert native.owned_release_state() == {"keys": {38}, "buttons": {1}}
        # Xvfb's pre-existing pointer slave is the private fixture's fake
        # physical endpoint. xinput performs the attachment independently; this
        # endpoint is never used for fixture injection.
        fake_physical = xinput_id("Xvfb mouse")
        xinput("reattach", fake_physical, pointer[0])
        assert any(item[0] == fake_physical for item in native._core_slave_baseline)
        # The attachment is the explicit simulated recovery condition. Accept
        # that known topology, while retaining the immutable pre-create baseline
        # used by detach to decide where it must be restored.
        native._initial = native.identity()
        native._session_physical_slaves = native._core_slave_baseline
        receipt = native.detach_owned()
        assert receipt == {"released": True, "owned_devices": "removed",
                           "physical_slaves_restored": True, "no_inflight_input": True,
                           "no_active_grabs": True, "owned_masters_removed": True}
        rows = native._topology()
        core_pointer, _core_keyboard = owned.SessionXTest._core_pair(rows)
        assert next(row for row in rows if row[0] == fake_physical)[3] == core_pointer
        return receipt
    finally:
        if observer is not None:
            observer.close()
        if native is not None:
            native.close()


def grab_blocks_removal(display_name):
    """A separate client grab blocks clean removal until it is released."""
    native = holder = None
    try:
        native = owned.SessionXTest(display_name, prefix("b"), create=True)
        holder = owned.SessionXTest(display_name, prefix("b"))
        pointer, _keyboard, _xp, _xk = native._owned_pair(native._topology())
        mask = owned._EventMask(pointer[0], 0, None)
        with holder._checked():
            assert holder._xi.XIGrabDevice(holder._display, pointer[0],
                                           holder._x.XDefaultRootWindow(holder._display),
                                           0, 0, 1, 1, 0, owned.C.byref(mask)) == 0
        try:
            native.detach_owned()
        except owned.X11DeviceError as exc:
            assert str(exc) == "owned_master_grabbed"
        else:
            raise AssertionError("external master grab produced a clean detach")
        assert any(row[1] == prefix("b") + " pointer" for row in native._topology())
        with holder._checked():
            assert holder._xi.XIUngrabDevice(holder._display, pointer[0], 0) == 0
        holder.close()
        holder = None
        receipt = native.detach_owned()
        assert receipt["owned_masters_removed"] and receipt["no_active_grabs"]
        return receipt
    finally:
        if holder is not None:
            holder.close()
        if native is not None:
            native.close()


def hold_lease(fd):
    with input_lease(fd):
        print(json.dumps({"lease": "held"}), flush=True)
        while sys.stdin.buffer.read(1):
            pass


def lifecycle_eof_waits(display_name, env):
    lease_fd = os.memfd_create("f1-live-lease", os.MFD_CLOEXEC)
    os.write(lease_fd, b"0")
    lifecycle = holder = None
    try:
        lifecycle = subprocess.Popen(
            [sys.executable, "-I", str(ROOT / "src/computer/runtime/x11_session_lifecycle.py")],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
            pass_fds=(lease_fd,))
        request = {"display_name": display_name, "xauthority": env["XAUTHORITY"],
                   "monitor_names": ["private"], "session_prefix": prefix("c"),
                   "session_lease_fd": lease_fd}
        assert lifecycle.stdin is not None and lifecycle.stdout is not None
        lifecycle.stdin.write(json.dumps(request).encode() + b"\n")
        lifecycle.stdin.flush()
        ready = json.loads(lifecycle.stdout.readline())
        assert ready["ok"] is True and ready["released"] is True
        opened = owned.SessionXTest(display_name, prefix("c"))
        try:
            assert opened.identity() == tuple(tuple(row) for row in ready["device_identity"])
        finally:
            opened.close()
        holder = subprocess.Popen([sys.executable, "-I", __file__, "--hold-lease", str(lease_fd)],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE,
                                  env=env, pass_fds=(lease_fd,))
        assert json.loads(holder.stdout.readline()) == {"lease": "held"}
        lifecycle.stdin.close()
        # EOF alone cannot cross the exclusive detach fence while an input client
        # retains its inherited shared lock.
        assert not select.select([lifecycle.stdout], [], [], .25)[0]
        os.pwrite(lease_fd, b"0", 0)
        rejected = subprocess.run([sys.executable, "-I", __file__, "--hold-lease", str(lease_fd)],
                                  env=env, pass_fds=(lease_fd,), capture_output=True,
                                  text=True, timeout=2)
        assert rejected.returncode != 0 and "session_lease_revoked" in rejected.stderr
        assert holder.stdin is not None
        holder.stdin.close()
        holder.wait(timeout=2)
        assert holder.returncode == 0
        receipt = json.loads(lifecycle.stdout.readline())
        lifecycle.wait(timeout=7)
        assert lifecycle.returncode == 0, lifecycle.stderr.read().decode("utf-8", "replace")
        assert receipt == {"released": True, "owned_devices": "removed",
                           "physical_slaves_restored": True, "no_inflight_input": True,
                           "no_active_grabs": True, "owned_masters_removed": True}
        return receipt
    finally:
        os.close(lease_fd)
        if holder is not None:
            settle(holder)
        if lifecycle is not None:
            settle(lifecycle)


def backend_start_detach(display_name, authority):
    """Exercise the real backend watcher plus lifecycle owner, with no action."""
    async def cycle():
        backend = X11AttachedBackend(enabled=True, display_name=display_name,
                                    xauthority=authority, monitor_names=["screen"],
                                    input_enabled=True)
        started = await backend.start("r13-fixture")
        assert started["ok"] is True and started["input_supported"] is True
        assert backend._lifecycle is not None and backend._topology_task is not None
        assert backend._children
        receipt = await backend.detach()
        assert receipt["stopped"] is True and receipt["released"] is True
        assert receipt["owned_devices"] == "removed"
        assert all(receipt[key] is True for key in (
            "physical_slaves_restored", "no_inflight_input", "no_active_grabs",
            "owned_masters_removed"))
        assert not backend._children and not backend._guardians
        assert backend._session_lease_fd is None
        return receipt
    return asyncio.run(cycle())


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--hold-lease":
        hold_lease(int(sys.argv[2]))
        return
    number = 32000 + os.getpid() % 20000
    display_name = f":{number}"
    lock, socket_path = Path(f"/tmp/.X{number}-lock"), Path(f"/tmp/.X11-unix/X{number}")
    assert number > 20000 and not lock.exists() and not socket_path.exists()
    server = None
    try:
        with tempfile.TemporaryDirectory(prefix="odin-x11-detach-r13-") as temporary:
            authority = str(Path(temporary) / "authority")
            base = environment("/dev/null")
            os.environ.clear()
            os.environ.update(base)
            subprocess.run(["/usr/bin/xauth", "-f", authority, "add", display_name, ".",
                            os.urandom(16).hex()], env=base, check=True, timeout=2,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            env = environment(authority)
            env["DISPLAY"] = display_name
            os.environ.clear()
            os.environ.update(env)
            server = subprocess.Popen(["/usr/bin/Xvfb", display_name, "-screen", "0", "800x600x24",
                "-auth", authority, "-nolisten", "tcp", "-noreset", "-extension", "GLX"], env=env,
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            wait_server(server, lock, socket_path)
            evidence = {"held_restore": held_and_physical_restore(display_name),
                        "grab_block": grab_blocks_removal(display_name),
                        "lifecycle": lifecycle_eof_waits(display_name, env),
                        "backend_cycle": backend_start_detach(display_name, authority)}
            assert server.poll() is None
            probe = owned.ExistingXTest(display_name)
            probe.close()
            evidence["server_alive"] = True
            print(json.dumps(evidence, sort_keys=True), flush=True)
    finally:
        if server is not None:
            settle(server)
        assert not socket_path.exists() and not lock.exists()


if __name__ == "__main__":
    main()
