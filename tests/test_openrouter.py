
"""OpenRouter contracts: catalogue truth, routing, telemetry, and schema policy."""

import pytest

from src.config.schema import OpenAICompatibleConfig, OpenRouterRoutingConfig
from src.error_presentation import format_user_facing_error
from src.llm.errors import LLMRequestError
from src.llm.openai_compatible import OpenAICompatibleClient
from src.llm.openrouter import (
    conservative_profile,
    is_openrouter_base_url,
    model_detail_path,
    normalize_endpoint_rows,
    normalize_model_catalogue,
    request_provider_policy,
)


def test_recognition_is_deliberately_narrow_and_config_selects_dialect():
    assert is_openrouter_base_url("https://openrouter.ai/api/v1/")
    assert not is_openrouter_base_url("http://openrouter.ai/api/v1")
    assert not is_openrouter_base_url("https://example.com/api/v1")
    cfg = OpenAICompatibleConfig(base_url="https://openrouter.ai/api/v1", preset="custom")
    assert cfg.preset == "openrouter"
    assert cfg.reasoning_dialect == "openrouter_reasoning"
    with pytest.raises(ValueError, match="openrouter preset requires"):
        OpenAICompatibleConfig(preset="openrouter", base_url="https://example.com/v1")


def test_openrouter_schema_rejects_unbounded_routing_values_and_pins():
    routing = OpenRouterRoutingConfig(
        order=[" alibaba ", "alibaba"],
        quantizations=[" fp8 ", "fp8"],
        model_pins={" vendor/model ": " alibaba "},
    )
    assert routing.order == ["alibaba"]
    assert routing.quantizations == ["fp8"]
    assert routing.model_pins == {"vendor/model": "alibaba"}
    with pytest.raises(ValueError, match="routing values"):
        OpenRouterRoutingConfig(order=["bad\nroute"])
    with pytest.raises(ValueError, match="model pins"):
        OpenRouterRoutingConfig(model_pins={"vendor/model": ""})


@pytest.mark.asyncio
async def test_catalogue_fetch_uses_api_key_only_when_supplied():
    from src.llm.openrouter import fetch_json

    class Response:
        status = 200

        async def read(self):
            return b'{"data": []}'

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    class Session:
        def __init__(self):
            self.headers = None

        def get(self, _url, **kwargs):
            self.headers = kwargs["headers"]
            return Response()

    session = Session()
    await fetch_json(session, "/api/v1/models")
    assert "Authorization" not in session.headers
    await fetch_json(session, "/api/v1/models/x/y/endpoints", api_key="secret")
    assert session.headers["Authorization"] == "Bearer secret"


def test_catalogue_marks_variants_and_never_prices_sentinel_as_cheapest():
    payload = {
        "data": [
            {
                "id": "openrouter/auto",
                "name": "Auto",
                "context_length": 1_000_000,
                "top_provider": {"max_completion_tokens": 10_000},
                "supported_parameters": ["tools"],
                "pricing": {"prompt": "-1000000", "completion": "0.1"},
            },
            {
                "id": "vendor/model:free",
                "name": "Free",
                "context_length": 100_000,
                "top_provider": {"max_completion_tokens": 10_000},
                "supported_parameters": ["tools"],
                "pricing": {"prompt": "0", "completion": "0"},
            },
        ]
    }
    auto, free = normalize_model_catalogue(payload)
    assert auto["pricing"]["known"] is False
    assert auto["pricing"]["prompt_per_token"] is None
    assert free["variant"] == "free"
    assert free["agent_eligible"] is False


def test_endpoint_tags_drive_pin_and_profile_uses_one_limiting_route():
    rows = normalize_endpoint_rows(
        {
            "data": {
                "endpoints": [
                    {
                        "tag": "alibaba",
                        "provider_name": "Alibaba",
                        "context_length": 1_000_000,
                        "max_completion_tokens": 393_216,
                        "supported_parameters": ["tools", "tool_choice"],
                        "quantization": "unknown",
                    },
                    {
                        "tag": "deepinfra/fp8",
                        "provider_name": "DeepInfra",
                        "context_length": 1_048_576,
                        "max_completion_tokens": 131_072,
                        "supported_parameters": ["tools", "tool_choice"],
                        "quantization": "fp8",
                    },
                ]
            }
        }
    )
    conservative = conservative_profile(rows, OpenRouterRoutingConfig())
    assert conservative == {
        "total_window_tokens": 1_000_000,
        "max_output_tokens": 131_072,
        "source": "openrouter_conservative_routes",
        "context_route_tag": "alibaba",
        "output_route_tag": "deepinfra/fp8",
    }
    pinned = conservative_profile(
        rows,
        OpenRouterRoutingConfig(order=["deepinfra/fp8"], allow_fallbacks=False),
    )
    assert pinned["context_route_tag"] == "deepinfra/fp8"
    assert pinned["output_route_tag"] == "deepinfra/fp8"
    assert model_detail_path("deepseek/deepseek-v4.1-flash") == (
        "/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints"
    )


def test_request_policy_requires_parameters_and_defaults_pin_fallbacks_off():
    routing = OpenRouterRoutingConfig(order=["alibaba"])
    assert request_provider_policy(
        routing,
        model="vendor/model",
        has_tools=True,
        has_reasoning=True,
    ) == {
        "require_parameters": True,
        "allow_fallbacks": False,
        "order": ["alibaba"],
    }


def test_per_model_pin_overrides_global_route_and_ordinary_endpoint_gets_no_policy():
    routing = OpenRouterRoutingConfig(
        order=["relace/fp4"],
        allow_fallbacks=True,
        model_pins={"vendor/model": "alibaba"},
    )
    policy = request_provider_policy(
        routing,
        model="vendor/model",
        has_tools=True,
        has_reasoning=True,
    )
    assert policy["order"] == ["alibaba"]
    assert policy["allow_fallbacks"] is False
    client = OpenAICompatibleClient(
        "key",
        model="vendor/model",
        base_url="https://example.com/v1",
        openrouter_routing=routing,
    )
    body = {"model": "vendor/model"}
    client._apply_openrouter_routing(body, has_tools=True)
    assert "provider" not in body


def test_cost_bool_is_not_money_and_routing_funnel_preserves_zero():
    client = OpenAICompatibleClient("key", model="vendor/model")
    response = client._parse_response(
        {
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"cost": True},
        }
    )
    assert response.actual_cost_usd is None
    exc = LLMRequestError("compat 404", routing_funnel=[{"name": "Filter", "count": 0}])
    assert "Filter: 0" in format_user_facing_error(exc)


@pytest.mark.asyncio
async def test_client_sends_routing_and_records_upstream_cost_and_cache(monkeypatch):
    client = OpenAICompatibleClient(
        "key",
        model="deepseek/deepseek-v4.1-flash",
        base_url="https://openrouter.ai/api/v1",
        reasoning_dialect="openrouter_reasoning",
        openrouter_routing=OpenRouterRoutingConfig(order=["alibaba"]),
    )
    captured = {}

    async def request(body):
        captured.update(body)
        return {
            "provider": "Alibaba",
            "model": "deepseek/deepseek-v4.1-flash",
            "choices": [{"message": {"content": "ok"}}],
            "usage": {
                "prompt_tokens": 2447,
                "completion_tokens": 2,
                "cost": 0.000097,
                "prompt_tokens_details": {
                    "cached_tokens": 2048,
                    "cache_write_tokens": 0,
                },
            },
        }

    monkeypatch.setattr(client, "_request_with_retry", request)
    response = await client.chat_with_tools(
        messages=[],
        system="s",
        tools=[{"name": "x", "description": "x", "input_schema": {"type": "object"}}],
        reasoning_effort="high",
    )
    assert captured["provider"] == {
        "require_parameters": True,
        "allow_fallbacks": False,
        "order": ["alibaba"],
    }
    assert captured["reasoning"] == {"enabled": True, "effort": "high"}
    assert response.provenance_upstream_provider == "Alibaba"
    assert response.cached_tokens == 2048
    assert response.actual_cost_usd == pytest.approx(0.000097)


def test_routing_funnel_is_bounded_operator_evidence():
    exc = LLMRequestError(
        "compat 404",
        routing_funnel=[
            {"name": "Initial Endpoints", "count": 22},
            {"name": "Filter by Fallback", "count": 0},
        ],
    )
    rendered = format_user_facing_error(exc)
    assert "Initial Endpoints: 22" in rendered
    assert "Filter by Fallback" in rendered


def test_routing_funnel_ignores_malformed_steps_and_uses_remaining_count():
    exc = LLMRequestError(
        "compat 404",
        routing_funnel=[
            "not-a-step",
            {"filter": "Tool support", "remaining": 1},
            {"step": "No count"},
        ],
    )
    rendered = format_user_facing_error(exc)
    assert "Tool support: 1" in rendered
    assert "No count" in rendered


@pytest.mark.asyncio
async def test_plain_chat_keeps_provider_reported_accounting(monkeypatch):
    client = OpenAICompatibleClient(
        "key",
        model="vendor/model",
        base_url="https://openrouter.ai/api/v1",
        openrouter_routing=OpenRouterRoutingConfig(),
    )

    async def request(_body):
        return {
            "provider": "Alibaba",
            "choices": [{"message": {"content": "ok"}}],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 2,
                "cost": 0.001,
                "prompt_tokens_details": {"cached_tokens": 80},
            },
        }

    monkeypatch.setattr(client, "_request_with_retry", request)
    assert await client.chat([], "system") == "ok"
    assert client._last_input_tokens == 100
    assert client._last_cached_tokens == 80
    assert client._last_actual_cost_usd == pytest.approx(0.001)
    assert client._last_upstream_provider == "Alibaba"
