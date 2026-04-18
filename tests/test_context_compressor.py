"""Tests for src.llm.context_compressor — context auto-compression with prompt caching."""

from __future__ import annotations

import json
import pytest

from src.llm.context_compressor import (
    COMPRESSED_ITERATION_MAX_CHARS,
    DEFAULT_KEEP_RECENT,
    DEFAULT_MAX_CONTEXT_CHARS,
    CompressionStats,
    PrefixTracker,
    _ERROR_PREFIXES,
    _hash_prefix,
    _is_tool_message,
    _is_tool_result_message,
    _is_tool_use_message,
    compress_tool_context,
    estimate_message_chars,
    split_prefix_and_iterations,
    summarize_iteration,
)


# -----------------------------------------------------------------------
# Helper factories
# -----------------------------------------------------------------------

def _text_msg(role: str, content: str) -> dict:
    return {"role": role, "content": content}


def _tool_use_msg(tool_name: str, tool_id: str = "tc1", args: dict | None = None) -> dict:
    return {
        "role": "assistant",
        "content": [
            {"type": "tool_use", "id": tool_id, "name": tool_name, "input": args or {}},
        ],
    }


def _tool_result_msg(tool_id: str = "tc1", result: str = "ok") -> dict:
    return {
        "role": "user",
        "content": [
            {"type": "tool_result", "tool_use_id": tool_id, "content": result},
        ],
    }


def _iteration(tool_name: str, tool_id: str = "tc1", result: str = "ok", args: dict | None = None):
    return [_tool_use_msg(tool_name, tool_id, args), _tool_result_msg(tool_id, result)]


def _history_with_iterations(n_iterations: int, result_size: int = 100) -> list[dict]:
    """Build a message list with prefix + N tool iterations."""
    msgs = [
        _text_msg("user", "[Previous conversation summary: user asked about servers]"),
        _text_msg("assistant", "Understood, I have context."),
        _text_msg("user", "Check all the servers"),
    ]
    for i in range(n_iterations):
        tid = f"tc{i}"
        msgs.extend([
            _tool_use_msg(f"run_command", tid, {"cmd": f"check server-{i}"}),
            _tool_result_msg(tid, "x" * result_size),
        ])
    return msgs


# -----------------------------------------------------------------------
# _is_tool_message
# -----------------------------------------------------------------------
class TestIsToolMessage:
    def test_text_message_not_tool(self):
        assert _is_tool_message(_text_msg("user", "hello")) is False

    def test_tool_use_detected(self):
        assert _is_tool_message(_tool_use_msg("run_command")) is True

    def test_tool_result_detected(self):
        assert _is_tool_message(_tool_result_msg()) is True

    def test_empty_content_list(self):
        assert _is_tool_message({"role": "user", "content": []}) is False

    def test_non_list_content(self):
        assert _is_tool_message({"role": "user", "content": 42}) is False

    def test_mixed_blocks(self):
        msg = {
            "role": "assistant",
            "content": [
                {"type": "text", "text": "hello"},
                {"type": "tool_use", "id": "tc1", "name": "foo", "input": {}},
            ],
        }
        assert _is_tool_message(msg) is True

    def test_text_only_list_not_tool(self):
        msg = {"role": "user", "content": [{"type": "text", "text": "hi"}]}
        assert _is_tool_message(msg) is False

    def test_missing_content_key(self):
        assert _is_tool_message({"role": "user"}) is False


# -----------------------------------------------------------------------
# _is_tool_use_message / _is_tool_result_message
# -----------------------------------------------------------------------
class TestToolUseResultClassification:
    def test_tool_use_true(self):
        assert _is_tool_use_message(_tool_use_msg("cmd")) is True

    def test_tool_use_false_on_result(self):
        assert _is_tool_use_message(_tool_result_msg()) is False

    def test_tool_result_true(self):
        assert _is_tool_result_message(_tool_result_msg()) is True

    def test_tool_result_false_on_use(self):
        assert _is_tool_result_message(_tool_use_msg("cmd")) is False

    def test_tool_use_false_on_text(self):
        assert _is_tool_use_message(_text_msg("user", "hi")) is False

    def test_tool_result_false_on_text(self):
        assert _is_tool_result_message(_text_msg("user", "hi")) is False


# -----------------------------------------------------------------------
# _hash_prefix
# -----------------------------------------------------------------------
class TestHashPrefix:
    def test_same_input_same_hash(self):
        msgs = [_text_msg("user", "hello")]
        assert _hash_prefix("sys", msgs) == _hash_prefix("sys", msgs)

    def test_different_system_different_hash(self):
        msgs = [_text_msg("user", "hello")]
        assert _hash_prefix("sys1", msgs) != _hash_prefix("sys2", msgs)

    def test_different_messages_different_hash(self):
        m1 = [_text_msg("user", "hello")]
        m2 = [_text_msg("user", "goodbye")]
        assert _hash_prefix("sys", m1) != _hash_prefix("sys", m2)

    def test_different_role_different_hash(self):
        m1 = [_text_msg("user", "hello")]
        m2 = [_text_msg("assistant", "hello")]
        assert _hash_prefix("sys", m1) != _hash_prefix("sys", m2)

    def test_empty_messages(self):
        h = _hash_prefix("sys", [])
        assert isinstance(h, str) and len(h) == 16

    def test_list_content_hashed(self):
        msg = {"role": "user", "content": [{"type": "text", "text": "hi"}]}
        h = _hash_prefix("sys", [msg])
        assert isinstance(h, str) and len(h) == 16

    def test_deterministic_across_calls(self):
        msgs = [_text_msg("user", "test"), _text_msg("assistant", "reply")]
        h1 = _hash_prefix("prompt", msgs)
        h2 = _hash_prefix("prompt", msgs)
        assert h1 == h2

    def test_hash_length(self):
        assert len(_hash_prefix("x", [])) == 16


# -----------------------------------------------------------------------
# split_prefix_and_iterations
# -----------------------------------------------------------------------
class TestSplitPrefixAndIterations:
    def test_no_tool_messages(self):
        msgs = [_text_msg("user", "hi"), _text_msg("assistant", "hello")]
        prefix, iters = split_prefix_and_iterations(msgs)
        assert prefix == msgs
        assert iters == []

    def test_simple_split(self):
        msgs = [
            _text_msg("user", "do X"),
            _tool_use_msg("cmd", "tc1"),
            _tool_result_msg("tc1"),
        ]
        prefix, iters = split_prefix_and_iterations(msgs)
        assert len(prefix) == 1
        assert prefix[0]["content"] == "do X"
        assert len(iters) == 1
        assert len(iters[0]) == 2  # tool_use + tool_result

    def test_multiple_iterations(self):
        msgs = [
            _text_msg("user", "do it"),
            *_iteration("cmd1", "tc1", "ok1"),
            *_iteration("cmd2", "tc2", "ok2"),
            *_iteration("cmd3", "tc3", "ok3"),
        ]
        prefix, iters = split_prefix_and_iterations(msgs)
        assert len(prefix) == 1
        assert len(iters) == 3

    def test_prefix_with_summary(self):
        msgs = [
            _text_msg("user", "[Previous summary]"),
            _text_msg("assistant", "Understood"),
            _text_msg("user", "check servers"),
            *_iteration("run_command", "tc1"),
        ]
        prefix, iters = split_prefix_and_iterations(msgs)
        assert len(prefix) == 3
        assert len(iters) == 1

    def test_empty_messages(self):
        prefix, iters = split_prefix_and_iterations([])
        assert prefix == []
        assert iters == []

    def test_only_tool_messages(self):
        msgs = [
            *_iteration("cmd1", "tc1"),
            *_iteration("cmd2", "tc2"),
        ]
        prefix, iters = split_prefix_and_iterations(msgs)
        assert prefix == []
        assert len(iters) == 2

    def test_partial_iteration_at_end(self):
        msgs = [
            _text_msg("user", "go"),
            _tool_use_msg("cmd", "tc1"),
        ]
        prefix, iters = split_prefix_and_iterations(msgs)
        assert len(prefix) == 1
        assert len(iters) == 1
        assert len(iters[0]) == 1  # just tool_use, no result yet

    def test_tool_result_grouped_with_previous_use(self):
        msgs = [
            _text_msg("user", "go"),
            _tool_use_msg("cmd1", "tc1"),
            _tool_result_msg("tc1"),
            _tool_use_msg("cmd2", "tc2"),
            _tool_result_msg("tc2"),
        ]
        prefix, iters = split_prefix_and_iterations(msgs)
        assert len(iters) == 2
        assert len(iters[0]) == 2  # use + result
        assert len(iters[1]) == 2


# -----------------------------------------------------------------------
# estimate_message_chars
# -----------------------------------------------------------------------
class TestEstimateMessageChars:
    def test_string_content(self):
        msgs = [_text_msg("user", "hello world")]
        chars = estimate_message_chars(msgs)
        assert chars >= len("hello world") + len("user")

    def test_tool_use_content(self):
        msg = _tool_use_msg("run_command", args={"cmd": "ls -la"})
        chars = estimate_message_chars([msg])
        assert chars > 0

    def test_tool_result_content(self):
        msg = _tool_result_msg(result="output data here")
        chars = estimate_message_chars([msg])
        assert chars >= len("output data here")

    def test_empty_messages(self):
        assert estimate_message_chars([]) == 0

    def test_multiple_messages(self):
        msgs = [
            _text_msg("user", "aaa"),
            _text_msg("assistant", "bbb"),
        ]
        chars = estimate_message_chars(msgs)
        assert chars >= 6  # at least "aaa" + "bbb"

    def test_nested_dict_input(self):
        msg = _tool_use_msg("cmd", args={"nested": {"key": "value"}})
        chars = estimate_message_chars([msg])
        assert chars > 0

    def test_list_result_content(self):
        msg = {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": "tc1",
                 "content": [{"type": "text", "text": "result text"}]},
            ],
        }
        chars = estimate_message_chars([msg])
        assert chars > 0


# -----------------------------------------------------------------------
# summarize_iteration
# -----------------------------------------------------------------------
class TestSummarizeIteration:
    def test_single_tool_ok(self):
        it = _iteration("run_command", result="success")
        s = summarize_iteration(it)
        assert "run_command" in s
        assert "OK" in s

    def test_single_tool_error(self):
        it = _iteration("run_command", result="Error: command not found")
        s = summarize_iteration(it)
        assert "run_command" in s
        assert "ERR" in s

    def test_multiple_tools_in_iteration(self):
        it = [
            {
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": "tc1", "name": "read_file", "input": {}},
                    {"type": "tool_use", "id": "tc2", "name": "run_command", "input": {}},
                ],
            },
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tc1", "content": "file data"},
                    {"type": "tool_result", "tool_use_id": "tc2", "content": "cmd output"},
                ],
            },
        ]
        s = summarize_iteration(it)
        assert "read_file" in s
        assert "run_command" in s

    def test_truncation(self):
        it = [
            {
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": f"tc{i}", "name": f"very_long_tool_name_{i}", "input": {}}
                    for i in range(20)
                ],
            },
        ]
        s = summarize_iteration(it)
        assert len(s) <= COMPRESSED_ITERATION_MAX_CHARS

    def test_empty_iteration(self):
        assert summarize_iteration([]) == ""

    def test_text_only_iteration(self):
        it = [_text_msg("assistant", "thinking...")]
        assert summarize_iteration(it) == ""

    def test_error_prefix_detection(self):
        for prefix in _ERROR_PREFIXES:
            it = _iteration("cmd", result=f"{prefix} something went wrong")
            s = summarize_iteration(it)
            assert "ERR" in s

    def test_command_failed_prefix(self):
        it = _iteration("cmd", result="Command failed with exit code 1")
        s = summarize_iteration(it)
        assert "ERR" in s

    def test_list_result_content(self):
        it = [
            _tool_use_msg("cmd"),
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tc1",
                     "content": [{"type": "text", "text": "output"}]},
                ],
            },
        ]
        s = summarize_iteration(it)
        assert "cmd" in s
        assert "OK" in s

    def test_non_string_result(self):
        it = [
            _tool_use_msg("cmd"),
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tc1", "content": 42},
                ],
            },
        ]
        s = summarize_iteration(it)
        assert "OK" in s

    def test_missing_outcome(self):
        it = [_tool_use_msg("cmd")]
        s = summarize_iteration(it)
        assert "?" in s


# -----------------------------------------------------------------------
# compress_tool_context — basic
# -----------------------------------------------------------------------
class TestCompressToolContextBasic:
    def test_under_budget_no_compression(self):
        msgs = [_text_msg("user", "hello")]
        result, count = compress_tool_context(msgs, max_context_chars=999_999)
        assert result is msgs
        assert count == 0

    def test_no_iterations_no_compression(self):
        msgs = [_text_msg("user", "x" * 100_000)]
        result, count = compress_tool_context(msgs, max_context_chars=100)
        assert result is msgs
        assert count == 0

    def test_too_few_iterations_no_compression(self):
        msgs = [
            _text_msg("user", "go"),
            *_iteration("cmd1", "tc1", "x" * 50_000),
            *_iteration("cmd2", "tc2", "x" * 50_000),
        ]
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=3,
        )
        assert count == 0

    def test_compresses_old_iterations(self):
        msgs = _history_with_iterations(6, result_size=10_000)
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=2,
        )
        assert count == 4  # 6 - 2 = 4 compressed
        assert len(result) < len(msgs)

    def test_prefix_preserved(self):
        msgs = _history_with_iterations(6, result_size=10_000)
        original_prefix = msgs[:3]
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=2,
        )
        assert count > 0
        assert result[:3] == original_prefix

    def test_recent_iterations_preserved(self):
        msgs = _history_with_iterations(5, result_size=10_000)
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=2,
        )
        assert count == 3  # 5 - 2 = 3 compressed
        # Last 4 messages should be the 2 recent iterations (2 msgs each)
        last_4 = result[-4:]
        assert _is_tool_use_message(last_4[0])
        assert _is_tool_result_message(last_4[1])
        assert _is_tool_use_message(last_4[2])
        assert _is_tool_result_message(last_4[3])

    def test_summary_message_inserted(self):
        msgs = _history_with_iterations(5, result_size=10_000)
        result, _ = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=2,
        )
        # The 4th message (index 3) should be the compression summary
        summary = result[3]
        assert summary["role"] == "user"
        assert "[Earlier tool calls:" in summary["content"]
        assert "run_command" in summary["content"]


# -----------------------------------------------------------------------
# compress_tool_context — stats
# -----------------------------------------------------------------------
class TestCompressToolContextStats:
    def test_stats_updated_on_compression(self):
        stats = CompressionStats()
        msgs = _history_with_iterations(6, result_size=10_000)
        compress_tool_context(msgs, max_context_chars=100, keep_recent=2, stats=stats)
        assert stats.compressions == 1
        assert stats.iterations_compressed == 4
        assert stats.chars_saved > 0

    def test_stats_not_updated_when_no_compression(self):
        stats = CompressionStats()
        msgs = [_text_msg("user", "hi")]
        compress_tool_context(msgs, max_context_chars=999_999, stats=stats)
        assert stats.compressions == 0
        assert stats.iterations_compressed == 0
        assert stats.chars_saved == 0

    def test_stats_cumulative(self):
        stats = CompressionStats()
        msgs = _history_with_iterations(5, result_size=10_000)
        compress_tool_context(msgs, max_context_chars=100, keep_recent=2, stats=stats)
        compress_tool_context(msgs, max_context_chars=100, keep_recent=2, stats=stats)
        assert stats.compressions == 2
        assert stats.iterations_compressed == 6  # 3 + 3


# -----------------------------------------------------------------------
# compress_tool_context — edge cases
# -----------------------------------------------------------------------
class TestCompressToolContextEdgeCases:
    def test_empty_messages(self):
        result, count = compress_tool_context([], max_context_chars=100)
        assert result == []
        assert count == 0

    def test_keep_recent_equals_iterations(self):
        msgs = _history_with_iterations(3, result_size=10_000)
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=3,
        )
        assert count == 0

    def test_keep_recent_exceeds_iterations(self):
        msgs = _history_with_iterations(2, result_size=10_000)
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=5,
        )
        assert count == 0

    def test_original_not_modified(self):
        msgs = _history_with_iterations(5, result_size=10_000)
        original_len = len(msgs)
        compress_tool_context(msgs, max_context_chars=100, keep_recent=2)
        assert len(msgs) == original_len

    def test_all_but_keep_recent_compressed(self):
        msgs = _history_with_iterations(10, result_size=5_000)
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=1,
        )
        assert count == 9

    def test_default_parameters(self):
        small_msgs = [_text_msg("user", "hi")]
        result, count = compress_tool_context(small_msgs)
        assert count == 0

    def test_context_actually_shrinks(self):
        msgs = _history_with_iterations(8, result_size=8_000)
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=2,
        )
        assert count > 0
        assert estimate_message_chars(result) < estimate_message_chars(msgs)


# -----------------------------------------------------------------------
# PrefixTracker
# -----------------------------------------------------------------------
class TestPrefixTracker:
    def test_first_call_is_miss(self):
        tracker = PrefixTracker()
        assert tracker.check("sys", [_text_msg("user", "hi")]) is False

    def test_second_identical_call_is_hit(self):
        tracker = PrefixTracker()
        msgs = [_text_msg("user", "hi")]
        tracker.check("sys", msgs)
        assert tracker.check("sys", msgs) is True

    def test_different_system_is_miss(self):
        tracker = PrefixTracker()
        msgs = [_text_msg("user", "hi")]
        tracker.check("sys1", msgs)
        assert tracker.check("sys2", msgs) is False

    def test_different_messages_is_miss(self):
        tracker = PrefixTracker()
        tracker.check("sys", [_text_msg("user", "hi")])
        assert tracker.check("sys", [_text_msg("user", "bye")]) is False

    def test_reset_clears_state(self):
        tracker = PrefixTracker()
        msgs = [_text_msg("user", "hi")]
        tracker.check("sys", msgs)
        tracker.reset()
        assert tracker.check("sys", msgs) is False

    def test_stats_tracking(self):
        stats = CompressionStats()
        tracker = PrefixTracker(stats=stats)
        msgs = [_text_msg("user", "hi")]
        tracker.check("sys", msgs)       # first call
        tracker.check("sys", msgs)       # hit
        tracker.check("sys2", msgs)      # miss
        tracker.check("sys2", msgs)      # hit
        assert stats.total_checks == 4
        assert stats.prefix_hits == 2
        assert stats.prefix_misses == 1  # only the 3rd call is a miss (1st is neither)

    def test_stats_property(self):
        stats = CompressionStats()
        tracker = PrefixTracker(stats=stats)
        assert tracker.stats is stats

    def test_consecutive_hits(self):
        tracker = PrefixTracker()
        msgs = [_text_msg("user", "same")]
        tracker.check("sys", msgs)
        assert tracker.check("sys", msgs) is True
        assert tracker.check("sys", msgs) is True
        assert tracker.check("sys", msgs) is True

    def test_realistic_tool_loop(self):
        """Simulate a tool loop where system and prefix stay stable."""
        tracker = PrefixTracker()
        prefix = [_text_msg("user", "deploy the app")]
        system = "You are Odin."
        tracker.check(system, prefix)  # first iteration
        assert tracker.check(system, prefix) is True  # second iteration
        assert tracker.check(system, prefix) is True  # third iteration

    def test_changing_system_prompt_between_iterations(self):
        """If system prompt regenerates with new timestamp, it's a miss."""
        tracker = PrefixTracker()
        prefix = [_text_msg("user", "hi")]
        tracker.check("Monday at 10:00", prefix)
        assert tracker.check("Monday at 10:01", prefix) is False


# -----------------------------------------------------------------------
# CompressionStats
# -----------------------------------------------------------------------
class TestCompressionStats:
    def test_initial_zeros(self):
        s = CompressionStats()
        assert s.compressions == 0
        assert s.iterations_compressed == 0
        assert s.chars_saved == 0
        assert s.prefix_hits == 0
        assert s.prefix_misses == 0
        assert s.total_checks == 0

    def test_as_dict_keys(self):
        s = CompressionStats()
        d = s.as_dict()
        assert set(d.keys()) == {
            "compressions", "iterations_compressed", "chars_saved",
            "prefix_hits", "prefix_misses", "total_checks", "prefix_hit_rate",
        }

    def test_hit_rate_zero_when_no_checks(self):
        s = CompressionStats()
        assert s.as_dict()["prefix_hit_rate"] == 0.0

    def test_hit_rate_calculated(self):
        s = CompressionStats(prefix_hits=3, total_checks=10)
        assert s.as_dict()["prefix_hit_rate"] == 0.3

    def test_hit_rate_100_percent(self):
        s = CompressionStats(prefix_hits=5, total_checks=5)
        assert s.as_dict()["prefix_hit_rate"] == 1.0

    def test_cumulative_updates(self):
        s = CompressionStats()
        s.compressions += 1
        s.iterations_compressed += 3
        s.chars_saved += 1000
        s.compressions += 1
        s.iterations_compressed += 2
        s.chars_saved += 500
        assert s.compressions == 2
        assert s.iterations_compressed == 5
        assert s.chars_saved == 1500


# -----------------------------------------------------------------------
# Config integration
# -----------------------------------------------------------------------
class TestContextCompressionConfig:
    def test_default_config(self):
        from src.config.schema import ContextCompressionConfig
        cfg = ContextCompressionConfig()
        assert cfg.enabled is True
        assert cfg.max_context_chars == 120_000
        assert cfg.keep_recent_iterations == 6

    def test_custom_config(self):
        from src.config.schema import ContextCompressionConfig
        cfg = ContextCompressionConfig(
            enabled=False,
            max_context_chars=10_000,
            keep_recent_iterations=1,
        )
        assert cfg.enabled is False
        assert cfg.max_context_chars == 10_000
        assert cfg.keep_recent_iterations == 1

    def test_config_in_codex_config(self):
        from src.config.schema import OpenAICodexConfig
        cfg = OpenAICodexConfig()
        assert hasattr(cfg, "context_compression")
        assert cfg.context_compression.enabled is True

    def test_full_config_parse(self):
        from src.config.schema import OpenAICodexConfig
        cfg = OpenAICodexConfig(**{
            "context_compression": {
                "enabled": False,
                "max_context_chars": 20_000,
                "keep_recent_iterations": 5,
            },
        })
        assert cfg.context_compression.enabled is False
        assert cfg.context_compression.max_context_chars == 20_000
        assert cfg.context_compression.keep_recent_iterations == 5


# -----------------------------------------------------------------------
# Constants and defaults
# -----------------------------------------------------------------------
class TestConstants:
    def test_default_max_context_chars(self):
        assert DEFAULT_MAX_CONTEXT_CHARS == 120_000

    def test_default_keep_recent(self):
        assert DEFAULT_KEEP_RECENT == 6

    def test_compressed_max_chars(self):
        assert COMPRESSED_ITERATION_MAX_CHARS == 120

    def test_error_prefixes_tuple(self):
        assert isinstance(_ERROR_PREFIXES, tuple)
        assert "Error" in _ERROR_PREFIXES
        assert "Timeout" in _ERROR_PREFIXES


# -----------------------------------------------------------------------
# Imports
# -----------------------------------------------------------------------
class TestImports:
    def test_all_public_symbols(self):
        from src.llm import context_compressor
        assert hasattr(context_compressor, "CompressionStats")
        assert hasattr(context_compressor, "PrefixTracker")
        assert hasattr(context_compressor, "compress_tool_context")
        assert hasattr(context_compressor, "split_prefix_and_iterations")
        assert hasattr(context_compressor, "estimate_message_chars")
        assert hasattr(context_compressor, "summarize_iteration")

    def test_hash_prefix_importable(self):
        from src.llm.context_compressor import _hash_prefix
        assert callable(_hash_prefix)


# -----------------------------------------------------------------------
# Realistic scenarios
# -----------------------------------------------------------------------
class TestRealisticScenarios:
    def test_deploy_scenario(self):
        """Simulate a multi-step deployment with 8 tool calls."""
        msgs = [
            _text_msg("user", "[Summary: user manages server fleet]"),
            _text_msg("assistant", "Understood."),
            _text_msg("user", "Deploy the app to production"),
            *_iteration("run_command", "tc1", "Building... success", {"cmd": "docker build"}),
            *_iteration("run_command", "tc2", "Pushed image", {"cmd": "docker push"}),
            *_iteration("run_command", "tc3", "Error: connection refused", {"cmd": "ssh deploy"}),
            *_iteration("run_command", "tc4", "Retrying... success", {"cmd": "ssh deploy -retry"}),
            *_iteration("run_command", "tc5", "Health check passed", {"cmd": "curl health"}),
            *_iteration("run_command", "tc6", "Logs look clean", {"cmd": "tail logs"}),
            *_iteration("run_command", "tc7", "Metrics normal", {"cmd": "check metrics"}),
            *_iteration("run_command", "tc8", "All green", {"cmd": "final check"}),
        ]
        stats = CompressionStats()
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=2, stats=stats,
        )
        assert count == 6  # 8 - 2 = 6 compressed
        # Summary should mention the error
        summary_msg = result[3]
        assert "ERR" in summary_msg["content"]
        assert "OK" in summary_msg["content"]
        assert stats.compressions == 1
        assert stats.chars_saved > 0

    def test_mixed_tools(self):
        """Scenario with diverse tool types."""
        msgs = [
            _text_msg("user", "investigate the issue"),
            *_iteration("run_command", "tc1", "disk 85% full"),
            *_iteration("read_file", "tc2", "config contents here..."),
            *_iteration("search_knowledge", "tc3", "relevant docs found"),
            *_iteration("run_command", "tc4", "cleaned up temp files"),
            *_iteration("run_command", "tc5", "disk now 45%"),
        ]
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=2,
        )
        assert count == 3
        summary = result[1]  # prefix is just 1 msg, summary is at index 1
        assert "run_command" in summary["content"]
        assert "read_file" in summary["content"]
        assert "search_knowledge" in summary["content"]

    def test_no_compression_small_conversation(self):
        """Short conversation stays untouched."""
        msgs = [
            _text_msg("user", "check disk"),
            *_iteration("run_command", "tc1", "disk 45%"),
        ]
        result, count = compress_tool_context(msgs, max_context_chars=999_999)
        assert count == 0
        assert result is msgs

    def test_prefix_tracker_with_compression(self):
        """PrefixTracker + compression work together."""
        stats = CompressionStats()
        tracker = PrefixTracker(stats=stats)
        system = "You are Odin."
        prefix = [_text_msg("user", "do stuff")]

        tracker.check(system, prefix)  # 1st iteration
        assert tracker.check(system, prefix) is True  # stable

        msgs = prefix + list(_iteration("cmd", "tc1", "x" * 50_000))
        compressed, _ = compress_tool_context(msgs, max_context_chars=100, stats=stats)

        assert stats.total_checks == 2
        assert stats.prefix_hits == 1


# -----------------------------------------------------------------------
# Multi-tool iterations (parallel tool calls)
# -----------------------------------------------------------------------
class TestMultiToolIterations:
    def test_parallel_tools_in_single_iteration(self):
        """When LLM calls multiple tools at once, they form one iteration."""
        msgs = [
            _text_msg("user", "check everything"),
            {
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": "tc1", "name": "run_command", "input": {"cmd": "df"}},
                    {"type": "tool_use", "id": "tc2", "name": "run_command", "input": {"cmd": "free"}},
                ],
            },
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tc1", "content": "disk ok"},
                    {"type": "tool_result", "tool_use_id": "tc2", "content": "mem ok"},
                ],
            },
        ]
        prefix, iters = split_prefix_and_iterations(msgs)
        assert len(prefix) == 1
        assert len(iters) == 1  # one iteration with parallel calls

    def test_compress_parallel_tools(self):
        msgs = [
            _text_msg("user", "check everything"),
        ]
        for i in range(5):
            msgs.append({
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": f"tc{i}a", "name": "cmd", "input": {}},
                    {"type": "tool_use", "id": f"tc{i}b", "name": "cmd", "input": {}},
                ],
            })
            msgs.append({
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": f"tc{i}a", "content": "x" * 10_000},
                    {"type": "tool_result", "tool_use_id": f"tc{i}b", "content": "x" * 10_000},
                ],
            })
        result, count = compress_tool_context(
            msgs, max_context_chars=100, keep_recent=2,
        )
        assert count == 3  # 5 - 2 = 3 compressed


# -----------------------------------------------------------------------
# REST API endpoint (unit test)
# -----------------------------------------------------------------------
class TestAPIEndpoint:
    def test_compression_stats_dict_serializable(self):
        """Stats dict should be JSON-serializable for the REST API."""
        s = CompressionStats(
            compressions=5, iterations_compressed=12, chars_saved=50_000,
            prefix_hits=8, prefix_misses=2, total_checks=10,
        )
        d = s.as_dict()
        serialized = json.dumps(d)
        deserialized = json.loads(serialized)
        assert deserialized["compressions"] == 5
        assert deserialized["prefix_hit_rate"] == 0.8
