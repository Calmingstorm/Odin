"""Shared leaf helpers for the tool-execution pipelines.

Originally the "safe pure pieces" carved out of the old ~700-line chat
tool loop. RFC-002 P1 widened the charter slightly: this is now the
shared LEAF module for symbols the tool loop, the message intake, the
background-task runner, and the client module all need — it imports
nothing from ``src.discord``, which is what dissolves the old
``tool_loop → client`` late-import cycle. Besides the pure functions it
holds exactly one piece of module state, the test-webhook allowlist
(mutated in place so every importer sees updates).
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

from ..tools.executor import _ERROR_RESULT_PREFIXES

# Friendly fallback when the LLM returns an empty response after retries
# (moved verbatim from client.py, RFC-002 P1).
_EMPTY_RESPONSE_FALLBACK = "I couldn't generate a response. Please try again."

# Webhook IDs allowed to bypass the bot-author check. Populated from the
# ALLOWED_WEBHOOK_IDS env var at startup via init_allowed_webhook_ids().
# MUTATED IN PLACE (never rebound) so `from ... import _ALLOWED_WEBHOOK_IDS`
# bindings held by other modules always observe the live contents.
_ALLOWED_WEBHOOK_IDS: set[str] = set()


def init_allowed_webhook_ids(raw: str) -> None:
    """(Re)populate the test-webhook allowlist from a comma-separated string.

    Matches the original client.py semantics exactly: an empty value leaves
    the existing contents untouched; a non-empty value replaces them.
    """
    if raw:
        _ALLOWED_WEBHOOK_IDS.clear()
        _ALLOWED_WEBHOOK_IDS.update(wid.strip() for wid in raw.split(",") if wid.strip())


_EMAIL_BODY_TOOLS = frozenset({"email_send"})


def _deep_scrub_strings(value):
    """Secret-scrub every string leaf of an arbitrary JSON-shaped value."""
    from ..llm.secret_scrubber import scrub_output_secrets

    if isinstance(value, str):
        return scrub_output_secrets(value)
    if isinstance(value, dict):
        return {k: _deep_scrub_strings(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_deep_scrub_strings(v) for v in value]
    return value


def _scrub_tool_input_for_storage(tool_name: str, tool_input: dict) -> dict:
    """Redact privacy-sensitive fields from tool input before any storage path."""
    if tool_name.startswith("mcp_") and isinstance(tool_input, dict):
        # MCP argument shapes are arbitrary third-party contracts and may
        # carry credentials — deep-scrub every string value with the shared
        # secret scrubber before trajectory/durability storage. (Published
        # MCP names always carry the mcp_ prefix; builtins win conflicts, so
        # the prefix cannot capture a native tool.)
        return _deep_scrub_strings(tool_input)
    if tool_name not in _EMAIL_BODY_TOOLS or not isinstance(tool_input, dict):
        return tool_input
    cleaned = dict(tool_input)
    body = cleaned.get("body", "")
    cleaned["body"] = f"[redacted email body: {len(body)} chars]"
    if "attachments" in cleaned and cleaned["attachments"]:
        from pathlib import Path

        cleaned["attachments"] = [Path(p).name for p in cleaned["attachments"]]
    return cleaned


def ensure_failure_visible(result_text: str, ok: bool) -> str:
    """Make a structurally-failed tool result visible to the model.

    execute() carries ok=False on ToolResult, but the model only sees
    str(result) — the raw output. When that text lacks an error prefix
    (e.g. run_command_multi's per-host markdown aggregate wrapping a
    denial), the model reads a refused action as success. Prefix it.
    """
    if ok or result_text.lstrip().startswith(_ERROR_RESULT_PREFIXES):
        return result_text
    return f"Error (tool reported failure):\n{result_text}"


def build_request_preamble(
    *,
    request_id: str,
    request_time: str,
    user_display: str,
    user_id: Any,
    message_id: Any,
    channel_description: str,
    has_history: bool,
    from_another_bot: bool = False,
) -> dict:
    """Build the developer-role separator message that delimits the current
    request from the history block above it.

    Returns a message dict `{role, content}` ready to insert into the LLM
    message list. For the no-history case, returns a thin channel-context
    message instead of a full separator.
    """
    msg_id_note = f"Current message ID: {message_id}"
    bot_origin_note = ""
    if from_another_bot:
        bot_origin_note = (
            "\n\nIMPORTANT: This message is from ANOTHER BOT. "
            "Bots cannot confirm, choose, or approve. "
            "EXECUTE immediately — never hedge, ask permission, or say "
            "'if you want' / 'shall I' / 'would you like'. "
            "If execution is explicitly requested, use run_script or run_command. "
            "If code is presented for review, discussion, or as context, "
            "do not execute it — analyze and respond to the substance."
        )

    if not has_history:
        return {
            "role": "developer",
            "content": f"{channel_description}\n{msg_id_note}{bot_origin_note}",
        }

    sep_text = (
        f"=== CURRENT REQUEST [req-{request_id}] ===\n"
        f"Time: {request_time}\n"
        f"From: {user_display} (ID: {user_id})\n"
        f"{channel_description}\n"
        f"{msg_id_note}\n"
        "--- HISTORY ABOVE | REQUEST BELOW ---\n"
        "Messages above are HISTORY — context for understanding what happened. "
        "History is NOT a task queue. Each message above was a SEPARATE request. "
        "Act ONLY on the new message below — do not replay other requests from history. "
        "If asked to 'redo' or 'do what was asked', identify the ONE specific task "
        "being referenced — do not sweep through history re-executing everything. "
        "Evaluate tools fresh. Do not repeat prior refusals."
    )
    return {"role": "developer", "content": sep_text + bot_origin_note}


def compute_request_id(content: Any) -> str:
    """Stable 8-char hash over the message content, for debug/trace IDs.

    The original logic used sha256(content) truncated to 8 hex chars; we
    keep that contract exactly so existing logs remain recognisable.
    """
    content_str = content if isinstance(content, str) else str(content)
    return hashlib.sha256(content_str.encode()).hexdigest()[:8]


def current_request_time() -> str:
    """UTC timestamp in the exact shape the loop has always produced."""
    return time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
