"""Characterization: response delivery (_send_chunked / _send_with_retry).

Pins chunking behavior (code-fence continuity, long-line pre-splitting,
file fallback for very long responses), pending-file attachment, and the
send retry/backoff loop.
"""

from __future__ import annotations

import pytest

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
    async def test_retries_after_transient_failure(self, bot, monkeypatch):
        sleeps = []

        async def fake_sleep(secs):
            sleeps.append(secs)

        monkeypatch.setattr("asyncio.sleep", fake_sleep)
        msg = FakeMessage("q")
        msg.reply_error = ConnectionError("blip")  # first attempt fails
        sent = await bot.delivery.send_with_retry(msg, "eventually delivered")
        assert sent is not None
        assert msg.reply_texts == ["eventually delivered"]
        assert sleeps == [1]  # backoff is 1 + attempt

    async def test_gives_up_after_three_attempts_returns_none(self, bot, monkeypatch):
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
        assert sleeps == [1, 2]  # two backoffs between three attempts

    async def test_as_reply_false_uses_channel_send(self, bot):
        msg = FakeMessage("q")
        await bot.delivery.send_with_retry(msg, "broadcast", as_reply=False)
        assert msg.replies == []
        assert msg.channel.sent_texts == ["broadcast"]
