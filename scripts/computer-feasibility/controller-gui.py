#!/usr/bin/env python3
"""Private isolated GUI acceptance driver. Never generates application artifacts.

Input JSON lines operate the real controller, not xdotool or an application API.
Every act follows observe, bounded native image serialization, and exact delivery
validation. Saved files are produced by the GUI; export only copies readback evidence.
"""

import argparse
import asyncio
import hashlib
import json
import os
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.computer.controller import ComputerController  # noqa: E402
from src.computer.models import RequestContext  # noqa: E402
from src.computer.runtime.backend import LinuxDesktopBackend  # noqa: E402
from src.computer.store import ComputerStore  # noqa: E402
from src.computer.vision import observation_image  # noqa: E402


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", choices=("xed", "drawing"), required=True)
    parser.add_argument("--evidence", required=True)
    args = parser.parse_args()
    out = Path(args.evidence).resolve()
    out.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.umask(0o077)
    backend = LinuxDesktopBackend(enabled=True, app_profile=args.app, runtime_sudo=True)
    store = ComputerStore(out / "db", out / "evidence")
    context = RequestContext("isolated-corpus", "private-fixture", "r5-gui", "localhost")
    controller = ComputerController(
        store, lambda _: backend, lambda ctx: ctx == context, enabled=True
    )
    grant = None

    def record(event):
        with (out / "events.jsonl").open("a") as file:
            file.write(json.dumps(event, sort_keys=True) + "\n")
        print(json.dumps(event, sort_keys=True), flush=True)

    async def observe():
        current = store.get_session(grant["session_id"])
        result = await controller.observe(
            context, {"session_id": current.session_id, "generation": current.generation}
        )
        obs = controller._live[current.session_id].observations[result["observation_id"]]
        # Native image conversion validates real captured PNG+provenance, not a stub.
        image = observation_image(result["image_bytes"], obs.frame_metadata)
        assert image["__computer_frame__"]
        (out / "current.png").write_bytes(result["image_bytes"])
        (out / "current-nodes.json").write_text(json.dumps(obs.accessibility, indent=2))
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        return obs

    try:
        grant = await controller.session(context, {"operation": "start", "app": args.app})
        record(
            {
                "event": "started",
                "grant": grant,
                "unit": backend._unit,
                "supervisor_pid": backend._process.pid,
                "evidence": str(out),
            }
        )
        obs = await observe()
        record({"event": "observed", "observation": obs.public()})
        loop = asyncio.get_running_loop()
        while True:
            line = await loop.run_in_executor(None, sys.stdin.readline)
            if not line:
                break
            command = json.loads(line)
            if command.get("operation") == "stop":
                break
            try:
                if command.get("operation") in {"pause", "resume"}:
                    current = store.get_session(grant["session_id"])
                    result = await controller.session(
                        context,
                        {
                            "operation": command["operation"],
                            "session_id": current.session_id,
                            "generation": current.generation,
                        },
                    )
                    record({"event": "lifecycle", "result": result})
                    continue
                if command.get("operation") == "export":
                    current = store.get_session(grant["session_id"])
                    result = await controller.session(
                        context,
                        {
                            "operation": "export",
                            "session_id": current.session_id,
                            "generation": current.generation,
                            "name": command["name"],
                        },
                    )
                    blob, metadata = store.read_evidence(context, result["artifact_id"])
                    (out / command["name"]).write_bytes(blob)
                    record(
                        {
                            "event": "export",
                            "metadata": metadata,
                            "sha256": hashlib.sha256(blob).hexdigest(),
                        }
                    )
                    continue
                obs = await observe()
                if command.get("operation") == "observe":
                    record({"event": "observed", "observation": obs.public()})
                    continue
                payload = {
                    "session_id": obs.session_id,
                    "generation": obs.generation,
                    "consent_generation": obs.source.consent_generation,
                    "source_id": obs.source.source_id,
                    "source_revision": obs.source.source_revision,
                    "action_id": uuid.uuid4().hex,
                    "observation_id": obs.observation_id,
                    "expect": {"type": "visual_change"},
                    **command,
                }
                if obs.modal is not None and command.pop("acknowledge_modal", False):
                    payload.pop("acknowledge_modal", None)
                    payload["expected_modal"] = obs.modal
                started = time.monotonic()
                result = await controller.act(context, payload)
                record(
                    {
                        "event": "receipt",
                        "operation": command["operation"],
                        "result": result,
                        "seconds": time.monotonic() - started,
                    }
                )
                if result["status"] not in {"unknown", "unavailable"}:
                    await asyncio.sleep(0.15)
                    obs = await observe()
                    record({"event": "observed", "observation": obs.public()})
            except Exception as exc:
                record({"event": "error", "type": type(exc).__name__, "code": str(exc)[:160]})
    finally:
        start = time.monotonic()
        await controller.close()
        record(
            {
                "event": "cleanup",
                "seconds": time.monotonic() - start,
                "unit": backend._unit,
                "supervisor_returncode": (
                    backend._process.returncode if backend._process else None
                ),
                "grant": store.get_session(grant["session_id"]).public() if grant else None,
            }
        )
        store.close()


if __name__ == "__main__":
    asyncio.run(main())
