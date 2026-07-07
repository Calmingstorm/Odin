"""Coverage for src/tools/handlers/coding.py (RFC-006 P6).

CodingTools.claude_code drives a `claude` CLI over SSH; _parse_claude_stream_json
is pure stream-json summarization. Built via __new__ with only the deps the two
methods touch (config, resolve_host, exec_command, output_streamer). No SSH runs:
_exec_command is an AsyncMock.
"""
from __future__ import annotations

import json
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.tools.handlers.coding import CodingTools


def _cfg(host="", user="claude"):
    return SimpleNamespace(claude_code_host=host, claude_code_user=user)


def _tools(config=None, resolve=("1.2.3.4", "root", "linux"), exec_ret=(0, "result"),
           streamer=None):
    t = CodingTools.__new__(CodingTools)
    t._deps = SimpleNamespace(  # type: ignore[assignment]  # __new__ bypasses HandlerDeps typing
        config=lambda: config if config is not None else _cfg(),
        output_streamer=lambda: streamer,
    )
    t._resolve_host = lambda host: resolve
    t._exec_command = AsyncMock(return_value=exec_ret)
    return t


def _base_inp(**kw):
    inp = {"working_directory": "/repo", "prompt": "do a thing"}
    inp.update(kw)
    return inp


class TestClaudeCode:
    async def test_no_host_configured(self):
        t = _tools(config=_cfg(host=""))
        assert "not configured" in await t._handle_claude_code(_base_inp())

    async def test_unknown_host(self):
        t = _tools(config=_cfg(host="srv"), resolve=None)
        assert "Unknown or disallowed host" in await t._handle_claude_code(_base_inp())

    async def test_allow_edits_requires_user(self):
        t = _tools(config=_cfg(host="srv", user=""))
        assert "claude_code_user not configured" in await t._handle_claude_code(
            _base_inp(allow_edits=True))

    async def test_success(self):
        result_json = json.dumps({"type": "result", "result": "all done", "num_turns": 1})
        t = _tools(config=_cfg(host="srv"), exec_ret=(0, result_json))
        out = await t._handle_claude_code(_base_inp())
        assert "all done" in out

    async def test_failure_exit_code(self):
        t = _tools(config=_cfg(host="srv"), exec_ret=(1, "boom"))
        assert "Claude Code failed (exit 1)" in await t._handle_claude_code(_base_inp())

    async def test_allow_edits_su_path(self):
        result_json = json.dumps({"type": "result", "result": "edited"})
        t = _tools(config=_cfg(host="srv", user="claude"), exec_ret=(0, result_json))
        out = await t._handle_claude_code(
            _base_inp(allow_edits=True, allowed_tools="Edit,Write"))
        assert "edited" in out
        # the executed command wraps in `su - claude`
        assert "su - claude" in t._exec_command.call_args.args[1]

    async def test_allow_edits_already_claude_user(self):
        # running as the claude user already → no `su -` wrapper
        result_json = json.dumps({"type": "result", "result": "ok"})
        t = _tools(config=_cfg(host="srv", user="claude"), exec_ret=(0, result_json))
        with patch.dict(os.environ, {"USER": "claude"}):
            await t._handle_claude_code(_base_inp(allow_edits=True))
        assert "su - " not in t._exec_command.call_args.args[1]

    async def test_output_streaming(self):
        finish = AsyncMock()
        streamer = SimpleNamespace(
            is_enabled=lambda tool: True,
            create_callback=lambda tool, channel_id: (None, (lambda s: None), finish),
        )
        result_json = json.dumps({"type": "result", "result": "streamed"})
        t = _tools(config=_cfg(host="srv"), exec_ret=(0, result_json), streamer=streamer)
        out = await t._handle_claude_code(_base_inp())
        assert "streamed" in out
        finish.assert_awaited_once()

    async def test_streaming_finish_error_swallowed(self):
        streamer = SimpleNamespace(
            is_enabled=lambda tool: True,
            create_callback=lambda tool, channel_id: (
                None, (lambda s: None), AsyncMock(side_effect=RuntimeError("x"))),
        )
        result_json = json.dumps({"type": "result", "result": "ok"})
        t = _tools(config=_cfg(host="srv"), exec_ret=(0, result_json), streamer=streamer)
        assert "ok" in await t._handle_claude_code(_base_inp())  # finish error swallowed

    async def test_max_output_truncation(self):
        big = json.dumps({"type": "result", "result": "x" * 8000})
        t = _tools(config=_cfg(host="srv"), exec_ret=(0, big))
        out = await t._handle_claude_code(_base_inp(max_output_chars=1000))
        assert "[... truncated ...]" in out


class TestParseStreamJson:
    def test_no_activity_returns_raw(self):
        # No tool calls, no cost → returns the raw output verbatim
        text, activity = CodingTools._parse_claude_stream_json("plain text\nno json here")
        assert text == "plain text\nno json here" and activity == ""

    def test_ignores_blank_and_bad_json(self):
        raw = "\n  \nnot-json\n" + json.dumps({"type": "result", "result": "ok",
                                               "total_cost_usd": 0.01, "num_turns": 2})
        text, activity = CodingTools._parse_claude_stream_json(raw)
        assert text == "ok" and "Turns: 2" in activity and "$0.0100" in activity

    def test_tool_activity_all_kinds(self):
        lines = [
            {"type": "assistant", "message": {"content": [
                {"type": "tool_use", "name": "Read", "input": {"file_path": "a.py"}},
                {"type": "tool_use", "name": "Read", "input": {"file_path": "a.py"}},  # dup
                {"type": "tool_use", "name": "Edit",
                 "input": {"file_path": "b.py", "old_string": "x", "new_string": "y"}},
                {"type": "tool_use", "name": "Write",
                 "input": {"file_path": "c.py", "content": "hello"}},
                {"type": "tool_use", "name": "Bash", "input": {"command": "ls -la"}},
                {"type": "tool_use", "name": "Grep", "input": {"pattern": "TODO"}},
            ]}},
            {"type": "result", "result": "summary", "total_cost_usd": 0.5,
             "num_turns": 3, "duration_ms": 4500},
        ]
        raw = "\n".join(json.dumps(x) for x in lines)
        text, activity = CodingTools._parse_claude_stream_json(raw)
        assert text == "summary"
        assert "Files read: a.py" in activity  # dedup → single entry
        assert "b.py:" in activity and "c.py (5 chars)" in activity
        assert "$ ls -la" in activity and "Grep: TODO" in activity

    def test_truncates_long_lists(self):
        content = []
        for i in range(15):
            content.append({"type": "tool_use", "name": "Read",
                            "input": {"file_path": f"f{i}.py"}})
        for i in range(12):
            content.append({"type": "tool_use", "name": "Edit",
                            "input": {"file_path": f"e{i}.py",
                                      "old_string": "a", "new_string": "b"}})
        for i in range(12):
            content.append({"type": "tool_use", "name": "Bash",
                            "input": {"command": f"cmd{i}"}})
        lines = [
            {"type": "assistant", "message": {"content": content}},
            {"type": "result", "result": "r", "total_cost_usd": 0.1},
        ]
        raw = "\n".join(json.dumps(x) for x in lines)
        _, activity = CodingTools._parse_claude_stream_json(raw)
        assert "+5 more" in activity      # reads capped at 10
        assert "+4 more" in activity      # edits capped at 8
        assert "(+4 more)" in activity    # commands capped at 8

    def test_activity_truncated_at_2000(self):
        # 10 long read paths push the activity summary past the 2000-char cap
        content = [{"type": "tool_use", "name": "Read",
                    "input": {"file_path": f"/very/long/path/{i}/" + "x" * 200}}
                   for i in range(10)]
        lines = [
            {"type": "assistant", "message": {"content": content}},
            {"type": "result", "result": "r", "total_cost_usd": 0.1},
        ]
        raw = "\n".join(json.dumps(x) for x in lines)
        _, activity = CodingTools._parse_claude_stream_json(raw)
        assert activity.endswith("...") and len(activity) == 2000
