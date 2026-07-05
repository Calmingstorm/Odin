"""Channel-operation native tool handlers (RFC-001 Phase 5b).

Verbatim moves from OdinBot: purge, read_channel, add_reaction,
create_poll, set_permission. ``get_channel`` is the bot's bound method
(stable for the process lifetime — discord.py resolves live gateway state
internally).
"""

from __future__ import annotations

from collections.abc import Callable

import discord

from ...llm.secret_scrubber import scrub_output_secrets
from ...odin_log import get_logger
from ..response_guards import scrub_response_secrets

log = get_logger("discord")


class ChannelOpsTools:
    def __init__(self, *, sessions, permissions, get_channel: Callable) -> None:
        self.sessions = sessions
        self.permissions = permissions
        self.get_channel = get_channel

    async def _handle_purge(self, message, inp: dict) -> str:
        """Delete recent messages in the channel."""
        count = min(inp.get("count", 100), 500)
        try:
            deleted = await message.channel.purge(limit=count)
            self.sessions.reset(str(message.channel.id))
            return f"Deleted {len(deleted)} messages and reset conversation history."
        except discord.Forbidden:
            return "I don't have permission to delete messages in this channel."
        except Exception as e:
            return f"Failed to purge messages: {e}"

    async def _handle_read_channel(self, message, inp: dict) -> str:
        """Read recent messages from a Discord channel.

        Returns formatted channel history including messages from all users
        and bots — not just the bot's own session history.
        """
        limit = min(int(inp.get("limit", 10)), 100)
        channel_id = inp.get("channel_id")

        # Resolve channel — fall back to current if channel_id is missing or non-numeric
        if channel_id and channel_id.isdigit():
            channel = self.get_channel(int(channel_id))
            if not channel:
                return f"Channel {channel_id} not found or not accessible."
        else:
            channel = getattr(message, "channel", None)
            if not channel:
                return "No channel context available."

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
            return "Permission denied — cannot read this channel."
        except Exception as e:
            return f"Failed to read channel: {e}"

    async def _handle_add_reaction(self, message, inp: dict) -> str:
        """Add an emoji reaction to a message."""
        message_id = inp.get("message_id")
        emoji = inp.get("emoji")
        if not emoji:
            return "'emoji' is required."
        # Resolve "this"/"current"/empty to the triggering message
        if not message_id or str(message_id).lower() in ("this", "current", "self"):
            message_id = str(message.id)
        try:
            msg = await message.channel.fetch_message(int(message_id))
            await msg.add_reaction(emoji)
            return "Reaction added."
        except discord.NotFound:
            return f"Message {message_id} not found in this channel."
        except discord.Forbidden:
            return "Permission denied to add reaction."
        except Exception as e:
            return f"Failed to add reaction: {e}"

    async def _handle_create_poll(self, message, inp: dict) -> str:
        """Create a Discord native poll in the current channel."""
        from datetime import timedelta

        question = inp.get("question")
        options = inp.get("options", [])
        if not question or not options:
            return "Both 'question' and 'options' are required."
        if len(options) > 10:
            return "Discord polls support a maximum of 10 options."
        # Scrub secrets from poll content before sending to Discord
        question = scrub_response_secrets(str(question))
        options = [scrub_response_secrets(str(opt)) for opt in options]
        duration_hours = min(inp.get("duration_hours", 24), 168)
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
            return f"Failed to create poll: {e}"

    async def _handle_set_permission(self, caller_id: str, inp: dict) -> str:
        """Set a user's permission tier. Only admins can call this."""
        if not self.permissions.is_admin(caller_id):
            return "Permission denied. Only admins can change permission tiers."
        target_user_id = inp["user_id"]
        tier = inp["tier"]
        try:
            await self.permissions.async_set_tier(target_user_id, tier)
        except ValueError as e:
            return str(e)
        return f"Permission tier for user {target_user_id} set to **{tier}**."
