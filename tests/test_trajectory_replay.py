"""Tests for trajectory replay narrative + diff."""
from __future__ import annotations

from src.trajectories.replay import (
    diff_turns,
    find_diff_pair,
    summarize_turn,
)


def _sample_turn(*, message_id="m1", sequence=None, final="done") -> dict:
    iterations = []
    for i, (tool, host, out) in enumerate(sequence or []):
        iterations.append({
            "iteration": i,
            "tool_calls": [{"id": f"c{i}", "name": tool, "input": {"host": host}}],
            "tool_results": [{"tool_use_id": f"c{i}", "content": out}],
            "llm_text": f"thinking about {tool}",
            "input_tokens": 100,
            "output_tokens": 50,
        })
    return {
        "message_id": message_id,
        "channel_id": "c1",
        "user_id": "alice",
        "user_name": "alice",
        "timestamp": "2026-04-18T10:00:00Z",
        "user_content": "deploy the thing",
        "iterations": iterations,
        "tools_used": [t for t, _, _ in (sequence or [])],
        "is_error": False,
        "final_response": final,
        "total_input_tokens": len(iterations) * 100,
        "total_output_tokens": len(iterations) * 50,
        "total_duration_ms": len(iterations) * 500,
    }


class TestSummarizeTurn:
    def test_minimal(self):
        out = summarize_turn(_sample_turn(sequence=[]))
        assert "USER:" in out
        assert "deploy the thing" in out
        assert "ITERATIONS: 0" in out
        assert "OUTCOME: ok" in out

    def test_with_tools(self):
        turn = _sample_turn(sequence=[
            ("run_command", "hostA", "exit 0"),
            ("validate_action", "hostA", '{"verdict": "pass"}'),
        ])
        out = summarize_turn(turn)
        assert "run_command(host=hostA)" in out
        assert "validate_action" in out
        assert "TOOLS USED: run_command, validate_action" in out
        assert "iter 0" in out and "iter 1" in out

    def test_error_outcome(self):
        turn = _sample_turn()
        turn["is_error"] = True
        assert "OUTCOME: ERROR" in summarize_turn(turn)

    def test_truncates_long_output(self):
        big = "X" * 5000
        turn = _sample_turn(sequence=[("run_command", "h", big)])
        out = summarize_turn(turn)
        assert big not in out  # truncated
        assert "[+" in out

    def test_invalid_input(self):
        assert "invalid trajectory" in summarize_turn(None)  # type: ignore[arg-type]
        assert "invalid trajectory" in summarize_turn("not a dict")  # type: ignore[arg-type]


class TestDiffTurns:
    def test_identical_sequences(self):
        a = _sample_turn(sequence=[("run_command", "h", "ok")])
        b = _sample_turn(message_id="m2", sequence=[("run_command", "h", "ok")])
        out = diff_turns(a, b)
        assert "sequences are identical" in out
        assert "FINAL RESPONSE: (identical)" in out

    def test_divergence_step(self):
        a = _sample_turn(sequence=[
            ("run_command", "h", "ok"),
            ("validate_action", "h", '{"verdict": "pass"}'),
        ])
        b = _sample_turn(message_id="m2", sequence=[
            ("run_command", "h", "ok"),
            ("detect_runbooks", "h", "[]"),
        ])
        out = diff_turns(a, b)
        assert "first divergence at step 1" in out
        assert "validate_action" in out
        assert "detect_runbooks" in out

    def test_output_diff_same_tool(self):
        a = _sample_turn(sequence=[("run_command", "h", "exit 0: ok")])
        b = _sample_turn(message_id="m2", sequence=[("run_command", "h", "exit 1: boom")])
        out = diff_turns(a, b)
        assert "output differs" in out
        assert "ok" in out and "boom" in out

    def test_outcome_differs(self):
        a = _sample_turn(sequence=[("run_command", "h", "ok")])
        b = _sample_turn(message_id="m2", sequence=[("run_command", "h", "fail")])
        b["is_error"] = True
        out = diff_turns(a, b)
        assert "A=ok vs B=ERROR" in out

    def test_user_content_diff(self):
        a = _sample_turn()
        b = _sample_turn(message_id="m2")
        b["user_content"] = "something else entirely"
        assert "USER CONTENT differs" in diff_turns(a, b)

    def test_prefix_case(self):
        a = _sample_turn(sequence=[
            ("run_command", "h", "ok"),
            ("validate_action", "h", "pass"),
        ])
        b = _sample_turn(message_id="m2", sequence=[("run_command", "h", "ok")])
        out = diff_turns(a, b)
        assert "prefix" in out


class TestFindDiffPair:
    """Odin's Task 2 missing primitive — given a target turn, pick the
    closest counterpart automatically so diff is diagnosis not archaeology."""

    def _turn(self, mid: str, content: str, err: bool = False) -> dict:
        return {
            "message_id": mid,
            "user_content": content,
            "is_error": err,
            "iterations": [],
            "tools_used": [],
            "final_response": "",
        }

    def test_returns_none_when_no_candidates(self):
        primary = self._turn("m1", "restart nginx on prod")
        assert find_diff_pair(primary, []) is None

    def test_picks_highest_jaccard_match(self):
        primary = self._turn("m1", "deploy the staging site to prod")
        candidates = [
            self._turn("c1", "check memory usage"),            # low similarity
            self._turn("c2", "deploy the staging site to qa"), # high similarity
            self._turn("c3", "totally unrelated request"),
        ]
        match = find_diff_pair(primary, candidates)
        assert match is not None
        assert match["message_id"] == "c2"

    def test_prefers_opposite_outcome_when_match_is_strong(self):
        """When both candidates are strongly similar (above boost_floor),
        the opposite-outcome one should win — that's the diagnostic
        signal."""
        primary = self._turn("m1", "restart nginx on prod", err=False)
        candidates = [
            self._turn("c1", "restart nginx on prod today", err=False),  # sim high, same outcome
            self._turn("c2", "restart nginx on prod", err=True),          # sim high, opposite outcome
        ]
        match = find_diff_pair(primary, candidates)
        assert match["message_id"] == "c2"

    def test_weak_opposite_outcome_does_not_beat_strong_same_outcome(self):
        """Odin PR #16 re-review catch: my earlier version of this test
        was a placebo — the weak opposite candidate was filtered out by
        ``min_similarity=0.2`` before ever reaching the boost logic, so
        the test would have passed under the old flat +0.25 boost too.

        The point of the boost-floor fix is: a candidate with 0.2 ≤ sim
        < 0.35 gets NO boost, so a strong same-outcome match above 0.35
        wins even though the weak candidate has opposite outcome.

        Primary tokens (min-3-char): {run, database, migrations, today}
        c1 (same outcome, Jaccard ≈ 0.40): {run, stuff, later} ∩ primary = {run}… no wait, computed below
        c2 (opposite outcome, Jaccard ≈ 0.29): clears 0.2 floor but NOT
            0.35 boost floor, so it gets raw-similarity only. Under the
            old +0.25 boost (no floor) c2 would score ~0.54 and WIN —
            the fact that c1 wins here is the discriminating evidence
            that the boost-floor gate works.
        """
        # Primary tokens (3-char min filter): {run, database, migrations, today}
        primary = self._turn("m1", "run database migrations today", err=False)
        candidates = [
            # c1: same outcome, similarity ≈ 0.40 (above boost_floor so
            # it's a legitimate "strong same-outcome" match, but low
            # enough that a +0.25 boost on c2 would overtake it under
            # the OLD logic).
            # Tokens: {run, today, now} → 2 overlap, union 5, J = 0.40.
            self._turn("c1", "run today now", err=False),
            # c2: opposite outcome, similarity ≈ 0.286 (between 0.2 and
            # 0.35). Under OLD flat +0.25 boost: 0.286 + 0.25 = 0.536,
            # which WOULD beat c1's 0.40 — that was the placebo-test
            # hole. Under NEW boost-floor gate: sim < 0.35 so no boost,
            # final score 0.286, loses to c1's 0.40.
            # Tokens: {run, today, server, restart, tomorrow} → 2
            # overlap, union 7, J = 2/7 ≈ 0.286.
            self._turn("c2", "run today server restart tomorrow", err=True),
        ]
        match = find_diff_pair(primary, candidates)
        assert match["message_id"] == "c1", (
            "Test is meant to discriminate: under old flat-boost logic "
            "c2 would win (0.286 + 0.25 = 0.536 > c1's 0.40). If c1 "
            "loses here, the boost-floor gate isn't working."
        )

    def test_below_boost_floor_sim_is_still_considered(self):
        """Explicit guard: a candidate in the 0.2-0.35 similarity band
        is NOT filtered out — it just doesn't get the opposite-outcome
        boost. Proves the new logic exercises the boost-floor path
        rather than rejecting weak candidates wholesale."""
        primary = self._turn("m1", "run database migrations today", err=False)
        # Only one candidate, in the boost-floor gap, opposite outcome.
        # It should be returned (not None) — we're checking it got past
        # the min_similarity filter and the find_diff_pair returned the
        # best available, even if no boost applied.
        candidates = [
            self._turn("c1", "run today server restart tomorrow", err=True),
        ]
        match = find_diff_pair(primary, candidates)
        assert match is not None
        assert match["message_id"] == "c1"

    def test_boost_applies_when_both_candidates_strong(self):
        """Sanity: when both candidates exceed boost_floor, opposite
        outcome still wins (the core behavior we want to preserve)."""
        primary = self._turn("m1", "deploy staging to prod now please", err=False)
        candidates = [
            self._turn("c1", "deploy staging to prod now please", err=False),  # sim=1.0
            self._turn("c2", "deploy staging to prod now please", err=True),    # sim=1.0, opposite
        ]
        match = find_diff_pair(primary, candidates)
        assert match["message_id"] == "c2"

    def test_below_threshold_returns_none(self):
        primary = self._turn("m1", "restart nginx on prod")
        candidates = [
            self._turn("c1", "totally unrelated query about databases"),
        ]
        assert find_diff_pair(primary, candidates, min_similarity=0.3) is None

    def test_skips_self(self):
        primary = self._turn("m1", "deploy staging")
        candidates = [primary, self._turn("m2", "deploy staging")]
        match = find_diff_pair(primary, candidates)
        assert match["message_id"] == "m2"

    def test_invalid_primary_returns_none(self):
        candidates = [{"message_id": "x", "user_content": "y"}]
        assert find_diff_pair(None, candidates) is None
        assert find_diff_pair("not a dict", candidates) is None
