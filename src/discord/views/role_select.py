"""Role selection dropdown view."""

from __future__ import annotations

from typing import TYPE_CHECKING

import discord

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine


class RoleSelectView(discord.ui.View):
    """Dropdown that lets a user pick one role from a list."""

    def __init__(
        self,
        roles: list[discord.Role],
        callback: Callable[[discord.Interaction, discord.Role], Coroutine],
        timeout: float = 60,
    ) -> None:
        super().__init__(timeout=timeout)
        self._callback = callback
        options = [
            discord.SelectOption(label=role.name, value=str(role.id))
            for role in roles[:25]
        ]
        self.select = discord.ui.Select(
            placeholder="Select a role…",
            options=options,
        )
        self.select.callback = self._on_select
        self.add_item(self.select)
        self._role_map = {str(r.id): r for r in roles}

    async def _on_select(self, interaction: discord.Interaction) -> None:
        role_id = self.select.values[0]
        role = self._role_map.get(role_id)
        if role:
            await self._callback(interaction, role)
        self.stop()
