"""Focused regression contracts for the final campaign review."""

import inspect
import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config.schema import Config, OpenRouterRoutingConfig
from src.discord.llm_gateway import LLMGateway
from src.discord.native_tools import agents_tasks
from src.llm.errors import LLMRequestError
from src.llm.openai_compatible import DeepSeekClient, OpenAICompatibleClient
from src.llm.openrouter import conservative_profile
from src.reasoning import PRESET_REASONING_DIALECTS, compatible_reasoning_dialect
from src.tools.agent_tool_policy import model_reasoning_dialect, resolve_neutral_reasoning
from src.tools.defs.agents import SPAWN_NEUTRAL_REASONING_OPTIONS

ROOT = Path(__file__).resolve().parents[1]


def test_neutral_vocabulary_has_one_python_source_and_matches_ui():
    source = (ROOT / "ui/js/pages/llm-config.js").read_text()
    values = re.search(r"const neutralReasoningLevels = \[(.*?)\]", source).group(1)
    assert re.findall(r"'([^']+)'", values) == SPAWN_NEUTRAL_REASONING_OPTIONS
    assert agents_tasks.SPAWN_NEUTRAL_REASONING_OPTIONS is SPAWN_NEUTRAL_REASONING_OPTIONS
    assert "*SPAWN_NEUTRAL_REASONING_OPTIONS" in inspect.getsource(agents_tasks)


@pytest.mark.parametrize("preset,dialect", PRESET_REASONING_DIALECTS.items())
def test_all_dialect_consumers_share_preset_defaults(preset, dialect):
    settings = {"preset": preset}
    if preset == "openrouter":
        settings["base_url"] = "https://openrouter.ai/api/v1"
    cfg = Config(discord={"token": "test"}, openai_compatible=settings)
    assert compatible_reasoning_dialect(cfg.openai_compatible) == dialect
    assert LLMGateway._compatible_reasoning_dialect(cfg.openai_compatible) == dialect
    expected = (
        "thinking" if dialect in {"thinking_type", "glm_thinking", "qwen_legacy"} else "effort"
    )
    assert model_reasoning_dialect(cfg, "compat:vendor/model") == expected
    for path in ("src/discord/wiring.py", "src/config/schema.py", "src/tools/agent_tool_policy.py"):
        source = (ROOT / path).read_text()
        assert "compatible_reasoning_dialect(" in source
        assert '"dashscope": "qwen_legacy"' not in source
    cfg.openai_compatible.reasoning_dialect = "none"
    assert compatible_reasoning_dialect(cfg.openai_compatible) == "none"


@pytest.mark.asyncio
async def test_deepseek_public_requests_accept_model_keyword():
    client = DeepSeekClient("test")
    client._request_with_retry = AsyncMock(
        return_value={
            "choices": [{"finish_reason": "stop", "message": {"content": "OK"}}],
        }
    )
    assert await client.chat([], "", model="deepseek-v4-flash") == "OK"
    assert (await client.chat_with_tools([], "", [], model="deepseek-v4-flash")).text == "OK"


@pytest.mark.parametrize(
    "code,accepted", [("output_truncated", True), ("empty_response", True), ("bad_request", False)]
)
@pytest.mark.asyncio
async def test_one_token_probe_only_accepts_expected_output_exhaustion(code, accepted):
    candidate = SimpleNamespace(
        health_check=AsyncMock(return_value={"healthy": True}),
        chat=AsyncMock(side_effect=LLMRequestError("probe", code=code)),
    )
    result = await LLMGateway._probe_openai_compatible(None, candidate)
    assert (result is None) is accepted
    assert candidate.chat.call_args.kwargs["max_tokens"] == 1


@pytest.mark.parametrize(
    "choices",
    [[], [{"finish_reason": "stop", "message": {"content": "  ", "reasoning_content": "hidden"}}]],
)
def test_empty_output_is_not_success(choices):
    client = OpenAICompatibleClient("test", model="vendor/model")
    with pytest.raises(LLMRequestError) as error:
        client._parse_response({"choices": choices})
    assert error.value.code == "empty_response"


def test_native_effort_names_do_not_crash_translation():
    cfg = Config(
        discord={"token": "test"},
        openai_compatible={
            "preset": "openrouter",
            "base_url": "https://openrouter.ai/api/v1",
            "model_profiles": {
                "vendor/model": {
                    "total_window_tokens": 200000,
                    "max_output_tokens": 32000,
                    "supports_reasoning": True,
                    "supported_efforts": ["default", "high"],
                }
            },
        },
    )
    assert resolve_neutral_reasoning(cfg, "compat:vendor/model", "low") == ("high", None)


@pytest.mark.parametrize(
    ("reasoning", "expected"),
    [
        ("none", "disabled"),
        ("low", "disabled"),
        ("medium", "adaptive"),
        ("high", "enabled"),
        ("xhigh", "enabled"),
        ("max", "enabled"),
    ],
)
def test_full_neutral_scale_maps_to_thinking_modes(reasoning, expected):
    cfg = Config(
        discord={"token": "test"},
        openai_compatible={"preset": "deepseek"},
    )
    assert resolve_neutral_reasoning(
        cfg, "compat:deepseek-v4-flash", reasoning
    ) == (None, expected)


@pytest.mark.parametrize(
    ("preset", "neutral", "native"),
    [
        ("deepseek", "xhigh", "enabled"),
        ("zai", "none", "disabled"),
        ("openrouter", "high", "high"),
    ],
)
def test_compatible_primary_identity_resolves_neutral_effort(preset, neutral, native):
    settings = {
        "enabled": True,
        "preset": preset,
        "reasoning_effort": neutral,
        "model": "vendor/model",
    }
    if preset == "openrouter":
        settings["base_url"] = "https://openrouter.ai/api/v1"
    cfg = Config(
        discord={"token": "test"},
        llm_provider={"model": "compat:vendor/model"},
        openai_compatible=settings,
    )
    client = OpenAICompatibleClient(
        "test",
        model="vendor/model",
        reasoning_dialect=compatible_reasoning_dialect(cfg.openai_compatible),
    )
    gateway = LLMGateway(
        get_config=lambda: cfg,
        codex_client=None,
        ollama_client=None,
        kimi_client=None,
        compatible_client=client,
        subsystem_guard=None,
        auxiliary_llm_client=None,
        cost_tracker=None,
        sessions=SimpleNamespace(),
        reflector=SimpleNamespace(),
    )
    serving = gateway.capture_serving_identity(cfg)
    assert serving == ("compat", client, "vendor/model", native)


def test_legacy_primary_thinking_mode_migrates_to_neutral_effort():
    cfg = Config(
        discord={"token": "test"},
        openai_compatible={"thinking_mode": "enabled"},
    )
    assert cfg.openai_compatible.reasoning_effort == "high"


@pytest.mark.asyncio
async def test_compatible_primary_effort_reaches_native_wire_body():
    client = OpenAICompatibleClient(
        "test",
        model="vendor/model",
        reasoning_dialect="thinking_type",
    )
    client._request_with_retry = AsyncMock(
        return_value={
            "choices": [{"finish_reason": "stop", "message": {"content": "OK"}}],
        }
    )
    response = await client.chat_with_tools([], "system", [], reasoning_effort="enabled")
    body = client._request_with_retry.call_args.args[0]
    assert body["thinking"] == {"type": "enabled"}
    assert response.provenance_reasoning_effort == "enabled"


def test_profile_uses_pins_and_a_real_limiting_route():
    rows = [
        {
            "tag": "small",
            "supports_tools": True,
            "context_length": 262144,
            "max_completion_tokens": 128000,
        },
        {
            "tag": "other",
            "supports_tools": True,
            "context_length": 500000,
            "max_completion_tokens": 65536,
        },
        {
            "tag": "parasail",
            "supports_tools": True,
            "context_length": 1048576,
            "max_completion_tokens": 524288,
        },
    ]
    free = conservative_profile(rows, OpenRouterRoutingConfig(), model="vendor/model")
    assert free["context_route_tag"] == free["output_route_tag"] == "small"
    assert free["max_output_tokens"] == 128000
    routing = OpenRouterRoutingConfig(model_pins={"vendor/model": "parasail"})
    pinned = conservative_profile(rows, routing, model="vendor/model")
    assert pinned["total_window_tokens"] == 1048576
    assert pinned["max_output_tokens"] == 524288
    assert pinned["source"] == "openrouter_pinned_endpoint"


@pytest.mark.asyncio
@pytest.mark.parametrize("reload_fails", [False, True])
async def test_thinking_save_null_preset_and_reload_rollback(monkeypatch, reload_fails):
    from aiohttp.test_utils import TestClient, TestServer

    from src.web.api.llm_admin import register_provider_config
    from tests.test_web_api_llm_admin import _app, _gw

    app, bot = _app(register_provider_config)
    gateway = _gw(bot)
    cfg = bot.config.openai_compatible
    cfg.enabled = True
    old_client = object()
    gateway.compatible_client = old_client
    gateway.reload_openai_compatible_inner = AsyncMock(
        return_value=(
            {"configured": True, "reason": "payload probe failed"}
            if reload_fails
            else {"configured": True}
        )
    )
    persist = AsyncMock(return_value=(None, False))
    monkeypatch.setattr("src.web.api.llm_admin.persist_config_paths_locked", persist)
    prior_preset = cfg.preset
    async with TestClient(TestServer(app)) as client:
        response = await client.put(
            "/api/openai-compatible/config",
            json={
                "thinking_mode": "enabled",
                "preset": None,
            },
        )
        assert response.status == (500 if reload_fails else 200)
    assert cfg.preset == prior_preset
    assert cfg.thinking_mode == (None if reload_fails else "enabled")
    assert gateway.compatible_client is old_client
    assert (("openai_compatible", "thinking_mode"), "enabled") in persist.call_args_list[0].args[0]
    assert persist.await_count == (2 if reload_fails else 1)
