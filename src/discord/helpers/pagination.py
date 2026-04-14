"""Paginated embed views for Odin."""

from __future__ import annotations

import discord
from discord.ext import commands

from src.constants import PAGINATION_TIMEOUT, PAGINATOR_PAGE_SIZE


class Paginator(discord.ui.View):
    """A simple button-based paginator for lists of embeds."""

    def __init__(
        self,
        pages: list[discord.Embed],
        author: discord.User | discord.Member,
        timeout: float = PAGINATION_TIMEOUT,
    ) -> None:
        super().__init__(timeout=timeout)
        self.pages = pages
        self.author = author
        self.current = 0
        self._update_buttons()

    def _update_buttons(self) -> None:
        self.prev_button.disabled = self.current == 0
        self.next_button.disabled = self.current >= len(self.pages) - 1

    @discord.ui.button(label="◀", style=discord.ButtonStyle.secondary)
    async def prev_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        if interaction.user.id != self.author.id:
            return
        self.current = max(0, self.current - 1)
        self._update_buttons()
        await interaction.response.edit_message(embed=self.pages[self.current], view=self)

    @discord.ui.button(label="▶", style=discord.ButtonStyle.secondary)
    async def next_button(
        self, interaction: discord.Interaction, button: discord.ui.Button
    ) -> None:
        if interaction.user.id != self.author.id:
            return
        self.current = min(len(self.pages) - 1, self.current + 1)
        self._update_buttons()
        await interaction.response.edit_message(embed=self.pages[self.current], view=self)

    async def on_timeout(self) -> None:
        for item in self.children:
            if isinstance(item, discord.ui.Button):
                item.disabled = True


def paginate_items(
    items: list[str],
    title: str,
    page_size: int = PAGINATOR_PAGE_SIZE,
    color: int | None = None,
) -> list[discord.Embed]:
    """Split *items* into paginated embeds."""
    from src.discord.helpers.embeds import odin_embed

    pages: list[discord.Embed] = []
    for i in range(0, max(len(items), 1), page_size):
        chunk = items[i : i + page_size]
        desc = "\n".join(chunk) if chunk else "No items."
        embed = odin_embed(title=title, description=desc, color=color or 0x5865F2)
        embed.set_footer(
            text=f"Page {len(pages) + 1}/{max(1, -(-len(items) // page_size))}"
        )
        pages.append(embed)
    return pages
