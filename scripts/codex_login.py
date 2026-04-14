#!/usr/bin/env python3
"""
One-time OAuth login script for OpenAI Codex (ChatGPT subscription).

Run this on a machine with a web browser to authenticate.
Saves tokens to data/codex_auth.json which the bot reads at runtime.

Usage:
    python scripts/codex_login.py [--credentials-path PATH]
"""

import argparse
import asyncio
import json
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# Add parent dir to path so we can import from src
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
        # Suppress default HTTP server logging
        pass


def main():
    parser = argparse.ArgumentParser(description="Login to OpenAI Codex via ChatGPT subscription")
    parser.add_argument(
        "--credentials-path",
        default="data/codex_auth.json",
        help="Path to save credentials (default: data/codex_auth.json)",
    )
    args = parser.parse_args()

    creds_path = Path(args.credentials_path)

    # Generate auth URL
    auth_url, code_verifier = CodexAuth.build_auth_url()

    print("\n=== OpenAI Codex Login ===\n")
    print("Opening browser for authentication...")
    print(f"\nIf the browser doesn't open, visit this URL:\n{auth_url}\n")

    webbrowser.open(auth_url)

    # Start callback server
    print("Waiting for authentication callback on port 1455...")
    server = HTTPServer(("127.0.0.1", 1455), CallbackHandler)
    server.timeout = 120  # 2 minute timeout

    while CallbackHandler.auth_code is None:
        server.handle_request()
        if CallbackHandler.auth_code is None:
            print("Timed out waiting for callback. Try again.")
            sys.exit(1)

    server.server_close()

    auth_code = CallbackHandler.auth_code
    print("Got authorization code, exchanging for tokens...")

    # Exchange code for tokens
    creds = asyncio.run(CodexAuth.exchange_code(auth_code, code_verifier))

    # Save
    creds_path.parent.mkdir(parents=True, exist_ok=True)
    creds_path.write_text(json.dumps(creds, indent=2))
    creds_path.chmod(0o600)

    email = creds.get("email", "unknown")
    account_id = creds.get("account_id", "unknown")

    print(f"\nAuthentication successful!")
    print(f"  Email: {email}")
    print(f"  Account ID: {account_id}")
    print(f"  Credentials saved to: {creds_path}")
    print(f"\nThe bot will auto-refresh tokens at runtime.")
    print(f"If tokens expire (bot down >8 days), re-run this script.")


if __name__ == "__main__":
    main()
