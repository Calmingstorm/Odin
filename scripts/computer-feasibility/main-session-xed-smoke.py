#!/usr/bin/env python3
"""Explicit operator-authorized scratch-Xed main-session test.

Run only with current operator authorization. No screenshots leave memory/private
controller evidence; evidence is purged afterward. Only a newly launched scratch
application receives input. Changed existing geometry is restored only against
captured identity. No forced wake. Final comparison reports any mismatch.
Development agents must never run this against the main desktop.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import pwd
import re
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from Xlib import display  # noqa: E402

from src.computer.integration import ComputerIntegration  # noqa: E402
from src.computer.models import RequestContext  # noqa: E402


def command(*argv):
    return subprocess.run(argv, check=True, capture_output=True, text=True, timeout=10).stdout


def power_state():
    value = command("xset", "q")
    match = re.search(r"Monitor is (On|Off|Standby|Suspend)", value)
    return match.group(1) if match else "unavailable"


async def run(args):
    if not args.confirm_overnight_scratch_only:
        raise RuntimeError("Explicit current overnight scratch authorization required")
    if (not re.fullmatch(r":[0-9]{1,5}(?:\.[0-9]+)?", args.display)
            or not Path(args.xauthority).is_absolute() or not args.monitor):
        raise RuntimeError("explicit_display_monitor_authority_required")
    os.environ["DISPLAY"], os.environ["XAUTHORITY"] = args.display, args.xauthority
    os.umask(0o077)
    principal = pwd.getpwnam(args.session_user)
    if principal.pw_uid != 1000:
        raise RuntimeError("operator_uid_must_be_1000")
    # /home/odin is deliberately not traversable by the desktop user. Keep the
    # exact private scratch directory beneath /tmp, with a per-directory ACL,
    # rather than changing the service user's home permissions.
    base = Path(tempfile.mkdtemp(prefix="assisted-session-r5-", dir="/tmp"))
    home = base / "scratch-home"
    home.mkdir(mode=0o700)
    command("sudo", "-n", "chown", f"{principal.pw_uid}:{principal.pw_gid}", str(home))
    # Parent is traversable solely for the explicitly named session identity.
    command("sudo", "-n", "setfacl", "-m", f"u:{args.session_user}:--x", str(base))
    import main_scratch_randr as randr
    import main_scratch_windows as windows
    from main_scratch_support import (
        bounded,
        bus_config,
        durable_json,
        exact_process,
        launch,
        stage,
        terminate,
    )
    d = None
    try:
        with bounded():
            d = display.Display(args.display)
            before = {"randr": randr.capture(d), "windows": windows.snapshot(d),
                      "power": power_state()}
            durable_json(base / "before.json", before)
            randr.validate(before["randr"])
            windows.validate(before["windows"])
            monitor = randr.monitor_geometry(d, args.monitor)
            if monitor["width"] < 800 or monitor["height"] < 600:
                raise RuntimeError("monitor_too_small")
            if {"randr": randr.capture(d), "windows": windows.snapshot(d),
                    "power": power_state()} != before:
                raise RuntimeError("preflight_session_changed")
    except Exception as exc:
        records = [{"stage": "preflight", "ok": False, "error_type": type(exc).__name__}]
        if d is not None:
            await stage(records, base, "close_x_connection", d.close)
        await stage(records, base, "remove_unused_scratch_home",
                    lambda: command("sudo", "-n", "rm", "-rf", "--", str(home)))
        print(json.dumps({"passed": False, "stages": records, "private_journal": str(base)}))
        return 1
    settings = SimpleNamespace(enabled=True, storage_dir=str(base / "private-state"),
        environment="existing_session", platform="x11", display=args.display,
        xauthority=args.xauthority, monitor_names=[args.monitor], runtime_sudo=True)
    bot = SimpleNamespace(config=SimpleNamespace(computer=settings),
        host_access_manager=SimpleNamespace(
            is_host_allowed=lambda owner, host: host == "localhost"),
        tool_executor=SimpleNamespace(check_permission=lambda *_: None))
    service = None
    context = RequestContext("authorized-overnight-test", "private-scratch", uuid.uuid4().hex,
                             "localhost")
    app_identity = None
    app_windows = []
    processes = {}
    stages = [{"stage": "preflight_durable_snapshot", "ok": True}]
    passed = False
    actions = []
    failure = None
    marker = "Assisted input verified " + uuid.uuid4().hex[:8]
    filename = home / "verified-note.txt"

    def assert_owned_focus():
        from src.computer.runtime.x11_app_scope import AppScope
        with bounded():
            scope = AppScope(d, "xed")
            target, _ = scope._target(d.get_input_focus().focus, d.screen().root)
            if not exact_process(app_identity) or scope._pid(target) != app_identity["pid"]:
                raise RuntimeError("focus_not_gated_scratch")

    async def capture(grant):
        assert_owned_focus()
        result = await asyncio.wait_for(service.controller.observe(context, {
            "session_id": grant["session_id"], "generation": grant["generation"]}), 20)
        obs = service.controller._live[grant["session_id"]].observations[result["observation_id"]]
        # Same native encoding/delivery validation as the facade, never prose-only grounding.
        image = service.output_image(result)
        assert image["__image_block__"]["type"] == "image"
        await asyncio.wait_for(service.controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256), 20)
        return obs

    async def act(grant, operation, **fields):
        # Short bounded settling: never replay input, only refresh pre-input evidence.
        for attempt in range(4):
            obs = await capture(grant)
            payload = {"session_id": obs.session_id, "generation": obs.generation,
                "action_id": uuid.uuid4().hex, "observation_id": obs.observation_id,
                "source_id": obs.source.source_id, "source_revision": obs.source.source_revision,
                "consent_generation": obs.source.consent_generation,
                "operation": operation, "expect": {"type": "visual_change"}, **fields}
            if obs.modal is not None:
                payload["expected_modal"] = obs.modal
            started = time.monotonic()
            try:
                assert_owned_focus()
                receipt = await asyncio.wait_for(service.controller.act(context, payload), 20)
            except Exception as exc:
                if str(exc) in {"visual_target_changed", "stale_source_binding"} and attempt < 3:
                    await asyncio.sleep(.15)
                    continue
                raise
            actions.append({"operation": operation, "status": receipt["status"],
                            "seconds": round(time.monotonic() - started, 3)})
            if receipt["status"] in {"unknown", "unavailable"}:
                raise RuntimeError("Uncertain or unavailable action; no replay")
            await asyncio.sleep(.25)
            return

    try:
        service = ComputerIntegration(bot)
        if principal.pw_uid != 1000:
            raise RuntimeError("operator_uid_must_be_1000")
        launcher = Path(__file__).with_name("main_scratch_launcher.py")
        config, socket = base / "bus.conf", home / "bus.socket"
        config.write_text(bus_config(socket))
        config.chmod(0o600)
        for source, name in ((launcher, "launcher.py"), (config, "bus.conf")):
            command("sudo", "-n", "install", "-m", "600", "-o", "1000", "-g",
                    str(principal.pw_gid), str(source), str(home / name))
        if not await stage(stages, base, "launch_private_bus",
                           lambda: launch("bus", args, home, base, processes)):
            raise RuntimeError("private_bus_launch_failed")
        if not await stage(stages, base, "launch_gated_xed",
                           lambda: launch("xed", args, home, base, processes)):
            raise RuntimeError("gated_xed_launch_failed")
        app_identity = processes["xed"]["identity"]
        for _ in range(50):
            await asyncio.sleep(.1)
            with bounded():
                current = windows.snapshot(d)
                app_windows = [wid for wid in current["windows"]
                               if windows.identity(d, wid) == {"xid": wid, **app_identity}]
            if len(app_windows) == 1:
                break
        if len(app_windows) != 1:
            raise RuntimeError("Unique scratch window unavailable")
        window = app_windows[0]
        with bounded():
            if (window in before["windows"]["windows"] or
                    windows.identity(d, window) != {"xid": window, **app_identity}):
                raise RuntimeError("scratch_ownership_changed")
        # Only the NEW app window is positioned/focused. Existing windows untouched.
        command("xdotool", "windowmove", str(window),
                str(monitor["x"] + 40), str(monitor["y"] + 50))
        command("xdotool", "windowsize", str(window), str(min(1000, monitor["width"] - 80)),
                str(min(700, monitor["height"] - 100)))
        command("xdotool", "windowactivate", "--sync", str(window))
        await asyncio.sleep(.5)
        assert_owned_focus()
        grant = await asyncio.wait_for(
            service.controller.session(context, {"operation": "start", "app": "xed"}), 20)
        await act(grant, "type", text=marker)
        await act(grant, "key", key="ctrl+s")
        await act(grant, "key", key="ctrl+a")
        await act(grant, "type", text=str(filename))
        await act(grant, "key", key="Return")
        for _ in range(30):
            await asyncio.sleep(.1)
            try:
                command("sudo", "-n", "-u", args.session_user, "test", "-f", str(filename))
                break
            except subprocess.CalledProcessError:
                continue
        saved = subprocess.run(["sudo", "-n", "cat", str(filename)], check=True,
                               capture_output=True, timeout=5).stdout
        passed = saved == (marker + "\n").encode()
        if not passed:
            raise RuntimeError("Scratch GUI artifact mismatch")
    except Exception as error:
        failure = {"type": type(error).__name__, "code": str(error)[:120]}
    finally:
        if service is not None:
            await stage(stages, base, "controller_close", service.controller.close)
            await stage(stages, base, "purge_evidence", service.controller.store.purge_evidence)
            await stage(stages, base, "integration_close", service.close)
        if app_identity and not before["windows"]["active"][0]:
            def minimize_scratch():
                for window in app_windows:
                    if windows.identity(d, window) == {"xid": window, **app_identity}:
                        command("xdotool", "windowminimize", str(window))
            await stage(stages, base, "minimize_only_scratch", minimize_scratch)
        await stage(stages, base, "terminate_gated_xed",
                    lambda: terminate("xed", args, home, processes))
        await stage(stages, base, "terminate_private_bus",
                    lambda: terminate("bus", args, home, processes))
        if processes.get("xed", {}).get("identity"):
            await stage(stages, base, "restore_randr", lambda: randr.restore(d, before["randr"]))
            await stage(stages, base, "restore_focus_pointer",
                        lambda: windows.restore_focus_pointer(d, before["windows"]))
            await stage(stages, base, "restore_existing_windows",
                        lambda: windows.restore_windows(d, before["windows"]))
        await asyncio.sleep(.5)
        def compare():
            after = {"randr": randr.capture(d), "windows": windows.snapshot(d),
                     "power": power_state()}
            durable_json(base / "after.json", after)
            if after != before:
                raise RuntimeError("session_not_exactly_restored")
        restored = await stage(stages, base, "compare_exact_session", compare)
        await stage(stages, base, "close_x_connection", d.close)
        if all(e["wrapper"].returncode is not None for e in processes.values()):
            await stage(stages, base, "remove_scratch_home",
                        lambda: command("sudo", "-n", "rm", "-rf", "--", str(home)))
        success = passed and restored and all(record["ok"] for record in stages)
        print(json.dumps({"passed": success, "artifact_exact": passed,
            "session_restored": restored, "stages": stages, "actions": actions,
            "failure": failure, "private_journal": str(base),
            "screenshots_purged": any(r["stage"] == "purge_evidence" and r["ok"] for r in stages),
            "artifact_sha256": hashlib.sha256((marker + "\n").encode()).hexdigest()
                if passed else None}), flush=True)
    return 0 if success else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm-overnight-scratch-only", action="store_true")
    parser.add_argument("--display", required=True)
    parser.add_argument("--monitor", required=True)
    parser.add_argument("--xauthority", required=True)
    parser.add_argument("--session-user", required=True)
    raise SystemExit(asyncio.run(run(parser.parse_args())))
