from src.tools.effect_classifier import ToolEffectClass, classify_tool_effect


def test_only_explicit_observation_tool_is_effect_free():
    assert classify_tool_effect("wait_for_agents", {"anything": "ignored"}) == (
        ToolEffectClass.EFFECT_FREE_OBSERVATION
    )
    for name in ("run_command", "run_script", "unknown", "", "search_knowledge"):
        assert classify_tool_effect(name, {}) == ToolEffectClass.EXTERNAL_EFFECT_CAPABLE
