"""Tests for the in-memory repository."""

from src.database.repository import InMemoryRepository
from src.models.infraction import Infraction


class TestInMemoryRepository:
    def test_get_guild_creates_default(self):
        repo = InMemoryRepository()
        gs = repo.get_guild(1)
        assert gs.guild_id == 1
        assert gs.prefix == "!"

    def test_save_and_get_guild(self):
        repo = InMemoryRepository()
        gs = repo.get_guild(1)
        gs.prefix = "?"
        repo.save_guild(gs)
        assert repo.get_guild(1).prefix == "?"

    def test_delete_guild(self):
        repo = InMemoryRepository()
        repo.get_guild(1)
        repo.delete_guild(1)
        # Should create fresh default after delete
        assert repo.get_guild(1).prefix == "!"

    def test_add_infraction(self):
        repo = InMemoryRepository()
        inf = Infraction(guild_id=1, user_id=2, moderator_id=3, action="warn")
        result = repo.add_infraction(inf)
        assert result.id == 1

    def test_get_infractions(self):
        repo = InMemoryRepository()
        repo.add_infraction(Infraction(guild_id=1, user_id=2, moderator_id=3, action="warn"))
        repo.add_infraction(Infraction(guild_id=1, user_id=2, moderator_id=3, action="kick"))
        repo.add_infraction(Infraction(guild_id=1, user_id=5, moderator_id=3, action="ban"))
        assert len(repo.get_infractions(1)) == 3
        assert len(repo.get_infractions(1, user_id=2)) == 2

    def test_clear_infractions(self):
        repo = InMemoryRepository()
        repo.add_infraction(Infraction(guild_id=1, user_id=2, moderator_id=3, action="warn"))
        repo.add_infraction(Infraction(guild_id=1, user_id=2, moderator_id=3, action="kick"))
        removed = repo.clear_infractions(1, 2)
        assert removed == 2
        assert len(repo.get_infractions(1, user_id=2)) == 0

    def test_infractions_auto_increment(self):
        repo = InMemoryRepository()
        i1 = repo.add_infraction(Infraction(guild_id=1, user_id=2, moderator_id=3, action="warn"))
        i2 = repo.add_infraction(Infraction(guild_id=1, user_id=2, moderator_id=3, action="kick"))
        assert i2.id == i1.id + 1
