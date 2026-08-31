"""Committed-dist, real-browser render gate for the W3 Turn State surface."""

from __future__ import annotations

import functools
import http.server
import json
import os
import shutil
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

import pytest

ROOT = Path(__file__).resolve().parents[1]
VIEWPORTS = ((390, 844), (768, 1024), (1560, 1000))


def _skip_or_fail(reason: str) -> None:
    if os.environ.get("ODIN_REQUIRE_TURN_STATE_RENDER") == "1":
        pytest.fail(reason)
    pytest.skip(reason)


class _CommittedDistHandler(http.server.SimpleHTTPRequestHandler):
    """Serve only the built WebUI at its production /ui/ base."""

    def do_GET(self):  # noqa: N802 - stdlib handler contract
        path = urlparse(self.path).path
        if path in {"/ui", "/ui/", "/ui/index.html"}:
            self.path = "/ui/dist/index.html"
        elif path.startswith("/ui/assets/"):
            self.path = "/ui/dist/assets/" + path.removeprefix("/ui/assets/")
        super().do_GET()


@pytest.fixture(scope="module")
def committed_dist_server():
    assert (ROOT / "ui/dist/index.html").exists(), "committed WebUI dist is absent"
    handler = functools.partial(_CommittedDistHandler, directory=ROOT)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def _turn(message_id: str, now: float, **extra) -> dict:
    row = {
        "source": "discord",
        "channel_id": "channel-with-a-long-identifier",
        "message_id": message_id,
        "turn_generation": "generation",
        "revision": 1,
        "status": "ACTIVE",
        "lease_expires_at": now + 300,
        "recovery_deadline_utc": None,
        "last_progress_at": now,
        "created_at": now,
        "suspended_at": None,
        "guild_id": "guild",
        "user_id": "user",
        "code_version": "3.80.0",
        "schema_version": 4,
        "has_checkpoint": False,
        "operations": [],
        "operations_truncated": False,
        "attention_operations_count": 0,
        "outcome_unknown_operations": 0,
        "manual_resolution_operations": 0,
        "more_attention_evidence": False,
        "more_diagnostic_evidence": False,
        "expired_lease": False,
        "requires_attention": False,
    }
    row.update(extra)
    return row


def _api_fixture(path: str) -> dict:
    now = time.time()
    if path == "/api/status":
        return {"status": "online", "uptime_seconds": 3600}
    if path == "/api/turn-state/turns":
        turns = [
            _turn("healthy-active", now),
            _turn(
                "terminal-manual",
                now,
                status="TERMINAL_FAILED",
                requires_attention=True,
                attention_operations_count=1,
                manual_resolution_operations=1,
                operations=[
                    {
                        "state": "MANUAL_RESOLUTION_REQUIRED",
                        "tool_name": "write_file",
                        "tool_call_id": "manual",
                        "iteration": 4,
                        "created_at": now,
                        "updated_at": now,
                    }
                ],
            ),
            _turn(
                "diagnostic-only",
                now,
                outcome_unknown_operations=1,
                operations=[
                    {
                        "state": "OUTCOME_UNKNOWN",
                        "tool_name": "run_command",
                        "tool_call_id": "unknown",
                        "iteration": 3,
                        "created_at": now,
                        "updated_at": now,
                    }
                ],
            ),
        ]
        return {
            "schema_version": 1,
            "availability": "available",
            "observed_at": "display-only",
            "configured_enabled": True,
            "limit": 100,
            "data": {
                "counts": {
                    "active": 2,
                    "suspended": 0,
                    "expired_active": 0,
                    "attention_required": 1,
                    "outcome_unknown_operations": 1,
                    "outcome_unknown_turns": 1,
                    "manual_resolution_operations": 1,
                },
                "diagnostics": {
                    "outcome_unknown": {
                        "operations": 1,
                        "turns": 1,
                        "by_tool": [{"tool_name": "run_command", "operations": 1}],
                        "tools_truncated": False,
                        "omitted_tools": 0,
                    }
                },
                "turns": turns,
                "truncated": False,
                "omitted_turns": 0,
                "omitted_attention_turns": 0,
            },
        }
    if path == "/api/turn-state/capacity-breakers":
        return {
            "schema_version": 1,
            "availability": "available",
            "observed_at": "display-only",
            "lifetime": "process",
            "data": {
                "breakers": [
                    {
                        "name": "codex:gpt-5.6-sol",
                        "provider": "codex",
                        "model": "gpt-5.6-sol",
                        "state": "open",
                        "failed_generations": 3,
                        "consecutive_opens": 2,
                        "cooldown_seconds": 60,
                        "cooldown_remaining_seconds": 25,
                        "probe_eligible": False,
                    }
                ]
            },
        }
    raise AssertionError(f"unexpected WebUI request: {path}")


def test_render_gate_is_required_by_ci():
    workflow = (ROOT / ".github/workflows/test.yml").read_text()
    assert "tests/test_webui_turn_state_render.py" in workflow
    assert "ODIN_REQUIRE_TURN_STATE_RENDER: '1'" in workflow


@pytest.mark.parametrize(("width", "height"), VIEWPORTS)
def test_turn_state_committed_dist_render_contract(committed_dist_server, width, height):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        _skip_or_fail(f"Playwright is not installed: {exc}")

    with sync_playwright() as playwright:
        try:
            launch_options = {"headless": True, "args": ["--no-sandbox"]}
            system_chrome = shutil.which("google-chrome") or shutil.which("chromium")
            if system_chrome:
                launch_options["executable_path"] = system_chrome
            browser = playwright.chromium.launch(**launch_options)
        except Exception as exc:
            _skip_or_fail(f"Chromium could not launch: {exc}")
        try:
            page = browser.new_page(viewport={"width": width, "height": height})

            def fulfill_api(route):
                path = urlparse(route.request.url).path
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(_api_fixture(path)),
                )

            page.route("**/api/status", fulfill_api)
            page.route("**/api/turn-state/turns?*", fulfill_api)
            page.route("**/api/turn-state/capacity-breakers", fulfill_api)
            page.goto(
                committed_dist_server + "/ui/index.html#/system?tab=turn-state",
                wait_until="domcontentloaded",
            )
            page.wait_for_selector(".ts-turn-row")

            first = page.locator(".ts-turn-row").first
            assert first.locator(".badge").inner_text() == "Manual resolution required"
            assert "human owns verification" in first.inner_text()
            assert "Historical diagnostics" in page.locator("#panel-turn-state").inner_text()
            assert "Diagnostic only; not counted as Attention" in page.locator(
                "#panel-turn-state"
            ).inner_text()
            assert page.locator("#panel-turn-state button").all_inner_texts() == ["Refresh"]
            assert page.locator("body").evaluate(
                "body => body.scrollWidth <= document.documentElement.clientWidth"
            ), f"horizontal overflow at {width}x{height}"
        finally:
            browser.close()
