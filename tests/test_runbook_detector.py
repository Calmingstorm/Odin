"""Tests for the runbook pattern detector."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from src.learning.runbook_detector import (
    AuditEntry,
    RunbookSuggestion,
    detect_patterns,
    format_suggestions,
    group_into_sessions,
    suggestions_as_json,
)


def _iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _entry(ts: datetime, tool: str, *, host="hostA", actor="alice", channel="c1", error=False):
    return {
        "timestamp": _iso(ts),
        "user_id": actor,
        "user_name": actor,
        "channel_id": channel,
        "tool_name": tool,
        "tool_input": {"host": host, "command": f"{tool}-cmd"},
        "error": ("boom" if error else None),
    }


def _write_audit(path: Path, events: list[dict]) -> None:
    with path.open("w") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")


class TestAuditEntry:
    def test_skips_non_tool_rows(self):
        row = {"timestamp": _iso(datetime(2026, 4, 1)), "type": "web_action", "method": "POST"}
        assert AuditEntry.from_line(json.dumps(row)) is None

    def test_parses_tool_row(self):
        row = _entry(datetime(2026, 4, 1), "run_command")
        e = AuditEntry.from_line(json.dumps(row))
        assert e is not None
        assert e.tool_name == "run_command"
        assert e.host == "hostA"
        assert e.error is False

    def test_bad_json(self):
        assert AuditEntry.from_line("not-json") is None


class TestSessionGrouping:
    def _entries(self, rows: list[dict]) -> list[AuditEntry]:
        return [AuditEntry.from_line(json.dumps(r)) for r in rows]  # type: ignore[misc]

    def test_gap_starts_new_session(self):
        base = datetime(2026, 4, 1, 10, 0, 0)
        rows = [
            _entry(base, "run_command"),
            _entry(base + timedelta(seconds=30), "run_command"),
            # 20-minute gap, new session:
            _entry(base + timedelta(minutes=20), "run_command"),
            _entry(base + timedelta(minutes=20, seconds=10), "validate_action"),
        ]
        entries = [e for e in self._entries(rows) if e]
        sessions = group_into_sessions(entries, gap_seconds=300)
        assert len(sessions) == 2

    def test_error_breaks_session(self):
        base = datetime(2026, 4, 1, 10, 0, 0)
        rows = [
            _entry(base, "run_command"),
            _entry(base + timedelta(seconds=10), "validate_action", error=True),
            _entry(base + timedelta(seconds=20), "run_command"),
        ]
        entries = [e for e in self._entries(rows) if e]
        sessions = group_into_sessions(entries, gap_seconds=300)
        # First run_command becomes its own session; the errored entry is dropped;
        # the third entry starts a fresh session.
        assert len(sessions) == 2
        assert [e.tool_name for e in sessions[0]] == ["run_command"]
        assert [e.tool_name for e in sessions[1]] == ["run_command"]

    def test_different_actors_dont_merge(self):
        base = datetime(2026, 4, 1, 10, 0, 0)
        rows = [
            _entry(base, "run_command", actor="alice"),
            _entry(base + timedelta(seconds=10), "run_command", actor="bob"),
            _entry(base + timedelta(seconds=20), "validate_action", actor="alice"),
        ]
        entries = [e for e in self._entries(rows) if e]
        sessions = group_into_sessions(entries, gap_seconds=300)
        buckets = {tuple(e.actor for e in s) for s in sessions}
        assert {("alice", "alice"), ("bob",)} == buckets


class TestDetectPatterns:
    def test_repeated_pattern_surfaces(self, tmp_path):
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        # 3 sessions each run: write_file -> run_command
        for i in range(3):
            session_start = base + timedelta(hours=i)
            events.append(_entry(session_start, "write_file"))
            events.append(_entry(session_start + timedelta(seconds=10), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=4),
        )
        assert len(suggestions) == 1
        s = suggestions[0]
        assert s.sequence == ["write_file", "run_command"]
        assert s.frequency == 3

    def test_single_session_burst_suppressed(self, tmp_path):
        """Three repeats all inside one session shouldn't surface as recurring."""
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        # one session, six steps: three repeats of the pair
        for i in range(3):
            t = base + timedelta(seconds=i * 20)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=1),
        )
        # frequency is 3 but all in one session — should be suppressed
        assert suggestions == []

    def test_ignore_tools_filters_out(self, tmp_path):
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        for i in range(3):
            session_start = base + timedelta(hours=i)
            events.append(_entry(session_start, "read_file"))
            events.append(_entry(session_start + timedelta(seconds=10), "write_file"))
            events.append(_entry(session_start + timedelta(seconds=20), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, lookback_days=30,
            ignore_tools=["read_file"],
            now=base + timedelta(hours=4),
        )
        assert any(s.sequence == ["write_file", "run_command"] for s in suggestions)
        assert not any("read_file" in s.sequence for s in suggestions)

    def test_lookback_window_excludes_old(self, tmp_path):
        base = datetime(2026, 4, 18, 10, 0, 0)
        # ancient repeats (60 days before now) + one recent run — shouldn't qualify
        old = base - timedelta(days=60)
        events: list[dict] = []
        for i in range(3):
            t = old + timedelta(hours=i)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, lookback_days=30, now=base,
        )
        assert suggestions == []

    def test_longer_sequence_shadows_shorter(self, tmp_path):
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        for i in range(3):
            t = base + timedelta(hours=i)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
            events.append(_entry(t + timedelta(seconds=10), "validate_action"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=4),
        )
        seqs = [s.sequence for s in suggestions]
        assert ["write_file", "run_command", "validate_action"] in seqs
        # Shorter prefix ["write_file", "run_command"] should be shadowed out
        assert ["write_file", "run_command"] not in seqs

    def test_shorter_with_more_sessions_survives_shadowing(self, tmp_path):
        """If [A,B] appears in more sessions than [A,B,C], the shorter must
        survive — it's its own pattern, not a prefix we can discard."""
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        # Three sessions with the full [A,B,C] sequence
        for i in range(3):
            t = base + timedelta(hours=i)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
            events.append(_entry(t + timedelta(seconds=10), "validate_action"))
        # Three additional sessions with just [A,B] (no C)
        for i in range(3):
            t = base + timedelta(hours=10 + i)
            events.append(_entry(t, "write_file"))
            events.append(_entry(t + timedelta(seconds=5), "run_command"))
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=20),
        )
        seqs = [s.sequence for s in suggestions]
        assert ["write_file", "run_command"] in seqs
        assert ["write_file", "run_command", "validate_action"] in seqs

    def test_sample_inputs_scrub_secrets(self, tmp_path):
        """Runbook suggestions must not echo secrets from audit inputs."""
        base = datetime(2026, 4, 18, 10, 0, 0)
        events: list[dict] = []
        for i in range(3):
            t = base + timedelta(hours=i)
            events.append({
                "timestamp": _iso(t),
                "user_id": "alice",
                "user_name": "alice",
                "channel_id": "c1",
                "tool_name": "run_command",
                "tool_input": {
                    "host": "hostA",
                    "command": "curl -H 'Authorization: Bearer sk-ant-api03-SECRETSECRET1234567890abcd' https://x",
                },
                "error": None,
            })
            events.append({
                "timestamp": _iso(t + timedelta(seconds=10)),
                "user_id": "alice",
                "user_name": "alice",
                "channel_id": "c1",
                "tool_name": "validate_action",
                "tool_input": {"host": "hostA", "command": "echo ok"},
                "error": None,
            })
        audit = tmp_path / "audit.jsonl"
        _write_audit(audit, events)
        suggestions = detect_patterns(
            audit, min_frequency=3, min_length=2, max_length=5,
            now=base + timedelta(hours=5),
        )
        assert suggestions
        # Dump every sample input and assert no raw token bytes remain.
        raw = json.dumps([s.to_dict() for s in suggestions])
        assert "sk-ant-api03-SECRETSECRET1234567890abcd" not in raw

    def test_session_presence_drives_score(self):
        """Score must grow with session_count, not raw frequency."""
        now = datetime(2026, 4, 18, 12, 0, 0, tzinfo=timezone.utc)
        bursty_single_session = RunbookSuggestion(
            sequence=["a", "b"], frequency=10, session_count=2,
            hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        distributed = RunbookSuggestion(
            sequence=["a", "b"], frequency=5, session_count=5,
            hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        assert distributed.score(now=now) > bursty_single_session.score(now=now)

    def test_score_prefers_recent(self):
        now = datetime(2026, 4, 18, 12, 0, 0, tzinfo=timezone.utc)
        stale = RunbookSuggestion(
            sequence=["a", "b"], frequency=5, hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=25)),
            last_seen=_iso(now - timedelta(days=25)),
        )
        fresh = RunbookSuggestion(
            sequence=["a", "b"], frequency=5, hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        assert fresh.score(now=now) > stale.score(now=now)

    def test_diverse_sequence_beats_self_repeat(self):
        """The core operational-value fix: run_command × 5 (high frequency,
        low value) must score BELOW a 3-tool diagnostic sequence even with
        lower raw frequency."""
        now = datetime(2026, 4, 18, 12, 0, 0, tzinfo=timezone.utc)
        shallow = RunbookSuggestion(
            sequence=["run_command", "run_command", "run_command", "run_command", "run_command"],
            frequency=500, session_count=100,
            hosts=["hostA"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        diagnostic = RunbookSuggestion(
            sequence=["search_audit", "read_file", "http_probe"],
            frequency=20, session_count=10,
            hosts=["hostA"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        assert diagnostic.score(now=now) > shallow.score(now=now), (
            f"diagnostic {diagnostic.score(now=now):.2f} should beat "
            f"shallow {shallow.score(now=now):.2f}"
        )

    def test_trivial_repetition_penalty(self):
        """A pure same-tool-N-times pattern gets penalised."""
        now = datetime(2026, 4, 18, 12, 0, 0, tzinfo=timezone.utc)
        pure_repeat = RunbookSuggestion(
            sequence=["run_command"] * 5,
            frequency=100, session_count=50,
            hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        mixed = RunbookSuggestion(
            sequence=["run_command", "read_file", "run_command", "read_file", "run_command"],
            frequency=100, session_count=50,
            hosts=["h"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        # Same everything except sequence composition — mixed should score higher
        assert mixed.score(now=now) > pure_repeat.score(now=now)

    def test_session_context_user_queries_populated(self, tmp_path):
        """When trajectories_dir is provided, each suggestion carries the
        user queries that kicked off the matching sessions.

        Reflects real production timing: TrajectorySaver writes the
        trajectory at END of turn, AFTER the audit events. The matcher
        must find the trajectory whose timestamp falls inside or just
        after the session window (Odin's PR #16 review catch)."""
        audit = tmp_path / "audit.jsonl"
        traj_dir = tmp_path / "trajectories"
        traj_dir.mkdir()

        base = datetime(2026, 4, 18, 10, 0, 0)
        audit_rows: list[dict] = []
        traj_rows: list[dict] = []
        for i in range(3):
            session_start = base + timedelta(hours=i)
            audit_rows.append(_entry(session_start, "run_command"))
            audit_rows.append(_entry(
                session_start + timedelta(seconds=5), "http_probe",
            ))
            # Trajectory saved AFTER the session's last event (end of turn).
            traj_rows.append({
                "timestamp": _iso(session_start + timedelta(seconds=10)),
                "channel_id": "c1",
                "user_id": "alice",
                "user_name": "alice",
                "user_content": f"restart nginx on prod (session {i})",
                "is_error": False,
                "iterations": [],
                "tools_used": ["run_command", "http_probe"],
            })
        with audit.open("w") as f:
            for r in audit_rows:
                f.write(json.dumps(r) + "\n")
        with (traj_dir / "2026-04-18.jsonl").open("w") as f:
            for r in traj_rows:
                f.write(json.dumps(r) + "\n")

        now = datetime(2026, 4, 18, 15, 0, 0, tzinfo=timezone.utc)
        suggestions = detect_patterns(
            audit, min_frequency=3, lookback_days=30,
            trajectories_dir=traj_dir, now=now,
        )
        assert suggestions
        s = suggestions[0]
        assert s.user_queries, "expected user queries to be populated from trajectories"
        assert any("restart nginx on prod" in q for q in s.user_queries)
        assert s.linked_session_count == 3
        assert s.error_session_fraction == 0.0

    def test_session_context_reports_error_fraction(self, tmp_path):
        """A pattern whose sessions ended is_error get a non-zero
        error_session_fraction."""
        audit = tmp_path / "audit.jsonl"
        traj_dir = tmp_path / "trajectories"
        traj_dir.mkdir()
        base = datetime(2026, 4, 18, 10, 0, 0)
        audit_rows: list[dict] = []
        traj_rows: list[dict] = []
        for i in range(4):
            session_start = base + timedelta(hours=i)
            audit_rows.append(_entry(session_start, "read_file"))
            audit_rows.append(_entry(
                session_start + timedelta(seconds=5), "http_probe",
            ))
            # Trajectory saved end-of-turn (after the audit events).
            traj_rows.append({
                "timestamp": _iso(session_start + timedelta(seconds=10)),
                "channel_id": "c1",
                "user_id": "alice",
                "user_name": "alice",
                "user_content": f"probe {i}",
                "is_error": (i < 2),  # first 2 errored, last 2 ok
                "iterations": [],
            })
        with audit.open("w") as f:
            for r in audit_rows:
                f.write(json.dumps(r) + "\n")
        with (traj_dir / "x.jsonl").open("w") as f:
            for r in traj_rows:
                f.write(json.dumps(r) + "\n")

        now = datetime(2026, 4, 18, 15, 0, 0, tzinfo=timezone.utc)
        suggestions = detect_patterns(
            audit, min_frequency=4, lookback_days=30,
            trajectories_dir=traj_dir, now=now,
        )
        assert suggestions
        assert suggestions[0].error_session_fraction == 0.5
        assert suggestions[0].linked_session_count == 4

    def test_matcher_handles_trajectory_saved_after_session(self, tmp_path):
        """Odin's PR #16 review catch: TrajectorySaver writes at END of
        turn (after all audit events). The matcher must still find
        that trajectory even though its save timestamp is AFTER the
        session's first audit entry."""
        from src.learning.runbook_detector import (
            _TrajectoryRecord,
            _match_session_to_trajectory,
        )
        # Build a fake session and a trajectory saved after it.
        session_start = datetime(2026, 4, 18, 10, 0, 0, tzinfo=timezone.utc)
        session = [
            AuditEntry.from_line(json.dumps(_entry(session_start, "read_file"))),
            AuditEntry.from_line(json.dumps(_entry(
                session_start + timedelta(seconds=20), "http_probe",
            ))),
        ]
        assert all(s is not None for s in session)
        # Trajectory record saved 30 seconds AFTER session started (end of turn).
        traj_time = session_start + timedelta(seconds=30)
        index = {
            ("c1", "alice"): [
                _TrajectoryRecord(
                    ts_epoch=traj_time.timestamp(),
                    channel="c1",
                    actor="alice",
                    user_content="do the thing",
                    is_error=False,
                ),
            ],
        }
        match = _match_session_to_trajectory(session, index, max_skew_seconds=900)
        assert match is not None
        assert match.user_content == "do the thing"

    def test_matcher_prefers_closest_when_multiple_candidates(self, tmp_path):
        """With several trajectories nearby, the matcher picks the one
        closest in time to the session window."""
        from src.learning.runbook_detector import (
            _TrajectoryRecord,
            _match_session_to_trajectory,
        )
        session_start = datetime(2026, 4, 18, 10, 0, 0, tzinfo=timezone.utc)
        session = [
            AuditEntry.from_line(json.dumps(_entry(session_start, "read_file"))),
            AuditEntry.from_line(json.dumps(_entry(
                session_start + timedelta(seconds=20), "http_probe",
            ))),
        ]
        # 5 minutes before (previous turn), 30 seconds after (this turn),
        # and 1 hour after (unrelated later turn). Match should pick the 30s-after one.
        index = {
            ("c1", "alice"): [
                _TrajectoryRecord(
                    ts_epoch=(session_start - timedelta(minutes=5)).timestamp(),
                    channel="c1", actor="alice",
                    user_content="previous turn", is_error=False,
                ),
                _TrajectoryRecord(
                    ts_epoch=(session_start + timedelta(seconds=30)).timestamp(),
                    channel="c1", actor="alice",
                    user_content="correct turn", is_error=False,
                ),
                _TrajectoryRecord(
                    ts_epoch=(session_start + timedelta(hours=1)).timestamp(),
                    channel="c1", actor="alice",
                    user_content="later turn", is_error=False,
                ),
            ],
        }
        match = _match_session_to_trajectory(session, index, max_skew_seconds=900)
        assert match is not None
        assert match.user_content == "correct turn"

    def test_matcher_rejects_beyond_skew_window(self, tmp_path):
        from src.learning.runbook_detector import (
            _TrajectoryRecord,
            _match_session_to_trajectory,
        )
        session_start = datetime(2026, 4, 18, 10, 0, 0, tzinfo=timezone.utc)
        session = [
            AuditEntry.from_line(json.dumps(_entry(session_start, "read_file"))),
        ]
        # Trajectory 2 hours after session — way outside the 15-minute skew.
        index = {
            ("c1", "alice"): [
                _TrajectoryRecord(
                    ts_epoch=(session_start + timedelta(hours=2)).timestamp(),
                    channel="c1", actor="alice",
                    user_content="unrelated later turn", is_error=False,
                ),
            ],
        }
        match = _match_session_to_trajectory(session, index, max_skew_seconds=900)
        assert match is None

    def test_session_context_absent_when_no_trajectories_dir(self, tmp_path):
        """Backward-compat: omitting trajectories_dir leaves the new fields empty."""
        audit = tmp_path / "audit.jsonl"
        base = datetime(2026, 4, 18, 10, 0, 0)
        rows = []
        for i in range(3):
            t = base + timedelta(hours=i)
            rows.append(_entry(t, "read_file"))
            rows.append(_entry(t + timedelta(seconds=5), "http_probe"))
        _write_audit(audit, rows)
        now = datetime(2026, 4, 18, 15, 0, 0, tzinfo=timezone.utc)
        suggestions = detect_patterns(audit, min_frequency=3, now=now)
        assert suggestions
        assert suggestions[0].user_queries == []
        assert suggestions[0].linked_session_count == 0

    def test_multi_host_scores_higher(self):
        """A pattern observed across 3 hosts beats the same pattern on 1 host."""
        now = datetime(2026, 4, 18, 12, 0, 0, tzinfo=timezone.utc)
        single_host = RunbookSuggestion(
            sequence=["a", "b", "c"], frequency=10, session_count=5,
            hosts=["hostA"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        multi_host = RunbookSuggestion(
            sequence=["a", "b", "c"], frequency=10, session_count=5,
            hosts=["hostA", "hostB", "hostC"], actors=["alice"],
            first_seen=_iso(now - timedelta(days=1)),
            last_seen=_iso(now - timedelta(days=1)),
        )
        assert multi_host.score(now=now) > single_host.score(now=now)


class TestFormatters:
    def test_empty_summary(self):
        assert "No runbook candidates" in format_suggestions([])

    def test_summary_has_arrow(self):
        s = RunbookSuggestion(
            sequence=["write_file", "run_command"], frequency=3,
            hosts=["hostA"], actors=["alice"],
            first_seen="2026-04-01T10:00:00Z",
            last_seen="2026-04-17T10:00:00Z",
        )
        text = format_suggestions([s])
        assert "write_file -> run_command" in text
        assert "hostA" in text

    def test_json_roundtrips(self):
        s = RunbookSuggestion(
            sequence=["write_file"], frequency=3,
            hosts=["hostA"], actors=["alice"],
            first_seen="2026-04-01T10:00:00Z",
            last_seen="2026-04-17T10:00:00Z",
        )
        payload = json.loads(suggestions_as_json([s]))
        assert payload[0]["sequence"] == ["write_file"]
        assert payload[0]["score"] >= 0
