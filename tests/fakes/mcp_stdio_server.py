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
  legacy-pushy-flood legacy that sends 64 server requests after initialized.
  legacy-unknown-version  counteroffers a version no client supports.
  modern-legacy-list      modern-era server advertising ONLY legacy versions.
  modern-missing-discover-result-type  modern server whose DiscoverResult omits resultType.
  modern-missing-call-result-type  modern server whose tools/call result omits resultType.
  silent            never answers anything (probe/initialize time out).
  legacy-die-on-discover  closes stdout and exits on the era probe, serves
                    the legacy handshake normally otherwise (the strict
                    die-on-unknown-method class; compatibility respawn pin).
  legacy-die-always closes stdout and exits on ANY request (both-phase pin).
  legacy-die-after-initialize dies on the probe in phase one; the replacement
                    replies to initialize, then closes stdout and exits 8.
  legacy-malformed-die-on-discover  emits malformed JSON before probe EOF;
                    the protocol-fault latch must forbid compatibility respawn.
  legacy-pushy-die-on-discover  sends a server request before probe EOF;
                    phase-one reply tasks must be retired before respawn.
  legacy-delayed-die-discover-bad-version  closes stdout, exits 7 after a
                    delay, then counteroffers an unsupported legacy version
                    from the replacement (post-reap exit-status pin).
  oversized-on-discover  answers the probe with an over-ceiling line while
                    staying alive (non-EOF probe failure: no respawn pin).
  garbage           emits non-JSON noise, then behaves like `legacy`.
  dies-mid-call     exits abruptly during tools/call.
  oversized-response emits a response line beyond the transport ceiling.
  stderr-flood      floods stderr forever while serving like `legacy`.
  stderr-secret     emits configured API_TOKEN in stderr and server identity.
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
# The strict compatibility class behaves differently across fresh processes.
# A tiny parent-owned counter makes the fake deterministic without changing
# the production spawn contract.
SPAWN_COUNT = 1
if MODE == "legacy-die-after-initialize":
    count_path = sys.argv[2]
    try:
        SPAWN_COUNT = int(open(count_path).read()) + 1
    except (FileNotFoundError, ValueError):
        SPAWN_COUNT = 1
    with open(count_path, "w") as count_file:
        count_file.write(str(SPAWN_COUNT))

MODERN_VERSION = "2026-07-28"
LEGACY_COUNTEROFFERS = {
    # Fresh process of the respawn counteroffers an unsupported version and
    # STAYS ALIVE — the ownership pin needs a living phase-2 child.
    "legacy-die-discover-bad-version": "9999-01-01",
    "legacy-delayed-die-discover-bad-version": "9999-01-01",
    "legacy": "2025-06-18",
    "legacy-die-after-initialize": "2025-06-18",
    "legacy-oldest": "2024-11-05",
    "legacy-batch": "2025-03-26",
    "legacy-pushy": "2025-06-18",
    "legacy-pushy-flood": "2025-06-18",
    "legacy-cancel": "2025-06-18",
    "legacy-unknown-version": "1999-01-01",
    "garbage": "2025-06-18",
    "dies-mid-call": "2025-06-18",
    "oversized-response": "2025-06-18",
    "stderr-flood": "2025-06-18",
    "stderr-secret": "2025-06-18",
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

    if MODE == "legacy-die-always":
        # Dies on receipt of ANY request — the fresh process of a
        # compatibility respawn dies again at initialize (both-phase pin).
        sys.stdout.close()
        os._exit(4)

    if method == "server/discover" and MODE == "oversized-on-discover":
        # Non-EOF probe-phase transport failure: an oversized frame while
        # the process stays ALIVE — must remain an honest failure with no
        # compatibility respawn (typed-classification pin).
        sys.stdout.write("x" * (5 * 1024 * 1024) + "\n")
        sys.stdout.flush()
        return

    if method == "server/discover" and MODE == "legacy-malformed-die-on-discover":
        # A malformed frame poisons clean-EOF classification. Dropping the
        # bad line and then treating EOF as strict-legacy evidence would
        # conceal a protocol fault behind a successful replacement.
        sys.stdout.write("{not-json}\n")
        sys.stdout.flush()
        sys.stdout.close()
        os._exit(6)

    if method == "server/discover" and MODE == "legacy-pushy-die-on-discover":
        # Create a phase-one client-reply task, then die. The client must
        # cancel/reap that task before constructing the replacement.
        send(
            {
                "jsonrpc": "2.0",
                "id": "phase-one-request",
                "method": "sampling/createMessage",
                "params": {"messages": []},
            }
        )
        time.sleep(0.1)
        sys.stdout.close()
        os._exit(5)

    if method == "server/discover" and MODE == "legacy-delayed-die-discover-bad-version":
        # stdout EOF can precede process exit. Shutdown/reap must complete
        # before the first-phase status is read for the combined diagnostic.
        sys.stdout.close()
        time.sleep(0.15)
        os._exit(7)

    if (
        method == "server/discover"
        and MODE == "legacy-die-after-initialize"
        and SPAWN_COUNT == 1
    ):
        sys.stdout.close()
        os._exit(3)

    if method == "server/discover" and MODE == "legacy-die-discover-bad-version":
        # Phase 1 dies on the probe like the strict class...
        sys.stdout.close()
        os._exit(3)

    if method == "server/discover" and MODE == "legacy-die-on-discover":
        # Strict legacy server (Uncraftbar's Roblox Studio proxy class):
        # an unknown method makes it close stdout and EXIT instead of
        # answering -32601 or staying alive. A fresh process serves the
        # legacy handshake normally (the mode only kills on the probe).
        sys.stdout.close()
        os._exit(3)

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
                    "serverInfo": {
                        "name": f"fake-{MODE}",
                        "version": "1.0",
                        "diagnostic": os.environ.get("API_TOKEN", "")
                        if MODE == "stderr-secret"
                        else "",
                    },
                    "instructions": (
                        f"configured credential {os.environ.get('API_TOKEN', '')}"
                        if MODE == "stderr-secret"
                        else "fake legacy server"
                    ),
                },
            }
        )
        if MODE == "legacy-die-after-initialize":
            # The initialize result is valid, but stdout closes before the
            # client may publish the replacement as connected. Delay process
            # exit so the diagnostic must reap to learn status 8.
            sys.stdout.close()
            os._exit(8)
        return

    if method == "notifications/initialized":
        STATE["initialized"] = True
        if MODE in {"legacy-pushy", "legacy-pushy-flood"}:
            count = 64 if MODE == "legacy-pushy-flood" else 1
            for index in range(count):
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": f"srv-req-{index + 1}",
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
    if MODE == "stderr-secret":
        sys.stderr.write(f"startup credential={os.environ.get('API_TOKEN', '')}\n")
        sys.stderr.flush()
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
