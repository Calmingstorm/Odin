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
                        log.warning("Skipping token entry: missing user_id or token_hash")
                        continue
                    tier = entry.get("tier", "admin")
                    if tier not in ("admin", "user", "guest"):
                        log.warning("Skipping token %s: invalid tier '%s'", user_id, tier)
                        continue
                    allowed_tools = entry.get("allowed_tools", [])
                    if (not isinstance(allowed_tools, list)
                            or not all(isinstance(t, str) for t in allowed_tools)):
                        log.warning(
                            "Skipping token %s: allowed_tools must be a list of strings",
                            user_id,
                        )
                        continue
                    raw_hosts = entry.get("allowed_hosts")
                    if raw_hosts is None:
                        allowed_hosts = None
                    elif isinstance(raw_hosts, list) and all(isinstance(h, str) for h in raw_hosts):
                        allowed_hosts = raw_hosts
                    else:
                        log.warning(
                            "Skipping token %s: allowed_hosts must be a list of strings or null",
                            user_id,
                        )
                        continue
                    default_host = str(entry.get("default_host", ""))
                    identity = ApiTokenIdentity(
                        token="",
                        user_id=user_id,
                        username=str(entry.get("username", "API")),
                        tier=tier,
                        label=str(entry.get("label", "")),
                        allowed_tools=allowed_tools,
                        allowed_hosts=allowed_hosts,
                        default_host=default_host,
                    )
                    self._tokens[user_id] = _StoredToken(token_hash, token_prefix, identity)
                except Exception as e:
                    log.warning("Skipping invalid token entry: %s", e)
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Failed to load API tokens: %s", e)

    def _save(self, candidate: dict[str, _StoredToken] | None = None) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = []
        for st in (self._tokens if candidate is None else candidate).values():
            if st.identity.tier not in ("admin", "user", "guest"):
                raise ValueError("Invalid token tier")
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
        default_host: str = "",
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
                allowed_hosts=allowed_hosts,
                default_host=default_host,
            )
            candidate = dict(self._tokens)
            candidate[user_id] = _StoredToken(
                token_hash=_hash_token(raw_token),
                token_prefix=raw_token[:8],
                identity=ApiTokenIdentity(**{**identity.model_dump(), "token": ""}),
            )
            self._save(candidate)
            self._tokens = candidate
            log.info("Created API token for user_id=%s label=%s tier=%s", user_id, label, tier)
            return identity

    async def update_token(self, user_id: str, **kwargs) -> ApiTokenIdentity | None:
        """Update fields on an existing token (not the token value itself)."""
        async with self._lock:
            st = self._tokens.get(user_id)
            if st is None:
                return None
            fields = st.identity.model_dump()
            for field in (
                "username",
                "tier",
                "label",
                "allowed_tools",
                "allowed_hosts",
                "default_host",
            ):
                if field in kwargs:
                    fields[field] = kwargs[field]
            identity = ApiTokenIdentity.model_validate(fields)
            candidate = dict(self._tokens)
            candidate[user_id] = _StoredToken(st.token_hash, st.token_prefix, identity)
            self._save(candidate)
            self._tokens = candidate
            log.info("Updated API token for user_id=%s fields=%s", user_id, list(kwargs.keys()))
            return identity

    async def regenerate_token(self, user_id: str) -> str | None:
        """Generate a new token value. Returns raw token (shown once)."""
        async with self._lock:
            st = self._tokens.get(user_id)
            if st is None:
                return None
            raw_token = secrets.token_urlsafe(48)
            candidate = dict(self._tokens)
            candidate[user_id] = _StoredToken(
                _hash_token(raw_token), raw_token[:8], st.identity.model_copy(deep=True),
            )
            self._save(candidate)
            self._tokens = candidate
            log.info("Regenerated API token for user_id=%s", user_id)
            return raw_token

    async def delete_token(self, user_id: str) -> bool:
        """Delete a token by user_id."""
        async with self._lock:
            if user_id in self._tokens:
                candidate = dict(self._tokens)
                del candidate[user_id]
                self._save(candidate)
                self._tokens = candidate
                log.info("Deleted API token for user_id=%s", user_id)
                return True
        return False
