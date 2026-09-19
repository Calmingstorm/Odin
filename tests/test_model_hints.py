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
    assert desc.index("compat:deepseek-v4-flash") < desc.index("gpt-6-astra") < desc.index("ollama:qwen3:32b")
    assert "operator hint: operator says reserve for thorny work" in desc
    assert "curated seed as of 2026-09-19" in desc
    assert "ollama:qwen3:32b: facts unavailable" in desc


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
            model_profiles={"deepseek-v4-flash": OpenAICompatibleModelProfile(
                total_window_tokens=1000, max_output_tokens=200
            )}
        ),
    )
    description = _spawn(config, Rollup())["description"]
    assert "context 1,000; max output 200; reasoning control thinking_type (configured default); measured p50 321 ms" in description


def test_hints_are_canonicalized_and_nonempty():
    hints = AgentsConfig(model_selection_hints={" compat:foo ": " use it "}).model_selection_hints
    assert hints == {"compat:foo": "use it"}
