import json

import pytest

from src.llm.errors import LLMContextLengthError, LLMRequestError
from src.llm.openai_compatible import DeepSeekClient, OpenAICompatibleClient


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


@pytest.mark.parametrize(
    ("dialect", "effort", "expected"),
    [
        ("thinking_type", "auto", {"thinking": {"type": "adaptive"}}),
        ("thinking_type", "minimal", {"thinking": {"type": "disabled"}}),
        ("openai_reasoning_effort", "high", {"reasoning_effort": "high"}),
        ("qwen_legacy", "high", {"enable_thinking": True, "thinking_mode": "thinking"}),
        ("qwen_reasoning_effort", "high", {"reasoning_effort": "high"}),
        ("openrouter_reasoning", "high", {"reasoning": {"enabled": True, "effort": "high"}}),
    ],
)
def test_reasoning_dialects_are_profile_declared(dialect, effort, expected):
    client = OpenAICompatibleClient("test", model="fixture", reasoning_dialect=dialect)
    body = {}
    client._apply_reasoning(body, effort)
    assert body == expected


def test_glm_preserved_thinking_is_explicit_and_replayed():
    client = OpenAICompatibleClient(
        "test",
        model="glm",
        reasoning_dialect="glm_thinking",
        glm_clear_thinking=False,
        reasoning_content_feedback_policy="preserve",
    )
    response = client._parse_response(
        {"choices": [{"message": {"content": "OK", "reasoning_content": "keep"}}]}
    )
    assert response.reasoning_content == "keep"
    wire = client._convert_messages(
        [
            {
                "role": "assistant",
                "content": [
                    {"type": "reasoning_content", "reasoning_content": "keep"},
                    {"type": "text", "text": "OK"},
                ],
            }
        ],
        "",
    )
    assert wire[0]["reasoning_content"] == "keep"


def test_reasoning_content_and_call_id_default_to_safe_neutral_values():
    client = OpenAICompatibleClient("test", model="fixture")
    response = client._parse_response(
        {
            "choices": [
                {
                    "message": {
                        "reasoning_content": "private",
                        "tool_calls": [
                            {"id": "bad id", "function": {"name": "x", "arguments": "{}"}}
                        ],
                    }
                }
            ]
        }
    )
    assert response.reasoning_content is None
    assert response.tool_calls[0].id.startswith("call_")
    assert "kimi" not in response.tool_calls[0].id


def test_generic_temperature_is_not_kimi_clamped():
    client = OpenAICompatibleClient("test", model="fixture")
    assert client._resolve_temperature(1.5) == 1.5
    assert client._resolve_temperature(-0.5) == -0.5
