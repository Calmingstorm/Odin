"""DM registration and authorization without guild/member objects."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import discord
from discord import app_commands
from src.discord.channel_state import ChannelStateRegistry, ChatTurnInbox
from src.discord.intake_pipeline import MessageIntake
from src.discord.slash_commands import register_commands


def bot_and_tree():
    client = discord.Client(intents=discord.Intents.none(), application_id=123)
    tree = app_commands.CommandTree(client)
    intake = object.__new__(MessageIntake)
    intake._get_config = lambda: SimpleNamespace(discord=SimpleNamespace(allowed_users=["7", "8"]))
    bot = SimpleNamespace(
        tree=tree, intake=intake, channel_state=ChannelStateRegistry(),
        permissions=SimpleNamespace(is_admin=lambda uid: uid == "8"),
    )
    register_commands(bot)
    return bot, tree


def interaction(uid=7):
    return SimpleNamespace(
        guild=None, guild_id=None, channel_id=42,
        user=SimpleNamespace(id=uid, bot=False),
        response=SimpleNamespace(send_message=AsyncMock(), defer=AsyncMock()),
        followup=SimpleNamespace(send=AsyncMock()),
    )


def test_global_payload_enables_only_guilds_and_bot_dms():
    _, tree = bot_and_tree()
    assert {cmd.name for cmd in tree.get_commands()} == {
        "status", "usage", "reload", "stop", "steer",
    }
    assert tree.get_commands(guild=discord.Object(id=1)) == []
    for cmd in tree.get_commands():
        payload = cmd.to_dict(tree)
        assert payload["contexts"] == [0, 1]
        assert payload["integration_types"] == [0]


@pytest.mark.parametrize("name", ["status", "usage", "reload", "stop", "steer"])
async def test_dm_allowlist_denies_before_command_effects(name):
    _, tree = bot_and_tree()
    dm = interaction(99)
    args = ("change direction",) if name == "steer" else ()
    await tree.get_command(name).callback(dm, *args)
    dm.response.send_message.assert_awaited_once_with("Access denied.", ephemeral=True)


@pytest.mark.parametrize("uid,owner,allowed", [(7, "7", True), (7, "9", False), (8, "9", True)])
async def test_dm_steer_requester_or_admin(uid, owner, allowed):
    bot, tree = bot_and_tree()
    bot.channel_state.set_active_request("42", "request")
    inbox = ChatTurnInbox(requester_id=owner)
    bot.channel_state.bind_steer_inbox("42", "request", inbox)
    dm = interaction(uid)
    await tree.get_command("steer").callback(dm, "change direction")
    assert inbox.inbox.qsize() == int(allowed)
    assert ("Message queued" in dm.response.send_message.call_args.args[0]) is allowed


async def test_dm_stop_uses_current_dm_channel():
    bot, tree = bot_and_tree()
    import asyncio
    waiter = asyncio.get_running_loop().create_future()
    waiter.set_result("Stopped safely.")

    def request_stop(channel):
        assert channel == "42"
        return "request", waiter

    bot.channel_state.request_stop = request_stop
    dm = interaction()
    await tree.get_command("stop").callback(dm)
    dm.response.defer.assert_awaited_once_with(ephemeral=True)
    dm.followup.send.assert_awaited_once_with("Stopped safely.", ephemeral=True)
