"""Shared helpers for the web API handlers (RFC-003 P1).

Moved verbatim from ``api.py`` — the single home for cross-domain helpers
so the coming domain carve cannot fork copies (the RFC-001 lesson). The
``api`` module re-imports every name, so existing import paths and patch
targets keep working.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml
from aiohttp import web

from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger
from ..setup_wizard import write_env_file

log = get_logger("web.api")

# Sensitive config fields that should be redacted in API responses (exact
# names kept for backward-compat / clarity).
_SENSITIVE_FIELDS = frozenset({
    "token", "api_token", "secret", "ssh_key_path", "credentials_path",
    "api_key", "password", "hmac_key",
})

# Substrings that mark a key as sensitive regardless of its exact name. Key-name
# EXACT matching missed fields like `hmac_key`, `webhook_url`, `*_secret`, and
# `app_password`, leaking them (or future additions) through GET /api/config.
_SENSITIVE_KEY_SUBSTRINGS = (
    "token", "secret", "password", "api_key", "apikey",
    "hmac", "webhook_url", "webhook_urls", "private_key", "credential",
)


def _is_sensitive_key(key: str) -> bool:
    if key in _SENSITIVE_FIELDS:
        return True
    kl = key.lower()
    return any(s in kl for s in _SENSITIVE_KEY_SUBSTRINGS)


# Input validation limits
_MAX_NAME_LEN = 100
_MAX_CODE_LEN = 50_000
_MAX_CONTENT_LEN = 500_000
_MAX_GOAL_LEN = 2000
_MAX_DESCRIPTION_LEN = 500


def _validate_string(value: str, field: str, max_len: int) -> str | None:
    """Validate a string field. Returns error message or None."""
    if len(value) > max_len:
        return f"{field} exceeds maximum length ({max_len} chars)"
    return None


# Regex: keep only ASCII alphanumeric, hyphen, underscore, period
_SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9_.\-]")


def _safe_filename(name: str, max_len: int = 80) -> str:
    """Sanitize a string for use in Content-Disposition filename."""
    return _SAFE_FILENAME_RE.sub("_", name)[:max_len] or "export"


# Caller-supplied chat session ids: opt-in, validated, and namespaced UNDER the
# authenticated identity so one token can never address another token's history.
# The charset is filename-safe (no path separators / control / whitespace) because
# a channel id becomes a persisted session filename.
_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def _scoped_chat_channel(user_id: str, session_id: str) -> str:
    """Internal channel id for an authorized caller chat session. The
    'web:{user}:session:' prefix keeps it owner-scoped and discoverable."""
    return f"web:{user_id}:session:{session_id}"


def _sanitize_error(msg: str) -> str:
    """Scrub secrets from error messages before returning to clients."""
    return scrub_output_secrets(str(msg))


def _safe_int_param(
    request: web.Request, name: str, default: int, lo: int = 1, hi: int = 500
) -> int:
    """Parse an integer query parameter, clamping to [lo, hi]. Falls back to *default*."""
    raw = request.query.get(name)
    if raw is None:
        return min(max(default, lo), hi)
    try:
        return min(max(int(raw), lo), hi)
    except (ValueError, TypeError):
        return min(max(default, lo), hi)


def _contains_blocked_fields(d: dict, blocked: frozenset[str], *, _depth: int = 0) -> bool:
    """Recursively check if any keys in *d* are in *blocked*."""
    if _depth > 10:
        return False
    for key, value in d.items():
        if key in blocked:
            return True
        if isinstance(value, dict) and _contains_blocked_fields(value, blocked, _depth=_depth + 1):
            return True
    return False


def _deep_merge(base: dict, updates: dict, *, _depth: int = 0) -> None:
    """Recursively merge *updates* into *base* in-place."""
    if _depth > 10:
        return
    for key, value in updates.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value, _depth=_depth + 1)
        else:
            base[key] = value


def _redact_config(obj: Any, *, _depth: int = 0) -> Any:
    """Recursively redact sensitive fields from config dicts."""
    if _depth > 10:
        return "..."
    if isinstance(obj, dict):
        return {
            k: "••••••••" if _is_sensitive_key(k) and isinstance(v, str) and v
            else _redact_config(v, _depth=_depth + 1)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact_config(v, _depth=_depth + 1) for v in obj]
    return obj


def _write_config(path: Path, data: dict) -> None:
    """Write config dict to YAML file."""
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False)


def _write_env_file(path: Path, content: str) -> None:
    """Write .env file with restricted permissions.

    Delegates to the shared ``write_env_file`` from ``setup_wizard``.
    """
    write_env_file(path, content)
