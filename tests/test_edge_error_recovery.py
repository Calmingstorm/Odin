"""Edge-shaped error bodies are transport failures, not request failures.

2026-08-14 incident: chatgpt.com's edge returned HTTP 403 carrying its styled
HTML error page. The catch-all status branch classified it ``LLMRequestError``,
recovery fast-failed it, and a healthy turn died on ONE HTTP attempt — then the
raw page reached chat (boundary side covered in the sanitization tests).

These pin the settled classification matrix (design-reviewed with Odin,
2026-08-14):

    401 / 429            -> dedicated branches, control flow bit-exact
    500/502/503/504      -> transport, regardless of body shape
    other non-2xx        -> JSON *object* body = request-class fast-fail;
                            anything else (HTML / empty / non-dict JSON /
                            junk) = transport with backoff + retry

plus the raise-site invariant: no raised LLMError message ever embeds raw
response bytes — bounded structure-aware descriptors only — and the error-body
read is capped so a hostile edge cannot trade an error page for memory.
"""
from __future__ import annotations

import json

import pytest

from src.llm.errors import (
    LLMAuthError,
    LLMCapacityError,
    LLMRateLimitError,
    LLMRequestError,
    LLMTransportError,
)
from src.llm.openai_codex import (
    _ERROR_BODY_READ_CAP,
    CodexChatClient,
    _describe_error_body,
    _parse_structured_error,
)

HTML_PAGE = (
    b"<html>\n  <head>\n    <meta name=\"viewport\" content=\"width=device-width\" />"
    b"\n    <style global>body{font-family:Arial}</style>\n  </head>\n"
    b"<body>@everyone edge says no</body></html>"
)
JSON_ERROR = json.dumps(
    {"error": {"message": "The model `gpt-bogus` does not exist", "type": "invalid_request_error"}}
).encode()


class FakeContent:
    """Models the REAL StreamReader contract: ``read(n)`` returns at most
    *n* bytes from the current position (one queued chunk at a time when
    chunked), advances, and returns ``b""`` at EOF."""

    def __init__(self, lines: list[str], body: bytes, chunks: list[bytes] | None = None):
        self._lines = list(lines)
        self._chunks = list(chunks) if chunks is not None else ([body] if body else [])
        self.read_sizes: list[int] = []

    def __aiter__(self):
        return self._iter()

    async def _iter(self):
        for line in self._lines:
            yield line.encode()

    async def read(self, n: int = -1) -> bytes:
        self.read_sizes.append(n)
        if not self._chunks:
            return b""
        if n < 0:
            data, self._chunks = b"".join(self._chunks), []
            return data
        chunk = self._chunks[0]
        data, rest = chunk[:n], chunk[n:]
        if rest:
            self._chunks[0] = rest
        else:
            self._chunks.pop(0)
        return data


class FakeResp:
    def __init__(self, status, body=b"", sse_lines=None, headers=None, chunks=None):
        self.status = status
        self._body = body if chunks is None else b"".join(chunks)
        self.headers = headers or {}
        self.content = FakeContent(sse_lines or [], body, chunks=chunks)

    async def read(self):
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class FakeSession:
    def __init__(self, script):
        self._script = list(script)
        self.calls = 0

    def post(self, *args, **kwargs):
        self.calls += 1
        if not self._script:
            raise AssertionError("FakeSession script exhausted — unexpected extra request")
        return self._script.pop(0)


class FakeSingleAuth:
    def __init__(self):
        self.limited = False
        self.refreshed = []

    async def get_access_token(self):
        return "tok"

    def get_account_id(self):
        return None

    def mark_rate_limited(self, seconds: float = 60):
        self.limited = True

    async def force_refresh(self, stale_token=None):
        self.refreshed.append(stale_token)
        return True

    async def mark_current_auth_failed(self):
        return False


async def _async_return(v):
    return v


def _client(max_retries: int = 2, auth=None) -> CodexChatClient:
    return CodexChatClient(
        auth=auth or FakeSingleAuth(),
        model="gpt-test",
        max_retries=max_retries,
        retry_base_delay=0.001,
        retry_max_delay=0.002,
    )


def _wire(monkeypatch, client, session):
    monkeypatch.setattr(client, "_get_session", lambda: _async_return(session))


TEXT_OK_SSE = [
    'data: {"type": "response.output_text.delta", "delta": "hello"}\n',
    'data: {"type": "response.completed", "response": {}}\n',
    "data: [DONE]\n",
]


# ---------------------------------------------------------------------------
# Classification matrix — the recoverability fix
# ---------------------------------------------------------------------------

class TestEdgeShapedBodiesAreTransport:
    async def test_html_403_retries_then_succeeds(self, monkeypatch):
        """The incident shape: one edge HTML 403 must not kill the turn."""
        client = _client(max_retries=2)
        session = FakeSession([
            FakeResp(403, body=HTML_PAGE, headers={"Content-Type": "text/html"}),
            FakeResp(200, sse_lines=TEXT_OK_SSE),
        ])
        _wire(monkeypatch, client, session)

        text = await client._stream_request({"model": "m"})
        assert text == "hello"
        assert session.calls == 2
        assert client.breaker._failure_count == 0  # success reset

    async def test_html_403_exhaustion_raises_transport(self, monkeypatch):
        client = _client(max_retries=2)
        session = FakeSession([
            FakeResp(403, body=HTML_PAGE, headers={"Content-Type": "text/html; charset=utf-8"}),
            FakeResp(403, body=HTML_PAGE, headers={"Content-Type": "text/html; charset=utf-8"}),
        ])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMTransportError) as ei:
            await client._stream_request({"model": "m"})
        assert session.calls == 2
        msg = str(ei.value)
        assert "403" in msg
        assert "non-JSON error body (text/html" in msg
        assert "<html" not in msg.lower()

    async def test_empty_body_403_is_transport(self, monkeypatch):
        client = _client(max_retries=2)
        session = FakeSession([
            FakeResp(403, body=b""),
            FakeResp(200, sse_lines=TEXT_OK_SSE),
        ])
        _wire(monkeypatch, client, session)
        assert await client._stream_request({"model": "m"}) == "hello"
        assert session.calls == 2

    async def test_non_dict_json_403_is_transport(self, monkeypatch):
        client = _client(max_retries=2)
        session = FakeSession([
            FakeResp(403, body=b"[1, 2, 3]", headers={"Content-Type": "application/json"}),
            FakeResp(200, sse_lines=TEXT_OK_SSE),
        ])
        _wire(monkeypatch, client, session)
        assert await client._stream_request({"model": "m"}) == "hello"
        assert session.calls == 2

    async def test_lying_content_type_html_body_is_transport(self, monkeypatch):
        """Body bytes are authority: a JSON Content-Type on an HTML body is
        still edge-shaped."""
        client = _client(max_retries=2)
        session = FakeSession([
            FakeResp(400, body=HTML_PAGE, headers={"Content-Type": "application/json"}),
            FakeResp(200, sse_lines=TEXT_OK_SSE),
        ])
        _wire(monkeypatch, client, session)
        assert await client._stream_request({"model": "m"}) == "hello"
        assert session.calls == 2


class TestChunkedBodyReassembly:
    """``StreamReader.read(n)`` returns as soon as ANY bytes are buffered,
    so classification must reassemble to EOF (or the cap) — a chunked JSON
    rejection must never be read truncated and retried as transport
    (round-1 review blocker, reproduced against the production method)."""

    async def test_chunked_json_400_reassembled_fast_fails(self, monkeypatch):
        client = _client(max_retries=3)
        mid = len(JSON_ERROR) // 2
        session = FakeSession([
            FakeResp(400, chunks=[JSON_ERROR[:mid], JSON_ERROR[mid:]]),
        ])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMRequestError) as ei:
            await client._stream_request({"model": "m"})
        assert session.calls == 1
        assert "does not exist" in str(ei.value)

    async def test_chunked_html_body_still_transport(self, monkeypatch):
        client = _client(max_retries=2)
        session = FakeSession([
            FakeResp(403, chunks=[HTML_PAGE[:40], HTML_PAGE[40:]]),
            FakeResp(200, sse_lines=TEXT_OK_SSE),
        ])
        _wire(monkeypatch, client, session)
        assert await client._stream_request({"model": "m"}) == "hello"
        assert session.calls == 2

    async def test_valid_json_prefix_with_unread_suffix_is_transport(self, monkeypatch):
        """A valid JSON object padded to exactly the read cap, followed by
        unread edge bytes, must not fast-fail from the truncated prefix."""
        prefix = JSON_ERROR + b" " * (_ERROR_BODY_READ_CAP - len(JSON_ERROR))
        resp = FakeResp(400, chunks=[prefix, HTML_PAGE])
        client = _client(max_retries=1)
        session = FakeSession([resp])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMTransportError):
            await client._stream_request({"model": "m"})
        assert session.calls == 1
        assert resp.content.read_sizes == [_ERROR_BODY_READ_CAP, 1]

    async def test_valid_json_body_exactly_at_cap_stays_request_class(self, monkeypatch):
        """Hitting the cap is not itself overflow when the next read is EOF."""
        body = JSON_ERROR + b" " * (_ERROR_BODY_READ_CAP - len(JSON_ERROR))
        resp = FakeResp(400, body=body)
        client = _client(max_retries=3)
        session = FakeSession([resp])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMRequestError):
            await client._stream_request({"model": "m"})
        assert session.calls == 1
        assert resp.content.read_sizes == [_ERROR_BODY_READ_CAP, 1]


class TestStructuredBodiesStayRequestClass:
    async def test_json_403_fast_fails_one_attempt(self, monkeypatch):
        client = _client(max_retries=3)
        session = FakeSession([FakeResp(403, body=JSON_ERROR)])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMRequestError) as ei:
            await client._stream_request({"model": "m"})
        assert session.calls == 1
        assert client.breaker._failure_count == 1
        assert "does not exist" in str(ei.value)

    async def test_json_400_fast_fails_one_attempt(self, monkeypatch):
        """Bit-exact pin of the pre-change deterministic-4xx behavior."""
        client = _client(max_retries=3)
        session = FakeSession([FakeResp(400, body=JSON_ERROR)])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMRequestError):
            await client._stream_request({"model": "m"})
        assert session.calls == 1

    async def test_lying_content_type_json_body_is_request(self, monkeypatch):
        client = _client(max_retries=3)
        session = FakeSession([
            FakeResp(403, body=JSON_ERROR, headers={"Content-Type": "text/html"}),
        ])
        _wire(monkeypatch, client, session)
        with pytest.raises(LLMRequestError):
            await client._stream_request({"model": "m"})
        assert session.calls == 1

    async def test_empty_dict_counts_as_structured(self, monkeypatch):
        """Any JSON object = the API spoke (settled Q2): fast-fail."""
        client = _client(max_retries=3)
        session = FakeSession([FakeResp(422, body=b"{}")])
        _wire(monkeypatch, client, session)
        with pytest.raises(LLMRequestError) as ei:
            await client._stream_request({"model": "m"})
        assert session.calls == 1
        assert "structured JSON error body" in str(ei.value)


class TestDedicatedBranchesUnchanged:
    async def test_json_500_still_transport_and_retries(self, monkeypatch):
        """5xx stays transport REGARDLESS of body shape — a structured 500
        must not become a fast-fail request error (Odin's Q1 amendment)."""
        client = _client(max_retries=2)
        session = FakeSession([
            FakeResp(500, body=JSON_ERROR),
            FakeResp(200, sse_lines=TEXT_OK_SSE),
        ])
        _wire(monkeypatch, client, session)
        assert await client._stream_request({"model": "m"}) == "hello"
        assert session.calls == 2

    async def test_html_401_keeps_auth_semantics_clean_text(self, monkeypatch):
        """An HTML-bodied 401 still refreshes + retries the same account
        (control flow bit-exact); only the raised text is descriptor-based."""
        auth = FakeSingleAuth()
        client = _client(max_retries=2, auth=auth)
        session = FakeSession([
            FakeResp(401, body=b"<html>edge login wall</html>"),
            FakeResp(200, sse_lines=TEXT_OK_SSE),
        ])
        _wire(monkeypatch, client, session)
        assert await client._stream_request({"model": "m"}) == "hello"
        assert auth.refreshed == ["tok"]

    async def test_html_401_terminal_message_has_no_markup(self, monkeypatch):
        auth = FakeSingleAuth()

        async def refresh_fails(stale_token=None):
            return False

        auth.force_refresh = refresh_fails
        client = _client(max_retries=1, auth=auth)
        session = FakeSession([FakeResp(401, body=b"<html>denied</html>")])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMAuthError) as ei:
            await client._stream_request({"model": "m"})
        msg = str(ei.value)
        assert "401" in msg
        assert "<html" not in msg.lower()

    async def test_html_429_keeps_quota_semantics_clean_text(self, monkeypatch):
        auth = FakeSingleAuth()
        client = _client(max_retries=1, auth=auth)
        session = FakeSession([
            FakeResp(429, body=HTML_PAGE, headers={"Content-Type": "text/html"}),
        ])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMRateLimitError) as ei:
            await client._stream_request({"model": "m"})
        assert auth.limited is True  # quota marking bit-exact
        msg = str(ei.value)
        assert "429" in msg
        assert "<html" not in msg.lower()


# ---------------------------------------------------------------------------
# Raise-site invariant + bounded read
# ---------------------------------------------------------------------------

class TestRaiseSiteInvariant:
    @pytest.mark.parametrize(
        ("status", "body", "exc_type"),
        [
            (401, b"<html>x</html>", LLMAuthError),
            (429, HTML_PAGE, LLMRateLimitError),
            (500, HTML_PAGE, LLMTransportError),
            (403, HTML_PAGE, LLMTransportError),
            (404, b"<!DOCTYPE html><html>nope</html>", LLMTransportError),
        ],
    )
    async def test_no_raised_message_contains_markup(
        self, monkeypatch, status, body, exc_type
    ):
        auth = FakeSingleAuth()

        async def refresh_fails(stale_token=None):
            return False

        auth.force_refresh = refresh_fails
        client = _client(max_retries=1, auth=auth)
        session = FakeSession([FakeResp(status, body=body)])
        _wire(monkeypatch, client, session)

        with pytest.raises(exc_type) as ei:
            await client._stream_request({"model": "m"})
        msg = str(ei.value).lower()
        assert "<html" not in msg
        assert "<!doctype" not in msg

    async def test_structured_dict_with_html_field_cannot_leak(self, monkeypatch):
        """A dict value smuggling markup is dropped by the field cleaner —
        the invariant holds even for structured bodies."""
        body = json.dumps({"error": {"message": "<html>gotcha</html>"}}).encode()
        client = _client(max_retries=1)
        session = FakeSession([FakeResp(422, body=body)])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMRequestError) as ei:
            await client._stream_request({"model": "m"})
        msg = str(ei.value)
        assert "<html" not in msg.lower()
        assert "structured JSON error body" in msg

    @pytest.mark.parametrize(
        "fragment",
        [
            "evil <html unclosed fragment",
            "evil <!doctype unclosed fragment",
        ],
    )
    async def test_structured_dict_with_unclosed_html_fragment_cannot_leak(
        self, monkeypatch, fragment
    ):
        """Unclosed HTML markers are dropped before an LLMError is raised."""
        body = json.dumps({"error": {"message": fragment}}).encode()
        client = _client(max_retries=1)
        session = FakeSession([FakeResp(422, body=body)])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMRequestError) as ei:
            await client._stream_request({"model": "m"})
        msg = str(ei.value).lower()
        assert "<html" not in msg
        assert "<!doctype" not in msg
        assert "structured json error body" in msg

    async def test_error_body_read_is_bounded(self, monkeypatch):
        client = _client(max_retries=1)
        resp = FakeResp(403, body=b"x" * (_ERROR_BODY_READ_CAP * 3))
        session = FakeSession([resp])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMTransportError) as ei:
            await client._stream_request({"model": "m"})
        assert resp.content.read_sizes == [_ERROR_BODY_READ_CAP, 1]
        assert f"{_ERROR_BODY_READ_CAP} bytes" in str(ei.value)

    async def test_hostile_content_type_never_reaches_message(self, monkeypatch):
        """The Content-Type header is upstream-controlled bytes: markup,
        mentions, and oversized junk must token-validate to 'unknown'
        (round-1 review blocker)."""
        client = _client(max_retries=1)
        hostile = "text/html<html>@everyone " + "x" * 5000
        session = FakeSession([
            FakeResp(403, body=b"junk", headers={"Content-Type": hostile}),
        ])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMTransportError) as ei:
            await client._stream_request({"model": "m"})
        msg = str(ei.value)
        assert "non-JSON error body (unknown, 4 bytes)" in msg
        assert "<html" not in msg.lower()
        assert "@everyone" not in msg
        assert len(msg) < 300


class TestStreamErrorEventSanitized:
    """SSE terminal events are upstream-controlled dicts: their fields get
    the same bounded known-field treatment as HTTP bodies — classification
    and ``.code`` semantics ride the parsed attributes, never the message
    (round-1 review blocker)."""

    def _sse(self, event: dict) -> list[str]:
        return [f"data: {json.dumps(event)}\n"]

    async def test_transport_class_event_message_sanitized(self, monkeypatch):
        client = _client(max_retries=1)
        event = {
            "type": "response.failed",
            "response": {"error": {
                "type": "weird_failure",
                "message": "<html><body>@everyone attack</body></html>",
            }},
        }
        session = FakeSession([FakeResp(200, sse_lines=self._sse(event))])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMTransportError) as ei:
            await client._stream_request({"model": "m"})
        msg = str(ei.value)
        assert "weird_failure" in msg  # sanitized known field survives
        assert "<html" not in msg.lower()
        assert "@everyone" not in msg
        assert '"response"' not in msg  # no raw event dump

    async def test_capacity_message_uses_sanitized_fields_not_raw_attributes(
        self, monkeypatch
    ):
        """Classification keeps the raw structured attributes, but the raised
        capacity message must use the separately sanitized field rendering."""
        client = _client(max_retries=3)
        raw_code = "<script>@everyone attack</script>"
        event = {
            "type": "error",
            "error": {
                "type": "server_error",
                "code": raw_code,
                "message": "Capacity is temporarily unavailable",
            },
        }
        session = FakeSession([FakeResp(200, sse_lines=self._sse(event))])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMCapacityError) as ei:
            await client._stream_request({"model": "m"})
        assert session.calls == 1
        assert ei.value.code is None  # LLMCapacityError .code semantics unchanged
        msg = str(ei.value)
        assert "server_error" in msg
        assert "<script" not in msg.lower()
        assert "@everyone" not in msg
        assert "attack" not in msg

    async def test_request_class_event_keeps_code_with_clean_message(self, monkeypatch):
        client = _client(max_retries=3)
        event = {
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "code": "context_length_exceeded",
                "message": "<html>hidden page</html>",
            },
        }
        session = FakeSession([FakeResp(200, sse_lines=self._sse(event))])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMRequestError) as ei:
            await client._stream_request({"model": "m"})
        assert session.calls == 1  # fast-fail semantics unchanged
        assert ei.value.code == "context_length_exceeded"  # .code unchanged
        msg = str(ei.value)
        assert "invalid_request_error" in msg
        assert "<html" not in msg.lower()

    async def test_unstructured_event_gets_placeholder(self, monkeypatch):
        client = _client(max_retries=1)
        event = {"type": "response.failed", "response": {"error": "just a string"}}
        session = FakeSession([FakeResp(200, sse_lines=self._sse(event))])
        _wire(monkeypatch, client, session)

        with pytest.raises(LLMTransportError) as ei:
            await client._stream_request({"model": "m"})
        assert "unstructured stream error event" in str(ei.value)


# ---------------------------------------------------------------------------
# Helper units
# ---------------------------------------------------------------------------

class TestParseStructuredError:
    def test_shapes(self):
        assert _parse_structured_error("") is None
        assert _parse_structured_error("   \n ") is None
        assert _parse_structured_error("<html>x") is None
        assert _parse_structured_error("[1, 2]") is None
        assert _parse_structured_error('"just a string"') is None
        assert _parse_structured_error("{}") == {}
        assert _parse_structured_error('{"error": {"code": "x"}}') == {"error": {"code": "x"}}


class TestSafeMime:
    def test_valid_tokens_pass(self):
        from src.llm.openai_codex import _safe_mime

        assert _safe_mime("text/html; charset=utf-8") == "text/html"
        assert _safe_mime("Application/JSON") == "application/json"
        assert _safe_mime("application/problem+json") == "application/problem+json"

    def test_hostile_or_malformed_render_unknown(self):
        from src.llm.openai_codex import _safe_mime

        assert _safe_mime(None) == "unknown"
        assert _safe_mime("") == "unknown"
        assert _safe_mime("text/html<html>@everyone") == "unknown"
        assert _safe_mime("no-slash") == "unknown"
        assert _safe_mime("a/b/c") == "unknown"
        assert _safe_mime("text/" + "x" * 100) == "unknown"
        assert _safe_mime("text html/weird space") == "unknown"
        assert _safe_mime("text/") == "unknown"
        assert _safe_mime("/html") == "unknown"
        assert _safe_mime("tëxt/html") == "unknown"

    def test_token_shaped_secret_renders_unknown(self):
        from src.llm.openai_codex import _safe_mime

        secret = "sk-" + "A" * 32
        assert len(f"application/{secret}") <= 64
        assert _safe_mime(f"application/{secret}") == "unknown"
        assert _safe_mime(f"application/{secret.upper()}") == "unknown"


class TestDescribeErrorBody:
    def test_non_structured_shape_only(self):
        out = _describe_error_body("text/html; charset=utf-8", b"x" * 8437, None)
        assert out == "non-JSON error body (text/html, 8437 bytes)"

    def test_missing_content_type(self):
        assert _describe_error_body(None, b"zz", None) == "non-JSON error body (unknown, 2 bytes)"

    def test_structured_field_mentions_neutralized(self):
        structured = {"error": {"message": "notify @everyone now"}}
        out = _describe_error_body(None, b"{}", structured)
        assert "@everyone" not in out
        assert "everyone" in out

    def test_structured_extracts_and_dedupes_fields(self):
        structured = {
            "error": {"message": "boom", "type": "server_error", "code": "boom"},
            "detail": "boom",
        }
        out = _describe_error_body("application/json", b"{}", structured)
        assert out == "boom; server_error"

    def test_structured_control_chars_stripped_and_bounded(self):
        structured = {"error": {"message": "a\x00b\x1fc" + "d" * 500}}
        out = _describe_error_body(None, b"{}", structured)
        assert out.startswith("abc")
        assert "\x00" not in out and "\x1f" not in out
        assert len(out) <= 400

    def test_structured_without_known_fields(self):
        assert _describe_error_body(None, b"{}", {"weird": 1}) == "structured JSON error body"
