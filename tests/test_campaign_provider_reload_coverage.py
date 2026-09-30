"""Rejected provider candidates roll back runtime and persisted desired settings."""
from unittest.mock import AsyncMock

from aiohttp.test_utils import TestClient, TestServer

from src.web.api.llm_admin import register_provider_config
from tests.test_web_api_llm_admin import _app, _gw


async def test_enabled_compatible_reload_reason_rolls_back_configuration(monkeypatch):
    app, bot = _app(register_provider_config)
    gateway = _gw(bot)
    bot.config.openai_compatible.enabled = True
    before = bot.config.openai_compatible.model
    prior_client = gateway.compatible_client
    persist = AsyncMock(return_value=(None, False))
    monkeypatch.setattr("src.web.api.llm_admin.persist_config_paths_locked", persist)
    gateway.reload_openai_compatible_inner = AsyncMock(return_value={
        "configured": True, "reason": "candidate qualification failed",
    })
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/openai-compatible/config", json={"model": "new-model"})
        assert response.status == 500
        assert "error" in await response.json()
    assert bot.config.openai_compatible.model == before
    assert gateway.compatible_client is prior_client
    assert persist.await_count == 2
    assert persist.await_args.args[0] == [(('openai_compatible', 'model'), before)]
