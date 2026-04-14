"""Seed script for test data.

Populates the in-memory repository with sample data for development.
"""

from src.database.repository import InMemoryRepository
from src.models.guild import GuildSettings
from src.models.infraction import Infraction


def seed():
    repo = InMemoryRepository()

    # Sample guild
    guild = GuildSettings(guild_id=123456789, prefix="!", spam_filter_enabled=True)
    repo.save_guild(guild)

    # Sample infractions
    repo.add_infraction(Infraction(
        guild_id=123456789,
        user_id=111,
        moderator_id=222,
        action="warn",
        reason="Spamming in general",
    ))
    repo.add_infraction(Infraction(
        guild_id=123456789,
        user_id=111,
        moderator_id=222,
        action="mute",
        reason="Continued spam",
    ))

    print(f"Seeded {len(repo.get_infractions(123456789))} infractions.")
    return repo


if __name__ == "__main__":
    seed()
