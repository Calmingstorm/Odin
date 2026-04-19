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

    def test_prefers_opposite_outcome(self):
        """A slightly-less-similar failed pair beats a more-similar success
        pair when the primary was successful — that's the diagnostic win."""
        primary = self._turn("m1", "restart nginx on prod", err=False)
        candidates = [
            self._turn("c1", "restart nginx on prod today", err=False),  # sim high, same outcome
            self._turn("c2", "restart nginx on prod", err=True),          # sim high, opposite outcome
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
