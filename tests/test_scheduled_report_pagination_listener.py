"""Regression coverage for the scheduled-report reaction listener."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from src.discord.client import INITIAL_EXTENSIONS
from src.discord.cogs.scheduled_report_pagination import setup


async def test_loaded_listener_routes_managed_reaction_to_pagination_service():
    """The startup extension must route report controls, not merely leave the service wired."""
    extension = "src.discord.cogs.scheduled_report_pagination"
    assert extension in INITIAL_EXTENSIONS

    pagination = MagicMock()
    pagination.handles.return_value = True
    pagination.handle_reaction = AsyncMock(return_value=True)
    bot = MagicMock()
    bot.user = SimpleNamespace(id=42)
    bot.components = SimpleNamespace(scheduled_reports=pagination)
    bot.add_cog = AsyncMock()

    await setup(bot)
    cog = bot.add_cog.await_args.args[0]
    listeners = dict(cog.get_listeners())
    assert "on_raw_reaction_add" in listeners
    payload = SimpleNamespace(message_id=99, channel_id=7, user_id=123, emoji="➡️")

    await listeners["on_raw_reaction_add"](payload)

    pagination.handles.assert_called_once_with(99, "➡️")
    pagination.handle_reaction.assert_awaited_once_with(payload)


async def test_listener_ignores_bot_reactions_and_unmanaged_messages():
    pagination = MagicMock()
    pagination.handles.return_value = False
    pagination.handle_reaction = AsyncMock()
    bot = MagicMock()
    bot.user = SimpleNamespace(id=42)
    bot.components = SimpleNamespace(scheduled_reports=pagination)
    bot.add_cog = AsyncMock()

    await setup(bot)
    listener = bot.add_cog.await_args.args[0]

    own_payload = SimpleNamespace(message_id=99, user_id=42, emoji="➡️")
    await listener.on_raw_reaction_add(own_payload)
    pagination.handles.assert_not_called()

    other_payload = SimpleNamespace(message_id=100, user_id=123, emoji="➡️")
    await listener.on_raw_reaction_add(other_payload)
    pagination.handles.assert_called_once_with(100, "➡️")
    pagination.handle_reaction.assert_not_awaited()
