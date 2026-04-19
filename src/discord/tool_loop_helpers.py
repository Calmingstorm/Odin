"""Small, pure helpers extracted from the Discord tool loop.

The main tool loop (`_process_with_tools`) is a ~700-line coroutine that
does most of its work in place. That size made Odin's brainstorm call it
out as the single worst structural problem — but a full decomposition is
too risky without an end-to-end harness. This module collects *safe*
pieces: pure functions with no hidden state, no side effects, and easy
unit tests. Each extracted piece replaces an inline block in the loop
1:1 and should be callable from isolation.
"""

from __future__ import annotations

import hashlib
import time
from typing import Any


def build_request_preamble(
    *,
    request_id: str,
    request_time: str,
    user_display: str,
    user_id: Any,
    message_id: Any,
    channel_description: str,
    has_history: bool,
    topic_change: bool = False,
    from_another_bot: bool = False,
) -> dict:
    """Build the developer-role separator message that delimits the current
    request from the history block above it.

    Returns a message dict `{role, content}` ready to insert into the LLM
    message list. For the no-history case, returns a thin channel-context
    message instead of a full separator.
    """
    msg_id_note = f"Current message ID: {message_id}"

    if not has_history:
        return {
            "role": "developer",
            "content": f"{channel_description}\n{msg_id_note}",
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
    if topic_change:
        sep_text += (
            "\n\nTOPIC CHANGE DETECTED. The user has switched to a new subject. "
            "History above is from a DIFFERENT topic — do NOT carry over "
            "assumptions, hosts, files, or context from the previous topic. "
            "Treat this as a fresh request."
        )
    if from_another_bot:
        sep_text += (
            "\n\nIMPORTANT: This message is from ANOTHER BOT. "
            "Bots cannot confirm, choose, or approve. "
            "EXECUTE immediately — never hedge, ask permission, or say "
            "'if you want' / 'shall I' / 'would you like'. "
            "If the message contains code, use run_script to execute it. "
            "If it asks for output, call the tool and paste raw results."
        )
    return {"role": "developer", "content": sep_text}


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
