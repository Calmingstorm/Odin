"""Fun cog — casual entertainment commands."""

from __future__ import annotations

import random

from discord.ext import commands

from src.discord.helpers.embeds import odin_embed


class Fun(commands.Cog):
    """Fun and entertainment commands."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @commands.command(name="8ball")
    async def eightball(self, ctx: commands.Context, *, question: str) -> None:
        """Ask the magic 8-ball a question."""
        responses = [
            "It is certain.",
            "Without a doubt.",
            "You may rely on it.",
            "Yes, definitely.",
            "As I see it, yes.",
            "Most likely.",
            "Reply hazy, try again.",
            "Ask again later.",
            "Cannot predict now.",
            "Don't count on it.",
            "My reply is no.",
            "My sources say no.",
            "Very doubtful.",
        ]
        embed = odin_embed(
            title="Magic 8-Ball",
            description=f"**Q:** {question}\n**A:** {random.choice(responses)}",
        )
        await ctx.send(embed=embed)

    @commands.command()
    async def roll(self, ctx: commands.Context, dice: str = "1d6") -> None:
        """Roll dice. Format: NdS (e.g. 2d20)."""
        try:
            count_s, sides_s = dice.lower().split("d")
            count = int(count_s) if count_s else 1
            sides = int(sides_s)
            if not (1 <= count <= 100 and 1 <= sides <= 1000):
                raise ValueError
        except (ValueError, AttributeError):
            await ctx.send("Invalid format. Use `NdS`, e.g. `2d20`.")
            return

        rolls = [random.randint(1, sides) for _ in range(count)]
        total = sum(rolls)
        rolls_str = ", ".join(str(r) for r in rolls)
        embed = odin_embed(
            title=f"Dice Roll: {dice}",
            description=f"**Rolls:** {rolls_str}\n**Total:** {total}",
        )
        await ctx.send(embed=embed)

    @commands.command()
    async def coinflip(self, ctx: commands.Context) -> None:
        """Flip a coin."""
        result = random.choice(["Heads", "Tails"])
        await ctx.send(embed=odin_embed(title="Coin Flip", description=f"**{result}!**"))

    @commands.command()
    async def choose(self, ctx: commands.Context, *, choices: str) -> None:
        """Choose between options separated by commas."""
        options = [c.strip() for c in choices.split(",") if c.strip()]
        if len(options) < 2:
            await ctx.send("Give me at least 2 options separated by commas.")
            return
        await ctx.send(
            embed=odin_embed(
                title="I choose…",
                description=f"**{random.choice(options)}**",
            )
        )


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Fun(bot))
