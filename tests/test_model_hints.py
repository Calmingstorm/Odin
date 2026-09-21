from types import SimpleNamespace

import pytest

from src.config.schema import AgentsConfig, OpenAICompatibleConfig, OpenAICompatibleModelProfile
from src.tools import get_tool_definitions
from src.tools.agent_tool_policy import apply_agent_axis_policy
from src.tools.model_hints import MODEL_HINT_CATALOGUE, seed_entry


def _spawn(config, rollup=None):
    defs = apply_agent_axis_policy(get_tool_definitions(), config, usage_rollup=rollup)
    return next(tool for tool in defs if tool["name"] == "spawn_agent")


def test_operator_hints_override_seed_and_allowlist_order_is_preserved():
    config = SimpleNamespace(
        agents=AgentsConfig(
            model="auto",
            auto_model_allowlist=["compat:deepseek-v4-flash", "gpt-6-astra", "ollama:qwen3:32b"],
            model_selection_hints={"gpt-6-astra": "operator says reserve for thorny work"},
        ),
        ollama=SimpleNamespace(enabled=True),
        openai_codex=SimpleNamespace(agent_reasoning_effort=None, model="gpt-5.6-sol"),
        openai_compatible=OpenAICompatibleConfig(),
    )
    tool = _spawn(config)
    props = tool["input_schema"]["properties"]
    assert props["model"]["enum"] == ["compat:deepseek-v4-flash", "gpt-6-astra", "ollama:qwen3:32b"]
    desc = props["model"]["description"]
    assert (
        desc.index("compat:deepseek-v4-flash")
        < desc.index("gpt-6-astra")
        < desc.index("ollama:qwen3:32b")
    )
    assert "operator hint: operator says reserve for thorny work" in desc
    assert "catalogue seed as of 2026-09-19" in desc
    assert "ollama:qwen3:32b: facts only; add an operator hint" in desc


def test_profile_facts_and_fresh_usage_p50_are_rendered():
    class Rollup:
        def model_latency_p50(self, choices):
            assert choices == ["compat:deepseek-v4-flash"]
            return {choices[0]: 321}

    config = SimpleNamespace(
        agents=AgentsConfig(model="auto", auto_model_allowlist=["compat:deepseek-v4-flash"]),
        openai_codex=SimpleNamespace(agent_reasoning_effort=None, model="gpt-5.6-sol"),
        openai_compatible=OpenAICompatibleConfig(
            reasoning_dialect="thinking_type",
            model_profiles={
                "deepseek-v4-flash": OpenAICompatibleModelProfile(
                    total_window_tokens=120_000, max_output_tokens=20_000
                )
            },
        ),
    )
    description = _spawn(config, Rollup())["description"]
    assert (
        "context 120,000; max output 20,000; reasoning control thinking_type "
        "(configured default); measured p50 321 ms"
        in description
    )


@pytest.mark.parametrize("model", ["compat:deepseek-flash", "compat:deepseek-v4-flash"])
def test_catalogue_and_alias_spellings_share_hints_and_profile_facts(model):
    config = SimpleNamespace(
        agents=AgentsConfig(model="auto", auto_model_allowlist=[model]),
        openai_codex=SimpleNamespace(agent_reasoning_effort=None, model="gpt-5.6-sol"),
        openai_compatible=OpenAICompatibleConfig(),
    )
    description = _spawn(config)["description"]
    assert "context 1,048,576; max output 393,216" in description
    assert "cheapest near-frontier model" in description


def test_hints_are_canonicalized_and_nonempty():
    hints = AgentsConfig(model_selection_hints={" compat:foo ": " use it "}).model_selection_hints
    assert hints == {"compat:foo": "use it"}


def test_catalogue_integrity_preserves_authored_and_derived_hint_inventory():
    """The checked-in catalogue is deliberately a finite, auditable snapshot."""
    assert len(MODEL_HINT_CATALOGUE) == 138
    assert sum("hint" in entry for entry in MODEL_HINT_CATALOGUE.values()) == 134
    assert sum("hint_derived" in entry for entry in MODEL_HINT_CATALOGUE.values()) == 118
    # 16 authored provider hints plus the four shipped Codex tier entries.
    assert sum("hint_derived" not in entry for entry in MODEL_HINT_CATALOGUE.values()) == 20


@pytest.mark.parametrize(
    ("preset", "model", "catalogue_key"),
    [
        ("deepseek", "deepseek-v4-flash", "deepseek/deepseek-flash"),
        ("zai", "glm-5.3", "zai/glm-5.3"),
        ("moonshot", "kimi-k3", "moonshot/kimi-k3"),
        ("kimi", "kimi-k2.6", "moonshot/kimi-k2.6"),
        ("dashscope", "qwen3.8-max", "qwen/qwen3.8-max"),
        ("qwen", "qwen3.8-max", "qwen/qwen3.8-max"),
        ("xai", "grok-4.6", "xai/grok-4.6"),
        ("mistral", "mistral-medium-3-5", "mistral/mistral-medium-3-5"),
    ],
)
def test_compat_catalogue_lookup_uses_configured_preset_namespace(preset, model, catalogue_key):
    config = SimpleNamespace(openai_compatible=OpenAICompatibleConfig(preset=preset))
    assert seed_entry(f"compat:{model}", config) is MODEL_HINT_CATALOGUE[catalogue_key]


def test_unverified_compat_capabilities_are_labelled_and_unknown_models_request_hint():
    config = SimpleNamespace(
        agents=AgentsConfig(
            model="auto", auto_model_allowlist=["compat:glm-5.3", "compat:unlisted"]
        ),
        openai_codex=SimpleNamespace(agent_reasoning_effort=None, model="gpt-5.6-sol"),
        openai_compatible=OpenAICompatibleConfig(
            preset="zai",
            model_profiles={
                "glm-5.3": OpenAICompatibleModelProfile(
                    total_window_tokens=120_000,
                    max_output_tokens=20_000,
                )
            },
        ),
    )
    tool = _spawn(config)
    assert "unconfirmed endpoint capability (catalogue-declared): thinking" in tool["description"]
    prop_description = tool["input_schema"]["properties"]["model"]["description"]
    assert "compat:unlisted" not in prop_description


def test_custom_endpoint_uses_labelled_unique_model_name_fallback():
    from src.tools.model_hints import catalogue_hint_metadata

    config = SimpleNamespace(openai_compatible=OpenAICompatibleConfig(preset="custom"))
    metadata = catalogue_hint_metadata("compat:deepseek-flash", config)
    assert metadata["catalogue_scope"] == "model_name_fallback"
    assert "endpoint scope is unconfirmed" in metadata["scope_note"]
    assert metadata["hint"]
