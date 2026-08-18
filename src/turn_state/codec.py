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

from ..config.sensitivity import is_storage_sensitive_key as _is_sensitive_key
from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger

log = get_logger("turn_state")

CODEC_VERSION = 3

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
    "wait_judgment_pending",
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
    # Context-budget campaign (codec v3): recovery state that must survive
    # suspend/resume so a rescued generation stays the SAME generation.
    "_boundary_request_start",
    "_boundary_elided_replay",
    "_char_latch",
    "_rescue_passes",
    "_gen_identity",         # identity FACTS (provider/model/effort/ladder)
})

#: Added in codec v3. Version-scoped normalization (the wait_judgment
#: precedent): payloads written before the campaign default these to the
#: pre-campaign semantics — request_start=0 protects the whole structural
#: prefix exactly as recovery-less chat always did.
_V3_FIELD_DEFAULTS: dict[str, object] = {
    "_boundary_request_start": 0,
    "_boundary_elided_replay": 0,
    "_char_latch": None,
    "_rescue_passes": 0,
    "_gen_identity": None,
}

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


# Case-insensitive sensitive-KEY redaction (round-4 blocker #4, PR #242)
# is owned by config.sensitivity. Checkpoint storage deliberately uses its
# exact normalized-key policy, not the broader config-metadata substring rule.


def _deep_scrub_strings(value: Any) -> Any:
    """Recursive storage redaction: secret-PATTERN scrub over every nested
    string value, plus KEY-aware wholesale redaction — a value (of any
    shape, including nested containers) stored under a sensitive key is
    replaced entirely, because opaque credentials defeat pattern matching."""
    if isinstance(value, str):
        return scrub_output_secrets(value)
    if isinstance(value, list):
        return [_deep_scrub_strings(v) for v in value]
    if isinstance(value, dict):
        return {
            k: ("[redacted:sensitive-key]" if _is_sensitive_key(k)
                else _deep_scrub_strings(v))
            for k, v in value.items()
        }
    return value


def scrub_stored_tool_input(tool_name: str, tool_input: Any) -> Any:
    """The storage scrub for tool arguments (round-2 blocker #5, PR #242):
    the SAME tool-aware privacy redaction audit storage uses
    (`_scrub_tool_input_for_storage` — e.g. email bodies, which are not
    token-shaped), composed with a recursive secret-pattern scrub so nested
    values (auth headers, embedded dicts/lists) are covered too. Applied to
    EVERY persisted representation of the arguments.

    Tool RESULTS are already scrubbed at source (`_run_one_tool` runs
    scrub_output_secrets before building the result block), and
    credential-bearing USER messages are deleted by the intake secret gate
    before a turn ever starts. The scrub applies at SNAPSHOT time only, so
    a resumed transcript shows the model its own arguments with secrets
    masked; the executed effect already happened and is unaffected.
    """
    from ..discord.tool_loop_helpers import _scrub_tool_input_for_storage

    if isinstance(tool_input, dict):
        tool_input = _scrub_tool_input_for_storage(tool_name or "", tool_input)
    return _deep_scrub_strings(tool_input)


def _scrub_op_details(details: list) -> list:
    """The storage scrub for the op-details copy (round-3 deviation #4,
    PR #242): the loop applies the tool-aware redaction when building
    `_op_tool_details`, but persistence must ALSO compose the recursive
    secret scrub so nested values match the transcript/trajectory copies."""
    out = []
    for detail in details:
        if isinstance(detail, dict):
            row = dict(detail)
            if "input" in row:
                row["input"] = scrub_stored_tool_input(
                    str(row.get("tool") or ""), row.get("input")
                )
            for key in ("result", "error"):
                if isinstance(row.get(key), str):
                    row[key] = scrub_output_secrets(row[key])
            out.append(row)
        else:
            out.append(detail)
    return out


def _scrub_tool_use_inputs(obj: Any) -> Any:
    """Apply the storage scrub to assistant ``tool_use`` blocks in the
    transcript (name-aware — the block carries the tool name)."""
    if isinstance(obj, list):
        return [_scrub_tool_use_inputs(x) for x in obj]
    if isinstance(obj, dict):
        if obj.get("type") == "tool_use" and isinstance(obj.get("input"), dict):
            return {
                **obj,
                "input": scrub_stored_tool_input(
                    str(obj.get("name") or ""), obj["input"]
                ),
            }
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
    by design for the JSONL files). Iterations ride as asdict() rows with
    their tool-call ARGUMENTS passed through the storage scrub — this copy
    persists the same raw inputs the transcript does and must get the same
    redaction (round-2 blocker #5, PR #242). The saved iteration count is
    the anti-double-append revision (Odin round-2: "resumption cannot
    append the same iteration twice")."""

    def _scrubbed_iteration(it) -> dict:
        row = asdict(it)
        calls = row.get("tool_calls")
        if isinstance(calls, list):
            row["tool_calls"] = [
                {
                    **tc,
                    "input": scrub_stored_tool_input(
                        str(tc.get("name") or ""), tc.get("input")
                    ),
                }
                if isinstance(tc, dict)
                else tc
                for tc in calls
            ]
        return row

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
        "iterations": [_scrubbed_iteration(it) for it in trajectory.iterations],
        "final_response": trajectory.final_response,
        "tools_used": list(trajectory.tools_used or []),
        "is_error": trajectory.is_error,
        "handoff": trajectory.handoff,
        "user_content_truncated": trajectory.user_content_truncated,
        "user_content_original_chars": trajectory.user_content_original_chars,
        "total_input_tokens": trajectory.total_input_tokens,
        "total_output_tokens": trajectory.total_output_tokens,
        "total_duration_ms": trajectory.total_duration_ms,
        "context_recoveries": list(trajectory.context_recoveries or []),
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
    turn.context_recoveries = list(data.get("context_recoveries") or [])
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
            "wait_judgment_pending": st.wait_judgment_pending,
            "pending_image_blocks": _externalize_blocks(
                list(st.pending_image_blocks), store_blob
            ),
            "_op_tool_details": _scrub_op_details(list(st._op_tool_details)),
            "_pending_validations": list(st._pending_validations),
            "_validation_required": st._validation_required,
            "_validation_retries": st._validation_retries,
            "_max_validation_retries": st._max_validation_retries,
            "_result_store_cap": st._result_store_cap,
            "_ch_id": st._ch_id,
            "_req_id": st._req_id,
            "stuck_tracker": export_stuck_tracker(st.stuck_tracker),
            "_trajectory": _trajectory_to_payload(st._trajectory),
            "_boundary_request_start": st._boundary_request_start,
            "_boundary_elided_replay": st._boundary_elided_replay,
            "_char_latch": st._char_latch,
            "_rescue_passes": st._rescue_passes,
            "_gen_identity": dict(st._gen_identity) if st._gen_identity else None,
        },
    }
    if extra:
        payload["extra"] = extra
    return payload


class CheckpointInvalidError(ValueError):
    """The payload is structurally unusable — terminally reject, never
    retry (round-3 deviation #5, PR #242)."""


# The COMPLETE persisted-field schema, validated before any lease exists
# (round-5 blocker #2, PR #242): partial validation let a tampered/corrupt
# `hedging_retried=0` pass, resume, and re-arm a consumed guard budget —
# the hard rule the census exists to protect. Every field gets an exact
# type (bools via `type(v) is bool`, ints excluding bools), bounds, and
# container-element checks; the field SET is exact (extras reject too —
# an unknown field used to reach `_ChatTurn(**fields)` after acquisition).
_GUARD_FLAG_FIELDS = (
    "fabrication_retried", "promise_retried", "unavail_retried",
    "hedging_retried", "code_hedging_retried", "premature_failure_retried",
    "_validation_required", "wait_judgment_pending",
)
_NON_NEGATIVE_INT_FIELDS = (
    "iteration", "continuation_count", "max_continuations",
    "_validation_retries", "_max_validation_retries",
)
_POSITIVE_INT_FIELDS = ("chat_cap", "_result_store_cap")
_STRING_FIELDS = ("system_prompt", "user_id", "_ch_id", "_req_id")
_STR_LIST_FIELDS = ("tools_used_in_loop", "_pending_validations")
_DICT_LIST_FIELDS = ("pending_image_blocks", "_op_tool_details")
_STUCK_TRACKER_SCHEMA: dict[str, str] = {
    "fingerprints": "str_list",
    "window_size": "positive_int",
    "min_repeats": "positive_int",
    "max_cycle_length": "positive_int",
    "names_only": "bool",
    "warned": "bool",
}


def validate_payload(payload: Any) -> None:
    """Structural schema validation, run BEFORE lease acquisition.

    Raises :class:`CheckpointInvalidError` on any deviation — codec
    version, policy name, the fields envelope, presence of every persisted
    field, and the basic types construction depends on.
    """
    if not isinstance(payload, dict):
        raise CheckpointInvalidError("payload is not an object")
    # bool subclasses int; a checkpoint carrying True where an ordinal
    # belongs is corrupt, not truthy — the isinstance pairs are inlined so
    # mypy narrows the comparisons.
    version = payload.get("codec_version")
    if (
        not isinstance(version, int)
        or isinstance(version, bool)
        or version > CODEC_VERSION
        or version < 1
    ):
        raise CheckpointInvalidError(f"unsupported codec_version: {version!r}")
    if payload.get("policy") != "chat":
        raise CheckpointInvalidError(f"unsupported policy: {payload.get('policy')!r}")
    generation_seq = payload.get("generation_seq")
    if (
        not isinstance(generation_seq, int)
        or isinstance(generation_seq, bool)
        or generation_seq < 0
    ):
        raise CheckpointInvalidError(f"invalid generation_seq: {generation_seq!r}")

    def _exact_int(value: Any) -> bool:
        return isinstance(value, int) and not isinstance(value, bool)
    fields = payload.get("fields")
    if not isinstance(fields, dict):
        raise CheckpointInvalidError("missing fields envelope")
    # Legacy normalization, VERSION-SCOPED (round-5 blocker #3): only a
    # v1 payload — written before wait_judgment_pending existed — may
    # default the field. New writers emit v2, so a v2 payload missing it
    # is malformed and still rejected; the two cases are distinguishable.
    # Runs AFTER the store's digest verification (load_resumable_sync
    # rejects tampered payloads before any caller sees them), so
    # normalization can never launder an edit.
    if version == 1 and "wait_judgment_pending" not in fields:
        fields["wait_judgment_pending"] = False
    if version <= 2:
        for name, default in _V3_FIELD_DEFAULTS.items():
            if name not in fields:
                fields[name] = default
    missing = PERSISTED_FIELDS - fields.keys()
    if missing:
        raise CheckpointInvalidError(f"missing persisted fields: {sorted(missing)}")
    extras = fields.keys() - PERSISTED_FIELDS
    if extras:
        raise CheckpointInvalidError(f"unknown persisted fields: {sorted(extras)}")

    def _fail(name: str, why: str) -> None:
        raise CheckpointInvalidError(f"field {name!r} {why}")

    # One-shot guard flags and validation-required: EXACTLY bool. Anything
    # else (0, "", None) would restore falsy and RE-ARM a consumed budget.
    for name in _GUARD_FLAG_FIELDS:
        if type(fields[name]) is not bool:
            _fail(name, "must be exactly a bool")
    for name in _NON_NEGATIVE_INT_FIELDS:
        value = fields[name]
        if not _exact_int(value) or value < 0:
            _fail(name, "must be a non-negative integer")
    for name in _POSITIVE_INT_FIELDS:
        value = fields[name]
        if not _exact_int(value) or value < 1:
            _fail(name, "must be a positive integer")
    for name in _STRING_FIELDS:
        if not isinstance(fields[name], str):
            _fail(name, "must be a string")
    for name in _STR_LIST_FIELDS:
        value = fields[name]
        if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
            _fail(name, "must be a list of strings")
    for name in _DICT_LIST_FIELDS:
        value = fields[name]
        if not isinstance(value, list) or not all(isinstance(x, dict) for x in value):
            _fail(name, "must be a list of objects")
    # Budget invariants — a consumed counter above its cap is corrupt.
    if fields["continuation_count"] > fields["max_continuations"]:
        _fail("continuation_count", "exceeds max_continuations")
    if fields["_validation_retries"] > fields["_max_validation_retries"]:
        _fail("_validation_retries", "exceeds _max_validation_retries")
    if fields["iteration"] > fields["chat_cap"]:
        _fail("iteration", "exceeds chat_cap")
    # Stuck-tracker export shape (exact keys, exact types).
    tracker = fields["stuck_tracker"]
    if not isinstance(tracker, dict) or set(tracker) != set(_STUCK_TRACKER_SCHEMA):
        _fail("stuck_tracker", "has an invalid key set")
    for key, kind in _STUCK_TRACKER_SCHEMA.items():
        value = tracker[key]
        if kind == "bool" and type(value) is not bool:
            _fail("stuck_tracker", f"key {key!r} must be exactly a bool")
        elif kind == "positive_int" and (not _exact_int(value) or value < 1):
            _fail("stuck_tracker", f"key {key!r} must be a positive integer")
        elif kind == "str_list" and (
            not isinstance(value, list)
            or not all(isinstance(x, str) for x in value)
        ):
            _fail("stuck_tracker", f"key {key!r} must be a list of strings")
    # Trajectory envelope: the pieces its reconstruction touches.
    trajectory = fields["_trajectory"]
    if not isinstance(trajectory, dict):
        _fail("_trajectory", "must be an object")
    traj_iters = trajectory.get("iterations")
    if not isinstance(traj_iters, list) or not all(
        isinstance(x, dict) for x in traj_iters
    ):
        _fail("_trajectory", "iterations must be a list of objects")
    traj_rev = trajectory.get("iteration_revision")
    if not _exact_int(traj_rev) or traj_rev < 0:
        _fail("_trajectory", "iteration_revision must be a non-negative integer")
    if not isinstance(trajectory.get("history", []), list):
        _fail("_trajectory", "history must be a list")
    # Transcript shape: every entry is a message dict; content is a string
    # or a list of block dicts (round-4 blocker #2 — a [None] entry used to
    # explode later in transcript repair, outside the rejection boundary).
    if not isinstance(fields["messages"], list):
        _fail("messages", "must be a list")
    for name in ("_boundary_request_start", "_boundary_elided_replay", "_rescue_passes"):
        value = fields[name]
        if not _exact_int(value) or value < 0:
            _fail(name, "must be a non-negative integer")
    latch = fields["_char_latch"]
    if latch is not None and (not _exact_int(latch) or latch < 0):
        _fail("_char_latch", "must be null or a non-negative integer")
    gen_identity = fields["_gen_identity"]
    if gen_identity is not None and not isinstance(gen_identity, dict):
        _fail("_gen_identity", "must be null or an object of identity facts")
    for i, msg in enumerate(fields["messages"]):
        if not isinstance(msg, dict) or not isinstance(msg.get("role"), str):
            raise CheckpointInvalidError(f"messages[{i}] is not a message object")
        content = msg.get("content")
        if isinstance(content, list):
            if not all(isinstance(block, dict) for block in content):
                raise CheckpointInvalidError(
                    f"messages[{i}] has a non-object content block"
                )
        elif not isinstance(content, str):
            raise CheckpointInvalidError(
                f"messages[{i}] content has invalid type {type(content).__name__}"
            )


def restore_field_values(payload: dict, *, load_blob, stuck_tracker_cls) -> dict:
    """Persisted-field constructor kwargs for `_ChatTurn`.

    Validates the payload structurally first (CheckpointInvalidError on
    deviation — the resume flow terminally rejects BEFORE acquiring any
    lease). The resume flow combines the result with its RECONSTRUCTED
    fields (live message, fresh cancel event, current-policy tools, fresh
    trace, policy object) — see the classification at the top of this
    module.
    """
    validate_payload(payload)
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
