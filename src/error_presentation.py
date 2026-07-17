"""User-facing exception presentation — the single formatter for error text
that reaches an end user.

Two boundaries consume this today: Discord chat (``intake_pipeline``'s
catch-all and outer handlers) and WebUI chat (the WebSocket ``chat_error``
path). Neither Discord nor Web owns the policy, so it lives here.

The formatter is total and non-throwing (any internal failure falls back to
the exception type name) and its output is bounded, HTML-free,
control-character-free, mention-safe, and secret-scrubbed. It never renders
``discord.HTTPException`` bodies: ``str(exc)``/``.text`` carry the raw HTTP
response, and Discord 500s are whole Cloudflare HTML pages (the 2026-07-16
incident dumped them into chat verbatim). Full diagnostics stay in the
journal via ``exc_info`` at the call sites.
"""

from __future__ import annotations

import unicodedata

import discord

from .llm.secret_scrubber import scrub_output_secrets

_HTML_MARKERS = ("<html", "<!doctype")


def _clean_detail(detail: str) -> str:
    """Shared normalization for ANY exception-derived text fragment.

    Every fragment that can carry upstream-controlled bytes — ``str(exc)``
    first lines and HTTP ``response.reason`` phrases alike — must pass
    through here before reaching a user: category-C strip (C0, DEL, C1,
    format chars; tab deliberately retained — a plain ``ch >= " "`` check
    lets U+007F and U+0080..U+009F through), HTML-page fragments dropped,
    mass mentions neutralized with a zero-width space, and secrets scrubbed
    (exception text can echo connection strings and keys — scrubbing inside
    the formatter means no boundary can forget to).
    """
    detail = "".join(
        ch for ch in detail if ch == "\t" or not unicodedata.category(ch).startswith("C")
    )
    if any(m in detail.lower() for m in _HTML_MARKERS):
        return ""
    detail = detail.replace("@everyone", "@\u200beveryone").replace("@here", "@\u200bhere")
    detail = scrub_output_secrets(detail)
    return detail.strip()


def format_user_facing_error(exc: BaseException, limit: int = 200) -> str:
    """Bounded one-line exception summary safe to show an end user.

    ``discord.HTTPException`` renders structured fields only — the reason
    phrase is upstream-controlled text, so it goes through the SAME
    ``_clean_detail`` normalization as generic detail, and a non-int
    ``status`` renders as ``?``.
    """
    name = type(exc).__name__
    try:
        if isinstance(exc, discord.HTTPException):
            status = getattr(exc, "status", None)
            status_s = str(status) if isinstance(status, int) else "?"
            reason = _clean_detail(
                str(getattr(getattr(exc, "response", None), "reason", "") or "")
            )
            return f"Discord API error: HTTP {status_s} {reason}".strip()[:limit]
        try:
            text = str(exc)
        except Exception:
            text = ""
        lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
        detail = _clean_detail(lines[0] if lines else "")
        out = f"{name}: {detail}" if detail else name
        return out[:limit]
    except Exception:
        return name
