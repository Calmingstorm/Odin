from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import secrets
from pathlib import Path

from ..config.schema import ApiTokenIdentity
from ..odin_log import get_logger

log = get_logger("token_manager")


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class _StoredToken:
    __slots__ = ("token_hash", "token_prefix", "identity")

    def __init__(self, token_hash: str, token_prefix: str, identity: ApiTokenIdentity) -> None:
        self.token_hash = token_hash
        self.token_prefix = token_prefix
        self.identity = identity


class ApiTokenManager:
    """Dynamic API token management with hashed storage and HMAC-safe lookup."""

    def __init__(self, path: str = "./data/api_tokens.json") -> None:
        self._path = Path(path)
        self._lock = asyncio.Lock()
        self._tokens: dict[str, _StoredToken] = {}
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
                    user_id = entry.get("user_id", "")
                    token_hash = entry.get("token_hash", "")
                    token_prefix = entry.get("token_prefix", "")
                    if not user_id or not token_hash:
                        continue
                    identity = ApiTokenIdentity(
                        token="",
                        user_id=user_id,
                        username=entry.get("username", "API"),
                        tier=entry.get("tier", "admin"),
                        label=entry.get("label", ""),
                        allowed_tools=entry.get("allowed_tools", []),
                        allowed_hosts=entry.get("allowed_hosts", []),
                    )
                    self._tokens[user_id] = _StoredToken(token_hash, token_prefix, identity)
                except Exception as e:
                    log.warning("Skipping invalid token entry: %s", e)
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Failed to load API tokens: %s", e)

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = []
        for st in self._tokens.values():
            d = st.identity.model_dump()
            del d["token"]
            d["token_hash"] = st.token_hash
            d["token_prefix"] = st.token_prefix
            data.append(d)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(self._path)

    def resolve(self, raw_token: str) -> ApiTokenIdentity | None:
        """HMAC-safe lookup by hashing the incoming token and comparing."""
        if not raw_token:
            return None
        incoming_hash = _hash_token(raw_token)
        for st in self._tokens.values():
            if hmac.compare_digest(st.token_hash, incoming_hash):
                return st.identity
        return None

    def list_tokens(self) -> list[dict]:
        """Return all tokens with masked prefix for display."""
        result = []
        for st in self._tokens.values():
            d = st.identity.model_dump()
            d["token"] = st.token_prefix + "..."
            d["source"] = "dynamic"
            result.append(d)
        return result

    def get(self, user_id: str) -> ApiTokenIdentity | None:
        st = self._tokens.get(user_id)
        return st.identity if st else None

    async def create_token(
        self,
        user_id: str,
        username: str = "API",
        tier: str = "admin",
        label: str = "",
        allowed_tools: list[str] | None = None,
        allowed_hosts: list[str] | None = None,
    ) -> ApiTokenIdentity:
        """Generate a new token. Returns identity with raw token (shown once)."""
        async with self._lock:
            if user_id in self._tokens:
                raise ValueError(f"Token with user_id '{user_id}' already exists")
            raw_token = secrets.token_urlsafe(48)
            identity = ApiTokenIdentity(
                token=raw_token,
                user_id=user_id,
                username=username,
                tier=tier,
                label=label,
                allowed_tools=allowed_tools or [],
                allowed_hosts=allowed_hosts or [],
            )
            self._tokens[user_id] = _StoredToken(
                token_hash=_hash_token(raw_token),
                token_prefix=raw_token[:8],
                identity=ApiTokenIdentity(**{**identity.model_dump(), "token": ""}),
            )
            self._save()
            log.info("Created API token for user_id=%s label=%s tier=%s", user_id, label, tier)
            return identity

    async def update_token(self, user_id: str, **kwargs) -> ApiTokenIdentity | None:
        """Update fields on an existing token (not the token value itself)."""
        async with self._lock:
            st = self._tokens.get(user_id)
            if st is None:
                return None
            for field in ("username", "tier", "label", "allowed_tools", "allowed_hosts"):
                if field in kwargs:
                    setattr(st.identity, field, kwargs[field])
            self._save()
            log.info("Updated API token for user_id=%s fields=%s", user_id, list(kwargs.keys()))
            return st.identity

    async def regenerate_token(self, user_id: str) -> str | None:
        """Generate a new token value. Returns raw token (shown once)."""
        async with self._lock:
            st = self._tokens.get(user_id)
            if st is None:
                return None
            raw_token = secrets.token_urlsafe(48)
            st.token_hash = _hash_token(raw_token)
            st.token_prefix = raw_token[:8]
            self._save()
            log.info("Regenerated API token for user_id=%s", user_id)
            return raw_token

    async def delete_token(self, user_id: str) -> bool:
        """Delete a token by user_id."""
        async with self._lock:
            if user_id in self._tokens:
                del self._tokens[user_id]
                self._save()
                log.info("Deleted API token for user_id=%s", user_id)
                return True
        return False
