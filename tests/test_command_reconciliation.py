"""One exact global command set; legacy guild copies must be removed first."""
from __future__ import annotations

from types import SimpleNamespace

from src.discord.client import OdinBot


class _Cmd:
    def __init__(self, name):
        self.name = name


class _Tree:
    def __init__(self, fail_guilds=()):
        self.globals = [_Cmd("status"), _Cmd("usage")]
        self.guild_maps: dict[int, list] = {}
        self.calls: list[tuple] = []
        self.fail_guilds = set(fail_guilds)
        self.fail_global = False

    def get_commands(self, *, guild=None):
        return list(self.globals) if guild is None else list(self.guild_maps.get(guild.id, []))

    def clear_commands(self, *, guild):
        self.calls.append(("clear", None if guild is None else guild.id))
        if guild is None:
            self.globals = []
        else:
            self.guild_maps[guild.id] = []

    def add_command(self, cmd, *, guild):
        self.calls.append(("add", guild.id, cmd.name))
        self.guild_maps.setdefault(guild.id, []).append(cmd)

    async def sync(self, *, guild=None):
        scope = None if guild is None else guild.id
        self.calls.append(("sync", scope))
        if guild is None and self.fail_global:
            raise RuntimeError("global sync down")
        if guild is not None and guild.id in self.fail_guilds:
            raise RuntimeError(f"guild {guild.id} sync down")
        return list(self.globals) if guild is None else list(self.guild_maps[guild.id])


def _bot(tree, guilds):
    """Duck-typed self: the reconciliation touches only these attributes, and
    discord.py's ``tree``/``guilds`` are read-only properties on a real bot."""
    bot = SimpleNamespace(
        tree=tree,
        guilds=guilds,
        _synced_command_scopes=set(),
    )
    bot._reconcile_application_commands = (
        lambda guilds=None: OdinBot._reconcile_application_commands(bot, guilds=guilds)
    )
    return bot


async def _reconcile(bot, guilds=None):
    await OdinBot._reconcile_application_commands(bot, guilds=guilds)


def _guild(gid):
    return SimpleNamespace(id=gid, name=f"g{gid}")


async def test_guild_copies_cleared_before_exact_global_publication():
    tree = _Tree()
    bot = _bot(tree, [_guild(1), _guild(2)])
    await _reconcile(bot)
    assert tree.calls == [
        ("clear", 1), ("sync", 1), ("clear", 2), ("sync", 2), ("sync", None),
    ]
    assert [c.name for c in tree.globals] == ["status", "usage"]
    for gid in (1, 2):
        assert tree.guild_maps[gid] == []
    assert bot._synced_command_scopes == {"global", "guild:1", "guild:2"}


async def test_failed_scope_is_isolated_and_retried_later():
    tree = _Tree(fail_guilds={1})
    bot = _bot(tree, [_guild(1), _guild(2)])
    await _reconcile(bot)  # must not raise
    assert bot._synced_command_scopes == {"guild:2"}
    assert ("sync", None) not in tree.calls
    before = len(tree.calls)
    tree.fail_guilds.clear()
    await _reconcile(bot)
    after = tree.calls[before:]
    assert ("sync", 1) in after
    assert ("sync", None) in after and ("sync", 2) not in after
    assert bot._synced_command_scopes == {"global", "guild:1", "guild:2"}


async def test_global_failure_does_not_block_guild_reconciliation():
    tree = _Tree()
    tree.fail_global = True
    bot = _bot(tree, [_guild(7)])
    await _reconcile(bot)
    assert "guild:7" in bot._synced_command_scopes and "global" not in bot._synced_command_scopes
    tree.fail_global = False
    tree.calls.clear()
    await _reconcile(bot)
    assert tree.calls == [("sync", None)]


async def test_guild_join_clears_new_guild_without_creating_copies():
    tree = _Tree()
    bot = _bot(tree, [_guild(1)])
    await _reconcile(bot)
    assert [c.name for c in tree.globals] == ["status", "usage"]
    before = len(tree.calls)
    await OdinBot.on_guild_join(bot, _guild(9))
    after = tree.calls[before:]
    assert after == [("clear", 9), ("sync", 9)]
    assert "guild:9" in bot._synced_command_scopes


async def test_join_cannot_bypass_other_guild_cleanup_failure():
    tree = _Tree(fail_guilds={1})
    bot = _bot(tree, [_guild(1)])
    await _reconcile(bot)
    await OdinBot.on_guild_join(bot, _guild(9))
    assert ("sync", None) not in tree.calls
    assert tree.guild_maps[9] == []


async def test_no_guilds_still_publishes_global_set_and_reconnect_is_noop():
    tree = _Tree()
    bot = _bot(tree, [])
    await _reconcile(bot)
    await _reconcile(bot)
    assert tree.calls == [("sync", None)]


async def test_real_discord_tree_bulk_sync_replaces_stale_remote_commands():
    from unittest.mock import AsyncMock

    import discord
    from discord import app_commands

    client = discord.Client(intents=discord.Intents.none(), application_id=123)
    tree = app_commands.CommandTree(client)
    remote = {None: ["removed"], 7: ["status", "removed"]}

    @tree.command(name="status", description="Current status")
    async def status(interaction: discord.Interaction):
        pass

    async def global_sync(application_id, *, payload):
        assert application_id == 123
        remote[None] = [row["name"] for row in payload]
        return []

    async def guild_sync(application_id, guild_id, *, payload):
        assert application_id == 123
        remote[guild_id] = [row["name"] for row in payload]
        return []

    tree._http = SimpleNamespace(
        bulk_upsert_global_commands=AsyncMock(side_effect=global_sync),
        bulk_upsert_guild_commands=AsyncMock(side_effect=guild_sync),
    )
    await _reconcile(_bot(tree, [_guild(7)]))
    assert remote == {None: ["status"], 7: []}
