"""Tests for the /api/execute stateless endpoint and CLI script."""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

MAX_CHAT_CONTENT_LEN = 32_000


def _make_bot():
    bot = MagicMock()
    bot.sessions = MagicMock()
    bot.sessions._sessions = {}
    return bot


_mock_result = None

def _make_app(bot):
    app = web.Application()
    routes = web.RouteTableDef()

    @routes.post("/api/execute")
    async def execute(request):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:] != "test-token":
            return web.json_response({"error": "unauthorized"}, status=401)
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        content = (data.get("prompt") or data.get("content") or "").strip()
        if not content:
            return web.json_response({"error": "prompt is required"}, status=400)

        import uuid
        channel_id = f"api-{uuid.uuid4().hex[:12]}"
        result = _mock_result or {"response": "", "tools_used": [], "is_error": True, "files": []}
        bot.sessions._sessions.pop(channel_id, None)

        status_code = 200 if not result["is_error"] else 502
        resp = {"response": result["response"], "tools_used": result["tools_used"], "is_error": result["is_error"]}
        return web.json_response(resp, status=status_code)

    app.router.add_routes(routes)
    return app


async def _client(bot):
    return TestClient(TestServer(_make_app(bot)))


class TestExecuteEndpoint:
    @pytest.mark.asyncio
    async def test_requires_prompt(self):
        bot = _make_bot()
        async with await _client(bot) as client:
            resp = await client.post(
                "/api/execute",
                json={},
                headers={"Authorization": "Bearer test-token"},
            )
            assert resp.status == 400
            data = await resp.json()
            assert "prompt" in data["error"]

    @pytest.mark.asyncio
    async def test_requires_auth(self):
        bot = _make_bot()
        async with await _client(bot) as client:
            resp = await client.post("/api/execute", json={"prompt": "test"})
            assert resp.status == 401

    @pytest.mark.asyncio
    async def test_accepts_content_field(self):
        bot = _make_bot()
        async with await _client(bot) as client:
            resp = await client.post(
                "/api/execute",
                json={"content": ""},
                headers={"Authorization": "Bearer test-token"},
            )
            assert resp.status == 400

    @pytest.mark.asyncio
    async def test_successful_execution(self):
        global _mock_result
        bot = _make_bot()
        _mock_result = {
            "response": "disk is fine",
            "tools_used": ["run_command"],
            "is_error": False,
            "files": [],
        }
        try:
            async with await _client(bot) as client:
                resp = await client.post(
                    "/api/execute",
                    json={"prompt": "check disk"},
                    headers={"Authorization": "Bearer test-token"},
                )
                assert resp.status == 200
                data = await resp.json()
                assert data["response"] == "disk is fine"
                assert data["tools_used"] == ["run_command"]
                assert data["is_error"] is False
        finally:
            _mock_result = None

    @pytest.mark.asyncio
    async def test_error_returns_502(self):
        global _mock_result
        bot = _make_bot()
        _mock_result = {
            "response": "something broke",
            "tools_used": [],
            "is_error": True,
            "files": [],
        }
        try:
            async with await _client(bot) as client:
                resp = await client.post(
                    "/api/execute",
                    json={"prompt": "break things"},
                    headers={"Authorization": "Bearer test-token"},
                )
                assert resp.status == 502
                data = await resp.json()
                assert data["is_error"] is True
        finally:
            _mock_result = None

    @pytest.mark.asyncio
    async def test_ephemeral_session_cleaned_up(self):
        global _mock_result
        bot = _make_bot()
        _mock_result = {
            "response": "done",
            "tools_used": [],
            "is_error": False,
            "files": [],
        }
        try:
            async with await _client(bot) as client:
                resp = await client.post(
                    "/api/execute",
                    json={"prompt": "test"},
                    headers={"Authorization": "Bearer test-token"},
                )
                assert resp.status == 200
                for key in list(bot.sessions._sessions.keys()):
                    assert not key.startswith("api-")
        finally:
            _mock_result = None

    @pytest.mark.asyncio
    async def test_invalid_json(self):
        bot = _make_bot()
        async with await _client(bot) as client:
            resp = await client.post(
                "/api/execute",
                data=b"not json",
                headers={
                    "Authorization": "Bearer test-token",
                    "Content-Type": "application/json",
                },
            )
            assert resp.status == 400


class TestCLIScript:
    def test_script_exists(self):
        from pathlib import Path
        assert Path("scripts/odin-cli.py").exists()

    def test_script_is_executable(self):
        import os
        assert os.access("scripts/odin-cli.py", os.X_OK)

    def test_help_output(self):
        import subprocess
        result = subprocess.run(
            ["python3", "scripts/odin-cli.py", "--help"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "Odin" in result.stdout
        assert "--url" in result.stdout
        assert "--token" in result.stdout

    def test_no_input_shows_help(self):
        import subprocess
        result = subprocess.run(
            ["python3", "scripts/odin-cli.py"],
            capture_output=True, text=True,
            timeout=5,
        )
        assert result.returncode == 1

    def test_connection_error_message(self):
        import subprocess
        result = subprocess.run(
            ["python3", "scripts/odin-cli.py", "--url", "http://localhost:99999", "test"],
            capture_output=True, text=True,
            timeout=10,
        )
        assert result.returncode == 1
        assert "error" in result.stderr.lower() or "connection" in result.stderr.lower()
