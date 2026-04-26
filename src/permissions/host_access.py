from __future__ import annotations

import asyncio
import json
from pathlib import Path

from ..odin_log import get_logger

log = get_logger("host_access")


class HostAccessEntry:
    __slots__ = ("allowed_hosts", "default_host")

    def __init__(self, allowed_hosts: list[str] | None = None, default_host: str = "") -> None:
        self.allowed_hosts: list[str] = allowed_hosts or []
        self.default_host: str = default_host

    def to_dict(self) -> dict:
        return {"allowed_hosts": self.allowed_hosts, "default_host": self.default_host}

    @classmethod
    def from_dict(cls, data: dict) -> HostAccessEntry:
        return cls(
            allowed_hosts=data.get("allowed_hosts", []),
            default_host=data.get("default_host", ""),
        )


class HostAccessManager:
    """Per-user host access control with defaults and persistence."""

    def __init__(self, path: str = "./data/host_access.json", available_hosts: list[str] | None = None) -> None:
        self._path = Path(path)
        self._lock = asyncio.Lock()
        self._users: dict[str, HostAccessEntry] = {}
        self._default_policy = HostAccessEntry()
        self._available_hosts: list[str] = available_hosts or []
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text())
            if not isinstance(data, dict):
                return
            if "default_policy" in data:
                self._default_policy = HostAccessEntry.from_dict(data["default_policy"])
            for uid, entry in data.get("users", {}).items():
                self._users[uid] = HostAccessEntry.from_dict(entry)
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Failed to load host access config: %s", e)

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "default_policy": self._default_policy.to_dict(),
            "users": {uid: entry.to_dict() for uid, entry in self._users.items()},
        }
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self._path)

    @property
    def available_hosts(self) -> list[str]:
        return list(self._available_hosts)

    def set_available_hosts(self, hosts: list[str]) -> None:
        self._available_hosts = list(hosts)

    @property
    def default_policy(self) -> HostAccessEntry:
        return self._default_policy

    def get_entry(self, user_id: str) -> HostAccessEntry:
        return self._users.get(user_id, self._default_policy)

    def get_allowed_hosts(self, user_id: str) -> list[str]:
        entry = self.get_entry(user_id)
        if not entry.allowed_hosts:
            return list(self._available_hosts)
        return [h for h in entry.allowed_hosts if h in self._available_hosts]

    def get_default_host(self, user_id: str) -> str:
        entry = self.get_entry(user_id)
        if entry.default_host and entry.default_host in self._available_hosts:
            return entry.default_host
        allowed = self.get_allowed_hosts(user_id)
        return allowed[0] if allowed else ""

    def is_host_allowed(self, user_id: str, host: str) -> bool:
        allowed = self.get_allowed_hosts(user_id)
        return host in allowed

    def has_user_entry(self, user_id: str) -> bool:
        return user_id in self._users

    def list_users(self) -> dict[str, dict]:
        result = {}
        for uid, entry in self._users.items():
            result[uid] = entry.to_dict()
        return result

    async def set_user(self, user_id: str, allowed_hosts: list[str], default_host: str) -> None:
        async with self._lock:
            valid_hosts = [h for h in allowed_hosts if h in self._available_hosts]
            if default_host and default_host not in valid_hosts:
                if valid_hosts:
                    default_host = valid_hosts[0]
                else:
                    default_host = ""
            self._users[user_id] = HostAccessEntry(
                allowed_hosts=valid_hosts,
                default_host=default_host,
            )
            self._save()
            log.info("Host access updated for user %s: hosts=%s, default=%s", user_id, valid_hosts, default_host)

    async def delete_user(self, user_id: str) -> bool:
        async with self._lock:
            if user_id in self._users:
                del self._users[user_id]
                self._save()
                log.info("Host access override removed for user %s", user_id)
                return True
        return False

    async def set_default_policy(self, allowed_hosts: list[str], default_host: str) -> None:
        async with self._lock:
            valid_hosts = [h for h in allowed_hosts if h in self._available_hosts]
            if default_host and default_host not in valid_hosts:
                default_host = valid_hosts[0] if valid_hosts else ""
            self._default_policy = HostAccessEntry(
                allowed_hosts=valid_hosts,
                default_host=default_host,
            )
            self._save()
            log.info("Default host access policy updated: hosts=%s, default=%s", valid_hosts, default_host)
