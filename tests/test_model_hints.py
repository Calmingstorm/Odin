from types import SimpleNamespace

from src.config.schema import AgentsConfig, OpenAICompatibleConfig, OpenAICompatibleModelProfile
from src.tools import get_tool_definitions
from src.tools.agent_tool_policy import apply_agent_axis_policy


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
                    total_window_tokens=1000, max_output_tokens=200
                )
            },
        ),
    )
    description = _spawn(config, Rollup())["description"]
    assert (
        "context 1,000; max output 200; reasoning control thinking_type "
        "(configured default); measured p50 321 ms"
        in description
    )


def test_hints_are_canonicalized_and_nonempty():
    hints = AgentsConfig(model_selection_hints={" compat:foo ": " use it "}).model_selection_hints
    assert hints == {"compat:foo": "use it"}


def test_codex_only_auto_render_preserves_historical_model_surfaces():
    config = SimpleNamespace(
        agents=AgentsConfig(model="auto", auto_model_allowlist=["gpt-6-astra", "gpt-5.6-sol"]),
        openai_codex=SimpleNamespace(agent_reasoning_effort="auto", model="gpt-5.6-sol"),
        openai_compatible=OpenAICompatibleConfig(),
    )
    static = next(tool for tool in get_tool_definitions() if tool["name"] == "spawn_agent")
    dynamic = _spawn(config)
    assert dynamic["description"] == static["description"]
    assert dynamic["input_schema"]["properties"]["model"] == static["input_schema"]["properties"]["model"]
    assert "thinking_mode" not in dynamic["input_schema"]["properties"]


def test_mixed_allowlist_gets_provider_neutral_model_hints_and_eligible_thinking():
    config = SimpleNamespace(
        agents=AgentsConfig(model="auto", auto_model_allowlist=["gpt-5.6-sol", "compat:thinking"]),
        openai_codex=SimpleNamespace(agent_reasoning_effort="auto", model="gpt-5.6-sol"),
        openai_compatible=OpenAICompatibleConfig(
            reasoning_dialect="thinking_type",
            model_profiles={
                "thinking": OpenAICompatibleModelProfile(
                    total_window_tokens=1000, max_output_tokens=200
                )
            }
        ),
    )
    tool = _spawn(config)
    props = tool["input_schema"]["properties"]
    assert props["model"]["enum"] == ["gpt-5.6-sol", "compat:thinking"]
    assert "Optional permitted model." in props["model"]["description"]
    assert "thinking_mode" in props
