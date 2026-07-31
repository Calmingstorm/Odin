"""Pins for the `_ChatTurn` checkpoint codec (src/turn_state/codec.py).

The FIELD CENSUS test is the load-bearing one: every `_ChatTurn` dataclass
field must be explicitly classified PERSISTED or RECONSTRUCTED in the codec.
A new field breaks the census until classified — permanently enforcing that
a resume can never silently re-arm the one-shot anti-hedging /
anti-fabrication guard budgets (hard project rule: never weaken them).
"""

from __future__ import annotations

import dataclasses
import json
from types import SimpleNamespace

from src.discord.response_guards import StuckLoopTracker
from src.discord.tool_loop import CHAT_POLICY, _ChatTurn
from src.trajectories.saver import ToolIteration, TrajectoryTurn
from src.turn_state.codec import (
    PERSISTED_FIELDS,
    RECONSTRUCTED_FIELDS,
    compute_content_digest,
    restore_field_values,
    snapshot_chat_turn,
)

GUARD_FLAGS = [
    "fabrication_retried",
    "promise_retried",
    "unavail_retried",
    "hedging_retried",
    "code_hedging_retried",
    "premature_failure_retried",
]


class TestFieldCensus:
    def test_every_chat_turn_field_is_classified(self):
        """THE completeness pin. If this fails you added/renamed a _ChatTurn
        field: classify it in src/turn_state/codec.py (PERSISTED or
        RECONSTRUCTED, with the reason) and extend the codec round-trip."""
        actual = {f.name for f in dataclasses.fields(_ChatTurn)}
        classified = PERSISTED_FIELDS | RECONSTRUCTED_FIELDS
        assert actual == classified, (
            f"unclassified: {sorted(actual - classified)}; "
            f"stale: {sorted(classified - actual)}"
        )

    def test_classification_sets_are_disjoint(self):
        assert not (PERSISTED_FIELDS & RECONSTRUCTED_FIELDS)

    def test_every_guard_budget_is_persisted(self):
        """Resume must never grant fresh guard budgets."""
        for flag in GUARD_FLAGS:
            assert flag in PERSISTED_FIELDS
        for budget in ("continuation_count", "max_continuations",
                       "_validation_retries", "_max_validation_retries"):
            assert budget in PERSISTED_FIELDS


def _blob_dict():
    blobs: dict[str, bytes] = {}

    def store(data: bytes) -> str:
        key = f"blob:{len(blobs)}-{len(data)}"
        blobs[key] = data
        return key

    def load(ref: str) -> bytes:
        return blobs[ref]

    return blobs, store, load


IMAGE_BLOCK = {
    "type": "image",
    "source": {"type": "base64", "media_type": "image/png", "data": "aGVsbG8="},
}


def _full_turn():
    """A _ChatTurn with every persisted field forced off its default."""
    trajectory = TrajectoryTurn(
        message_id="m1", channel_id="c1", user_id="u1", user_name="user",
        timestamp="2026-07-30T12:00:00Z", source="discord",
        user_content="do the thing", system_prompt="sys",
        history=[{"role": "user", "content": "earlier"}],
    )
    trajectory.iterations.append(
        ToolIteration(
            iteration=0,
            tool_calls=[{"id": "call_1", "name": "run_command", "input": {"command": "ls"}}],
            tool_results=[{"tool": "run_command", "result": "ok"}],
            llm_text="running", input_tokens=10, output_tokens=5,
            duration_ms=1200, provider="codex", model="gpt-5.6-sol",
            reasoning_effort="xhigh",
        )
    )
    tracker = StuckLoopTracker()
    tracker.record([{"name": "run_command", "input": {"command": "ls"}}])
    tracker.warned = True

    return _ChatTurn(
        message=SimpleNamespace(),  # RECONSTRUCTED — never serialized
        policy=CHAT_POLICY,
        trace=None,
        system_prompt="sys REBOUND mid-turn",
        tools=[{"name": "run_command"}],
        messages=[
            {"role": "user", "content": "do the thing"},
            {"role": "assistant", "content": [
                {"type": "text", "text": "on it"},
                {"type": "tool_use", "id": "call_1", "name": "run_command",
                 "input": {"command": "ls"}},
            ]},
            {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "call_1", "content": "ok"},
            ]},
            {"role": "user", "content": [IMAGE_BLOCK]},
        ],
        user_id="u1",
        chat_cap=500,
        stuck_tracker=tracker,
        _trajectory=trajectory,
        _result_store_cap=2000,
        _cancel=SimpleNamespace(is_set=lambda: False),  # RECONSTRUCTED
        _ch_id="c1",
        _req_id="abcd1234",
        iteration=3,
        tools_used_in_loop=["run_command", "read_file"],
        continuation_count=2,
        max_continuations=3,
        fabrication_retried=True,
        promise_retried=True,
        unavail_retried=True,
        hedging_retried=True,
        code_hedging_retried=True,
        premature_failure_retried=True,
        pending_image_blocks=[dict(IMAGE_BLOCK)],
        _op_tool_details=[{"tool": "run_command", "detail": "x"}],
        _pending_validations=["validate ls"],
        _validation_required=True,
        _validation_retries=1,
        _max_validation_retries=2,
    )


class TestRoundTrip:
    def test_snapshot_is_json_safe_and_restores_every_persisted_field(self):
        blobs, store, load = _blob_dict()
        st = _full_turn()
        payload = snapshot_chat_turn(st, store_blob=store, generation_seq=4)
        encoded = json.dumps(payload)  # must be JSON-safe
        decoded = json.loads(encoded)

        restored = restore_field_values(
            decoded, load_blob=load, stuck_tracker_cls=StuckLoopTracker
        )
        # Scalars + containers restore verbatim.
        for name in PERSISTED_FIELDS - {"stuck_tracker", "_trajectory",
                                        "messages", "pending_image_blocks"}:
            assert restored[name] == getattr(st, name), name
        # Blob-externalized structures restore to equality.
        assert restored["messages"] == st.messages
        assert restored["pending_image_blocks"] == st.pending_image_blocks

    def test_all_guard_flags_survive_the_round_trip(self):
        """The hard-rule pin: consumed one-shot budgets stay consumed."""
        blobs, store, load = _blob_dict()
        payload = snapshot_chat_turn(_full_turn(), store_blob=store, generation_seq=1)
        restored = restore_field_values(
            json.loads(json.dumps(payload)), load_blob=load,
            stuck_tracker_cls=StuckLoopTracker,
        )
        for flag in GUARD_FLAGS:
            assert restored[flag] is True, flag
        assert restored["continuation_count"] == 2
        assert restored["_validation_retries"] == 1

    def test_stuck_tracker_state_survives(self):
        blobs, store, load = _blob_dict()
        st = _full_turn()
        payload = snapshot_chat_turn(st, store_blob=store, generation_seq=1)
        restored = restore_field_values(
            json.loads(json.dumps(payload)), load_blob=load,
            stuck_tracker_cls=StuckLoopTracker,
        )
        tracker = restored["stuck_tracker"]
        assert isinstance(tracker, StuckLoopTracker)
        assert tracker.warned is True
        assert list(tracker._fingerprints) == list(st.stuck_tracker._fingerprints)

    def test_image_data_leaves_the_payload_row(self):
        blobs, store, load = _blob_dict()
        payload = snapshot_chat_turn(_full_turn(), store_blob=store, generation_seq=1)
        assert "aGVsbG8=" not in json.dumps(payload)  # externalized
        assert len(blobs) >= 1

    def test_trajectory_restores_with_iteration_revision_guard(self):
        blobs, store, load = _blob_dict()
        st = _full_turn()
        payload = snapshot_chat_turn(st, store_blob=store, generation_seq=1)
        data = json.loads(json.dumps(payload))
        # Simulate a double-append artifact: extra iteration rows beyond the
        # saved revision must be dropped on restore (Odin round-2).
        traj = data["fields"]["_trajectory"]
        traj["iterations"] = traj["iterations"] * 3
        restored = restore_field_values(
            data, load_blob=load, stuck_tracker_cls=StuckLoopTracker
        )
        rebuilt = restored["_trajectory"]
        assert len(rebuilt.iterations) == traj["iteration_revision"] == 1
        it = rebuilt.iterations[0]
        assert it.tool_calls[0]["id"] == "call_1"
        assert rebuilt.system_prompt == "sys"
        assert rebuilt.history == [{"role": "user", "content": "earlier"}]

    def test_trajectory_tolerates_field_drift(self):
        blobs, store, load = _blob_dict()
        payload = snapshot_chat_turn(_full_turn(), store_blob=store, generation_seq=1)
        data = json.loads(json.dumps(payload))
        data["fields"]["_trajectory"]["iterations"][0]["field_from_the_future"] = 1
        restored = restore_field_values(
            data, load_blob=load, stuck_tracker_cls=StuckLoopTracker
        )
        assert len(restored["_trajectory"].iterations) == 1

    def test_real_blob_store_integration(self, tmp_path):
        from src.turn_state import TurnStateStore

        store_obj = TurnStateStore(tmp_path / "t.sqlite3", blob_dir=tmp_path / "blobs")
        st = _full_turn()
        payload = snapshot_chat_turn(
            st, store_blob=store_obj.store_blob_sync, generation_seq=1
        )
        restored = restore_field_values(
            json.loads(json.dumps(payload)),
            load_blob=store_obj.load_blob_sync,
            stuck_tracker_cls=StuckLoopTracker,
        )
        assert restored["messages"] == st.messages
        store_obj.close()

    def test_payload_metadata(self):
        blobs, store, load = _blob_dict()
        payload = snapshot_chat_turn(
            _full_turn(), store_blob=store, generation_seq=7,
            extra={"suspend_reason": "capacity"},
        )
        assert payload["policy"] == "chat"
        assert payload["generation_seq"] == 7
        assert payload["extra"] == {"suspend_reason": "capacity"}


def test_content_digest_is_full_sha256():
    digest = compute_content_digest("hello")
    assert len(digest) == 64
    assert digest != compute_content_digest("hello ")
    assert compute_content_digest("") == compute_content_digest(None or "")


class TestStorageRedaction:
    def test_tool_use_inputs_are_secret_scrubbed_at_snapshot(self):
        """Review blocker #8 (PR #242): tool arguments hit durable storage
        secret-scrubbed (audit-storage parity). Non-secret args unchanged."""
        blobs, store, load = _blob_dict()
        st = _full_turn()
        secret = "sk-" + "a" * 24
        st.messages.append({
            "role": "assistant",
            "content": [{
                "type": "tool_use", "id": "call_9", "name": "http_post",
                "input": {"url": "https://x", "auth": f"api_key={secret}"},
            }],
        })
        payload = snapshot_chat_turn(st, store_blob=store, generation_seq=2)
        encoded = json.dumps(payload)
        assert secret not in encoded
        # Innocent arguments are untouched.
        assert "https://x" in encoded


class TestStorageRedactionAllCopies:
    """Round-2 blocker #5 (PR #242): the storage scrub covers EVERY
    persisted copy of tool arguments, nested values, and tool-aware
    privacy fields."""

    def _payload_with(self, tool_name, tool_input):
        blobs, store, load = _blob_dict()
        st = _full_turn()
        st.messages.append({
            "role": "assistant",
            "content": [{
                "type": "tool_use", "id": "call_9", "name": tool_name,
                "input": tool_input,
            }],
        })
        st._trajectory.iterations.append(
            ToolIteration(
                iteration=1,
                tool_calls=[{"id": "call_9", "name": tool_name,
                             "input": tool_input}],
                tool_results=[], llm_text="", input_tokens=0, output_tokens=0,
                duration_ms=0, provider="codex", model="m",
                reasoning_effort=None,
            )
        )
        return json.dumps(snapshot_chat_turn(st, store_blob=store, generation_seq=2))

    def test_nested_secret_values_are_scrubbed_everywhere(self):
        secret = "sk-" + "b" * 24
        encoded = self._payload_with(
            "http_post",
            {"url": "https://x", "headers": {"Authorization": f"token={secret}"},
             "variants": [{"auth": f"api_key={secret}"}]},
        )
        assert secret not in encoded  # transcript AND trajectory copies
        assert "https://x" in encoded

    def test_email_body_privacy_redaction_applies(self):
        encoded = self._payload_with(
            "email_send",
            {"to": "a@b.c", "subject": "hi",
             "body": "Deeply personal contents that are not token-shaped."},
        )
        assert "Deeply personal contents" not in encoded
        assert "redacted email body" in encoded

    def test_non_string_scalars_pass_through_the_scrub(self):
        from src.turn_state.codec import scrub_stored_tool_input

        out = scrub_stored_tool_input(
            "run_command", {"count": 3, "flag": True, "ratio": 1.5, "none": None}
        )
        assert out == {"count": 3, "flag": True, "ratio": 1.5, "none": None}

    def test_op_details_copy_is_scrubbed_too(self):
        """Round-3 deviation #4 (PR #242): the _op_tool_details copy gets
        the same tool-aware + recursive scrub as every other copy."""
        blobs, store, load = _blob_dict()
        st = _full_turn()
        secret = "sk-" + "c" * 24
        st._op_tool_details.append({
            "tool": "http_post",
            "input": {"headers": {"Authorization": f"token={secret}"}},
            "result": f"posted with api_key={secret}",
            "error": False,
        })
        st._op_tool_details.append("legacy-non-dict-entry")  # passthrough arm
        payload = snapshot_chat_turn(st, store_blob=store, generation_seq=3)
        assert secret not in json.dumps(payload)

    def test_opaque_credentials_under_sensitive_keys_are_redacted(self):
        """Round-4 blocker #4 (PR #242): key-aware redaction — opaque values
        with no token-shaped signature must not survive under credential
        keys, in ANY persisted copy, at any nesting depth."""
        opaque = "not-pattern-shaped-but-sensitive-7f4d"
        encoded = self._payload_with(
            "http_post",
            {
                "url": "https://x",
                "headers": {"Authorization": f"Bearer {opaque}"},
                "password": opaque,
                "nested": {"config": {"api-key": opaque}},
            },
        )
        assert opaque not in encoded
        assert "https://x" in encoded  # innocent values untouched

    def test_sensitive_key_matching_is_exact_not_substring(self):
        from src.turn_state.codec import _is_sensitive_key

        assert _is_sensitive_key("Authorization")
        assert _is_sensitive_key("API-Key")
        assert _is_sensitive_key("refresh_token")
        assert not _is_sensitive_key("author")  # "auth" must not substring-match
        assert not _is_sensitive_key("tokenizer")
        assert not _is_sensitive_key(42)
