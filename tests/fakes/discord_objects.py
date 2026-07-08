"""Fake discord.py objects satisfying the duck-type contract client.py uses.

Promoted from the pattern in tests/test_web_chat.py (WebMessage/WebChannel/
WebAuthor) per RFC-001 Phase 0. These are plain recording classes — no
MagicMock — so a typo'd attribute access fails loudly instead of returning
a new mock.

The contract they satisfy is the informal ``MessageLike`` shape documented
in RFC-001 §6.3: what discord.Message, _LoopMessageProxy,
and the web-chat proxies all provide.
"""

from __future__ import annotations

import itertools

_id_counter = itertools.count(500_000)


class FakeAuthor:
    def __init__(
        self,
        id: int = 12345,
        name: str = "tester",
        *,
        bot: bool = False,
        display_name: str | None = None,
    ) -> None:
        self.id = id
        self.name = name
        self.bot = bot
        self.display_name = display_name or name
        # discord.Member-ish extras some paths getattr() for:
        self.mention = f"<@{id}>"
        self.voice = None

    def __str__(self) -> str:
        return self.name


class FakeSentMessage:
    """What FakeChannel.send / FakeMessage.reply return."""

    def __init__(self, content=None, files=None) -> None:
        self.id = next(_id_counter)
        self.content = content
        self.files = files
        self.edits: list = []

    async def edit(self, *, content=None, **kwargs):
        self.edits.append(content)
        self.content = content
        return self


class _TypingContext:
    def __init__(self, channel: FakeChannel) -> None:
        self._channel = channel

    async def __aenter__(self):
        self._channel.typing_entered += 1
        return self

    async def __aexit__(self, *exc):
        self._channel.typing_exited += 1
        return False


class FakeChannel:
    """Records send() calls; supports typing() as an async context manager."""

    def __init__(self, id: int = 99, name: str = "test-channel", guild=None) -> None:
        self.id = id
        self.name = name
        self.guild = guild
        self.sent: list[dict] = []  # {"content": str|None, "files": list|None}
        self.typing_entered = 0
        self.typing_exited = 0
        self.purged_limits: list[int] = []
        self.send_error: BaseException | None = None  # set to make send() raise once

    async def send(self, content=None, *, files=None, file=None, **kwargs):
        if self.send_error is not None:
            err, self.send_error = self.send_error, None
            raise err
        all_files = list(files) if files else ([file] if file else None)
        entry = {"content": content, "files": all_files, **({k: v for k, v in kwargs.items() if v})}
        self.sent.append(entry)
        return FakeSentMessage(content, all_files)

    def typing(self) -> _TypingContext:
        return _TypingContext(self)

    async def purge(self, limit: int = 100):
        self.purged_limits.append(limit)
        return [object()] * min(limit, 3)

    # -- helpers -----------------------------------------------------------

    @property
    def sent_texts(self) -> list[str]:
        return [e["content"] for e in self.sent if e["content"]]


class FakeThread(FakeChannel):
    """A thread channel with a parent — client.py checks isinstance(discord.Thread).

    NOTE: client.py's thread checks use ``isinstance(message.channel,
    discord.Thread)``, which a fake can't satisfy without subclassing the
    real class. Tests that need the *thread* code path must patch or use a
    real discord.Thread stand-in; tests that only need "a channel with a
    .parent" can use this. See test_pipeline_persistence for the pattern.
    """

    def __init__(
        self, id: int = 199, name: str = "test-thread", parent: FakeChannel | None = None
    ) -> None:
        super().__init__(id=id, name=name)
        self.parent = parent or FakeChannel(id=99, name="parent-channel")


class FakeAttachment:
    def __init__(
        self, filename: str = "notes.txt", data: bytes = b"hello", content_type: str = "text/plain"
    ) -> None:
        self.filename = filename
        self.content_type = content_type
        self.size = len(data)
        self._data = data
        self.url = f"https://fake.attachments/{filename}"

    async def read(self) -> bytes:
        return self._data


class FakeMessage:
    """A message-shaped object accepted by the pipeline and tool loop."""

    def __init__(
        self,
        content: str = "",
        *,
        author: FakeAuthor | None = None,
        channel: FakeChannel | None = None,
        id: int | None = None,
        attachments: list | None = None,
        webhook_id: int | None = None,
        guild=None,
    ) -> None:
        self.content = content
        self.author = author or FakeAuthor()
        self.channel = channel or FakeChannel()
        self.id = id if id is not None else next(_id_counter)
        self.attachments = list(attachments or [])
        self.webhook_id = webhook_id
        self.guild = guild
        self.replies: list[dict] = []
        self.deleted = False
        self.reply_error: BaseException | None = None  # set to make reply() raise once

    async def reply(self, content=None, *, files=None, **kwargs):
        if self.reply_error is not None:
            err, self.reply_error = self.reply_error, None
            raise err
        entry = {"content": content, "files": list(files) if files else None}
        self.replies.append(entry)
        return FakeSentMessage(content, entry["files"])

    async def delete(self) -> None:
        self.deleted = True

    # -- helpers -----------------------------------------------------------

    @property
    def reply_texts(self) -> list[str]:
        return [r["content"] for r in self.replies if r["content"]]

    def all_delivered_texts(self) -> list[str]:
        """Replies + channel sends, in rough delivery order."""
        return self.reply_texts + self.channel.sent_texts
