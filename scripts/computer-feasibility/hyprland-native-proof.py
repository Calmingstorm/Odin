#!/usr/bin/env python3
"""Native evidence ONLY inside disposable hyprland-isolated-lab namespaces."""
import json
import os
from pathlib import Path
import select
import socket
import struct
import subprocess
import time

ROOT = Path("/proof")
assert Path(__file__).resolve() == ROOT / "harness.py"
assert not Path("/opt/Odin").exists()
assert not Path("/dev/input").exists()
assert not list(Path("/dev/dri").glob("card*"))
assert os.environ["XDG_RUNTIME_DIR"] == "/proof/runtime"
HYPR_PID = json.loads((ROOT / "ready.json").read_text())["hyprland"]["pid"]
PLUGIN = "/proof/hyprland-ledger-plugin.so"
env = dict(os.environ, ODIN_HYPRLAND_ISOLATED_PROOF="1")
matching_instances = []
for ipc in (ROOT / "runtime/hypr").glob("*/.socket.sock"):
    try:
        with socket.socket(socket.AF_UNIX) as candidate:
            candidate.connect(str(ipc))
            peer = struct.unpack("3i", candidate.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if peer[0] == HYPR_PID and peer[1] == os.getuid():
                matching_instances.append(ipc.parent.name)
    except OSError:
        continue
assert len(matching_instances) == 1
env["HYPRLAND_INSTANCE_SIGNATURE"] = matching_instances[0]
children, handles, results = [], [], []
loaded = False
(ROOT / "result.json").unlink(missing_ok=True)


def log(event, **fields):
    print(json.dumps({"event": event, "monotonic_ns": time.monotonic_ns(), **fields}), flush=True)


def ctl(*args):
    cp = subprocess.run(["hyprctl", *args], capture_output=True, text=True, env=env, timeout=3)
    log("hyprctl", args=args, returncode=cp.returncode, stdout=cp.stdout, stderr=cp.stderr)
    if cp.returncode:
        raise RuntimeError("isolated hyprctl failed: " + cp.stdout + cp.stderr)
    return cp.stdout.strip()


def line(child):
    if not select.select([child.stdout], [], [], 2)[0]:
        raise RuntimeError("child response timeout")
    text = child.stdout.readline()
    if not text:
        raise RuntimeError(f"child exited {child.poll()}")
    parsed = json.loads(text)
    log("sender", value=parsed)
    return parsed


def command(child, value):
    child.stdin.write(value + "\n")
    child.stdin.flush()
    return line(child)


def spawn_native(executable, *args, output=None):
    bootstrap = (
        "import os,socket,struct,sys;"
        "s=socket.socket(socket.AF_UNIX);s.connect('/proof/runtime/hypr-test');"
        "p,u,g=struct.unpack('3i',s.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));"
        f"assert p=={HYPR_PID} and u==os.getuid();"
        "os.set_inheritable(s.fileno(),True);"
        "os.execv(sys.argv[1],[sys.argv[1],str(s.fileno()),*sys.argv[2:]])"
    )
    child = subprocess.Popen(["python3", "-c", bootstrap, executable, *args],
                             stdin=subprocess.PIPE, stdout=output or subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)
    children.append(child)
    return child


def sender():
    child = spawn_native("/proof/build/hyprland-native-sender")
    ready = line(child)
    assert ready["event"] == "ready" and ready["pid"] == child.pid
    return child


def receiver(name):
    path = ROOT / f"{name}.jsonl"
    file = path.open("w")
    handles.append(file)
    child = spawn_native("/proof/build/hyprland-wire-receiver", name, "30000", output=file)
    time.sleep(.5)
    if child.poll() is not None:
        raise RuntimeError("receiver failed " + path.read_text())
    return path


def events(path, start=0):
    result = []
    for text in path.read_text().splitlines()[start:]:
        try:
            result.append(json.loads(text))
        except json.JSONDecodeError:
            pass
    return result


def has(evidence, event, state):
    return any(e.get("event") == event and e.get("state") == state for e in evidence)


def load():
    global loaded
    ctl("plugin", "load", PLUGIN)
    loaded = True


def unload():
    global loaded
    if loaded:
        ctl("plugin", "unload", PLUGIN)
    loaded = False


try:
    ctl("keyword", "input:virtualkeyboard:release_pressed_on_close", "true")
    ctl("getoption", "input:virtualkeyboard:release_pressed_on_close")
    if json.loads(ctl("-j", "monitors")) == []:
        ctl("output", "create", "wayland", "ODIN-PROOF")
        time.sleep(.4)
    monitors = json.loads(ctl("-j", "monitors"))
    assert len(monitors) == 1 and monitors[0]["width"] > 0 and monitors[0]["height"] > 0, \
        "isolated compositor lacks a functioning nonzero-sized output"
    first = sender()
    target = receiver("phase3-receiver-a")
    command(first, "P 400 300")
    first.stdin.write("Q\n")
    first.stdin.flush()
    first.wait(timeout=2)
    for case, guarded in [("stock-explicit", False), ("stock-sigkill", False),
                          ("plugin-stop", True), ("plugin-sigkill", True),
                          ("plugin-deadline", True), ("plugin-unload", True),
                          ("plugin-focus-transfer", True)]:
        child = None
        try:
            if guarded:
                load()
            child = sender()
            ctl("dispatch", "focuswindow", "title:^phase3-receiver-a$")
            command(child, "P 400 300")
            time.sleep(.04)
            start = len(target.read_text().splitlines())
            if guarded:
                ctl("dispatch", "odin-phase3-ledger", f"arm {child.pid} 250")
            command(child, "H 30 272")
            time.sleep(.025)
            before = events(target, start)
            if not (has(before, "keyboard_key", 1) and has(before, "pointer_button", 1)):
                raise RuntimeError("receiver did not confirm BOTH presses")
            act_ns, other = time.monotonic_ns(), None
            if case.endswith("explicit"):
                command(child, "R")
            elif case.endswith("sigkill"):
                child.kill()
                child.wait(timeout=2)
            elif case == "plugin-stop":
                ctl("dispatch", "odin-phase3-ledger", "stop")
            elif case == "plugin-unload":
                unload()
            elif case == "plugin-focus-transfer":
                other = receiver("phase3-receiver-b")
            time.sleep(.4)
            evidence = events(target, start)
            key_up = has(evidence, "keyboard_key", 0)
            button_up = has(evidence, "pointer_button", 0)
            passed = key_up and (not button_up if case == "stock-sigkill" else button_up)
            result = {"case": case, "passed": passed, "key_release": key_up,
                      "button_release": button_up, "action_ns": act_ns,
                      "receiver_events": evidence}
            if other:
                transferred = events(other)
                result["second_receiver_events"] = transferred
                result["held_key_leaked"] = any(30 in e.get("keys", []) for e in transferred)
                result["passed"] &= not result["held_key_leaked"]
            if guarded and loaded:
                result["plugin_status"] = ctl("dispatch", "odin-phase3-ledger", "status")
            results.append(result)
            log("case", **result)
        except Exception as exc:
            results.append({"case": case, "passed": False, "error": str(exc)})
            log("case_failure", case=case, error=str(exc))
        finally:
            if child and child.poll() is None:
                child.kill()
                child.wait(timeout=2)
            unload()
            if case == "stock-sigkill":
                recovery = sender()
                command(recovery, "H 30 272")
                command(recovery, "R")
                recovery.stdin.write("Q\n")
                recovery.stdin.flush()
                recovery.wait(timeout=2)
    (ROOT / "result.json").write_text(json.dumps({"native_cases": results,
        "shipping_gate": "NO-GO: incomplete full input/scope qualification",
        "all_test_expectations_met": all(r["passed"] for r in results)}, indent=2) + "\n")
finally:
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
        try:
            child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=2)
    for file in handles:
        file.close()
    if not (ROOT / "result.json").exists():
        (ROOT / "result.json").write_text(json.dumps({
            "native_cases": results, "shipping_gate": "INCOMPLETE / NO-GO",
            "all_test_expectations_met": False,
            "reason": "harness terminated before native corpus completion"}, indent=2) + "\n")
    log("harness_cleanup", children=[{"pid": c.pid, "returncode": c.returncode} for c in children])
