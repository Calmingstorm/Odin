"""Web chat processing — virtual message and shared chat logic.

Provides a WebMessage class that mimics discord.Message with no-op Discord
operations, and a process_web_chat() function that runs a message through the
same Codex tool loop used by Discord messages.
"""
from __future__ import annotations

import asyncio
import itertools
import re
import secrets
import time
import weakref
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from ..llm.cache_session import bind_session, channel_session_id
from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger

if TYPE_CHECKING:
    from ..discord.client import OdinBot

log = get_logger("web.chat")

# Per-channel serialization for persistent web-chat channels — WEB-OWNED
# state (RFC-002 P6: previously parked on the bot as _web_channel_locks).
# One bot per process, so module scope ≡ the old bot scope.
WEB_CHANNEL_LOCKS: dict[str, asyncio.Lock] = {}

# Atomic monotonic counter for virtual message IDs (thread-safe via C impl)
_msg_id_counter = itertools.count(int(time.time() * 1000))


@dataclass(frozen=True)
class WebTurn:
    """A running web chat turn, as its page and the control routes know it.

    ``request_id`` is the turn's active request in the channel state once its
    tool loop starts; before that the turn is still being prepared.
    """

    channel_id: str
    question_id: str
    request_id: str
    owner_id: str
    authority: tuple


# Each persistent web channel's running turn: one at a time, by its lock.
_WEB_TURNS: dict[str, WebTurn] = {}


def web_turn(channel_id: str) -> WebTurn | None:
    """The web chat turn running in this channel, if any."""
    return _WEB_TURNS.get(channel_id)


def push_to_owner(bot: OdinBot, owner_id: str, payload: dict) -> None:
    """Push one message to the owner's open WebUI pages, never waiting."""
    health = getattr(bot, "health_server", None)
    publish = getattr(health, "publish_owner_message", None)
    if callable(publish):
        publish(owner_id, payload)

# Max content length for a single chat message
MAX_CHAT_CONTENT_LEN = 32000

# A web chat message's stored identity (Session message_id). A caller may name
# its question so a page can match its live copy with the stored one; replies
# get one here. Never WebMessage.id: that is search_history's exclusion key.
_MESSAGE_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")
INVALID_MESSAGE_ID = "invalid message_id (expected 1-64 chars of [A-Za-z0-9_-])"


def valid_message_id(value) -> bool:
    """A caller-supplied message_id: the whole string, 1-64 safe characters."""
    return isinstance(value, str) and _MESSAGE_ID_RE.fullmatch(value) is not None


class ChatMessageIdError(ValueError):
    """The caller's message_id already names a message in this chat."""


def _store_web_message(bot, channel_id: str, role: str, content: str,
                       message_id: str | None = None, **kwargs) -> str:
    """Store a web chat message under an id unique in its chat; return the id."""
    if message_id is not None:
        if not bot.sessions.add_unique_message(
                channel_id, role, content, message_id=message_id, **kwargs):
            raise ChatMessageIdError("message_id is already used in this chat")
        return message_id
    while True:
        candidate = "w" + secrets.token_hex(8)
        if bot.sessions.add_unique_message(
                channel_id, role, content, message_id=candidate, **kwargs):
            return candidate


class _NoOpContextManager:
    """Async context manager that does nothing (replaces channel.typing)."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


class _WebSentMessage:
    """A web-visible sent message whose edits replace its captured content."""

    def __init__(self, channel: _WebChannel, index: int | None) -> None:
        self._channel = channel
        self._index = index

    async def edit(self, **kwargs):
        if self._index is not None and "content" in kwargs:
            self._channel.captured_messages[self._index] = kwargs["content"] or ""
        return self


class WebChannelSendError(RuntimeError):
    """A virtual attachment could not be represented to the web caller."""


class _WebChannel:
    """Minimal channel-like object for web messages.

    Captures files posted via send(file=...) so they can be returned
    to the web client as base64 data.
    """

    # A web or API chat has no Discord history: read_channel reads this
    # chat's stored session instead (a loop or agent started here inherits
    # the channel, so it reads the same one).
    reads_stored_session = True

    def __init__(self, channel_id: str, owner_id: str | None = None, *, ephemeral: bool = False):
        self.id = channel_id
        self.name = "web-chat"
        self.guild = None
        # The identity whose chat this is; its open WebUI pages get later posts.
        self.owner_id = owner_id
        # A stateless /api/execute request: nothing it starts may store a chat.
        self.ephemeral = ephemeral
        self.captured_files: list[dict] = []
        # Keep message identity so streamed/progress updates replace rather
        # than duplicate their initial text, just as Discord edits do.
        self.captured_messages: list[str] = []
        self._post_sink: Callable[[str], None] | None = None
        # Where this chat's later posts go, named by the turn that owns it.
        self._later_post_sink: Callable[[str], None] | None = None
        # For a later-posts view: the turn's own channel (see later_posts).
        self._turn_channel: _WebChannel | None = None

    def bind_later_posts(self, sink: Callable[[str], None]) -> None:
        """Name where this chat's later posts go, before any work outlives the turn."""
        self._later_post_sink = sink

    def later_posts(self) -> _WebChannel:
        """This chat's channel for work that outlives the turn (a loop, a background task).

        Its text is a later post from the start, even while the starting turn
        still runs: a loop's first iteration runs at once, and its post used
        to land in the turn's own output and be lost. Files sent while that
        turn still runs go with its reply, as before. A view's own view is
        itself, so work started by that work (a loop's delegate_task) stays
        bound to the originating turn.
        """
        if self._turn_channel is not None:
            return self
        sink = self._post_sink or self._later_post_sink
        if sink is None:
            return self
        view = _WebChannel(self.id, owner_id=self.owner_id, ephemeral=self.ephemeral)
        view._post_sink = view._later_post_sink = sink
        view._turn_channel = self
        return view

    def detach(self, sink: Callable[[str], None]) -> None:
        """Route sends made after the starting turn returned.

        A loop or background task started in this chat keeps this channel.
        Its later posts used to land in this turn's capture list, which
        nothing reads once the turn has answered. They now go to *sink*: the
        chat's stored posts and its open WebUI pages.
        """
        self._post_sink = sink

    def can_deliver_files(self) -> bool:
        """Whether a file sent now reaches this chat, not only its name.

        Once a turn has answered, its detached channel (and a later-posts view
        of it) can only name a file in a later post. A view whose starting turn
        still runs delivers files with that turn's reply.
        """
        if self._post_sink is None:
            return True
        turn = self._turn_channel
        return turn is not None and turn._post_sink is None

    async def send_retained_file(self, content, file) -> bool:
        """Send *file* with *content* only while this chat can receive files.

        Used by post_file's retained-file source: a names-only later post is
        not a delivery, so nothing at all is sent when files can no longer
        reach the chat. The check and send()'s capture run with no await in
        between (send() does not suspend), so a turn that answers meanwhile
        cannot turn the file into a names-only post. Returns whether the file
        was captured into the reply's files.
        """
        target = self if self._post_sink is None else self._turn_channel
        if target is None or not self.can_deliver_files():
            return False
        before = len(target.captured_files)
        await self.send(content=content, file=file)
        return len(target.captured_files) > before

    def typing(self):
        return _NoOpContextManager()

    async def send(self, content=None, **kwargs) -> _WebSentMessage:
        import base64
        pending_files = []
        files = ([kwargs["file"]] if kwargs.get("file") is not None else [])
        files.extend(kwargs.get("files") or [])
        # Admit every attachment before recording the message. A failed
        # capture must be visible to the tool as a failed send, never as an
        # invented successful web delivery.
        for file in files:
            try:
                fp = file.fp
                filename = getattr(file, "filename", "file")
                if hasattr(fp, "seek"):
                    fp.seek(0)
                data = fp.read(25 * 1024 * 1024 + 1)
                if not isinstance(data, bytes):
                    raise TypeError("attachment stream did not return bytes")
                if len(data) > 25 * 1024 * 1024:
                    raise ValueError("attachment exceeds 25MB web limit")
                ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
                content_type = {
                        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                        "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml",
                        "pdf": "application/pdf", "txt": "text/plain", "json": "application/json",
                        "mp4": "video/mp4", "webm": "video/webm", "mp3": "audio/mpeg",
                        "wav": "audio/wav", "ogg": "audio/ogg", "zip": "application/zip",
                        "tar": "application/x-tar", "gz": "application/gzip",
                        "csv": "text/csv", "xml": "application/xml", "yaml": "application/yaml",
                        "yml": "application/yaml", "md": "text/markdown",
                }.get(ext, "application/octet-stream")
                pending_files.append({
                    "filename": filename,
                    "content_type": content_type,
                    "data": base64.b64encode(data).decode("ascii"),
                    "size": len(data),
                })
            except Exception as e:
                log.warning("Failed to capture web chat file: %s", e)
                raise WebChannelSendError(f"Failed to capture web attachment: {e}") from e

        if self._post_sink is not None:
            turn = self._turn_channel
            if pending_files and turn is not None and turn._post_sink is None:
                # The starting turn still runs: its reply carries the files.
                turn.captured_files.extend(pending_files)
                pending_files = []
            text = "" if content is None else str(content)
            for file in pending_files:
                # Later posts are text: an attachment is named, not delivered.
                text += f"\n[attachment not delivered to this chat: {file['filename']}]"
            if text.strip():
                self._post_sink(text.strip())
            return _WebSentMessage(self, None)
        self.captured_files.extend(pending_files)
        index = None
        if content is not None:
            index = len(self.captured_messages)
            self.captured_messages.append(str(content))
        return _WebSentMessage(self, index)

    async def fetch_message(self, message_id: int):
        raise Exception("Cannot fetch messages in web chat")

    async def history(self, **kwargs):
        return []


class _WebAuthor:
    """Minimal author-like object for web messages."""

    def __init__(self, user_id: str, username: str):
        self.id = user_id
        self.bot = False
        self.display_name = username
        self.name = username
        self.mention = f"@{username}"

    def __str__(self):
        return self.display_name


class WebMessage:
    """Virtual Discord-like message for web chat.

    Provides the minimum interface that _process_with_tools expects
    from a discord.Message object.
    """

    _odin_source = "web"  # trajectory source marker (was recorded as "discord")
    _computer_web_session_id: str | None = None
    _computer_web_authorized: Callable[[], bool] | None = None

    def __init__(self, channel_id: str, user_id: str, username: str, content: str = "",
                 allowed_tools: list[str] | None = None,
                 steer_authority: tuple | None = None,
                 ephemeral: bool = False):
        self.id = next(_msg_id_counter)
        self.content = content
        self.channel = _WebChannel(channel_id, owner_id=user_id, ephemeral=ephemeral)
        self.author = _WebAuthor(user_id, username)
        self.webhook_id = None
        self.attachments: list = []
        self.guild = None
        self.allowed_tools = allowed_tools
        # Read by the tool loop into the turn's steering inbox.
        self._odin_steer_authority = steer_authority


def steer_authority(
    tier: str | None,
    allowed_tools: list[str] | None,
    token_allowed_hosts: list[str] | None,
    token_default_host: str,
) -> tuple:
    """The credential policy a web turn runs with, as ``process_web_chat`` applies it.

    A non-admin caller may steer a running turn only by presenting the same
    policy, so a narrower credential that shares a user ID cannot drive a
    broader turn.
    """
    return (
        tier,
        None if allowed_tools is None else tuple(allowed_tools),
        None if token_allowed_hosts is None else tuple(token_allowed_hosts),
        token_default_host or "",
    )


# Re-use the same scrubbing function applied to Discord responses.
# It lives in client.py as a module-level function but depends only on
# scrub_output_secrets plus a few compiled regexes.  To avoid importing
# the entire client module (which pulls in discord.py), we apply
# scrub_output_secrets here — the extra natural-language patterns are a
# nice-to-have but not critical for the web endpoint.
_scrub = scrub_output_secrets


async def process_web_chat(
    bot: OdinBot,
    content: str,
    channel_id: str,
    user_id: str = "web-user",
    username: str = "WebUser",
    allowed_tools: list[str] | None = None,
    tier: str | None = None,
    token_allowed_hosts: list[str] | None = None,
    token_default_host: str = "",
    persist_channel_lock: bool = True,
    computer_binding=None,
    ephemeral: bool = False,
    message_id: str | None = None,
) -> dict:
    """Process a web chat message through the Codex tool loop.

    persist_channel_lock: when True (default), concurrent calls sharing this
        channel_id are serialized via a per-channel asyncio.Lock cached in
        this module's WEB_CHANNEL_LOCKS (web-owned state — RFC-002 P6 moved
        it off the bot; one app per bot per process makes the scopes
        equivalent). Used by /api/chat and the WebSocket chat, where
        channel_id == user_id and a user's overlapping requests must run one
        at a time. Set False for single-use/ephemeral channels — e.g.
        /api/execute's per-request UUID channels — which no other caller can
        share: caching a lock there is pointless and leaks one permanent dict
        entry per request, since the channel is reset and never reused.
    ephemeral: True for /api/execute's stateless requests. Whatever such a
        request starts (a loop, a background task) can never store a chat:
        its later posts are dropped, as the request's history is.
    message_id: the caller's id for its question (valid_message_id). One
        already stored in this chat raises ChatMessageIdError before anything
        runs. Without one, the question gets a new id.

    Returns dict with:
      - response: str — the LLM response text
      - tools_used: list[str] — tool names called during processing
      - is_error: bool — whether an error occurred
      - question_id / reply_id: str — the stored ids of the question and of
        the reply (or its stored error marker); each only while it is stored
    """
    from ..permissions.host_access import HostAccessManager
    from ..permissions.manager import PermissionManager

    authority = steer_authority(tier, allowed_tools, token_allowed_hosts, token_default_host)
    tier_token = PermissionManager.set_request_tier(tier) if tier else None
    host_token = (HostAccessManager.set_request_host_scope(token_allowed_hosts)
        if token_allowed_hosts is not None else None)
    default_host_token = (HostAccessManager.set_request_default_host(token_default_host)
        if token_default_host else None)

    try:
        # One cache conversation per channel session, around history
        # compaction as well as the tool loop.
        if persist_channel_lock:
            lock = WEB_CHANNEL_LOCKS.setdefault(channel_id, asyncio.Lock())
            async with lock:
                with bind_session(channel_session_id(channel_id)):
                    return await _do_process_web_chat(
                        bot,
                        content,
                        channel_id,
                        user_id,
                        username,
                        allowed_tools,
                        computer_binding,
                        authority,
                        ephemeral,
                        message_id,
                    )
        else:
            with bind_session(channel_session_id(channel_id)):
                return await _do_process_web_chat(
                    bot,
                    content,
                    channel_id,
                    user_id,
                    username,
                    allowed_tools,
                    computer_binding,
                    authority,
                    ephemeral,
                    message_id,
                )
    finally:
        if tier_token is not None:
            PermissionManager.reset_request_tier(tier_token)
        if host_token is not None:
            HostAccessManager.reset_request_host_scope(host_token)
        if default_host_token is not None:
            HostAccessManager.reset_request_default_host(default_host_token)


async def _do_process_web_chat(
    bot: OdinBot,
    content: str,
    channel_id: str,
    user_id: str,
    username: str,
    allowed_tools: list[str] | None,
    computer_binding=None,
    authority: tuple | None = None,
    ephemeral: bool = False,
    message_id: str | None = None,
) -> dict:
    msg = WebMessage(channel_id=channel_id, user_id=user_id, username=username, content=content,
                     allowed_tools=allowed_tools, steer_authority=authority,
                     ephemeral=ephemeral)
    if computer_binding is not None:
        msg._computer_web_session_id, msg._computer_web_authorized = computer_binding
    web_channel = msg.channel  # type: _WebChannel
    # Where whatever this turn starts posts (a stateless request has no chat).
    later_posts = (
        _drop_later_post(channel_id) if ephemeral else web_post_sink(bot, channel_id, user_id)
    )
    web_channel.bind_later_posts(later_posts)
    tagged = f"[{username}]: {content}"
    question_id = _store_web_message(
        bot, channel_id, "user", tagged, message_id, user_id=user_id, source="web")
    reply_id: str | None = None

    # The serving client, as Discord intake checks it: a compatible or Ollama
    # main model serves web chat with the Codex provider disabled.
    if not bot.llm_gateway.active_client:
        bot.sessions.remove_last_message(channel_id, "user")
        return {
            "response": "No LLM backend available.",
            "tools_used": [],
            "is_error": True,
        }

    # The page's Stop and corrections name this question; they act on this
    # turn only (a stateless request has no page to control it).
    turn = None
    if not ephemeral:
        turn = WebTurn(channel_id, question_id, str(msg.id), user_id, authority or ())
        _WEB_TURNS[channel_id] = turn
    try:
        trace = bot.turn_recorder._new_context_trace()
        sp = bot.prompt_builder.build_full_prompt(
            channel=None, user_id=user_id, query=content, trace=trace,
        )
        history = await bot.sessions.get_task_history(
            channel_id, max_messages=160, current_query=content, trace=trace,
        )

        try:
            response, already_sent, is_error, tools_used, handoff = (
                await bot.tool_loop.run(
                    # WebMessage is the documented duck-typed stand-in
                    # for discord.Message (see class docstring).
                    msg,  # type: ignore[arg-type]
                    history, system_prompt_override=sp, trace=trace,
                )
            )
        finally:
            await bot.delivery.set_status(None, task_end=True)

        response = _scrub(response)
        # A streamed/progress path has already delivered its own messages via
        # the virtual channel. Returning the model's outer final as well would
        # manufacture a duplicate which Discord callers never receive.
        if already_sent:
            response = "\n".join(web_channel.captured_messages)

        if not is_error:
            reply_id = _store_web_message(bot, channel_id, "assistant", response)
            bot.sessions.prune()
            try:
                await asyncio.to_thread(bot.sessions.save)
            except Exception:
                log.warning("Failed to save session %s", channel_id, exc_info=True)
        else:
            if tools_used:
                sanitized = (
                    f"[Previous request used tools ({', '.join(tools_used[:5])}) "
                    f"but encountered an error. The user may ask to retry.]"
                )
            else:
                sanitized = "[Previous request encountered an error before tool execution.]"
            reply_id = _store_web_message(bot, channel_id, "assistant", sanitized)
            bot.sessions.prune()
            try:
                await asyncio.to_thread(bot.sessions.save)
            except Exception:
                log.warning("Failed to save session %s", channel_id, exc_info=True)

        return {
            "response": response,
            "tools_used": tools_used,
            "is_error": is_error,
            "files": web_channel.captured_files,
            "question_id": question_id,
            "reply_id": reply_id,
        }
    except Exception as e:
        log.error("Web chat error: %s", e, exc_info=True)
        bot.sessions.remove_last_message(channel_id, "user")
        # The ids of what is still stored: a failure after the reply was
        # stored (pruning it) leaves the question and the reply in place.
        stored = {
            key: value for key, value in (("question_id", question_id), ("reply_id", reply_id))
            if value is not None and bot.sessions.has_message_id(channel_id, value)
        }
        return {
            "response": "Something went wrong processing your message. "
                        "Check server logs for details.",
            "tools_used": [],
            "is_error": True,
            "files": [],
            **stored,
        }
    finally:
        if turn is not None and _WEB_TURNS.get(channel_id) is turn:
            del _WEB_TURNS[channel_id]
        # The turn has answered; whatever it started posts to the chat itself.
        web_channel.detach(later_posts)


def _drop_later_post(channel_id: str) -> Callable[[str], None]:
    """The sink of a stateless request: its later posts are not kept."""

    def drop(_text: str) -> None:
        log.debug("Dropped a later post for stateless request %s", channel_id)

    return drop


def web_post_sink(bot: OdinBot, channel_id: str, owner_id: str) -> Callable[[str], None]:
    """Deliver a later post: store it with the chat, push it to the owner's
    open WebUI pages (never waiting on any socket), and have it saved soon."""

    def deliver(text: str) -> None:
        text = _scrub(text)
        timestamp = bot.sessions.add_post(channel_id, text)
        _post_saver(bot.sessions).request(channel_id)
        health = getattr(bot, "health_server", None)
        publish = getattr(health, "publish_chat_post", None)
        if callable(publish):
            publish(owner_id, {
                "type": "chat_post", "channel_id": channel_id,
                "content": text, "timestamp": timestamp,
            })

    return deliver


# A later post arrives with no turn to save it, so it is saved here: off the
# delivery path, one save at a time per session store, a short wait so a
# burst of posts shares one write, and a few spaced retries while it stays
# unsaved (a full disk). After the last retry it stays dirty for the next
# save (another post, a turn, shutdown).
POST_SAVE_DELAY_SECONDS = 1.0
POST_SAVE_RETRY_SECONDS = (5.0, 30.0, 120.0)

_POST_SAVERS: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()


def _post_saver(sessions) -> _PostSaver:
    saver = _POST_SAVERS.get(sessions)
    if saver is None:
        saver = _POST_SAVERS[sessions] = _PostSaver(sessions)
    return saver


class _PostSaver:
    def __init__(self, sessions) -> None:
        # Weak: the registry is keyed by the store, which this must not pin.
        self._sessions = weakref.ref(sessions)
        self._channels: set[str] = set()
        self._task: asyncio.Task | None = None

    def request(self, channel_id: str) -> None:
        self._channels.add(channel_id)
        if self._task is None or self._task.done():
            self._task = asyncio.get_running_loop().create_task(
                self._run(), name="web-later-post-save",
            )
            self._task.add_done_callback(_log_post_save_fault)

    async def _run(self) -> None:
        retries = iter(POST_SAVE_RETRY_SECONDS)
        delay = POST_SAVE_DELAY_SECONDS
        while self._channels:
            await asyncio.sleep(delay)
            sessions = self._sessions()
            if sessions is None:
                return
            channels, self._channels = self._channels, set()
            try:
                await asyncio.to_thread(sessions.save)
            except Exception:
                log.warning("Saving later chat posts failed", exc_info=True)
            # A chat posted to again meanwhile is simply saved on the next
            # pass; one still unsaved without a newer post failed to save.
            unsaved = {cid for cid in channels - self._channels if sessions.is_dirty(cid)}
            delay = POST_SAVE_DELAY_SECONDS
            if unsaved:
                retry = next(retries, None)
                if retry is None:
                    log.warning(
                        "Later posts in %d chat(s) are still unsaved; the next save "
                        "writes them", len(unsaved),
                    )
                else:
                    self._channels |= unsaved
                    delay = retry


def _log_post_save_fault(task: asyncio.Task) -> None:
    if not task.cancelled() and task.exception() is not None:
        log.warning("Later-post save task failed", exc_info=task.exception())


def detached_web_channel(bot: OdinBot, channel_id: str, owner_id: str) -> _WebChannel:
    """A web chat's channel for work outliving any turn (a restarted loop)."""
    channel = _WebChannel(channel_id, owner_id=owner_id)
    channel.detach(web_post_sink(bot, channel_id, owner_id))
    return channel
