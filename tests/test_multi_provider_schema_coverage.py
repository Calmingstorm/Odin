"""Focused coverage for the provider-neutral schema campaign seams."""

import pytest
from pydantic import ValidationError

from src.config.schema import (
    AgentAutoModelEntry,
    AgentsConfig,
    AuxiliaryLLMConfig,
    Config,
    OpenAICompatibleConfig,
    OpenAICompatibleModelProfile,
    OpenRouterRoutingConfig,
    canonical_codex_model,
)


def _config(*, agents=None, compatible=None):
    values = {"discord": {"token": "[REDACTED]"}}
    if agents is not None:
        values["agents"] = agents
    if compatible is not None:
        values["openai_compatible"] = compatible
    return Config(**values)


def test_agent_auto_model_entry_validates_native_controls_and_normalizes_models():
    entry = AgentAutoModelEntry(model=" gpt-5.6-luna ", reasoning_effort="high")
    assert entry.model == "gpt-5.6-luna"

    with pytest.raises(ValidationError, match="not permitted in this model reference"):
        AgentAutoModelEntry(model="auto")
    with pytest.raises(ValidationError, match="concrete model references"):
        AgentAutoModelEntry(model=None)
    with pytest.raises(ValidationError, match="not thinking_mode"):
        AgentAutoModelEntry(model="gpt-5.6-luna", thinking_mode="adaptive")
    with pytest.raises(ValidationError, match="invalid reasoning_effort"):
        AgentAutoModelEntry(model="gpt-5.6-luna", reasoning_effort="bogus")
    with pytest.raises(ValidationError, match="not supported by model"):
        AgentAutoModelEntry(model="gpt-6-astra", reasoning_effort="none")
    with pytest.raises(ValidationError, match="one native reasoning control"):
        AgentAutoModelEntry(
            model="compat:vendor/model",
            reasoning_effort="high",
            thinking_mode="enabled",
        )


def test_provider_qualified_auxiliary_and_codex_registry_boundaries():
    assert AuxiliaryLLMConfig(model=" compat:vendor/model ").model == "compat:vendor/model"
    assert canonical_codex_model(None) == ""
    with pytest.raises(ValueError, match="only accepts bare Codex"):
        canonical_codex_model("compat:vendor/model")


def test_compatible_profile_efforts_and_openrouter_values_are_normalized():
    assert OpenAICompatibleModelProfile(
        total_window_tokens=100_000,
        max_output_tokens=10_000,
        supported_efforts=None,
    ).supported_efforts is None
    assert OpenRouterRoutingConfig(
        order=[" alibaba ", "alibaba"],
        quantizations=[" int8 ", "int8"],
        model_pins={" vendor/model ": " route "},
    ).model_pins == {"vendor/model": "route"}

    with pytest.raises(ValidationError, match="at most 32"):
        OpenAICompatibleModelProfile(
            total_window_tokens=100_000,
            max_output_tokens=10_000,
            supported_efforts=[str(i) for i in range(33)],
        )
    with pytest.raises(ValidationError, match="non-empty strings"):
        OpenAICompatibleModelProfile(
            total_window_tokens=100_000,
            max_output_tokens=10_000,
            supported_efforts=[" "] ,
        )
    with pytest.raises(ValidationError, match="must not contain duplicates"):
        OpenAICompatibleModelProfile(
            total_window_tokens=100_000,
            max_output_tokens=10_000,
            supported_efforts=["high", "high"],
        )


def test_config_rejects_native_control_mismatch_for_configured_endpoint():
    thinking = OpenAICompatibleConfig(reasoning_dialect="thinking_type")
    with pytest.raises(ValueError, match="expects thinking_mode"):
        _config(
            compatible=thinking,
            agents=AgentsConfig(
                auto_model_allowlist=[
                    {"model": "compat:vendor/model", "reasoning_effort": "high"}
                ]
            ),
        )

    effort = OpenAICompatibleConfig(reasoning_dialect="openai_reasoning_effort")
    with pytest.raises(ValueError, match="expects reasoning_effort"):
        _config(
            compatible=effort,
            agents=AgentsConfig(
                auto_model_allowlist=[
                    {"model": "compat:vendor/model", "thinking_mode": "adaptive"}
                ]
            ),
        )


def test_config_covers_allowlist_skips_without_endpoint_and_validation_errors():
    # Without an endpoint, compatible allowlist entries wait for endpoint
    # setup. Strings and non-compatible entries are skipped by the endpoint
    # dialect loop when one is present.
    _config(
        agents=AgentsConfig(
            auto_model_allowlist=[
                {"model": "compat:vendor/model", "thinking_mode": "adaptive"}
            ]
        )
    )
    _config(
        compatible=OpenAICompatibleConfig(reasoning_dialect="openai_reasoning_effort"),
        agents=AgentsConfig(
            auto_model_allowlist=[
                "gpt-5.6-luna",
                {"model": "gpt-5.6-sol", "reasoning_effort": "high"},
            ]
        ),
    )

    with pytest.raises(ValueError, match="reasoning defaults are not supported"):
        _config(
            compatible=OpenAICompatibleConfig(reasoning_dialect="none"),
            agents=AgentsConfig(
                auto_model_allowlist=[
                    {"model": "compat:vendor/model", "thinking_mode": "adaptive"}
                ]
            ),
        )

    with pytest.raises(ValueError, match="references unknown models"):
        _config(
            compatible=OpenAICompatibleConfig(),
            agents=AgentsConfig(
                model_selection_hints={"compat:not-in-any-catalogue": "use this"}
            ),
        )
