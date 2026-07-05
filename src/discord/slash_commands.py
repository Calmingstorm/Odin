"""Slash-command registration (RFC-001 Phase 10).

Verbatim move of OdinBot._register_commands: the six commands close over
the bot exactly as before.
"""

from __future__ import annotations

import asyncio

import discord
from discord import app_commands

from ..odin_log import get_logger

log = get_logger("discord")


def register_commands(bot) -> None:
    @bot.tree.command(name="status", description="Show Odin bot status")
    async def cmd_status(interaction: discord.Interaction) -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        voice_status = ""
        if bot.voice_manager:
            if bot.voice_manager.is_connected:
                ch = bot.voice_manager.current_channel
                voice_status = (
                    f"\nVoice: Connected to **{ch.name}**" if ch else "\nVoice: Connected"
                )
            else:
                voice_status = "\nVoice: Not connected"
        provider_cfg = getattr(bot.config, "llm_provider", None)
        active = provider_cfg.active_provider if provider_cfg else "codex"
        client = bot.llm_gateway.active_client
        if client:
            model = getattr(client, "model", "unknown")
            llm_status = f"LLM: **{active}** ({model})"
        else:
            llm_status = "LLM: not configured"
        codex_configured = "yes" if bot.llm_gateway.codex_client else "no"
        ollama_configured = "yes" if bot.llm_gateway.ollama_client else "no"
        kimi_configured = "yes" if bot.llm_gateway.kimi_client else "no"
        await interaction.response.send_message(
            f"**Odin Status**\n"
            f"{llm_status}\n"
            f"Codex: {codex_configured} | Ollama: {ollama_configured} | Kimi: {kimi_configured}\n"
            f"{voice_status}"
        )

    @bot.tree.command(name="reset", description="Reset conversation history")
    async def cmd_reset(interaction: discord.Interaction) -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        bot.sessions.reset(str(interaction.channel_id))
        await interaction.response.send_message("Conversation history cleared.")

    @bot.tree.command(name="reload", description="Reload context files")
    async def cmd_reload(interaction: discord.Interaction) -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        bot.context_loader.reload()
        bot.prompt_builder.invalidate()
        bot.tool_catalog.invalidate()
        bot.prompt_builder.rebuild_default()
        await interaction.response.send_message("Context files reloaded.")

    @bot.tree.command(name="purge", description="Delete recent messages in this channel")
    @app_commands.describe(count="Number of messages to delete (default 100, max 500)")
    async def cmd_purge(interaction: discord.Interaction, count: int = 100) -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        count = min(count, 500)
        await interaction.response.defer(ephemeral=True)
        deleted = await interaction.channel.purge(limit=count)
        bot.sessions.reset(str(interaction.channel_id))
        await interaction.followup.send(
            f"Deleted {len(deleted)} messages and reset conversation history.",
            ephemeral=True,
        )

    @bot.tree.command(name="usage", description="Show token usage details")
    async def cmd_usage(interaction: discord.Interaction) -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        await interaction.response.send_message(
            "**Usage**\n"
            "All backends are subscription-based (free).\n"
            "Codex: ChatGPT subscription\n"
            "Claude Code: Max subscription"
        )

    @bot.tree.command(name="stop", description="Stop Odin's current task in this channel")
    async def cmd_stop(interaction: discord.Interaction) -> None:
        if not bot.intake.is_allowed_user(interaction.user):
            await interaction.response.send_message("Access denied.", ephemeral=True)
            return
        channel_id = str(interaction.channel_id)
        event = bot.channel_state.cancel_events.setdefault(channel_id, asyncio.Event())
        active = bot.channel_state.active_requests.get(channel_id)
        if active:
            event.set()
            await interaction.response.send_message("Stopping current task...", ephemeral=True)
        else:
            await interaction.response.send_message(
                "No active task in this channel.", ephemeral=True
            )
