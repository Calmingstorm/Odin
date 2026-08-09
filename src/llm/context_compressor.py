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
from dataclasses import dataclass

from ..odin_log import get_logger

log = get_logger("context_compressor")

DEFAULT_MAX_CONTEXT_CHARS = 750_000
DEFAULT_KEEP_RECENT = 30
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
    """True if a message contains tool_use or tool_result content blocks,
    or agent-style string tool result messages."""
    content = msg.get("content")
    if isinstance(content, list):
        return any(
            isinstance(b, dict) and b.get("type") in ("tool_use", "tool_result")
            for b in content
        )
    if isinstance(content, str) and content.startswith("[Tool result:"):
        return True
    return False


def _is_tool_use_message(msg: dict) -> bool:
    content = msg.get("content")
    if isinstance(content, list):
        return any(
            isinstance(b, dict) and b.get("type") == "tool_use"
            for b in content
        )
    return False


def _is_tool_result_message(msg: dict) -> bool:
    content = msg.get("content")
    if isinstance(content, list):
        return any(
            isinstance(b, dict) and b.get("type") == "tool_result"
            for b in content
        )
    if isinstance(content, str) and content.startswith("[Tool result:"):
        return True
    return False


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
        # Agent-style: assistant message followed by [Tool result:] is the
        # start of a tool iteration
        if msg.get("role") == "assistant" and i + 1 < len(messages):
            next_msg = messages[i + 1]
            if _is_tool_result_message(next_msg):
                prefix_end = i
                break

    prefix = messages[:prefix_end]
    remaining = messages[prefix_end:]

    if not remaining:
        return prefix, []

    iterations: list[list[dict]] = []
    current: list[dict] = []

    for msg in remaining:
        # Start new iteration on structured tool_use or agent-style assistant
        # message that begins a tool call cycle
        is_boundary = _is_tool_use_message(msg)
        if not is_boundary and msg.get("role") == "assistant":
            content = msg.get("content", "")
            if isinstance(content, str):
                is_boundary = True
        if is_boundary and current:
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
        # Structured content blocks (main loop format)
        if isinstance(content, list):
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
        # Agent-style string tool results: "[Tool result: tool_name]\n..."
        elif isinstance(content, str) and content.startswith("[Tool result:"):
            # Extract tool name from "[Tool result: tool_name]"
            end = content.find("]")
            if end > 14:
                name = content[14:end].strip()
                tool_names.append(name)
            result_body = content[end + 1:].strip() if end > 0 else content
            if result_body.startswith(_ERROR_PREFIXES):
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
        if chars_saved < 0:
            log.warning("Compression ineffective: added %d chars instead of saving", -chars_saved)
        stats.chars_saved += max(0, chars_saved)

    log.info(
        "Compressed %d tool iterations: %d → %d chars (saved %d)",
        compressed_count,
        total_chars,
        new_chars,
        chars_saved,
    )

    return result, compressed_count


# ------------------------------------------------------------------
# Emergency window-overflow compression (agent recovery path)
# ------------------------------------------------------------------

# One kept iteration may not exceed 1/N of the retained budget: a single
# enormous scrape must never crowd out every other retained iteration.
EMERGENCY_SINGLE_RESULT_SHARE = 3
# Reserved headroom for the emergency summary message itself.
_EMERGENCY_SUMMARY_RESERVE = 2_000
_EMERGENCY_ELISION = "\n...[emergency truncation: {elided} chars elided]...\n"


def _iteration_chars(iteration: list[dict]) -> int:
    return estimate_message_chars(iteration)


def _truncate_iteration(iteration: list[dict], max_chars: int) -> tuple[list[dict], int]:
    """Shrink one iteration under *max_chars* by eliding its largest strings.

    Only string payloads (message content, text/content/input/arguments block
    fields) are shortened, head+tail around an elision marker — tool_use and
    tool_result STRUCTURE is untouched, so call/result pairing stays valid.
    Returns ``(new_iteration, chars_elided)``; the input is not modified.
    """
    import copy

    work = copy.deepcopy(iteration)
    elided_total = 0

    def _strings() -> list[tuple[dict, str, str]]:
        out: list[tuple[dict, str, str]] = []
        for msg in work:
            content = msg.get("content", "")
            if isinstance(content, str):
                out.append((msg, "content", content))
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    for key in ("text", "content", "input", "arguments"):
                        val = block.get(key)
                        if isinstance(val, str):
                            out.append((block, key, val))
        return out

    for _ in range(32):  # bounded: each pass shrinks the largest string
        if _iteration_chars(work) <= max_chars:
            break
        strings = _strings()
        if not strings:
            break
        holder, key, val = max(strings, key=lambda t: len(t[2]))
        overshoot = _iteration_chars(work) - max_chars
        keep = max(len(val) - overshoot - 80, 400)
        if keep >= len(val):
            break
        head = val[: int(keep * 0.7)]
        tail = val[len(val) - int(keep * 0.3):]
        elided = len(val) - len(head) - len(tail)
        holder[key] = head + _EMERGENCY_ELISION.format(elided=elided) + tail
        elided_total += elided
    return work, elided_total


def emergency_compress_for_window(
    messages: list[dict],
    *,
    target_chars: int,
    stats: CompressionStats | None = None,
) -> tuple[list[dict], dict]:
    """Bound the ENTIRE payload under *target_chars* for overflow recovery.

    Unlike :func:`compress_tool_context` (a soft budget whose newest
    ``keep_recent`` iterations are exempt by COUNT), this recovery pass:

    - retains recent iterations dynamically by SIZE, newest first, always
      keeping at least the newest one (truncated if it alone overflows);
    - truncates any single kept iteration larger than its fair share of the
      retained budget (``EMERGENCY_SINGLE_RESULT_SHARE``) so one enormous
      tool result cannot crowd out everything else;
    - summarizes every older iteration with the same local summarizer the
      soft pass uses;
    - never modifies the prefix (the agent task and any parent messages).

    Returns ``(new_messages, report)``. The input list is not modified. When
    the prefix alone exceeds the target the payload cannot be bounded here:
    the original list is returned with ``report["fits"] = False``.
    """
    original_chars = estimate_message_chars(messages)
    prefix, iterations = split_prefix_and_iterations(messages)
    prefix_chars = estimate_message_chars(prefix)

    report: dict = {
        "original_chars": original_chars,
        "prefix_chars": prefix_chars,
        "iterations_total": len(iterations),
        "iterations_kept": 0,
        "iterations_summarized": 0,
        "results_truncated": 0,
        "chars_elided": 0,
        "target_chars": target_chars,
        "fits": False,
    }

    iter_budget = target_chars - prefix_chars - _EMERGENCY_SUMMARY_RESERVE
    if iter_budget <= 0 or not iterations:
        report["compressed_chars"] = original_chars
        report["fits"] = original_chars <= target_chars
        return messages, report

    single_cap = max(iter_budget // EMERGENCY_SINGLE_RESULT_SHARE, 2_000)
    kept: list[list[dict]] = []
    used = 0
    for idx in range(len(iterations) - 1, -1, -1):
        iteration = iterations[idx]
        size = _iteration_chars(iteration)
        if size > single_cap:
            iteration, elided = _truncate_iteration(iteration, single_cap)
            if elided:
                report["results_truncated"] += 1
                report["chars_elided"] += elided
            size = _iteration_chars(iteration)
        if kept and used + size > iter_budget:
            break
        if not kept and size > iter_budget:
            # The newest iteration alone overflows even the full budget:
            # truncate harder — it must always survive.
            iteration, elided = _truncate_iteration(iteration, iter_budget)
            report["results_truncated"] += 1
            report["chars_elided"] += elided
            size = _iteration_chars(iteration)
        kept.append(iteration)
        used += size
    kept.reverse()
    n_kept = len(kept)
    older = iterations[: len(iterations) - n_kept]

    new_messages = list(prefix)
    if older:
        summaries = [summarize_iteration(it) for it in older]
        new_messages.append({
            "role": "user",
            "content": "[Emergency context compression - earlier tool calls: "
            + "; ".join(summaries) + "]",
        })
    for iteration in kept:
        new_messages.extend(iteration)

    compressed_chars = estimate_message_chars(new_messages)
    report["iterations_kept"] = n_kept
    report["iterations_summarized"] = len(older)
    report["compressed_chars"] = compressed_chars
    report["fits"] = compressed_chars <= target_chars
    if not report["fits"]:
        return messages, report
    if stats:
        stats.compressions += 1
        stats.iterations_compressed += len(older)
        stats.chars_saved += max(0, original_chars - compressed_chars)
    return new_messages, report
