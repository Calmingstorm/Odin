"""Reminder record model."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class ReminderRecord:
    """Persistent reminder record."""

    user_id: int
    channel_id: int
    message: str
    fire_at: datetime
    id: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "channel_id": self.channel_id,
            "message": self.message,
            "fire_at": self.fire_at.isoformat(),
            "created_at": self.created_at.isoformat(),
        }
