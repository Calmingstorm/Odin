"""Held production adapter calls survive retire; invalid requests leave health intact."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.health.subsystem_guard import SubsystemGuard
from src.llm.auxiliary import AuxiliaryLLMClient
from src.llm.errors import LLMRequestError, LLMTransportError
from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from src.llm.types import LLMResponse
from tests.test_codex_reliability import FakeResp, FakeSession, _client
from tests.test_llm_gateway import _cfg, _gw


def test_absent_client_retirement_has_no_drain_task():
    gateway = _gw(_cfg())
    gateway._schedule_client_drain(None)
    assert not gateway._aux_drains


@pytest.mark.parametrize("provider", ["kimi", "ollama"])
@pytest.mark.parametrize("entry", ["chat", "chat_with_tools"])
@pytest.mark.parametrize("cancel", [False, True])
async def test_real_adapter_held_during_reload(provider, entry, cancel, monkeypatch):
    client = KimiClient(api_key="test") if provider == "kimi" else OllamaClient()
    entered, release = asyncio.Event(), asyncio.Event()

    async def request(body):
        entered.set()
        await release.wait()
        return {}

    monkeypatch.setattr(client, "_request_with_retry", request)
    monkeypatch.setattr(client, "close", AsyncMock())
    kwargs = {"messages": [], "system": ""}
    if entry == "chat_with_tools":
        kwargs["tools"] = []
    task = asyncio.create_task(getattr(client, entry)(**kwargs))
    await entered.wait()
    gw = _gw(_cfg(active=provider), **{provider: client})
    await getattr(gw, f"reload_{provider}_inner")()
    assert gw._aux_drains
    await asyncio.sleep(0)
    client.close.assert_not_awaited()
    with pytest.raises(LLMTransportError, match="retired"):
        await client.chat([], "")
    if cancel:
        task.cancel()
    else:
        release.set()
    await asyncio.gather(task, return_exceptions=True)
    await asyncio.gather(*gw._aux_drains)
    client.close.assert_awaited_once()


async def test_request_invalid_burst_does_not_poison_guard():
    guard = SubsystemGuard()
    guard.register("llm_kimi")
    client = SimpleNamespace(chat_with_tools=AsyncMock(side_effect=LLMRequestError("bad input")))
    gw = _gw(_cfg(active="kimi"), kimi=client, guard=guard)
    for _ in range(12):
        with pytest.raises(LLMRequestError):
            await gw.call_with_tools(messages=[], system="", tools=[])
    client.chat_with_tools.side_effect = None
    client.chat_with_tools.return_value = LLMResponse(text="valid")
    assert (await gw.call_with_tools(messages=[], system="", tools=[])).text == "valid"
    assert client.chat_with_tools.await_count == 13


@pytest.mark.parametrize("entry", ["chat", "chat_with_tools"])
async def test_codex_disable_holds_direct_request(entry, monkeypatch):
    client = _client()
    entered, release = asyncio.Event(), asyncio.Event()

    async def request(*args, **kwargs):
        entered.set()
        await release.wait()
        return "done" if entry == "chat" else LLMResponse(text="done")

    monkeypatch.setattr(client, "_stream_request", request)
    monkeypatch.setattr(client, "_stream_tool_request", request)
    monkeypatch.setattr(client, "close", AsyncMock())
    kwargs = {"messages": [], "system": ""}
    if entry == "chat_with_tools":
        kwargs["tools"] = []
    task = asyncio.create_task(getattr(client, entry)(**kwargs))
    await entered.wait()
    gw = _gw(_cfg(codex_enabled=False), codex=client)
    await gw.reload_codex()
    drains = list(gw._aux_drains)
    await asyncio.sleep(0)
    client.close.assert_not_awaited()
    assert drains
    release.set()
    await task
    await asyncio.gather(*drains)
    client.close.assert_awaited_once()
    assert all(drain.done() for drain in drains)


async def test_aux_fallback_keeps_captured_primary_alive_across_rebind(monkeypatch):
    primary = _client()
    monkeypatch.setattr(primary, "_stream_request", AsyncMock(return_value="old primary"))
    monkeypatch.setattr(primary, "close", AsyncMock())
    entered, release = asyncio.Event(), asyncio.Event()

    async def cheap(*args, **kwargs):
        entered.set()
        await release.wait()
        raise LLMRequestError("fallback")

    wrapper = AuxiliaryLLMClient(SimpleNamespace(chat=cheap), primary)
    task = asyncio.create_task(wrapper.chat([], "", task="test"))
    await entered.wait()
    replacement = SimpleNamespace(chat=AsyncMock(return_value="new primary"))
    wrapper.primary_client = replacement
    gw = _gw(_cfg(), codex=primary)
    gw._schedule_client_drain(primary)
    drains = list(gw._aux_drains)
    await asyncio.sleep(0)
    primary.close.assert_not_awaited()
    release.set()
    assert await task == "old primary"
    await asyncio.gather(*drains)
    primary.close.assert_awaited_once()
    replacement.chat.assert_not_awaited()


async def test_cancelled_drain_never_closes_active_transport(monkeypatch):
    client = _client()
    monkeypatch.setattr(client, "close", AsyncMock())
    async with client.generation_lease():
        drain = asyncio.create_task(client.drain_and_close())
        await asyncio.sleep(0)
        drain.cancel()
        with pytest.raises(asyncio.CancelledError):
            await drain
        client.close.assert_not_awaited()
    await client.drain_and_close()
    client.close.assert_awaited_once()


async def test_codex_request_error_burst_preserves_real_breaker(monkeypatch):
    client = _client()
    session = FakeSession([FakeResp(400, body=b'{"error":{"message":"invalid"}}')
                           for _ in range(12)])
    monkeypatch.setattr(client, "_get_session", AsyncMock(return_value=session))
    for _ in range(12):
        with pytest.raises(LLMRequestError):
            await client.chat_with_tools([], "", [])
    assert session.calls == 12
    assert client.breaker._failure_count == 0


@pytest.mark.parametrize("provider", ["kimi", "ollama"])
async def test_real_adapter_request_errors_leave_guard_and_breaker_usable(provider, monkeypatch):
    client = KimiClient(api_key="synthetic") if provider == "kimi" else OllamaClient()
    responses = [SimpleNamespace(
        status=400, text=AsyncMock(return_value="invalid"), headers={},
    ) for _ in range(12)] + [SimpleNamespace(
        status=200, json=AsyncMock(return_value={
            "choices": [{"message": {"content": "valid"}}],
            "message": {"content": "valid"},
        }),
    )]

    def post(*args, **kwargs):
        context = AsyncMock()
        context.__aenter__.return_value = responses.pop(0)
        return context

    monkeypatch.setattr(client, "_get_session", AsyncMock(
        return_value=SimpleNamespace(post=post),
    ))
    guard = SubsystemGuard()
    guard.register(f"llm_{provider}")
    gw = _gw(_cfg(active=provider), **{provider: client}, guard=guard)
    for _ in range(12):
        with pytest.raises(LLMRequestError):
            await gw.call_with_tools(messages=[], system="", tools=[])
    assert client.breaker._failure_count == 0
    assert (await gw.call_with_tools(messages=[], system="", tools=[])).text == "valid"
    assert not responses
