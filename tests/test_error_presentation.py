"""Pins for the shared user-facing error formatter (src/error_presentation.py).

Extracted from intake_pipeline when the WebSocket chat error path became the
second user-facing boundary (previously it sent raw ``str(e)`` to the WebUI).
Output contract: bounded, HTML-free, control-character-free, mention-safe,
and secret-scrubbed; ``discord.HTTPException`` renders structured fields only
(its ``str()``/``.text`` carry raw HTTP bodies — the 2026-07-16 incident
dumped whole Cloudflare HTML pages into chat that way). Total and
non-throwing: any internal failure falls back to the exception type name.
"""

from __future__ import annotations

from types import SimpleNamespace

import discord
from src.error_presentation import format_user_facing_error

CF_HTML = (
    "<html>\n  <head>\n    <title>Internal Server Error</title>\n  </head>\n"
    "  <body>\n    <h1><p>Internal Server Error</p></h1>\n"
    "  <script>(function(){/* cloudflare challenge boilerplate */})();"
    "</script></body>\n</html>"
)


def _http_500(text: str = CF_HTML) -> discord.HTTPException:
    resp = SimpleNamespace(status=500, reason="Internal Server Error")
    return discord.HTTPException(resp, text)


def _http_exc_with_reason(reason, status=500):
    resp = SimpleNamespace(status=status, reason=reason)
    return discord.HTTPException(resp, "body")


class _BrokenStrError(Exception):
    def __str__(self):
        raise ValueError("no string for you")


class _RaisingInstanceCheckMeta(type):
    def __instancecheck__(cls, instance):
        raise RuntimeError("isinstance exploded")


class _InstanceCheckBombError(Exception, metaclass=_RaisingInstanceCheckMeta):
    pass


class TestFormatUserFacingError:
    def test_discord_http_exception_never_renders_body(self):
        out = format_user_facing_error(_http_500())
        assert out == "Discord API error: HTTP 500 Internal Server Error"

    def test_generic_html_reduced_to_type_name(self):
        assert format_user_facing_error(RuntimeError(CF_HTML)) == "RuntimeError"

    def test_html_marker_mid_line_reduced_to_type_name(self):
        out = format_user_facing_error(RuntimeError("500 error: <html><body>"))
        assert out == "RuntimeError"

    def test_multiline_keeps_first_line_only(self):
        out = format_user_facing_error(RuntimeError("first line\nsecond line"))
        assert out == "RuntimeError: first line"

    def test_empty_timeout_renders_type_name(self):
        assert format_user_facing_error(TimeoutError()) == "TimeoutError"

    def test_broken_str_falls_back_to_type_name(self):
        assert format_user_facing_error(_BrokenStrError()) == "_BrokenStrError"

    def test_mass_mentions_neutralized(self):
        out = format_user_facing_error(RuntimeError("notify @everyone and @here now"))
        assert "@everyone" not in out
        assert "@here" not in out
        assert "everyone" in out

    def test_control_characters_stripped(self):
        out = format_user_facing_error(RuntimeError("bad\x07\x1bthing"))
        assert "\x07" not in out
        assert "\x1b" not in out
        assert "badthing" in out

    def test_entire_output_is_bounded(self):
        assert len(format_user_facing_error(RuntimeError("y" * 5000))) <= 200


class TestUnicodeControls:
    def test_del_and_c1_controls_stripped(self):
        out = format_user_facing_error(RuntimeError("bad\x7fmid\x9bthing"))
        assert "\x7f" not in out
        assert "\x9b" not in out
        assert "badmidthing" in out

    def test_tab_retained(self):
        assert "a\tb" in format_user_facing_error(RuntimeError("a\tb"))

    def test_format_chars_stripped(self):
        out = format_user_facing_error(RuntimeError("zero\u200bwidth"))
        assert "\u200b" not in out
        assert "zerowidth" in out


class TestFailSafe:
    def test_internal_failure_falls_back_to_type_name(self, monkeypatch):
        import src.error_presentation as ep

        monkeypatch.setattr(ep.discord, "HTTPException", _InstanceCheckBombError)
        assert format_user_facing_error(RuntimeError("boom")) == "RuntimeError"


class TestStructuredReason:
    def test_controls_stripped_from_reason(self):
        out = format_user_facing_error(_http_exc_with_reason("Bad\x9b\x7fReason\x00"))
        assert "\x9b" not in out
        assert "\x7f" not in out
        assert "\x00" not in out
        assert "BadReason" in out

    def test_mentions_neutralized_in_reason(self):
        out = format_user_facing_error(_http_exc_with_reason("notify @everyone and @here"))
        assert "@everyone" not in out
        assert "@here" not in out
        assert "everyone" in out

    def test_format_chars_stripped_from_reason(self):
        out = format_user_facing_error(_http_exc_with_reason("zero\u200bwidth"))
        assert "\u200b" not in out
        assert "zerowidth" in out

    def test_html_reason_dropped_status_kept(self):
        out = format_user_facing_error(_http_exc_with_reason("<html>oops</html>"))
        assert out == "Discord API error: HTTP 500"

    def test_non_int_status_rendered_safely(self):
        out = format_user_facing_error(
            _http_exc_with_reason("Internal Server Error", status="@everyone 500")
        )
        assert "@everyone" not in out
        assert "HTTP ?" in out


class TestSecretScrubbing:
    """The WS path previously scrubbed str(e) itself; the shared formatter
    must scrub internally so no boundary can regress secret protection."""

    def test_generic_detail_is_scrubbed(self):
        out = format_user_facing_error(RuntimeError("auth failed for sk-" + "a" * 24))
        assert "sk-" + "a" * 24 not in out
        assert "[REDACTED]" in out

    def test_reason_phrase_is_scrubbed(self):
        out = format_user_facing_error(
            _http_exc_with_reason("rejected api_key=abcdef0123456789")
        )
        assert "abcdef0123456789" not in out
        assert "[REDACTED]" in out
