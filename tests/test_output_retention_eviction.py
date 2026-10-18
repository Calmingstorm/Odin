"""A full output store expires its oldest snapshots early instead of refusing new ones.

Eviction works on whole expiry cohorts, oldest capture first, only when that
admits the new snapshot, and never touches a snapshot under an open hold.
"""

from __future__ import annotations

import json
import sqlite3
from types import SimpleNamespace

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools import output_retention
from src.tools.executor import ToolExecutor
from src.tools.media_result import BinaryAttachment
from src.tools.output_delivery import deliver
from src.tools.output_retention import OutputStore, RetentionError
from src.tools.result_validator import ToolResult
from src.tools.runtime_delivery import deliver_runtime_result, execution_delivery_scope


class Clock:
    def __init__(self, now=1_000.0):
        self.now = now

    def __call__(self):
        return self.now


def store_at(tmp_path, clock=None, **kwargs):
    return OutputStore(tmp_path / "evidence.sqlite3", clock=clock or Clock(), **kwargs)


def retain(store, text, **kwargs):
    return store.retain(text, owner="alice", channel="room", tool="example_tool", **kwargs)


def bundle(store, *files, **kwargs):
    return store.retain_binary_bundle(
        [BinaryAttachment(index, "resource", "application/octet-stream", data)
         for index, data in enumerate(files, 1)],
        owner="alice", channel="room", tool="mcp_fixture_blob", **kwargs)


def readable(store, snapshot):
    try:
        store.read(f"{snapshot.result_id}:0", owner="alice", channel="room",
                   authorize=lambda *_: True)
    except RetentionError as exc:
        assert "expired or unavailable" in str(exc)
        return False
    return True


def rows(store):
    with sqlite3.connect(store.path) as db:
        return (db.execute("SELECT count(*) FROM outputs").fetchone()[0],
                db.execute("SELECT count(*) FROM output_blobs").fetchone()[0])


def test_eviction_expires_the_oldest_only_as_far_as_the_new_snapshot_needs(tmp_path):
    clock = Clock()
    store = store_at(tmp_path, clock, per_result_bytes=100, global_bytes=120)
    kept = []
    for _ in range(3):
        kept.append(retain(store, "a" * 40))
        clock.now += 1
    newest = retain(store, "b" * 40)
    assert [readable(store, snapshot) for snapshot in kept] == [False, True, True]
    assert readable(store, newest)


def test_an_exact_fit_evicts_nothing(tmp_path):
    store = store_at(tmp_path, per_result_bytes=100, global_bytes=100)
    first = retain(store, "a" * 60)
    second = retain(store, "b" * 40)
    assert readable(store, first) and readable(store, second)


def test_a_snapshot_that_can_never_fit_is_refused_without_eviction(tmp_path):
    store = store_at(tmp_path, per_result_bytes=200, global_bytes=100)
    first = retain(store, "a" * 60)
    with pytest.raises(RetentionError, match="Global retention quota exhausted"):
        retain(store, "b" * 150)
    assert readable(store, first)


def test_an_insert_failure_rolls_the_eviction_back(tmp_path, monkeypatch):
    clock = Clock()
    store = store_at(tmp_path, clock, per_result_bytes=100, global_bytes=100)
    oldest = retain(store, "a" * 50)
    clock.now += 1
    survivor = retain(store, "b" * 40)
    clock.now += 1
    # Reusing the survivor's id makes the INSERT fail after the oldest
    # snapshot was deleted to make room for the 60 bytes.
    monkeypatch.setattr(output_retention.uuid, "uuid4",
                        lambda: SimpleNamespace(hex=survivor.result_id))
    with pytest.raises(sqlite3.IntegrityError):
        retain(store, "c" * 60)
    assert readable(store, oldest) and readable(store, survivor)
    assert rows(store) == (2, 0)


def test_a_tied_cohort_is_evicted_whole(tmp_path):
    clock = Clock()
    store = store_at(tmp_path, clock, per_result_bytes=2000, global_bytes=2000)
    files = bundle(store, b"x" * 100)
    text = retain(store, "t" * 300)  # same clock reading: the same cohort
    clock.now += 1
    later = retain(store, "l" * 100)
    clock.now += 1
    used = sum(rows_size for rows_size in _sizes(store))
    # Only a few bytes are needed, but the oldest cohort leaves whole: the
    # bundle's manifest, its blob, and the text that shares its expiry.
    retain(store, "n" * (store.global_bytes - used + 1))
    assert not readable(store, files) and not readable(store, text)
    assert readable(store, later)
    assert rows(store) == (2, 0)


def _sizes(store):
    with sqlite3.connect(store.path) as db:
        yield from (row[0] for row in db.execute("SELECT size FROM outputs"))
        yield from (row[0] for row in db.execute("SELECT size FROM output_blobs"))


def test_a_held_bundle_survives_its_own_texts_admission(tmp_path):
    def run(held):
        clock = Clock()
        store = store_at(tmp_path / ("held" if held else "unheld"), clock,
                         per_result_bytes=3000, global_bytes=3000)
        with store.hold() as hold:
            files = bundle(store, b"x" * 1000, hold=hold if held else None)
            clock.now += 1
            try:
                retain(store, "t" * 2500, hold=hold if held else None)
                admitted = True
            except RetentionError:
                admitted = False
        return readable(store, files), admitted

    # Unheld, the text's admission evicts the bundle whose pointer is about
    # to be delivered; held, the text is refused instead and the bundle stays.
    assert run(held=False) == (False, True)
    assert run(held=True) == (True, False)


def test_an_interleaved_writer_evicts_around_a_held_bundle(tmp_path):
    clock = Clock()
    store = store_at(tmp_path, clock, per_result_bytes=3000, global_bytes=3000)
    older = retain(store, "o" * 1000)
    clock.now += 1
    with store.hold() as hold:
        files = bundle(store, b"x" * 1000, hold=hold)
        clock.now += 1
        # Another writer needs room (the bundle charges its data, 512 bytes
        # per file and its manifest): it expires the older, unheld snapshot
        # and leaves the held bundle alone.
        other = retain(store, "w" * 900)
        assert not readable(store, older)
        assert readable(store, files) and readable(store, other)
        # Room only the held bundle could give: refused, nothing deleted.
        with pytest.raises(RetentionError, match="Global retention quota exhausted"):
            retain(store, "z" * 2500)
        assert readable(store, files) and readable(store, other)
    # Once the hold closes, the bundle is the oldest cohort again.
    retain(store, "z" * 2500)
    assert not readable(store, files)


def test_holds_are_released_when_the_delivery_fails(tmp_path):
    store = store_at(tmp_path, per_result_bytes=100, global_bytes=100)
    with pytest.raises(RuntimeError):
        with store.hold() as hold:
            retain(store, "a" * 60, hold=hold)
            raise RuntimeError("delivery failed")
    assert store._holds == {}
    retain(store, "b" * 60)


def test_a_full_store_still_gives_a_new_big_output_its_cursor(tmp_path):
    clock = Clock()
    store = store_at(tmp_path, clock, per_result_bytes=40_000, global_bytes=60_000)
    old = []
    for index in range(4):
        old.append(retain(store, str(index) * 15_000))
        clock.now += 1
    delivered = json.loads(deliver("n" * 30_000, store=store, owner="alice", channel="room",
                                   tool="example_tool"))
    assert delivered["retention"] == "retained" and delivered["cursor"]
    assert [readable(store, snapshot) for snapshot in old] == [False, False, True, True]
    with pytest.raises(RetentionError, match="expired or unavailable; no continuation exists"):
        store.read(f"{old[0].result_id}:0", owner="alice", channel="room",
                   authorize=lambda *_: True)


def executor_at(tmp_path, *, global_bytes):
    executor = ToolExecutor(ToolsConfig(
        local_working_dir=str(tmp_path / "workspace"),
        audit_log_path=str(tmp_path / "data" / "audit.jsonl"),
        hosts={"bound": ToolHost(address="127.0.0.1")},
    ))
    executor._protected_roots = lambda: [str(tmp_path / "protected")]
    executor._output_store = OutputStore(tmp_path / "data" / "evidence.sqlite3",
                                         global_bytes=global_bytes)
    return executor


def delivered_pointer(executor, result):
    with execution_delivery_scope(
        "reader", "channel", allowed_tools={"get_tool_output", "mcp_fixture_blob"},
    ):
        delivered = deliver_runtime_result(executor, result, tool_name="mcp_fixture_blob",
                                           tool_input={}, user_id="reader",
                                           channel_id="channel")
    rendered = str(delivered.output)
    return rendered, json.loads(rendered.split("[output retention] ", 1)[1])


def assert_pointer_readable(executor, pointer):
    assert pointer["retention"] == "retained"
    manifest, _ = executor._ensure_output_store().read(
        pointer["retrieval"]["arguments"]["cursor"], owner="reader", channel="channel",
        authorize=lambda *_: True)
    assert json.loads(manifest.text)["attachments"][0]["total_bytes"] == 6000


def test_runtime_delivery_never_evicts_its_own_bundle_for_its_text(tmp_path):
    # The bundle and the text each fit alone, but not together.
    executor = executor_at(tmp_path, global_bytes=20_000)
    result = ToolResult("x" * 15_000, ok=True,
                        attachments=(BinaryAttachment(1, "resource", "text/plain", b"b" * 6000),))
    rendered, pointer = delivered_pointer(executor, result)
    assert_pointer_readable(executor, pointer)
    head = json.loads(rendered.split("\n[output retention] ", 1)[0])
    assert head["retention"] == "failed" and head["cursor"] is None
    assert executor._ensure_output_store()._holds == {}


def test_runtime_delivery_holds_its_bundle_against_an_interleaved_writer(tmp_path):
    executor = executor_at(tmp_path, global_bytes=20_000)
    store = executor._ensure_output_store()
    original = type(executor).deliver_output

    def interleaved(self, text, **kwargs):
        # Another writer needs nearly the whole quota between the bundle's
        # admission and this result's text. Only the held bundle could make
        # room, so that writer is refused and the pointer stays good.
        with pytest.raises(RetentionError, match="Global retention quota exhausted"):
            store.retain("w" * 15_000, owner="other", channel="elsewhere", tool="example_tool")
        return original(self, text, **kwargs)

    type(executor).deliver_output = interleaved
    try:
        result = ToolResult("short", ok=True,
                            attachments=(BinaryAttachment(1, "resource", "text/plain",
                                                          b"b" * 6000),))
        _, pointer = delivered_pointer(executor, result)
    finally:
        type(executor).deliver_output = original
    assert_pointer_readable(executor, pointer)
    assert store._holds == {}
