"""Trajectory replay + diff — turn raw JSONL entries into something readable.

A trajectory is a complete record of a single message turn: the user
request, the system prompt, the tool iterations, the final response.
Useful for debugging, but the raw JSON is painful to read directly.

This module provides two views:

- ``summarize_turn`` — a narrative summary of one turn (who asked what,
  what tools fired in what order, what the LLM said, where it failed).
  For quickly understanding a single past interaction.
- ``diff_turns`` — a side-by-side comparison of two turns with the same
  intent. Useful for answering "what changed between the time this
  worked and the time it didn't."

Both are pure functions — they don't touch the filesystem or the LLM;
the caller provides the raw entry dict from TrajectorySaver.
"""

from __future__ import annotations

import json
import textwrap
from typing import Any

MAX_OUTPUT_CHARS = 400  # trim individual tool outputs when summarizing


def _truncate(text: str, limit: int = MAX_OUTPUT_CHARS) -> str:
    if not isinstance(text, str):
        text = str(text)
    if len(text) <= limit:
        return text
    return text[:limit] + f"… [+{len(text) - limit} chars]"


def _fmt_tool_call(call: dict) -> str:
    name = call.get("name", "?")
    inp = call.get("input") or {}
    if isinstance(inp, dict) and inp:
        key_parts: list[str] = []
        for k in ("host", "path", "command", "target", "name", "url"):
            if k in inp:
                key_parts.append(f"{k}={_truncate(str(inp[k]), 80)}")
        if not key_parts:
            key_parts.append(_truncate(json.dumps(inp, default=str), 120))
        return f"{name}({', '.join(key_parts)})"
    return f"{name}()"


def _fmt_tool_result(res: dict) -> str:
    content = res.get("content") or res.get("output") or ""
    if isinstance(content, list):  # anthropic-style block list
        parts: list[str] = []
        for b in content:
            if isinstance(b, dict) and "text" in b:
                parts.append(b["text"])
            else:
                parts.append(str(b))
        content = "\n".join(parts)
    return _truncate(str(content), MAX_OUTPUT_CHARS)


def summarize_turn(entry: dict) -> str:
    """Return a narrative summary of a single trajectory entry."""
    if not isinstance(entry, dict):
        return "(invalid trajectory entry — not a dict)"

    header_parts: list[str] = []
    if entry.get("timestamp"):
        header_parts.append(f"time={entry['timestamp']}")
    if entry.get("user_name"):
        header_parts.append(f"user={entry['user_name']}")
    if entry.get("channel_id"):
        header_parts.append(f"channel={entry['channel_id']}")
    if entry.get("message_id"):
        header_parts.append(f"message={entry['message_id']}")
    lines: list[str] = ["=== trajectory replay ==="]
    if header_parts:
        lines.append(" ".join(header_parts))
    lines.append("")

    user_content = entry.get("user_content") or "(no user content)"
    lines.append("USER:")
    lines.append(textwrap.indent(_truncate(user_content, 600), "  "))
    lines.append("")

    iterations = entry.get("iterations") or []
    total_in = entry.get("total_input_tokens", 0)
    total_out = entry.get("total_output_tokens", 0)
    dur = entry.get("total_duration_ms", 0)
    lines.append(
        f"ITERATIONS: {len(iterations)} "
        f"(tokens in={total_in} out={total_out} duration_ms={dur})"
    )
    for it in iterations:
        it_num = it.get("iteration", "?")
        calls = it.get("tool_calls") or []
        results = it.get("tool_results") or []
        text = (it.get("llm_text") or "").strip()
        lines.append(f"  iter {it_num}:")
        if text:
            lines.append(textwrap.indent(_truncate(text, 300), "    LLM: "))
        if calls:
            for call in calls:
                lines.append(f"    → {_fmt_tool_call(call)}")
        if results:
            for res in results:
                lines.append(textwrap.indent(_fmt_tool_result(res), "      = "))

    lines.append("")
    tools_used = entry.get("tools_used") or []
    if tools_used:
        lines.append(f"TOOLS USED: {', '.join(tools_used)}")
    is_err = bool(entry.get("is_error"))
    lines.append(f"OUTCOME: {'ERROR' if is_err else 'ok'}")
    final = entry.get("final_response") or ""
    if final:
        lines.append("FINAL RESPONSE:")
        lines.append(textwrap.indent(_truncate(final, 800), "  "))
    return "\n".join(lines)


def _tool_sequence(entry: dict) -> list[str]:
    """Flat ordered list of tool names called across all iterations."""
    out: list[str] = []
    for it in entry.get("iterations") or []:
        for call in it.get("tool_calls") or []:
            name = call.get("name")
            if name:
                out.append(str(name))
    return out


def _tool_io_pairs(entry: dict) -> list[tuple[str, Any, str]]:
    """For diffing: (tool_name, input_dict, short_output_text) tuples."""
    pairs: list[tuple[str, Any, str]] = []
    for it in entry.get("iterations") or []:
        calls = it.get("tool_calls") or []
        results = it.get("tool_results") or []
        # zip by index — results align to calls in the standard saver shape
        for idx, call in enumerate(calls):
            out = ""
            if idx < len(results):
                out = _fmt_tool_result(results[idx])
            pairs.append((str(call.get("name", "?")), call.get("input") or {}, out))
    return pairs


def diff_turns(a: dict, b: dict) -> str:
    """Side-by-side comparison of two trajectory entries. Intended for the
    case where A and B started from similar inputs but diverged — same
    task, run twice, what changed.
    """
    if not isinstance(a, dict) or not isinstance(b, dict):
        return "(invalid trajectory entry — at least one is not a dict)"

    lines: list[str] = ["=== trajectory diff ==="]
    lines.append(f"A: {a.get('message_id', '?')} @ {a.get('timestamp', '?')}")
    lines.append(f"B: {b.get('message_id', '?')} @ {b.get('timestamp', '?')}")
    lines.append("")

    ua = _truncate(a.get("user_content") or "", 200)
    ub = _truncate(b.get("user_content") or "", 200)
    if ua != ub:
        lines.append("USER CONTENT differs:")
        lines.append(f"  A: {ua}")
        lines.append(f"  B: {ub}")
    else:
        lines.append("USER CONTENT: (identical)")
    lines.append("")

    seq_a = _tool_sequence(a)
    seq_b = _tool_sequence(b)
    lines.append(f"TOOL SEQUENCE A ({len(seq_a)}): {' → '.join(seq_a) or '(none)'}")
    lines.append(f"TOOL SEQUENCE B ({len(seq_b)}): {' → '.join(seq_b) or '(none)'}")
    if seq_a == seq_b:
        lines.append("  sequences are identical")
    else:
        # Find first index where they diverge
        for i, (x, y) in enumerate(zip(seq_a, seq_b)):
            if x != y:
                lines.append(f"  first divergence at step {i}: A={x} vs B={y}")
                break
        else:
            lines.append(f"  one is a prefix of the other (len diff {abs(len(seq_a) - len(seq_b))})")
    lines.append("")

    pairs_a = _tool_io_pairs(a)
    pairs_b = _tool_io_pairs(b)
    max_pairs = max(len(pairs_a), len(pairs_b))
    if max_pairs:
        lines.append("PER-STEP OUTPUT DIFFS:")
        for i in range(max_pairs):
            if i >= len(pairs_a):
                lines.append(f"  step {i}: [A missing] B={pairs_b[i][0]}")
                continue
            if i >= len(pairs_b):
                lines.append(f"  step {i}: A={pairs_a[i][0]} [B missing]")
                continue
            an, _, ao = pairs_a[i]
            bn, _, bo = pairs_b[i]
            if an != bn:
                lines.append(f"  step {i}: tool differs A={an} vs B={bn}")
                continue
            if ao == bo:
                continue
            lines.append(f"  step {i} ({an}): output differs")
            lines.append(textwrap.indent(f"A: {ao}", "    "))
            lines.append(textwrap.indent(f"B: {bo}", "    "))
    lines.append("")

    # Outcome summary
    ea = bool(a.get("is_error"))
    eb = bool(b.get("is_error"))
    if ea == eb:
        lines.append(f"OUTCOME: {'both errored' if ea else 'both ok'}")
    else:
        lines.append(f"OUTCOME: A={'ERROR' if ea else 'ok'} vs B={'ERROR' if eb else 'ok'}")

    fa = _truncate(a.get("final_response") or "", 300)
    fb = _truncate(b.get("final_response") or "", 300)
    if fa != fb:
        lines.append("FINAL RESPONSE differs:")
        lines.append(textwrap.indent(f"A: {fa}", "  "))
        lines.append(textwrap.indent(f"B: {fb}", "  "))
    else:
        lines.append("FINAL RESPONSE: (identical)")
    return "\n".join(lines)
