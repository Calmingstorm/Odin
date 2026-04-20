"""Tests for the new REST endpoints exposing runbook/trajectory/affordance features."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api import create_api_routes


def _make_bot(tmp_path: Path | None = None) -> MagicMock:
    bot = MagicMock()
    bot.config = MagicMock()
    bot.config.tools = MagicMock()
    bot.config.tools.audit_log_path = str((tmp_path or Path("/tmp")) / "audit.jsonl")
    bot.tool_executor = MagicMock()
    bot.audit = MagicMock()
    return bot


def _iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _write_audit(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")


async def _client(bot: MagicMock) -> TestClient:
    app = web.Application()
    routes = create_api_routes(bot)
    app.router.add_routes(routes)
    return TestClient(TestServer(app))


class TestAffordancesEndpoint:
    @pytest.mark.asyncio
    async def test_returns_table(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with await _client(bot) as client:
            resp = await client.get("/api/affordances")
            assert resp.status == 200
            data = await resp.json()
            table = data["affordances"]
            assert "run_command" in table
            entry = table["run_command"]
            assert entry["cost"] == "medium"
            assert entry["risk"] == "high"
