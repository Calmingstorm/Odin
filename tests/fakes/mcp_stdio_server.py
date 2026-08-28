#!/usr/bin/env python3
"""Fake MCP stdio server for tests. Stdlib only; spawned as a subprocess.

Usage: mcp_stdio_server.py MODE

Modes:
  modern            2026-07-28 server: server/discover, _meta-carrying
                    requests, resultType on every result, ttlMs on listings.
  legacy            2025-06-18 initialize-handshake server.
  legacy-oldest     2024-11-05 counteroffer.
  legacy-batch      2025-03-26 counteroffer; tools/list response arrives
                    inside a JSON-RPC batch array with a notification.
  legacy-pushy      legacy that sends a server-initiated sampling request
                    right after initialized and records the client's reply
                    (exposed via the `pushy_reply` tool).
  legacy-unknown-version  counteroffers a version no client supports.
  modern-legacy-list      modern-era server advertising ONLY legacy versions.
  modern-missing-discover-result-type  modern server whose DiscoverResult omits resultType.
  modern-missing-call-result-type  modern server whose tools/call result omits resultType.
  silent            never answers anything (probe/initialize time out).
  garbage           emits non-JSON noise, then behaves like `legacy`.
  dies-mid-call     exits abruptly during tools/call.
  oversized-response emits a response line beyond the transport ceiling.
  stderr-flood      floods stderr forever while serving like `legacy`.
  hang-shutdown     ignores stdin EOF and SIGTERM (forces SIGKILL).
  blocked-write     never reads stdin after startup (real pipe backpressure pin).
  grandchild        like `legacy`, but spawns a sleeping grandchild whose
                    pid is returned by the `child_pid` tool (process-group
                    teardown pin).

Tools served (both eras): echo(text), fail(), env_keys(), sleepy(seconds).
`legacy` emits notifications/tools/list_changed when echo is called with
text == "trigger-list-changed".
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import threading
import time

MODE = sys.argv[1] if len(sys.argv) > 1 else "legacy"

MODERN_VERSION = "2026-07-28"
LEGACY_COUNTEROFFERS = {
    "legacy": "2025-06-18",
    "legacy-oldest": "2024-11-05",
    "legacy-batch": "2025-03-26",
    "legacy-pushy": "2025-06-18",
    "legacy-cancel": "2025-06-18",
    "legacy-unknown-version": "1999-01-01",
    "garbage": "2025-06-18",
    "dies-mid-call": "2025-06-18",
    "oversized-response": "2025-06-18",
    "stderr-flood": "2025-06-18",
    "hang-shutdown": "2025-06-18",
    "grandchild": "2025-06-18",
    "missing-schema": "2025-06-18",
}

STATE = {
    "initialized": False,
    "pushy_reply": None,
    "grandchild_pid": 0,
    "cancelled_request_id": None,
}
_MODERN_MODES = {
    "modern",
    "modern-legacy-list",
    "modern-missing-discover-result-type",
    "modern-missing-call-result-type",
}


def send(obj) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def tool_defs() -> list[dict]:
    tools = [
        {
            "name": "echo",
            "description": "Echo text back",
            "inputSchema": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
            },
        },
        {
            "name": "fail",
            "description": "Always reports isError",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "report_cwd",
            "description": "The server process working directory",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "env_keys",
            "description": "Sorted names of the environment variables visible",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "sleepy",
            "description": "Sleep before answering",
            "inputSchema": {
                "type": "object",
                "properties": {"seconds": {"type": "number"}},
            },
        },
        {
            "name": "child_pid",
            "description": "Pid of the spawned grandchild (0 when none)",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "pushy_reply",
            "description": "JSON of the reply the client sent to the pushed request",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "cancelled_request_id",
            "description": "Request id received in notifications/cancelled",
            "inputSchema": {"type": "object", "properties": {}},
        },
    ]
    if MODE == "missing-schema":
        tools.append({"name": "missing_schema", "description": "omits inputSchema"})
    return tools


def text_result(text: str, *, is_error: bool = False) -> dict:
    result = {"content": [{"type": "text", "text": text}], "isError": is_error}
    if MODE in _MODERN_MODES and MODE != "modern-missing-call-result-type":
        result["resultType"] = "complete"
    return result


def run_tool(name: str, arguments: dict) -> dict:
    if name == "echo":
        text = str(arguments.get("text", ""))
        if text == "trigger-list-changed":
            send({"jsonrpc": "2.0", "method": "notifications/tools/list_changed"})
        return text_result(f"echo: {text}")
    if name == "fail":
        return text_result("deliberate failure", is_error=True)
    if name == "report_cwd":
        return text_result(os.getcwd())
    if name == "env_keys":
        return text_result(",".join(sorted(os.environ)))
    if name == "sleepy":
        time.sleep(float(arguments.get("seconds", 1)))
        return text_result("awake")
    if name == "child_pid":
        return text_result(str(STATE["grandchild_pid"]))
    if name == "pushy_reply":
        return text_result(json.dumps(STATE["pushy_reply"]))
    if name == "cancelled_request_id":
        return text_result(json.dumps(STATE["cancelled_request_id"]))
    return text_result(f"unknown tool {name}", is_error=True)


def handle(msg: dict) -> None:
    method = msg.get("method")
    msg_id = msg.get("id")

    if method is None and msg_id is not None:
        # A response from the client to a server-initiated request.
        STATE["pushy_reply"] = msg
        return

    if MODE == "silent":
        return

    if method == "server/discover":
        if MODE in {"modern", "modern-missing-call-result-type"}:
            send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "resultType": "complete",
                        "supportedVersions": [MODERN_VERSION],
                        "capabilities": {"tools": {}},
                        "_meta": {
                            "io.modelcontextprotocol/serverInfo": {
                                "name": "fake-modern",
                                "version": "1.0",
                            }
                        },
                        "instructions": "fake modern server",
                    },
                }
            )
        elif MODE == "modern-legacy-list":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "resultType": "complete",
                        "supportedVersions": ["2025-11-25", "2025-06-18"],
                        "capabilities": {"tools": {}},
                    },
                }
            )
        elif MODE == "modern-missing-discover-result-type":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "supportedVersions": [MODERN_VERSION],
                        "capabilities": {"tools": {}},
                    },
                }
            )
        else:
            send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {"code": -32601, "message": "Method not found"},
                }
            )
        return

    if method == "initialize":
        if MODE in _MODERN_MODES:
            send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {
                        "code": -32022,
                        "message": "Unsupported protocol version",
                        "data": {"supported": [MODERN_VERSION]},
                    },
                }
            )
            return
        version = LEGACY_COUNTEROFFERS.get(MODE, "2025-06-18")
        send(
            {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": version,
                    "capabilities": {"tools": {"listChanged": True}},
                    "serverInfo": {"name": f"fake-{MODE}", "version": "1.0"},
                    "instructions": "fake legacy server",
                },
            }
        )
        return

    if method == "notifications/initialized":
        STATE["initialized"] = True
        if MODE == "legacy-pushy":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": "srv-req-1",
                    "method": "sampling/createMessage",
                    "params": {"messages": []},
                }
            )
        return

    if method == "notifications/cancelled":
        STATE["cancelled_request_id"] = (msg.get("params") or {}).get("requestId")
        return

    if method == "tools/list":
        result: dict = {"tools": tool_defs()}
        if MODE in _MODERN_MODES:
            result["resultType"] = "complete"
            result["ttlMs"] = 120000
            result["cacheScope"] = "private"
        if MODE == "legacy-batch":
            send(
                [
                    {"jsonrpc": "2.0", "id": msg_id, "result": result},
                    {
                        "jsonrpc": "2.0",
                        "method": "notifications/message",
                        "params": {"level": "info", "data": "batched hello"},
                    },
                ]
            )
            return
        send({"jsonrpc": "2.0", "id": msg_id, "result": result})
        return

    if method == "tools/call":
        params = msg.get("params") or {}
        name = params.get("name", "")
        if MODE == "dies-mid-call":
            os._exit(9)
        if MODE == "legacy-cancel" and name == "sleepy":
            seconds = float((params.get("arguments") or {}).get("seconds", 1))

            def answer_later() -> None:
                time.sleep(seconds)
                send({"jsonrpc": "2.0", "id": msg_id, "result": text_result("awake")})

            threading.Thread(target=answer_later, daemon=True).start()
            return
        if MODE == "oversized-response":
            sys.stdout.write(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "result": {
                            "content": [{"type": "text", "text": "x" * (4 * 1024 * 1024 + 65536)}]
                        },
                    }
                )
                + "\n"
            )
            sys.stdout.flush()
            return
        result = run_tool(name, params.get("arguments") or {})
        send({"jsonrpc": "2.0", "id": msg_id, "result": result})
        return

    if msg_id is not None:
        send(
            {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }
        )


def main() -> None:
    if MODE == "blocked-write":
        print("READY", flush=True)
        while True:
            time.sleep(60)
    if MODE == "hang-shutdown":
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    if MODE == "grandchild":
        child = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(600)"],
        )
        STATE["grandchild_pid"] = child.pid
    if MODE == "stderr-flood":

        def flood() -> None:
            while True:
                try:
                    sys.stderr.write("noise " * 2000 + "\n")
                    sys.stderr.flush()
                except Exception:
                    return

        threading.Thread(target=flood, daemon=True).start()
    if MODE == "garbage":
        sys.stdout.write("this is not json\n")
        sys.stdout.write("\x00\x01 binary-ish noise\n")
        sys.stdout.flush()

    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            handle(msg)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"fake server error: {e}\n")

    if MODE == "hang-shutdown":
        # Ignore the EOF graceful-shutdown signal too.
        while True:
            time.sleep(60)


if __name__ == "__main__":
    main()
