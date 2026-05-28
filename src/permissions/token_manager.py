from __future__ import annotations

import asyncio
import hmac
import json
import secrets
from pathlib import Path

from ..config.schema import ApiTokenIdentity
from ..odin_log import get_logger

log = get_logger("token_manager")


class ApiTokenManager:
    """Dynamic API token management with persistence and HMAC-safe lookup."""

    def __init__(self, path: str = "./data/api_tokens.json") -> None:
        self._path = Path(path)
        self._lock = asyncio.Lock()
        self._tokens: dict[str, ApiTokenIdentity] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text())
            if not isinstance(data, list):
                return
            for entry in data:
                try:
                    identity = ApiTokenIdentity(**entry)
                    if identity.user_id and identity.token:
                        self._tokens[identity.user_id] = identity
                except Exception as e:
                    log.warning("Skipping invalid token entry: %s", e)
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Failed to load API tokens: %s", e)

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = [t.model_dump() for t in self._tokens.values()]
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self._path)

    def resolve(self, raw_token: str) -> ApiTokenIdentity | None:
        """HMAC-safe lookup of a token. Returns identity or None."""
        if not raw_token:
            return None
        for identity in self._tokens.values():
            if identity.token and hmac.compare_digest(identity.token, raw_token):
                return identity
        return None

    def list_tokens(self) -> list[dict]:
        """Return all tokens with the token field masked."""
        result = []
        for t in self._tokens.values():
            d = t.model_dump()
            d["token"] = d["token"][:8] + "..." if len(d["token"]) > 8 else "***"
            d["source"] = "dynamic"
            result.append(d)
        return result

    def get(self, user_id: str) -> ApiTokenIdentity | None:
        return self._tokens.get(user_id)

    async def create_token(
        self,
        user_id: str,
        username: str = "API",
        tier: str = "admin",
        label: str = "",
        allowed_tools: list[str] | None = None,
        allowed_hosts: list[str] | None = None,
    ) -> ApiTokenIdentity:
        """Generate a new token. Returns the full identity including raw token."""
        async with self._lock:
            if user_id in self._tokens:
                raise ValueError(f"Token with user_id '{user_id}' already exists")
            token = secrets.token_urlsafe(48)
            identity = ApiTokenIdentity(
                token=token,
                user_id=user_id,
                username=username,
                tier=tier,
                label=label,
                allowed_tools=allowed_tools or [],
                allowed_hosts=allowed_hosts or [],
            )
            self._tokens[user_id] = identity
            self._save()
            log.info("Created API token for user_id=%s label=%s tier=%s", user_id, label, tier)
            return identity

    async def update_token(self, user_id: str, **kwargs) -> ApiTokenIdentity | None:
        """Update fields on an existing token (not the token value itself)."""
        async with self._lock:
            identity = self._tokens.get(user_id)
            if identity is None:
                return None
            for field in ("username", "tier", "label", "allowed_tools", "allowed_hosts"):
                if field in kwargs:
                    setattr(identity, field, kwargs[field])
            self._save()
            log.info("Updated API token for user_id=%s fields=%s", user_id, list(kwargs.keys()))
            return identity

    async def regenerate_token(self, user_id: str) -> str | None:
        """Generate a new token value for an existing identity. Returns raw token."""
        async with self._lock:
            identity = self._tokens.get(user_id)
            if identity is None:
                return None
            identity.token = secrets.token_urlsafe(48)
            self._save()
            log.info("Regenerated API token for user_id=%s", user_id)
            return identity.token

    async def delete_token(self, user_id: str) -> bool:
        """Delete a token by user_id."""
        async with self._lock:
            if user_id in self._tokens:
                del self._tokens[user_id]
                self._save()
                log.info("Deleted API token for user_id=%s", user_id)
                return True
        return False
