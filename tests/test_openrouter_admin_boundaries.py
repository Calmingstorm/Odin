"""Hermetic boundary coverage for OpenRouter administration helpers/routes."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from aiohttp import ServerDisconnectedError, web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config, OpenAICompatibleModelProfile
from src.web.api.llm_admin import (
    _openrouter_cache,
    _openrouter_endpoint_rows,
    _openrouter_models,
    register_openai_compatible_admin,
)
from tests.test_web_api_llm_admin import _app, _provider_client


@pytest.fixture(autouse=True)
def isolate_cache():
    prior = dict(_openrouter_cache)
    _openrouter_cache.update(models=None, fetched_at=0.0, error=None, details={})
    yield
    _openrouter_cache.clear()
    _openrouter_cache.update(prior)


@pytest.fixture(autouse=True)
def no_persist(monkeypatch):
    async def persist(_changes):
        return None, False

    monkeypatch.setattr("src.web.api.llm_admin.persist_config_paths_locked", persist)


@pytest.mark.asyncio
async def test_catalogue_helpers_cache_stale_and_auth_scope():
    cfg = Config(discord={"token": "x"}).openai_compatible
    models = [{"id": "vendor/model"}]
    with patch("src.llm.openrouter.fetch_json", AsyncMock(return_value={"data": models})) as fetch:
        fresh, stale, error = await _openrouter_models(cfg)
        assert [item["id"] for item in fresh] == ["vendor/model"]
        assert stale is False and error is None
        assert (await _openrouter_models(cfg))[0] is fresh
        fetch.assert_awaited_once()

    _openrouter_cache["fetched_at"] = 0
    with patch("src.llm.openrouter.fetch_json", AsyncMock(side_effect=RuntimeError("secret"))):
        stale_models, stale, error = await _openrouter_models(cfg)
    assert stale_models == fresh and stale is True
    assert error == "RuntimeError: catalogue refresh failed"
    assert "secret" not in error

    _openrouter_cache.update(models=None, fetched_at=0.0, details={})
    with patch("src.llm.openrouter.fetch_json", AsyncMock(return_value={"data": []})):
        with pytest.raises(web.HTTPBadGateway) as exc_info:
            await _openrouter_models(cfg)
    assert "catalogue refresh failed" in exc_info.value.text

    payload = {"data": {"endpoints": [{"tag": "route", "provider_name": "Provider"}]}}
    with patch("src.llm.openrouter.fetch_json", AsyncMock(return_value=payload)) as fetch:
        first = await _openrouter_endpoint_rows("vendor/model", api_key="key-a")
        again = await _openrouter_endpoint_rows("vendor/model", api_key="key-a")
        other = await _openrouter_endpoint_rows("vendor/model", api_key="key-b")
    assert first == again == other
    assert fetch.await_count == 2
    keys = list(_openrouter_cache["details"])
    assert len(keys) == 2
    assert all("key-a" not in key and "key-b" not in key for key in keys)


@pytest.mark.asyncio
async def test_catalogue_and_endpoint_error_boundaries():
    app, bot = _app(register_openai_compatible_admin)
    cfg = bot.config.openai_compatible
    cfg.base_url = "https://openrouter.ai/api/v1"
    cfg.preset = "openrouter"
    cfg.api_key = "not-exposed"
    cfg.model = "vendor/small"
    cfg.openrouter.model_pins = {"vendor/small": "route"}
    models = [
        {
            "id": "vendor/small",
            "variant": "standard",
            "supports_tools": True,
            "agent_eligible": True,
        }
    ]
    bot.usage_rollup.summary = AsyncMock(side_effect=RuntimeError("rollup down"))
    with (
        patch(
            "src.web.api.llm_admin._openrouter_models",
            AsyncMock(return_value=(models, True, "refresh failed")),
        ),
        patch(
            "src.web.api.llm_admin._openrouter_endpoint_rows",
            AsyncMock(side_effect=RuntimeError("detail down")),
        ),
    ):
        async with TestClient(TestServer(app)) as client:
            response = await client.get("/api/openrouter/catalogue")
            body = await response.json()
    assert response.status == 200
    assert body["stale"] is True and body["refresh_error"] == "refresh failed"
    assert body["models"][0]["endpoints"] == []
    assert body["measured_cache"] == []

    with patch(
        "src.web.api.llm_admin._openrouter_endpoint_rows",
        AsyncMock(side_effect=ValueError("bad model")),
    ):
        async with TestClient(TestServer(app)) as client:
            response = await client.get("/api/openrouter/models/vendor/small/endpoints")
            body = await response.json()
    assert response.status == 400 and body["error"] == "bad model"


@pytest.mark.asyncio
async def test_endpoints_unpin_unsafe_profile_and_persist_errors():
    app, bot = _app(register_openai_compatible_admin)
    cfg = bot.config.openai_compatible
    cfg.base_url = "https://openrouter.ai/api/v1"
    cfg.preset = "openrouter"
    cfg.model = "vendor/model"
    cfg.openrouter.model_pins = {"vendor/model": "old"}
    rows = [
        {
            "tag": "route",
            "provider_name": "Route",
            "context_length": 100_000,
            "max_completion_tokens": 20_000,
            "supports_tools": True,
            "supports_reasoning": True,
            "quantization": "unknown",
        }
    ]
    with patch("src.web.api.llm_admin._openrouter_endpoint_rows", AsyncMock(return_value=rows)):
        async with TestClient(TestServer(app)) as client:
            detail = await client.get("/api/openrouter/models/vendor/model/endpoints")
            detail_body = await detail.json()
            unpin = await client.post(
                "/api/openrouter/models/vendor/model/select", json={"provider_tag": ""}
            )
    assert detail.status == 200
    assert detail_body["effective_profile"]["total_window_tokens"] == 100_000
    assert unpin.status == 200 and cfg.openrouter.model_pins == {}

    with patch("src.web.api.llm_admin._openrouter_endpoint_rows", AsyncMock(return_value=[])):
        async with TestClient(TestServer(app)) as client:
            unsafe = await client.post("/api/openrouter/models/vendor/model/select", json={})
            unsafe_body = await unsafe.json()
    assert unsafe.status == 400 and "safe model profile" in unsafe_body["error"]

    async def persist_failure(_changes):
        return RuntimeError("disk failed"), False

    with (
        patch("src.web.api.llm_admin._openrouter_endpoint_rows", AsyncMock(return_value=rows)),
        patch("src.web.api.llm_admin.persist_config_paths_locked", persist_failure),
    ):
        async with TestClient(TestServer(app)) as client:
            failed = await client.post("/api/openrouter/models/vendor/model/select", json={})
            failed_body = await failed.json()
    assert failed.status == 500
    assert failed_body["error"] == "OpenRouter model policy not saved"


@pytest.mark.asyncio
async def test_diagnostic_reports_missing_healthy_and_unhealthy():
    app, bot = _app(register_openai_compatible_admin)
    bot.llm_gateway.compatible_client = None
    bot.llm_gateway.kimi_client = None
    async with TestClient(TestServer(app)) as client:
        assert (await client.get("/api/openai-compatible/diagnostic")).status == 503
        provider = _provider_client(healthy=True)
        provider.provider_name = "test-provider"
        bot.llm_gateway.compatible_client = provider
        healthy = await client.get("/api/openai-compatible/diagnostic")
        assert healthy.status == 200
        assert (await healthy.json())["provider"] == "test-provider"
        provider.health_check.return_value = {"healthy": False, "error": "offline"}
        unhealthy = await client.get("/api/openai-compatible/diagnostic")
        assert unhealthy.status == 502
        assert (await unhealthy.json())["health"]["error"] == "offline"


@pytest.mark.asyncio
async def test_status_projects_policy_and_cached_openrouter_models():
    from src.web.api.llm_admin import register_llm_provider

    app, bot = _app(register_llm_provider)
    cfg = bot.config.openai_compatible
    cfg.enabled = True
    cfg.base_url = "https://openrouter.ai/api/v1"
    cfg.preset = "openrouter"
    cfg.model = "vendor/configured"
    cfg.openrouter.catalogue_profiles["vendor/derived"] = OpenAICompatibleModelProfile(
        total_window_tokens=100_000, max_output_tokens=10_000
    )
    bot.config.openai_codex.model = "custom-codex"
    bot.config.agents.model = "fixed-codex"
    bot.config.agents.auto_model_allowlist = ["plain-codex", "ollama:qwen", "compat:vendor/policy"]
    bot.llm_gateway.compatible_client = SimpleNamespace(model=cfg.model)
    bot.llm_gateway.codex_client = object()
    bot.llm_gateway.ollama_client = object()
    bot.llm_gateway.active_client = None
    _openrouter_cache["models"] = [
        {
            "id": "vendor/free:free",
            "variant": "free",
            "supports_tools": True,
            "supports_reasoning": False,
            "supported_efforts": [],
        },
        {
            "id": "vendor/no-profile",
            "variant": "standard",
            "supports_tools": True,
            "supports_reasoning": True,
            "supported_efforts": ["high"],
        },
    ]
    with patch(
        "src.web.api.llm_admin._openrouter_models", AsyncMock(side_effect=web.HTTPBadGateway())
    ):
        async with TestClient(TestServer(app)) as client:
            response = await client.get("/api/llm/status")
            body = await response.json()
    assert response.status == 200
    codex_names = {item["name"] for item in body["model_catalogue"]["codex"]}
    assert {"custom-codex", "fixed-codex", "plain-codex"} <= codex_names
    assert any(item["name"] == "qwen" for item in body["model_catalogue"]["ollama"])
    compat = {item["name"]: item for item in body["model_catalogue"]["compat"]}
    assert compat["vendor/free:free"]["agent_unavailable_reason"].startswith("free variant")
    assert compat["vendor/no-profile"]["agent_unavailable_reason"].startswith("select the model")


@pytest.mark.asyncio
async def test_provider_alias_routes_and_validation_errors():
    from src.web.api.llm_admin import register_llm_provider

    app, bot = _app(register_llm_provider)
    bot.llm_gateway.codex_client = None
    bot.llm_gateway.ollama_client = None
    bot.llm_gateway.compatible_client = None
    bot.llm_gateway.kimi_client = None
    bot.llm_gateway.active_client = None
    bot.llm_gateway.switch_provider = AsyncMock(return_value={"provider": "compat"})
    async with TestClient(TestServer(app)) as client:
        assert (await client.get("/api/llm/data")).status == 200
        active = await client.get("/api/llm/active")
        assert (await active.json())["configured_provider"] == "codex"
        assert (
            await client.put("/api/llm/active", json={"provider": "openai_compatible"})
        ).status == 200
        mismatch = await client.post(
            "/api/llm/switch", json={"provider": "codex", "model": "ollama:qwen"}
        )
        mismatch_body = await mismatch.json()
        malformed = await client.post(
            "/api/llm/switch", json={"provider": "compat", "model": "compat:"}
        )
        malformed_body = await malformed.json()
        concrete = await client.put("/api/llm/main-model", json={"model": "auto"})
        concrete_body = await concrete.json()
    assert mismatch.status == 400 and "does not match" in mismatch_body["error"]
    assert malformed.status == 400 and malformed_body["error"]
    assert concrete.status == 400 and concrete_body["error"]


@pytest.mark.asyncio
async def test_main_model_and_switch_error_results():
    from src.web.api.llm_admin import register_llm_provider

    app, bot = _app(register_llm_provider)
    bot.llm_gateway.switch_provider = AsyncMock(return_value={"error": "provider unavailable"})
    async with TestClient(TestServer(app)) as client:
        main = await client.put("/api/llm/main-model", json={"model": "ollama:qwen"})
        switch = await client.post("/api/llm/switch", json={"provider": "ollama"})
    assert main.status == 400 and switch.status == 400
    bot.llm_gateway.switch_provider = AsyncMock(return_value={"error": "persist failed: disk"})
    async with TestClient(TestServer(app)) as client:
        main = await client.put("/api/llm/main-model", json={"model": "compat:model"})
    assert main.status == 500


@pytest.mark.asyncio
async def test_catalogue_marks_small_profile_ineligible():
    app, bot = _app(register_openai_compatible_admin)
    cfg = bot.config.openai_compatible
    cfg.base_url = "https://openrouter.ai/api/v1"
    cfg.preset = "openrouter"
    cfg.model = "deepseek/deepseek-v4.1-flash"
    cfg.openrouter.catalogue_profiles[cfg.model] = OpenAICompatibleModelProfile(
        total_window_tokens=70_000, max_output_tokens=10_000
    )
    models = [
        {"id": cfg.model, "variant": "standard", "supports_tools": True, "agent_eligible": True}
    ]
    with (
        patch(
            "src.web.api.llm_admin._openrouter_models",
            AsyncMock(return_value=(models, False, None)),
        ),
        patch("src.web.api.llm_admin._openrouter_endpoint_rows", AsyncMock(return_value=[])),
    ):
        async with TestClient(TestServer(app)) as client:
            body = await (await client.get("/api/openrouter/catalogue")).json()
    assert body["models"][0]["agent_eligible"] is False
    assert "at least 63,000" in body["models"][0]["agent_unavailable_reason"]


@pytest.mark.asyncio
async def test_catalogue_quick_add_is_bounded_to_eight():
    from src.tools.model_hints import MODEL_HINT_CATALOGUE

    app, bot = _app(register_openai_compatible_admin)
    cfg = bot.config.openai_compatible
    cfg.base_url = "https://openrouter.ai/api/v1"
    cfg.preset = "openrouter"
    cfg.model = "vendor/current"
    models = [
        {"id": model_id, "variant": "standard", "supports_tools": True, "agent_eligible": True}
        for model_id in list(MODEL_HINT_CATALOGUE)[:9]
    ]
    with patch(
        "src.web.api.llm_admin._openrouter_models", AsyncMock(return_value=(models, False, None))
    ):
        async with TestClient(TestServer(app)) as client:
            body = await (await client.get("/api/openrouter/catalogue")).json()
    assert len(body["quick_add"]) == 8


@pytest.mark.asyncio
async def test_select_model_re_raises_cancelled_persist_failure():
    app, bot = _app(register_openai_compatible_admin)
    cfg = bot.config.openai_compatible
    cfg.base_url = "https://openrouter.ai/api/v1"
    cfg.preset = "openrouter"
    rows = [
        {
            "tag": "route",
            "provider_name": "Route",
            "context_length": 100_000,
            "max_completion_tokens": 20_000,
            "supports_tools": True,
            "supports_reasoning": True,
            "quantization": "unknown",
        }
    ]

    async def cancelled(_changes):
        return RuntimeError("cancelled write"), True

    with (
        patch("src.web.api.llm_admin._openrouter_endpoint_rows", AsyncMock(return_value=rows)),
        patch("src.web.api.llm_admin.persist_config_paths_locked", cancelled),
    ):
        async with TestClient(TestServer(app)) as client:
            with pytest.raises((asyncio.CancelledError, ServerDisconnectedError)):
                await client.post("/api/openrouter/models/vendor/model/select", json={})


def test_ollama_validator_handles_non_value_ip_parser_failure():
    from src.web.api.llm_admin import _validate_ollama_url

    with (
        patch("src.web.api.llm_admin._ipaddress.ip_address", side_effect=RuntimeError("parser")),
        patch("socket.getaddrinfo", side_effect=OSError("dns")),
    ):
        with pytest.raises(ValueError, match="local/private"):
            _validate_ollama_url("http://host.invalid")
