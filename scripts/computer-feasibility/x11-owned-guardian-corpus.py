#!/usr/bin/python3
"""Actual core-XTEST guardian and attached adapter, only private :177.

Toolkit lifecycle tests use private GTK without claiming app allowlist approval.
Product app-scope tests use actual Xed, unchanged production executable checks.
"""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

from Xlib import X, display

sys.path.insert(0, "/code")
from src.computer.runtime.x11_attached import X11AttachedBackend, worker_environment  # noqa: E402
from src.computer.runtime.x11_guardian import Guardian, InjectionHelper  # noqa: E402
from src.computer.runtime.x11_owned_device import ExistingXTest  # noqa: E402

assert os.geteuid() == 65534 and os.environ.get("DISPLAY") == ":177"
assert Path("/proc/self").exists() and not Path("/tmp/.X11-unix/X0").exists()
assert not Path("/home/odin").exists() and not Path("/opt/odin").exists()
assert "CapEff:\t0000000000000000" in Path("/proc/self/status").read_text()
children, streams = [], []

def record(kind, **values):
    print(json.dumps(dict(kind=kind, t=time.monotonic(), **values)), flush=True)

def spawn(name, args, **kw):
    stream = open(f"/workspace/{name}.log", "w")
    streams.append((name, stream))
    child = subprocess.Popen(args, stdout=stream, stderr=subprocess.STDOUT, **kw)
    children.append((name, child))
    return child

def wait_for(check, timeout=3):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = check()
        if value:
            return value
        time.sleep(.015)
    raise AssertionError("private postcondition timeout")

def records(name):
    text = Path(f"/workspace/{name}.log").read_text()
    return [json.loads(line) for line in text.splitlines(keepends=True)
            if line.endswith("\n") and line.startswith("{")]

passed = 0
server = app = None
try:
    Path("/tmp/.X11-unix").mkdir(mode=0o1777)
    server = spawn("xvfb", ["Xvfb", ":177", "-screen", "0", "900x500x24",
                            "-nolisten", "tcp", "-noreset", "-extension", "GLX"])
    wait_for(lambda: subprocess.run(["xdpyinfo", "-display", ":177"],
             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0)
    app = spawn("gtk", ["/usr/bin/python3", "/harness/x11-owned-target.py"], stdin=subprocess.PIPE)
    wait_for(lambda: Path("/workspace/owned-target.json").exists())
    d = display.Display(":177")
    xid = json.loads(Path("/workspace/owned-target.json").read_text())["xid"]
    target = d.create_resource_object("window", xid)
    target.set_input_focus(X.RevertToParent, X.CurrentTime)
    d.sync()
    human = ExistingXTest(":177")
    before_devices = human.identity()
    record("native-preflight", devices=before_devices,
           held={k: sorted(v) for k,v in human.held().items()})
    human.move(100, 30)
    human.button(1, True)
    human.button(1, False)
    human.sync()
    # Pre-existing same synthetic codes are not ours. Admission must leave them.
    human.move(880, 480)  # Outside the receiver; no right-click context menu.
    human.key(human.keycode("Shift_L"), True)
    human.button(3, True)
    native = ExistingXTest(":177")
    helper = InjectionHelper(":177", worker_environment(""))
    rejection = Guardian(native, helper, lambda step: None, controller_fd=None).run([
        ("key", native.keycode("Control_L"), True)])
    assert rejection["status"] == "unavailable" and rejection["released"]
    assert human.held() == {"keys": {human.keycode("Shift_L")}, "buttons": {3}}
    human.key(human.keycode("Shift_L"), False)
    human.button(3, False)
    native.close()
    record("preheld-input-preserved", receipt=rejection)
    human.move(100, 30)
    human.button(1, True)
    human.button(1, False)
    for repeat in range(2):
        for mode in ("complete", "controller-eof", "cancel", "helper-eof", "lease"):
            native = ExistingXTest(":177")
            helper = InjectionHelper(":177", worker_environment(""))
            readfd, writefd = os.pipe()
            code = native.keycode("Control_L")
            held = threading.Event()
            times = {}
            def validate(step):
                if step[0] == "wait":
                    held.set()
                    assert code in native.held()["keys"] and 1 in native.held()["buttons"]
                    times["held"] = time.monotonic()
            guardian = Guardian(native, helper, validate, controller_fd=readfd)
            def trigger():
                assert held.wait(2)
                time.sleep(.03)
                if mode == "controller-eof":
                    os.close(writefd)
                elif mode == "cancel":
                    os.write(writefd, b"cancel\n")
                elif mode == "helper-eof":
                    helper.sock.sendall(b'{"op":"quit"}\n')
            thread = threading.Thread(target=trigger)
            thread.start()
            steps = [("key", code, True), ("button", 1, True),
                     ("wait", .08 if mode == "complete" else 3)]
            result = guardian.run(steps)
            thread.join(3)
            os.close(readfd)
            if mode != "controller-eof":
                os.close(writefd)
            assert result["released"] and result["injected"], result
            reasons = {"complete":"complete", "controller-eof":"controller_eof",
                       "cancel":"controller_cancel", "helper-eof":"input_helper_eof",
                       "lease":"input_lease_expired"}
            assert result["reason"] == reasons[mode], result
            assert result["release_ms"] < 250, result
            assert human.held() == {"keys": set(), "buttons": set()}
            assert human.identity() == before_devices and app.poll() is None
            assert helper.process.returncode == 0
            wait_for(lambda: any(r.get("kind") == "event" and not r["keys"] and not r["buttons"]
                                and r["t"] > times["held"] for r in records("gtk")))
            marker = chr(97 + passed)
            start = time.monotonic()
            for chord in human.text_keys(marker):
                for key in chord:
                    human.key(key, True)
                for key in reversed(chord):
                    human.key(key, False)
            human.sync()
            fresh = wait_for(lambda: [r for r in records("gtk") if r.get("kind") == "text"
                                     and r["t"] > start and marker in r.get("text", "")])
            passed += 1
            record("lifecycle-pass", trial=passed, mode=mode, result=result,
                   same_application_pid=app.pid, fresh_human_text=fresh[-1],
                   helper_exit=helper.process.returncode)
            native.close()
    app.stdin.close()
    assert app.wait(timeout=3) == 0
    human.close()
    xed = spawn("xed", ["/usr/bin/xed", "--standalone", "--new-window"])
    def xed_window():
        for w in d.screen().root.query_tree().children:
            if w.get_wm_class() == ("xed", "Xed") and w.get_attributes().map_state == X.IsViewable:
                return w
        return None
    xed_target = wait_for(xed_window)
    xed_target.configure(x=20, y=20, width=800, height=450)
    xed_target.set_input_focus(X.RevertToParent, X.CurrentTime)
    d.sync()
    time.sleep(.2)
    async def product():
        b = X11AttachedBackend(enabled=True, display_name=":177", monitor_names=["screen"],
                               app_profile="xed", input_enabled=True)
        descriptors = [b.startup_descriptor("actual-xed-owned-guardian")]
        b.runtime_identity_callback = lambda descriptor: descriptors.append(descriptor)
        try:
            started = await b.start("actual-xed-owned-guardian")
            frame = await b.observe()
            assert frame.focused and frame.scope.input_sources, b._scope
            second = await b.observe()
            assert frame.source == second.source
            async def action(kind, **fields):
                f = await b.observe()
                receipt = await b.act(dict(type=kind, source_id=f.source.source_id,
                    source_revision=f.source.source_revision,
                    consent_generation=f.source.consent_generation,
                    expected={"type":"visual_change"}, **fields))
                record("product-action", action=kind, receipt=receipt)
                assert receipt["released"] and receipt["status"] == "executed", receipt
                return receipt
            await action("click", x=200, y=180)
            await action("type", text="guardian xed marker")
            await action("polyline", points=[[200,180], [210,180], [220,180]], duration=.1)
            await action("key", chord="ctrl+a")
            await action("key", chord="BackSpace")
            stopped = await b.detach()
            assert stopped["released"] and not b._guardians and xed.poll() is None
            assert not descriptors[-1]["launch_pending"]
            assert descriptors[-1]["processes"] and descriptors[-1]["input_was_enabled"]
            record("product-detached", started=started, stopped=stopped, same_xed_pid=xed.pid,
                   identity_updates=len(descriptors), process_identities=descriptors[-1]["processes"])
        finally:
            await b.detach()
    asyncio.run(product())
    # Only this new empty scratch Xed, never existing work, receives normal close.
    protocols = d.intern_atom("WM_PROTOCOLS")
    delete = d.intern_atom("WM_DELETE_WINDOW")
    from Xlib.protocol import event
    xed_target.send_event(event.ClientMessage(window=xed_target, client_type=protocols,
                         data=(32, [delete, X.CurrentTime, 0, 0, 0])), event_mask=0)
    d.sync()
    assert xed.wait(timeout=3) == 0
    d.close()
    record("corpus-pass", lifecycle_trials=passed, product_xed=True)
finally:
    for name, child in reversed(children):
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=3)
        record("child-reaped", name=name, pid=child.pid, status=child.returncode)
    for name, stream in streams:
        stream.close()
        if name != "gtk" or passed != 10:
            print(f"=== {name} diagnostics ===", flush=True)
            print(Path(f"/workspace/{name}.log").read_text(), flush=True)
