import json

import pytest

from src.llm.errors import LLMContextLengthError, LLMRequestError
from src.llm.openai_compatible import DeepSeekClient


class _Response:
    def __init__(self, status, body):
        self.status = status
        self._body = json.dumps(body)
        self.headers = {}

    async def text(self):
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None


class _Session:
    def __init__(self, response):
        self.response = response

    def post(self, *_args, **_kwargs):
        return self.response


async def _async_value(value):
    return value


@pytest.mark.asyncio
async def test_deepseek_anchored_overflow_extracts_context_window(monkeypatch):
    client = DeepSeekClient("test", model="deepseek-v4-flash", max_retries=0)
    body = {
        "error": {
            "message": (
                "This model's maximum context length is 1048576 tokens. "
                "However, you requested 2000042 tokens "
                "(2000034 in the messages, 8 in the completion)."
            ),
            "code": "invalid_request_error",
        }
    }
    monkeypatch.setattr(
        client, "_get_session", lambda: _async_value(_Session(_Response(400, body)))
    )
    with pytest.raises(LLMContextLengthError) as exc:
        await client._request_with_retry({"model": "deepseek-v4-flash"})
    assert exc.value.code == "context_length_exceeded"
    assert exc.value.context_window_tokens == 1_048_576


@pytest.mark.asyncio
async def test_invalid_request_mentioning_tokens_is_not_overflow(monkeypatch):
    client = DeepSeekClient("test", max_retries=0)
    body = {
        "error": {
            "message": "Invalid max_tokens value, the valid range is [1, 393216]",
            "code": "invalid_request_error",
        }
    }
    monkeypatch.setattr(
        client, "_get_session", lambda: _async_value(_Session(_Response(400, body)))
    )
    with pytest.raises(LLMRequestError) as exc:
        await client._request_with_retry({"model": "deepseek-flash"})
    assert not isinstance(exc.value, LLMContextLengthError)


def test_deepseek_cache_fallback_and_reasoning_exclusion():
    client = DeepSeekClient("test")
    response = client._parse_response(
        {
            "choices": [{"message": {"content": "OK", "reasoning_content": "private"}}],
            "usage": {"prompt_tokens": 37, "completion_tokens": 34, "prompt_cache_hit_tokens": 23},
        }
    )
    assert response.text == "OK"
    assert response.cached_tokens == 23
    assert "private" not in response.text
