"""Scrub diagnostic copies without changing execution payloads."""
from __future__ import annotations

import json
import re
from typing import Any

from ..llm.secret_scrubber import scrub_output_secrets

_SENSITIVE_KEY = re.compile(
    r"(?:^|[_-])(?:password|passwd|secret|token|authorization|cookie|api.?key|private.?key)$",
    re.I,
)
_ASSIGNMENT = re.compile(
    r'''(?i)(["']?(?:password|passwd|secret|token|access_token|refresh_token|api[_-]?key)'''
    r'''["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)'''
)
_BEARER = re.compile(r"(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+")
_PRIVATE_KEY = re.compile(
    r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----.*?-----END (?:[A-Z]+ )?PRIVATE KEY-----",
    re.S,
)


def safe_text(value: Any, *, limit: int = 1000) -> str:
    """Scrub before truncating, including JSON assignments and credential carriers."""
    text = str(value)
    text = _PRIVATE_KEY.sub("[REDACTED]", text)
    text = _BEARER.sub("[REDACTED]", text)
    text = _ASSIGNMENT.sub(lambda match: match[1] + "[REDACTED]", text)
    text = scrub_output_secrets(text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", text)
    if len(text) > limit:
        return text[:max(0, limit - 14)] + "...[truncated]"
    return text


def safe_error(error: Any, *, context: str = "", limit: int = 700) -> str:
    """A bounded structured descriptor safe to send to any diagnostic sink."""
    record = {
        "kind": type(error).__name__ if isinstance(error, BaseException) else "upstream_error",
        "context": safe_text(context, limit=80),
        "message": safe_text(error, limit=max(0, (limit - 180) // 6)),
    }
    return json.dumps(record, ensure_ascii=True)


def command_display(command: str) -> str:
    """Intentionally omit shell bodies, even when no known secret is detected."""
    if re.fullmatch(r"<shell command: [0-9]{1,20} bytes>", command):
        return command
    return f"<shell command: {len(command.encode('utf-8', errors='replace'))} bytes>"


def scrub_diagnostic(value: Any, *, depth: int = 0) -> Any:
    """Independent defense for structured audit/API copies, never execution input."""
    if depth > 30:
        return "[omitted: nesting limit]"
    if isinstance(value, dict):
        return {
            safe_text(key, limit=200): (
                "[REDACTED]" if _SENSITIVE_KEY.search(
                    re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(key)),
                )
                else command_display(item) if str(key) in {"command", "script"}
                and isinstance(item, str)
                else scrub_diagnostic(item, depth=depth + 1)
            )
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [scrub_diagnostic(item, depth=depth + 1) for item in value]
    if isinstance(value, str):
        return safe_text(value, limit=len(value))
    return value
