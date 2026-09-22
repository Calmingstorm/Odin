"""Focused coverage for the small policy branches added in this campaign."""

from types import SimpleNamespace

import pytest

from src.config.schema import AgentsConfig, Config, OpenAICompatibleConfig
from src.tools.agent_tool_policy import (
    agent_allowlist_entries,
    apply_agent_axis_policy,
    effective_agent_model_choices,
    model_reasoning_dialect,
    resolve_neutral_reasoning,
    validate_agent_entry_defaults,
    validate_agent_model_hints,
)
from src.tools.registry import get_tool_definitions


def test_validate_agent_model_hints_requires_a_string_fixed_model():
    """A non-sentinel fixed model must not reach the string model catalogue."""
    agents = SimpleNamespace(
        model=object(),
        auto_model_allowlist=[],
        model_selection_hints={},
    )
    config = SimpleNamespace(
        openai_codex=None,
        openai_compatible=None,
        ollama=None,
    )

    with pytest.raises(AssertionError):
        validate_agent_model_hints(config, agents)


def test_agent_allowlist_entries_returns_legacy_defaults_as_a_list():
    config = SimpleNamespace(agents=SimpleNamespace(auto_model_allowlist=[]))

    entries = agent_allowlist_entries(config)

    assert entries == [
        "gpt-6-astra",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
    ]
    assert isinstance(entries, list)


def test_agent_allowlist_entries_preserves_configured_object_entries():
    configured = [SimpleNamespace(model="gpt-5.6-luna", reasoning_effort="high")]
    config = SimpleNamespace(agents=SimpleNamespace(auto_model_allowlist=configured))

    entries = agent_allowlist_entries(config)

    assert entries == configured
    assert entries is not configured


def test_compatible_only_and_ollama_only_default_choices(monkeypatch):
    compat = OpenAICompatibleConfig(
        enabled=True,
        model="vendor/model",
        model_profiles={
            "vendor/model": {"total_window_tokens": 200_000, "max_output_tokens": 8_000}
        },
    )
    cfg = SimpleNamespace(
        agents=AgentsConfig(),
        openai_codex=SimpleNamespace(enabled=False),
        openai_compatible=compat,
        ollama=SimpleNamespace(enabled=False),
    )
    assert effective_agent_model_choices(cfg) == ["compat:vendor/model"]

    monkeypatch.setattr(
        "src.tools.agent_tool_policy.compatible_reasoning_dialect", lambda *_a, **_k: "none"
    )
    cfg.openai_compatible = SimpleNamespace(enabled=True, model="bad", preset="openrouter")
    assert effective_agent_model_choices(cfg) == []
    cfg.openai_compatible.enabled = False
    cfg.ollama = SimpleNamespace(enabled=True, model="local")
    assert effective_agent_model_choices(cfg) == ["ollama:local"]


def test_profile_fallback_dialects_and_default_validation(monkeypatch):
    thinking = Config(
        discord={"token": "[REDACTED]"},
        openai_compatible={
            "model_profiles": {
                "thinking": {
                    "total_window_tokens": 100_000,
                    "max_output_tokens": 8_000,
                    "supports_thinking_mode": True,
                },
                "effort": {
                    "total_window_tokens": 100_000,
                    "max_output_tokens": 8_000,
                    "supports_reasoning": True,
                    "supported_efforts": ["high"],
                },
            }
        },
    )
    # Exercise profile fallback without a preset-derived endpoint dialect.
    thinking.openai_compatible.preset = None
    assert model_reasoning_dialect(thinking, "compat:thinking") == "thinking"
    assert model_reasoning_dialect(thinking, "compat:effort") == "effort"

    entries = [SimpleNamespace(model="compat:plain", reasoning_effort="auto", thinking_mode="auto")]
    assert validate_agent_entry_defaults(thinking, entries) is None
    entries = [SimpleNamespace(model="compat:plain", reasoning_effort="high", thinking_mode=None)]
    assert "not supported" in validate_agent_entry_defaults(thinking, entries)
    entries = [
        SimpleNamespace(model="compat:thinking", reasoning_effort="high", thinking_mode=None)
    ]
    assert "thinking_mode" in validate_agent_entry_defaults(thinking, entries)
    entries = [
        SimpleNamespace(model="compat:effort", reasoning_effort=None, thinking_mode="enabled")
    ]
    assert "reasoning_effort" in validate_agent_entry_defaults(thinking, entries)
    entries = [SimpleNamespace(model="compat:effort", reasoning_effort="low", thinking_mode=None)]
    assert "not supported" in validate_agent_entry_defaults(thinking, entries)
    entries = [SimpleNamespace(model="gpt-6-astra", reasoning_effort="none", thinking_mode=None)]
    assert "not supported" in validate_agent_entry_defaults(thinking, entries)
    entries = [SimpleNamespace(model="gpt-6-astra", reasoning_effort="bogus", thinking_mode=None)]
    assert "not supported" in validate_agent_entry_defaults(thinking, entries)
    monkeypatch.setattr("src.tools.agent_tool_policy.supported_native_efforts", lambda *_: None)
    entries = [SimpleNamespace(model="gpt-6-astra", reasoning_effort="none", thinking_mode=None)]
    assert "not supported" in validate_agent_entry_defaults(thinking, entries)


def test_neutral_reasoning_unknown_and_vendor_efforts_pass_through():
    cfg = Config(
        discord={"token": "[REDACTED]"},
        openai_compatible={
            "reasoning_dialect": "openai_reasoning_effort",
            "model_profiles": {
                "unknown": {
                    "total_window_tokens": 100_000,
                    "max_output_tokens": 8_000,
                    "supports_reasoning": True,
                },
                "vendor": {
                    "total_window_tokens": 100_000,
                    "max_output_tokens": 8_000,
                    "supports_reasoning": True,
                    "supported_efforts": ["turbo"],
                },
            },
        },
    )
    assert resolve_neutral_reasoning(cfg, "compat:unknown", "high") == ("high", None)
    assert resolve_neutral_reasoning(cfg, "compat:vendor", "max") == ("max", None)


def test_effort_only_auto_schema_intersects_declared_efforts():
    cfg = Config(
        discord={"token": "[REDACTED]"},
        agents={
            "model": "auto",
            "auto_model_allowlist": ["compat:a", "compat:b"],
        },
        openai_compatible={
            "enabled": True,
            "reasoning_dialect": "openai_reasoning_effort",
            "model_profiles": {
                "a": {
                    "total_window_tokens": 100_000,
                    "max_output_tokens": 8_000,
                    "supports_reasoning": True,
                    "supported_efforts": ["low", "high"],
                },
                "b": {
                    "total_window_tokens": 100_000,
                    "max_output_tokens": 8_000,
                    "supports_reasoning": True,
                    "supported_efforts": ["high", "max"],
                },
            },
        },
    )
    spawn = next(
        item
        for item in apply_agent_axis_policy(get_tool_definitions(), cfg)
        if item["name"] == "spawn_agent"
    )
    assert spawn["input_schema"]["properties"]["reasoning_effort"]["enum"] == ["high"]


def test_fixed_non_reasoning_model_hides_auto_effort_controls():
    cfg = Config(
        discord={"token": "[REDACTED]"},
        agents={"model": "ollama:qwen3", "reasoning_effort": "auto"},
        ollama={"enabled": True, "model": "qwen3"},
    )
    spawn = next(
        item
        for item in apply_agent_axis_policy(get_tool_definitions(), cfg)
        if item["name"] == "spawn_agent"
    )
    assert "reasoning_effort" not in spawn["input_schema"]["properties"]
