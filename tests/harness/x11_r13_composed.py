"""Opt-in stock-X11 composed qualification, under owned-test-supervisor-r6.

The root fixture provisions ONLY its own authenticated Xvfb and UID65534 apps.
The controller runs as UID1003; runtime_sudo uses the real worker identity gate.
No master precreation, keymap edits, identity stubs, or workstation connections.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import select
import subprocess
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


async def controller_run(out, display, authority):
    from Xlib.display import Display
    from Xlib.ext import xinput

    from src.computer.controller import ComputerController
    from src.computer.models import RequestContext
    from src.computer.runtime.x11_attached import X11AttachedBackend
    from src.computer.store import ComputerStore

    assert os.getuid() in {0, 1003} and display != ":0"
    os.environ["XAUTHORITY"] = authority
    connection = Display(display)
    root = connection.screen().root
    result = {"passed": False, "controller_uid": os.getuid(), "actions": []}
    store = controller = None

    def census():
        return sorted([
            {"id": d.deviceid, "name": d.name, "use": d.use,
             "attachment": d.attachment, "enabled": bool(d.enabled)}
            for d in connection.xinput_query_device(xinput.AllDevices).devices
        ], key=lambda row: row["id"])

    def pointer():
        p = root.query_pointer()
        return [p.root_x, p.root_y]

    def persist():
        (out / "result.json").write_text(json.dumps(result, indent=2))

    try:
        initial = census()
        result["initial_devices"] = initial
        assert len(initial) == 6 and not any("Odin" in d["name"] for d in initial)
        assert [d["name"] for d in initial if d["use"] in (1, 2)] == [
            "Virtual core pointer", "Virtual core keyboard"]
        result["core_pointer_initial"] = pointer()
        assert pointer() == [950, 650]
        class RecordedBackend(X11AttachedBackend):
            async def start(self, session_id):
                try:
                    return await super().start(session_id)
                except BaseException:
                    result["native_start_error"] = traceback.format_exc()
                    raise

        backend = RecordedBackend(enabled=True, display_name=display,
                                     xauthority=authority, monitor_names=["screen"],
                                     input_enabled=True, runtime_sudo=os.getuid() != 0)
        requested = []

        def factory(app):
            requested.append(app)
            return backend

        private = out / "worker-home"
        store = ComputerStore(private / "state.sqlite", private / "evidence")
        controller = ComputerController(store, factory, lambda _: True, enabled=True)
        context = RequestContext("fixture-operator", "fixture-channel", "fixture-turn", "localhost")
        grant = await controller.session(context, {"operation": "start"})
        result["start"] = grant
        persist()
        assert requested == [None] and grant["app"] is None
        assert grant["input_supported"] is True, grant
        assert backend.capabilities.pointer_separation == "shared"
        assert backend.creates_devices is False
        assert backend._session_lease_fd is None
        assert grant["application_provenance"]["exe_basename"] == "xed"
        args = {"session_id": grant["session_id"], "generation": grant["generation"]}

        async def observe(label, crop=None):
            await asyncio.sleep(.3)
            observed = await controller.observe(context, {
                **args, **({"crop": crop} if crop else {})})
            (out / f"{label}.png").write_bytes(observed.pop("image_bytes"))
            result.setdefault("observations", []).append({"label": label, **observed})
            obs = controller._live[grant["session_id"]].observations[observed["observation_id"]]
            await controller.validate_observation_delivery(
                context, obs.frame_metadata, obs.image_sha256)
            return obs

        async def act(label, operation, crop=None, **fields):
            obs = await observe(label, crop)
            payload = {**args, "observation_id": obs.observation_id, "action_id": label,
                       "source_id": obs.source.source_id,
                       "source_revision": obs.source.source_revision,
                       "consent_generation": obs.source.consent_generation,
                       "operation": operation, "expect": {"type": "visual_change"}, **fields}
            if obs.modal:
                payload["expected_modal"] = obs.modal
            receipt = await controller.act(context, payload)
            record = {"label": label, "request": payload, "receipt": receipt,
                      "core_pointer": pointer(), "devices": census()}
            result["actions"].append(record)
            persist()
            assert receipt["status"] not in {"unknown", "unavailable"}, receipt
            assert receipt["execution"] == {"injected": True, "released": True}, receipt
            assert receipt["application_provenance"]["exe_basename"] == "xed"
            # Shared fallback intentionally moves the core pointer. Independence
            # is not claimed; every native endpoint must still be unchanged.
            # Every stock/core slave, including the synthetic Xvfb physical pair,
            # retains its identity and original attachment throughout input.
            initial_ids = {r["id"] for r in initial}
            assert [d for d in record["devices"] if d["id"] in initial_ids] == initial

        await act("click-editor", "click",
                  crop={"x": 70, "y": 170, "width": 30, "height": 30}, x=15, y=15)
        await act("type-note", "type", text="Stock controller note 123")
        await act("newline", "key", key="Return")
        await act("second-line", "type", text="Shared pointer and clean Stop")
        await act("save-dialog", "key", key="ctrl+s")
        destination = out / "scratch" / "note.txt"
        await act("save-path", "type", text=str(destination))
        await act("save-confirm", "key", key="Return")
        await asyncio.sleep(.5)
        result["saved_text"] = destination.read_text()
        assert result["saved_text"] == (
            "Stock controller note 123\nShared pointer and clean Stop\n")
        await observe("saved-document")
        result["stop"] = await controller.session(context, {**args, "operation": "stop"})
        await asyncio.sleep(.75)
        result["final_devices"] = census()
        result["core_pointer_final"] = pointer()
        app_pid = grant["application_provenance"]["pid"]
        proc = Path(f"/proc/{app_pid}/stat")
        result["app_state_after_stop"] = (
            proc.read_text().rsplit(") ", 1)[1].split()[0] if proc.exists() else "gone")
        result["app_alive_after_stop"] = result["app_state_after_stop"] not in {"Z", "X", "gone"}
        assert result["app_alive_after_stop"]
        assert result["final_devices"] == initial, result["final_devices"]
        cleanup = result["stop"]["cleanup"]
        assert all(cleanup[key] is True for key in (
            "complete", "stopped", "released", "capture_revoked", "input_revoked",
            "applications_preserved"))
        assert cleanup["owned_devices"] == "not_created"
        result["passed"] = True
    except BaseException:
        result["error"] = traceback.format_exc()
        raise
    finally:
        if controller:
            try:
                await controller.close()
            except BaseException:
                result["close_error"] = traceback.format_exc()
                result["passed"] = False
        result["devices_after_controller_close"] = census()
        connection.close()
        if store:
            store.close()
        persist()
        print(json.dumps({"passed": result["passed"], "evidence": str(out),
                          "error": result.get("error")}), flush=True)


def fixture(out, root_controller=False):
    assert os.geteuid() == 0, "Run under explicitly privileged owned-test-supervisor-r6"
    # Fixed IDs are explicit fixture provisioning, never production identity overrides.
    assert not out.exists()
    out.mkdir(mode=0o755)
    controller_uid = 0 if root_controller else 1003
    os.chown(out, controller_uid, controller_uid)
    for name, uid in (("home", 65534), ("config", 65534), ("data", 65534),
                      ("cache", 65534), ("runtime", 65534), ("scratch", 65534),
                      ("worker-home", controller_uid)):
        path = out / name
        path.mkdir(mode=0o755 if name == "scratch" else 0o700)
        os.chown(path, uid, uid)
    children = []
    env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "GDK_BACKEND": "x11",
           "NO_AT_BRIDGE": "1", "HOME": str(out / "home"),
           "XDG_CONFIG_HOME": str(out / "config"), "XDG_DATA_HOME": str(out / "data"),
           "XDG_CACHE_HOME": str(out / "cache"), "XDG_RUNTIME_DIR": str(out / "runtime")}

    def spawn(argv, uid=65534, **kw):
        child = subprocess.Popen(argv, env=env, user=uid, group=uid, extra_groups=[], **kw)
        children.append(child)
        return child

    def setup(argv):
        return subprocess.run(argv, env=env, user=65534, group=65534, extra_groups=[],
                              capture_output=True, text=True, check=True, timeout=10).stdout

    number = 35000 + os.getpid() % 10000
    display = f":{number}"
    socket = Path(f"/tmp/.X11-unix/X{number}")
    lock = Path(f"/tmp/.X{number}-lock")
    assert not socket.exists() and not lock.exists()
    authority = out / "authority"
    subprocess.run(["/usr/bin/xauth", "-f", str(authority), "add", display, ".",
                    os.urandom(16).hex()],
                   check=True, capture_output=True, timeout=5)
    os.chown(authority, 1003, 65534)
    authority.chmod(0o640)
    env.update(DISPLAY=display, XAUTHORITY=str(authority))
    result = {"display": display, "application_uid": 65534, "controller_uid": controller_uid,
              "qualification_route": (
                  "explicit_root_controller" if root_controller else "uid1003_runtime_sudo")}
    try:
        xvfb = spawn(["/usr/bin/Xvfb", display, "-screen", "0", "1000x700x24",
                      "-nolisten", "tcp", "-noreset", "-auth", str(authority)],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 5
        while not socket.exists():
            assert xvfb.poll() is None and time.monotonic() < deadline
            time.sleep(.03)
        bus = spawn(["/usr/bin/dbus-daemon", "--session", "--nofork", "--print-address=1"],
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        assert select.select([bus.stdout], [], [], 5)[0]
        env["DBUS_SESSION_BUS_ADDRESS"] = bus.stdout.readline().strip()
        assert env["DBUS_SESSION_BUS_ADDRESS"].startswith("unix:")
        setup(["/usr/bin/dbus-update-activation-environment", "DISPLAY", "HOME", "XAUTHORITY",
               "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR"])
        spawn(["/usr/bin/openbox"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(.5)
        with (out / "xed.log").open("wb") as app_log:
            app = spawn(["/usr/bin/xed", "--standalone", "--new-window"],
                        stdout=app_log, stderr=app_log)
        time.sleep(1.5)
        window = setup(["/usr/bin/xdotool", "search", "--onlyvisible",
                        "--class", "xed"]).splitlines()[-1]
        setup(["/usr/bin/xdotool", "windowsize", window, "850", "600"])
        setup(["/usr/bin/xdotool", "windowmove", window, "10", "10"])
        setup(["/usr/bin/xdotool", "windowactivate", "--sync", window])
        setup(["/usr/bin/xdotool", "mousemove", "950", "650"])
        result.update(app_pid=app.pid, xvfb_pid=xvfb.pid, window=window)
        # Controller receives no application bus and cannot use its private HOME.
        env.pop("DBUS_SESSION_BUS_ADDRESS")
        env["HOME"] = str(out / "worker-home")
        worker = spawn([sys.executable, "-B", str(Path(__file__).resolve()), "--worker",
                        "--output", str(out), "--display", display,
                        "--authority", str(authority)], uid=controller_uid)
        result["worker_returncode"] = worker.wait(timeout=100)
        result["app_alive_after_worker"] = app.poll() is None
        result["app_returncode_after_worker"] = app.returncode
        assert result["worker_returncode"] == 0, result
        assert result["app_alive_after_worker"]
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=3)
        result["direct_children_reaped"] = all(child.poll() is not None for child in children)
        result["display_socket_removed"] = not socket.exists() and not lock.exists()
        (out / "fixture.json").write_text(json.dumps(result, indent=2))
        assert result["direct_children_reaped"] and result["display_socket_removed"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--display")
    parser.add_argument("--authority")
    parser.add_argument("--root-controller", action="store_true",
                        help="Supplementary native qualification only, NOT runtime_sudo evidence")
    args = parser.parse_args()
    if args.worker:
        asyncio.run(controller_run(args.output, args.display, args.authority))
    else:
        fixture(args.output, args.root_controller)
