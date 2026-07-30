"""Checkpoint codec for the chat turn (`_ChatTurn` ⇄ JSON payload).

EVERY `_ChatTurn` dataclass field is explicitly classified below as either
PERSISTED (serialized into the payload and restored verbatim) or
RECONSTRUCTED (rebuilt by the resume flow from live state, with the reason
documented). `tests/test_turn_checkpoint_codec.py` holds a field-census pin:
a new `_ChatTurn` field breaks the test until it is classified here — which
permanently enforces the hard rule that a resume can never silently grant
fresh one-shot guard budgets ("never weaken the anti-hedging guards").

This module deliberately does NOT import `tool_loop` (which will import the
turn-state machinery): `snapshot_chat_turn` reads attributes off the live
turn object, and `restore_field_values` returns constructor kwargs for the
resume flow to combine with its reconstructed fields.

Large base64 image blocks (vision injection, pending_image_blocks) are
externalized to the store's content-addressed blob dir and re-inlined on
restore, keeping the SQLite payload row small.
"""

from __future__ import annotations

import hashlib
from dataclasses import asdict
from typing import Any

from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger

log = get_logger("turn_state")

CODEC_VERSION = 1

# ── The classification (census-pinned) ───────────────────────────────

#: Serialized into the payload and restored verbatim. The six one-shot
#: guard flags and every consumed budget MUST be here — restoring a turn
#: without them would silently re-arm the anti-hedging/anti-fabrication
#: guards (hard-rule violation).
PERSISTED_FIELDS: frozenset[str] = frozenset({
    "system_prompt",        # CURRENT value — may have been rebound mid-turn
    "messages",             # post-compression model transcript (blob-externalized)
    "user_id",
    "chat_cap",
    "iteration",
    "tools_used_in_loop",
    "continuation_count",
    "max_continuations",
    "fabrication_retried",
    "promise_retried",
    "unavail_retried",
    "hedging_retried",
    "code_hedging_retried",
    "premature_failure_retried",
    "pending_image_blocks",  # blob-externalized
    "_op_tool_details",
    "_pending_validations",
    "_validation_required",
    "_validation_retries",
    "_max_validation_retries",
    "_result_store_cap",
    "_ch_id",
    "_req_id",
    "stuck_tracker",         # exported as plain state, re-seeded on restore
    "_trajectory",           # full dict incl. iterations; rebuilt on restore
})

#: Rebuilt by the resume flow from live state. Each entry documents why it
#: is NOT persisted:
#: - message:  a live discord.Message — re-fetched from channel+message id;
#:   deleted or materially edited requests become terminal, never resumed.
#: - _cancel:  process-local asyncio.Event — a fresh one from channel_state;
#:   cancellation itself is persisted as a TERMINAL turn status.
#: - tools:    re-derived from the CURRENT catalog + permission filter —
#:   current security policy always wins over persisted tool definitions.
#: - policy:   a stable name ("chat") rides the payload metadata; the object
#:   is reconstructed from current code, never unpickled folklore.
#: - trace:    ContextTraceCollector.finalize() is one-way; the old segment
#:   is closed into the payload for diagnostics and a fresh linked resume
#:   segment starts (Odin round-2).
#: - durability: the write-invariant driver — always process-local; a
#:   resumed turn gets a fresh handle bound to the RESUME lease (restoring
#:   the old one would carry a fenced-out lease token).
RECONSTRUCTED_FIELDS: frozenset[str] = frozenset({
    "message",
    "_cancel",
    "tools",
    "policy",
    "trace",
    "durability",
})


def compute_content_digest(text: str) -> str:
    """Full sha256 of the request content — the admission validation digest
    (NOT identity; identity is source+channel+message id)."""
    return hashlib.sha256((text or "").encode("utf-8", "replace")).hexdigest()


# ── storage redaction ────────────────────────────────────────────────


def _scrub_tool_use_inputs(obj: Any) -> Any:
    """Secret-scrub string values inside assistant ``tool_use`` inputs
    before they hit durable storage (review blocker #8, PR #242) — the
    parity move with audit storage, which deliberately scrubs tool inputs.

    Tool RESULTS are already scrubbed at source (`_run_one_tool` runs
    scrub_output_secrets before building the result block), and
    credential-bearing USER messages are deleted by the intake secret gate
    before a turn ever starts — tool arguments were the remaining
    unscrubbed surface. The scrub applies at SNAPSHOT time only, so a
    resumed transcript shows the model its own arguments with any embedded
    secrets masked; the executed effect already happened and is unaffected.
    """
    if isinstance(obj, list):
        return [_scrub_tool_use_inputs(x) for x in obj]
    if isinstance(obj, dict):
        if obj.get("type") == "tool_use" and isinstance(obj.get("input"), dict):
            scrubbed = {
                k: scrub_output_secrets(v) if isinstance(v, str) else v
                for k, v in obj["input"].items()
            }
            return {**obj, "input": scrubbed}
        return {k: _scrub_tool_use_inputs(v) for k, v in obj.items()}
    return obj


# ── image-block externalization ──────────────────────────────────────


def _externalize_blocks(obj: Any, store_blob) -> Any:
    """Recursively swap base64 image payloads for blob refs."""
    if isinstance(obj, list):
        return [_externalize_blocks(x, store_blob) for x in obj]
    if isinstance(obj, dict):
        source = obj.get("source")
        if (
            obj.get("type") == "image"
            and isinstance(source, dict)
            and source.get("type") == "base64"
            and isinstance(source.get("data"), str)
        ):
            ref = store_blob(source["data"].encode("ascii", "replace"))
            new_source = {k: v for k, v in source.items() if k != "data"}
            new_source["type"] = "blob_ref"
            new_source["ref"] = ref
            return {**obj, "source": new_source}
        return {k: _externalize_blocks(v, store_blob) for k, v in obj.items()}
    return obj


def _inline_blocks(obj: Any, load_blob) -> Any:
    """Inverse of :func:`_externalize_blocks`."""
    if isinstance(obj, list):
        return [_inline_blocks(x, load_blob) for x in obj]
    if isinstance(obj, dict):
        source = obj.get("source")
        if (
            obj.get("type") == "image"
            and isinstance(source, dict)
            and source.get("type") == "blob_ref"
            and isinstance(source.get("ref"), str)
        ):
            data = load_blob(source["ref"]).decode("ascii", "replace")
            new_source = {k: v for k, v in source.items() if k != "ref"}
            new_source["type"] = "base64"
            new_source["data"] = data
            return {**obj, "source": new_source}
        return {k: _inline_blocks(v, load_blob) for k, v in obj.items()}
    return obj


# ── stuck-tracker export/import ──────────────────────────────────────


def export_stuck_tracker(tracker) -> dict:
    return {
        "fingerprints": list(tracker._fingerprints),
        "window_size": tracker._window_size,
        "min_repeats": tracker._min_repeats,
        "max_cycle_length": tracker._max_cycle_length,
        "names_only": tracker._names_only,
        "warned": bool(tracker.warned),
    }


def import_stuck_tracker(state: dict, tracker_cls):
    tracker = tracker_cls(
        window_size=int(state.get("window_size", 12)),
        min_repeats=int(state.get("min_repeats", 3)),
        max_cycle_length=int(state.get("max_cycle_length", 3)),
        names_only=bool(state.get("names_only", False)),
    )
    tracker._fingerprints.extend(state.get("fingerprints") or [])
    tracker.warned = bool(state.get("warned", False))
    return tracker


# ── trajectory persistence ───────────────────────────────────────────


def _trajectory_to_payload(trajectory) -> dict:
    """FULL trajectory state (unlike TrajectoryTurn.to_dict, which is lossy
    by design for the JSONL files). Iterations ride as asdict() rows; the
    saved iteration count is the anti-double-append revision (Odin round-2:
    "resumption cannot append the same iteration twice")."""
    return {
        "message_id": trajectory.message_id,
        "channel_id": trajectory.channel_id,
        "user_id": trajectory.user_id,
        "user_name": trajectory.user_name,
        "timestamp": trajectory.timestamp,
        "source": trajectory.source,
        "user_content": trajectory.user_content,
        "system_prompt": trajectory.system_prompt,
        "history": list(trajectory.history or []),
        "iterations": [asdict(it) for it in trajectory.iterations],
        "final_response": trajectory.final_response,
        "tools_used": list(trajectory.tools_used or []),
        "is_error": trajectory.is_error,
        "handoff": trajectory.handoff,
        "user_content_truncated": trajectory.user_content_truncated,
        "user_content_original_chars": trajectory.user_content_original_chars,
        "total_input_tokens": trajectory.total_input_tokens,
        "total_output_tokens": trajectory.total_output_tokens,
        "total_duration_ms": trajectory.total_duration_ms,
        "iteration_revision": len(trajectory.iterations),
    }


def trajectory_from_payload(data: dict):
    from ..trajectories.saver import ToolIteration, TrajectoryTurn

    turn = TrajectoryTurn(
        message_id=data.get("message_id", ""),
        channel_id=data.get("channel_id", ""),
        user_id=data.get("user_id", ""),
        user_name=data.get("user_name", ""),
        timestamp=data.get("timestamp", ""),
        source=data.get("source", "discord"),
        user_content=data.get("user_content", ""),
        system_prompt=data.get("system_prompt", ""),
        history=list(data.get("history") or []),
    )
    expected = int(data.get("iteration_revision", 0))
    rows = list(data.get("iterations") or [])[:expected]
    for row in rows:
        try:
            turn.iterations.append(ToolIteration(**row))
        except TypeError:
            # Forward/backward field drift: keep what maps, never crash resume.
            known = {k: v for k, v in row.items()
                     if k in ToolIteration.__dataclass_fields__}
            turn.iterations.append(ToolIteration(**known))
    turn.final_response = data.get("final_response", "")
    turn.tools_used = list(data.get("tools_used") or [])
    turn.is_error = bool(data.get("is_error", False))
    turn.handoff = bool(data.get("handoff", False))
    turn.user_content_truncated = bool(data.get("user_content_truncated", False))
    turn.user_content_original_chars = int(data.get("user_content_original_chars", 0) or 0)
    turn.total_input_tokens = int(data.get("total_input_tokens", 0) or 0)
    turn.total_output_tokens = int(data.get("total_output_tokens", 0) or 0)
    turn.total_duration_ms = int(data.get("total_duration_ms", 0) or 0)
    return turn


# ── the codec proper ─────────────────────────────────────────────────


def snapshot_chat_turn(st, *, store_blob, generation_seq: int, extra: dict | None = None) -> dict:
    """Serialize the live chat turn into a JSON-safe checkpoint payload.

    ``store_blob(bytes) -> ref`` externalizes image payloads. ``extra``
    carries flow metadata (suspension reason, closed trace segment, ...).
    """
    payload = {
        "codec_version": CODEC_VERSION,
        "policy": "chat",
        "generation_seq": generation_seq,
        "fields": {
            "system_prompt": st.system_prompt,
            "messages": _scrub_tool_use_inputs(
                _externalize_blocks(st.messages, store_blob)
            ),
            "user_id": st.user_id,
            "chat_cap": st.chat_cap,
            "iteration": st.iteration,
            "tools_used_in_loop": list(st.tools_used_in_loop),
            "continuation_count": st.continuation_count,
            "max_continuations": st.max_continuations,
            "fabrication_retried": st.fabrication_retried,
            "promise_retried": st.promise_retried,
            "unavail_retried": st.unavail_retried,
            "hedging_retried": st.hedging_retried,
            "code_hedging_retried": st.code_hedging_retried,
            "premature_failure_retried": st.premature_failure_retried,
            "pending_image_blocks": _externalize_blocks(
                list(st.pending_image_blocks), store_blob
            ),
            "_op_tool_details": list(st._op_tool_details),
            "_pending_validations": list(st._pending_validations),
            "_validation_required": st._validation_required,
            "_validation_retries": st._validation_retries,
            "_max_validation_retries": st._max_validation_retries,
            "_result_store_cap": st._result_store_cap,
            "_ch_id": st._ch_id,
            "_req_id": st._req_id,
            "stuck_tracker": export_stuck_tracker(st.stuck_tracker),
            "_trajectory": _trajectory_to_payload(st._trajectory),
        },
    }
    if extra:
        payload["extra"] = extra
    return payload


def restore_field_values(payload: dict, *, load_blob, stuck_tracker_cls) -> dict:
    """Persisted-field constructor kwargs for `_ChatTurn`.

    The resume flow combines these with its RECONSTRUCTED fields (live
    message, fresh cancel event, current-policy tools, fresh trace, policy
    object) — see the classification at the top of this module.
    """
    fields = dict(payload.get("fields") or {})
    fields["messages"] = _inline_blocks(fields.get("messages") or [], load_blob)
    fields["pending_image_blocks"] = _inline_blocks(
        fields.get("pending_image_blocks") or [], load_blob
    )
    fields["stuck_tracker"] = import_stuck_tracker(
        fields.get("stuck_tracker") or {}, stuck_tracker_cls
    )
    fields["_trajectory"] = trajectory_from_payload(fields.get("_trajectory") or {})
    return fields
