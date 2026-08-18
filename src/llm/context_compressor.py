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
# Hard cap on the emergency summary text itself: hundreds of summarized
# iterations must not rebuild the overflow inside the summary message.
_EMERGENCY_SUMMARY_MAX = 20_000
_EMERGENCY_SUMMARY_PREFIX = "[Emergency context compression - earlier tool calls: "
_EMERGENCY_SUMMARY_SUFFIX = "]"
_EMERGENCY_ELISION = "\n...[emergency truncation: {elided} chars elided]...\n"


def _iteration_chars(iteration: list[dict]) -> int:
    return estimate_message_chars(iteration)


def _elide_string(value: str, max_output_chars: int) -> str:
    """Return a head/tail elision no longer than *max_output_chars*.

    ``max_output_chars`` is an exact bound on the replacement, including its
    marker.  A tiny bound may therefore retain only the marker; the enclosing
    tool block and call/result IDs remain untouched.
    """
    max_output_chars = max(0, max_output_chars)
    lo = 0
    hi = len(value) - 1
    best = ""
    while lo <= hi:
        keep = (lo + hi) // 2
        head_len = int(keep * 0.7)
        tail_len = keep - head_len
        elided = len(value) - keep
        marker = _EMERGENCY_ELISION.format(elided=elided)
        candidate = value[:head_len] + marker
        if tail_len:
            candidate += value[-tail_len:]
        if len(candidate) <= max_output_chars:
            best = candidate
            lo = keep + 1
        else:
            hi = keep - 1

    if best:
        return best
    # Even the normal marker may be wider than an exceptionally small bound.
    # Keep an explicit elision signal rather than leaking beyond the target.
    compact = f"...[{len(value)} chars elided]..."
    return compact[:max_output_chars]


def _truncate_iteration(iteration: list[dict], max_chars: int) -> tuple[list[dict], int]:
    """Shrink one iteration under *max_chars* by eliding string payloads.

    Only payload strings from message content and the established block fields
    are shortened.  IDs, names, types, roles, and arbitrary metadata remain
    untouched, preserving call/result pairing and the existing compression
    contract.  There is deliberately no fixed pass count: one multi-tool
    iteration may legitimately contain hundreds of large results.
    Returns ``(new_iteration, chars_elided)``; the input is not modified.
    """
    import copy

    work = copy.deepcopy(iteration)
    original_chars = _iteration_chars(work)
    if original_chars <= max_chars:
        return work, 0

    strings: list[tuple[dict, str, str]] = []
    for msg in work:
        content = msg.get("content", "")
        if isinstance(content, str):
            strings.append((msg, "content", content))
        elif isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                for key in ("text", "content", "input", "arguments"):
                    value = block.get(key)
                    if isinstance(value, str):
                        strings.append((block, key, value))

    # Largest-first waterline.  Every original string is considered at most
    # once, so runtime is bounded by payload shape rather than an arbitrary 32
    # passes that can abandon a 100-result newest iteration above target.
    strings.sort(key=lambda item: len(item[2]), reverse=True)
    for holder, key, original in strings:
        current_chars = _iteration_chars(work)
        if current_chars <= max_chars:
            break
        overshoot = current_chars - max_chars
        holder[key] = _elide_string(original, max(0, len(original) - overshoot))

    compressed_chars = _iteration_chars(work)
    return work, max(0, original_chars - compressed_chars)


def _is_emergency_summary(msg: dict) -> bool:
    """Identify the exact user-message shape emitted by this compressor."""
    content = msg.get("content")
    return (
        msg.get("role") == "user"
        and isinstance(content, str)
        and content.startswith(_EMERGENCY_SUMMARY_PREFIX)
        and content.endswith(_EMERGENCY_SUMMARY_SUFFIX)
    )


def _emergency_summary_body(msg: dict) -> str:
    content = msg.get("content", "")
    if not isinstance(content, str):
        return ""
    if content.startswith(_EMERGENCY_SUMMARY_PREFIX) and content.endswith(
        _EMERGENCY_SUMMARY_SUFFIX
    ):
        return content[len(_EMERGENCY_SUMMARY_PREFIX):-len(_EMERGENCY_SUMMARY_SUFFIX)]
    return content


_REPLAY_MARKER_PREFIX = "[Context recovery: "
_REPLAY_MARKER_SUFFIX = " older conversation messages elided]"


@dataclass(frozen=True)
class SurfaceBoundary:
    """Explicit compressible/protected partition for a surface's message list.

    ``request_start`` indexes the first message of the CURRENT request
    envelope (chat: developer preamble + user message + pre-tool directives;
    loops: the current autonomous prompt). Everything BEFORE it is replayed
    context (chat session history / loop prev_context) — compressible by
    oldest-first whole-message elision with an explicit count marker.
    The envelope itself is protected verbatim; messages after it are tool
    iterations under the existing newest-first emergency rules.

    Supplied by the SURFACE at turn construction and carried as state:
    compression returns the updated boundary in its report
    (``boundary_request_start`` / ``boundary_elided_replay``) because
    indices shift as replay elides. ``elided_replay`` regenerates the
    position-0 marker each pass — recognition is by THIS state, never by
    matching marker text (user content can imitate any string).

    ``None`` boundary = agent semantics: the structural prefix (task and
    parent messages) is protected, byte-identical to pre-campaign behavior.
    """

    request_start: int
    elided_replay: int = 0


def _replay_marker_message(elided: int) -> dict:
    return {
        "role": "user",
        "content": f"{_REPLAY_MARKER_PREFIX}{elided}{_REPLAY_MARKER_SUFFIX}",
    }


def _compress_with_boundary(
    messages: list[dict],
    *,
    target_chars: int,
    boundary: SurfaceBoundary,
    stats: CompressionStats | None,
) -> tuple[list[dict], dict]:
    """Replay-elision wrapper around the agent-semantics emergency core.

    ``messages[boundary.request_start:]`` is exactly the shape the core
    already handles — the request envelope becomes its protected prefix and
    everything after it its tool iterations. This wrapper spends replayed
    context (oldest first, whole messages, count marker regenerated from
    boundary state — never a fabricated summary) only when iteration
    compression alone cannot reach the target. A first-generation overflow
    with zero iterations therefore recovers by replay elision alone.
    """
    request_start = max(0, min(boundary.request_start, len(messages)))
    marker_present = boundary.elided_replay > 0 and request_start > 0
    replay = list(messages[1 if marker_present else 0 : request_start])
    rest = list(messages[request_start:])
    elided_total = boundary.elided_replay
    original_chars = estimate_message_chars(messages)

    def _assemble(
        kept_replay: list[dict], inner: list[dict], elided: int
    ) -> tuple[list[dict], int]:
        head: list[dict] = []
        if elided > 0:
            head.append(_replay_marker_message(elided))
        return head + kept_replay + inner, len(head) + len(kept_replay)

    best_inner, inner_report = emergency_compress_for_window(
        rest, target_chars=max(0, target_chars - estimate_message_chars(
            ([_replay_marker_message(elided_total)] if elided_total else []) + replay
        )), stats=stats,
    )
    kept_replay = replay
    while True:
        assembled, new_request_start = _assemble(kept_replay, best_inner, elided_total)
        assembled_chars = estimate_message_chars(assembled)
        if assembled_chars <= target_chars or not kept_replay:
            break
        # Iterations alone were not enough: spend the OLDEST replay message
        # and retry the core with the space it freed.
        kept_replay = kept_replay[1:]
        elided_total += 1
        best_inner, inner_report = emergency_compress_for_window(
            rest, target_chars=max(0, target_chars - estimate_message_chars(
                ([_replay_marker_message(elided_total)] if elided_total else [])
                + kept_replay
            )), stats=stats,
        )

    fits = assembled_chars <= target_chars and inner_report.get("fits", False)
    if not fits and not inner_report.get("fits", False) and not kept_replay:
        # The protected envelope (+ newest iteration) alone exceeds the rung:
        # honest failure, original list preserved (the core already refused).
        report = dict(inner_report)
        report["original_chars"] = original_chars
        report["compressed_chars"] = original_chars
        report["fits"] = False
        report["replay_original"] = len(replay)
        report["replay_elided"] = elided_total - boundary.elided_replay
        report["boundary_request_start"] = boundary.request_start
        report["boundary_elided_replay"] = boundary.elided_replay
        return messages, report

    report = dict(inner_report)
    report["original_chars"] = original_chars
    report["compressed_chars"] = assembled_chars
    # Evidence truth: the report names the RUNG the caller requested, not
    # the replay-reduced inner target the core happened to run with.
    report["target_chars"] = target_chars
    report["fits"] = fits
    report["replay_original"] = len(replay)
    report["replay_elided"] = elided_total - boundary.elided_replay
    report["boundary_request_start"] = new_request_start
    report["boundary_elided_replay"] = elided_total
    return assembled, report


def emergency_compress_for_window(
    messages: list[dict],
    *,
    target_chars: int,
    stats: CompressionStats | None = None,
    boundary: SurfaceBoundary | None = None,
) -> tuple[list[dict], dict]:
    """Bound the ENTIRE payload under *target_chars* for overflow recovery.

    Unlike :func:`compress_tool_context` (a soft budget whose newest
    ``keep_recent`` iterations are exempt by COUNT), this recovery pass:

    - retains recent iterations dynamically by SIZE, newest first, always
      keeping the newest one (truncated if it alone overflows);
    - truncates any single kept iteration larger than its fair share of the
      retained budget (``EMERGENCY_SINGLE_RESULT_SHARE``) so one enormous
      tool result cannot crowd out everything else;
    - summarizes every older iteration with the same local summarizer the
      soft pass uses;
    - re-opens a summary emitted by an earlier emergency pass, rather than
      allowing that summary to ossify inside the immutable task prefix;
    - never modifies the real prefix (the agent task and parent messages).

    Returns ``(new_messages, report)``. The input list is not modified. When
    the real prefix alone exceeds the target, or the newest iteration cannot
    fit even after all of its string payloads are elided, the original list is
    returned with ``report["fits"] = False``.  That fallback still preserves
    the newest iteration; it is never summarized away merely to report fit.
    """
    if boundary is not None:
        return _compress_with_boundary(
            messages, target_chars=target_chars, boundary=boundary, stats=stats
        )
    original_chars = estimate_message_chars(messages)
    raw_prefix, iterations = split_prefix_and_iterations(messages)

    # Emergency summaries are compressor state, not immutable task context.
    # Peel them out before measuring the prefix so an aggressive second pass
    # can replace/recompact the first pass's summary.
    prefix = list(raw_prefix)
    carried_summaries: list[str] = []
    # Only summaries at the compressor's own boundary are replaceable.  Do
    # not search/remove matching text from the user's real task or parent
    # context.  A real prefix must remain before the generated marker.
    while len(prefix) > 1 and _is_emergency_summary(prefix[-1]):
        body = _emergency_summary_body(prefix.pop())
        if body:
            carried_summaries.append(body)
    carried_summaries.reverse()

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

    # An already-fitting payload must stay byte-for-byte identical.  This is
    # especially important for the agent lifetime latch and provider caching.
    if original_chars <= target_chars:
        report["compressed_chars"] = original_chars
        report["fits"] = True
        report["iterations_kept"] = len(iterations)
        return messages, report

    available_chars = target_chars - prefix_chars
    if available_chars <= 0:
        report["compressed_chars"] = original_chars
        return messages, report

    def _summary_message(
        older_iters: list[list[dict]],
        *,
        max_content_chars: int = _EMERGENCY_SUMMARY_MAX,
    ) -> dict | None:
        summaries = list(carried_summaries)
        summaries.extend(summarize_iteration(it) for it in older_iters)
        if not summaries or max_content_chars <= 0:
            return None

        max_content_chars = min(max_content_chars, _EMERGENCY_SUMMARY_MAX)
        fixed_chars = len(_EMERGENCY_SUMMARY_PREFIX) + len(_EMERGENCY_SUMMARY_SUFFIX)
        body_budget = max_content_chars - fixed_chars
        if body_budget <= 0:
            return None

        text = "; ".join(summaries)
        if len(text) > body_budget:
            # Keep the newest summaries whole and collapse the rest into an
            # explicit count.  If even that count does not fit, emit a compact
            # structural marker; the task and newest iteration take priority.
            kept_summaries: list[str] = []
            used_chars = 0
            for summary in reversed(summaries):
                extra = len(summary) + (2 if kept_summaries else 0)
                if used_chars + extra > body_budget:
                    break
                kept_summaries.append(summary)
                used_chars += extra
            kept_summaries.reverse()
            elided_n = len(summaries) - len(kept_summaries)
            label = f"{elided_n} earlier iterations elided"
            if kept_summaries:
                candidate = label + "; " + "; ".join(kept_summaries)
                while len(candidate) > body_budget and kept_summaries:
                    kept_summaries.pop(0)
                    elided_n += 1
                    label = f"{elided_n} earlier iterations elided"
                    candidate = label
                    if kept_summaries:
                        candidate += "; " + "; ".join(kept_summaries)
                text = candidate
            else:
                text = label
            if len(text) > body_budget:
                text = text[:body_budget]

        return {
            "role": "user",
            "content": _EMERGENCY_SUMMARY_PREFIX + text + _EMERGENCY_SUMMARY_SUFFIX,
        }

    def _assemble(
        kept_iters: list[list[dict]],
        *,
        summary_limit: int = _EMERGENCY_SUMMARY_MAX,
    ) -> tuple[list[dict], int, dict | None]:
        older_iters = iterations[: len(iterations) - len(kept_iters)]
        out = list(prefix)
        summary = _summary_message(older_iters, max_content_chars=summary_limit)
        if summary is not None:
            out.append(summary)
        for iteration in kept_iters:
            out.extend(iteration)
        return out, estimate_message_chars(out), summary

    # No summary reserve is charged here.  If every iteration fits, no summary
    # will exist.  If older iterations are excluded, convergence below measures
    # the summary's real assembled size and trades retained history as needed.
    iter_budget = available_chars
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
            # The newest iteration alone gets the entire remaining budget.  It
            # must survive even if every string payload has to be elided.
            iteration, elided = _truncate_iteration(iteration, iter_budget)
            if elided:
                report["results_truncated"] += 1
                report["chars_elided"] += elided
            size = _iteration_chars(iteration)
        kept.append(iteration)
        used += size
    kept.reverse()

    new_messages, compressed_chars, summary = _assemble(kept)
    # Converge by trading the oldest retained iteration into the summary, but
    # NEVER trade away the newest one.  That is the emergency-path invariant.
    while compressed_chars > target_chars and len(kept) > 1:
        kept = kept[1:]
        new_messages, compressed_chars, summary = _assemble(kept)

    if compressed_chars > target_chars:
        # At the newest-only floor, first shrink the real summary by exactly the
        # pressure it creates.  Then give every remaining character to the
        # newest iteration.  With no older context there is no summary charge.
        summary_chars = estimate_message_chars([summary]) if summary is not None else 0
        overflow = compressed_chars - target_chars
        if summary is not None and overflow > 0:
            summary_limit = max(0, summary_chars - overflow)
            new_messages, compressed_chars, summary = _assemble(
                kept, summary_limit=summary_limit,
            )

        if compressed_chars > target_chars:
            base_messages = list(prefix)
            if summary is not None:
                base_messages.append(summary)
            newest_budget = target_chars - estimate_message_chars(base_messages)
            if newest_budget >= 0:
                newest, elided = _truncate_iteration(kept[-1], newest_budget)
                if elided:
                    report["results_truncated"] += 1
                    report["chars_elided"] += elided
                kept = [newest]
                new_messages = base_messages + newest
                compressed_chars = estimate_message_chars(new_messages)

    n_kept = len(kept)
    report["iterations_kept"] = n_kept
    report["iterations_summarized"] = len(iterations) - n_kept
    report["compressed_chars"] = compressed_chars
    report["fits"] = compressed_chars <= target_chars
    if not report["fits"]:
        return messages, report
    if stats:
        stats.compressions += 1
        stats.iterations_compressed += len(iterations) - n_kept
        stats.chars_saved += max(0, original_chars - compressed_chars)
    return new_messages, report
