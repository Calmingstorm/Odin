"""Tests for web chat backend (src/web/chat.py).

Covers WebMessage, _WebChannel, _WebAuthor, _NoOpContextManager,
_WebSentMessage, and process_web_chat. Tests the virtual Discord
message layer without requiring the actual Discord library.
"""
from __future__ import annotations

import asyncio
import base64
import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.web.chat import (
    MAX_CHAT_CONTENT_LEN,
    WebMessage,
    _NoOpContextManager,
    _WebAuthor,
    _WebChannel,
    _WebSentMessage,
    process_web_chat,
)


# ---------------------------------------------------------------------------
# _NoOpContextManager
# ---------------------------------------------------------------------------

class TestNoOpContextManager:
    @pytest.mark.asyncio
    async def test_enter_exit(self):
        async with _NoOpContextManager() as ctx:
            assert ctx is not None

    @pytest.mark.asyncio
    async def test_multiple_uses(self):
        cm = _NoOpContextManager()
        async with cm:
            pass
        async with cm:
            pass


# ---------------------------------------------------------------------------
# _WebSentMessage
# ---------------------------------------------------------------------------

class TestWebSentMessage:
    @pytest.mark.asyncio
    async def test_edit_is_noop(self):
        msg = _WebSentMessage()
        await msg.edit(content="new")  # Should not raise


# ---------------------------------------------------------------------------
# _WebChannel
# ---------------------------------------------------------------------------

class TestWebChannel:
    def test_attributes(self):
        ch = _WebChannel("ch-123")
        assert ch.id == "ch-123"
        assert ch.name == "web-chat"
        assert ch.guild is None
        assert ch.captured_files == []

    def test_typing_returns_context_manager(self):
        ch = _WebChannel("ch1")
        ctx = ch.typing()
        assert isinstance(ctx, _NoOpContextManager)

    @pytest.mark.asyncio
    async def test_send_returns_sent_message(self):
        ch = _WebChannel("ch1")
        result = await ch.send("hello")
        assert isinstance(result, _WebSentMessage)

    @pytest.mark.asyncio
    async def test_send_captures_file(self):
        ch = _WebChannel("ch1")
        mock_file = MagicMock()
        mock_file.fp = io.BytesIO(b"PNG image data")
        mock_file.filename = "screenshot.png"
        await ch.send(file=mock_file)
        assert len(ch.captured_files) == 1
        assert ch.captured_files[0]["filename"] == "screenshot.png"
        assert ch.captured_files[0]["content_type"] == "image/png"
        assert ch.captured_files[0]["size"] == len(b"PNG image data")
        # Data should be base64-encoded
        decoded = base64.b64decode(ch.captured_files[0]["data"])
        assert decoded == b"PNG image data"

    @pytest.mark.asyncio
    async def test_send_captures_multiple_files(self):
        ch = _WebChannel("ch1")
        files = []
        for name in ["a.txt", "b.json"]:
            f = MagicMock()
            f.fp = io.BytesIO(b"data")
            f.filename = name
            files.append(f)
        await ch.send(files=files)
        assert len(ch.captured_files) == 2

    @pytest.mark.asyncio
    async def test_send_content_type_detection(self):
        types = {
            "img.png": "image/png",
            "photo.jpg": "image/jpeg",
            "photo.jpeg": "image/jpeg",
            "anim.gif": "image/gif",
            "pic.webp": "image/webp",
            "icon.svg": "image/svg+xml",
            "doc.pdf": "application/pdf",
            "log.txt": "text/plain",
            "data.json": "application/json",
            "binary.bin": "application/octet-stream",
        }
        for filename, expected_type in types.items():
            ch = _WebChannel("ch1")
            f = MagicMock()
            f.fp = io.BytesIO(b"x")
            f.filename = filename
            await ch.send(file=f)
            assert ch.captured_files[0]["content_type"] == expected_type, f"Failed for {filename}"

    @pytest.mark.asyncio
    async def test_send_empty_file(self):
        ch = _WebChannel("ch1")
        f = MagicMock()
        f.fp = io.BytesIO(b"")
        f.filename = "empty.txt"
        await ch.send(file=f)
        # Empty files are not captured
        assert len(ch.captured_files) == 0

    @pytest.mark.asyncio
    async def test_fetch_message_raises(self):
        ch = _WebChannel("ch1")
        with pytest.raises(Exception, match="Cannot fetch"):
            await ch.fetch_message(123)

    @pytest.mark.asyncio
    async def test_history_returns_empty(self):
        ch = _WebChannel("ch1")
        result = await ch.history()
        assert result == []


# ---------------------------------------------------------------------------
# _WebAuthor
# ---------------------------------------------------------------------------

class TestWebAuthor:
    def test_attributes(self):
        author = _WebAuthor("user-1", "Alice")
        assert author.id == "user-1"
        assert author.bot is False
        assert author.display_name == "Alice"
        assert author.name == "Alice"
        assert author.mention == "@Alice"

    def test_str(self):
        author = _WebAuthor("user-1", "Alice")
        assert str(author) == "Alice"


# ---------------------------------------------------------------------------
# WebMessage
# ---------------------------------------------------------------------------

class TestWebMessage:
    def test_basic_creation(self):
        msg = WebMessage("ch-1", "user-1", "TestUser", "hello")
        assert msg.content == "hello"
        assert msg.channel.id == "ch-1"
        assert msg.author.id == "user-1"
        assert msg.author.name == "TestUser"
        assert msg.webhook_id is None
        assert msg.attachments == []
        assert msg.guild is None

    def test_unique_ids(self):
        msg1 = WebMessage("ch", "u", "U")
        msg2 = WebMessage("ch", "u", "U")
        assert msg1.id != msg2.id

    def test_default_content(self):
        msg = WebMessage("ch", "u", "U")
        assert msg.content == ""

    def test_channel_is_webchannel(self):
        msg = WebMessage("ch-1", "u", "U")
        assert isinstance(msg.channel, _WebChannel)

    def test_author_is_webauthor(self):
        msg = WebMessage("ch-1", "u", "U")
        assert isinstance(msg.author, _WebAuthor)


# ---------------------------------------------------------------------------
# process_web_chat
# ---------------------------------------------------------------------------

class TestProcessWebChat:
    def _make_bot(self, *, has_codex=True, response="I'm Odin", tools=None, is_error=False):
        bot = MagicMock()
        bot.sessions = MagicMock()
        bot.sessions.add_message = MagicMock()
        bot.sessions.remove_last_message = MagicMock()
        bot.sessions.prune = MagicMock()
        bot.sessions.save = MagicMock()
        bot.sessions.get_task_history = AsyncMock(return_value=[])

        if has_codex:
            bot.codex_client = MagicMock()
        else:
            bot.codex_client = None

        bot._build_system_prompt = MagicMock(return_value="system prompt")
        bot._inject_tool_hints = AsyncMock(return_value="system prompt")
        bot._process_with_tools = AsyncMock(return_value=(
            response,
            False,  # already_sent
            is_error,
            tools or [],
            False,  # handoff
        ))
        return bot

    @pytest.mark.asyncio
    async def test_no_codex_client(self):
        bot = self._make_bot(has_codex=False)
        result = await process_web_chat(bot, "hello", "ch-1")
        assert result["is_error"] is True
        assert "No LLM backend" in result["response"]
        bot.sessions.remove_last_message.assert_called_once()

    @pytest.mark.asyncio
    async def test_successful_chat(self):
        bot = self._make_bot(response="Hello from Odin", tools=["run_command"])
        result = await process_web_chat(bot, "hello", "ch-1", user_id="u1", username="Alice")
        assert result["is_error"] is False
        assert result["response"] == "Hello from Odin"
        assert result["tools_used"] == ["run_command"]

    @pytest.mark.asyncio
    async def test_chat_no_tools_no_save(self):
        bot = self._make_bot(response="Just chat", tools=[])
        bot._process_with_tools = AsyncMock(return_value=(
            "Just chat", False, False, [], False,
        ))
        result = await process_web_chat(bot, "hello", "ch-1")
        assert result["is_error"] is False
        # Session should still be pruned
        bot.sessions.prune.assert_called_once()

    @pytest.mark.asyncio
    async def test_error_response(self):
        bot = self._make_bot(response="Error occurred", tools=["run_command"], is_error=True)
        result = await process_web_chat(bot, "hello", "ch-1")
        assert result["is_error"] is True

    @pytest.mark.asyncio
    async def test_exception_handling(self):
        bot = self._make_bot()
        bot._process_with_tools = AsyncMock(side_effect=RuntimeError("boom"))
        result = await process_web_chat(bot, "hello", "ch-1")
        assert result["is_error"] is True
        assert "Error processing" in result["response"]
        bot.sessions.remove_last_message.assert_called_once()

    @pytest.mark.asyncio
    async def test_files_returned(self):
        bot = self._make_bot(tools=["generate_image"])
        result = await process_web_chat(bot, "make image", "ch-1")
        assert "files" in result
        assert isinstance(result["files"], list)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_max_chat_content_len(self):
        assert MAX_CHAT_CONTENT_LEN == 4000
