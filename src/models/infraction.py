"""Infraction (moderation action) model."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class Infraction:
    """A single moderation infraction record."""

    guild_id: int
    user_id: int
    moderator_id: int
    action: str  # "ban", "kick", "mute", "warn"
    reason: str = "No reason provided"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    id: int = 0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "guild_id": self.guild_id,
            "user_id": self.user_id,
            "moderator_id": self.moderator_id,
            "action": self.action,
            "reason": self.reason,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> Infraction:
        d = dict(data)
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})
