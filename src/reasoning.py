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
    return getattr(config, "reasoning_dialect", None) or PRESET_REASONING_DIALECTS.get(
        getattr(config, "preset", None), default
    )
