"""Built-in, evidence-backed OpenAI-compatible endpoint presets.

URLs are deliberately complete paths. Callers must use them verbatim: several
vendors do not speak at a bare ``/v1`` path, and appending one is a fine way to
manufacture an outage.
"""

from __future__ import annotations

from typing import Literal

ReasoningDialect = Literal[
    "none", "reasoning_effort", "thinking", "qwen_legacy", "openrouter_reasoning"
]
ReasoningContentFeedbackPolicy = Literal["do_not_echo", "preserve"]

# Protocol-verified in the multi-provider follow-up review on 2026-09-19.
# This declares measured/documented capability; it does not infer it from a
# permissive HTTP 200 response.
HOSTED_PROVIDER_PRESETS: dict[str, dict[str, str]] = {
    "deepseek": {
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "reasoning_dialect": "thinking",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
    "zai": {
        "label": "Z.ai GLM",
        "base_url": "https://api.z.ai/api/paas/v4",
        "reasoning_dialect": "thinking",
        "reasoning_content_feedback_policy": "preserve",
    },
    "moonshot": {
        "label": "Moonshot",
        "base_url": "https://api.moonshot.ai/v1",
        "reasoning_dialect": "none",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
    "groq": {
        "label": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "reasoning_dialect": "none",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
    "together": {
        "label": "Together",
        "base_url": "https://api.together.xyz/v1",
        "reasoning_dialect": "none",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
    "fireworks": {
        "label": "Fireworks",
        "base_url": "https://api.fireworks.ai/inference/v1",
        "reasoning_dialect": "none",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
    "mistral": {
        "label": "Mistral",
        "base_url": "https://api.mistral.ai/v1",
        "reasoning_dialect": "none",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
    "xai": {
        "label": "xAI",
        "base_url": "https://api.x.ai/v1",
        "reasoning_dialect": "none",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
    "cerebras": {
        "label": "Cerebras",
        "base_url": "https://api.cerebras.ai/v1",
        "reasoning_dialect": "none",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
    "dashscope": {
        "label": "DashScope",
        "base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "reasoning_dialect": "qwen_legacy",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
    "openrouter": {
        "label": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "reasoning_dialect": "openrouter_reasoning",
        "reasoning_content_feedback_policy": "do_not_echo",
    },
}

LOCAL_BASE_URL_EXAMPLES: dict[str, str] = {
    "vLLM": "http://127.0.0.1:8000/v1",
    "llama.cpp": "http://127.0.0.1:8080/v1",
    "LM Studio": "http://127.0.0.1:1234/v1",
}
