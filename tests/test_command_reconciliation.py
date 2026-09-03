"""Startup application-command reconciliation: the global scope is forced
empty, each guild holds exactly the tree, scopes are isolated, and only
failed or new scopes are retried."""
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
        _command_snapshot=None,
    )
    bot._reconcile_application_commands = (
        lambda guilds=None: OdinBot._reconcile_application_commands(bot, guilds=guilds)
    )
    return bot


async def _reconcile(bot, guilds=None):
    await OdinBot._reconcile_application_commands(bot, guilds=guilds)


def _guild(gid):
    return SimpleNamespace(id=gid, name=f"g{gid}")


async def test_global_cleared_first_then_each_guild_holds_exactly_the_tree():
    tree = _Tree()
    bot = _bot(tree, [_guild(1), _guild(2)])
    await _reconcile(bot)
    assert tree.calls[:2] == [("clear", None), ("sync", None)]
    assert tree.globals == []  # global scope reconciled to EMPTY, not duplicated
    for gid in (1, 2):
        assert [c.name for c in tree.guild_maps[gid]] == ["status", "usage"]
    assert ("clear", 1) in tree.calls and ("sync", 1) in tree.calls
    clear_at = tree.calls.index(("clear", 1))
    add_at = tree.calls.index(("add", 1, "status"))
    assert clear_at < add_at < tree.calls.index(("sync", 1))
    assert bot._synced_command_scopes == {"global", "guild:1", "guild:2"}


async def test_failed_scope_is_isolated_and_retried_later():
    tree = _Tree(fail_guilds={1})
    bot = _bot(tree, [_guild(1), _guild(2)])
    await _reconcile(bot)  # must not raise
    assert bot._synced_command_scopes == {"global", "guild:2"}
    before = len(tree.calls)
    tree.fail_guilds.clear()
    await _reconcile(bot)
    after = tree.calls[before:]
    assert ("sync", 1) in after
    assert ("sync", None) not in after and ("sync", 2) not in after  # only the failed scope
    assert bot._synced_command_scopes == {"global", "guild:1", "guild:2"}


async def test_global_failure_does_not_block_guild_reconciliation():
    tree = _Tree()
    tree.fail_global = True
    bot = _bot(tree, [_guild(7)])
    await _reconcile(bot)
    assert "guild:7" in bot._synced_command_scopes and "global" not in bot._synced_command_scopes


async def test_guild_join_reconciles_only_the_new_guild_from_the_snapshot():
    tree = _Tree()
    bot = _bot(tree, [_guild(1)])
    await _reconcile(bot)
    assert tree.globals == []
    before = len(tree.calls)
    await OdinBot.on_guild_join(bot, _guild(9))
    after = tree.calls[before:]
    assert after == [("clear", 9), ("add", 9, "status"), ("add", 9, "usage"), ("sync", 9)]
    assert "guild:9" in bot._synced_command_scopes
