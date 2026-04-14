"""User profile model."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class UserProfile:
    """Tracked user profile data."""

    user_id: int
    guild_id: int
    xp: int = 0
    level: int = 0
    warnings_count: int = 0

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "guild_id": self.guild_id,
            "xp": self.xp,
            "level": self.level,
            "warnings_count": self.warnings_count,
        }

    @classmethod
    def from_dict(cls, data: dict) -> UserProfile:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
