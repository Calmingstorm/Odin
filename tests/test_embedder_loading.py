"""Cold embedding load stays off-loop and single-flight, including cancellation."""
import asyncio
import sys
import threading
from types import SimpleNamespace

import pytest

from src.search.embedder import LocalEmbedder


@pytest.mark.asyncio
async def test_cold_load_single_flight_and_cancelled_waiter(monkeypatch):
    started = threading.Event()
    release = threading.Event()
    loads = []

    class Model:
        def __init__(self, name):
            loads.append(name)
            started.set()
            assert release.wait(3)

        def embed(self, texts):
            return [SimpleNamespace(tolist=lambda: [0.5] * 384) for _ in texts]

    monkeypatch.setitem(sys.modules, "fastembed", SimpleNamespace(TextEmbedding=Model))
    embedder = LocalEmbedder()
    first = asyncio.create_task(embedder.embed("first"))
    try:
        for _ in range(100):
            if started.is_set():
                break
            await asyncio.sleep(0.005)
        assert started.is_set()
        second = asyncio.create_task(embedder.embed("second"))
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        await asyncio.sleep(0.02)
        assert not second.done()
        assert len(loads) == 1
    finally:
        release.set()
    assert await second == [0.5] * 384
    assert await embedder.embed("warm") == [0.5] * 384
    assert loads == [LocalEmbedder.MODEL]


@pytest.mark.asyncio
async def test_failed_load_can_be_retried(monkeypatch):
    attempts = []

    class Model:
        def __init__(self, name):
            attempts.append(name)
            if len(attempts) == 1:
                raise RuntimeError("download failed")

        def embed(self, texts):
            return [SimpleNamespace(tolist=lambda: [1.0])]

    monkeypatch.setitem(sys.modules, "fastembed", SimpleNamespace(TextEmbedding=Model))
    embedder = LocalEmbedder()
    assert await embedder.embed("first") is None
    assert await embedder.embed("retry") == [1.0]
    assert len(attempts) == 2
