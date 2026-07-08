"""Coverage for src/discord/channel_config.py (RFC-006 P17, safe).

Real ChannelConfigManager against a tmp JSON path — the channel>guild>global
resolution ladder for is_enabled / should_require_mention / should_respond_to_bots,
the set/get/clear mutators, persistence round-trips, and the corrupt-file load
guard. SAFE: pure dict logic + tmp-file I/O only; no network, no Discord.
"""
from __future__ import annotations

import json

import pytest

from src.discord.channel_config import ChannelConfigManager


@pytest.fixture
def mgr(tmp_path):
    return ChannelConfigManager(path=str(tmp_path / "channel_config.json"))


class TestResolutionLadder:
    def test_is_enabled_channel_over_guild_over_global(self, mgr):
        assert mgr.is_enabled("g1", "c1", global_default=True) is True   # global fallback
        mgr.set_guild_config("g1", enabled=False)
        assert mgr.is_enabled("g1", "c1") is False                       # guild default
        mgr.set_channel_config("c1", enabled=True)
        assert mgr.is_enabled("g1", "c1") is True                        # channel override wins

    def test_require_mention_ladder(self, mgr):
        assert mgr.should_require_mention("g1", "c1", global_default=False) is False
        mgr.set_guild_config("g1", require_mention=True)
        assert mgr.should_require_mention("g1", "c9") is True             # guild
        mgr.set_channel_config("c9", require_mention=False)
        assert mgr.should_require_mention("g1", "c9") is False            # channel

    def test_respond_to_bots_ladder(self, mgr):
        assert mgr.should_respond_to_bots("g1", "c1") is False            # global default
        mgr.set_guild_config("g1", respond_to_bots=True)
        assert mgr.should_respond_to_bots("g1", "cX") is True             # guild
        mgr.set_channel_config("cX", respond_to_bots=False)
        assert mgr.should_respond_to_bots("g1", "cX") is False            # channel

    def test_no_guild_id_uses_global(self, mgr):
        # guild_id=None skips the guild layer entirely
        assert mgr.is_enabled(None, "c1", global_default=True) is True
        assert mgr.should_require_mention(None, "c1", global_default=True) is True


class TestMutatorsAndPersistence:
    def test_set_and_get(self, mgr):
        got = mgr.set_guild_config("g1", enabled=True, require_mention=True, respond_to_bots=None)
        assert got["enabled"] is True and got["require_mention"] is True
        assert "respond_to_bots" not in got                     # None values are skipped
        assert mgr.get_guild_config("g1")["enabled"] is True

    def test_clear_channel_override(self, mgr):
        mgr.set_channel_config("c1", enabled=False)
        assert mgr.get_channel_config("c1") != {}
        assert mgr.set_channel_config("c1", clear=True) == {}   # clear removes it
        assert mgr.get_channel_config("c1") == {}

    def test_get_all_snapshot(self, mgr):
        mgr.set_guild_config("g1", enabled=True)
        mgr.set_channel_config("c1", enabled=False)
        snap = mgr.get_all()
        assert "g1" in snap["guild_defaults"] and "c1" in snap["channel_overrides"]

    def test_persistence_roundtrip(self, tmp_path):
        p = str(tmp_path / "cc.json")
        m = ChannelConfigManager(path=p)
        m.set_guild_config("g1", require_mention=True)
        m.set_channel_config("c1", enabled=False)
        reloaded = ChannelConfigManager(path=p)                 # reads from disk
        assert reloaded.get_guild_config("g1")["require_mention"] is True
        assert reloaded.get_channel_config("c1")["enabled"] is False


class TestLoad:
    def test_load_existing_file(self, tmp_path):
        p = tmp_path / "cc.json"
        p.write_text(json.dumps({
            "guild_defaults": {"g1": {"enabled": False}},
            "channel_overrides": {},
        }))
        m = ChannelConfigManager(path=str(p))
        assert m.is_enabled("g1", "cAny") is False

    def test_corrupt_file_is_tolerated(self, tmp_path):
        p = tmp_path / "cc.json"
        p.write_text("{ this is not valid json")
        m = ChannelConfigManager(path=str(p))                   # error caught, starts empty
        assert m.get_all() == {"guild_defaults": {}, "channel_overrides": {}}
