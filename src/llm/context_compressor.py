"""Context auto-compression with prompt caching support.

Manages context growth during multi-iteration tool loops by:
1. Tracking the static prefix (system prompt + initial history) for
   cache-friendly prompt construction — when the prefix stays identical
   across consecutive calls, LLM providers can reuse KV-cache computations.
2. Compressing older tool iterations when context exceeds a character budget.
3. Providing observability into compression events and cache efficiency.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

from ..odin_log import get_logger

log = get_logger("context_compressor")

DEFAULT_MAX_CONTEXT_CHARS = 48_000
DEFAULT_KEEP_RECENT = 3
COMPRESSED_ITERATION_MAX_CHARS = 120


@dataclass
class CompressionStats:
    """Observable counters for context compression and prefix caching."""

    compressions: int = 0
    iterations_compressed: int = 0
    chars_saved: int = 0
    prefix_hits: int = 0
    prefix_misses: int = 0
    total_checks: int = 0

    def as_dict(self) -> dict:
        return {
            "compressions": self.compressions,
            "iterations_compressed": self.iterations_compressed,
            "chars_saved": self.chars_saved,
            "prefix_hits": self.prefix_hits,
            "prefix_misses": self.prefix_misses,
            "total_checks": self.total_checks,
            "prefix_hit_rate": (
                round(self.prefix_hits / self.total_checks, 3)
                if self.total_checks > 0
                else 0.0
            ),
        }


class PrefixTracker:
    """Tracks static prefix stability across consecutive LLM calls.

    During a tool loop, the system prompt and initial history should stay
    identical across iterations.  When they do, LLM providers can cache
    the KV computation for that prefix, reducing latency and cost.

    Call :meth:`check` before each LLM call with the system prompt and
    the non-tool-iteration prefix messages.  Returns *True* when the
    prefix matches the previous call (a provider-side "cache hit").
    """

    __slots__ = ("_last_hash", "_stats")

    def __init__(self, stats: CompressionStats | None = None) -> None:
        self._last_hash: str = ""
        self._stats = stats or CompressionStats()

    @property
    def stats(self) -> CompressionStats:
        return self._stats

    def check(self, system: str, prefix_messages: list[dict]) -> bool:
        """Return *True* if prefix matches the previous call (cache hit).

        The very first call always returns *False* (nothing to compare).
        """
        h = _hash_prefix(system, prefix_messages)
        self._stats.total_checks += 1
        if self._last_hash and h == self._last_hash:
            self._stats.prefix_hits += 1
            return True
        if self._stats.total_checks > 1:
            self._stats.prefix_misses += 1
        self._last_hash = h
        return False

    def reset(self) -> None:
        """Clear stored hash (e.g. between separate tool loops)."""
        self._last_hash = ""


def _hash_prefix(system: str, messages: list[dict]) -> str:
    """Deterministic hash of system prompt + message list."""
    h = hashlib.sha256()
    h.update(system.encode("utf-8", errors="replace"))
    for msg in messages:
        h.update(msg.get("role", "").encode())
        content = msg.get("content", "")
        if isinstance(content, str):
            h.update(content.encode("utf-8", errors="replace"))
        else:
            h.update(
                json.dumps(content, sort_keys=True, default=str).encode()
            )
    return h.hexdigest()[:16]


# ------------------------------------------------------------------
# Message classification helpers
# ------------------------------------------------------------------

def _is_tool_message(msg: dict) -> bool:
    """True if a message contains tool_use or tool_result content blocks."""
    content = msg.get("content")
    if not isinstance(content, list):
        return False
    return any(
        isinstance(b, dict) and b.get("type") in ("tool_use", "tool_result")
        for b in content
    )


def _is_tool_use_message(msg: dict) -> bool:
    content = msg.get("content")
    if not isinstance(content, list):
        return False
    return any(
        isinstance(b, dict) and b.get("type") == "tool_use"
        for b in content
    )


def _is_tool_result_message(msg: dict) -> bool:
    content = msg.get("content")
    if not isinstance(content, list):
        return False
    return any(
        isinstance(b, dict) and b.get("type") == "tool_result"
        for b in content
    )


# ------------------------------------------------------------------
# Prefix / iteration splitting
# ------------------------------------------------------------------

def split_prefix_and_iterations(
    messages: list[dict],
) -> tuple[list[dict], list[list[dict]]]:
    """Split messages into the stable prefix and tool iteration groups.

    The prefix is every message before the first tool_use / tool_result
    block.  Iterations are grouped so that each group starts with a
    tool_use message and includes subsequent messages until the next
    tool_use message (typically one tool_use + one tool_result per group,
    but multi-tool iterations are kept together).
    """
    prefix_end = len(messages)
    for i, msg in enumerate(messages):
        if _is_tool_message(msg):
            prefix_end = i
            break

    prefix = messages[:prefix_end]
    remaining = messages[prefix_end:]

    if not remaining:
        return prefix, []

    iterations: list[list[dict]] = []
    current: list[dict] = []

    for msg in remaining:
        if _is_tool_use_message(msg) and current:
            iterations.append(current)
            current = [msg]
        else:
            current.append(msg)

    if current:
        iterations.append(current)

    return prefix, iterations


# ------------------------------------------------------------------
# Character estimation
# ------------------------------------------------------------------

def estimate_message_chars(messages: list[dict]) -> int:
    """Estimate total character payload across a message list."""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            total += len(content)
        elif isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                for key in ("text", "content", "input", "arguments"):
                    val = block.get(key)
                    if val is None:
                        continue
                    if isinstance(val, str):
                        total += len(val)
                    elif isinstance(val, dict):
                        total += len(json.dumps(val, default=str))
        total += len(msg.get("role", ""))
    return total


# ------------------------------------------------------------------
# Iteration summarisation (local, no LLM call)
# ------------------------------------------------------------------

_ERROR_PREFIXES = (
    "Error", "error", "ERROR", "Command failed", "Timeout",
    "Permission denied", "Unknown tool",
)


def summarize_iteration(iteration: list[dict]) -> str:
    """Produce a compact ``tool_name→OK/ERR`` summary for one iteration."""
    tool_names: list[str] = []
    outcomes: list[str] = []

    for msg in iteration:
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type", "")
            if btype == "tool_use":
                tool_names.append(block.get("name", "?"))
            elif btype == "tool_result":
                result = block.get("content", "")
                if isinstance(result, list):
                    result = " ".join(
                        b.get("text", "")
                        for b in result
                        if isinstance(b, dict) and b.get("type") == "text"
                    )
                elif not isinstance(result, str):
                    result = str(result)
                if result.startswith(_ERROR_PREFIXES):
                    outcomes.append("ERR")
                else:
                    outcomes.append("OK")

    parts = []
    for i, name in enumerate(tool_names):
        outcome = outcomes[i] if i < len(outcomes) else "?"
        parts.append(f"{name}\u2192{outcome}")

    summary = ", ".join(parts)
    if len(summary) > COMPRESSED_ITERATION_MAX_CHARS:
        summary = summary[: COMPRESSED_ITERATION_MAX_CHARS - 3] + "..."
    return summary


# ------------------------------------------------------------------
# Main compression entry point
# ------------------------------------------------------------------

def compress_tool_context(
    messages: list[dict],
    *,
    max_context_chars: int = DEFAULT_MAX_CONTEXT_CHARS,
    keep_recent: int = DEFAULT_KEEP_RECENT,
    stats: CompressionStats | None = None,
) -> tuple[list[dict], int]:
    """Compress older tool iterations when context exceeds *max_context_chars*.

    During a tool loop, messages accumulate with each iteration::

        [history…] [user msg] [tool_use₁ tool_result₁] [tool_use₂ tool_result₂] …

    When total chars exceed *max_context_chars*, this function:

    1. Splits messages into prefix (history) and tool iterations.
    2. Keeps the most recent *keep_recent* iterations intact.
    3. Replaces older iterations with a single compact summary message.

    The prefix is **never modified** — this preserves the static prefix
    that LLM providers can cache across iterations.

    Args:
        messages: Current message list (**not** modified in-place).
        max_context_chars: Trigger compression above this threshold.
        keep_recent: Number of recent iterations to preserve verbatim.
        stats: Optional :class:`CompressionStats` to update.

    Returns:
        ``(compressed_messages, iterations_compressed)``
    """
    total_chars = estimate_message_chars(messages)
    if total_chars <= max_context_chars:
        return messages, 0

    prefix, iterations = split_prefix_and_iterations(messages)

    if len(iterations) <= keep_recent:
        return messages, 0

    to_compress = iterations[:-keep_recent]
    to_keep = iterations[-keep_recent:]

    summaries = [summarize_iteration(it) for it in to_compress]
    summary_text = "[Earlier tool calls: " + "; ".join(summaries) + "]"

    summary_msg: dict = {"role": "user", "content": summary_text}

    result = list(prefix) + [summary_msg]
    for iteration in to_keep:
        result.extend(iteration)

    new_chars = estimate_message_chars(result)
    chars_saved = total_chars - new_chars
    compressed_count = len(to_compress)

    if stats:
        stats.compressions += 1
        stats.iterations_compressed += compressed_count
        stats.chars_saved += max(0, chars_saved)

    log.info(
        "Compressed %d tool iterations: %d → %d chars (saved %d)",
        compressed_count,
        total_chars,
        new_chars,
        chars_saved,
    )

    return result, compressed_count
