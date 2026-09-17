"""Real discord.py multipart cleanup must not poison later safe attempts."""

import asyncio
import io
from types import SimpleNamespace
from unittest.mock import AsyncMock

import aiohttp
import pytest
from discord.http import handle_message_parameters

import discord
from src.discord.delivery import ResponseDelivery


def connector_error():
    return aiohttp.ClientConnectorError(
        SimpleNamespace(host="discord.com", port=443, ssl=True),
        OSError(111, "Connection refused"),
    )


@pytest.mark.parametrize("as_reply", [True, False])
@pytest.mark.parametrize("kind", ["path", "borrowed", "buffer"])
@pytest.mark.parametrize(
    "outcome", ["first_success", "success", "exhausted", "deleted", "unknown", "cancelled"]
)
async def test_multipart_retry_streams(tmp_path, monkeypatch, as_reply, kind, outcome):
    path = tmp_path / "source.bin"
    payload = b"prefix:the exact attachment bytes"
    path.write_bytes(payload)
    stream = io.BytesIO(payload) if kind == "buffer" else open(path, "rb")
    if kind == "path":
        stream.close()
        original = discord.File(path, filename="proof.bin", spoiler=True, description="proof")
    else:
        original = discord.File(stream, filename="proof.bin", spoiler=True, description="proof")
    original.fp.seek(7)
    attempts, delivered, generated = [], [], []
    from src.discord import delivery as module

    prepare = module._prepare_owned_file_fallbacks

    def track(files):
        prepared = prepare(files)
        generated.extend(file for file, _ in prepared or [])
        return prepared

    monkeypatch.setattr(module, "_prepare_owned_file_fallbacks", track)
    monkeypatch.setattr(module.asyncio, "sleep", AsyncMock())

    async def send(text, *, files):
        attempts.append(files[0])
        # This is the actual context used by Messageable.send, not a mocked close.
        with handle_message_parameters(content=text, files=files) as params:
            assert params.files == files
            file = files[0]
            if len(attempts) > 1:
                # discord.py's internal HTTP retries must rewind to the saved
                # position too, not the duplicate descriptor's initial offset.
                file.reset(seek=True)
            assert file.fp.read() == payload[7:]
            assert file.filename == "SPOILER_proof.bin"
            assert file.description == "proof"
            # aiohttp closes its payload stream; discord.File must suppress it.
            file.fp.close()
            assert not file.fp.closed
            if len(attempts) == 1:
                # The pathname must not be reopened on retry.
                path.unlink()
                path.write_bytes(b"replacement is not the attachment")
            if outcome == "unknown":
                raise aiohttp.ClientOSError(104, "ambiguous delivery")
            if outcome == "cancelled":
                raise asyncio.CancelledError()
            if outcome != "first_success" and (len(attempts) < 3 or outcome == "exhausted"):
                raise connector_error()
            if outcome == "deleted" and as_reply and len(attempts) == 3:
                raise discord.HTTPException(
                    SimpleNamespace(status=400, reason="test"),
                    {"code": 10008, "message": "Unknown Message"},
                )
            delivered.append(text)
            return SimpleNamespace(id=123)

    message = SimpleNamespace(reply=send, channel=SimpleNamespace(send=send))
    delivery = ResponseDelivery(channel_state=None, change_presence=AsyncMock())
    try:
        if outcome == "cancelled":
            with pytest.raises(asyncio.CancelledError):
                await delivery.send_with_retry(message, "proof", as_reply, [original])
        else:
            sent = await delivery.send_with_retry(message, "proof", as_reply, [original])
            assert (sent is not None) == (outcome in {"first_success", "success", "deleted"})
        expected = 1 if outcome in {"first_success", "unknown", "cancelled"} else 3
        if outcome == "deleted" and as_reply:
            expected += 1
        assert len(attempts) == expected
        assert len({id(file) for file in attempts}) == expected
        assert len({id(file.fp) for file in attempts}) == expected
        assert delivered == (
            ["proof"] if outcome in {"first_success", "success", "deleted"} else []
        )
        assert all(file.fp.closed for file in generated)
        assert original.fp.closed == (kind == "path")
        if kind != "path":
            # File.close restores, but does not close, the caller-owned stream.
            original.fp.close()
            assert original.fp.closed
    finally:
        original.close()
        original.fp.close()


@pytest.mark.parametrize("as_reply", [True, False])
async def test_uncopyable_attachment_is_not_retried_or_dropped(monkeypatch, as_reply):
    class Uncopyable(io.BufferedIOBase):
        def readable(self):
            return True

        def seekable(self):
            return True

        def tell(self):
            return 0

    stream = Uncopyable()
    attachment = discord.File(stream, filename="unsafe.bin")
    calls = []

    async def send(text, *, files):
        calls.append(files)
        with handle_message_parameters(content=text, files=files):
            raise connector_error()

    monkeypatch.setattr("src.discord.delivery.asyncio.sleep", AsyncMock())
    message = SimpleNamespace(reply=send, channel=SimpleNamespace(send=send))
    delivery = ResponseDelivery(channel_state=None, change_presence=AsyncMock())
    try:
        assert await delivery.send_with_retry(message, "proof", as_reply, [attachment]) is None
        assert calls == [[attachment]]
        assert not stream.closed
    finally:
        attachment.close()
        stream.close()


async def test_cancellation_during_backoff_closes_all_reserved_streams(tmp_path, monkeypatch):
    from src.discord import delivery as module

    path = tmp_path / "source.bin"
    path.write_bytes(b"proof")
    attachment = discord.File(path)
    generated = []
    prepare = module._prepare_owned_file_fallbacks

    def track(files):
        prepared = prepare(files)
        generated.extend(file for file, _ in prepared or [])
        return prepared

    async def send(text, *, files):
        with handle_message_parameters(content=text, files=files):
            raise connector_error()

    monkeypatch.setattr(module, "_prepare_owned_file_fallbacks", track)
    monkeypatch.setattr(module.asyncio, "sleep", AsyncMock(side_effect=asyncio.CancelledError()))
    message = SimpleNamespace(reply=send, channel=SimpleNamespace(send=send))
    delivery = ResponseDelivery(channel_state=None, change_presence=AsyncMock())
    with pytest.raises(asyncio.CancelledError):
        await delivery.send_with_retry(message, "proof", files=[attachment])
    assert len(generated) == 3
    assert all(file.fp.closed for file in generated)
    assert attachment.fp.closed
