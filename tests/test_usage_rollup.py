"""Load-bearing coverage for the persistent Usage & Activity rollup."""
from __future__ import annotations

import asyncio
import json
import sqlite3
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from src.trajectories.saver import TrajectorySaver, TrajectoryTurn
from src.usage.provenance import accepted_usage_fields
from src.usage.rollup import UsageRollup


class FakeAudit:
    def __init__(self, path):
        self.path = path

    async def open_read_snapshot(self):
        opened = []
        seen = set()
        for path in (self.path, self.path.with_name(self.path.name + ".1")):
            if not path.exists():
                continue
            handle = open(path, "rb")
            stat = __import__("os").fstat(handle.fileno())
            identity = (stat.st_dev, stat.st_ino)
            if identity in seen:
                handle.close()
                continue
            seen.add(identity)
            opened.append((handle, stat))
        return opened


def make_rollup(tmp_path):
    trajectory = tmp_path / "trajectories"
    agents = trajectory / "agents"
    audit_path = tmp_path / "audit.jsonl"
    trajectory.mkdir(parents=True)
    agents.mkdir(parents=True)
    audit_path.touch()
    return UsageRollup(
        str(tmp_path / "usage"),
        trajectory_directory=str(trajectory),
        agent_trajectory_directory=str(agents),
        audit=FakeAudit(audit_path),
    )


def turn_record(message_id="m1", *, iterations=None):
    return {
        "message_id": message_id,
        "channel_id": "c1",
        "timestamp": datetime.now(UTC).isoformat(),
        "source": "discord",
        "iterations": iterations or [],
        "iteration_count": len(iterations or []),
        "total_duration_ms": 125,
        "is_error": False,
    }


async def drain(rollup):
    tasks = list(rollup._observer_tasks)
    if tasks:
        await asyncio.gather(*tasks)


class TestUsageProvenance:
    def test_provider_reported_input_wins_and_output_stays_separate(self):
        response = SimpleNamespace(
            server_input_tokens=812,
            server_output_tokens=None,
            output_tokens=23,
            output_token_provenance="estimated_text_v1",
        )
        snapshot = SimpleNamespace(density_milli=2500)
        result = accepted_usage_fields(
            response, chars_sent=2500, images_sent=2, snapshot=snapshot
        )
        assert result["input_tokens"] == 812
        assert result["input_token_provenance"] == "provider_reported"
        assert result["estimated_input_tokens"] == 48000
        assert result["output_tokens"] == 23
        assert result["output_token_provenance"] == "estimated_text_v1"

    def test_fallback_is_frozen_image_aware_estimator_not_four_char(self):
        response = SimpleNamespace(server_input_tokens=None, output_tokens=1)
        snapshot = SimpleNamespace(density_milli=1000)
        result = accepted_usage_fields(
            response, chars_sent=1000, images_sent=3, snapshot=snapshot
        )
        assert result["input_tokens"] == 50500
        assert result["input_token_provenance"] == "estimated_context_v1"
        assert result["input_tokens"] != 250  # CostTracker's deferred 4-char estimate


class TestPersistentFacts:
    async def test_absent_store_self_creates_and_survives_restart(self, tmp_path):
        rollup = make_rollup(tmp_path)
        assert rollup.available and rollup.db_path.exists()
        record = turn_record(
            iterations=[{
                "iteration": 1,
                "provider": "codex",
                "model": "sol",
                "input_tokens": 999,
                "server_input_tokens": 123,
                "estimated_input_tokens": 456,
                "input_token_provenance": "provider_reported",
                "output_tokens": 7,
                "output_token_provenance": "estimated_text_v1",
                "duration_ms": 50,
            }]
        )
        await rollup.observe_trajectory(record, "turn")
        first = await rollup.summary("all")
        restarted = UsageRollup(
            str(rollup.directory),
            trajectory_directory=str(rollup.trajectory_directory),
            agent_trajectory_directory=str(rollup.agent_trajectory_directory),
            audit=rollup.audit,
        )
        second = await restarted.summary("all")
        assert first["work"] == second["work"]
        assert second["work"]["input_tokens"]["provider_reported"] == 123

    async def test_insert_or_ignore_deduplicates_turn_generations_and_tools(self, tmp_path):
        rollup = make_rollup(tmp_path)
        record = turn_record(iterations=[{"iteration": 1, "input_tokens": 10}])
        await rollup.observe_trajectory(record, "turn")
        await rollup.observe_trajectory(record, "turn")
        audit = {
            "timestamp": datetime.now(UTC).isoformat(),
            "tool_name": "run_command",
            "execution_time_ms": 9,
            "error": None,
        }
        raw = json.dumps(audit).encode()
        with sqlite3.connect(rollup.db_path) as conn:
            rollup._apply_raw_rows(conn, [raw, raw], trajectory_kind=None)
            conn.commit()
            assert conn.execute("select count(*) from turn_facts").fetchone()[0] == 1
            assert conn.execute("select count(*) from generation_facts").fetchone()[0] == 1
            assert conn.execute("select count(*) from tool_facts").fetchone()[0] == 1

    async def test_legacy_rows_are_estimates_never_provider_truth(self, tmp_path):
        rollup = make_rollup(tmp_path)
        await rollup.observe_trajectory(
            turn_record(iterations=[{"iteration": 1, "input_tokens": 44, "output_tokens": 5}]),
            "turn",
        )
        summary = await rollup.summary("all")
        assert summary["work"]["input_tokens"]["legacy_estimated"] == 44
        assert summary["work"]["input_tokens"]["provider_reported"] == 0
        assert summary["work"]["input_tokens"]["approximate"] is True
        assert summary["cost"]["actual_spend_usd"] is None

    async def test_empty_store_is_honest_empty_not_unavailable(self, tmp_path):
        summary = await make_rollup(tmp_path).summary("7d")
        assert summary["available"] is True
        assert summary["work"]["settled_turns"] == 0
        assert summary["coverage"]["oldest_covered_at"] is None


class TestObserverIsolation:
    async def test_saver_writes_source_even_when_observer_raises(self, tmp_path):
        class Broken:
            def schedule_trajectory(self, *_args):
                raise RuntimeError("observer down")

        saver = TrajectorySaver(str(tmp_path / "trajectories"), usage_observer=Broken())
        turn = TrajectoryTurn(message_id="m1", channel_id="c1")
        await saver.save(turn)
        assert saver.count == 1
        assert list(saver.directory.glob("*.jsonl"))

    async def test_saver_does_not_await_statistics_writer(self, tmp_path):
        class Observer:
            called = False
            def schedule_trajectory(self, *_args):
                self.called = True

        observer = Observer()
        saver = TrajectorySaver(str(tmp_path / "trajectories"), usage_observer=observer)
        await saver.save(TrajectoryTurn(message_id="m1", channel_id="c1"))
        assert observer.called is True


class TestUpgradeBackfill:
    async def test_newest_first_bounded_resume_and_malformed_skip(self, tmp_path):
        rollup = make_rollup(tmp_path)
        directory = rollup.trajectory_directory
        old = directory / "2026-01-01.jsonl"
        new = directory / "2026-01-02.jsonl"
        old.write_text(json.dumps(turn_record("old")) + "\n")
        new.write_text("malformed\n" + json.dumps(turn_record("new")) + "\n")

        assert await rollup._one_backfill_pass() is False
        with sqlite3.connect(rollup.db_path) as conn:
            ids = {row[0] for row in conn.execute("select fact_id from turn_facts")}
        assert any("new" in value for value in ids)
        assert not any("old" in value for value in ids)

        for _ in range(10):
            if await rollup._one_backfill_pass():
                break
        summary = await rollup.summary("all")
        assert summary["coverage"]["backfill_complete"] is True
        assert summary["coverage"]["malformed_rows_skipped"] == 1
        assert summary["work"]["settled_turns"] == 2

    async def test_interrupted_backfill_resumes_without_duplication(self, tmp_path):
        rollup = make_rollup(tmp_path)
        source = rollup.trajectory_directory / "2026-01-01.jsonl"
        source.write_text("".join(json.dumps(turn_record(f"m{i}")) + "\n" for i in range(300)))
        assert await rollup._one_backfill_pass() is False
        restarted = UsageRollup(
            str(rollup.directory),
            trajectory_directory=str(rollup.trajectory_directory),
            agent_trajectory_directory=str(rollup.agent_trajectory_directory),
            audit=rollup.audit,
        )
        for _ in range(10):
            if await restarted._one_backfill_pass():
                break
        with sqlite3.connect(restarted.db_path) as conn:
            assert conn.execute("select count(*) from turn_facts").fetchone()[0] == 300

    async def test_audit_rotation_identity_dedupe_and_tail(self, tmp_path):
        rollup = make_rollup(tmp_path)
        path = rollup.audit.path
        first = json.dumps({
            "timestamp": datetime.now(UTC).isoformat(),
            "tool_name": "run_command",
            "execution_time_ms": 11,
        }) + "\n"
        path.write_text(first)
        await rollup._one_backfill_pass()
        path.rename(path.with_name(path.name + ".1"))
        path.write_text(json.dumps({
            "timestamp": datetime.now(UTC).isoformat(),
            "tool_name": "read_file",
            "execution_time_ms": 3,
            "error": "failed",
        }) + "\n")
        for _ in range(5):
            await rollup._one_backfill_pass()
        with sqlite3.connect(rollup.db_path) as conn:
            assert conn.execute("select count(*) from tool_facts").fetchone()[0] == 2

    async def test_start_returns_before_any_scan(self, tmp_path, monkeypatch):
        rollup = make_rollup(tmp_path)
        entered = asyncio.Event()
        release = asyncio.Event()

        async def blocked():
            entered.set()
            await release.wait()
            return True

        monkeypatch.setattr(rollup, "_one_backfill_pass", blocked)
        await asyncio.wait_for(rollup.start(), 0.1)
        await asyncio.wait_for(entered.wait(), 0.1)
        release.set()
        await rollup.stop()


class TestReadContract:
    async def test_summary_does_not_scan_sources_and_ro_connection_is_query_only(
        self, tmp_path, monkeypatch
    ):
        rollup = make_rollup(tmp_path)
        monkeypatch.setattr(
            rollup,
            "_trajectory_snapshots",
            lambda: (_ for _ in ()).throw(AssertionError("source scan on API read")),
        )
        summary = await rollup.summary("all")
        assert summary["available"] is True
        conn = rollup._ro_connect()
        try:
            assert conn.execute("PRAGMA query_only").fetchone()[0] == 1
            with pytest.raises(sqlite3.OperationalError):
                conn.execute("insert into usage_meta values('x','y')")
        finally:
            conn.close()


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (42, 42.0),
        (3.5, 3.5),
        (-1, None),
        (True, None),
        ("2026-08-30T00:00:00Z", 1788048000.0),
        ("broken", None),
        (None, None),
    ],
)
def test_timestamp_parser_is_total(value, expected):
    from src.usage.rollup import _parse_timestamp

    assert _parse_timestamp(value) == expected


@pytest.mark.parametrize(
    ("row", "input_tokens", "input_prov", "output_tokens", "output_prov"),
    [
        ({"input_tokens": 10, "output_tokens": 4}, 10, "legacy_estimated", 4, "legacy_estimated"),
        ({"input_token_provenance": "provider_reported", "server_input_tokens": 8,
          "output_token_provenance": "provider_reported", "server_output_tokens": 3},
         8, "provider_reported", 3, "provider_reported"),
        ({"input_token_provenance": "estimated_context_v1", "estimated_input_tokens": 7,
          "output_token_provenance": "estimated_text_v1", "output_tokens": 2},
         7, "estimated_context_v1", 2, "estimated_text_v1"),
        ({"input_token_provenance": "provider_reported", "server_input_tokens": -1,
          "output_token_provenance": "bogus", "output_tokens": 2},
         None, "unknown", None, "unknown"),
    ],
)
def test_token_provenance_classification(row, input_tokens, input_prov, output_tokens, output_prov):
    from src.usage.rollup import _generation_tokens

    assert _generation_tokens(row) == (input_tokens, input_prov, output_tokens, output_prov)


@pytest.mark.asyncio
async def test_summary_read_connection_is_query_only(tmp_path):
    rollup = make_rollup(tmp_path)
    conn = rollup._ro_connect()
    try:
        assert conn.execute("PRAGMA query_only").fetchone()[0] == 1
        with pytest.raises(Exception):
            conn.execute("DELETE FROM turn_facts")
    finally:
        conn.close()


@pytest.mark.asyncio
async def test_start_stop_is_nonblocking_and_idempotent(tmp_path):
    rollup = make_rollup(tmp_path)
    await rollup.start()
    assert rollup._task is not None
    await rollup.stop()
    assert rollup._task is None
    await rollup.stop()


@pytest.mark.asyncio
async def test_missing_store_serves_honest_unavailable(tmp_path):
    rollup = UsageRollup.__new__(UsageRollup)
    rollup.available = False
    rollup.error = "not enabled"
    data = await rollup.summary("bogus")
    assert data == {"available": False, "reason": "not enabled", "range": "7d"}


def test_audit_generic_events_are_not_tool_facts(tmp_path):
    rollup = make_rollup(tmp_path)
    raw = json.dumps({"type": "configuration", "tool_name": "save", "timestamp": 1}).encode()
    assert rollup._tool_fact(raw) is None


def test_tool_fact_accepts_duration_fallback_and_hash_identity(tmp_path):
    rollup = make_rollup(tmp_path)
    record = {"tool_name": "read_file", "timestamp": 1, "metadata": {"duration_ms": 12}}
    raw = json.dumps(record).encode()
    fact = rollup._tool_fact(raw)
    assert fact is not None
    assert fact[0].startswith("audit:") and fact[4] == 12 and fact[5] == 0


@pytest.mark.asyncio
async def test_audit_snapshot_failure_is_nonfatal(tmp_path):
    class BrokenAudit:
        async def open_read_snapshot(self):
            raise RuntimeError("boom")

    rollup = make_rollup(tmp_path)
    rollup.audit = BrokenAudit()
    assert await rollup._audit_snapshots() == []


def test_trajectory_snapshot_inode_deduplicates_hardlinks(tmp_path):
    root = tmp_path / "trajectories"
    root.mkdir()
    first = root / "a.jsonl"
    first.write_text("{}\n")
    (root / "b.jsonl").hardlink_to(first)
    audit = tmp_path / "audit.jsonl"
    audit.touch()
    agents = root / "agents"
    agents.mkdir()
    rollup = UsageRollup(
        str(tmp_path / "usage"),
        trajectory_directory=str(root),
        agent_trajectory_directory=str(agents),
        audit=FakeAudit(audit),
    )
    opened = rollup._trajectory_snapshots()
    try:
        assert len(opened) == 1
    finally:
        for _kind, _path, handle, _stat, _record_kind in opened:
            handle.close()


def test_apply_raw_rows_handles_empty_malformed_non_tool_and_wrong_trajectory(tmp_path):
    rollup = make_rollup(tmp_path)
    conn = rollup._connect()
    try:
        accepted, malformed = rollup._apply_raw_rows(
            conn,
            [b"", b"{", json.dumps({"type": "config", "timestamp": 1}).encode()],
            trajectory_kind=None,
        )
        assert (accepted, malformed) == (0, 1)
        accepted, malformed = rollup._apply_raw_rows(
            conn, [b"[]"], trajectory_kind="turn"
        )
        assert (accepted, malformed) == (0, 1)
    finally:
        conn.close()


def test_tail_and_reverse_batches_resume_without_duplication(tmp_path, monkeypatch):
    rollup = make_rollup(tmp_path)
    path = rollup.trajectory_directory / "source.jsonl"
    first = json.dumps(turn_record("old", iterations=[{"iteration": 1, "input_tokens": 2}]))
    second = json.dumps(turn_record("new", iterations=[{"iteration": 1, "input_tokens": 3}]))
    path.write_text(first + "\n" + second + "\n")
    with open(path, "rb") as handle:
        stat = __import__("os").fstat(handle.fileno())
        assert rollup._consume_reverse_batch(
            handle=handle,
            stat=stat,
            kind="trajectory",
            display_path=str(path),
            trajectory_kind="turn",
        )
    # Append a complete and one incomplete row: only the complete row advances.
    third = json.dumps(turn_record("tail", iterations=[]))
    with open(path, "ab") as handle:
        handle.write((third + "\n" + '{"message_id":"partial"').encode())
    with open(path, "rb") as handle:
        stat = __import__("os").fstat(handle.fileno())
        rollup._consume_tail(
            handle=handle,
            stat=stat,
            kind="trajectory",
            display_path=str(path),
            trajectory_kind="turn",
        )
    with rollup._connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM turn_facts").fetchone()[0] == 3
        cursor = conn.execute("SELECT high_offset FROM ingestion_cursors").fetchone()[0]
        assert cursor < path.stat().st_size


@pytest.mark.asyncio
async def test_one_backfill_pass_empty_then_malformed_is_honest(tmp_path):
    rollup = make_rollup(tmp_path)
    assert await rollup._one_backfill_pass() is True
    path = rollup.trajectory_directory / "bad.jsonl"
    path.write_text("broken\n")
    assert await rollup._one_backfill_pass() is True
    result = await rollup.summary("all")
    assert result["coverage"]["malformed_rows_skipped"] == 1
    assert result["coverage"]["backfill_complete"] is True


@pytest.mark.asyncio
async def test_summary_other_bucket_and_totals(tmp_path):
    rollup = make_rollup(tmp_path)
    for index in range(14):
        raw = json.dumps(
            {
                "tool_name": f"tool_{index}",
                "timestamp": 1 + index,
                "execution_time_ms": 10,
            }
        ).encode()
        with rollup._lock, rollup._connect() as conn:
            fact = rollup._tool_fact(raw)
            assert fact is not None
            conn.execute(
                "INSERT INTO tool_facts VALUES(?,?,?,?,?,?)", fact
            )
            conn.commit()
    data = await rollup.summary("all")
    assert data["tools"][-1]["tool_name"] == "Other"
    assert data["tools"][-1]["executions"] == 2
    totals = await rollup.totals()
    assert totals["available"] is True
    assert totals["requests"] == 0


@pytest.mark.asyncio
async def test_schedule_and_observe_failures_are_total(tmp_path, monkeypatch):
    rollup = make_rollup(tmp_path)
    rollup.available = False
    rollup.schedule_trajectory({}, "turn")
    rollup.available = True

    async def broken_to_thread(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(asyncio, "to_thread", broken_to_thread)
    await rollup.observe_trajectory({}, "turn")


@pytest.mark.asyncio
async def test_set_backfill_state_unavailable_and_failure_are_total(tmp_path, monkeypatch):
    rollup = make_rollup(tmp_path)
    rollup.available = False
    rollup._set_backfill_state(True)
    rollup.available = True
    monkeypatch.setattr(rollup, "_connect", lambda: (_ for _ in ()).throw(RuntimeError("x")))
    rollup._set_backfill_state(False)


def test_nonterminal_checkpoint_is_ignored_without_becoming_malformed(tmp_path):
    rollup = make_rollup(tmp_path)
    record = turn_record("suspended", iterations=[{"iteration": 1, "input_tokens": 2}])
    record["usage_settled"] = False
    assert rollup._ingest_trajectory(record, "turn") is True
    with rollup._connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM turn_facts").fetchone()[0] == 0


def test_torn_suffix_present_at_discovery_is_ingested_after_completion(tmp_path):
    rollup = make_rollup(tmp_path)
    path = rollup.trajectory_directory / "torn.jsonl"
    complete = json.dumps(turn_record("complete", iterations=[])) + "\n"
    torn = json.dumps(turn_record("torn", iterations=[]))
    cut = len(torn) // 2
    path.write_bytes((complete + torn[:cut]).encode())
    # First pass indexes only the complete row and leaves the suffix unclaimed.
    asyncio.run(rollup._one_backfill_pass())
    with rollup._connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM turn_facts").fetchone()[0] == 1
    with path.open("ab") as handle:
        handle.write((torn[cut:] + "\n").encode())
    asyncio.run(rollup._one_backfill_pass())
    with rollup._connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM turn_facts").fetchone()[0] == 2


def test_locked_store_construction_is_bounded(tmp_path):
    base = make_rollup(tmp_path)
    locker = base._connect()
    locker.execute("BEGIN EXCLUSIVE")
    try:
        started = __import__("time").monotonic()
        second = UsageRollup(
            str(base.directory),
            trajectory_directory=str(base.trajectory_directory),
            agent_trajectory_directory=str(base.agent_trajectory_directory),
            audit=base.audit,
        )
        elapsed = __import__("time").monotonic() - started
        assert elapsed < 0.5
        assert second.available is False
    finally:
        locker.rollback()
        locker.close()


def test_resumed_snapshot_never_mints_default_density_estimate():
    from src.usage.provenance import accepted_usage_fields

    snapshot = SimpleNamespace(density_milli=2500, base_source="persisted")
    result = accepted_usage_fields(
        SimpleNamespace(server_input_tokens=None, server_output_tokens=None),
        chars_sent=1000,
        images_sent=0,
        snapshot=snapshot,
    )
    assert result["input_tokens"] is None
    assert result["input_token_provenance"] == "unknown"


def test_missing_output_provenance_remains_unknown():
    result = accepted_usage_fields(
        SimpleNamespace(output_tokens=99),
        chars_sent=0,
        images_sent=0,
        snapshot=None,
    )
    assert result["output_tokens"] is None
    assert result["output_token_provenance"] == "unknown"


def test_oversized_row_is_bounded_skipped_and_does_not_starve_tail(tmp_path, monkeypatch):
    import src.usage.rollup as module

    monkeypatch.setattr(module, "_BACKFILL_BYTES", 128)
    rollup = make_rollup(tmp_path)
    path = rollup.trajectory_directory / "large.jsonl"
    good = json.dumps(turn_record("after-large", iterations=[]))
    path.write_bytes(b"{" + b"x" * 200 + b"}\n" + good.encode() + b"\n")
    with open(path, "rb") as handle:
        stat = __import__("os").fstat(handle.fileno())
        rollup._consume_tail(
            handle=handle,
            stat=stat,
            kind="trajectory",
            display_path=str(path),
            trajectory_kind="turn",
        )
    # Multiple bounded passes eventually traverse the source without retaining
    # the oversized payload or starving the valid later row.
    for _ in range(4):
        with open(path, "rb") as handle:
            stat = __import__("os").fstat(handle.fileno())
            rollup._consume_reverse_batch(
                handle=handle,
                stat=stat,
                kind="trajectory",
                display_path=str(path),
                trajectory_kind="turn",
            )
    with rollup._connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM turn_facts").fetchone()[0] == 1
        assert conn.execute("SELECT SUM(malformed_rows) FROM ingestion_cursors").fetchone()[0] >= 1
