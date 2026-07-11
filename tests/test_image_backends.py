"""Image-generation backend tests.

Covers the native OpenAI wire impl's failure classification and the hard
"no retry/fallback after generation begins" rule, the SSE parsing (including
the >512KB base64 line that broke the first probe), the backend-neutral
selector routing, and the structural visibility matrix that gates the tool.

No network: the pool and HTTP session are faked; the only real crypto is a
1x1 PNG used to exercise the magic-byte + dimension checks.
"""

from __future__ import annotations

import base64
import json

import aiohttp
import pytest

from src.config.schema import Config
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

PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
PNG_1x1_B64 = base64.b64encode(PNG_1x1).decode()


# ── png_dimensions ────────────────────────────────────────────────────


def test_png_dimensions_valid():
    assert png_dimensions(PNG_1x1) == (1, 1)


def test_png_dimensions_rejects_non_png():
    assert png_dimensions(b"\xff\xd8\xff\xe0jpegjunk" + b"\x00" * 40) is None
    assert png_dimensions(b"too short") is None


# ── fakes ─────────────────────────────────────────────────────────────


def _sse(*events: dict) -> bytes:
    body = b"".join(b"data: " + json.dumps(e).encode() + b"\n" for e in events)
    return body + b"data: [DONE]\n"


def _final_image_event(b64: str = PNG_1x1_B64) -> dict:
    return {
        "type": "response.output_item.done",
        "item": {"type": "image_generation_call", "result": b64},
    }


class _FakeResp:
    def __init__(self, status: int, chunks: tuple[bytes, ...] = (), body: bytes = b"") -> None:
        self.status = status
        self._chunks = chunks
        self._body = body
        self.content = self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def iter_chunked(self, _n):
        for c in self._chunks:
            yield c

    async def read(self):
        return self._body


class _RaiseCtx:
    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    async def __aenter__(self):
        raise self._exc

    async def __aexit__(self, *a):
        return False


class _FakeSession:
    def __init__(self, responses: list) -> None:
        self._responses = list(responses)
        self.posts = 0
        self.closed = False

    def post(self, _url, **_kw):
        self.posts += 1
        r = self._responses.pop(0)
        if isinstance(r, Exception):
            return _RaiseCtx(r)
        return r

    async def close(self):
        self.closed = True


class _FakePool:
    def __init__(self, count: int = 3, acquire_error: Exception | None = None) -> None:
        self._count = count
        self._idx = 0
        self._acquire_error = acquire_error
        self.limited: list[int] = []
        self.auth_failed: list[int] = []

    def is_configured(self):
        return self._count > 0

    @property
    def account_count(self):  # mirrors the REAL CodexAuthPool: a property, not a method
        return self._count

    async def acquire(self):
        if self._acquire_error is not None:
            raise self._acquire_error
        i = self._idx % self._count
        self._idx += 1
        return ("tok", "acct", i)

    async def mark_limited(self, i):
        self.limited.append(i)

    async def mark_auth_failed(self, i):
        self.auth_failed.append(i)
        return True


def _backend(pool, responses, **cfg_over):
    cfg = Config(discord={"token": "x"})
    cfg.openai_codex.enabled = True
    for k, v in cfg_over.items():
        setattr(cfg.image.openai, k, v)
    b = OpenAIImageBackend(get_auth=lambda: pool, get_config=lambda: cfg)
    b._session = _FakeSession(responses)
    return b, cfg


# ── OpenAIImageBackend: happy path + SSE ──────────────────────────────


async def test_openai_backend_returns_image():
    pool = _FakePool()
    b, _ = _backend(pool, [_FakeResp(200, (_sse(_final_image_event()),))])
    res = await b.generate(prompt="a red circle")
    assert isinstance(res, ImageResult)
    assert res.backend == "openai" and res.mime == "image/png"
    assert (res.width, res.height) == (1, 1)
    assert b._session.posts == 1  # accepted first try, no rotation


async def test_openai_backend_discards_partial_images():
    pool = _FakePool()
    partial = {
        "type": "response.image_generation_call.partial_image",
        "partial_image_b64": "x" * 200,
    }
    b, _ = _backend(pool, [_FakeResp(200, (_sse(partial, _final_image_event()),))])
    res = await b.generate(prompt="p")
    assert res.width == 1  # returned the FINAL image, not the partial


async def test_openai_backend_huge_base64_line_is_parsed():
    # The >512KB base64 line that broke the first probe (aiohttp readline cap).
    big = base64.b64encode(PNG_1x1 + b"\x00" * 600_000).decode()
    pool = _FakePool()
    b, cfg = _backend(
        pool, [_FakeResp(200, (_sse(_final_image_event(big)),))], max_image_bytes=2_000_000
    )
    res = await b.generate(prompt="p")
    assert res.backend == "openai"  # decoded despite the giant single line


# ── OpenAIImageBackend: failure classification ────────────────────────


async def test_429_marks_limited_and_fails_over_then_quota_error():
    pool = _FakePool(count=3)
    b, _ = _backend(pool, [_FakeResp(429, body=b"usage_limit_reached")] * 3)
    with pytest.raises(ImageQuotaError):
        await b.generate(prompt="p")
    assert pool.limited == [0, 1, 2]  # every account tried and benched
    assert b._session.posts == 3


async def test_429_then_success_on_next_account():
    pool = _FakePool(count=3)
    b, _ = _backend(
        pool, [_FakeResp(429), _FakeResp(200, (_sse(_final_image_event()),))]
    )
    res = await b.generate(prompt="p")
    assert res.width == 1
    assert pool.limited == [0] and b._session.posts == 2


async def test_401_marks_auth_failed_and_fails_over():
    pool = _FakePool(count=2)
    b, _ = _backend(pool, [_FakeResp(401), _FakeResp(200, (_sse(_final_image_event()),))])
    res = await b.generate(prompt="p")
    assert res.width == 1 and pool.auth_failed == [0]


async def test_5xx_is_transport_error_after_exhaustion():
    pool = _FakePool(count=2)
    b, _ = _backend(pool, [_FakeResp(503), _FakeResp(502)])
    with pytest.raises(ImageTransportError):
        await b.generate(prompt="p")
    assert b._session.posts == 2


async def test_4xx_is_request_error_with_no_failover():
    pool = _FakePool(count=3)
    b, _ = _backend(pool, [_FakeResp(400, body=b"bad params")])
    with pytest.raises(ImageRequestError):
        await b.generate(prompt="p")
    assert b._session.posts == 1  # request-level: did NOT rotate
    assert pool.limited == [] and pool.auth_failed == []


async def test_no_failover_after_200_then_upstream_failure():
    # response.failed AFTER a 200 must NOT retry/rotate — the account is pinned.
    pool = _FakePool(count=3)
    failed = {"type": "response.failed", "error": {"message": "policy"}}
    b, _ = _backend(
        pool, [_FakeResp(200, (_sse(failed),)), _FakeResp(200, (_sse(_final_image_event()),))]
    )
    with pytest.raises(ImageRequestError):
        await b.generate(prompt="p")
    assert b._session.posts == 1  # never tried the second (would double-generate)


async def test_no_failover_after_200_then_transport_break():
    pool = _FakePool(count=3)

    class _BreakingResp(_FakeResp):
        async def iter_chunked(self, _n):
            raise aiohttp.ClientError("mid-stream reset")
            yield b""  # pragma: no cover

    b, _ = _backend(pool, [_BreakingResp(200)])
    with pytest.raises(ImageTransportError) as ei:
        await b.generate(prompt="p")
    assert ei.value.pre_generation is False  # post-generation: no fallback
    assert b._session.posts == 1


async def test_no_failover_when_response_cleanup_fails_after_success():
    # A successful 200 stream whose response __aexit__ then raises must NOT retry
    # another account — that double-generates after the account is pinned.
    pool = _FakePool(count=3)

    class _AexitFailResp(_FakeResp):
        async def __aexit__(self, *a):
            raise aiohttp.ClientError("cleanup boom")

    b, _ = _backend(
        pool,
        [
            _AexitFailResp(200, (_sse(_final_image_event()),)),
            _FakeResp(200, (_sse(_final_image_event()),)),  # must NOT be reached
        ],
    )
    with pytest.raises(ImageTransportError) as ei:
        await b.generate(prompt="p")
    assert ei.value.pre_generation is False
    assert b._session.posts == 1  # exactly one POST — no double generation


async def test_oversized_decoded_image_rejected():
    big = base64.b64encode(PNG_1x1 + b"\x00" * 5000).decode()
    pool = _FakePool()
    b, _ = _backend(pool, [_FakeResp(200, (_sse(_final_image_event(big)),))], max_image_bytes=100)
    with pytest.raises(ImageRequestError):
        await b.generate(prompt="p")


async def test_malformed_base64_rejected():
    pool = _FakePool()
    b, _ = _backend(pool, [_FakeResp(200, (_sse(_final_image_event("!!!not base64!!!")),))])
    with pytest.raises(ImageRequestError):
        await b.generate(prompt="p")


async def test_non_png_output_rejected():
    jpeg_b64 = base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 40).decode()
    pool = _FakePool()
    b, _ = _backend(pool, [_FakeResp(200, (_sse(_final_image_event(jpeg_b64)),))])
    with pytest.raises(ImageRequestError):
        await b.generate(prompt="p")


async def test_no_image_in_stream_rejected():
    pool = _FakePool()
    b, _ = _backend(pool, [_FakeResp(200, (_sse({"type": "response.completed"}),))])
    with pytest.raises(ImageRequestError):
        await b.generate(prompt="p")


async def test_native_rejects_non_square_without_request():
    # Native only produces squares; a non-square size is refused before any HTTP
    # call (defense in depth — the selector also routes non-square to ComfyUI).
    pool = _FakePool()
    b, _ = _backend(pool, [_FakeResp(200, (_sse(_final_image_event()),))])
    with pytest.raises(ImageRequestError):
        await b.generate(prompt="p", size="1536x1024")
    assert b._session.posts == 0


async def test_native_accepts_square_and_omits_size_in_payload():
    pool = _FakePool()
    b, _ = _backend(pool, [_FakeResp(200, (_sse(_final_image_event()),))])
    res = await b.generate(prompt="p", size="1024x1024")
    assert res.backend == "openai"
    # `size` must NOT be sent — the endpoint ignores it.
    sent = b._body(b.get_config().image, "p")
    assert "size" not in sent["tools"][0]


async def test_kill_switch_unavailable():
    pool = _FakePool()
    b, _ = _backend(pool, [], enabled=False)
    with pytest.raises(ImageBackendUnavailableError):
        await b.generate(prompt="p")


async def test_unconfigured_pool_unavailable():
    b, _ = _backend(_FakePool(count=0), [])
    with pytest.raises(ImageBackendUnavailableError):
        await b.generate(prompt="p")


async def test_no_pool_resolved_is_unavailable():
    # get_auth resolves live and may return None (Codex not logged in yet).
    cfg = Config(discord={"token": "x"})
    cfg.openai_codex.enabled = True
    b = OpenAIImageBackend(get_auth=lambda: None, get_config=lambda: cfg)
    with pytest.raises(ImageBackendUnavailableError):
        await b.generate(prompt="p")


async def test_auth_resolved_live_not_snapshotted():
    # A pool that appears AFTER construction must be used (live login/reload).
    holder = {"pool": None}
    cfg = Config(discord={"token": "x"})
    cfg.openai_codex.enabled = True
    b = OpenAIImageBackend(get_auth=lambda: holder["pool"], get_config=lambda: cfg)
    assert b.is_configured() is False
    holder["pool"] = _FakePool()
    b._session = _FakeSession([_FakeResp(200, (_sse(_final_image_event()),))])
    assert b.is_configured() is True
    res = await b.generate(prompt="p")
    assert res.backend == "openai"


async def test_pool_exhaustion_is_quota_error():
    # acquire() raising RuntimeError must become a pre-generation ImageQuotaError
    # (so `auto` can fall back), not a raw RuntimeError that bypasses fallback.
    pool = _FakePool(acquire_error=RuntimeError("No Codex credentials configured."))
    b, _ = _backend(pool, [])
    with pytest.raises(ImageQuotaError) as ei:
        await b.generate(prompt="p")
    assert ei.value.pre_generation is True
    assert b._session.posts == 0


async def test_open_breaker_is_pre_generation():
    from src.llm.circuit_breaker import CircuitOpenError

    pool = _FakePool()
    b, _ = _backend(pool, [])
    b.breaker.check = lambda: (_ for _ in ()).throw(CircuitOpenError("codex_image", 5.0))
    with pytest.raises(ImageTransportError) as ei:
        await b.generate(prompt="p")
    assert ei.value.pre_generation is True  # auto can fall back
    assert b._session.posts == 0


async def test_4xx_does_not_poison_the_breaker():
    from unittest.mock import MagicMock

    pool = _FakePool()
    b, _ = _backend(pool, [_FakeResp(400, body=b"bad prompt")])
    b.breaker.record_failure = MagicMock()
    with pytest.raises(ImageRequestError):
        await b.generate(prompt="p")
    b.breaker.record_failure.assert_not_called()  # a bad prompt must not disable everyone


async def test_5xx_does_count_against_the_breaker():
    from unittest.mock import MagicMock

    pool = _FakePool(count=1)
    b, _ = _backend(pool, [_FakeResp(503)])
    b.breaker.record_failure = MagicMock()
    with pytest.raises(ImageTransportError):
        await b.generate(prompt="p")
    b.breaker.record_failure.assert_called()


async def test_unterminated_oversized_frame_rejected():
    # A giant frame with no newline must be rejected before it is fully buffered.
    pool = _FakePool()
    huge = b"data: " + b"A" * 200_000  # no newline
    b, _ = _backend(pool, [_FakeResp(200, (huge,))], max_image_bytes=1024)
    with pytest.raises(ImageRequestError):
        await b.generate(prompt="p")


async def test_close_closes_session():
    pool = _FakePool()
    b, _ = _backend(pool, [])
    await b.close()
    assert b._session.closed


# ── ComfyUIImageBackend ───────────────────────────────────────────────


class _FakeComfyClient:
    def __init__(self, result):
        self._result = result
        self.calls: list[dict] = []

    async def generate(self, **kw):
        self.calls.append(kw)
        return self._result


def _comfy_cfg(enabled=True):
    c = Config(discord={"token": "x"})
    c.comfyui.enabled = enabled
    c.comfyui.url = "http://comfy"
    c.comfyui.default_checkpoint = "cp.safetensors"
    return c


async def test_comfyui_backend_disabled():
    from src.tools.image.comfyui_backend import ComfyUIImageBackend

    b = ComfyUIImageBackend(get_config=lambda: _comfy_cfg(enabled=False))
    with pytest.raises(ImageBackendUnavailableError):
        await b.generate(prompt="p")


async def test_comfyui_backend_success(monkeypatch):
    from src.tools.image import comfyui_backend as mod

    fake = _FakeComfyClient(PNG_1x1)
    monkeypatch.setattr(mod, "ComfyUIClient", lambda url, default_checkpoint="": fake)
    b = mod.ComfyUIImageBackend(get_config=lambda: _comfy_cfg())
    res = await b.generate(prompt="p", size="512x768", negative="ugly", model="m")
    assert res.backend == "comfyui" and (res.width, res.height) == (1, 1)
    assert fake.calls[0]["width"] == 512 and fake.calls[0]["height"] == 768
    assert fake.calls[0]["negative"] == "ugly" and fake.calls[0]["model"] == "m"


async def test_comfyui_backend_failure_is_transport_error(monkeypatch):
    from src.tools.image import comfyui_backend as mod

    monkeypatch.setattr(
        mod, "ComfyUIClient", lambda url, default_checkpoint="": _FakeComfyClient(None)
    )
    b = mod.ComfyUIImageBackend(get_config=lambda: _comfy_cfg())
    with pytest.raises(ImageTransportError):
        await b.generate(prompt="p")


def test_parse_size_variants():
    from src.tools.image.comfyui_backend import _parse_size

    assert _parse_size("512x768", None, None) == (512, 768)
    assert _parse_size(None, None, None) == (1024, 1024)
    assert _parse_size("garbage", None, None) == (1024, 1024)
    assert _parse_size("100x100", 200, 300) == (200, 300)  # explicit w/h win
    assert _parse_size(None, 99999, 10) == (2048, 64)  # clamped both ends


# ── visibility matrix (Aaron's rules) ─────────────────────────────────


def _cfg(*, backend="auto", provider="codex", codex=False, comfy=False):
    c = Config(discord={"token": "x"})
    c.image.backend = backend
    c.llm_provider.active_provider = provider
    c.openai_codex.enabled = codex
    c.comfyui.enabled = comfy
    return c


@pytest.mark.parametrize(
    "kw,expected",
    [
        # auto: native on codex, comfy otherwise, hidden when neither
        (dict(backend="auto", provider="codex", codex=True), True),
        (dict(backend="auto", provider="kimi", codex=True, comfy=True), True),
        (dict(backend="auto", provider="kimi", codex=True, comfy=False), False),  # Aaron's key case
        (dict(backend="auto", provider="codex", codex=False, comfy=False), False),
        # openai mode: only when native available (codex provider + enabled)
        (dict(backend="openai", provider="codex", codex=True), True),
        (dict(backend="openai", provider="kimi", codex=True, comfy=True), False),
        # comfyui mode: only when comfy configured
        (dict(backend="comfyui", provider="kimi", comfy=True), True),
        (dict(backend="comfyui", provider="codex", codex=True, comfy=False), False),
    ],
)
def test_visibility_matrix(kw, expected):
    assert image_tool_available(_cfg(**kw)) is expected


# ── selector routing ──────────────────────────────────────────────────


class _RecordingBackend:
    def __init__(self, name, *, result=None, error=None):
        self.name = name
        self._result = result or ImageResult(PNG_1x1, "image/png", 1, 1, name, "m")
        self._error = error
        self.calls: list[dict] = []

    async def generate(self, **kw):
        self.calls.append(kw)
        if self._error:
            raise self._error
        return self._result


def _selector(cfg, *, native=None, comfy=None):
    return ImageBackendSelector(
        get_config=lambda: cfg, openai_backend=native, comfyui_backend=comfy
    )


async def test_selector_comfyui_mode_routes_to_comfy():
    cfg = _cfg(backend="comfyui", provider="codex", codex=True, comfy=True)
    comfy = _RecordingBackend("comfyui")
    native = _RecordingBackend("openai")
    res = await _selector(cfg, native=native, comfy=comfy).generate(prompt="p")
    assert res.backend == "comfyui" and comfy.calls and not native.calls


async def test_selector_openai_mode_rejects_comfy_features():
    cfg = _cfg(backend="openai", provider="codex", codex=True)
    native = _RecordingBackend("openai")
    with pytest.raises(ImageRequestError):
        await _selector(cfg, native=native, comfy=_RecordingBackend("comfyui")).generate(
            prompt="p", negative="blurry"
        )
    assert not native.calls


async def test_selector_auto_prefers_native_then_falls_back_on_pre_generation():
    cfg = _cfg(backend="auto", provider="codex", codex=True, comfy=True)
    native = _RecordingBackend("openai", error=ImageQuotaError("limit"))  # pre_generation
    comfy = _RecordingBackend("comfyui")
    res = await _selector(cfg, native=native, comfy=comfy).generate(prompt="p")
    assert res.backend == "comfyui"  # fell back
    assert native.calls and comfy.calls


async def test_selector_auto_does_not_fall_back_after_generation():
    cfg = _cfg(backend="auto", provider="codex", codex=True, comfy=True)
    native = _RecordingBackend("openai", error=ImageRequestError("policy"))  # post-generation
    comfy = _RecordingBackend("comfyui")
    with pytest.raises(ImageRequestError):
        await _selector(cfg, native=native, comfy=comfy).generate(prompt="p")
    assert native.calls and not comfy.calls  # no fallback


async def test_selector_auto_comfy_feature_routes_to_comfy():
    cfg = _cfg(backend="auto", provider="codex", codex=True, comfy=True)
    native = _RecordingBackend("openai")
    comfy = _RecordingBackend("comfyui")
    await _selector(cfg, native=native, comfy=comfy).generate(prompt="p", negative="blurry")
    assert comfy.calls and not native.calls  # comfy-specific field selects comfy


async def test_selector_auto_kimi_uses_comfy():
    cfg = _cfg(backend="auto", provider="kimi", codex=True, comfy=True)
    native = _RecordingBackend("openai")
    comfy = _RecordingBackend("comfyui")
    res = await _selector(cfg, native=native, comfy=comfy).generate(prompt="p")
    assert res.backend == "comfyui" and not native.calls


async def test_selector_no_backend_available_raises():
    cfg = _cfg(backend="auto", provider="kimi", comfy=False)
    with pytest.raises(ImageBackendUnavailableError):
        await _selector(cfg, native=None, comfy=_RecordingBackend("comfyui")).generate(prompt="p")


# ── size handling + square-only routing (Odin round-2) ────────────────


def test_parse_size_and_is_square():
    from src.tools.image.base import is_square_size, parse_size

    assert parse_size(None) is None
    assert parse_size("") is None
    assert parse_size("1024x1024") == (1024, 1024)
    assert parse_size("1536X1024") == (1536, 1024)  # case-insensitive
    assert is_square_size(None) is True
    assert is_square_size("1024x1024") is True
    assert is_square_size("1536x1024") is False
    for bad in ["1024", "1024x", "x1024", "0x0", "-1x-1", "axb", "5000x5000"]:
        with pytest.raises(ValueError):
            parse_size(bad)


async def test_selector_width_height_fold_to_size_and_use_native():
    # The original bug: width/height (auto-filled from the schema) forced
    # ComfyUI. They now fold into a square size and go native.
    cfg = _cfg(backend="auto", provider="codex", codex=True, comfy=True)
    native = _RecordingBackend("openai")
    comfy = _RecordingBackend("comfyui")
    await _selector(cfg, native=native, comfy=comfy).generate(prompt="p", width=1024, height=1024)
    assert native.calls and not comfy.calls
    assert native.calls[0]["size"] == "1024x1024"


async def test_selector_auto_non_square_routes_to_comfy():
    cfg = _cfg(backend="auto", provider="codex", codex=True, comfy=True)
    native = _RecordingBackend("openai")
    comfy = _RecordingBackend("comfyui")
    res = await _selector(cfg, native=native, comfy=comfy).generate(prompt="p", size="1536x1024")
    assert res.backend == "comfyui" and not native.calls  # native never tried


async def test_selector_auto_non_square_no_comfy_does_not_fall_back_to_native():
    cfg = _cfg(backend="auto", provider="codex", codex=True, comfy=False)
    native = _RecordingBackend("openai")
    with pytest.raises(ImageBackendUnavailableError):
        await _selector(cfg, native=native, comfy=_RecordingBackend("comfyui")).generate(
            prompt="p", size="1536x1024"
        )
    assert not native.calls  # a non-square request must never fall back to native


async def test_selector_openai_mode_rejects_non_square():
    cfg = _cfg(backend="openai", provider="codex", codex=True)
    native = _RecordingBackend("openai")
    with pytest.raises(ImageRequestError):
        await _selector(cfg, native=native, comfy=_RecordingBackend("comfyui")).generate(
            prompt="p", size="1536x1024"
        )
    assert not native.calls  # rejected before any native call


async def test_selector_auto_square_size_uses_native():
    cfg = _cfg(backend="auto", provider="codex", codex=True, comfy=True)
    native = _RecordingBackend("openai")
    comfy = _RecordingBackend("comfyui")
    res = await _selector(cfg, native=native, comfy=comfy).generate(prompt="p", size="512x512")
    assert res.backend == "openai" and native.calls and not comfy.calls


async def test_selector_rejects_one_sided_dimension():
    cfg = _cfg(backend="auto", provider="codex", codex=True, comfy=True)
    sel = _selector(cfg, native=_RecordingBackend("openai"), comfy=_RecordingBackend("comfyui"))
    with pytest.raises(ImageRequestError):
        await sel.generate(prompt="p", width=1024)  # height missing


async def test_selector_explicit_size_wins_over_width_height():
    cfg = _cfg(backend="auto", provider="codex", codex=True, comfy=True)
    native = _RecordingBackend("openai")
    comfy = _RecordingBackend("comfyui")
    # explicit square size beats a non-square width/height -> native
    await _selector(cfg, native=native, comfy=comfy).generate(
        prompt="p", size="1024x1024", width=1536, height=1024
    )
    assert native.calls and native.calls[0]["size"] == "1024x1024" and not comfy.calls
