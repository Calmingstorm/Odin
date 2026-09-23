from __future__ import annotations

import asyncio
import contextvars
import threading
from pathlib import Path

from ..json_store import StoreCorruptError, load_json_store, load_json_store_safe
from ..odin_log import get_logger
from .persistence import write_private_atomic

log = get_logger("permissions")

VALID_TIERS = ("admin", "user", "guest")


def _validate_overrides(data: dict) -> None:
    for user_id, tier in data.items():
        if not isinstance(user_id, str) or not isinstance(tier, str):
            raise StoreCorruptError(
                "permissions.json must map string user IDs to string permission tiers"
            )


def _valid_overrides(data: dict) -> dict[str, str]:
    """Keep legacy effective tiers for unknown names; never publish them as tiers."""
    return {user_id: tier for user_id, tier in data.items() if tier in VALID_TIERS}


_request_tier: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_request_tier",
    default=None,
)

# Tools available to the "user" tier — read-only monitoring and search.
# Everything else is admin-only.
# NOTE: run_command was removed — it is arbitrary shell execution, not
# "read-only monitoring", and it sat here under that comment. With the RBAC
# gate now wired into ToolExecutor, leaving it would grant every user-tier
# caller a shell (subject to host_access/governor, but still).
USER_TIER_TOOLS = frozenset(
    {
        "get_tool_output",
        "search_history",
        "search_knowledge",
        "web_search",
        "fetch_url",
        "list_schedules",
        "list_tasks",
        "list_skills",
        "list_knowledge",
        "manage_list",
        "parse_time",
    }
)


class PermissionManager:
    """Manages per-user permission tiers with config defaults and runtime overrides."""

    def __init__(
        self,
        config_tiers: dict[str, str],
        default_tier: str = "user",
        overrides_path: str = "./data/permissions.json",
    ) -> None:
        self._config_tiers = dict(config_tiers)
        self._default_tier = default_tier if default_tier in VALID_TIERS else "user"
        self._overrides_path = Path(overrides_path)
        self._overrides: dict[str, str] = {}
        self._invalid_overrides: dict[str, str] = {}
        self._store_corrupt = False
        self._lock = asyncio.Lock()
        self._publication_lock = threading.RLock()
        self._load_overrides()

    def _load_overrides(self) -> None:
        data, ok = load_json_store_safe(
            self._overrides_path,
            validate=_validate_overrides,
            what="permission overrides",
        )
        self._overrides = _valid_overrides(data)
        self._invalid_overrides = {
            uid: tier for uid, tier in data.items() if tier not in VALID_TIERS
        }
        if self._invalid_overrides:
            log.warning(
                "Permission overrides contain %d unrecognized tier(s); "
                "entries retained for operator repair",
                len(self._invalid_overrides),
            )
        self._store_corrupt = not ok

    def _load_overrides_for_write(self) -> dict[str, str]:
        """Strictly reload ALL entries; never erase unknown tiers on unrelated writes."""
        return load_json_store(self._overrides_path, validate=_validate_overrides)

    @property
    def invalid_overrides(self) -> dict[str, str]:
        """Unrecognized tiers, for operator diagnostics (not effective policy)."""
        return dict(self._invalid_overrides)

    def _publish_overrides(self, candidate: dict[str, str]) -> None:
        self._save_overrides(candidate)
        self._overrides = _valid_overrides(candidate)
        self._invalid_overrides = {
            uid: tier for uid, tier in candidate.items() if tier not in VALID_TIERS
        }
        self._store_corrupt = False

    def _save_overrides(self, candidate: dict[str, str] | None = None) -> None:
        import json

        self.durability_degraded = not write_private_atomic(
            self._overrides_path,
            json.dumps(self._overrides if candidate is None else candidate, indent=2),
        )

    @staticmethod
    def set_request_tier(tier: str) -> contextvars.Token:
        """Set a request-scoped tier override (concurrency-safe via contextvars)."""
        return _request_tier.set(tier if tier in VALID_TIERS else None)

    @staticmethod
    def reset_request_tier(token: contextvars.Token) -> None:
        """Reset the request-scoped tier override."""
        _request_tier.reset(token)

    def get_tier(self, user_id: str) -> str:
        """Get the permission tier. Request-scoped > overrides > config > default."""
        req_tier = _request_tier.get()
        if req_tier is not None:
            return req_tier
        if self._store_corrupt:
            # A damaged override may contain a demotion. Falling through to an
            # admin default would turn store corruption into privilege gain.
            return "guest"
        if user_id in self._overrides:
            return self._overrides[user_id]
        return self._config_tiers.get(user_id, self._default_tier)

    def set_tier(self, user_id: str, tier: str) -> None:
        """Set a user's permission tier (persisted as runtime override)."""
        if tier not in VALID_TIERS:
            raise ValueError(f"Invalid tier '{tier}'. Must be one of: {', '.join(VALID_TIERS)}")
        with self._publication_lock:
            current = self._load_overrides_for_write()
            candidate = {**current, user_id: tier}
            self._publish_overrides(candidate)
        log.info("Permission tier for user %s set to %s", user_id, tier)

    async def async_set_tier(self, user_id: str, tier: str) -> None:
        """Async-safe version of set_tier with locking."""
        async with self._lock:
            self.set_tier(user_id, tier)

    async def async_delete_tier(self, user_id: str) -> bool:
        """Remove a user's permission override with locking. Returns True if it existed."""
        async with self._lock:
            with self._publication_lock:
                current = self._load_overrides_for_write()
                if user_id in current:
                    candidate = dict(current)
                    del candidate[user_id]
                    self._publish_overrides(candidate)
                    return True
                self._overrides = _valid_overrides(current)
                self._invalid_overrides = {
                    uid: tier for uid, tier in current.items() if tier not in VALID_TIERS
                }
                self._store_corrupt = False
        return False

    def filter_tools(self, user_id: str, tools: list[dict]) -> list[dict] | None:
        """Filter tool list based on user's tier.

        Returns None for guest tier (no tools at all).
        Returns full list for admin, filtered list for user tier.
        """
        tier = self.get_tier(user_id)
        if tier == "admin":
            return tools
        if tier == "guest":
            return None
        # User tier: only allowlisted read-only tools
        return [t for t in tools if t["name"] in USER_TIER_TOOLS]

    def allowed_tool_names(self, user_id: str) -> set[str] | None:
        """Return the set of tool names this user can access.

        Returns None for admin (all tools allowed) or an empty set for guest.
        """
        tier = self.get_tier(user_id)
        if tier == "admin":
            return None  # no restriction
        if tier == "guest":
            return set()
        return set(USER_TIER_TOOLS)

    def is_admin(self, user_id: str) -> bool:
        return self.get_tier(user_id) == "admin"

    def is_guest(self, user_id: str) -> bool:
        return self.get_tier(user_id) == "guest"
