"""Shared endpoint reasoning dialect defaults (not model capabilities)."""

PRESET_REASONING_DIALECTS = {
    "deepseek": "thinking_type",
    "zai": "glm_thinking",
    "qwen": "qwen_legacy",
    "dashscope": "qwen_legacy",
    "openai": "openai_reasoning_effort",
    "openrouter": "openrouter_reasoning",
}


def compatible_reasoning_dialect(config, default="none"):
    """An explicit endpoint dialect wins over the preset default."""
    preset = getattr(config, "preset", None)
    return getattr(config, "reasoning_dialect", None) or (
        PRESET_REASONING_DIALECTS.get(preset, default) if isinstance(preset, str) else default
    )
