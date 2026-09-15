#!/usr/bin/env python3
"""Guest-only cross-compositor fixture. Internal entry, not natural-trigger proof."""
import argparse
import asyncio
import hashlib
import importlib.util
import json
import os
import signal
import socket
import struct
import subprocess
import sys
import time
import uuid
from dataclasses import asdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
spec = importlib.util.spec_from_file_location(
    "autoload", Path(__file__).with_name("hyprland-autoload-lab.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


async def run(args):
    assert socket.gethostname() == "odin-hyprland-lab" and os.getuid() == 0
    os.umask(0o077)
    out = Path(args.evidence)
    out.mkdir(parents=True, exist_ok=False)
    receivers = []

    def record(name, value):
        (out / (name + ".json")).write_text(json.dumps(base.redact(value), indent=2, default=str))

    record("source-hashes", {
        str(p.relative_to(REPO)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in [Path(__file__), REPO / "assets/hyprland-input/scope-plugin.cpp",
                  *sorted((REPO / "src/computer/runtime").glob("hyprland*.py")),
                  REPO / "src/computer/controller.py", REPO / "src/computer/store.py"]})
    record("manifest", json.loads(Path("/usr/local/lib/odin/build-identity.json").read_text()))

    def buttons(name):
        return [r for r in map(json.loads, (out / (name + ".jsonl")).read_text().splitlines())
                if r.get("event") == "pointer_button"]

    def receiver(identity, name):
        log = (out / (name + ".jsonl")).open("wb")
        connection = socket.socket(socket.AF_UNIX)
        connection.connect(identity.runtime_dir + "/" + identity.wayland_display)
        peer = struct.unpack("3i", connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        assert peer[:2] == (identity.pid, 1000)
        connection.close()
        code = ("import os,socket,struct,sys;"
                "s=socket.socket(socket.AF_UNIX);s.connect(sys.argv[1]);"
                "p,u,g=struct.unpack('3i',s.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12));"
                "assert p==int(sys.argv[2]) and u==1000;os.set_inheritable(s.fileno(),True);"
                "os.execv(sys.argv[3],[sys.argv[3],str(s.fileno()),sys.argv[4],'30000'])")
        process = subprocess.Popen([sys.executable, "-c", code,
            identity.runtime_dir + "/" + identity.wayland_display,
            str(identity.pid), args.receiver, "odin-lab-" + name], stdin=subprocess.PIPE,
            stdout=log, stderr=subprocess.STDOUT, user=1000, group=1000, extra_groups=[])
        receivers.append((process, log))
        return process

    trust = base.ExecutableTrust("/home/lab/lab-build/prefix/bin/Hyprland",
        "bfb6a200300e09b5929130d831c815242ec87ce98531ea25993a921aa9e2472b",
        "0.55.2", "39d7e209c79d451efab1b21151d5938289da838d", owner_uid=1000)
    config = base.HyprlandSessionConfig(expected_uid=1000, runtime_dir="/run/user/1000",
        wayland_display="", instance_signature="", output_name="Virtual-1", compositor_pid=None,
        compositor_trust=trust, guardian_binary="/usr/local/lib/odin/odin-hyprland-input",
        capture_binary="/usr/local/lib/odin/odin-hyprland-capture", discovery_mode="auto",
        managed_activation=True, plugin_manifest_path="/usr/local/lib/odin/build-identity.json")
    resolver = base.HyprlandDiscoveryResolver(
        base.HyprlandDiscoveryPolicy(1000, "/run/user/1000", trust))
    original = await resolver.resolve()
    record("original", asdict(original))
    store = base.ComputerStore(out / "db", out / "private-evidence")
    context = base.RequestContext("guest-operator", "guest-fixture", uuid.uuid4().hex, "guest")
    controller = base.ComputerController(
        store, lambda _: base.HyprlandRuntimeBackend(config=config, enabled=True),
        lambda ctx: ctx == context, enabled=True)
    try:
        await scenario(
            args, out, original, resolver, receiver, buttons, record, store, context, controller)
    except Exception as exc:
        record("failure", {"reason": str(exc), "type": type(exc).__name__})
        raise
    finally:
        await controller.close()
        store.close()
        for process, log in receivers:
            process.stdin.close()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=3)
            log.close()


async def scenario(
    args, out, original, resolver, receiver, buttons, record, store, context, controller
):
    from src.computer.runtime.hyprland_recovery import HyprlandRetirementCapability
    from src.computer.runtime.recovery import process_identity

    receiver(original, "retirement-old")
    await asyncio.sleep(.6)
    inventory = await controller.session(context, {"operation": "inventory_targets"})
    record("inventory", inventory)
    choices = [c for c in inventory["candidates"] if "odin-lab-retirement-old" in c["label"]]
    assert len(choices) == 1
    c = choices[0]
    selection = {"candidate_epoch": inventory["candidate_epoch"],
                 "target_id": c["target_id"], "output_id": c["output_id"]}
    grant = await controller.session(context, {"operation": "start", **selection})
    sid = grant["session_id"]
    live = controller._live[sid]
    backend = live.backend
    if args.provisional:
        backend._cross_incarnation.capability = HyprlandRetirementCapability(runtime_qualified=True)
    current = store.get_session(sid)
    image = await controller.observe(context, {"session_id": sid, "generation": current.generation})
    obs = live.observations[image["observation_id"]]
    await controller.validate_observation_delivery(context, obs.frame_metadata, obs.image_sha256)
    (out / "before.png").write_bytes(image["image_bytes"])
    x, y, box = base.receiver_point(image["image_bytes"])
    output = backend._output
    assert output.transform == 0 and output.logical_x == output.logical_y == 0
    assert output.width == output.logical_width and output.height == output.logical_height
    record("output", asdict(output))
    record("grounding", {"point": [x, y], "box": box, "observation": obs.public()})
    guardian, owner, witness = backend._guardian, backend._owner_handle, backend._resource_witness
    assert witness is not None
    try:
        await witness.prove_resource_absence(
            owner, command_id="predeath", successor=original.identity, local_closure_confirmed=True)
    except Exception as exc:
        record("predeath-refusal", {"reason": str(exc)})
    else:
        raise AssertionError("living predecessor accepted")
    pin, gpin = process_identity(original.pid), process_identity(guardian._child.pid)
    scope, deadline = await backend._action_scope(backend._metadata())
    await guardian.bind_scope(scope)
    action = asyncio.create_task(guardian.act(f"L 272 2 120 {x:.3f} {y:.3f} {x+5:.3f} {y:.3f}",
        scope_deadline_ns=min(deadline, guardian._scope_deadline)))
    end = time.monotonic() + .2
    while not any(r.get("state") == 1 for r in buttons("retirement-old")):
        assert time.monotonic() < end, "receiver down absent"
        await asyncio.sleep(.002)
    assert process_identity(guardian._child.pid) == gpin
    os.kill(guardian._child.pid, signal.SIGSTOP)
    try:
        assert not any(r.get("state") == 0 for r in buttons("retirement-old"))
        assert process_identity(original.pid) == pin
        record("fault", {"compositor": pin, "guardian": gpin, "down_before_fault": True})
        os.kill(original.pid, signal.SIGKILL)
    finally:
        try:
            os.kill(guardian._child.pid, signal.SIGCONT)
        except ProcessLookupError:
            pass
    try:
        record("action", await asyncio.wait_for(action, 5))
    except Exception as exc:
        record("action", {"reason": str(exc)})
    record("guardian-close", await guardian.close())
    assert guardian._child.returncode is not None
    subprocess.run(
        ["systemctl", "reset-failed", "odin-qualification-compositor.service"], check=True)
    subprocess.run(["systemctl", "restart", "odin-qualification-compositor.service"], check=True)
    successor = None
    for _ in range(100):
        try:
            successor = await resolver.resolve()
            if successor.identity.digest != original.identity.digest:
                break
        except Exception:
            pass
        await asyncio.sleep(.05)
    assert successor is not None and successor.identity.digest != original.identity.digest
    assert successor.identity.process.boot_id == original.identity.process.boot_id
    record("successor", asdict(successor))
    for name, candidate, local in (("original-successor", original.identity, True),
                                    ("missing-local-closure", successor.identity, False)):
        try:
            await witness.prove_resource_absence(
                owner, command_id=name, successor=candidate, local_closure_confirmed=local)
        except Exception as exc:
            record(name + "-refusal", {"reason": str(exc)})
        else:
            raise AssertionError(name + " incorrectly proved absent")
    proof = await witness.prove_resource_absence(
        owner, command_id="direct-qualified-proof", successor=successor.identity,
        local_closure_confirmed=True)
    assert await witness.verify_resource_absence(
        proof, handle=owner, successor=successor.identity) is True
    assert await witness.verify_resource_absence(
        proof, handle=owner, successor=successor.identity) is False
    record("direct-proof", {"verified_once": True, "second_verification_refused": True,
        "owner_digest": proof.owner_digest, "inventory_digest": proof.inventory_digest,
        "predecessor_digest": proof.predecessor_digest,
        "successor_digest": proof.successor_digest,
        "native_certificate_digest": hashlib.sha256(proof.native_certificate.encode()).hexdigest()})
    fresh = receiver(successor, "retirement-new")
    await asyncio.sleep(.6)
    assert buttons("retirement-new") == []
    started = time.monotonic()
    await controller._quarantine_hyprland(current, live, phase="unknown_release")
    result = backend._recovery_result
    record("recovery", {"seconds": time.monotonic()-started, "result": asdict(result),
        "status": store.recovery_status(sid), "grant": asdict(store.get_session(sid))})
    assert result.state == "fresh_target_required"
    assert result.cleanup["resources_retired"] is True
    assert result.cleanup["released"] is False and result.cleanup["release_ack"] is False
    assert result.cleanup["unknown_release"] is True
    assert result.receiver_release_verified is False and result.runtime_qualified is True
    assert store.recovery_status(sid)["status"] == "fresh_target_required"
    assert store.get_session(sid).state != "active"
    try:
        await controller.observe(context, {"session_id": sid, "generation": obs.generation})
    except Exception as exc:
        record("old-observation-refusal", {"reason": str(exc)})
    else:
        raise AssertionError("old authority survived")
    old_action = {"session_id": sid, "generation": obs.generation,
        "consent_generation": obs.source.consent_generation,
        "source_id": obs.source.source_id, "source_revision": obs.source.source_revision,
        "observation_id": obs.observation_id, "action_id": uuid.uuid4().hex,
        "operation": "click", "x": x, "y": y, "expect": {"type": "visual_change"}}
    if obs.modal:
        old_action["expected_modal"] = obs.modal
    try:
        await controller.act(context, old_action)
    except Exception as exc:
        record("old-action-refusal", {"reason": str(exc)})
    else:
        raise AssertionError("old action authority survived")
    fresh.stdin.write(b"D")
    fresh.stdin.flush()
    await asyncio.sleep(.15)
    assert buttons("retirement-new") == []
    record("verdict", {"passed": True, "scope": "same-boot surviving-controller internal recovery",
        "old_action_outcome": "unknown", "receiver_release_verified": False,
        "new_receiver_buttons_before_authority": 0, "provisional": args.provisional,
        "durable_original_action_qualified": False, "direct_producer_verified_once": True})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--receiver", default="/home/lab/qualification-receiver-build/receiver")
    parser.add_argument("--provisional", action="store_true")
    asyncio.run(run(parser.parse_args()))
