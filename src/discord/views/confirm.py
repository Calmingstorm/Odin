"""Confirmation button view."""

from __future__ import annotations

import discord

from src.constants import CONFIRMATION_TIMEOUT


class ConfirmView(discord.ui.View):
    """Two-button confirm/cancel view.

    Usage::

        view = ConfirmView(author=ctx.author)
        msg = await ctx.send("Are you sure?", view=view)
        await view.wait()
        if view.confirmed:
            ...
    """

    confirmed: bool | None = None

    def __init__(
        self,
        author: discord.User | discord.Member,
        timeout: float = CONFIRMATION_TIMEOUT,
    ) -> None:
        super().__init__(timeout=timeout)
        self.author = author

    @discord.ui.button(label="Confirm", style=discord.ButtonStyle.danger)
    async def confirm_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        if interaction.user.id != self.author.id:
            return
        self.confirmed = True
        self.stop()
        await interaction.response.edit_message(content="Confirmed.", view=None)

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        if interaction.user.id != self.author.id:
            return
        self.confirmed = False
        self.stop()
        await interaction.response.edit_message(content="Cancelled.", view=None)

    async def on_timeout(self) -> None:
        self.confirmed = False
        self.stop()
