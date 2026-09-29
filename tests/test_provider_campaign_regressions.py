"""Real provider/gateway settlement and reload regressions for v4.10.0."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.config.schema import Config, OpenRouterRoutingConfig
from src.discord.llm_gateway import LLMGateway
from src.discord.tool_loop import ToolLoopRunner
from src.llm.auxiliary import AuxiliaryLLMClient
from src.llm.circuit_breaker import CircuitBreaker, CircuitOpenError
from src.llm.client_lifecycle import ClientLifecycle
from src.llm.errors import (
    LLMContextLengthError,
    LLMIncompleteResponseError,
    LLMRequestError,
    LLMTransportError,
)
from src.llm.model_breaker import ModelCapacityBreaker
from src.llm.ollama import OllamaClient
from src.llm.openai_codex import CodexChatClient
from src.llm.openai_compatible import OpenAICompatibleClient
from src.llm.openrouter import conservative_profile
from src.llm.recovery import RecoveryPolicy, generate_with_recovery
from src.web.api._agent_display import agent_display_policy


def config(**kwargs):
    return Config(discord={"token": "fixture"}, **kwargs)


def gateway(config, **kwargs):
    defaults = dict(
        codex_client=None,
        ollama_client=None,
        kimi_client=None,
        subsystem_guard=None,
        auxiliary_llm_client=None,
        cost_tracker=None,
    )
    return LLMGateway(
        get_config=lambda: config,
        sessions=MagicMock(),
        reflector=MagicMock(),
        **(defaults | kwargs),
    )


class Response:
    status = 200

    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass

    async def json(self):
        return self.payload

    async def text(self):
        return json.dumps(self.payload)


def test_keyword_named_parameters_survive_kimi_sanitization():
    from src.tools.defs.integrations_email import TOOLS_SECTION as TOOLS

    client = OpenAICompatibleClient("fixture", model="kimi", tool_quirks={"sanitize_schema": True})
    schema = {
        "type": "object",
        "title": "annotation",
        "additionalProperties": False,
        "properties": {
            name: {"type": "string", "title": "annotation"} for name in ("format", "title", "$ref")
        },
        "required": ["format", "title", "$ref"],
    }
    cleaned = client._sanitize_schema(schema)
    assert set(cleaned["properties"]) == set(schema["properties"])
    assert "title" not in cleaned
    assert cleaned["properties"]["title"] == {"type": "string"}
    validate = next(tool for tool in TOOLS if tool["name"] == "validate_action")
    converted = client._convert_tools([validate])[0]["function"]["parameters"]
    assert converted["properties"]["format"] == validate["input_schema"]["properties"]["format"]


def test_openrouter_constraints_cover_heterogeneous_routes():
    profile = conservative_profile(
        [
            {
                "tag": "context",
                "supports_tools": True,
                "context_length": 64000,
                "max_completion_tokens": 32000,
            },
            {
                "tag": "output",
                "supports_tools": True,
                "context_length": 128000,
                "max_completion_tokens": 4096,
            },
        ],
        OpenRouterRoutingConfig(),
    )
    assert profile["total_window_tokens"] == 64000
    assert profile["max_output_tokens"] == 4096
    assert profile["context_route_tag"] == "context"
    assert profile["output_route_tag"] == "output"


def test_adaptive_cooldown_saturates_thousands_of_opens(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr("src.llm.model_breaker.time.monotonic", lambda: clock[0])
    breaker = ModelCapacityBreaker("fixture")
    breaker.record_generation_failure()
    for _ in range(2000):
        clock[0] += 301
        admission = breaker.acquire_attempt()
        breaker.attempt_failed_capacity(admission)
        assert breaker.snapshot()["cooldown_seconds"] <= 300
    assert breaker.snapshot()["consecutive_opens"] == 2001


async def test_transport_breaker_reserves_one_probe_and_cancel_releases(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr("src.llm.circuit_breaker.time.monotonic", lambda: clock[0])
    client = OllamaClient(model="fixture", max_retries=0)
    client.breaker = CircuitBreaker("fixture", failure_threshold=1, recovery_timeout=10)
    client.breaker.record_failure()
    clock[0] = 11
    entered = asyncio.Event()

    async def session():
        entered.set()
        await asyncio.Event().wait()

    client._get_session = session
    probe = asyncio.create_task(client.chat([], ""))
    await entered.wait()
    for _ in range(50):
        with pytest.raises(CircuitOpenError):
            await client.chat([], "")
    probe.cancel()
    with pytest.raises(asyncio.CancelledError):
        await probe
    client.breaker.check()  # cancellation did not strand ownership
    client.breaker.abandon()


@pytest.mark.parametrize("provider", ["compat", "ollama"])
async def test_canonical_model_reaches_tool_and_direct_outbound_bodies(provider):
    cfg = config(llm_provider={"model": f"{provider}:chosen"})
    bodies = []

    async def request(body):
        bodies.append(body)
        if provider == "ollama":
            return {"message": {"content": "complete"}, "done": True, "done_reason": "stop"}
        return {"choices": [{"message": {"content": "complete"}, "finish_reason": "stop"}]}

    client = (
        OllamaClient(model="default")
        if provider == "ollama"
        else OpenAICompatibleClient("fixture", model="default")
    )
    client._request_with_retry = request
    gw = gateway(
        cfg,
        **({"ollama_client": client} if provider == "ollama" else {"compatible_client": client}),
    )
    await gw.call_with_tools(messages=[], system="", tools=[])
    assert await gw.chat([], "") == "complete"
    assert [body["model"] for body in bodies] == ["chosen", "chosen"]
    gw.wire_callbacks()
    await gw.sessions.set_compaction_fn.call_args.args[0]([], "")
    assert bodies[-1]["model"] == "chosen"


async def test_codex_direct_model_override_reaches_request():
    client = CodexChatClient(auth=MagicMock(), model="gpt-6-luna")
    client._stream_request = AsyncMock(return_value="complete")
    gw = gateway(config(llm_provider={"model": "gpt-6.1-sol"}), codex_client=client)
    assert await gw.chat([], "") == "complete"
    assert client._stream_request.call_args.args[0]["model"] == "gpt-6.1-sol"


async def test_one_token_aux_probe_accepts_length_without_relaxing_chat():
    client = OpenAICompatibleClient("fixture", model="chosen")
    client._request_with_retry = AsyncMock(
        return_value={
            "choices": [{"message": {"content": "p"}, "finish_reason": "length"}],
        }
    )
    gw = gateway(config())
    assert await gw._probe_aux(client) is None
    with pytest.raises(LLMRequestError, match="truncated"):
        await client.chat([], "")


async def test_borrowed_aux_accounting_uses_override_and_ollama_usage():
    client = OllamaClient(model="primary")
    client._request_with_retry = AsyncMock(
        return_value={
            "model": "cheap",
            "message": {"content": "complete"},
            "done": True,
            "done_reason": "stop",
            "prompt_eval_count": 123,
            "eval_count": 17,
        }
    )
    cost = MagicMock()
    wrapper = AuxiliaryLLMClient(
        client, client, cost, provider="ollama", model="cheap", owns_aux_client=False
    )
    assert await wrapper.chat([], "", task="compaction") == "complete"
    assert cost.record.call_args.kwargs["model"] == "cheap"
    assert cost.record.call_args.kwargs["input_tokens"] == 123
    assert cost.record.call_args.kwargs["output_tokens"] == 17


@pytest.mark.parametrize("provider", ["compat", "ollama"])
async def test_reload_preserves_borrowed_aux_and_rebinds_cross_provider_fallback(provider):
    cfg = config(
        llm_provider={"model": "ollama:primary"},
        openai_codex={"auxiliary": {"enabled": True, "model": f"{provider}:cheap"}},
    )
    old_primary = OllamaClient(model="primary")
    old_transport = (
        old_primary if provider == "ollama" else OpenAICompatibleClient("fixture", model="default")
    )
    wrapper = AuxiliaryLLMClient(
        old_transport, old_primary, provider=provider, model="cheap", owns_aux_client=False
    )
    gw = gateway(
        cfg,
        ollama_client=old_primary,
        compatible_client=old_transport if provider == "compat" else None,
        auxiliary_llm_client=wrapper,
    )
    new_primary = OllamaClient(model="primary")
    gw.ollama_client = new_primary
    gw._reconcile_auxiliary_primary()
    current = gw.auxiliary_llm_client
    assert current is not None
    assert current.primary_client is new_primary
    assert current.aux_client is (old_transport if provider == "compat" else new_primary)
    assert current.model == "cheap"
    old_primary.retire()
    current.aux_client._request_with_retry = AsyncMock(
        return_value=(
            {"message": {"content": "complete"}, "done": True, "done_reason": "stop"}
            if provider == "ollama"
            else {"choices": [{"message": {"content": "complete"}}]}
        )
    )
    assert await current.chat([], "", task="compaction") == "complete"
    await asyncio.gather(*gw._aux_drains)


async def test_cancelled_compatible_qualification_drains_candidate(monkeypatch):
    cfg = config(openai_compatible={"enabled": True, "api_key": "fixture", "model": "chosen"})
    gw = gateway(cfg)
    candidate = OpenAICompatibleClient("fixture", model="chosen")
    candidate.close = AsyncMock()
    entered = asyncio.Event()

    async def probe(_):
        entered.set()
        await asyncio.Event().wait()

    monkeypatch.setattr("src.discord.llm_gateway.OpenAICompatibleClient", lambda **_: candidate)
    gw._probe_openai_compatible = probe
    task = asyncio.create_task(gw.reload_openai_compatible())
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.gather(*gw._aux_drains)
    candidate.close.assert_awaited_once()
    assert candidate._generation_retired


async def test_logical_generation_keeps_client_through_retry_and_child_attempt():
    class Client(ClientLifecycle):
        async def close(self):
            pass

    client = Client()
    calls = 0

    async def attempt():
        nonlocal calls
        async with client.generation_lease():
            calls += 1
            if calls == 1:
                client.retire()
                raise LLMTransportError("transient")
            return "complete"

    assert (
        await generate_with_recovery(
            attempt,
            policy=RecoveryPolicy(backoff_base=0.001, backoff_cap=0.001),
            generation_client=client,
            cancel_event=asyncio.Event(),
        )
        == "complete"
    )
    assert calls == 2
    assert client._generation_inflight == 0


@pytest.mark.parametrize(
    "main,agent,effort",
    [
        ("compat:main", "gpt-6.1-sol", "high"),
        ("gpt-6.1-sol", "ollama:chosen", "N/A"),
    ],
)
def test_pending_display_resolves_agent_not_main_provider(main, agent, effort):
    cfg = config(llm_provider={"model": main})
    info = SimpleNamespace(
        has_executed=False, model_override=agent, reasoning_effort_override="high"
    )
    display = agent_display_policy(info, SimpleNamespace(config=cfg))
    assert display["display_model"] == agent.removeprefix("ollama:")
    assert display["display_reasoning_effort"] == effort


@pytest.mark.parametrize("native", [False, True])
async def test_partial_provider_output_is_failed_verbatim_not_retried(native):
    partial = "uncut output\n" * 20000
    if native:
        response = OllamaClient(model="fixture")._parse_response(
            {
                "message": {"content": partial},
                "done": True,
                "done_reason": "length",
            }
        )
    else:

        async def events():
            for event in [
                {"type": "response.output_text.delta", "delta": partial},
                {"type": "response.incomplete", "response": {}},
            ]:
                yield ("data: " + json.dumps(event) + "\n").encode()

        response = await CodexChatClient(auth=MagicMock(), model="gpt-6.1-sol")._read_tool_stream(
            SimpleNamespace(content=events())
        )
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._channel_state = MagicMock()
    runner._turn_recorder = SimpleNamespace(_save_turn_trajectory=AsyncMock())
    runner._clear_active = MagicMock()
    st = SimpleNamespace(
        _cancel=asyncio.Event(),
        _ch_id="c",
        _req_id="r",
        _trajectory=object(),
        tools_used_in_loop=[],
        trace=None,
    )
    kind, result = await runner._finalize_or_retry(st, response)
    assert kind == "done" and result[2] is True
    assert result[0] == partial + "\n\n[Provider marked this response incomplete.]"
    assert runner._turn_recorder._save_turn_trajectory.call_args.kwargs["error"] == result[0]


async def test_ollama_direct_incomplete_retains_text_and_empty_is_not_silence():
    client = OllamaClient(model="fixture")
    client._request_with_retry = AsyncMock(
        return_value={"message": {"content": "partial"}, "done_reason": "length", "done": True}
    )
    with pytest.raises(LLMIncompleteResponseError) as caught:
        await client.chat([], "")
    assert caught.value.partial_text == "partial"
    with pytest.raises(LLMRequestError) as empty:
        client._parse_response({"message": {"content": ""}, "done": True, "done_reason": "stop"})
    assert empty.value.code == "empty_response"


async def test_long_completed_native_reply_unchanged():
    client = OllamaClient(model="fixture")
    text = "legitimate long answer\n" * 20000
    client._request_with_retry = AsyncMock(
        return_value={"message": {"content": text}, "done": True, "done_reason": "stop"}
    )
    assert await client.chat([], "") == text
    assert (await client.chat_with_tools([], "", [])).text == text


@pytest.mark.parametrize("lane", ["boot", "reload"])
async def test_production_deepseek_clients_classify_context_overflow(lane, tmp_path, monkeypatch):
    cfg = config(
        openai_compatible={
            "enabled": True,
            "api_key": "fixture",
            "preset": "deepseek",
            "model": "deepseek-chat",
            "base_url": "https://api.deepseek.com/v1",
        }
    )
    if lane == "boot":
        from tests.fakes import make_bot

        monkeypatch.chdir(tmp_path)
        bot = make_bot(
            config_overrides={
                "search": {"enabled": False},
                "openai_compatible": cfg.openai_compatible.model_dump(),
            }
        )
        client = bot.llm_gateway.compatible_client
    else:
        gw = gateway(cfg)
        gw._probe_openai_compatible = AsyncMock(return_value=None)
        assert (await gw.reload_openai_compatible())["configured"]
        client = gw.compatible_client
    payload = {
        "error": {
            "type": "invalid_request_error",
            "message": "This model's maximum context length is 64000 tokens.",
        }
    }
    session = SimpleNamespace(post=lambda *_, **__: Response(payload, 400))
    client._get_session = AsyncMock(return_value=session)
    with pytest.raises(LLMContextLengthError) as caught:
        await client._request_with_retry({"model": "deepseek-chat"})
    assert caught.value.context_window_tokens == 64000


async def test_incomplete_agent_retains_result_and_failed_trajectory():
    from src.agents.manager import AgentInfo, _run_agent

    text = "partial long output\n" * 20000
    agent = AgentInfo(
        id="fixture",
        label="test",
        goal="reason",
        channel_id="c",
        requester_id="u",
        requester_name="user",
    )
    callback = AsyncMock(return_value={"text": text, "tool_calls": [], "stop_reason": "incomplete"})
    saver = SimpleNamespace(save=AsyncMock())
    await _run_agent(agent, "", [], callback, AsyncMock(), trajectory_saver=saver)
    assert agent.status == "failed"
    assert agent.result == text
    assert callback.await_count == 1
    saved = saver.save.call_args.args[0]
    assert saved.result == text
    assert saved.final_state == "failed"


async def test_incomplete_loop_preserves_full_output_and_failure():
    from src.llm.types import LLMResponse

    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    runner._finish_loop = AsyncMock(side_effect=lambda _, text, **kwargs: text)
    text = "partial loop output\n" * 20000
    st = SimpleNamespace(_trajectory=None, final_text="", completed_naturally=False)
    assert runner._record_loop_iteration(st, LLMResponse(text=text, stop_reason="incomplete"), 1)
    assert not st.completed_naturally
    assert (
        await runner._finalize_loop(st) == text + "\n\n[Provider marked this response incomplete.]"
    )
    assert runner._finish_loop.call_args.kwargs["is_error"] is True


async def test_compatible_aux_uses_result_scoped_served_model_and_usage():
    client = OpenAICompatibleClient("fixture", model="primary")
    client._request_with_retry = AsyncMock(
        return_value={
            "model": "served-cheap",
            "choices": [{"message": {"content": "complete"}}],
            "usage": {"prompt_tokens": 123, "completion_tokens": 17},
        }
    )
    cost = MagicMock()
    wrapper = AuxiliaryLLMClient(
        client,
        client,
        cost,
        provider="compat",
        model="cheap",
        owns_aux_client=False,
    )
    assert await wrapper.chat([], "", task="reflection") == "complete"
    assert client._request_with_retry.call_args.args[0]["model"] == "cheap"
    assert cost.record.call_args.kwargs["model"] == "served-cheap"
    assert cost.record.call_args.kwargs["input_tokens"] == 123
    assert cost.record.call_args.kwargs["output_tokens"] == 17


async def test_long_completed_codex_output_unchanged():
    text = "complete reasoning\n" * 20000

    async def events():
        for event in [
            {"type": "response.output_text.delta", "delta": text},
            {"type": "response.completed", "response": {}},
        ]:
            yield ("data: " + json.dumps(event) + "\n").encode()

    client = CodexChatClient(auth=MagicMock(), model="gpt-6.1-sol")
    assert await client._read_stream(SimpleNamespace(content=events())) == text
    response = await client._read_tool_stream(SimpleNamespace(content=events()))
    assert response.text == text and response.stop_reason == "end_turn"


async def test_retirement_before_dispatch_fast_fails_without_outage_latch():
    from src.llm.errors import LLMClientRetiredError

    client = OllamaClient(model="chosen")
    client.retire()
    guard = MagicMock()
    guard.check.return_value = None
    gw = gateway(
        config(llm_provider={"model": "ollama:chosen"}), ollama_client=client, subsystem_guard=guard
    )
    with pytest.raises(LLMClientRetiredError):
        await gw.call_with_tools(messages=[], system="", tools=[])
    guard.record_failure.assert_not_called()
    assert gw.inflight_requests == 0
