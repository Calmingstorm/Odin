"""Owned, authenticated Xvfb cross-UID scope discovery; no input injection."""
import inspect
import json
import os
import select
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from Xlib import X, Xatom, display

from src.computer.runtime.x11_app_scope import AppScope
from src.computer.runtime.x11_attached import worker_environment
from src.computer.runtime.x11_attached_worker import AttachedConnection


def receiver(name):
    connection = display.Display(name)
    try:
        root = connection.screen().root
        window = root.create_window(20, 30, 300, 200, 0, connection.screen().root_depth,
                                    X.InputOutput, X.CopyFromParent)
        window.set_wm_class("scratch-editor", "ScratchEditor")
        window.set_wm_name("Untitled")
        window.change_property(connection.intern_atom("_NET_WM_PID"), Xatom.CARDINAL,
                               32, [os.getpid()])
        window.map()
        window.set_input_focus(X.RevertToParent, X.CurrentTime)
        connection.sync()
        print("ready", flush=True)
        sys.stdin.read()
    finally:
        connection.close()


def main():
    assert os.geteuid() == 0, "explicit root fixture required for cross-UID child"
    number = 35000 + os.getpid() % 10000
    name = f":{number}"
    socket = Path(f"/tmp/.X11-unix/X{number}")
    lock = Path(f"/tmp/.X{number}-lock")
    assert not socket.exists() and not lock.exists()
    children = []
    with tempfile.TemporaryDirectory(prefix="scope-r13-") as tmp:
        os.chmod(tmp, 0o755)
        authority = str(Path(tmp) / "authority")
        env = worker_environment(authority)
        os.environ.clear()
        os.environ.update(env)
        subprocess.run(["/usr/bin/xauth", "-f", authority, "add", name, ".",
                        os.urandom(16).hex()], check=True, env=env, timeout=3,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.chmod(authority, 0o644)  # Fixture cookie only, under random temporary directory.
        server = subprocess.Popen(["/usr/bin/Xvfb", name, "-screen", "0", "800x600x24",
                                   "-auth", authority, "-nolisten", "tcp", "-noreset"],
                                  env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        children.append(server)
        connection = None
        try:
            deadline = time.monotonic() + 5
            while not socket.exists():
                assert server.poll() is None and time.monotonic() < deadline
                time.sleep(.03)
            receiver_code = ("import os, sys\nfrom Xlib import X, Xatom, display\n"
                             + inspect.getsource(receiver) + "\nreceiver(sys.argv[1])\n")
            child = subprocess.Popen(["/usr/bin/python3", "-B", "-c", receiver_code, name],
                                     user=65534, group=65534, extra_groups=[], env=env,
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL)
            children.append(child)
            assert select.select([child.stdout], [], [], 5)[0]
            assert child.stdout.readline() == b"ready\n"
            connection = AttachedConnection(name)
            monitor = connection.topology().monitors[0]
            scope = AppScope(connection._display)
            binding, reason = scope.inspect(monitor)
            assert reason is None and binding["process"]["uid"] == 65534
            assert binding["process"]["pid"] == child.pid
            scope.assert_snapshot(binding, monitor)
            print(json.dumps({"cross_uid_target": True, "authoritative_xres_pid": True,
                              "stable_revalidation": True, "input_injected": False}))
        finally:
            if connection:
                connection.close()
            for child in reversed(children):
                if child.stdin:
                    child.stdin.close()
                if child.poll() is None:
                    child.terminate()
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=3)
                assert not Path(f"/proc/{child.pid}").exists()
        assert not socket.exists() and not lock.exists()


if __name__ == "__main__":
    receiver(sys.argv[2]) if len(sys.argv) > 1 else main()
