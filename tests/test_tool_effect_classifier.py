from src.tools.effect_classifier import ToolEffectClass, classify_tool_effect


def test_only_explicit_observation_tools_are_effect_free():
    for name in ("wait_for_agents", "read_file"):
        assert classify_tool_effect(name, {"anything": "ignored"}) == (
            ToolEffectClass.EFFECT_FREE_OBSERVATION
        )
    for name in ("run_command", "run_script", "unknown", "", "search_knowledge"):
        assert classify_tool_effect(name, {}) == ToolEffectClass.EXTERNAL_EFFECT_CAPABLE
