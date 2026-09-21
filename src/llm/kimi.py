"""Legacy Kimi import compatibility over the generic compatible client."""
from __future__ import annotations

from .backoff import DEFAULT_BASE_DELAY, DEFAULT_MAX_DELAY, DEFAULT_MAX_RETRIES
from .openai_compatible import KIMI_API_URL, KIMI_TOOL_ENFORCEMENT, OpenAICompatibleClient


class KimiClient(OpenAICompatibleClient):
    """Moonshot preset. Existing imports and constructor usage remain valid."""

    def __init__(
        self, api_key: str, model: str = "kimi-k2.6", max_tokens: int = 4096,
        timeout: int = 300, max_retries: int = DEFAULT_MAX_RETRIES,
        retry_base_delay: float = DEFAULT_BASE_DELAY,
        retry_max_delay: float = DEFAULT_MAX_DELAY,
    ) -> None:
        super().__init__(
            api_key, model=model, base_url=KIMI_API_URL, provider_name="kimi",
            max_tokens=max_tokens, timeout=timeout, max_retries=max_retries,
            retry_base_delay=retry_base_delay, retry_max_delay=retry_max_delay,
            tool_quirks={
                "sanitize_schema": True,
                "reasoning_content_placeholder": True,
                "tool_enforcement": KIMI_TOOL_ENFORCEMENT,
                "force_temperature_model_substring": "k2.6",
                "temperature_range": (0.0, 1.0),
                "ignore_request_model": True,
            },
        )
