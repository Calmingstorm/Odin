"""Message intake and pipeline orchestration (RFC-001 P9, RFC-002 P4).

``MessageIntake.handle`` is the ``on_message`` gating chain (secret scrub
→ cog commands → bot/webhook gates → allowlists → channel enablement →
mention gate → dedup → bot-message buffering → attachments).
``MessagePipeline.run`` is the old ``_handle_message``
(per-channel lock + thread-context inheritance) and ``_run_inner`` the old
``_handle_message_inner`` (guest/tool routing, skill handoff, history
persistence + error sanitization, reflection dispatch, delivery hand-off).

Narrow-deps since RFC-002 P4: live roots (config, the bot user — None
until login) come in as provider callables; the LLM surface as the
gateway; components as themselves. The intake owns the secret patterns,
the allowlist checks, and attachment processing; the pipeline hands
housekeeping to the Housekeeping component. Patch seams live on the
owning components now (``bot.pipeline.run``, ``bot.intake
._process_attachments``), not on bot delegates.
"""

from __future__ import annotations

import asyncio
import io
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

import discord

from ..async_utils import fire_and_forget
from ..error_presentation import format_user_facing_error
from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger
from ..sessions.manager import CHAT_RESPONSE_MAX_CHARS, summarize_tool_response
from .response_guards import combine_bot_messages, scrub_response_secrets

if TYPE_CHECKING:
    from ..permissions.manager import PermissionManager
    from ..sessions.manager import SessionManager
    from .channel_config import ChannelConfigManager
    from .channel_logger import ChannelLogger
    from .channel_state import ChannelStateRegistry
    from .delivery import ResponseDelivery
    from .housekeeping import Housekeeping
    from .llm_gateway import LLMGateway
    from .prompts import PromptBuilder
    from .tool_loop import ToolLoopRunner
    from .turn_recorder import TurnRecorder

log = get_logger("discord")

# Patterns that might indicate a secret was pasted (moved verbatim from
# client.py, RFC-002 P4 — the intake is their only behavioral consumer).
SECRET_SCRUB_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*\S{8,}"),
    re.compile(r"xox[boaprs]-[a-zA-Z0-9-]+"),
    # Natural language: "my password is ...", "password for gmail is ..."
    re.compile(r"(?i)(?:my\s+)?(?:password|passwd|pwd)\s+(?:\S+\s+){0,4}(?:is|was)\s+\S{6,}"),
]


def check_for_secrets(content: str) -> bool:
    return any(p.search(content) for p in SECRET_SCRUB_PATTERNS)


@dataclass(frozen=True)
class MessageIntakeDeps:
    """The true dependency surface of the intake gating chain."""

    get_config: Callable  # live root — replaced by config hot-reload
    get_user: Callable  # live — None until the gateway login completes
    process_commands: Callable  # cog prefix-command dispatch (bot-bound)
    channel_logger: ChannelLogger
    channel_config: ChannelConfigManager
    channel_state: ChannelStateRegistry
    sessions: SessionManager
    pipeline: MessagePipeline  # the post-gate hand-off


class MessageIntake:
    def __init__(self, deps: MessageIntakeDeps) -> None:
        self._get_config = deps.get_config
        self._get_user = deps.get_user
        self._process_commands = deps.process_commands
        self._channel_logger = deps.channel_logger
        self._channel_config = deps.channel_config
        self._channel_state = deps.channel_state
        self._sessions = deps.sessions
        self._pipeline = deps.pipeline

    def is_allowed_user(self, user: discord.User | discord.Member) -> bool:
        if not self._get_config().discord.allowed_users:
            return True
        return str(user.id) in self._get_config().discord.allowed_users

    def is_allowed_channel(self, channel_id: int) -> bool:
        if not self._get_config().discord.channels:
            return True
        return str(channel_id) in self._get_config().discord.channels

    async def _process_attachments(
        self, message: discord.Message, content: str = ""
    ) -> tuple[str, list[dict]]:
        """Process attachments via AttachmentProcessor.

        Returns (inline_text, image_blocks). (Moved verbatim from the bot,
        RFC-002 P4.)
        """
        if not message.attachments:
            return "", []

        from .attachments import AttachmentProcessor, infer_attachment_intent

        config = self._get_config()
        cfg = config.attachments if hasattr(config, "attachments") else None
        processor = AttachmentProcessor(
            **({"temp_dir": cfg.temp_directory,
                "inline_max_bytes": cfg.inline_text_max_bytes,
                "preview_max_chars": cfg.preview_max_chars,
                "large_preview_chars": cfg.large_preview_chars,
                "archive_max_bytes": cfg.archive_max_bytes,
                "archive_max_files": cfg.archive_max_files,
                "archive_extract_max_bytes": cfg.archive_extract_max_bytes,
                "archive_preview_total_chars": cfg.archive_preview_total_chars,
                "archive_preview_file_max_bytes": cfg.archive_preview_file_max_bytes,
                "image_max_bytes": cfg.image_max_bytes,
                "pdf_max_bytes": cfg.pdf_max_bytes,
                "retention_hours": cfg.retention_hours,
                } if cfg else {})
        )

        recent_assistant = None
        session = self._sessions.get(str(message.channel.id))
        if session and session.messages:
            for m in reversed(session.messages):
                if m.role == "assistant":
                    recent_assistant = m.content
                    break

        intent = infer_attachment_intent(content, recent_assistant)

        result = await processor.process(
            message.attachments,
            channel_id=str(message.channel.id),
            message_id=str(message.id),
            intent=intent,
        )

        if result.warnings:
            for w in result.warnings:
                log.warning("Attachment warning: %s", w)

        return result.inline_text, result.image_blocks

    async def handle(self, message: discord.Message) -> None:
        from .tool_loop_helpers import _ALLOWED_WEBHOOK_IDS

        # Passive channel log — every guild message, including our own, before any filtering
        self._channel_logger.log_message(message)

        # Never respond to our own messages
        if message.author == self._get_user():
            return

        # Secret scrubbing runs BEFORE anything that inspects the message
        # content (cog prefix commands, executor flow). If a user posts a
        # credential, we delete + scrub first so nothing else sees it.
        pre_content = (message.content or "").strip()
        if pre_content and check_for_secrets(pre_content):
            try:
                self._sessions.scrub_secrets(str(message.channel.id), pre_content)
            except Exception:
                log.exception("scrub_secrets failed in early pre-filter")
            try:
                await message.delete()
                deleted = True
            except discord.NotFound:
                # Message already gone (user deleted it, auto-mod beat us, …).
                # Not a failure — just skip the delete and still warn the author.
                deleted = True
            except discord.Forbidden:
                deleted = False
            except discord.HTTPException:
                # Rate limits, network glitches — treat as "could not delete"
                # so the user sees the fallback notice and we don't crash
                # on_message and skip the notification.
                deleted = False
            try:
                if deleted:
                    await message.channel.send(
                        f"{message.author.mention} I detected a secret/credential in "
                        "your message. I've deleted it and scrubbed it from my history."
                    )
                else:
                    await message.channel.send(
                        f"{message.author.mention} I detected a secret/credential in "
                        "your message. I've scrubbed it from my history. "
                        "I couldn't delete the message — please delete it manually."
                    )
            except Exception:
                log.exception("Failed to send secret-scrub notice (non-fatal)")
            return

        # Cog-registered prefix commands (moderation, fun, utility, etc.) handle
        # their own auth via cog decorators (is_moderator, is_admin, …) and are
        # orthogonal to the executor's allowed_users / channels gates. Running
        # process_commands here (after secret scrubbing, before executor gates)
        # lets cogs work regardless of executor allowlist without exposing
        # secrets to command handlers.
        await self._process_commands(message)

        if message.author.bot:
            # Ignore specific bot IDs unless they explicitly @mention us in message text
            if str(message.author.id) in self._get_config().discord.ignore_bot_ids:
                mention_str = f"<@{self._get_user().id}>" if self._get_user() else ""
                if mention_str not in (message.content or ""):
                    return
            # Allow specific webhooks (via ALLOWED_WEBHOOK_IDS env var)
            is_allowed_webhook = (
                message.webhook_id and str(message.webhook_id) in _ALLOWED_WEBHOOK_IDS
            )
            _bot_gid = str(message.guild.id) if message.guild else None
            _bot_cid = str(message.channel.id)
            _respond_bots = self._channel_config.should_respond_to_bots(
                _bot_gid,
                _bot_cid,
                self._get_config().discord.respond_to_bots,
            )
            if not is_allowed_webhook and not _respond_bots:
                return

        is_test_webhook = message.webhook_id and str(message.webhook_id) in _ALLOWED_WEBHOOK_IDS
        if not is_test_webhook and not self.is_allowed_user(message.author):
            return
        if not self.is_allowed_channel(message.channel.id):
            return

        # Per-channel enabled check (channel override > guild default > global)
        guild_id = str(message.guild.id) if message.guild else None
        channel_id_str = str(message.channel.id)
        if not self._channel_config.is_enabled(guild_id, channel_id_str):
            return

        # Per-channel require_mention check (channel override > guild default > global)
        # Bot messages skip this gate — they go into the buffer and the mention
        # check happens after all segments are collected.
        _require_mention = self._channel_config.should_require_mention(
            guild_id,
            channel_id_str,
            self._get_config().discord.require_mention,
        )
        if _require_mention:
            is_dm = not hasattr(message.channel, "guild") or message.channel.guild is None
            is_bot_buffered = message.author.bot and self._channel_config.should_respond_to_bots(
                guild_id,
                channel_id_str,
                self._get_config().discord.respond_to_bots,
            )
            if not is_dm and not is_bot_buffered:
                is_mentioned = self._get_user() and (
                    self._get_user().mentioned_in(message)
                    or f"<@{self._get_user().id}>" in (message.content or "")
                )
                if not is_mentioned:
                    return

        log.info(
            "on_message fired: msg_id=%s channel=%s content=%r",
            message.id,
            message.channel.id,
            message.content[:80],
        )

        # Dedup: skip if we've already processed this exact message
        if self._channel_state.seen_message(message.id):
            log.warning("Duplicate on_message for msg_id=%s, skipping", message.id)
            return

        # Buffer rapid-fire bot messages (e.g. code blocks split across messages)
        # Wait 2s after each bot message to see if more follow, then process all
        # at once. Use the per-channel override (not the raw global flag) so this
        # agrees with the mention gate above — otherwise a channel that opts out
        # of bot replies still gets its bot messages buffered and answered.
        if message.author.bot and self._channel_config.should_respond_to_bots(
            guild_id,
            channel_id_str,
            self._get_config().discord.respond_to_bots,
        ):
            buf_key = (str(message.channel.id), str(message.author.id))
            if buf_key not in self._channel_state.bot_msg_buffer:
                self._channel_state.bot_msg_buffer[buf_key] = []
            buf = self._channel_state.bot_msg_buffer[buf_key]
            if len(buf) >= self._channel_state.bot_msg_buffer_max:
                log.warning("Bot buffer full (%d msgs) for %s, dropping oldest", len(buf), buf_key)
                buf.pop(0)
            buf.append(scrub_output_secrets(message.content))

            # Cancel previous timer for this bot+channel
            if buf_key in self._channel_state.bot_msg_tasks:
                self._channel_state.bot_msg_tasks[buf_key].cancel()

            # Set new timer — process after delay of silence
            async def _flush_bot_buffer(key, orig_msg):
                await asyncio.sleep(self._channel_state.bot_msg_buffer_delay)
                parts = self._channel_state.bot_msg_buffer.pop(key, [])
                self._channel_state.bot_msg_tasks.pop(key, None)
                if not parts:
                    return
                combined = combine_bot_messages(parts)
                log.info(
                    "Bot buffer flushed: %d messages from %s combined", len(parts), orig_msg.author
                )
                # require_mention for bots: check if ANY buffered part mentions us
                _bot_guild_id = str(orig_msg.guild.id) if orig_msg.guild else None
                _bot_channel_id = str(orig_msg.channel.id)
                _bot_require = self._channel_config.should_require_mention(
                    _bot_guild_id,
                    _bot_channel_id,
                    self._get_config().discord.require_mention,
                )
                if _bot_require and self._get_user():
                    mention_str = f"<@{self._get_user().id}>"
                    mention_nick = f"<@!{self._get_user().id}>"
                    if not any(mention_str in p or mention_nick in p for p in parts):
                        log.info(
                            "Bot buffer discarded: no mention found in %d messages from %s",
                            len(parts),
                            orig_msg.author,
                        )
                        return
                # Strip mention from combined content
                if self._get_user():
                    combined = combined.replace(f"<@{self._get_user().id}>", "").strip()
                    combined = combined.replace(f"<@!{self._get_user().id}>", "").strip()
                if combined:
                    await self._pipeline.run(orig_msg, combined, image_blocks=[])

            self._channel_state.bot_msg_tasks[buf_key] = asyncio.create_task(
                _flush_bot_buffer(buf_key, message)
            )
            return

        content = message.content
        # Strip the bot mention from the message if present
        if self._get_user() and self._get_user().mentioned_in(message):
            content = content.replace(f"<@{self._get_user().id}>", "").strip()
            content = content.replace(f"<@!{self._get_user().id}>", "").strip()

        # Handle file attachments — append file contents to the message
        attachment_text, image_blocks = await self._process_attachments(message, content)
        if attachment_text:
            attachment_text = scrub_output_secrets(attachment_text)
            content = f"{content}\n\n{attachment_text}" if content else attachment_text

        if not content and not image_blocks:
            return

        if not content:
            content = "(see attached image)"

        # Check for secrets, scrub from history and delete the message.
        if check_for_secrets(content):
            self._sessions.scrub_secrets(str(message.channel.id), content)
            # Deletion can fail for more than just Forbidden — the message may
            # already be gone (NotFound) or we may be rate-limited
            # (HTTPException). Catching only Forbidden let those propagate out
            # of on_message, so the user never even got the scrub notice.
            deleted = False
            try:
                await message.delete()
                deleted = True
            except discord.NotFound:
                deleted = True  # already gone — treat as deleted
            except (discord.Forbidden, discord.HTTPException) as e:
                log.warning("Could not delete secret-bearing message: %s", e)
            note = (
                "I've deleted it and scrubbed it from my history."
                if deleted
                else "I've scrubbed it from my history. I couldn't delete the "
                "message — please delete it manually."
            )
            try:
                await message.channel.send(
                    f"{message.author.mention} I detected a secret/credential "
                    f"in your message. {note}"
                )
            except discord.HTTPException:
                pass  # best-effort notice; the scrub already happened
            return

        await self._pipeline.run(message, content, image_blocks=image_blocks)


@dataclass(frozen=True)
class MessagePipelineDeps:
    """The true dependency surface of the message pipeline."""

    channel_state: ChannelStateRegistry  # per-channel locks, pending files, ops
    sessions: SessionManager
    permissions: PermissionManager  # guest-tier routing
    llm_gateway: LLMGateway  # owns the swappable provider clients
    prompt_builder: PromptBuilder
    turn_recorder: TurnRecorder  # context traces + operational reflection
    tool_loop: ToolLoopRunner  # the tools route
    delivery: ResponseDelivery  # status, retries, chunked sends
    housekeeping: Housekeeping  # post-turn cache maintenance


class MessagePipeline:
    def __init__(self, deps: MessagePipelineDeps) -> None:
        self._channel_state = deps.channel_state
        self._sessions = deps.sessions
        self._permissions = deps.permissions
        self._llm_gateway = deps.llm_gateway
        self._prompt_builder = deps.prompt_builder
        self._turn_recorder = deps.turn_recorder
        self._tool_loop = deps.tool_loop
        self._delivery = deps.delivery
        self._housekeeping = deps.housekeeping

    async def run(
        self,
        message: discord.Message,
        content: str,
        *,
        image_blocks: list[dict] | None = None,
    ) -> None:
        channel_id = str(message.channel.id)

        # Acquire per-channel lock — messages queue naturally via the lock
        lock = self._channel_state.channel_locks.setdefault(channel_id, asyncio.Lock())

        async with lock:
            # Thread context inheritance: if this is a thread with no session yet,
            # seed it with the parent channel's summary so context carries over.
            # Must be inside the lock to prevent two concurrent messages from
            # both seeding the thread and to safely access parent session state.
            if isinstance(message.channel, discord.Thread) and message.channel.parent:
                parent_id = str(message.channel.parent.id)
                parent_name = getattr(message.channel.parent, "name", parent_id)
                thread_session = self._sessions.get_or_create(channel_id)
                if not thread_session.messages:
                    parent_session = self._sessions.get_or_create(parent_id)
                    if parent_session.messages or parent_session.summary:
                        # Copy the parent's summary and last few messages for context
                        # Mark as inherited so the LLM distinguishes thread-native
                        # context from parent-channel context
                        _inherited_tag = f"[INHERITED FROM #{parent_name}]"
                        if parent_session.summary:
                            thread_session.summary = f"{_inherited_tag} {parent_session.summary}"
                        else:
                            thread_session.summary = ""
                        # Include recent parent messages as additional context
                        recent = parent_session.messages[-6:]
                        if recent:
                            parent_context = "\n".join(
                                f"{m.role}: {m.content[:300]}" for m in recent
                            )
                            _ctx_block = (
                                f"{_inherited_tag} Parent channel context:\n{parent_context}"
                            )
                            if thread_session.summary:
                                thread_session.summary += f"\n{_ctx_block}"
                            else:
                                thread_session.summary = _ctx_block
                        log.info(
                            "Thread %s inherited context from parent #%s (%s)",
                            channel_id,
                            parent_name,
                            parent_id,
                        )

            await self._run_inner(
                message,
                content,
                channel_id,
                image_blocks=image_blocks or [],
            )

    async def _run_inner(
        self,
        message: discord.Message,
        content: str,
        channel_id: str,
        *,
        image_blocks: list[dict] | None = None,
    ) -> None:
        from .tool_loop_helpers import _EMPTY_RESPONSE_FALLBACK

        user_id = str(message.author.id)
        # Prefix with display name so the LLM knows who's talking
        display_name = message.author.display_name or message.author.name
        tagged_content = f"[{display_name}]: {content}"
        self._sessions.add_message(channel_id, "user", tagged_content, user_id=user_id)

        try:
            is_guest = self._permissions.is_guest(str(message.author.id))
            already_sent = False
            is_error = False
            tools_used: list[str] = []
            handoff = False

            if is_guest:
                # Guest tier: chat only, no tools
                log.info("Guest tier user %s, chat route (no tools)", message.author.id)
                # Guests use full history (with compaction)
                history = await self._sessions.get_history_with_compaction(channel_id)
                if image_blocks:
                    history = list(history)
                    if history and history[-1]["role"] == "user":
                        last_msg = history[-1]
                        text_content = (
                            last_msg["content"]
                            if isinstance(last_msg["content"], str)
                            else str(last_msg["content"])
                        )
                        # Vision turns legitimately swap str content for
                        # a block list; the LLM layer handles both shapes.
                        history[-1] = {
                            "role": "user",
                            "content": image_blocks + [{"type": "text", "text": text_content}],  # type: ignore[dict-item]
                        }
                    log.info("Attached %d image(s) to message for Claude vision", len(image_blocks))
                if self._llm_gateway.active_client:
                    chat_prompt = self._prompt_builder.build_chat_prompt(
                        channel=message.channel,
                        user_id=user_id,
                        query=content,
                    )
                    try:
                        response = await self._llm_gateway.active_client.chat(
                            messages=history,
                            system=chat_prompt,
                        )
                        if not response:
                            response = _EMPTY_RESPONSE_FALLBACK
                        log.info("LLM response: %r", response[:200])
                    except Exception as e:
                        log.warning("LLM chat failed: %s", e)
                        response = "Chat is temporarily unavailable. Please try again in a moment."
                        is_error = True
                else:
                    log.info("No chat backend configured for guest user")
                    response = "Chat backend is not configured."
                    is_error = True
            else:
                # Everyone else: Codex with ALL tools
                if not self._llm_gateway.active_client:
                    await self._delivery.send_with_retry(
                        message,
                        "No LLM provider available. Please try again later.",
                    )
                    self._sessions.remove_last_message(channel_id, "user")
                    return
                _trace = self._turn_recorder._new_context_trace()
                if _trace is not None:
                    with _trace.phase("system_prompt"):
                        _sp = self._prompt_builder.build_full_prompt(
                            channel=message.channel,
                            user_id=user_id,
                            query=content,
                            trace=_trace,
                        )
                else:
                    _sp = self._prompt_builder.build_full_prompt(
                        channel=message.channel,
                        user_id=user_id,
                        query=content,
                    )
                log.info("Routing to Codex with tools")
                # Use abbreviated history to reduce poisoning from stale responses
                # (get_task_history handles compaction internally)
                # Pass current message content for relevance scoring —
                # older messages unrelated to the current query are dropped
                if _trace is not None:
                    with _trace.phase("history"):
                        task_history = await self._sessions.get_task_history(
                            channel_id,
                            max_messages=160,
                            current_query=content,
                            trace=_trace,
                        )
                else:
                    task_history = await self._sessions.get_task_history(
                        channel_id,
                        max_messages=160,
                        current_query=content,
                    )
                if image_blocks and task_history and task_history[-1]["role"] == "user":
                    last = task_history[-1]
                    text = (
                        last["content"]
                        if isinstance(last["content"], str)
                        else str(last["content"])
                    )
                    # Vision turns legitimately swap str content for
                    # a block list; the LLM layer handles both shapes.
                    task_history[-1] = {
                        "role": "user",
                        "content": image_blocks + [{"type": "text", "text": text}],  # type: ignore[dict-item]
                    }
                    log.info("Attached %d image(s) to message for Claude vision", len(image_blocks))
                try:
                    (
                        response,
                        already_sent,
                        is_error,
                        tools_used,
                        handoff,
                    ) = await self._tool_loop.run(
                        message,
                        task_history,
                        system_prompt_override=_sp,
                        trace=_trace,
                    )
                except TimeoutError as codex_err:
                    _err = format_user_facing_error(codex_err)
                    log.warning("Codex tool loop timed out: %s", _err)
                    response = f"Tool execution timed out: {_err}"
                    is_error = True
                except Exception as codex_err:
                    # exc_info carries the full traceback; the message arg is
                    # bounded so upstream HTML bodies aren't duplicated into
                    # the journal — and never reach chat.
                    _err = format_user_facing_error(codex_err)
                    log.error("Codex tool loop unexpected error: %s", _err, exc_info=True)
                    response = f"Tool execution failed: {_err}"
                    is_error = True
                    handoff = False
                # Skill requested Codex handoff — route skill result to Codex for response
                if handoff and self._llm_gateway.active_client and not is_error:
                    log.info("Skill handoff to Codex for response")
                    _skill_response = response  # Save before overwriting
                    chat_prompt = self._prompt_builder.build_chat_prompt(
                        channel=message.channel,
                        user_id=user_id,
                        query=content,
                    )
                    # Fetch full history for handoff (compaction already ran in get_task_history)
                    history = self._sessions.get_history(channel_id)
                    codex_messages = list(history) + [
                        {"role": "assistant", "content": f"[Tool result: {response}]"},
                        {
                            "role": "user",
                            "content": (
                                "Respond to the user based on the tool result above. "
                                "Be conversational and helpful."
                            ),
                        },
                    ]
                    try:
                        response = await self._llm_gateway.active_client.chat(
                            messages=codex_messages,
                            system=chat_prompt,
                        )
                        if not response:
                            log.warning("Codex handoff returned empty, using skill result directly")
                            response = _skill_response
                        already_sent = False
                    except Exception as e:
                        log.warning("Codex handoff failed, using skill result directly: %s", e)
                        response = _skill_response
                        already_sent = False
        except (TimeoutError, discord.HTTPException, discord.Forbidden) as e:
            # Same raw-interpolation disease as the tool-loop catch: str() on
            # a discord.HTTPException carries the raw HTTP body (HTML pages).
            _err = format_user_facing_error(e)
            await self._delivery.set_status(None, task_end=True)
            log.error("Discord/network error processing message: %s", _err, exc_info=True)
            leaked = self._channel_state.pending_files.pop(channel_id, None)
            if leaked:
                log.warning(
                    "Cleaned %d leaked pending file(s) for channel %s", len(leaked), channel_id
                )
            await self._delivery.send_with_retry(
                message, scrub_response_secrets(f"Something went wrong: {_err}")
            )
            self._sessions.remove_last_message(channel_id, "user")
            return
        except asyncio.CancelledError:
            # CancelledError is a BaseException, so it bypasses the Exception
            # handlers here — without this the just-appended user turn is left
            # orphaned in history (no assistant reply). Clean up synchronously
            # (no awaits, which could re-raise mid-cancellation) and re-raise so
            # the cancellation still propagates.
            self._channel_state.pending_files.pop(channel_id, None)
            self._sessions.remove_last_message(channel_id, "user")
            raise
        except Exception as e:
            _err = format_user_facing_error(e)
            await self._delivery.set_status(None, task_end=True)
            log.error("Unexpected error processing message: %s", _err, exc_info=True)
            leaked = self._channel_state.pending_files.pop(channel_id, None)
            if leaked:
                log.warning(
                    "Cleaned %d leaked pending file(s) for channel %s", len(leaked), channel_id
                )
            await self._delivery.send_with_retry(
                message, scrub_response_secrets(f"Something went wrong: {_err}")
            )
            self._sessions.remove_last_message(channel_id, "user")
            return

        await self._delivery.set_status(None, task_end=True)

        # Scrub secrets from LLM response before logging, saving, or sending.
        # Tool output is already scrubbed (scrub_output_secrets in _run_tool),
        # but the LLM may echo, reconstruct, or hallucinate secrets in its
        # natural-language response text.
        response = scrub_response_secrets(response)

        log.info("Final response to send: %r", response[:200])
        if not is_error:
            if tools_used:
                # Summarize verbose tool-loop responses before persisting
                # to prevent long multi-tool outputs from dominating history
                history_response = summarize_tool_response(response, tools_used)
            else:
                # Save text-only (chat) responses too — the LLM needs to
                # remember what it said.  Truncate to keep history lean.
                history_response = (
                    response[:CHAT_RESPONSE_MAX_CHARS]
                    if len(response) > CHAT_RESPONSE_MAX_CHARS
                    else response
                )
            self._sessions.add_message(channel_id, "assistant", history_response)
            self._sessions.prune()
            self._housekeeping.maybe_cleanup()
            try:
                await asyncio.to_thread(self._sessions.save)
            except Exception as save_err:
                log.warning("Session save failed: %s", save_err)
        else:
            # Save a sanitized error marker instead of the full error response.
            # The user sees the full error on Discord, but raw refusals and
            # fabrications are NOT persisted to prevent context poisoning.
            if tools_used:
                sanitized = (
                    f"[Previous request used tools ({', '.join(tools_used[:5])}) "
                    f"but encountered an error. The user may ask to retry.]"
                )
            else:
                sanitized = "[Previous request encountered an error before tool execution.]"
            self._sessions.add_message(channel_id, "assistant", sanitized)
            self._sessions.prune()
            try:
                await asyncio.to_thread(self._sessions.save)
            except Exception as save_err:
                log.warning("Session save failed: %s", save_err)

        # Post-operation reflection — learn from what actually happened, including
        # failures. Must run for both the success and error paths (previously this
        # was nested under the success branch, so is_error was never observed).
        if tools_used:
            # Pop synchronously inside the channel-locked request body so a
            # fast follow-up request can never swap details under the
            # fire-and-forget reflection task.
            op_details = self._channel_state.last_op_details.pop(channel_id, None)
            fire_and_forget(
                self._turn_recorder._operational_reflection(
                    content,
                    tools_used,
                    response,
                    is_error,
                    user_id,
                    tool_details=op_details,
                ),
                name="operational_reflection",
            )

        if not already_sent:
            # _send_chunked picks up pending files and attaches them to the
            # first message — text + file arrive as one Discord message.
            await self._delivery.send_chunked(message, response)
        else:
            # Streamed response already on Discord — post pending files separately
            pending = self._channel_state.pending_files.pop(channel_id, [])
            if pending:
                discord_files = [
                    discord.File(io.BytesIO(data), filename=fname) for data, fname in pending
                ]
                try:
                    await message.channel.send(files=discord_files)
                except Exception as e:
                    log.warning("Failed to send pending skill files: %s", e)
