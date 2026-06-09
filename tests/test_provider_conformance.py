"""Cross-provider conformance tests for the multi-LLM tool loop.

Feeds ONE canonical internal transcript (Anthropic-style content blocks) — a
two-iteration tool loop (assistant tool_use -> tool_result -> second tool_use ->
tool_result -> final text) — through each provider's message converter and
asserts that tool calls and their results survive the round trip and stay paired.

This guards the multi-LLM feature (v3.28.x): a provider that drops tool_use
blocks or mis-pairs results silently breaks multi-step tool execution (the whole
point of Odin) while single-shot chat still appears to work. The Ollama
converter previously dropped assistant tool_use blocks entirely.
"""
from __future__ import annotations

import json

from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from src.llm.openai_codex import CodexChatClient

# Exactly what discord/client.py records during a two-iteration tool loop.
TRANSCRIPT = [
    {"role": "user", "content": "check disk and memory"},
    {"role": "assistant", "content": [
        {"type": "text", "text": "I'll check the disk first."},
        {"type": "tool_use", "id": "toolu_1", "name": "run_command",
         "input": {"command": "df -h"}},
    ]},
    {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "toolu_1",
         "content": "Filesystem  Size  Used  Use%\n/  100G  50G  50%"},
    ]},
    {"role": "assistant", "content": [
        {"type": "tool_use", "id": "toolu_2", "name": "run_command",
         "input": {"command": "free -m"}},
    ]},
    {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "toolu_2",
         "content": "Mem: 64000 total, 30000 used"},
    ]},
    {"role": "assistant", "content": [
        {"type": "text", "text": "Disk is 50% used and memory is ~47% used."},
    ]},
]


class TestOllamaConformance:
    def test_tool_calls_and_results_preserved(self):
        out = OllamaClient()._convert_messages(TRANSCRIPT, "system prompt")

        # Both assistant tool calls survive as native Ollama tool_calls.
        names = [
            tc["function"]["name"]
            for m in out if m.get("role") == "assistant" and m.get("tool_calls")
            for tc in m["tool_calls"]
        ]
        assert names == ["run_command", "run_command"]

        # The first call kept its arguments (Ollama native uses a dict).
        first = next(m for m in out if m.get("role") == "assistant" and m.get("tool_calls"))
        assert first["tool_calls"][0]["function"]["arguments"] == {"command": "df -h"}

        # Both tool results appear as role:"tool" messages with the result text.
        tool_msgs = [m for m in out if m.get("role") == "tool"]
        assert len(tool_msgs) == 2
        assert "50%" in tool_msgs[0]["content"]
        assert "30000 used" in tool_msgs[1]["content"]

    def test_tool_use_not_silently_dropped(self):
        # Regression for the old converter that did `pass` on tool_use blocks.
        out = OllamaClient()._convert_messages(TRANSCRIPT, "")
        assert any(m.get("tool_calls") for m in out), "assistant tool_calls were dropped"


class TestKimiConformance:
    def test_openai_tool_call_id_pairing(self):
        out = KimiClient(api_key="test")._convert_messages(TRANSCRIPT, "system prompt")

        assistant_ids = [
            tc["id"]
            for m in out if m.get("role") == "assistant" and m.get("tool_calls")
            for tc in m["tool_calls"]
        ]
        assert assistant_ids == ["toolu_1", "toolu_2"]

        tool_msgs = [m for m in out if m.get("role") == "tool"]
        assert [m["tool_call_id"] for m in tool_msgs] == ["toolu_1", "toolu_2"]

        # OpenAI invariant: every tool message references a real assistant call id.
        for m in tool_msgs:
            assert m["tool_call_id"] in assistant_ids

    def test_arguments_serialized_as_json_string(self):
        out = KimiClient(api_key="test")._convert_messages(TRANSCRIPT, "")
        tc = next(tc for m in out if m.get("tool_calls") for tc in m["tool_calls"])
        # OpenAI schema requires arguments to be a JSON string.
        assert json.loads(tc["function"]["arguments"]) == {"command": "df -h"}


class TestCodexConformance:
    @staticmethod
    def _client() -> CodexChatClient:
        # _convert_messages_with_tools is a pure function of messages; auth unused.
        return CodexChatClient(auth=None, model="gpt-5", max_tokens=1000)

    def test_function_call_and_output_pairing(self):
        out = self._client()._convert_messages_with_tools(TRANSCRIPT)

        calls = [b for b in out if b.get("type") == "function_call"]
        outputs = [b for b in out if b.get("type") == "function_call_output"]
        assert [c["name"] for c in calls] == ["run_command", "run_command"]
        assert [c["call_id"] for c in calls] == ["toolu_1", "toolu_2"]
        assert [o["call_id"] for o in outputs] == ["toolu_1", "toolu_2"]

        # Each output is paired to a real function_call.
        call_ids = {c["call_id"] for c in calls}
        for o in outputs:
            assert o["call_id"] in call_ids
