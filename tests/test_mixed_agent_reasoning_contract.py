"""Steered mixed-provider contract. No provider calls or live configuration."""

import hashlib
import json
from types import SimpleNamespace

import pytest

from src.config.schema import AgentsConfig, OpenAICompatibleConfig
from src.tools.agent_tool_policy import (
    apply_agent_axis_policy,
    effective_agent_model_choices,
    resolve_neutral_reasoning,
    validate_agent_entry_defaults,
)
from src.tools.defs.agents import TOOLS_SECTION


def config(entries=(), profiles=None, reasoning_dialect=None):
    return SimpleNamespace(
        agents=AgentsConfig(auto_model_allowlist=list(entries)),
        openai_codex=SimpleNamespace(agent_reasoning_effort="auto", model="gpt-5.6-sol"),
        openai_compatible=OpenAICompatibleConfig(
            enabled=True,
            model_profiles=profiles or {}, context_utilization=75,
            reasoning_dialect=reasoning_dialect,
        ),
    )


def test_codex_default_spawn_requires_model_selection():
    spawn = next(t for t in apply_agent_axis_policy(TOOLS_SECTION, config())
                 if t["name"] == "spawn_agent")
    encoded = json.dumps(spawn, sort_keys=True, separators=(",", ":")).encode()
    # Auto now requires an explicit model and an exact eligible enum.
    assert "model" in spawn["input_schema"]["required"]
    assert hashlib.sha256(encoded).hexdigest() == (
        "10ae233be76640a571b8fe8cb10591ede0ff63876c19a1db58a8fe5136eaaeee"
    )


def test_mixed_native_defaults_and_nearest_supported_effort():
    cfg = config(
        ["gpt-5.6-luna", {"model": "compat:z-ai/glm-5.2", "reasoning_effort": "xhigh"}],
        {"z-ai/glm-5.2": {
            "total_window_tokens": 200000, "max_output_tokens": 16000,
            "supports_reasoning": True, "supported_efforts": ["xhigh", "high"],
        }},
        reasoning_dialect="openai_reasoning_effort",
    )
    assert validate_agent_entry_defaults(cfg) is None
    assert effective_agent_model_choices(cfg) == ["gpt-5.6-luna", "compat:z-ai/glm-5.2"]
    assert resolve_neutral_reasoning(cfg, "compat:z-ai/glm-5.2", "medium") == ("high", None)
    props = next(t for t in apply_agent_axis_policy(TOOLS_SECTION, cfg)
                 if t["name"] == "spawn_agent")["input_schema"]["properties"]
    assert props["reasoning"]["enum"] == [
        "none", "low", "medium", "high", "xhigh", "max"
    ]
    assert "reasoning_effort" not in props
    assert "thinking_mode" not in props


@pytest.mark.parametrize("model,effort", [("gpt-6-astra", "none"), ("gpt-5.4", "max")])
def test_invalid_codex_entry_native_default_is_rejected(model, effort):
    with pytest.raises(ValueError):
        AgentsConfig(auto_model_allowlist=[{"model": model, "reasoning_effort": effort}])


def test_bare_string_entry_preserves_family_inheritance():
    assert AgentsConfig(auto_model_allowlist=["gpt-5.6-luna"]).auto_model_allowlist == [
        "gpt-5.6-luna"
    ]


def test_entry_default_and_absolute_neutral_override():
    from src.discord.native_tools.agents_tasks import _entry_native_reasoning

    cfg = config([{"model": "gpt-6-astra", "reasoning_effort": "xhigh"}])
    assert _entry_native_reasoning(cfg, "gpt-6-astra") == ("xhigh", None)
    assert resolve_neutral_reasoning(cfg, "gpt-6-astra", "low") == ("low", None)


def test_native_adaptive_and_capabilityless_transport():
    from src.llm.openai_compatible import OpenAICompatibleClient

    client = object.__new__(OpenAICompatibleClient)
    client.reasoning_dialect = "thinking_type"
    body = {}
    client._apply_reasoning(body, None, thinking_mode="adaptive")
    assert body == {"thinking": {"type": "adaptive"}}
    body = {}
    client._apply_reasoning(body, None, apply_reasoning=False)
    assert body == {}


def test_thinking_low_and_capabilityless_translation():
    cfg = config(profiles={"thinking": {
        "total_window_tokens": 200000, "max_output_tokens": 16000,
        "supports_thinking_mode": True,
    }})
    assert resolve_neutral_reasoning(cfg, "compat:thinking", "low") == (None, "disabled")
    assert resolve_neutral_reasoning(cfg, "compat:thinking", "medium") == (None, "adaptive")
    assert resolve_neutral_reasoning(cfg, "ollama:local", "max") == (None, None)
    assert resolve_neutral_reasoning(cfg, "gpt-5.4", "max") == ("xhigh", None)


@pytest.mark.parametrize("preset", ["deepseek", "zai", "qwen", "dashscope"])
def test_thinking_schema_uses_preset_resolved_dialect(preset):
    model = "deepseek-v4-flash"
    cfg = SimpleNamespace(
        agents=AgentsConfig(auto_model_allowlist=[f"compat:{model}"]),
        openai_codex=SimpleNamespace(agent_reasoning_effort="auto", model="gpt-5.6-sol"),
        openai_compatible=OpenAICompatibleConfig(
            enabled=True, preset=preset, reasoning_dialect=None
        ),
    )
    props = next(
        tool for tool in apply_agent_axis_policy(TOOLS_SECTION, cfg)
        if tool["name"] == "spawn_agent"
    )["input_schema"]["properties"]
    assert "thinking_mode" in props
