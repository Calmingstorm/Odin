"""Shutdown bounds include live providers, auxiliary and retired generations."""

import asyncio
from contextlib import AsyncExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from src.discord.wiring import shutdown_services
from src.llm import client_lifecycle as lifecycle
from src.llm.auxiliary import AuxiliaryLLMClient
from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from tests.test_codex_reliability import _client
from tests.test_llm_gateway import _cfg, _gw


async def test_shutdown_forces_live_and_retired_leases_then_cleans_media(monkeypatch, caplog):
    # Five simultaneous held leases cost one real three-second drain budget,
    # not three seconds each, and all underlying clients are closed.
    codex, retired = _client(), _client()
    kimi, ollama = KimiClient("inert"), OllamaClient()
    cheap = SimpleNamespace(close=AsyncMock())
    aux = AuxiliaryLLMClient(cheap, codex)
    for client in (codex, retired, kimi, ollama):
        monkeypatch.setattr(client, "close", AsyncMock())
    gateway = _gw(_cfg(), codex=codex, kimi=kimi, ollama=ollama)
    gateway.auxiliary_llm_client = aux
    image, browser = SimpleNamespace(close=AsyncMock()), SimpleNamespace(shutdown=AsyncMock())
    sessions = SimpleNamespace(save_all=Mock())
    async with AsyncExitStack() as stack:
        for client in (codex, retired, kimi, ollama):
            await stack.enter_async_context(client.generation_lease())
        await stack.enter_async_context(aux._lease())
        gateway._schedule_client_drain(retired)
        drains = list(gateway._aux_drains)
        bot = SimpleNamespace(
            llm_gateway=gateway, sessions=sessions, browser_manager=browser,
            components=SimpleNamespace(media_tools=SimpleNamespace(
                image_selector=SimpleNamespace(openai=image),
            )),
        )
        start = asyncio.get_running_loop().time()
        await asyncio.wait_for(shutdown_services(bot), timeout=5)
        assert asyncio.get_running_loop().time() - start < 4.5
        for client in (codex, retired, kimi, ollama, cheap):
            client.close.assert_awaited_once()
        assert all(task.done() for task in drains)
        assert not gateway._draining_clients
        assert "abandoned 5 lease(s)" in caplog.text
        sessions.save_all.assert_called_once()
        image.close.assert_awaited_once()
        browser.shutdown.assert_awaited_once()


async def test_shutdown_idle_clients_drain_normally(monkeypatch, caplog):
    client = OllamaClient()
    monkeypatch.setattr(client, "close", AsyncMock())
    await lifecycle.shutdown_provider_clients(SimpleNamespace(ollama_client=client))
    client.close.assert_awaited_once()
    assert "deadline" not in caplog.text
    await lifecycle.shutdown_provider_clients(SimpleNamespace())


async def test_shutdown_close_failure_observed_without_blocking_cleanup(caplog):
    client = SimpleNamespace(drain_and_close=AsyncMock(side_effect=RuntimeError("inert")))
    await lifecycle.shutdown_provider_clients(SimpleNamespace(codex_client=client))
    assert "Provider shutdown task failed (RuntimeError)" in caplog.text


async def test_shutdown_bounds_stuck_close_and_unknown_reload_task(monkeypatch, caplog):
    monkeypatch.setattr(lifecycle, "SHUTDOWN_DRAIN_SECONDS", .02)
    monkeypatch.setattr(lifecycle, "SHUTDOWN_CLOSE_SECONDS", .02)
    release = asyncio.Event()

    async def stubborn():
        while not release.is_set():
            try:
                await release.wait()
            except asyncio.CancelledError:
                pass

    reload_task = asyncio.create_task(stubborn())
    close_tasks = []

    async def close():
        close_tasks.append(asyncio.current_task())
        await stubborn()

    client = SimpleNamespace(drain_and_close=AsyncMock(side_effect=stubborn), close=close)
    try:
        await asyncio.wait_for(lifecycle.shutdown_provider_clients(SimpleNamespace(
            codex_client=client, _aux_drains={reload_task},
        )), timeout=.5)
        assert "did not settle after force-close" in caplog.text
    finally:
        release.set()
        await reload_task
        await asyncio.gather(*close_tasks)
        await asyncio.sleep(0)
