"""Custom cooldown logic for Odin commands."""

from __future__ import annotations

import time
from collections import defaultdict


class CooldownManager:
    """Per-user, per-action cooldown tracker."""

    def __init__(self) -> None:
        # {action: {user_id: expires_at}}
        self._cooldowns: dict[str, dict[int, float]] = defaultdict(dict)

    def is_on_cooldown(self, action: str, user_id: int) -> bool:
        expires = self._cooldowns[action].get(user_id, 0)
        return time.monotonic() < expires

    def remaining(self, action: str, user_id: int) -> float:
        expires = self._cooldowns[action].get(user_id, 0)
        return max(0.0, expires - time.monotonic())

    def set_cooldown(self, action: str, user_id: int, seconds: float) -> None:
        self._cooldowns[action][user_id] = time.monotonic() + seconds

    def reset(self, action: str, user_id: int) -> None:
        self._cooldowns[action].pop(user_id, None)

    def clear_expired(self) -> int:
        """Remove all expired entries. Returns count of entries removed."""
        now = time.monotonic()
        removed = 0
        for action_map in self._cooldowns.values():
            expired = [uid for uid, exp in action_map.items() if exp <= now]
            for uid in expired:
                del action_map[uid]
                removed += 1
        return removed
