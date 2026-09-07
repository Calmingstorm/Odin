#!/usr/bin/env python3
"""Opt-in bounded real-model Xed acceptance. No live bot or main display.

The harness supplies a fixture-authenticated admin and real local permission
managers, not patched authorization predicates. Every call passes the ordinary
foreground facade and native dispatcher. Only the three computer tools are
offered. The model chooses all GUI actions from native observations. Harness
observation after each known action is deliberate orchestration, not a GUI plan.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import importlib.util
import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

import aiohttp

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.computer.integration import COMPUTER_TOOLS, ComputerIntegration  # noqa: E402
from src.config.schema import ToolsConfig  # noqa: E402
from src.discord.native_tools.registry import NativeToolDispatcher  # noqa: E402
from src.llm.openai_codex import CodexChatClient  # noqa: E402
from src.permissions.host_access import HostAccessManager  # noqa: E402
from src.permissions.manager import PermissionManager  # noqa: E402
from src.tools.defs.computer import computer_definitions  # noqa: E402
from src.tools.executor import ToolExecutor  # noqa: E402
from src.tools.output_authorization import request_tool_scope  # noqa: E402


def wire_summary(chunk, expected_digest):
    """Inspect actual serialized bytes, retaining neither credentials nor pixels."""
    body = json.loads(chunk)
    images = [b for item in body["input"] for b in item.get("content", [])
              if b.get("type") == "input_image"]
    digests = []
    for image in images:
        encoded = image["image_url"].removeprefix("data:image/png;base64,")
        digests.append(hashlib.sha256(base64.b64decode(encoded, validate=True)).hexdigest())
        image["image_url"] = "native-image-redacted"
        if encoded in json.dumps(body):
            raise RuntimeError("Pixels duplicated as request text")
    if expected_digest not in digests:
        raise RuntimeError("Latest native pixels absent from serialized request")
    if {t["name"] for t in body["tools"]} != COMPUTER_TOOLS:
        raise RuntimeError("Unexpected model tool authority")
    if not all(t.get("strict") is False for t in body["tools"]):
        raise RuntimeError("Production non-strict schema transport absent")
    return {"native_images": len(images), "png_sha256": digests,
            "serialized_bytes": len(chunk), "store": body.get("store"),
            "all_tools_strict_false": True}


def without_old_pixels(messages):
    for message in messages:
        if isinstance(message.get("content"), list):
            message["content"] = [b for b in message["content"] if b.get("type") != "image"]


async def main(args):
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    out = Path(args.evidence).resolve()
    if out.is_relative_to(Path("/opt/odin")):
        raise ValueError("Evidence may not use live installation")
    out.mkdir(parents=True, exist_ok=False, mode=0o700)
    spec = importlib.util.spec_from_file_location(
        "vision_smoke", Path(__file__).with_name("vision-smoke.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    client = CodexChatClient(module.ReadOnlyAuth(args.credentials), model=args.model,
                             reasoning_effort="low", max_retries=0,
                             request_timeout=90, stream_stall_timeout=60)
    principal = "fixture-authenticated-model-gui"
    channel = "fixture-private-gui"
    permissions = PermissionManager({principal: "admin"}, default_tier="guest",
                                    overrides_path=str(out / "permissions.json"))
    hosts = HostAccessManager(path=str(out / "hosts.json"), available_hosts=["localhost"])
    executor = ToolExecutor(config=ToolsConfig(), memory_path=str(out / "memory.json"),
                            permission_manager=permissions, host_access_manager=hosts)
    settings = SimpleNamespace(enabled=True, storage_dir=str(out / "computer"),
                               platform="x11", environment="isolated", runtime_sudo=True)
    bot = SimpleNamespace(config=SimpleNamespace(computer=settings),
                          host_access_manager=hosts, tool_executor=executor)
    service = ComputerIntegration(bot)
    dispatcher = NativeToolDispatcher(owners={"computer": service}, skill_manager=None,
                                      tool_catalog=None, prompt_builder=None, channel_state=None)
    state = SimpleNamespace(user_id=principal, _req_id=uuid.uuid4().hex,
                            message=SimpleNamespace(author=SimpleNamespace(id=principal),
                                                    channel=SimpleNamespace(id=channel)),
                            policy=SimpleNamespace(trajectory_source="discord"),
                            _computer_serving=SimpleNamespace(provider="codex", client=client,
                                                             model=args.model))
    token = request_tool_scope.set(COMPUTER_TOOLS)
    nonce = uuid.uuid4().hex[:10]
    basename = "native-note-" + nonce + ".txt"
    expected = ("Native GUI note " + nonce
                + "\nSecond line: amber window.\nThird line: saved and reopened.\n")
    (out / "expected.txt").write_text(expected)
    messages = [{"role": "user", "content":
        "Create this exact multiline note in isolated Xed, including final newline: "
        + json.dumps(expected) + ". Save through GUI as /workspace/exports/" + basename
        + ". Xed adds a final newline when saving; type the three lines WITHOUT a trailing newline "
        "so the saved bytes have exactly one final newline, not a blank fourth line"
        + ". Then CLOSE the saved document using its visible tab close button. "
        "Verify the old saved-file tab is gone and you have a new empty document. "
        "Reopen the saved file via Open dialog, forcing a fresh disk load, not tab activation. "
        "Inspect the reopened native pixels, then export its basename with computer_session. "
        "Only pixels and the three computer tools are available. No shell, file-writing tool, "
        "application API, terminal, or outside paths. Actions must follow actual observed pixels, "
        "not assumed coordinates. Each action automatically returns a fresh native observation; "
        "use its current provenance fields. Session already started. Use one tool per response. "
        "For safe modals copy observed modal into expected_modal. Do not retry unknown outcomes. "
        "IMPORTANT argument contract: optional properties must be OMITTED, not filled with blanks "
        "or dummy values. type uses only text; key uses only key; click uses only x,y; drag uses "
        "only points,duration. Never send x,y,key,points,duration with type. "
        "expect for visual_change is exactly {\"type\":\"visual_change\"} without x,y. "
        "Omit expected_modal entirely if the observed modal is null. "
        "Finish with REOPENED_AND_VERIFIED after seeing the reopened content and export."}]
    def record(event):
        with (out / "events.jsonl").open("a") as file:
            file.write(json.dumps(event, sort_keys=True) + "\n")
        print(json.dumps(event, sort_keys=True), flush=True)

    latest_digest = None
    grant = None
    backend = None
    exported = False
    completed = False
    calls = 0
    rejections = 0
    unit = None
    supervisor_pid = None
    cgroup = None
    started = time.monotonic()

    async def dispatch(name, values, call_id=None):
        if name not in COMPUTER_TOOLS:
            raise PermissionError("Tool not offered")
        block = SimpleNamespace(name=name, input=values, id=call_id or uuid.uuid4().hex)
        with service.foreground(state, block):
            result, _ = await dispatcher.dispatch(name, values, message=state.message,
                                                  user_id=principal, skill_file_delivery="stage")
            if isinstance(result, dict) and "__image_block__" in result:
                await service.validate_delivery(state, block, result)
                return result
        record({"event": "tool", "name": name, "input": values, "ok": result.ok,
                "uncertain": result.uncertain_outcome, "output": result.output})
        if result.uncertain_outcome:
            raise RuntimeError("Uncertain GUI outcome; no replay")
        return result

    async def observe():
        nonlocal latest_digest
        await asyncio.sleep(0.4)
        current = service.controller.store.get_session(grant["session_id"])
        image = await dispatch("computer_observe", {"session_id": current.session_id,
                                                   "generation": current.generation})
        if not isinstance(image, dict):
            raise RuntimeError("Observation unavailable")
        latest_digest = image["__computer_frame__"]["sha256"]
        without_old_pixels(messages)
        messages.append({"role": "user", "content": [
            {"type": "text", "text": image["__prompt__"]}, image["__image_block__"]]})
        record({"event": "native_observation", "sha256": latest_digest,
                "observation_id": image["__computer_frame__"]["observation_id"]})

    trace = aiohttp.TraceConfig()
    async def sent(_session, _context, params):
        record({"event": "serialized_request", "request": calls,
                **wire_summary(params.chunk, latest_digest)})
    trace.on_request_chunk_sent.append(sent)
    try:
        async with asyncio.timeout(570):
            first = await dispatch("computer_session", {"operation": "start", "app": "xed"})
            if not first.ok:
                raise RuntimeError("Session start rejected")
            grant = json.loads(first.output)
            live = service.controller._live[grant["session_id"]]
            backend = live.backend
            unit, supervisor_pid = backend._unit, backend._process.pid
            proc = await asyncio.create_subprocess_exec("systemctl", "show", unit,
                "--property=ControlGroup", "--value", stdout=asyncio.subprocess.PIPE)
            raw, _ = await asyncio.wait_for(proc.communicate(), 5)
            cgroup = raw.decode().strip()
            record({"event": "isolated_started", "unit": unit, "supervisor_pid": supervisor_pid,
                    "cgroup": cgroup, "basename": basename, "expected_sha256":
                    hashlib.sha256(expected.encode()).hexdigest()})
            await observe()
            async with aiohttp.ClientSession(trace_configs=[trace], auto_decompress=False,
                    headers={"Accept-Encoding": "identity"}) as session:
                client._session = session
                for calls in range(1, 29):
                    response = await asyncio.wait_for(client.chat_with_tools(messages,
                        "Complete the requested isolated GUI task using native pixels. "
                        "A visual-change receipt is not a successful saved artifact. "
                        "Do not stop the session; harness owns final cleanup.",
                        computer_definitions()), 90)
                    record({"event": "model_response", "request": calls, "text": response.text,
                            "tools": [{"name": c.name, "input": c.input}
                                      for c in response.tool_calls]})
                    if len(response.tool_calls) > 1:
                        raise RuntimeError("Multiple GUI calls without intervening pixels")
                    blocks = [{"type": "text", "text": response.text}] if response.text else []
                    blocks.extend({"type": "tool_use", "id": c.id, "name": c.name,
                                   "input": c.input} for c in response.tool_calls)
                    messages.append({"role": "assistant", "content": blocks})
                    if not response.tool_calls:
                        completed = exported and "REOPENED_AND_VERIFIED" in response.text
                        break
                    call = response.tool_calls[0]
                    if call.parse_error:
                        raise RuntimeError("Malformed model tool call")
                    if (call.name == "computer_session"
                            and call.input.get("operation") not in {"status", "export"}):
                        raise RuntimeError("Model attempted unauthorized lifecycle change")
                    result = await dispatch(call.name, call.input, call.id)
                    if isinstance(result, dict):
                        latest_digest = result["__computer_frame__"]["sha256"]
                        without_old_pixels(messages)
                        messages.append({"role": "user", "content": [
                            {"type": "tool_result", "tool_use_id": call.id,
                             "content": result["__prompt__"]},
                            result["__image_block__"]]})
                        continue
                    messages.append({"role": "user", "content": [{"type": "tool_result",
                        "tool_use_id": call.id, "content": result.output,
                        "is_error": not result.ok}]})
                    if not result.ok:
                        rejections += 1
                        if rejections > 2 or "visual_target_changed" not in result.output:
                            raise RuntimeError("Known rejection preserved; stop bounded attempt")
                    if (call.name == "computer_session"
                            and call.input.get("operation") == "export" and result.ok):
                        metadata = json.loads(result.output)
                        blob, _ = service.controller.store.read_evidence(
                            service._context(state), metadata["artifact_id"])
                        (out / "exported.txt").write_bytes(blob)
                        exported = call.input.get("name") == basename and blob == expected.encode()
                        record({"event": "independent_export_verification", "exact_match": exported,
                                "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest()})
                        if not exported:
                            raise RuntimeError("Export differs from exact expected note")
                    await observe()
    except Exception as exc:
        record({"event": "failed", "error_type": type(exc).__name__})
    finally:
        await client.close()
        cleanup_error = None
        try:
            await asyncio.wait_for(service.close(), 20)
        except Exception as exc:
            cleanup_error = type(exc).__name__
        request_tool_scope.reset(token)
        clean = cleanup_error is None and not service.controller._live
        summary = {"event": "summary", "passed": completed and exported and clean,
                   "model_completed": completed, "exact_export": exported,
                   "requests": calls, "elapsed_seconds": round(time.monotonic() - started, 3),
                   "unit": unit, "cgroup": cgroup, "supervisor_pid": supervisor_pid,
                   "supervisor_returncode": backend._process.returncode if backend else None,
                   "cleanup": clean, "cleanup_error": cleanup_error, "credential_writes": False}
        (out / "summary.json").write_text(json.dumps(summary, indent=2))
        record(summary)
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--evidence", required=True)
    raise SystemExit(asyncio.run(main(parser.parse_args())))
