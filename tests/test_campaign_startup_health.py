import json
import logging
import sqlite3
from types import SimpleNamespace

import pytest
from aiohttp.test_utils import make_mocked_request

from src.__main__ import _wire_observability
from src.config.schema import Config, WebhookConfig
from src.health.server import HealthServer
from src.health.startup import check_knowledge_db


def test_knowledge_diagnostic_rejects_corrupt_existing_database(tmp_path):
    path = tmp_path / "knowledge.db"
    path.write_bytes(b"not a SQLite database")
    cfg = SimpleNamespace(enabled=True, search_db_path=str(tmp_path))
    result = check_knowledge_db(cfg)
    assert not result.passed
    assert "SQLite cannot open knowledge DB" in result.detail
    assert path.read_bytes() == b"not a SQLite database"


@pytest.mark.asyncio
@pytest.mark.parametrize("gateway_token, ready_status, http_only", [
    ("", 200, True),
    # Startup never attaches the old .env.example placeholder (PR #757 review).
    ("your_discord_bot_token_here", 200, True),
    ("configured", 503, False),
])
async def test_production_health_wiring_keeps_http_bootstrap_ready(
    gateway_token, ready_status, http_only
):
    bot = SimpleNamespace(config=Config(discord={"token": gateway_token}), latency=float("nan"),
                          is_ready=lambda: False)
    server = HealthServer(port=0, webhook_config=WebhookConfig(enabled=False))
    server._config_owner = bot
    _wire_observability(server, bot, logging.getLogger("test"))
    server.set_ready(True)
    response = await server._health_ready(make_mocked_request("GET", "/health/ready"))
    assert response.status == ready_status
    components = json.loads(response.text)["components"]
    assert components["discord"]["healthy"] is http_only
    if http_only:
        assert components["discord"]["detail"] == "not configured (HTTP-only mode)"
        assert "discord_connection" not in components


def test_knowledge_diagnostic_accepts_first_run_and_valid_schema(tmp_path):
    cfg = SimpleNamespace(enabled=True, search_db_path=str(tmp_path))
    assert check_knowledge_db(cfg).passed
    conn = sqlite3.connect(tmp_path / "knowledge.db")
    try:
        conn.execute("CREATE TABLE chunks (id INTEGER PRIMARY KEY, content TEXT)")
        conn.commit()
    finally:
        conn.close()
    assert check_knowledge_db(cfg).passed
