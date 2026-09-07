#!/usr/bin/env python3
"""Bounded real-model acceptance; external disposable fixture owns desktop children."""
from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import logging
import os
import re
import sys
import time
import traceback
import uuid
from pathlib import Path
from types import SimpleNamespace

import aiohttp

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_application_r6_verify import verify_saved_svg  # noqa: E402


def sibling(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


r5 = sibling("model_gui_r5", "model-gui-smoke.py")


def validate_target(args):
    match = re.fullmatch(r":([0-9]{1,5})(?:\.[0-9]+)?", args.display)
    if not args.confirm_disposable or not match or int(match[1]) < 100:
        raise ValueError("explicit_disposable_display_100_or_higher_required")
    home = Path(args.fixture_home).resolve()
    if not home.is_relative_to(Path("/tmp")) or not home.is_dir() or not args.monitor:
        raise ValueError("private_tmp_fixture_home_and_monitor_required")
    return home


async def main(args):
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    home = validate_target(args)
    out = Path(args.evidence).resolve()
    if out.is_relative_to(Path("/opt/odin")):
        raise ValueError("live_evidence_forbidden")
    out.mkdir(mode=0o700, parents=True, exist_ok=False)
    auth = sibling("vision_smoke_r6", "vision-smoke.py")
    client = r5.CodexChatClient(auth.ReadOnlyAuth(args.credentials), model=args.model,
        reasoning_effort="medium", max_retries=0, request_timeout=90, stream_stall_timeout=60)
    principal, channel = "fixture-authenticated-model-app-r6", "fixture-private-app-r6"
    permissions = r5.PermissionManager({principal: "admin"}, default_tier="guest",
        overrides_path=str(out / "permissions.json"))
    hosts = r5.HostAccessManager(path=str(out / "hosts.json"), available_hosts=["localhost"])
    executor = r5.ToolExecutor(config=r5.ToolsConfig(), memory_path=str(out / "memory.json"),
        permission_manager=permissions, host_access_manager=hosts)
    settings = SimpleNamespace(enabled=True, storage_dir=str(out / "computer"),
        platform="x11", environment="existing_session", runtime_sudo=True,
        display=args.display, xauthority=args.xauthority, monitor_names=[args.monitor])
    bot = SimpleNamespace(config=SimpleNamespace(computer=settings),
        host_access_manager=hosts, tool_executor=executor)
    service = r5.ComputerIntegration(bot)
    dispatcher = r5.NativeToolDispatcher(owners={"computer": service}, skill_manager=None,
        tool_catalog=None, prompt_builder=None, channel_state=None)
    state = SimpleNamespace(user_id=principal, _req_id=uuid.uuid4().hex,
        message=SimpleNamespace(author=SimpleNamespace(id=principal),
                                channel=SimpleNamespace(id=channel)),
        policy=SimpleNamespace(trajectory_source="discord"),
        _computer_serving=SimpleNamespace(provider="codex", client=client, model=args.model))
    token = r5.request_tool_scope.set(r5.COMPUTER_TOOLS)
    saved = home / ("home-icon-" + uuid.uuid4().hex[:10] + ".svg")
    messages = [{"role": "user", "content":
        "Create a useful HOME icon in attached native Inkscape: blue rectangular house body, "
        "orange triangular roof drawn as a real closed Bezier path, white rectangular door. "
        "Make it recognizable, aligned, centered on the white page with substantial shapes. "
        "Use GUI shape/path tools and palette fills only, never XML/source code/terminal/API. "
        "Save SVG through the GUI at " + str(saved) + ". Inspect final native pixels after "
        "saving, then finish with SAVED_AND_VERIFIED. Session already started. No attached "
        "export granted. Choose actions from observed pixels, never assumed coordinates. "
        "One tool call per response, fresh native pixels follow known actions, use their "
        "current provenance. Never retry unknown outcomes. Optional properties must be "
        "OMITTED, never blank/dummy. type uses only text; key only key; click only x,y; drag "
        "only points,duration. expect visual_change is exactly {\"type\":\"visual_change\"}. "
        "Copy observed safe modal into expected_modal, omit when null. Do not start/stop "
        "sessions. Typing is printable ASCII; use Return key separately. ctrl+l and function "
        "keys are NOT supported; use visible GUI controls instead. At most48 calls."}]

    def record(event):
        with (out / "events.jsonl").open("a") as file:
            file.write(json.dumps(event, sort_keys=True) + "\n")
        print(json.dumps(event, sort_keys=True), flush=True)

    grant = latest_digest = verification = None
    calls = rejections = 0
    completed = False
    started = time.monotonic()

    async def dispatch(name, values, call_id=None):
        if name not in r5.COMPUTER_TOOLS:
            raise PermissionError("tool_not_offered")
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
            raise RuntimeError("uncertain_outcome_no_replay")
        return result

    def append_image(image, call_id=None):
        nonlocal latest_digest
        latest_digest = image["__computer_frame__"]["sha256"]
        r5.without_old_pixels(messages)
        text = ({"type": "tool_result", "tool_use_id": call_id, "content": image["__prompt__"]}
                if call_id else {"type": "text", "text": image["__prompt__"]})
        messages.append({"role": "user", "content": [text, image["__image_block__"]]})
        record({"event": "native_observation", "sha256": latest_digest,
                "observation_id": image["__computer_frame__"]["observation_id"]})

    async def observe():
        await asyncio.sleep(.5)
        current = service.controller.store.get_session(grant["session_id"])
        image = await dispatch("computer_observe", {"session_id": current.session_id,
                                                    "generation": current.generation})
        if not isinstance(image, dict):
            raise RuntimeError("native_observation_unavailable")
        append_image(image)

    trace = aiohttp.TraceConfig()

    async def sent(_session, _context, params):
        record({"event": "serialized_request", "request": calls,
                **r5.wire_summary(params.chunk, latest_digest)})

    trace.on_request_chunk_sent.append(sent)
    try:
        async with asyncio.timeout(900):
            first = await dispatch("computer_session", {"operation": "start", "app": "inkscape"})
            if not first.ok:
                raise RuntimeError("session_start_rejected")
            grant = json.loads(first.output)
            record({"event": "attached_started", "display": args.display, "basename": saved.name})
            await observe()
            async with aiohttp.ClientSession(trace_configs=[trace], auto_decompress=False,
                    headers={"Accept-Encoding": "identity"}) as session:
                client._session = session
                for calls in range(1, 49):
                    response = await asyncio.wait_for(client.chat_with_tools(messages,
                        "Complete attached native GUI task from actual pixels. A visual-change "
                        "receipt is not saved-artifact proof. Harness owns cleanup.",
                        r5.computer_definitions()), 90)
                    record({"event": "model_response", "request": calls, "text": response.text,
                        "tools": [{"name": c.name, "input": c.input} for c in response.tool_calls]})
                    if len(response.tool_calls) > 1:
                        raise RuntimeError("multiple_actions_without_pixels")
                    blocks = [{"type": "text", "text": response.text}] if response.text else []
                    blocks.extend({"type": "tool_use", "id": c.id, "name": c.name,
                                   "input": c.input} for c in response.tool_calls)
                    messages.append({"role": "assistant", "content": blocks})
                    if not response.tool_calls:
                        completed = "SAVED_AND_VERIFIED" in response.text
                        if completed:
                            verification = verify_saved_svg(saved, out)
                            record({"event": "independent_svg_verification", **verification})
                        break
                    call = response.tool_calls[0]
                    if call.parse_error:
                        raise RuntimeError("malformed_model_tool_call")
                    if call.name == "computer_session" and call.input.get("operation") != "status":
                        raise RuntimeError("model_lifecycle_or_export_forbidden")
                    result = await dispatch(call.name, call.input, call.id)
                    if isinstance(result, dict):
                        append_image(result, call.id)
                        continue
                    messages.append({"role": "user", "content": [{"type": "tool_result",
                        "tool_use_id": call.id, "content": result.output,
                        "is_error": not result.ok}]})
                    if not result.ok:
                        rejections += 1
                        if rejections > 2 or "visual_target_changed" not in result.output:
                            raise RuntimeError("known_rejection_bounded_stop")
                    await observe()
    except Exception as exc:
        record({"event": "failed", "error_type": type(exc).__name__,
                "trace": [{"file": Path(frame.filename).name, "line": frame.lineno,
                           "function": frame.name}
                          for frame in traceback.extract_tb(exc.__traceback__)]})
    finally:
        await client.close()
        cleanup_error = None
        try:
            await asyncio.wait_for(service.close(), 20)
        except Exception as exc:
            cleanup_error = type(exc).__name__
        r5.request_tool_scope.reset(token)
        clean = cleanup_error is None and not service.controller._live
        summary = {"event": "summary", "passed": completed and verification is not None and clean,
            "model_completed": completed, "verified_saved_svg": verification,
            "requests": calls, "rejections": rejections,
            "elapsed_seconds": round(time.monotonic() - started, 3), "cleanup": clean,
            "cleanup_error": cleanup_error, "fixture_cleanup": "external_owner_must_verify",
            "credential_writes": False}
        (out / "summary.json").write_text(json.dumps(summary, indent=2))
        record(summary)
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for flag in ("credentials", "model", "evidence", "display", "monitor", "fixture-home"):
        parser.add_argument("--" + flag, required=True)
    parser.add_argument("--xauthority", default="")
    parser.add_argument("--confirm-disposable", action="store_true")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
