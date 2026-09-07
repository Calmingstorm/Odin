"""Opt-in full controller/Xed evidence. Requires owned-test-supervisor-r6.

Allocates its own Xvfb and private HOME/runtime/session bus before launching apps.
All GUI operations after fixture placement use the real controller. The backend
subclass records native evidence only; it never changes replies or bypasses gates.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from src.computer.controller import ComputerController  # noqa: E402
from src.computer.models import ComputerError, RequestContext  # noqa: E402
from src.computer.runtime.x11_attached import X11AttachedBackend  # noqa: E402
from src.computer.runtime.x11_capture import X11MonitorCapture  # noqa: E402
from src.computer.runtime.x11_owned_device import ExistingXTest, PersistentXTest  # noqa: E402
from src.computer.store import ComputerStore  # noqa: E402


async def qualify(out, keyboard_only=False):
    out.mkdir(mode=0o700, parents=True, exist_ok=False)
    result = {"passed": False, "actions": [], "observations": []}
    children = []
    controller = store = core = native = None
    env = dict(os.environ)
    for key, name in {"HOME": "home", "XDG_CONFIG_HOME": "config",
                      "XDG_DATA_HOME": "data", "XDG_CACHE_HOME": "cache",
                      "XDG_RUNTIME_DIR": "runtime"}.items():
        (out / name).mkdir(mode=0o700)
        env[key] = str(out / name)
    env.update(GDK_BACKEND="x11", NO_AT_BRIDGE="1", XAUTHORITY="/dev/null")

    def spawn(argv, **kwargs):
        child = subprocess.Popen(argv, env=env, **kwargs)
        children.append(child)
        return child

    def setup(argv):
        return subprocess.run(argv, env=env, check=True, capture_output=True, text=True).stdout

    try:
        read, write = os.pipe()
        xvfb = spawn(["Xvfb", "-displayfd", str(write), "-screen", "0", "1000x700x24",
                      "-nolisten", "tcp"], pass_fds=(write,), stderr=subprocess.DEVNULL)
        os.close(write)
        with os.fdopen(read) as stream:
            display = ":" + stream.readline().strip()
        assert display != ":0" and display[1:].isdecimal()
        env["DISPLAY"] = display
        result.update(display=display, xvfb_pid=xvfb.pid)
        bus = spawn(["dbus-daemon", "--session", "--nofork", "--print-address=1"],
                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        env["DBUS_SESSION_BUS_ADDRESS"] = bus.stdout.readline().strip()
        assert env["DBUS_SESSION_BUS_ADDRESS"].startswith("unix:")
        setup(["dbus-update-activation-environment", "DISPLAY", "HOME", "XDG_CONFIG_HOME",
               "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR", "XAUTHORITY"])
        spawn(["openbox"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        await asyncio.sleep(.5)
        setup(["gsettings", "set", "org.gnome.desktop.interface", "cursor-blink", "false"])
        setup(["setxkbmap", "-layout", "us", "-variant", "intl"])
        native = PersistentXTest(display)
        identity = native.identity()
        keyboard = next(row[0] for row in identity if row[2] == 2)
        native.close()
        native = None
        setup(["setxkbmap", "-device", str(keyboard), "-layout", "us", "-variant", "intl"])
        app = spawn(["xed", "--standalone", "--new-window"], stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL)
        await asyncio.sleep(1.5)
        window = setup(["xdotool", "search", "--onlyvisible", "--class", "xed"]).splitlines()[-1]
        setup(["xdotool", "windowsize", window, "850", "600"])
        setup(["xdotool", "windowmove", window, "10", "10"])
        setup(["xdotool", "windowactivate", "--sync", window])
        core = ExistingXTest(display)
        core.move(950, 650)
        result.update(app_pid=app.pid, app_window=window, core_pointer_before=core.pointer(),
                      persistent_ids=identity, monitors=setup(["xrandr", "--listmonitors"]))
        class RecordedBackend(X11AttachedBackend):
            async def act(self, payload):
                try:
                    receipt = await super().act(payload)
                    result.setdefault("native_receipts", []).append(receipt)
                    return receipt
                except BaseException:
                    result.setdefault("native_errors", []).append(traceback.format_exc())
                    raise

        backend = RecordedBackend(enabled=True, display_name=display,
                                  monitor_names=["screen"], input_enabled=True)
        requested = []

        def factory(app_name):
            requested.append(app_name)
            return backend

        store = ComputerStore(out / "state.sqlite", out / "evidence")
        controller = ComputerController(store, factory, lambda _: True, enabled=True)
        context = RequestContext("fixture-operator", "fixture-channel", "fixture-turn", "localhost")
        grant = await controller.session(context, {"operation": "start"})
        result["start"] = grant
        assert requested == [None] and grant["app"] is None
        assert grant["application_provenance"]["exe_basename"] == "xed"
        assert grant["input_supported"] is True
        args = {"session_id": grant["session_id"], "generation": grant["generation"]}

        async def observe(label, crop=None):
            await asyncio.sleep(.15)
            observed = await controller.observe(
                context, {**args, **({"crop": crop} if crop else {})})
            (out / f"{label}.png").write_bytes(observed.pop("image_bytes"))
            result["observations"].append({"label": label, **observed})
            obs = controller._live[grant["session_id"]].observations[observed["observation_id"]]
            await controller.validate_observation_delivery(
                context, obs.frame_metadata, obs.image_sha256)
            return obs

        async def act(label, operation, crop=None, **fields):
            obs = await observe(label, crop)
            payload = {**args, "observation_id": obs.observation_id, "action_id": label,
                       "source_id": obs.source.source_id,
                       "source_revision": obs.source.source_revision,
                       "consent_generation": obs.source.consent_generation, "operation": operation,
                       "expect": {"type": "visual_change"}, **fields}
            if obs.modal:
                payload["expected_modal"] = obs.modal
            receipt = await controller.act(context, payload)
            result["actions"].append({"label": label, "request": payload, "receipt": receipt})
            (out / "progress.json").write_text(json.dumps(result, indent=2))
            assert receipt["status"] not in {"unknown", "unavailable"}, receipt
            assert receipt["execution"] == {"injected": True, "released": True}
            assert receipt["application_provenance"]["exe_basename"] == "xed"
            assert core.pointer() == (950, 650), core.pointer()
            return receipt

        crop = {"x": 10, "y": 10, "width": 850, "height": 600}
        await act("type-note", "type", crop=crop, text="Controller evidence café")
        await act("newline", "key", key="Return")
        await act("second-line", "type", text="Second line")
        result["keyboard_only"] = keyboard_only
        if not keyboard_only:
            await act("select-word", "double_click", x=190, y=147)
            await act("context-menu", "right_click", x=190, y=147)
            await act("dismiss-menu", "key", key="Escape")
            await act("scroll", "scroll", x=700, y=400, direction="down", count=3)
        await act("save-dialog", "key", key="ctrl+s")
        destination = out / "controller-note.txt"
        await act("save-path", "type", text=str(destination))
        await act("save-confirm", "key", key="Return")
        await asyncio.sleep(.5)
        result["saved_text"] = destination.read_text()
        assert result["saved_text"] == "Controller evidence café\nSecond line\n", (
            result["saved_text"])
        await act("close-document", "key", key="ctrl+w")
        await act("open-dialog", "key", key="ctrl+o")
        await act("open-location", "key", key="ctrl+l")
        await act("open-path", "type", text=str(destination))
        await act("open-confirm", "key", key="Return")
        await observe("reopened-document")
        old = await observe("before-topology")
        old_epoch = backend._topology_epoch
        capture = X11MonitorCapture(display, enabled=True)
        capture.topology()
        screen = capture._connection._display.screen()
        mm = (screen.width_in_mms, screen.height_in_mms)
        capture._connection._root.xrandr_set_screen_size(1000, 700, mm[0] + 1, mm[1])
        capture._connection._display.sync()
        capture._connection._root.xrandr_set_screen_size(1000, 700, *mm)
        capture._connection._display.sync()
        capture.close()
        await asyncio.sleep(.2)
        assert backend._topology_epoch > old_epoch
        try:
            await controller.validate_action_binding(store.get_session(grant["session_id"]),
                                                     old.observation_id)
            raise AssertionError("stale topology accepted")
        except ComputerError as exc:
            result["stale_topology_refusal"] = exc.code
        fresh = await observe("after-topology")
        assert fresh.source.source_revision > old.source.source_revision
        result["topology_epochs"] = [old_epoch, backend._topology_epoch]
        result["stop"] = await controller.session(context, {**args, "operation": "stop"})
        result["app_alive_after_stop"] = app.poll() is None
        result["core_pointer_after"] = core.pointer()
        native = PersistentXTest(display)
        result["owned_held_after_stop"] = {
            key: sorted(value) for key, value in native.held().items()}
        assert result["app_alive_after_stop"] and not any(native.held().values())
        cleanup = result["stop"]["cleanup"]
        assert all(cleanup[key] is True for key in
                   ("complete", "stopped", "released", "capture_revoked", "input_revoked",
                    "applications_preserved"))
        assert cleanup["owned_devices"] == "retained_inactive"
        result["passed"] = True
    except BaseException:
        result["error"] = traceback.format_exc()
        raise
    finally:
        if controller:
            await controller.close()
        if store:
            result["session_rows"] = [
                dict(row) for row in store.db.execute("SELECT * FROM sessions")]
            store.close()
        for device in (native, core):
            if device:
                device.close()
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=3)
        result["direct_children_reaped"] = all(child.poll() is not None for child in children)
        (out / "result.json").write_text(json.dumps(result, indent=2))
        print(json.dumps({"evidence": str(out), "passed": result["passed"],
                          "error": result.get("error")}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--keyboard-only", action="store_true")
    arguments = parser.parse_args()
    asyncio.run(qualify(arguments.output, arguments.keyboard_only))
