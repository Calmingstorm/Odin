"""Pins immutable evidence and the actual downstream delivery guard."""
import json
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest

from src.discord.response_guards import truncate_tool_output
from src.tools.output_delivery import RankedOutput, deliver, get_delivery_budget, render_page
from src.tools.output_retention import OutputStore, RetentionError


def store_at(tmp_path, **kwargs):
    return OutputStore(tmp_path / "evidence.sqlite3", **kwargs)


def read(store, cursor, **kwargs):
    return store.read(cursor, owner=kwargs.get("owner", "alice"),
                      channel=kwargs.get("channel", "room"),
                      authorize=kwargs.get("authorize", lambda tool, hosts: True))


def retain(store, text, **kwargs):
    return store.retain(text, owner="alice", channel="room", tool="example_tool", **kwargs)


@pytest.mark.parametrize("body", ["long output\n"*3000, '\\"\n\t'*9000, "é😀漢字"*9000])
def test_serialized_budget_real_guard_and_contiguous_reconstruction(tmp_path, body):
    store = store_at(tmp_path)
    preview = deliver(body, store=store, owner="alice", channel="room", tool="example_tool")
    assert len(preview) <= 12000
    assert truncate_tool_output(preview) == preview
    initial = json.loads(preview)
    assert initial["head"] == body[:initial["end"]]
    assert initial["tail"]["text"] == body[initial["tail"]["start"]:]
    assert initial["tail_is_context_only"]
    reconstructed = initial["head"]
    cursor = initial["cursor"]
    while cursor:
        snapshot, offset = read(store, cursor)
        raw = render_page(snapshot, offset=offset)
        assert len(raw) <= 12000
        assert truncate_tool_output(raw) == raw
        page = json.loads(raw)
        assert "tail" not in page and page["start"] == len(reconstructed)
        assert page["end"] > page["start"]
        reconstructed += page["text"]
        cursor = page["cursor"]
    assert reconstructed == body


def test_restart_fixed_expiry_and_no_read_extension(tmp_path):
    clock = [1000.0]
    store = store_at(tmp_path, clock=lambda: clock[0])
    snap = retain(store, "durable evidence")
    cursor = f"{snap.result_id}:0"
    restarted = store_at(tmp_path, clock=lambda: clock[0])
    clock[0] += 86399
    copy, _ = read(restarted, cursor)
    assert copy.text == snap.text and copy.expires_at == snap.expires_at
    clock[0] += 1
    with pytest.raises(RetentionError, match="expired"):
        read(restarted, cursor)


def test_scope_and_live_authorization_rechecked_before_body(tmp_path):
    store = store_at(tmp_path)
    snap = retain(store, "private evidence", hosts=("host-generation-one",))
    cursor = f"{snap.result_id}:0"
    for scope in ({"owner": "bob"}, {"channel": "other"},
                  {"authorize": lambda tool, hosts: False}):
        with pytest.raises(RetentionError, match="Permission denied"):
            read(store, cursor, **scope)
    seen = []
    read(store, cursor, authorize=lambda tool, hosts: seen.append((tool, hosts)) or True)
    assert seen == [("example_tool", ("host-generation-one",))]


def test_scrub_before_immutable_storage_and_page_boundaries(tmp_path):
    store = store_at(tmp_path)
    body = "x"*10000 + "\npassword=supersecretfixture123\n" + "y"*10000
    snap = retain(store, body)
    assert "supersecretfixture123" not in snap.text
    assert "[REDACTED]" in snap.text
    assert b"supersecretfixture123" not in store.path.read_bytes()
    assert store.path.stat().st_mode & 0o777 == 0o600
    again, _ = read(store, f"{snap.result_id}:0")
    assert again == snap


def test_quota_failure_never_promises_missing_cursor(tmp_path):
    store = store_at(tmp_path, per_result_bytes=20000, global_bytes=25000)
    first = retain(store, "a"*16000)
    failed = json.loads(deliver("b"*16000, store=store, owner="alice", channel="room"))
    assert failed["retention"] == "failed" and failed["cursor"] is None
    assert read(store, f"{first.result_id}:0")[0] == first
    with pytest.raises(RetentionError, match="Per-result"):
        retain(store, "é"*15000)


def test_concurrent_quota_admission_is_atomic(tmp_path):
    store = store_at(tmp_path, per_result_bytes=100, global_bytes=100)
    def attempt(_):
        try:
            retain(store, "x"*60)
            return True
        except RetentionError:
            return False
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sum(pool.map(attempt, range(4))) == 1


def test_retention_io_failure_is_explicit(tmp_path):
    blocked = tmp_path / "blocked"
    blocked.write_text("not a directory")
    result = json.loads(deliver("a"*14000, store=OutputStore(blocked / "db"), owner="alice"))
    assert result["retention"] == "failed" and result["cursor"] is None


def test_status_separate_from_preview_and_valid_structured_envelope(tmp_path):
    body = json.dumps({"results": ["data"]*10000})
    result = json.loads(deliver(body, store=store_at(tmp_path), owner="alice", status="failed"))
    assert result["status"] == "failed" and result["truncated"]
    assert result["retrieval"]["tool"] == "get_tool_output"
    assert set(result["retrieval"]["arguments"]) == {"cursor", "limit"}


def test_ranked_snapshot_full_matches_not_short_snippets(tmp_path):
    store = store_at(tmp_path)
    matches = tuple(f"rank {i}: " + str(i)*3500 for i in range(8))
    result = json.loads(deliver(RankedOutput("short snippets", matches=matches),
                                store=store, owner="alice", channel="room"))
    assert result["matches"]["total_returned"] == 8
    assert result["matches"]["showing"] > 0
    assert not result["matches"]["fragment"]
    snap, _ = read(store, result["cursor"])
    assert snap.text == "\n\n".join(matches)
    assert result["end"] in snap.boundaries


def test_oversized_search_match_advances_and_reconstructs(tmp_path):
    store = store_at(tmp_path)
    snap = retain(store, RankedOutput("snippet", matches=("😀"*9000, "second")))
    offset, text = 0, ""
    while offset < len(snap.text):
        page = json.loads(render_page(snap, offset=offset, budget=1024))
        assert page["end"] > offset
        offset = page["end"]
        text += page["text"]
    assert text == snap.text


def test_small_budget_explicit_no_nonadvancing_cursor(tmp_path):
    snap = retain(store_at(tmp_path), "😀"*100)
    result = json.loads(render_page(snap, budget=400))
    assert result["retention"] == "failed" and result["cursor"] is None


def test_shared_configurable_budget_and_invalid_cursor(tmp_path):
    assert get_delivery_budget(SimpleNamespace(tool_output_max_chars=2048)) == 2048
    assert get_delivery_budget() == 12000
    store = store_at(tmp_path)
    for value in ("invalid", "x:3", "x:y", None):
        with pytest.raises(RetentionError, match="Invalid"):
            read(store, value)


def test_normal_short_search_and_text_unchanged(tmp_path):
    store = store_at(tmp_path)
    text = RankedOutput("Showing results:\n\nfirst\n\nsecond", matches=("first", "second"))
    assert deliver(text, store=store) is text
    assert deliver("ordinary output", store=store) == "ordinary output"
    assert not store.path.exists()


def test_minimal_eof_candidate_fits_after_metadata_removed(tmp_path):
    snap = retain(store_at(tmp_path), "x"*1000)
    result = json.loads(render_page(snap, budget=1400, limit=2000))
    assert result["text"] == snap.text and result["cursor"] is None


def test_expired_read_deletes_evidence(tmp_path):
    import sqlite3
    clock = [0]
    store = store_at(tmp_path, clock=lambda: clock[0])
    snap = retain(store, "expires")
    clock[0] = 86400
    with pytest.raises(RetentionError):
        read(store, f"{snap.result_id}:0")
    with sqlite3.connect(store.path) as db:
        assert db.execute("SELECT count(*) FROM outputs").fetchone()[0] == 0


def test_replay_concurrent_readers_do_not_advance_each_other(tmp_path):
    store = store_at(tmp_path)
    snap = retain(store, "immutable"*2000)
    cursor = f"{snap.result_id}:123"
    def page(_):
        snapshot, offset = read(store, cursor)
        return render_page(snapshot, offset=offset)
    with ThreadPoolExecutor(max_workers=4) as pool:
        pages = list(pool.map(page, range(12)))
    assert len(set(pages)) == 1
