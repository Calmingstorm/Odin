"""Data access layer for Odin.

Provides an in-memory repository for development/testing.
Production would swap this for a SQL-backed implementation.
"""

from __future__ import annotations

from collections import defaultdict

from src.models.guild import GuildSettings
from src.models.infraction import Infraction


class InMemoryRepository:
    """Simple in-memory data store for guild settings and infractions."""

    def __init__(self) -> None:
        self._guilds: dict[int, GuildSettings] = {}
        self._infractions: dict[int, list[Infraction]] = defaultdict(list)
        self._next_infraction_id = 1

    # -- Guild settings --------------------------------------------------

    def get_guild(self, guild_id: int) -> GuildSettings:
        if guild_id not in self._guilds:
            self._guilds[guild_id] = GuildSettings(guild_id=guild_id)
        return self._guilds[guild_id]

    def save_guild(self, settings: GuildSettings) -> None:
        self._guilds[settings.guild_id] = settings

    def delete_guild(self, guild_id: int) -> None:
        self._guilds.pop(guild_id, None)

    # -- Infractions -----------------------------------------------------

    def add_infraction(self, infraction: Infraction) -> Infraction:
        infraction.id = self._next_infraction_id
        self._next_infraction_id += 1
        self._infractions[infraction.guild_id].append(infraction)
        return infraction

    def get_infractions(
        self, guild_id: int, user_id: int | None = None
    ) -> list[Infraction]:
        infractions = self._infractions.get(guild_id, [])
        if user_id is not None:
            infractions = [i for i in infractions if i.user_id == user_id]
        return infractions

    def clear_infractions(self, guild_id: int, user_id: int) -> int:
        before = len(self._infractions.get(guild_id, []))
        self._infractions[guild_id] = [
            i for i in self._infractions.get(guild_id, []) if i.user_id != user_id
        ]
        return before - len(self._infractions[guild_id])
