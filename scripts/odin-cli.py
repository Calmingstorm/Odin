#!/usr/bin/env python3
"""Odin CLI — talk to Odin from the terminal.

Usage:
    odin "check disk on all hosts"
    odin "restart nginx and verify"
    echo "deploy latest" | odin
    odin --json "health check" | jq .tools_used

Configuration:
    Set ODIN_URL and ODIN_API_TOKEN in environment, or pass --url and --token.
    Defaults to http://localhost:3001 with no auth.

    export ODIN_URL=http://localhost:3001
    export ODIN_API_TOKEN=your-api-token
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
import urllib.error


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Talk to Odin from the command line.",
        epilog="Set ODIN_URL and ODIN_API_TOKEN environment variables for defaults.",
    )
    parser.add_argument("prompt", nargs="?", help="Prompt to send (reads stdin if omitted)")
    parser.add_argument("--url", default=os.environ.get("ODIN_URL", "http://localhost:3001"),
                        help="Odin API URL (default: $ODIN_URL or http://localhost:3001)")
    parser.add_argument("--token", default=os.environ.get("ODIN_API_TOKEN", ""),
                        help="API token (default: $ODIN_API_TOKEN)")
    parser.add_argument("--json", action="store_true", dest="json_output",
                        help="Output raw JSON response")
    parser.add_argument("--timeout", type=int, default=600,
                        help="Request timeout in seconds (default: 600)")
    args = parser.parse_args()

    # Get prompt from argument or stdin
    prompt = args.prompt
    if not prompt:
        if sys.stdin.isatty():
            parser.print_help()
            return 1
        prompt = sys.stdin.read().strip()

    if not prompt:
        print("Error: empty prompt", file=sys.stderr)
        return 1

    # Build request
    url = f"{args.url.rstrip('/')}/api/execute"
    headers = {"Content-Type": "application/json"}
    if args.token:
        headers["Authorization"] = f"Bearer {args.token}"

    body = json.dumps({"prompt": prompt}).encode()
    req = urllib.request.Request(url, data=body, headers=headers)

    try:
        resp = urllib.request.urlopen(req, timeout=args.timeout)
        data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        try:
            err = json.loads(error_body)
            print(f"Error {e.code}: {err.get('error', error_body)}", file=sys.stderr)
        except json.JSONDecodeError:
            print(f"Error {e.code}: {error_body[:200]}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        print(f"Is Odin running at {args.url}?", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if args.json_output:
        print(json.dumps(data, indent=2))
    else:
        response = data.get("response", "")
        if response:
            print(response)
        tools = data.get("tools_used", [])
        if tools and not response:
            print(f"Tools used: {', '.join(tools)}")
        if data.get("is_error"):
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
