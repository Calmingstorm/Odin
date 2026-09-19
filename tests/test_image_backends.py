"""Focused native image-generation backend and selector tests.

No network is used. The auth pool and HTTP session are faked, and a tiny PNG
exercises decoded-image validation.
"""

from __future__ import annotations

import base64
import json

import aiohttp
import pytest

from src.config.schema import Config
from src.llm.circuit_breaker import CircuitOpenError
from src.tools.image.base import (
    ImageBackendUnavailableError,
    ImageQuotaError,
    ImageRequestError,
    ImageResult,
    ImageTransportError,
    png_dimensions,
)
from src.tools.image.openai_backend import OpenAIImageBackend
from src.tools.image.selector import ImageBackendSelector, image_tool_available

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
PNG_1X1_B64 = base64.b64encode(PNG_1X1).decode()


def _sse(*events: dict) -> bytes:
    body = b"".join(b"data: " + json.dumps(event).encode() + b"\n" for event in events)
    return body + b"data: [DONE]\n"


def _final_image_event(value: str = PNG_1X1_B64) -> dict:
    return {
        "type": "response.output_item.done",
        "item": {"type": "image_generation_call", "result": value},
    }


class _FakeResponse:
    def __init__(self, status: int, chunks: tuple[bytes, ...] = (), body: bytes = b""):
        self.status = status
        self._chunks = chunks
        self._body = body
        self.content = self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def iter_chunked(self, _size):
        for chunk in self._chunks:
            yield chunk

    async def read(self):
        return self._body


class _RaiseContext:
    def __init__(self, error: Exception):
        self.error = error

    async def __aenter__(self):
        raise self.error

    async def __aexit__(self, *_args):
        return False


class _FakeSession:
    def __init__(self, responses: list):
        self.responses = list(responses)
        self.posts = 0
        self.closed = False
        self.calls: list[dict] = []

    def post(self, _url, **kwargs):
        self.posts += 1
        self.calls.append(kwargs)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            return _RaiseContext(response)
        return response

    async def close(self):
        self.closed = True


class _FakePool:
    def __init__(self, count: int = 3, acquire_error: Exception | None = None):
        self.count = count
        self.index = 0
        self.acquire_error = acquire_error
        self.limited: list[int] = []
        self.auth_failed: list[int] = []

    def is_configured(self):
        return self.count > 0

    @property
    def account_count(self):
        return self.count

    async def acquire(self):
        if self.acquire_error is not None:
            raise self.acquire_error
        index = self.index % self.count
        self.index += 1
        return ("token", "account", index)

    async def mark_limited(self, index):
        self.limited.append(index)

    async def mark_auth_failed(self, index):
        self.auth_failed.append(index)
        return True


def _backend(pool, responses, **overrides):
    config = Config(discord={"token": "fixture"})
    config.openai_codex.enabled = True
    for key, value in overrides.items():
        setattr(config.image.openai, key, value)
    backend = OpenAIImageBackend(get_auth=lambda: pool, get_config=lambda: config)
    backend._session = _FakeSession(responses)
    return backend, config


def test_png_dimensions_validates_magic_and_dimensions():
    assert png_dimensions(PNG_1X1) == (1, 1)
    assert png_dimensions(b"not a png") is None
    assert png_dimensions(PNG_1X1[:16] + b"\0\0\0\0" + PNG_1X1[20:]) is None


async def test_native_backend_returns_image_and_preserves_wire_defaults():
    backend, config = _backend(
        _FakePool(), [_FakeResponse(200, (_sse(_final_image_event()),))]
    )
    result = await backend.generate(prompt="a copper observatory")
    assert (result.backend, result.mime, result.width, result.height) == (
        "openai", "image/png", 1, 1,
    )
    call = backend._session.calls[0]
    assert call["json"] == {
        "model": config.image.openai.outer_model,
        "instructions": (
            "You are an image generation assistant. Produce exactly the requested image."
        ),
        "input": [{"role": "user", "content": [
            {"type": "input_text", "text": "a copper observatory"},
        ]}],
        "tools": [{"type": "image_generation", "model": config.image.openai.image_model}],
        "tool_choice": {"type": "image_generation"},
        "stream": True,
        "store": False,
    }
    assert "size" not in call["json"]["tools"][0]


@pytest.mark.parametrize("size", ["1024x1024", "1536x1024"])
async def test_native_backend_rejects_explicit_size_defense_in_depth(size):
    backend, _ = _backend(_FakePool(), [])
    with pytest.raises(ImageRequestError):
        await backend.generate(prompt="p", size=size)
    assert backend._session.posts == 0


async def test_native_backend_rotates_accounts_only_before_generation():
    pool = _FakePool(count=2)
    backend, _ = _backend(
        pool,
        [_FakeResponse(429), _FakeResponse(200, (_sse(_final_image_event()),))],
    )
    assert (await backend.generate(prompt="p")).backend == "openai"
    assert pool.limited == [0]
    assert backend._session.posts == 2


async def test_native_backend_does_not_retry_after_accepted_response():
    class _BreakingResponse(_FakeResponse):
        async def iter_chunked(self, _size):
            raise aiohttp.ClientError("mid-stream reset")
            yield b""  # pragma: no cover

    backend, _ = _backend(
        _FakePool(count=2),
        [_BreakingResponse(200), _FakeResponse(200, (_sse(_final_image_event()),))],
    )
    with pytest.raises(ImageTransportError) as error:
        await backend.generate(prompt="p")
    assert error.value.pre_generation is False
    assert backend._session.posts == 1


@pytest.mark.parametrize(
    "event",
    [
        _final_image_event("not-valid-base64"),
        _final_image_event(base64.b64encode(b"not a png").decode()),
        {"type": "response.completed"},
    ],
)
async def test_native_backend_rejects_malformed_output(event):
    backend, _ = _backend(_FakePool(), [_FakeResponse(200, (_sse(event),))])
    with pytest.raises(ImageRequestError):
        await backend.generate(prompt="p")


async def test_native_backend_configuration_and_close():
    backend, _ = _backend(_FakePool(count=0), [])
    assert not backend.is_configured()
    with pytest.raises(ImageBackendUnavailableError):
        await backend.generate(prompt="p")
    await backend.close()
    assert backend._session.closed


async def test_native_backend_disabled_and_open_breaker_are_unavailable():
    backend, config = _backend(_FakePool(), [], enabled=False)
    with pytest.raises(ImageBackendUnavailableError):
        await backend.generate(prompt="p")
    config.image.openai.enabled = True
    backend.breaker.check = lambda: (_ for _ in ()).throw(CircuitOpenError("image", 1))
    with pytest.raises(ImageTransportError) as error:
        await backend.generate(prompt="p")
    assert error.value.pre_generation is True
    assert error.value.reason == "pre_response_transport"


async def test_native_backend_rotates_auth_failure_then_succeeds():
    pool = _FakePool(count=2)
    backend, _ = _backend(
        pool,
        [_FakeResponse(401), _FakeResponse(200, (_sse(_final_image_event()),))],
    )
    assert (await backend.generate(prompt="p")).backend == "openai"
    assert pool.auth_failed == [0]


async def test_native_backend_classifies_server_and_request_failures():
    backend, _ = _backend(_FakePool(count=1), [_FakeResponse(503)])
    with pytest.raises(ImageTransportError) as transport:
        await backend.generate(prompt="p")
    assert transport.value.reason == "pre_response_transport"

    backend, _ = _backend(_FakePool(count=2), [_FakeResponse(400)])
    with pytest.raises(ImageRequestError, match="HTTP 400"):
        await backend.generate(prompt="p")
    assert backend._session.posts == 1


async def test_native_backend_rotates_pre_response_transport_failure():
    backend, _ = _backend(
        _FakePool(count=2),
        [aiohttp.ClientError("connect"), _FakeResponse(200, (_sse(_final_image_event()),))],
    )
    assert (await backend.generate(prompt="p")).backend == "openai"
    assert backend._session.posts == 2


async def test_native_backend_parses_terminal_sse_envelopes_and_noise():
    completed = {
        "type": "response.image_generation_call.completed",
        "result": PNG_1X1_B64,
    }
    response_completed = {
        "type": "response.completed",
        "response": {
            "output": [{"type": "image_generation_call", "result": PNG_1X1_B64}]
        },
    }
    stream = (
        b"event: ignored\n"
        b"data: not-json\n"
        + _sse(
            {"type": "response.image_generation_call.partial_image"},
            completed,
            response_completed,
        )
    )
    backend, _ = _backend(_FakePool(), [_FakeResponse(200, (stream,))])
    assert (await backend.generate(prompt="p")).data == PNG_1X1


async def test_native_backend_pool_exhaustion_is_pre_generation_quota_error():
    pool = _FakePool(acquire_error=RuntimeError("no credentials"))
    backend, _ = _backend(pool, [])
    with pytest.raises(ImageQuotaError) as error:
        await backend.generate(prompt="p")
    assert error.value.pre_generation is True
    assert backend._session.posts == 0


def _config(*, provider="codex", codex=False, image_enabled=True):
    config = Config(discord={"token": "fixture"})
    config.llm_provider.active_provider = provider
    config.openai_codex.enabled = codex
    config.image.openai.enabled = image_enabled
    return config


@pytest.mark.parametrize(
    "config,expected",
    [
        (_config(provider="codex", codex=True, image_enabled=True), True),
        (_config(provider="kimi", codex=True, image_enabled=True), False),
        (_config(provider="codex", codex=False, image_enabled=True), False),
        (_config(provider="codex", codex=True, image_enabled=False), False),
    ],
)
def test_native_visibility_gate(config, expected):
    assert image_tool_available(config) is expected


class _RecordingBackend:
    def __init__(self, error=None):
        self.error = error
        self.calls: list[dict] = []

    async def generate(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return ImageResult(PNG_1X1, "image/png", 1, 1, "openai", "image-model")


async def test_selector_delegates_prompt_only_and_keeps_audit_shape():
    backend = _RecordingBackend()
    selector = ImageBackendSelector(
        get_config=lambda: _config(codex=True), openai_backend=backend,
    )
    result = await selector.generate(prompt="p")
    assert backend.calls == [{"prompt": "p"}]
    assert (result.route, result.fallback_reason) == ("auto_native", None)


async def test_selector_has_no_fallback_and_propagates_native_failure():
    backend = _RecordingBackend(ImageQuotaError("limit", reason="quota"))
    selector = ImageBackendSelector(
        get_config=lambda: _config(codex=True), openai_backend=backend,
    )
    with pytest.raises(ImageQuotaError, match="limit"):
        await selector.generate(prompt="p")
    assert backend.calls == [{"prompt": "p"}]


@pytest.mark.parametrize(
    "config",
    [
        _config(provider="kimi", codex=True),
        _config(provider="codex", codex=False),
        _config(provider="codex", codex=True, image_enabled=False),
    ],
)
async def test_selector_rejects_unavailable_native_configuration(config):
    backend = _RecordingBackend()
    selector = ImageBackendSelector(get_config=lambda: config, openai_backend=backend)
    with pytest.raises(ImageBackendUnavailableError):
        await selector.generate(prompt="p")
    assert backend.calls == []
