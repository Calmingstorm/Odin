"""HTTP client CLI entrypoint (distinct from the ``odin-server`` daemon)."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    parser = argparse.ArgumentParser(description="Send a prompt to an Odin API.")
    parser.add_argument("prompt", nargs="?")
    parser.add_argument("--url", default=os.environ.get("ODIN_URL", "http://localhost:3000"))
    parser.add_argument("--token", default=os.environ.get("ODIN_API_TOKEN", ""))
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    prompt = args.prompt or (sys.stdin.read().strip() if not sys.stdin.isatty() else "")
    if not prompt:
        parser.print_help()
        return 1
    headers = {"Content-Type": "application/json"}
    if args.token:
        headers["Authorization"] = f"Bearer {args.token}"
    request = urllib.request.Request(
        f"{args.url.rstrip('/')}/api/execute",
        data=json.dumps({"prompt": prompt}).encode(), headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            data = json.loads(response.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError) as exc:
        print(f"Connection/API error: {exc}", file=sys.stderr)
        return 1
    if args.json_output:
        print(json.dumps(data, indent=2))
    else:
        print(data.get("response", ""))
    return 1 if data.get("is_error") else 0
