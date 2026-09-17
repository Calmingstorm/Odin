#!/usr/bin/env python3
"""Guest-only real controller autoload/discovery smoke; no recovery promotion."""
import argparse
import asyncio
from dataclasses import asdict
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.computer.controller import ComputerController
from src.computer.models import RequestContext
from src.computer.runtime.hyprland_backend import HyprlandRuntimeBackend, HyprlandSessionConfig
from src.computer.runtime.hyprland_discovery import HyprlandDiscoveryPolicy, HyprlandDiscoveryResolver
from src.computer.runtime.hyprland_identity import ExecutableTrust
from src.computer.store import ComputerStore
from src.computer.vision import observation_image
from PIL import Image


def receiver_point(image_bytes):
    """Ground in the receiver's actual rendered solid-blue content, never coordinates."""
    with Image.open(io.BytesIO(image_bytes)) as image:
        image = image.convert("RGB")
        mask = image.point(lambda _: 0).convert("L")
        mask.putdata([255 if pixel == (40, 91, 121) else 0 for pixel in image.getdata()])
        box = mask.getbbox()
        if box is None:
            raise AssertionError("receiver rendered content absent")
        left, top, right, bottom = box
        assert right - left >= 100 and bottom - top >= 100, box
        assert sum(mask.histogram()[1:]) >= (right - left) * (bottom - top) * .9
        # The compositor cursor may obscure the center. Ground a clean patch
        # one quarter into the receiver content instead of assuming its center.
        for fx, fy in ((1, 1), (3, 1), (1, 3), (3, 3)):
            x, y = left + (right - left) * fx // 4, top + (bottom - top) * fy // 4
            if all(image.getpixel((px, py)) == (40, 91, 121)
                   for px in range(x - 20, x + 21) for py in range(y - 20, y + 21)):
                return x, y, box
        raise AssertionError("receiver contains no unobscured grounded patch")


def redact(value):
    if isinstance(value, dict):
        return {k: ("[redacted]" if any(x in k.lower() for x in ("token", "secret", "capability")) else redact(v)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    if isinstance(value, bytes):
        return {"bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()}
    return value


async def run(args):
    assert socket.gethostname() == "odin-hyprland-lab" and os.getuid() == 0
    os.umask(0o077)
    out = Path(args.evidence)
    out.mkdir(parents=True, exist_ok=False)
    def record(name, value):
        (out / (name + ".json")).write_text(json.dumps(redact(value), indent=2, default=str))
    repo = Path(__file__).resolve().parents[2]
    record("source-hashes", {str(path.relative_to(repo)): hashlib.sha256(path.read_bytes()).hexdigest()
           for path in [Path(__file__).resolve(), repo / "src/computer/runtime/hyprland_plugin.py",
                        repo / "src/computer/runtime/hyprland_discovery.py",
                        repo / "src/computer/controller.py", repo / "src/computer/runtime/hyprland_backend.py"]})
    trust = ExecutableTrust("/home/lab/lab-build/prefix/bin/Hyprland", "bfb6a200300e09b5929130d831c815242ec87ce98531ea25993a921aa9e2472b", "0.55.2", "39d7e209c79d451efab1b21151d5938289da838d", owner_uid=1000)
    config = HyprlandSessionConfig(expected_uid=1000, runtime_dir="/run/user/1000", wayland_display="", instance_signature="", output_name="Virtual-1", compositor_pid=None, compositor_trust=trust, guardian_binary="/usr/local/lib/odin/odin-hyprland-input", capture_binary="/usr/local/lib/odin/odin-hyprland-capture", discovery_mode="auto", managed_activation=True, plugin_manifest_path="/usr/local/lib/odin/build-identity.json")
    record("config", asdict(config))
    resolved = await HyprlandDiscoveryResolver(HyprlandDiscoveryPolicy(1000, "/run/user/1000", trust)).resolve()
    record("discovery", asdict(resolved))
    maps = Path(f"/proc/{resolved.pid}/maps")
    (out / "maps-before.txt").write_text(maps.read_text())
    if not args.allow_loaded:
        assert "odin-hyprland-scope" not in maps.read_text(), "plugin already loaded before managed activation"
    if args.previous:
        old = json.loads((Path(args.previous) / "discovery.json").read_text())
        assert old["identity"]["process"]["boot_id"] != resolved.identity.process.boot_id
        assert old["instance_signature"] != resolved.instance_signature
        record("reboot-boundary", {"old": old, "new": asdict(resolved), "old_pins_not_reused": True})
        selection_path = Path(args.previous) / "selection.json"
        previous = json.loads(selection_path.read_text()) if selection_path.exists() else None
    else:
        previous = None
    store = ComputerStore(out / "db", out / "private-evidence")
    receiver_log = (out / "receiver.jsonl").open("wb")
    connection = socket.socket(socket.AF_UNIX)
    connection.connect(resolved.runtime_dir + "/" + resolved.wayland_display)
    peer = struct.unpack("3i", connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    assert peer[:2] == (resolved.pid, 1000)
    code = ("import os,socket,struct,sys;s=socket.socket(socket.AF_UNIX);s.connect(sys.argv[1]);"
            "p,u,g=struct.unpack('3i',s.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));"
            "assert p==int(sys.argv[2]) and u==1000;os.set_inheritable(s.fileno(),True);"
            "os.execv(sys.argv[3],[sys.argv[3],str(s.fileno()),'odin-lab-autoload','30000'])")
    receiver = subprocess.Popen([sys.executable, "-c", code, resolved.runtime_dir + "/" + resolved.wayland_display, str(resolved.pid), args.receiver], stdin=subprocess.PIPE, stdout=receiver_log, stderr=subprocess.STDOUT, user=1000, group=1000, extra_groups=[])
    connection.close()
    context = RequestContext("guest-qualified-operator", "guest-fixture", uuid.uuid4().hex, "guest")
    controller = ComputerController(store, lambda _: HyprlandRuntimeBackend(config=config, enabled=True), lambda ctx: ctx == context, enabled=True)
    try:
        await asyncio.sleep(.6)
        assert receiver.poll() is None
        if previous:
            try:
                await controller.session(context, {"operation": "start", **previous})
            except Exception as exc:
                record("stale-selection-refusal", {"type": type(exc).__name__, "reason": str(exc)})
            else:
                raise AssertionError("old selection accepted")
        inventory = await controller.session(context, {"operation": "inventory_targets"})
        record("inventory", inventory)
        (out / "maps-after.txt").write_text(maps.read_text())
        candidates = [c for c in inventory["candidates"] if "odin-lab-autoload" in c["label"]]
        assert len(candidates) == 1, inventory
        candidate = candidates[0]
        selection = {"candidate_epoch": inventory["candidate_epoch"], "target_id": candidate["target_id"], "output_id": candidate["output_id"]}
        record("selection", selection)
        grant = await controller.session(context, {"operation": "start", **selection})
        record("grant", grant)
        sid = grant["session_id"]
        current = store.get_session(sid)
        result = await controller.observe(context, {"session_id": sid, "generation": current.generation})
        obs = controller._live[sid].observations[result["observation_id"]]
        observation_image(result["image_bytes"], obs.frame_metadata)
        (out / "before.png").write_bytes(result["image_bytes"])
        record("observation", obs.public())
        await controller.validate_observation_delivery(context, obs.frame_metadata, obs.image_sha256)
        x, y, box = receiver_point(result["image_bytes"])
        record("pixel-grounding", {"receiver_content_rgb": [40, 91, 121], "bounding_box": box, "delivered_point": [x, y], "native_binding": controller._live[sid].backend.hyprland_handoff_binding})
        payload = {"session_id": sid, "generation": obs.generation, "consent_generation": obs.source.consent_generation, "source_id": obs.source.source_id, "source_revision": obs.source.source_revision, "observation_id": obs.observation_id, "action_id": uuid.uuid4().hex, "operation": "click", "x": x, "y": y, "expect": {"type": "visual_change"}}
        if obs.modal:
            payload["expected_modal"] = obs.modal
        record("action", payload)
        receipt = await controller.act(context, payload)
        record("receipt", receipt)
        receiver.stdin.write(b"D")
        receiver.stdin.flush()
        await asyncio.sleep(.2)
        rows = [json.loads(line) for line in (out / "receiver.jsonl").read_text().splitlines()]
        buttons = [r for r in rows if r.get("event") == "pointer_button"]
        record("receiver-verdict", {"buttons": buttons, "barrier": any(r.get("event") == "receiver_barrier" for r in rows)})
        assert [r.get("state") for r in buttons] == [1, 0], buttons
        assert receipt["status"] not in {"unknown", "unavailable"}, receipt
        current = store.get_session(sid)
        post = await controller.observe(context, {"session_id": sid, "generation": current.generation})
        (out / "after.png").write_bytes(post["image_bytes"])
        if args.recovery in {"idle", "handoff", "compositor-exit"}:
            live = controller._live[sid]
            original_binding = live.backend.hyprland_handoff_binding
            record("recovery-before", {"grant": asdict(current), "outputs": [asdict(g) for g in store.hyprland_output_grants(sid)], "binding": original_binding, "owner": store.hyprland_owner(sid)})
            guardian = live.backend._guardian
            assert not guardian._active and not live.backend._jobs
            if args.recovery == "idle":
                record("fault", {"kind": "idle-controller-guardian-stdin-EOF", "guardian": guardian.owner_identity, "pending_input": False})
                guardian._child.stdin.close()
                await guardian._child.stdin.wait_closed()
                await asyncio.wait_for(guardian._child.wait(), 3)
                record("fault-exit", {"returncode": guardian._child.returncode})
            elif args.recovery == "compositor-exit":
                from src.computer.runtime.recovery import process_identity
                import signal
                pin = process_identity(resolved.pid)
                record("fault", {"kind": "exact-compositor-SIGTERM", "identity": pin})
                assert process_identity(resolved.pid) == pin
                os.kill(resolved.pid, signal.SIGTERM)
                await asyncio.sleep(.5)
            else:
                env = {**os.environ, "XDG_RUNTIME_DIR": resolved.runtime_dir,
                       "HYPRLAND_INSTANCE_SIGNATURE": resolved.instance_signature,
                       "LD_LIBRARY_PATH": "/home/lab/lab-build/prefix/lib:/home/lab/lab-build/prefix/lib/x86_64-linux-gnu"}
                def ctl(*words):
                    return subprocess.check_output(["/home/lab/lab-build/prefix/bin/hyprctl", *words], env=env, user=1000, group=1000, extra_groups=[]).decode()
                clients = json.loads(ctl("-j", "clients"))
                selected = [client for client in clients if client["pid"] == receiver.pid]
                assert len(selected) == 1
                record("handoff-topology-before", {"clients": clients, "monitors": json.loads(ctl("-j", "monitors"))})
                record("handoff-move", {"address": selected[0]["address"], "receiver_pid": receiver.pid, "reply": ctl("dispatch", "movetoworkspacesilent", "2,address:" + selected[0]["address"])})
                await asyncio.sleep(.4)
                record("handoff-topology-after", {"clients": json.loads(ctl("-j", "clients")), "monitors": json.loads(ctl("-j", "monitors"))})
            recovery_begin = time.monotonic()
            await controller._quarantine_hyprland(current, live, phase="native_continuity_lost")
            current = store.get_session(sid)
            native = live.backend._recovery_result
            record("recovery-after", {"seconds": time.monotonic() - recovery_begin, "grant": asdict(current), "outputs": [asdict(g) for g in store.hyprland_output_grants(sid)], "native_result": asdict(native) if native else None, "status": store.recovery_status(sid), "binding": live.backend.hyprland_handoff_binding})
            if args.recovery == "compositor-exit":
                assert current.state == "quarantined"
                assert native.cleanup["original_compositor_exited"] is True
                assert native.cleanup["released"] is False
                assert native.cleanup["resources_retired"] is False
                assert store.recovery_status(sid)["status"] == "operator_release_required"
                record("recovery-verdict", {"passed": True, "scope": "compositor exit expected refusal only", "native": asdict(native)})
                return
            assert current.state == "active", current
            assert current.generation > obs.generation
            assert live.backend.hyprland_handoff_binding["window_id"] == original_binding["window_id"]
            if args.recovery == "handoff":
                assert live.backend.hyprland_handoff_binding["output_name"] == "QUAL-2"
            assert not live.observations
            try:
                await controller.act(context, {**payload, "action_id": uuid.uuid4().hex})
            except Exception as exc:
                record("old-observation-refusal", {"type": type(exc).__name__, "reason": str(exc)})
            else:
                raise AssertionError("old observation accepted after recovery")
            fresh = await controller.observe(context, {"session_id": sid, "generation": current.generation})
            fresh_obs = live.observations[fresh["observation_id"]]
            (out / "recovered-before.png").write_bytes(fresh["image_bytes"])
            await controller.validate_observation_delivery(context, fresh_obs.frame_metadata, fresh_obs.image_sha256)
            x, y, box = receiver_point(fresh["image_bytes"])
            fresh_payload = {**payload, "generation": fresh_obs.generation, "consent_generation": fresh_obs.source.consent_generation, "source_id": fresh_obs.source.source_id, "source_revision": fresh_obs.source.source_revision, "observation_id": fresh_obs.observation_id, "action_id": uuid.uuid4().hex, "x": x, "y": y}
            if fresh_obs.modal:
                fresh_payload["expected_modal"] = fresh_obs.modal
            else:
                fresh_payload.pop("expected_modal", None)
            record("recovered-observation", fresh_obs.public())
            record("recovered-action", fresh_payload)
            record("recovered-receipt", await controller.act(context, fresh_payload))
            receiver.stdin.write(b"D")
            receiver.stdin.flush()
            await asyncio.sleep(.2)
            recovered_rows = [json.loads(line) for line in (out / "receiver.jsonl").read_text().splitlines()]
            assert [r.get("state") for r in recovered_rows if r.get("event") == "pointer_button"] == [1, 0, 1, 0]
            record("recovery-verdict", {"passed": True, "scope": args.recovery + " actual controller recovery entry, native unmocked", "receiver_button_states": [1, 0, 1, 0]})
        begin = time.monotonic()
        close = await controller.session(context, {"operation": "close", "session_id": sid, "generation": current.generation})
        record("close", {"receipt": close, "seconds": time.monotonic() - begin})
        record("report", {"passed": True, "scope": "root Python controller fixture, not WebUI auth qualification", "autoload": not args.allow_loaded, "receiver_click": True, "reboot": bool(args.previous)})
    except Exception as exc:
        record("failure", {"type": type(exc).__name__, "reason": str(exc)})
        raise
    finally:
        await controller.close()
        store.close()
        receiver.stdin.close()
        try:
            receiver.wait(timeout=3)
        except subprocess.TimeoutExpired:
            receiver.terminate()
            receiver.wait(timeout=3)
        receiver_log.close()
        record("receiver-exit", {"returncode": receiver.returncode})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--receiver", default="/home/lab/qualification-receiver-build/receiver")
    parser.add_argument("--previous")
    parser.add_argument("--allow-loaded", action="store_true", help="Recovery-only follow-up, never autoload evidence")
    parser.add_argument("--recovery", choices=["idle", "handoff", "compositor-exit"])
    asyncio.run(run(parser.parse_args()))
