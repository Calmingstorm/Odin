"""Characterization: response delivery (_send_chunked / _send_with_retry).

Pins chunking behavior (code-fence continuity, long-line pre-splitting,
file fallback for very long responses), pending-file attachment, and the
send retry/backoff loop.
"""

from __future__ import annotations

import io

import pytest

import discord
from src.discord.delivery import DISCORD_MAX_LEN
from tests.fakes import FakeLLM, FakeMessage, make_bot


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def bot():
    return make_bot(fake_llm=FakeLLM([]))


class TestSendChunked:
    async def test_short_text_single_reply(self, bot):
        msg = FakeMessage("q")
        await bot.delivery.send_chunked(msg, "short answer")
        assert msg.reply_texts == ["short answer"]
        assert msg.channel.sent == []

    async def test_chunked_first_is_reply_rest_are_sends(self, bot):
        msg = FakeMessage("q")
        text = "\n".join(f"line {i} " + "x" * 40 for i in range(90))  # ~4.3K chars
        await bot.delivery.send_chunked(msg, text)
        assert len(msg.replies) == 1  # first chunk replies to the message
        assert len(msg.channel.sent) >= 1  # later chunks are plain sends
        rejoined = "\n".join(t.rstrip("\n") for t in msg.all_delivered_texts())
        assert "line 0" in rejoined and "line 89" in rejoined
        for t in msg.all_delivered_texts():
            assert len(t) <= DISCORD_MAX_LEN

    async def test_empty_text_with_no_files_sends_nothing(self, bot):
        """A deliberately-silent turn delivers silence. Discord rejects empty
        content, and the old path would have thrown that 400 after retries —
        or worse, upstream fabricated an apology to have something to send."""
        msg = FakeMessage("q")
        await bot.delivery.send_chunked(msg, "")
        # Raw lists, not reply_texts — that property filters falsy content,
        # which is exactly how an empty send would hide from the assertion.
        assert msg.replies == []
        assert msg.channel.sent == []

    async def test_empty_text_with_pending_files_still_delivers_the_files(self, bot):
        """An attachment with no commentary is a complete reply — the video
        case: the file went out, and there was nothing more to say."""
        msg = FakeMessage("q")
        bot.channel_state.pending_files[str(msg.channel.id)] = [(b"vid", "clip.mp4")]
        await bot.delivery.send_chunked(msg, "")
        assert len(msg.replies) == 1
        assert msg.replies[0]["files"]
        assert str(msg.channel.id) not in bot.channel_state.pending_files

    async def test_code_fence_reopened_across_chunks(self, bot):
        msg = FakeMessage("q")
        body = "\n".join("x = 1  # padding padding padding" for _ in range(90))
        text = f"```python\n{body}\n```"
        await bot.delivery.send_chunked(msg, text)
        chunks = msg.all_delivered_texts()
        assert len(chunks) >= 2
        # Every chunk that opens a block closes it, and continuation chunks
        # re-open with the original language.
        assert chunks[0].startswith("```python")
        assert chunks[0].rstrip().endswith("```")
        assert chunks[1].startswith("```python\n")

    async def test_single_overlong_line_is_presplit(self, bot):
        msg = FakeMessage("q")
        text = "y" * 5000  # one line, no newlines, still under the 4x file threshold
        await bot.delivery.send_chunked(msg, text)
        chunks = msg.all_delivered_texts()
        assert len(chunks) >= 3
        for t in chunks:
            assert len(t) <= DISCORD_MAX_LEN
        assert sum(len(t.replace("\n", "")) for t in chunks) == 5000

    async def test_very_long_response_becomes_file(self, bot):
        msg = FakeMessage("q")
        await bot.delivery.send_chunked(msg, "z" * (DISCORD_MAX_LEN * 4 + 1))
        assert len(msg.replies) == 1
        entry = msg.replies[0]
        assert entry["content"] == "Response too long for chat, attached as file:"
        assert entry["files"] is not None
        assert entry["files"][0].filename == "response.md"

    async def test_pending_files_attach_to_first_message_and_are_popped(self, bot):
        msg = FakeMessage("q")
        bot.channel_state.pending_files[str(msg.channel.id)] = [(b"data", "report.txt")]
        await bot.delivery.send_chunked(msg, "here is your file")
        entry = msg.replies[0]
        assert entry["content"] == "here is your file"
        assert [f.filename for f in entry["files"]] == ["report.txt"]
        assert str(msg.channel.id) not in bot.channel_state.pending_files

    async def test_pending_files_ride_along_with_file_fallback(self, bot):
        msg = FakeMessage("q")
        bot.channel_state.pending_files[str(msg.channel.id)] = [(b"data", "extra.bin")]
        await bot.delivery.send_chunked(msg, "z" * (DISCORD_MAX_LEN * 4 + 1))
        names = [f.filename for f in msg.replies[0]["files"]]
        assert names == ["extra.bin", "response.md"]


class TestSendWithRetry:
    @staticmethod
    def _http_error(*, code: int, status: int = 400, errors=None):
        import discord

        response = type("Response", (), {"status": status, "reason": "test", "headers": {}})()
        return discord.HTTPException(response, {"code": code, "message": "test", "errors": errors})

    async def test_does_not_retry_uncertain_transport_failure(self, bot, monkeypatch):
        sleeps = []

        async def fake_sleep(secs):
            sleeps.append(secs)

        monkeypatch.setattr("asyncio.sleep", fake_sleep)
        msg = FakeMessage("q")
        msg.reply_error = ConnectionError("blip")  # first attempt fails
        sent = await bot.delivery.send_with_retry(msg, "eventually delivered")
        assert sent is None
        assert msg.reply_texts == []
        assert sleeps == []

    async def test_uncertain_transport_failure_returns_none_without_retries(self, bot, monkeypatch):
        sleeps = []

        async def fake_sleep(secs):
            sleeps.append(secs)

        monkeypatch.setattr("asyncio.sleep", fake_sleep)
        msg = FakeMessage("q")

        async def always_fail(*a, **k):
            raise ConnectionError("still down")

        msg.reply = always_fail
        sent = await bot.delivery.send_with_retry(msg, "never arrives")
        assert sent is None
        assert sleeps == []

    async def test_as_reply_false_uses_channel_send(self, bot):
        msg = FakeMessage("q")
        await bot.delivery.send_with_retry(msg, "broadcast", as_reply=False)
        assert msg.replies == []
        assert msg.channel.sent_texts == ["broadcast"]

    async def test_confirmed_deleted_reply_reference_falls_back_once_to_plain_send(self, bot):
        msg = FakeMessage("q")
        msg.reply_error = self._http_error(code=10008)

        sent = await bot.delivery.send_with_retry(msg, "still delivered")

        assert sent is not None
        assert msg.replies == []
        assert msg.channel.sent_texts == ["still delivered"]

    async def test_structured_invalid_reference_falls_back_to_plain_send(self, bot):
        msg = FakeMessage("q")
        msg.reply_error = self._http_error(
            code=50035,
            errors={
                "message_reference": {"message_id": {"_errors": [{"code": "UNKNOWN_MESSAGE"}]}}
            },
        )

        sent = await bot.delivery.send_with_retry(msg, "still delivered")

        assert sent is not None
        assert msg.replies == []
        assert msg.channel.sent_texts == ["still delivered"]

    @pytest.mark.parametrize("attachment_kind", ["path", "buffer"])
    async def test_invalid_reply_fallback_preserves_attachment_after_parameter_cleanup(
        self, bot, tmp_path, attachment_kind, monkeypatch
    ):
        """discord.py closes request parameters even when Discord rejects them."""
        payload = b"the exact attachment bytes"
        if attachment_kind == "path":
            path = tmp_path / "report.txt"
            path.write_bytes(payload)
            file = discord.File(path, filename="report.txt", spoiler=True, description="report")
        else:
            file = discord.File(
                io.BytesIO(payload), filename="report.txt", spoiler=True, description="report"
            )

        msg = FakeMessage("q")
        fallback_payloads: list[bytes] = []

        async def rejected_reply(*_args, **kwargs):
            # This mirrors MultipartParameters.__exit__ calling File.close().
            for sent_file in kwargs["files"]:
                sent_file.close()
            raise self._http_error(code=10008)

        original_send = msg.channel.send

        async def capture_fallback(*args, **kwargs):
            fallback_payloads.extend(sent_file.fp.read() for sent_file in kwargs["files"])
            return await original_send(*args, **kwargs)

        monkeypatch.setattr(msg, "reply", rejected_reply)
        monkeypatch.setattr(msg.channel, "send", capture_fallback)
        sent = await bot.delivery.send_with_retry(msg, "still delivered", files=[file])

        assert sent is not None
        assert msg.channel.sent_texts == ["still delivered"]
        fallback = msg.channel.sent[0]["files"]
        assert len(fallback) == 1
        assert fallback_payloads == [payload]
        assert fallback[0].fp.closed
        assert fallback[0].filename == "SPOILER_report.txt"
        assert fallback[0].description == "report"

    async def test_invalid_reply_fallback_rewinds_owned_file_after_request_consumes_it(
        self, bot, tmp_path, monkeypatch
    ):
        """The fallback must not inherit the first multipart request's EOF."""
        payload = b"the attachment survives Discord's cleanup"
        path = tmp_path / "report.txt"
        path.write_bytes(payload)
        file = discord.File(path, filename="report.txt")
        msg = FakeMessage("q")
        captured: list[bytes] = []

        async def rejected_reply(*_args, **kwargs):
            for sent_file in kwargs["files"]:
                assert sent_file.fp.read() == payload
                sent_file.close()
            raise self._http_error(code=10008)

        async def rejected_fallback(*_args, **kwargs):
            for sent_file in kwargs["files"]:
                captured.append(sent_file.fp.read())
                sent_file.close()
            raise self._http_error(code=50013, status=403)

        monkeypatch.setattr(msg, "reply", rejected_reply)
        monkeypatch.setattr(msg.channel, "send", rejected_fallback)

        sent = await bot.delivery.send_with_retry(msg, "still delivered", files=[file])

        assert sent is None
        assert captured == [payload]

    async def test_other_invalid_form_body_never_uses_plain_send_fallback(self, bot, monkeypatch):
        async def no_sleep(_seconds):
            return None

        monkeypatch.setattr("asyncio.sleep", no_sleep)
        msg = FakeMessage("q")
        msg.reply_error = self._http_error(
            code=50035,
            errors={"content": {"_errors": [{"code": "BASE_TYPE_BAD_LENGTH"}]}},
        )

        await bot.delivery.send_with_retry(msg, "must not broadcast")

        assert msg.channel.sent_texts == []

    async def test_other_http_failure_never_uses_plain_send_fallback(self, bot, monkeypatch):
        async def no_sleep(_seconds):
            return None

        monkeypatch.setattr("asyncio.sleep", no_sleep)
        msg = FakeMessage("q")
        msg.reply_error = self._http_error(code=50013, status=403)

        await bot.delivery.send_with_retry(msg, "must not broadcast")

        assert msg.channel.sent_texts == []

    async def test_transport_failure_is_not_retried_or_fallen_back(self, bot):
        msg = FakeMessage("q")
        msg.reply_error = ConnectionError("outcome uncertain")

        sent = await bot.delivery.send_with_retry(msg, "must not duplicate")

        assert sent is None
        assert msg.replies == []
        assert msg.channel.sent_texts == []
