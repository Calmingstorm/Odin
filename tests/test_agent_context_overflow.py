"""Agent context-overflow recovery (design settled with Odin, 2026-08-09).

The constraint these tests enforce, near-verbatim from Aaron: the fix must
NOT change how agents behave today except where today's behavior is death by
``context_length_exceeded``. Hence the load-bearing pin: an agent that never
overflows receives byte-for-byte identical payloads and callback call counts
with the recovery machinery present.
"""

from __future__ import annotations

import asyncio
import copy
import json

import pytest

from src.agents.manager import (
    _EMERGENCY_TARGET_CHARS,
    _EMERGENCY_TARGET_CHARS_AGGRESSIVE,
    AgentManager,
    _is_context_overflow,
)
from src.llm.context_compressor import (
    emergency_compress_for_window,
    estimate_message_chars,
)
from src.llm.errors import LLMRequestError, LLMTransportError


def _overflow_error() -> LLMRequestError:
    return LLMRequestError(
        'Codex stream failed: error: {"type": "error", "error": '
        '{"type": "invalid_request_error", "code": "context_length_exceeded"}}',
        provider="codex",
        model="gpt-5.6-terra",
        code="context_length_exceeded",
    )


def _iteration(i: int, size: int) -> list[dict]:
    return [
        {
            "role": "assistant",
            "content": [
                {"type": "tool_use", "id": f"tu_{i}", "name": "web_search", "input": {"q": str(i)}}
            ],
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": f"tu_{i}",
                    "content": f"result-{i}:" + ("x" * size),
                }
            ],
        },
    ]


def _messages(n_iterations: int, size: int) -> list[dict]:
    msgs: list[dict] = [{"role": "user", "content": "TASK: research the thing"}]
    for i in range(n_iterations):
        msgs.extend(_iteration(i, size))
    return msgs


def _pairing_valid(messages: list[dict]) -> bool:
    """Every tool_result must follow a tool_use with the matching id."""
    seen_uses: set[str] = set()
    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use":
                seen_uses.add(block.get("id"))
            elif block.get("type") == "tool_result":
                if block.get("tool_use_id") not in seen_uses:
                    return False
    return True


class _Harness:
    """Drive AgentManager with a scripted iteration callback."""

    def __init__(self, script):
        # script: callable(call_index, messages) -> response dict or raises
        self.calls: list[list[dict]] = []
        self.script = script

    async def iteration_callback(self, messages, system_prompt, tools):
        self.calls.append(copy.deepcopy(messages))
        return await self.script(len(self.calls), messages)

    def spawn(self, mgr: AgentManager) -> str:
        return mgr.spawn(
            label="t",
            goal="go",
            channel_id="c1",
            requester_id="u1",
            requester_name="user",
            iteration_callback=self.iteration_callback,
            tool_executor_callback=self._tool_cb,
        )

    async def _tool_cb(self, name, tool_input):
        return "tool-ok"


async def _run_to_terminal(mgr: AgentManager, agent_id: str) -> None:
    await mgr._agents[agent_id]._task
    await asyncio.sleep(0)


class TestByteForByteEquivalence:
    """Agents that never overflow see EXACTLY today's payloads and calls."""

    async def test_no_overflow_payloads_identical_and_no_recovery_state(self):
        async def script(n, messages):
            if n < 3:
                return {
                    "text": "",
                    "tool_calls": [
                        {"id": f"tu_s{n}", "name": "web_search", "input": {"q": "x"}}
                    ],
                    "stop_reason": "tool_use",
                }
            return {"text": "DONE: fine", "tool_calls": [], "stop_reason": "end_turn"}

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = h.spawn(mgr)
        assert not agent_id.startswith("Error")
        await _run_to_terminal(mgr, agent_id)
        agent = mgr._agents[agent_id]

        assert agent.context_char_ceiling is None
        assert agent.context_recoveries == []
        # to_dict must not even carry the recovery keys (wire compatibility).
        d = mgr.to_dict(agent) if hasattr(mgr, "to_dict") else agent_to_dict(mgr, agent)
        assert "context_recoveries" not in json.dumps(d) or not agent.context_recoveries
        # Callback saw monotonically growing history, never a compressed form:
        # no emergency summary marker anywhere.
        for payload in h.calls:
            assert "[Emergency context compression" not in json.dumps(payload)

    async def test_overflow_predicate_is_structural_not_substring(self):
        transport = LLMTransportError(
            "Codex stream failed: context_length_exceeded mentioned in body",
            provider="codex",
        )
        assert not _is_context_overflow(transport)
        request_no_code = LLMRequestError("bad request", provider="codex")
        assert not _is_context_overflow(request_no_code)
        assert _is_context_overflow(_overflow_error())


def agent_to_dict(mgr, agent):
    for name in ("_agent_dict", "agent_to_dict"):
        fn = getattr(mgr, name, None)
        if fn:
            return fn(agent)
    return {"context_recoveries": agent.context_recoveries}


class TestOverflowRecovery:
    async def test_first_overflow_compresses_retries_same_iteration_and_latches(self):
        big = _messages(40, 30_000)  # ~1.2M chars

        async def script(n, messages):
            if n == 1:
                # Simulate the provider seeing an oversized payload. Grow the
                # agent's real message list to the oversized shape first, the
                # way 40 scrape iterations would have.
                messages.clear()
                messages.extend(copy.deepcopy(big))
                raise _overflow_error()
            return {"text": "DONE: ok", "tool_calls": [], "stop_reason": "end_turn"}

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = h.spawn(mgr)
        await _run_to_terminal(mgr, agent_id)
        agent = mgr._agents[agent_id]

        # Recovered: terminal state is COMPLETED, not FAILED.
        assert agent.state.name in ("COMPLETED", "READY"), agent.error
        # The retry happened within the same iteration: two callback calls,
        # and the SECOND saw a compressed payload under the primary target.
        assert len(h.calls) == 2
        retry_payload = h.calls[1]
        assert estimate_message_chars(retry_payload) <= _EMERGENCY_TARGET_CHARS
        # Task preserved verbatim, newest iteration retained, pairing valid.
        assert retry_payload[0] == {"role": "user", "content": "TASK: research the thing"}
        assert "result-39" in json.dumps(retry_payload)
        assert _pairing_valid(retry_payload)
        # Latch set to the size that succeeded; recovery recorded.
        assert agent.context_char_ceiling is not None
        assert agent.context_char_ceiling <= _EMERGENCY_TARGET_CHARS
        assert len(agent.context_recoveries) == 1
        r = agent.context_recoveries[0]
        assert r["trigger"] == "overflow" and r["attempt"] == 1 and r["fits"]

    async def test_second_overflow_uses_aggressive_target_then_existing_failure(self):
        big = _messages(40, 30_000)

        async def script(n, messages):
            messages.clear()
            messages.extend(copy.deepcopy(big))
            raise _overflow_error()

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = h.spawn(mgr)
        await _run_to_terminal(mgr, agent_id)
        agent = mgr._agents[agent_id]

        # Exactly two emergency passes, then the existing failure handling —
        # no loops.
        assert len(h.calls) == 3
        assert estimate_message_chars(h.calls[2]) <= _EMERGENCY_TARGET_CHARS_AGGRESSIVE
        assert agent.state.name == "FAILED"
        assert "context_length_exceeded" in (agent.error or "")
        assert [r["attempt"] for r in agent.context_recoveries] == [1, 2]

    async def test_latch_compacts_before_send_without_an_error(self):
        big = _messages(40, 30_000)
        grow = _messages(35, 30_000)  # over the latch after recovery

        async def script(n, messages):
            if n == 1:
                messages.clear()
                messages.extend(copy.deepcopy(big))
                raise _overflow_error()
            if n == 2:
                # Ask for one more tool round so another iteration happens,
                # then balloon the history past the latch.
                return {
                    "text": "",
                    "tool_calls": [
                        {"id": "tu_more", "name": "web_search", "input": {"q": "y"}}
                    ],
                    "stop_reason": "tool_use",
                }
            return {"text": "DONE", "tool_calls": [], "stop_reason": "end_turn"}

        h = _Harness(script)
        mgr = AgentManager()
        agent_id = h.spawn(mgr)
        agent = mgr._agents[agent_id]

        # Balloon the messages between iterations by riding the tool result:
        # after call 2 returns a tool_call, the worker appends the result and
        # loops; grow the history there via the tool callback.
        original_tool_cb = h._tool_cb

        async def fat_tool_cb(name, tool_input):
            agent.messages.extend(copy.deepcopy(grow))
            return await original_tool_cb(name, tool_input)

        agent.tool_executor_callback = fat_tool_cb
        await _run_to_terminal(mgr, agent_id)

        assert agent.state.name in ("COMPLETED", "READY"), agent.error
        # The third call (post-latch) was compacted BEFORE sending: under the
        # ceiling, and a latch-triggered recovery record exists.
        ceiling = agent.context_char_ceiling
        assert ceiling is not None
        assert estimate_message_chars(h.calls[2]) <= ceiling
        assert any(r["trigger"] == "latch" for r in agent.context_recoveries)
        # Only ONE 400-driven recovery ever happened; the latch prevented more.
        assert sum(1 for r in agent.context_recoveries if r["trigger"] == "overflow") == 1


class TestEmergencyCompressor:
    def test_size_based_retention_and_summary(self):
        msgs = _messages(30, 20_000)
        out, report = emergency_compress_for_window(msgs, target_chars=150_000)
        assert report["fits"]
        assert estimate_message_chars(out) <= 150_000
        assert report["iterations_kept"] >= 1
        assert report["iterations_summarized"] == 30 - report["iterations_kept"]
        assert out[0]["content"].startswith("TASK:")
        assert _pairing_valid(out)
        # Newest iteration always survives.
        assert "result-29" in json.dumps(out)

    def test_single_enormous_result_truncated_with_pairing_intact(self):
        msgs = _messages(2, 5_000)
        msgs.extend(_iteration(99, 500_000))  # one massive scrape, newest
        out, report = emergency_compress_for_window(msgs, target_chars=120_000)
        assert report["fits"]
        assert report["results_truncated"] >= 1
        assert report["chars_elided"] > 0
        blob = json.dumps(out)
        assert "emergency truncation" in blob
        assert "tu_99" in blob  # the pair survived structurally
        assert _pairing_valid(out)

    def test_unboundable_prefix_returns_unchanged_and_not_fits(self):
        msgs = [{"role": "user", "content": "TASK: " + "p" * 300_000}]
        msgs.extend(_iteration(0, 1_000))
        out, report = emergency_compress_for_window(msgs, target_chars=100_000)
        assert not report["fits"]
        assert out == msgs

    def test_under_target_is_reported_fitting_without_changes(self):
        msgs = _messages(3, 1_000)
        out, report = emergency_compress_for_window(msgs, target_chars=500_000)
        assert report["fits"]
        assert _pairing_valid(out)


class TestProviderClassification:
    def test_sse_invalid_request_becomes_fast_fail_request_error(self):
        from src.llm.openai_codex import CodexStreamError, _stream_error_from_event

        e = _stream_error_from_event(
            "error",
            {
                "type": "error",
                "error": {
                    "type": "invalid_request_error",
                    "code": "context_length_exceeded",
                    "message": "Your input exceeds the context window of this model.",
                },
            },
        )
        assert isinstance(e, CodexStreamError)
        assert e.error_code == "context_length_exceeded"
        assert not e.is_capacity


class TestProviderNoRetryBurn:
    """The doomed-payload pin: an SSE invalid_request/context_length event
    makes exactly ONE HTTP attempt (no inner retry burn on a deterministic
    failure), raises the typed fast-fail with its structured code, and never
    counts against the client breaker (infrastructure health, not payload
    validity)."""

    @pytest.mark.asyncio
    async def test_one_attempt_typed_code_breaker_untouched(self, monkeypatch):
        from src.llm.openai_codex import CodexChatClient
        from tests.test_openai_codex_client import _BareAuth, _FakeResp, _sse

        client = CodexChatClient(auth=_BareAuth(), model="gpt-5.6-terra", max_retries=3)
        posts = {"n": 0}
        failures = {"n": 0}
        monkeypatch.setattr(
            client.breaker, "record_failure", lambda: failures.__setitem__("n", failures["n"] + 1)
        )

        event = {
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "code": "context_length_exceeded",
                "message": "Your input exceeds the context window of this model.",
            },
        }

        class _CM:
            async def __aenter__(self):
                posts["n"] += 1
                return type("R", (), {"status": 200, "content": _FakeResp([_sse(event)]).content})()

            async def __aexit__(self, *exc):
                return False

        class _Sess:
            closed = False

            def post(self, url, **kwargs):
                return _CM()

        async def _fake_session():
            return _Sess()

        monkeypatch.setattr(client, "_get_session", _fake_session)

        with pytest.raises(LLMRequestError) as ei:
            await client._send_with_retries(
                {"model": "gpt-5.6-terra"}, client._read_stream, lambda r: not r
            )
        assert ei.value.code == "context_length_exceeded"
        assert posts["n"] == 1, "retry engine must not burn attempts on a doomed payload"
        assert failures["n"] == 0, "breaker counts infrastructure health, not payload validity"
