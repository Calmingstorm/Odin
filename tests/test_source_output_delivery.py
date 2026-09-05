"""Source evidence survives retained serialization and real downstream guards."""

from __future__ import annotations

import json

import pytest

from src.discord.response_guards import truncate_tool_output
from src.llm.secret_scrubber import scrub_output_secrets
from src.tools.output_delivery import deliver, render_page
from src.tools.output_retention import OutputStore, RetentionError


def assert_retained_roundtrip(full, tmp_path, tool):
    store = OutputStore(tmp_path / "evidence.sqlite")
    initial = deliver(full, store=store, owner="reader", channel="channel", tool=tool)
    assert _reconstruct(initial, OutputStore(store.path)) == full


def _reconstruct(initial, store):
    assert len(initial) <= 12000
    assert truncate_tool_output(scrub_output_secrets(initial)) == initial
    page = json.loads(initial)
    assert page["retention"] == "retained"
    text = page["head"]
    expected = page["end"]
    seen = set()
    while page["cursor"]:
        cursor = page["cursor"]
        assert cursor not in seen
        seen.add(cursor)
        snapshot, offset = store.read(
            cursor, owner="reader", channel="channel", authorize=lambda tool, hosts: True
        )
        assert offset == expected
        raw = render_page(snapshot, offset=offset)
        assert len(raw) <= 12000
        assert truncate_tool_output(scrub_output_secrets(raw)) == raw
        page = json.loads(raw)
        assert page["start"] == expected
        assert page["end"] > expected
        assert "tail" not in page
        expected = page["end"]
        text += page["text"]
    return text


@pytest.mark.parametrize("status", ["succeeded", "failed"])
def test_source_middle_reconstructed_through_real_guard_after_store_reopen(tmp_path, status):
    store = OutputStore(tmp_path / "evidence.sqlite")
    full = "\n".join(f"line-{i:04}: " + "é漢" * 40 for i in range(500))
    initial = deliver(full, store=store, owner="reader", channel="channel",
                      tool="run_command", status=status)
    assert json.loads(initial)["status"] == status
    store = OutputStore(store.path)
    recovered = _reconstruct(initial, store)
    assert recovered == full
    assert "line-0250" in recovered


def test_retention_scope_revocation_expiry_and_repeatable_reads(tmp_path):
    now = [1700000000.0]
    store = OutputStore(tmp_path / "scope.sqlite", clock=lambda: now[0])
    snapshot = store.retain("full evidence", owner="reader", channel="channel",
                            tool="run_command", hosts=("target",))
    cursor = snapshot.result_id + ":5"
    authorization = []

    def allowed(tool, hosts):
        authorization.append((tool, hosts))
        return True

    for _ in range(2):
        retained, offset = store.read(cursor, owner="reader", channel="channel", authorize=allowed)
        assert retained.text == "full evidence" and offset == 5
    assert authorization == [("run_command", ("target",))] * 2
    for owner, channel in [("other", "channel"), ("reader", "other"), ("", "channel")]:
        with pytest.raises(RetentionError, match="Permission denied"):
            store.read(cursor, owner=owner, channel=channel, authorize=allowed)
    with pytest.raises(RetentionError, match="Permission denied"):
        store.read(cursor, owner="reader", channel="channel", authorize=lambda *_: False)
    now[0] += 86400
    with pytest.raises(RetentionError, match="expired or unavailable"):
        store.read(cursor, owner="reader", channel="channel", authorize=allowed)


@pytest.mark.parametrize("quota", ["per_result_bytes", "global_bytes"])
def test_retention_quota_failure_never_advertises_missing_cursor(tmp_path, quota):
    store = OutputStore(tmp_path / "quota.sqlite", **{quota: 100})
    output = deliver("x" * 13000, store=store, owner="reader", channel="channel",
                     tool="fetch_url", status="failed")
    failure = json.loads(output)
    assert failure["retention"] == "failed"
    assert failure["status"] == "failed"
    assert failure["cursor"] is None
    assert "no continuation" in failure["error"]


def test_retention_scrubs_full_source_not_only_head_and_tail(tmp_path):
    store = OutputStore(tmp_path / "scrub.sqlite")
    secret = "sk-" + "A" * 48
    full = "begin " + "x" * 20000 + " token=" + secret + " " + "z" * 20000
    output = deliver(full, store=store, owner="reader", channel="channel", tool="fetch_url")
    recovered = _reconstruct(output, OutputStore(store.path))
    assert secret not in recovered
    assert recovered == scrub_output_secrets(full)
    assert secret.encode() not in store.path.read_bytes()
