"""Real route/profile evaluation fences configuration races after remote awaits."""
import asyncio
from unittest.mock import AsyncMock

import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.web.api.llm_admin import register_openai_compatible_admin
from tests.test_web_api_llm_admin import _app


@pytest.mark.parametrize("change,expected", [("endpoint", 409), ("policy", 400)])
async def test_openrouter_revalidates_config_changed_during_catalogue_await(monkeypatch, change, expected):
    app, bot = _app(register_openai_compatible_admin)
    cfg = bot.config.openai_compatible
    cfg.base_url = "https://openrouter.ai/api/v1"
    cfg.preset = "openrouter"
    rows = [{"tag": "route", "provider_name": "Route", "context_length": 100_000,
             "max_completion_tokens": 20_000, "supports_tools": True,
             "supports_reasoning": True, "quantization": "unknown"}]
    monkeypatch.setattr("src.web.api.llm_admin._openrouter_endpoint_rows", AsyncMock(return_value=rows))
    persist = AsyncMock(side_effect=AssertionError("no stale config publication"))
    monkeypatch.setattr("src.web.api.llm_admin.persist_config_paths_locked", persist)

    async def catalogue(_cfg):
        await asyncio.sleep(0)
        if change == "endpoint":
            cfg.base_url = "https://example.invalid/v1"
            cfg.preset = "custom"
        else:
            cfg.openrouter.allow_fallbacks = False
            cfg.openrouter.quantizations = ["fp32"]
        return [{"id": "vendor/model", "supports_reasoning": True}], False, None

    monkeypatch.setattr("src.web.api.llm_admin._openrouter_models", catalogue)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/openrouter/models/vendor/model/select", json={})
        assert response.status == expected
        body = await response.json()
        if change == "endpoint":
            assert body["error"] == "OpenRouter configuration changed"
        else:
            assert "safe model profile" in body["error"]
    persist.assert_not_awaited()
