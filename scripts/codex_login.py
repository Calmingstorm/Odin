#!/usr/bin/env python3
"""
OAuth login script for OpenAI Codex (ChatGPT subscription).

Supports two modes:
  Browser:  Opens a local browser and captures the callback (default)
  Device:   Displays a code to enter at openai.com (for headless servers)

Usage:
    python scripts/codex_login.py [--credentials-path PATH]
    python scripts/codex_login.py --device [--credentials-path PATH]
"""

import argparse
import asyncio
import json
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.llm.codex_auth import CodexAuth


class CallbackHandler(BaseHTTPRequestHandler):
    """HTTP handler that captures the OAuth callback."""

    auth_code: str | None = None

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if "code" in params:
            CallbackHandler.auth_code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(
                b"<html><body><h2>Authentication successful!</h2>"
                b"<p>You can close this tab and return to the terminal.</p>"
                b"</body></html>"
            )
        elif "error" in params:
            error = params.get("error", ["unknown"])[0]
            desc = params.get("error_description", [""])[0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(
                f"<html><body><h2>Authentication failed</h2>"
                f"<p>{error}: {desc}</p></body></html>".encode()
            )
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass


def _save_creds(creds: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(creds, indent=2))
    path.chmod(0o600)

    email = creds.get("email", "unknown")
    account_id = creds.get("account_id", "unknown")

    print(f"\nAuthentication successful!")
    print(f"  Email: {email}")
    print(f"  Account ID: {account_id}")
    print(f"  Credentials saved to: {path}")
    print(f"\nThe bot will auto-refresh tokens at runtime.")
    print(f"If tokens expire (bot down >8 days), re-run this script.")


def browser_login(creds_path: Path) -> None:
    """Standard browser-based OAuth login."""
    auth_url, code_verifier = CodexAuth.build_auth_url()

    print("\n=== OpenAI Codex Login (Browser) ===\n")
    print("Opening browser for authentication...")
    print(f"\nIf the browser doesn't open, visit this URL:\n{auth_url}\n")

    webbrowser.open(auth_url)

    print("Waiting for authentication callback on port 1455...")
    server = HTTPServer(("127.0.0.1", 1455), CallbackHandler)
    server.timeout = 120

    while CallbackHandler.auth_code is None:
        server.handle_request()
        if CallbackHandler.auth_code is None:
            print("Timed out waiting for callback. Try again.")
            sys.exit(1)

    server.server_close()
    print("Got authorization code, exchanging for tokens...")

    creds = asyncio.run(CodexAuth.exchange_code(CallbackHandler.auth_code, code_verifier))
    _save_creds(creds, creds_path)


def device_login(creds_path: Path) -> None:
    """Device code flow for headless servers."""
    print("\n=== OpenAI Codex Login (Device) ===\n")
    print("Requesting device code...")

    device_info = asyncio.run(CodexAuth.request_device_code())

    print(f"\n  1. Open:  {device_info['verify_url']}")
    print(f"  2. Enter: {device_info['user_code']}")
    print(f"\nWaiting for authorization (up to 15 minutes)...\n")

    try:
        creds = asyncio.run(CodexAuth.poll_device_auth(
            device_info["device_auth_id"],
            device_info["user_code"],
            interval=device_info["interval"],
        ))
    except TimeoutError:
        print("Timed out waiting for authorization. Try again.")
        sys.exit(1)
    except RuntimeError as e:
        print(f"Authentication failed: {e}")
        sys.exit(1)

    _save_creds(creds, creds_path)


def main():
    parser = argparse.ArgumentParser(description="Login to OpenAI Codex via ChatGPT subscription")
    parser.add_argument(
        "--credentials-path",
        default="data/codex_auth.json",
        help="Path to save credentials (default: data/codex_auth.json)",
    )
    parser.add_argument(
        "--device",
        action="store_true",
        help="Use device code flow (for headless servers without a browser)",
    )
    args = parser.parse_args()

    creds_path = Path(args.credentials_path)

    if args.device:
        device_login(creds_path)
    else:
        browser_login(creds_path)


if __name__ == "__main__":
    main()
