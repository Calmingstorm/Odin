"""Hermetic boundary coverage for provider-neutral configuration and budgets."""

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from src.config.schema import (
    AgentsConfig,
    AuxiliaryLLMConfig,
    Config,
    LLMProviderConfig,
    OpenAICompatibleConfig,
    OpenAICompatibleModelProfile,
    OpenRouterRoutingConfig,
    ToolHost,
)
from src.llm.context_budget import (
    compatible_model_profile,
    compatible_usable_input_tokens,
)


def test_agent_hint_validation_rejects_blank_and_canonical_duplicates():
    with pytest.raises(ValidationError, match="non-empty hints"):
        AgentsConfig(model_selection_hints={"compat:vendor/model": "  "})

    with pytest.raises(ValidationError, match="duplicates 'compat:vendor/model'"):
        AgentsConfig(
            model_selection_hints={
                "compat:vendor/model": "first",
                " compat:vendor/model ": "second",
            }
        )


def test_nonconcrete_models_are_rejected_at_concrete_model_boundaries():
    with pytest.raises(ValidationError, match="'auto' is not permitted"):
        AgentsConfig(auto_model_allowlist=["auto"])
    with pytest.raises(ValidationError, match="'auto' is not permitted"):
        AuxiliaryLLMConfig(model="auto")
    with pytest.raises(ValidationError, match="'auto' is not permitted"):
        LLMProviderConfig(model="auto")


def test_blank_inheritance_is_not_a_concrete_model_selection():
    with pytest.raises(ValidationError, match="concrete model references"):
        AgentsConfig(auto_model_allowlist=[" "])
    with pytest.raises(ValidationError, match="concrete model reference"):
        AuxiliaryLLMConfig(model=" ")
    with pytest.raises(ValidationError, match="concrete model reference"):
        LLMProviderConfig(model=" ")
    config = Config(discord={"token": "fake"})
    config.llm_provider.model = " "
    with pytest.raises(ValueError, match="concrete serving provider"):
        config._derive_active_provider_from_main_model()


def test_host_id_rejects_non_uuid_and_overlong_text():
    with pytest.raises(ValidationError, match="host_id must be a UUID"):
        ToolHost(address="localhost", host_id="not-a-uuid")
    with pytest.raises(ValidationError, match="host_id is too long"):
        ToolHost(address="localhost", host_id="x" * 65)


@pytest.mark.parametrize("field", ["order", "quantizations"])
@pytest.mark.parametrize("bad_value", ["", "x" * 101, "line\nbreak"])
def test_openrouter_routing_lists_reject_every_bounded_value_failure(field, bad_value):
    with pytest.raises(ValidationError, match="routing values must be non-empty and bounded"):
        OpenRouterRoutingConfig(**{field: [bad_value]})


@pytest.mark.parametrize(
    "pins",
    [
        {"": "route"},
        {"vendor/model": ""},
        {"m" * 201: "route"},
        {"vendor/model": "r" * 101},
        {"vendor/model\nother": "route"},
    ],
)
def test_openrouter_model_pins_reject_malformed_ids_and_tags(pins):
    with pytest.raises(ValidationError, match="model pins must use bounded model ids and tags"):
        OpenRouterRoutingConfig(model_pins=pins)


def test_compatible_config_normalizes_strings_and_rejects_invalid_endpoint_inputs():
    cfg = OpenAICompatibleConfig(
        base_url="https://example.test/v1/",
        model="  vendor/model  ",
    )
    assert (cfg.base_url, cfg.model) == ("https://example.test/v1", "vendor/model")

    with pytest.raises(ValidationError, match="base_url must start with"):
        OpenAICompatibleConfig(base_url="example.test/v1")
    with pytest.raises(ValidationError, match="model must not be empty"):
        OpenAICompatibleConfig(model="   ")
    with pytest.raises(ValidationError, match="openrouter preset requires"):
        OpenAICompatibleConfig(preset="openrouter", base_url="https://example.test/v1")


def test_compatible_profile_legacy_input_and_aliases_have_truthful_totals():
    legacy = OpenAICompatibleModelProfile(
        usable_input_tokens="90000",
        max_output_tokens="10000",
    )
    aliased = OpenAICompatibleModelProfile(
        context_window_tokens=120_000,
        max_output_tokens=20_000,
    )

    assert legacy.total_window_tokens == 100_000
    assert legacy.usable_input_tokens == 90_000
    assert aliased.total_window_tokens == 120_000
    assert aliased.usable_input_tokens == 100_000

    with pytest.raises(ValidationError):
        OpenAICompatibleModelProfile(
            usable_input_tokens="not-a-number",
            max_output_tokens=10_000,
        )
    with pytest.raises(ValidationError, match="valid dictionary or instance"):
        OpenAICompatibleModelProfile.model_validate(["legacy", "not", "mapping"])


def test_openrouter_profile_fallback_is_preset_scoped_and_explicit_profile_wins():
    authored = OpenAICompatibleModelProfile(
        total_window_tokens=200_000,
        max_output_tokens=20_000,
    )
    catalogue = OpenAICompatibleModelProfile(
        total_window_tokens=100_000,
        max_output_tokens=10_000,
    )
    routing = SimpleNamespace(catalogue_profiles={"vendor/model": catalogue})

    custom = SimpleNamespace(model_profiles={}, preset="custom", openrouter=routing)
    assert compatible_model_profile("compat:vendor/model", custom) is None

    openrouter = SimpleNamespace(model_profiles={}, preset="openrouter", openrouter=routing)
    assert compatible_model_profile("compat:vendor/model", openrouter) is catalogue

    openrouter.model_profiles["vendor/model"] = authored
    assert compatible_model_profile("compat:vendor/model", openrouter) is authored


@pytest.mark.parametrize(
    ("profile", "expected"),
    [
        (SimpleNamespace(total_window_tokens="bad", max_output_tokens=1), None),
        (SimpleNamespace(usable_input_tokens=-5), 0),
        (SimpleNamespace(usable_input_tokens="bad"), None),
        (SimpleNamespace(), None),
        (None, None),
    ],
)
def test_compatible_usable_input_tokens_is_total_for_malformed_legacy_shapes(
    profile, expected
):
    assert compatible_usable_input_tokens(profile) == expected


@pytest.mark.parametrize(
    ("active_provider", "provider_config", "expected_model", "expected_active"),
    [
        ("codex", {"openai_codex": {"model": "gpt-test"}}, "gpt-test", "codex"),
        ("ollama", {"ollama": {"model": "qwen:test"}}, "ollama:qwen:test", "ollama"),
        (
            "compat",
            {"openai_compatible": {"model": "vendor/model"}},
            "compat:vendor/model",
            "compat",
        ),
        ("kimi", {"kimi": {"model": "kimi-test"}}, "compat:kimi-test", "compat"),
    ],
)
def test_legacy_active_provider_is_materialized_as_model_first_config(
    active_provider, provider_config, expected_model, expected_active
):
    cfg = Config(
        discord={"token": "test-token"},
        llm_provider={"active_provider": active_provider},
        **provider_config,
    )
    assert cfg.llm_provider.model == expected_model
    assert cfg.llm_provider.active_provider == expected_active


def test_legacy_agent_and_kimi_config_are_adapted_without_mutating_input():
    raw = {
        "discord": {"token": "test-token"},
        "openai_codex": {"agent_model": "gpt-legacy-agent"},
        "kimi": {
            "enabled": True,
            "api_key": "test-key",
            "model": "kimi-legacy",
            "max_tokens": 1234,
            "timeout": 45,
        },
        "llm_provider": {"active_provider": "kimi"},
    }
    cfg = Config.model_validate(raw)

    assert cfg.agents.model == "gpt-legacy-agent"
    assert cfg.llm_provider.model == "compat:kimi-legacy"
    assert cfg.llm_provider.active_provider == "compat"
    assert cfg.openai_compatible.model == "kimi-legacy"
    assert cfg.openai_compatible.base_url == "https://api.moonshot.ai/v1"
    assert "model" not in raw["llm_provider"]
    assert "openai_compatible" not in raw


def test_config_rejects_non_mapping_root_input_cleanly():
    with pytest.raises(ValidationError, match="valid dictionary or instance"):
        Config.model_validate(["not", "a", "configuration"])
