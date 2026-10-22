"""Channel-operation native tool handlers (RFC-001 Phase 5b).

Verbatim moves from OdinBot: purge, read_channel, add_reaction,
create_poll, set_permission. ``get_channel`` is the bot's bound method
(stable for the process lifetime — discord.py resolves live gateway state
internally).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

import discord

from ...json_store import StoreCorruptError
from ...llm.secret_scrubber import scrub_output_secrets
from ...odin_log import get_logger
from ...tools.execution_outcome import ToolFailure
from ...tools.input_defaults import default_if_empty, int_or_default
from ..response_guards import scrub_response_secrets

log = get_logger("discord")

_STORED_HISTORY_NOTICE = (
    "This is not live channel history or a full record of tool calls and progress. It may "
    "include the unsaved current request; the reply in progress is not stored yet."
)
_COMPACTED_NOTICE = (
    " Older messages were compacted into a summary, which is not reproduced here."
)
_CONTEXT_ONLY = (
    " This is context for YOU — do not paste or echo these messages. "
    "Respond with your own summary, analysis, or action."
)


def _stored_record_line(record) -> str:
    """One stored session message, with its stored role and identity."""
    stamp = getattr(record, "timestamp", None)
    if isinstance(stamp, (int, float)) and not isinstance(stamp, bool):
        try:
            when = datetime.fromtimestamp(stamp, tz=UTC).strftime("%Y-%m-%d %H:%M:%S")
        except (OverflowError, OSError, ValueError):
            when = "unknown time"
    else:
        when = "unknown time"
    role = getattr(record, "role", "")
    if role == "assistant":
        author = "Odin [BOT]"
    elif role == "post":  # posted after its turn, by a loop or a background task
        author = "Odin [BOT] (later post)"
    elif role == "user":
        user_id = getattr(record, "user_id", None)
        author = f"user {user_id}" if user_id else "user"
    else:
        author = str(role or "unknown")
    content = getattr(record, "content", "")
    if not isinstance(content, str):
        body = "(non-text content omitted)"
    else:
        body = content or "(empty message)"
    return f"[{when}] {author}: {body}"


class ChannelOpsTools:
    def __init__(self, *, sessions, permissions, get_channel: Callable) -> None:
        self.sessions = sessions
        self.permissions = permissions
        self.get_channel = get_channel

    async def _handle_purge(self, message, inp: dict) -> str:
        """Delete recent messages in the channel."""
        try:
            count = min(int_or_default(inp.get("count"), 100), 500)
        except ValueError:
            return ToolFailure("count must be a whole number.")
        try:
            deleted = await message.channel.purge(limit=count)
            self.sessions.reset(str(message.channel.id))
            return f"Deleted {len(deleted)} messages and reset conversation history."
        except discord.Forbidden:
            return ToolFailure("I don't have permission to delete messages in this channel.")
        except Exception as e:
            return ToolFailure(f"Failed to purge messages: {e}")

    async def _handle_read_channel(self, message, inp: dict) -> str:
        """Read recent messages from a Discord channel.

        Returns formatted channel history including messages from all users
        and bots — not just the bot's own session history. A web or API chat
        has no Discord history: there, omitting ``channel_id`` (or naming
        this chat) reads this chat's stored session instead, and nothing
        else ever reads a stored session.
        """
        channel_id = inp.get("channel_id")
        current = getattr(message, "channel", None)
        if current is not None and getattr(current, "reads_stored_session", False) is True:
            requested = default_if_empty(channel_id)
            if requested is None or str(requested) == str(current.id):
                return self._read_stored_session(current, inp.get("limit"))
            if not str(requested).isdigit():
                return ToolFailure(
                    f"Channel {requested} not found. In this chat, omit channel_id to read "
                    "this conversation, or pass a Discord channel's numeric ID."
                )
        try:
            limit = min(int_or_default(inp.get("limit"), 10), 100)
        except ValueError:
            return ToolFailure("limit must be a whole number.")

        # Resolve channel — fall back to current if channel_id is missing or non-numeric
        if channel_id and channel_id.isdigit():
            channel = self.get_channel(int(channel_id))
            if not channel:
                return ToolFailure(f"Channel {channel_id} not found or not accessible.")
        else:
            channel = getattr(message, "channel", None)
            if not channel:
                return ToolFailure("No channel context available.")

        try:
            messages = []
            async for msg in channel.history(limit=limit):
                parts = []
                # Timestamp
                ts = msg.created_at.strftime("%H:%M:%S")
                # Author
                author = (
                    msg.author.display_name
                    if hasattr(msg.author, "display_name")
                    else str(msg.author)
                )
                is_bot = getattr(msg.author, "bot", False)
                bot_tag = " [BOT]" if is_bot else ""
                # Content
                content = msg.content or ""
                if content:
                    parts.append(content)
                # Attachments
                for att in msg.attachments:
                    parts.append(f"[attachment: {att.filename}]")
                # Embeds
                for embed in msg.embeds:
                    embed_parts = []
                    if embed.title:
                        embed_parts.append(f"title: {embed.title}")
                    if embed.description:
                        desc = embed.description[:200]
                        embed_parts.append(desc)
                    if embed_parts:
                        parts.append(f"[embed: {'; '.join(embed_parts)}]")

                body = " ".join(parts) if parts else "(empty message)"
                messages.append(f"[{ts}] {author}{bot_tag}: {body}")

            if not messages:
                return "No messages found in channel."

            # Reverse so oldest is first (channel.history returns newest first)
            messages.reverse()
            result = "\n".join(messages)

            # Scrub secrets
            result = scrub_output_secrets(result)

            # Prefix with instruction — these messages are context, not output
            return (
                f"[Channel history: {len(messages)} messages read. "
                "This is context for YOU — do not paste or echo these messages. "
                "Respond with your own summary, analysis, or action.]\n" + result
            )

        except discord.Forbidden:
            return ToolFailure("Permission denied — cannot read this channel.")
        except Exception as e:
            return ToolFailure(f"Failed to read channel: {e}")

    def _read_stored_session(self, channel, raw_limit) -> str:
        """This web or API chat's stored session: the newest records, oldest first.

        Read-only: a session is looked up, never created, restored, pruned or
        saved, and the records are copied before anything else happens.
        Summaries are announced, never reproduced.
        """
        limit = default_if_empty(raw_limit, 10)
        if isinstance(limit, bool):
            return ToolFailure("limit must be a whole number from 1 to 100.")
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            return ToolFailure("limit must be a whole number from 1 to 100.")
        limit = 10 if limit == 0 else max(1, min(limit, 100))
        try:
            session = self.sessions.get(str(channel.id))
            if session is None:
                return (
                    "This chat has no stored session in memory (it may have expired or "
                    "been reset), so no history was read."
                )
            # Later posts read like posts in a Discord channel's history.
            records = sorted(
                [*session.messages, *getattr(session, "posts", [])],
                key=lambda record: getattr(record, "timestamp", 0) or 0,
            )[-limit:]
            compacted = session.has_summary
        except Exception as e:
            return ToolFailure(f"Stored history for this chat is unavailable: {e}")
        notice = _COMPACTED_NOTICE if compacted else ""
        if not records:
            return scrub_output_secrets(
                "[Stored session: no messages are stored in this chat's conversation yet."
                f"{notice}]"
            )
        lines = "\n".join(_stored_record_line(record) for record in records)
        return scrub_output_secrets(
            f"[Stored session: {len(records)} message(s) from this chat's saved "
            f"conversation, oldest first, times in UTC. {_STORED_HISTORY_NOTICE}{notice}"
            f"{_CONTEXT_ONLY}]\n{lines}"
        )

    async def _handle_add_reaction(self, message, inp: dict) -> str:
        """Add an emoji reaction to a message."""
        message_id = inp.get("message_id")
        emoji = inp.get("emoji")
        if not emoji:
            return ToolFailure("'emoji' is required.")
        # Resolve "this"/"current"/empty to the triggering message
        if not message_id or str(message_id).lower() in ("this", "current", "self"):
            message_id = str(message.id)
        try:
            msg = await message.channel.fetch_message(int(message_id))
            await msg.add_reaction(emoji)
            return "Reaction added."
        except discord.NotFound:
            return ToolFailure(f"Message {message_id} not found in this channel.")
        except discord.Forbidden:
            return ToolFailure("Permission denied to add reaction.")
        except Exception as e:
            return ToolFailure(f"Failed to add reaction: {e}")

    async def _handle_create_poll(self, message, inp: dict) -> str:
        """Create a Discord native poll in the current channel."""
        from datetime import timedelta

        question = inp.get("question")
        options = inp.get("options", [])
        if not question or not options:
            return ToolFailure("Both 'question' and 'options' are required.")
        if len(options) > 10:
            return ToolFailure("Discord polls support a maximum of 10 options.")
        # Scrub secrets from poll content before sending to Discord
        question = scrub_response_secrets(str(question))
        options = [scrub_response_secrets(str(opt)) for opt in options]
        try:
            duration_hours = min(int_or_default(inp.get("duration_hours"), 24), 168)
        except ValueError:
            return ToolFailure("duration_hours must be a whole number.")
        multiple = inp.get("multiple", False)
        try:
            poll = discord.Poll(
                question=question,
                duration=timedelta(hours=duration_hours),
                multiple=multiple,
            )
            for opt in options:
                poll.add_answer(text=opt)
            await message.channel.send(poll=poll)
            return "Poll created."
        except Exception as e:
            return ToolFailure(f"Failed to create poll: {e}")

    async def _handle_set_permission(self, caller_id: str, inp: dict) -> str:
        """Set a user's permission tier. Only admins can call this."""
        if not self.permissions.is_admin(caller_id):
            return ToolFailure("Permission denied. Only admins can change permission tiers.")
        target_user_id = inp["user_id"]
        tier = inp["tier"]
        try:
            await self.permissions.async_set_tier(target_user_id, tier)
        except ValueError as e:
            return ToolFailure(str(e))
        except StoreCorruptError:
            return ToolFailure("Permission store is corrupt; refusing to modify it.")
        return f"Permission tier for user {target_user_id} set to **{tier}**."
