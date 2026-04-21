"""Per-guild and per-channel response configuration.

Persisted to data/channel_config.json, hot-reloaded on API writes.
Resolution order: channel override > guild default > global config.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..odin_log import get_logger

log = get_logger("discord.channel_config")

_DEFAULT_ENTRY = {"enabled": True, "require_mention": None}


class ChannelConfigManager:
    def __init__(self, path: str = "./data/channel_config.json") -> None:
        self._path = Path(path)
        self._guild_defaults: dict[str, dict[str, Any]] = {}
        self._channel_overrides: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text())
            self._guild_defaults = data.get("guild_defaults", {})
            self._channel_overrides = data.get("channel_overrides", {})
            log.info(
                "Loaded channel config: %d guild defaults, %d channel overrides",
                len(self._guild_defaults), len(self._channel_overrides),
            )
        except Exception as e:
            log.error("Failed to load channel config: %s", e)

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps({
            "guild_defaults": self._guild_defaults,
            "channel_overrides": self._channel_overrides,
        }, indent=2))
        tmp.replace(self._path)

    def should_respond_to_bots(self, guild_id: str | None, channel_id: str, global_default: bool = False) -> bool:
        ch = self._channel_overrides.get(channel_id, {})
        if ch.get("respond_to_bots") is not None:
            return ch["respond_to_bots"]
        if guild_id:
            gd = self._guild_defaults.get(guild_id, {})
            if gd.get("respond_to_bots") is not None:
                return gd["respond_to_bots"]
        return global_default

    def is_enabled(self, guild_id: str | None, channel_id: str, global_default: bool = True) -> bool:
        ch = self._channel_overrides.get(channel_id, {})
        if "enabled" in ch:
            return ch["enabled"]
        if guild_id:
            gd = self._guild_defaults.get(guild_id, {})
            if "enabled" in gd:
                return gd["enabled"]
        return global_default

    def should_require_mention(self, guild_id: str | None, channel_id: str, global_default: bool = False) -> bool:
        ch = self._channel_overrides.get(channel_id, {})
        if ch.get("require_mention") is not None:
            return ch["require_mention"]
        if guild_id:
            gd = self._guild_defaults.get(guild_id, {})
            if gd.get("require_mention") is not None:
                return gd["require_mention"]
        return global_default

    def set_guild_config(self, guild_id: str, **kwargs: Any) -> dict[str, Any]:
        current = self._guild_defaults.get(guild_id, {})
        for k in ("enabled", "require_mention", "respond_to_bots"):
            if k in kwargs and kwargs[k] is not None:
                current[k] = kwargs[k]
        self._guild_defaults[guild_id] = current
        self._save()
        return current

    def set_channel_config(self, channel_id: str, **kwargs: Any) -> dict[str, Any]:
        current = self._channel_overrides.get(channel_id, {})
        for k in ("enabled", "require_mention", "respond_to_bots"):
            if k in kwargs and kwargs[k] is not None:
                current[k] = kwargs[k]
        if kwargs.get("clear"):
            self._channel_overrides.pop(channel_id, None)
            self._save()
            return {}
        self._channel_overrides[channel_id] = current
        self._save()
        return current

    def get_guild_config(self, guild_id: str) -> dict[str, Any]:
        return self._guild_defaults.get(guild_id, {})

    def get_channel_config(self, channel_id: str) -> dict[str, Any]:
        return self._channel_overrides.get(channel_id, {})

    def get_all(self) -> dict[str, Any]:
        return {
            "guild_defaults": dict(self._guild_defaults),
            "channel_overrides": dict(self._channel_overrides),
        }
