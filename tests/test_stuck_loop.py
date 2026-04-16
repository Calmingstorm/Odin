"""Tests for detect_stuck_loop — stuck iteration detection for agents/loops.

Round 42: 17 test classes covering fingerprinting, simple repetition, cyclic
repetition, names-only mode, StuckLoopTracker lifecycle, edge cases, and
integration with the retry message.
"""
from __future__ import annotations

import pytest

from src.discord.response_guards import (
    StuckLoopTracker,
    _STUCK_LOOP_RETRY_MSG,
    _detect_stuck_from_fingerprints,
    _fingerprint_tool_calls,
    detect_stuck_loop,
)

# ---------------------------------------------------------------------------
# Helpers — reusable tool call fixtures
# ---------------------------------------------------------------------------

def _tc(name: str, **kwargs) -> dict:
    """Shorthand for a tool call dict."""
    return {"name": name, "input": kwargs}


TC_LS = _tc("run_command", command="ls -la", address="localhost")
TC_LS2 = _tc("run_command", command="ls -la", address="localhost")  # same args
TC_CAT = _tc("run_command", command="cat /etc/hosts", address="localhost")
TC_READ = _tc("read_file", path="/tmp/test.txt")
TC_SEARCH = _tc("search_knowledge", query="deployment")
TC_STATUS = _tc("run_command", command="systemctl status nginx", address="prod")
TC_DEPLOY = _tc("run_command", command="deploy.sh", address="prod")
TC_EMPTY_ARGS = {"name": "list_tools", "input": {}}


# ===================================================================
# 1. Fingerprint function tests
# ===================================================================

class TestFingerprintBasics:
    """_fingerprint_tool_calls: basic behavior."""

    def test_empty_returns_empty_string(self):
        assert _fingerprint_tool_calls([]) == ""

    def test_single_tool_has_name_and_hash(self):
        fp = _fingerprint_tool_calls([TC_LS])
        assert fp.startswith("run_command:")
        assert len(fp.split(":")) == 2
        assert len(fp.split(":")[1]) == 16  # SHA256 prefix

    def test_same_calls_same_fingerprint(self):
        fp1 = _fingerprint_tool_calls([TC_LS])
        fp2 = _fingerprint_tool_calls([TC_LS2])
        assert fp1 == fp2

    def test_different_args_different_fingerprint(self):
        fp1 = _fingerprint_tool_calls([TC_LS])
        fp2 = _fingerprint_tool_calls([TC_CAT])
        assert fp1 != fp2

    def test_different_tools_different_fingerprint(self):
        fp1 = _fingerprint_tool_calls([TC_LS])
        fp2 = _fingerprint_tool_calls([TC_READ])
        assert fp1 != fp2

    def test_order_matters(self):
        fp1 = _fingerprint_tool_calls([TC_LS, TC_READ])
        fp2 = _fingerprint_tool_calls([TC_READ, TC_LS])
        assert fp1 != fp2

    def test_multiple_tools_pipe_separated(self):
        fp = _fingerprint_tool_calls([TC_LS, TC_READ])
        assert "|" in fp
        parts = fp.split("|")
        assert len(parts) == 2
        assert parts[0].startswith("run_command:")
        assert parts[1].startswith("read_file:")

    def test_empty_args_consistent(self):
        fp1 = _fingerprint_tool_calls([TC_EMPTY_ARGS])
        fp2 = _fingerprint_tool_calls([TC_EMPTY_ARGS])
        assert fp1 == fp2
        assert fp1.startswith("list_tools:")

    def test_non_dict_args_treated_as_empty(self):
        tc1 = {"name": "foo", "input": "not a dict"}
        tc2 = {"name": "foo", "input": {}}
        fp1 = _fingerprint_tool_calls([tc1])
        fp2 = _fingerprint_tool_calls([tc2])
        assert fp1 == fp2

    def test_arguments_key_fallback(self):
        tc = {"name": "test_tool", "arguments": {"x": 1}}
        fp = _fingerprint_tool_calls([tc])
        assert fp.startswith("test_tool:")
        # Should match a tc with "input" key containing same args
        tc2 = {"name": "test_tool", "input": {"x": 1}}
        assert _fingerprint_tool_calls([tc]) == _fingerprint_tool_calls([tc2])

    def test_missing_name_key(self):
        fp = _fingerprint_tool_calls([{"input": {"a": 1}}])
        assert fp.startswith(":")

    def test_missing_input_key(self):
        fp = _fingerprint_tool_calls([{"name": "test"}])
        assert fp.startswith("test:")


class TestFingerprintNamesOnly:
    """_fingerprint_tool_calls: names_only mode."""

    def test_names_only_ignores_args(self):
        fp1 = _fingerprint_tool_calls([TC_LS], names_only=True)
        fp2 = _fingerprint_tool_calls([TC_CAT], names_only=True)
        assert fp1 == fp2  # both "run_command"

    def test_names_only_different_tools(self):
        fp1 = _fingerprint_tool_calls([TC_LS], names_only=True)
        fp2 = _fingerprint_tool_calls([TC_READ], names_only=True)
        assert fp1 != fp2

    def test_names_only_preserves_order(self):
        fp1 = _fingerprint_tool_calls([TC_LS, TC_READ], names_only=True)
        fp2 = _fingerprint_tool_calls([TC_READ, TC_LS], names_only=True)
        assert fp1 != fp2

    def test_names_only_format(self):
        fp = _fingerprint_tool_calls([TC_LS, TC_READ], names_only=True)
        assert fp == "run_command|read_file"

    def test_names_only_empty(self):
        assert _fingerprint_tool_calls([], names_only=True) == ""


class TestFingerprintDeterminism:
    """Fingerprints are deterministic regardless of dict ordering."""

    def test_dict_key_order_irrelevant(self):
        tc1 = {"name": "foo", "input": {"b": 2, "a": 1, "c": 3}}
        tc2 = {"name": "foo", "input": {"a": 1, "c": 3, "b": 2}}
        assert _fingerprint_tool_calls([tc1]) == _fingerprint_tool_calls([tc2])

    def test_nested_dict_deterministic(self):
        tc1 = {"name": "x", "input": {"opts": {"z": 1, "a": 2}}}
        tc2 = {"name": "x", "input": {"opts": {"a": 2, "z": 1}}}
        assert _fingerprint_tool_calls([tc1]) == _fingerprint_tool_calls([tc2])

    def test_list_args_order_preserved(self):
        tc1 = {"name": "x", "input": {"items": [1, 2, 3]}}
        tc2 = {"name": "x", "input": {"items": [3, 2, 1]}}
        assert _fingerprint_tool_calls([tc1]) != _fingerprint_tool_calls([tc2])

    def test_special_types_default_str(self):
        tc = {"name": "x", "input": {"val": object()}}
        fp = _fingerprint_tool_calls([tc])
        assert fp.startswith("x:")


# ===================================================================
# 2. Core detection from fingerprints
# ===================================================================

class TestDetectStuckFromFingerprints:
    """_detect_stuck_from_fingerprints: low-level detection."""

    def test_too_few_fingerprints(self):
        stuck, cl = _detect_stuck_from_fingerprints(["a", "a"], 3, 3)
        assert not stuck
        assert cl == 0

    def test_simple_repetition_detected(self):
        stuck, cl = _detect_stuck_from_fingerprints(["a", "a", "a"], 3, 3)
        assert stuck
        assert cl == 1

    def test_simple_repetition_longer(self):
        stuck, cl = _detect_stuck_from_fingerprints(["a"] * 5, 3, 3)
        assert stuck
        assert cl == 1

    def test_cycle_length_2(self):
        fps = ["a", "b", "a", "b", "a", "b"]
        stuck, cl = _detect_stuck_from_fingerprints(fps, 3, 3)
        assert stuck
        assert cl == 2

    def test_cycle_length_3(self):
        fps = ["a", "b", "c", "a", "b", "c", "a", "b", "c"]
        stuck, cl = _detect_stuck_from_fingerprints(fps, 3, 3)
        assert stuck
        assert cl == 3

    def test_cycle_not_enough_repeats(self):
        fps = ["a", "b", "a", "b"]  # only 2 repeats of length 2
        stuck, cl = _detect_stuck_from_fingerprints(fps, 3, 3)
        assert not stuck

    def test_no_repetition(self):
        fps = ["a", "b", "c", "d", "e"]
        stuck, cl = _detect_stuck_from_fingerprints(fps, 3, 3)
        assert not stuck

    def test_broken_cycle(self):
        fps = ["a", "b", "a", "b", "a", "c"]  # broken at end
        stuck, cl = _detect_stuck_from_fingerprints(fps, 3, 3)
        assert not stuck

    def test_empty_fingerprints_not_stuck(self):
        fps = ["", "", ""]  # empty tool calls
        stuck, cl = _detect_stuck_from_fingerprints(fps, 3, 3)
        assert not stuck

    def test_mixed_empty_and_non_empty(self):
        fps = ["", "a", "", "a", "", "a"]
        stuck, cl = _detect_stuck_from_fingerprints(fps, 3, 3)
        assert stuck  # cycle ["", "a"] repeated 3 times — at least one non-empty
        assert cl == 2

    def test_trailing_repetition_matters(self):
        fps = ["x", "y", "a", "a", "a"]
        stuck, cl = _detect_stuck_from_fingerprints(fps, 3, 3)
        assert stuck
        assert cl == 1

    def test_min_repeats_4(self):
        fps = ["a", "a", "a"]
        stuck, _ = _detect_stuck_from_fingerprints(fps, 4, 3)
        assert not stuck
        fps = ["a", "a", "a", "a"]
        stuck, _ = _detect_stuck_from_fingerprints(fps, 4, 3)
        assert stuck

    def test_max_cycle_length_1(self):
        fps = ["a", "b", "a", "b", "a", "b"]
        stuck, _ = _detect_stuck_from_fingerprints(fps, 3, 1)
        assert not stuck  # cycle len 2, but max is 1

    def test_cycle_with_leading_noise(self):
        fps = ["z", "q", "a", "b", "a", "b", "a", "b"]
        stuck, cl = _detect_stuck_from_fingerprints(fps, 3, 3)
        assert stuck
        assert cl == 2

    def test_empty_list(self):
        stuck, cl = _detect_stuck_from_fingerprints([], 3, 3)
        assert not stuck


# ===================================================================
# 3. Public detect_stuck_loop API
# ===================================================================

class TestDetectStuckLoop:
    """detect_stuck_loop: public API with raw tool call dicts."""

    def test_identical_iterations_detected(self):
        iters = [[TC_LS, TC_READ]] * 3
        assert detect_stuck_loop(iters) is True

    def test_different_iterations_not_detected(self):
        iters = [
            [TC_LS],
            [TC_CAT],
            [TC_READ],
        ]
        assert detect_stuck_loop(iters) is False

    def test_too_few_iterations(self):
        iters = [[TC_LS]] * 2
        assert detect_stuck_loop(iters) is False

    def test_cycle_of_two(self):
        iter_a = [TC_LS, TC_READ]
        iter_b = [TC_CAT, TC_SEARCH]
        iters = [iter_a, iter_b, iter_a, iter_b, iter_a, iter_b]
        assert detect_stuck_loop(iters) is True

    def test_empty_iterations_not_stuck(self):
        iters = [[], [], []]
        assert detect_stuck_loop(iters) is False

    def test_single_tool_repetition(self):
        iters = [[TC_STATUS]] * 4
        assert detect_stuck_loop(iters) is True

    def test_same_tools_different_args_not_stuck(self):
        iters = [
            [_tc("run_command", command="ls /tmp")],
            [_tc("run_command", command="ls /var")],
            [_tc("run_command", command="ls /etc")],
        ]
        assert detect_stuck_loop(iters) is False

    def test_names_only_same_tools_different_args_stuck(self):
        iters = [
            [_tc("run_command", command="ls /tmp")],
            [_tc("run_command", command="ls /var")],
            [_tc("run_command", command="ls /etc")],
        ]
        assert detect_stuck_loop(iters, names_only=True) is True

    def test_custom_min_repeats(self):
        iters = [[TC_LS]] * 3
        assert detect_stuck_loop(iters, min_repeats=4) is False
        iters = [[TC_LS]] * 4
        assert detect_stuck_loop(iters, min_repeats=4) is True

    def test_custom_max_cycle_length(self):
        iter_a = [TC_LS]
        iter_b = [TC_CAT]
        iter_c = [TC_READ]
        iters = [iter_a, iter_b, iter_c] * 3
        assert detect_stuck_loop(iters, max_cycle_length=2) is False
        assert detect_stuck_loop(iters, max_cycle_length=3) is True

    def test_mixed_tool_counts_per_iteration(self):
        iters = [
            [TC_LS, TC_READ],
            [TC_LS, TC_READ],
            [TC_LS, TC_READ],
        ]
        assert detect_stuck_loop(iters) is True

    def test_different_tool_counts_not_stuck(self):
        iters = [
            [TC_LS],
            [TC_LS, TC_READ],
            [TC_LS],
        ]
        assert detect_stuck_loop(iters) is False

    def test_real_world_scenario_status_check_loop(self):
        """Agent stuck checking service status in a loop."""
        check = [_tc("run_command", command="systemctl status nginx", address="prod")]
        iters = [check] * 5
        assert detect_stuck_loop(iters) is True

    def test_real_world_scenario_deploy_retry_loop(self):
        """Agent stuck retrying deploy then checking status."""
        deploy = [TC_DEPLOY]
        status = [TC_STATUS]
        iters = [deploy, status, deploy, status, deploy, status]
        assert detect_stuck_loop(iters) is True

    def test_real_world_scenario_search_refine(self):
        """Agent refining search queries — NOT stuck."""
        iters = [
            [_tc("search_knowledge", query="deploy error")],
            [_tc("search_knowledge", query="nginx 502 deploy")],
            [_tc("search_knowledge", query="502 bad gateway fix")],
        ]
        assert detect_stuck_loop(iters) is False


class TestDetectStuckLoopEdgeCases:
    """detect_stuck_loop: edge cases and boundary conditions."""

    def test_single_iteration(self):
        assert detect_stuck_loop([[TC_LS]]) is False

    def test_empty_input(self):
        assert detect_stuck_loop([]) is False

    def test_min_repeats_1_always_stuck(self):
        assert detect_stuck_loop([[TC_LS]], min_repeats=1) is True

    def test_min_repeats_1_empty_not_stuck(self):
        assert detect_stuck_loop([[]], min_repeats=1) is False

    def test_very_long_history_detected(self):
        iters = [[TC_LS, TC_READ]] * 20
        assert detect_stuck_loop(iters) is True

    def test_repetition_at_end_only(self):
        iters = [
            [TC_CAT],
            [TC_READ],
            [TC_SEARCH],
            [TC_LS],
            [TC_LS],
            [TC_LS],
        ]
        assert detect_stuck_loop(iters) is True

    def test_repetition_at_start_not_end(self):
        iters = [
            [TC_LS],
            [TC_LS],
            [TC_LS],
            [TC_CAT],
            [TC_READ],
        ]
        assert detect_stuck_loop(iters) is False

    def test_tool_calls_with_no_name(self):
        tc_noname = {"input": {"x": 1}}
        iters = [[tc_noname]] * 3
        assert detect_stuck_loop(iters) is True

    def test_tool_calls_with_no_input(self):
        tc_noinput = {"name": "list_tools"}
        iters = [[tc_noinput]] * 3
        assert detect_stuck_loop(iters) is True

    def test_cycle_length_equals_history(self):
        iters = [
            [TC_LS],
            [TC_CAT],
            [TC_READ],
            [TC_LS],
            [TC_CAT],
            [TC_READ],
            [TC_LS],
            [TC_CAT],
            [TC_READ],
        ]
        assert detect_stuck_loop(iters, min_repeats=3, max_cycle_length=3) is True


# ===================================================================
# 4. StuckLoopTracker stateful class
# ===================================================================

class TestStuckLoopTrackerInit:
    """StuckLoopTracker initialization."""

    def test_default_construction(self):
        tracker = StuckLoopTracker()
        assert tracker.warned is False
        assert tracker.iteration_count == 0

    def test_custom_params(self):
        tracker = StuckLoopTracker(
            window_size=20, min_repeats=5, max_cycle_length=4, names_only=True
        )
        assert tracker.warned is False
        assert tracker.iteration_count == 0

    def test_slots_defined(self):
        tracker = StuckLoopTracker()
        assert hasattr(tracker, "__slots__")


class TestStuckLoopTrackerRecord:
    """StuckLoopTracker.record: recording iterations."""

    def test_record_increments_count(self):
        tracker = StuckLoopTracker()
        tracker.record([TC_LS])
        assert tracker.iteration_count == 1
        tracker.record([TC_CAT])
        assert tracker.iteration_count == 2

    def test_record_empty_tool_calls(self):
        tracker = StuckLoopTracker()
        tracker.record([])
        assert tracker.iteration_count == 1

    def test_window_size_enforced(self):
        tracker = StuckLoopTracker(window_size=5)
        for i in range(10):
            tracker.record([_tc("tool", idx=i)])
        assert tracker.iteration_count == 5

    def test_record_does_not_modify_input(self):
        calls = [TC_LS, TC_READ]
        original = list(calls)
        tracker = StuckLoopTracker()
        tracker.record(calls)
        assert calls == original


class TestStuckLoopTrackerCheck:
    """StuckLoopTracker.check: detection via stateful tracker."""

    def test_not_stuck_initially(self):
        tracker = StuckLoopTracker()
        assert tracker.check() is False

    def test_not_stuck_insufficient_history(self):
        tracker = StuckLoopTracker()
        tracker.record([TC_LS])
        tracker.record([TC_LS])
        assert tracker.check() is False

    def test_stuck_after_repetition(self):
        tracker = StuckLoopTracker()
        for _ in range(3):
            tracker.record([TC_LS, TC_READ])
        assert tracker.check() is True

    def test_stuck_cycle_detection(self):
        tracker = StuckLoopTracker()
        for _ in range(3):
            tracker.record([TC_LS])
            tracker.record([TC_CAT])
        assert tracker.check() is True

    def test_not_stuck_varied_iterations(self):
        tracker = StuckLoopTracker(min_repeats=3)
        tracker.record([TC_LS])
        tracker.record([TC_CAT])
        tracker.record([TC_READ])
        assert tracker.check() is False

    def test_stuck_after_initial_varied_work(self):
        tracker = StuckLoopTracker()
        tracker.record([TC_READ])
        tracker.record([TC_SEARCH])
        tracker.record([TC_LS])
        tracker.record([TC_LS])
        tracker.record([TC_LS])
        assert tracker.check() is True

    def test_empty_iterations_not_stuck(self):
        tracker = StuckLoopTracker()
        for _ in range(5):
            tracker.record([])
        assert tracker.check() is False

    def test_names_only_mode(self):
        tracker = StuckLoopTracker(names_only=True)
        tracker.record([_tc("run_command", command="ls /tmp")])
        tracker.record([_tc("run_command", command="ls /var")])
        tracker.record([_tc("run_command", command="ls /etc")])
        assert tracker.check() is True

    def test_exact_mode_different_args_not_stuck(self):
        tracker = StuckLoopTracker(names_only=False)
        tracker.record([_tc("run_command", command="ls /tmp")])
        tracker.record([_tc("run_command", command="ls /var")])
        tracker.record([_tc("run_command", command="ls /etc")])
        assert tracker.check() is False


class TestStuckLoopTrackerCheckDetailed:
    """StuckLoopTracker.check_detailed: returns cycle length."""

    def test_not_stuck_returns_zero(self):
        tracker = StuckLoopTracker()
        stuck, cl = tracker.check_detailed()
        assert not stuck
        assert cl == 0

    def test_simple_repetition_cycle_1(self):
        tracker = StuckLoopTracker()
        for _ in range(3):
            tracker.record([TC_LS])
        stuck, cl = tracker.check_detailed()
        assert stuck
        assert cl == 1

    def test_cycle_2_returns_2(self):
        tracker = StuckLoopTracker()
        for _ in range(3):
            tracker.record([TC_LS])
            tracker.record([TC_CAT])
        stuck, cl = tracker.check_detailed()
        assert stuck
        assert cl == 2

    def test_cycle_3_returns_3(self):
        tracker = StuckLoopTracker()
        for _ in range(3):
            tracker.record([TC_LS])
            tracker.record([TC_CAT])
            tracker.record([TC_READ])
        stuck, cl = tracker.check_detailed()
        assert stuck
        assert cl == 3


class TestStuckLoopTrackerWarned:
    """StuckLoopTracker.warned: flag lifecycle."""

    def test_default_false(self):
        assert StuckLoopTracker().warned is False

    def test_set_warned(self):
        tracker = StuckLoopTracker()
        tracker.warned = True
        assert tracker.warned is True

    def test_reset_clears_warned(self):
        tracker = StuckLoopTracker()
        tracker.warned = True
        tracker.reset()
        assert tracker.warned is False

    def test_warned_survives_record(self):
        tracker = StuckLoopTracker()
        tracker.warned = True
        tracker.record([TC_LS])
        assert tracker.warned is True


class TestStuckLoopTrackerReset:
    """StuckLoopTracker.reset: full state clear."""

    def test_reset_clears_iterations(self):
        tracker = StuckLoopTracker()
        for _ in range(5):
            tracker.record([TC_LS])
        tracker.reset()
        assert tracker.iteration_count == 0

    def test_reset_clears_warned(self):
        tracker = StuckLoopTracker()
        tracker.warned = True
        tracker.reset()
        assert tracker.warned is False

    def test_not_stuck_after_reset(self):
        tracker = StuckLoopTracker()
        for _ in range(5):
            tracker.record([TC_LS])
        assert tracker.check() is True
        tracker.reset()
        assert tracker.check() is False

    def test_can_record_after_reset(self):
        tracker = StuckLoopTracker()
        for _ in range(3):
            tracker.record([TC_LS])
        tracker.reset()
        tracker.record([TC_CAT])
        assert tracker.iteration_count == 1


class TestStuckLoopTrackerWorkflow:
    """StuckLoopTracker: end-to-end warn-then-terminate workflow."""

    def test_warn_then_break_out(self):
        tracker = StuckLoopTracker()
        for _ in range(3):
            tracker.record([TC_LS])
        assert tracker.check() is True
        tracker.warned = True
        # LLM breaks out by using different tools
        tracker.record([TC_CAT])
        tracker.record([TC_READ])
        assert tracker.check() is False

    def test_warn_then_still_stuck(self):
        tracker = StuckLoopTracker()
        for _ in range(3):
            tracker.record([TC_LS])
        assert tracker.check() is True
        tracker.warned = True
        # LLM ignores warning, keeps repeating
        tracker.record([TC_LS])
        assert tracker.check() is True
        assert tracker.warned is True

    def test_full_lifecycle(self):
        tracker = StuckLoopTracker()
        # Normal varied work
        tracker.record([TC_LS])
        tracker.record([TC_CAT])
        assert not tracker.check()
        # Enters stuck pattern
        tracker.record([TC_READ])
        tracker.record([TC_READ])
        tracker.record([TC_READ])
        assert tracker.check()
        # Warned
        tracker.warned = True
        # Breaks out
        tracker.record([TC_SEARCH])
        tracker.record([TC_STATUS])
        tracker.record([TC_DEPLOY])
        assert not tracker.check()
        # New stuck pattern later
        tracker.record([TC_STATUS])
        tracker.record([TC_STATUS])
        tracker.record([TC_STATUS])
        assert tracker.check()
        assert tracker.warned is True  # still warned from before


# ===================================================================
# 5. Retry message
# ===================================================================

class TestStuckLoopRetryMsg:
    """_STUCK_LOOP_RETRY_MSG: structure and content."""

    def test_is_dict(self):
        assert isinstance(_STUCK_LOOP_RETRY_MSG, dict)

    def test_has_role_developer(self):
        assert _STUCK_LOOP_RETRY_MSG["role"] == "developer"

    def test_has_content(self):
        assert isinstance(_STUCK_LOOP_RETRY_MSG["content"], str)
        assert len(_STUCK_LOOP_RETRY_MSG["content"]) > 20

    def test_mentions_stuck(self):
        assert "stuck" in _STUCK_LOOP_RETRY_MSG["content"].lower()

    def test_mentions_different_approach(self):
        content = _STUCK_LOOP_RETRY_MSG["content"].lower()
        assert "different" in content


# ===================================================================
# 6. Names-only mode (additional coverage)
# ===================================================================

class TestNamesOnlyMode:
    """Names-only detection: catches same-tool-sequence regardless of args."""

    def test_detect_stuck_loop_names_only_true(self):
        iters = [
            [_tc("run_command", command=f"cmd_{i}")]
            for i in range(3)
        ]
        assert detect_stuck_loop(iters, names_only=True) is True

    def test_detect_stuck_loop_names_only_false(self):
        iters = [
            [_tc("run_command", command=f"cmd_{i}")]
            for i in range(3)
        ]
        assert detect_stuck_loop(iters, names_only=False) is False

    def test_names_only_cycle(self):
        iters = []
        for _ in range(3):
            iters.append([_tc("run_command", command="a")])
            iters.append([_tc("read_file", path="b")])
        # Exact mode: different args might differ, but here they're same
        assert detect_stuck_loop(iters, names_only=True) is True

    def test_names_only_different_tool_sequences(self):
        iters = [
            [_tc("run_command", command="a"), _tc("read_file", path="b")],
            [_tc("read_file", path="c"), _tc("run_command", command="d")],
            [_tc("run_command", command="e"), _tc("read_file", path="f")],
        ]
        assert detect_stuck_loop(iters, names_only=True) is False

    def test_tracker_names_only_integration(self):
        tracker = StuckLoopTracker(names_only=True)
        tracker.record([_tc("search_knowledge", query="q1")])
        tracker.record([_tc("search_knowledge", query="q2")])
        tracker.record([_tc("search_knowledge", query="q3")])
        assert tracker.check() is True


# ===================================================================
# 7. Import tests
# ===================================================================

class TestImports:
    """Verify all public symbols are importable."""

    def test_detect_stuck_loop_importable(self):
        from src.discord.response_guards import detect_stuck_loop
        assert callable(detect_stuck_loop)

    def test_stuck_loop_tracker_importable(self):
        from src.discord.response_guards import StuckLoopTracker
        assert callable(StuckLoopTracker)

    def test_fingerprint_importable(self):
        from src.discord.response_guards import _fingerprint_tool_calls
        assert callable(_fingerprint_tool_calls)

    def test_retry_msg_importable(self):
        from src.discord.response_guards import _STUCK_LOOP_RETRY_MSG
        assert isinstance(_STUCK_LOOP_RETRY_MSG, dict)

    def test_detect_stuck_from_fingerprints_importable(self):
        from src.discord.response_guards import _detect_stuck_from_fingerprints
        assert callable(_detect_stuck_from_fingerprints)
