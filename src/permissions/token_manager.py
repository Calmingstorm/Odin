from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import secrets
from pathlib import Path
from typing import TypeAlias

from ..config.persistence import config_transaction
from ..config.schema import ApiTokenIdentity
from ..odin_log import get_logger
from ..web.bootstrap_policy import CredentialInventory
from .persistence import write_private_atomic

log = get_logger("token_manager")


_StoreSignature: TypeAlias = tuple[int, int, int, int, int] | None
_VALID_TIERS = frozenset(("admin", "user", "guest"))
_VALID_STATUSES = frozenset(("missing", "valid", "malformed", "unreadable"))


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate token store key")
        result[key] = value
    return result


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
        self._store_status = "missing"
        self._store_signature: _StoreSignature = None
        self._last_credential_guard = None
        self._refresh_store()

    def _stat_signature(self) -> _StoreSignature:
        """Return a cheap change signature without reading token contents."""
        try:
            stat = self._path.stat()
        except FileNotFoundError:
            return None
        return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)

    def _invalidate_store(self, status: str, signature: _StoreSignature = None) -> None:
        """Atomically make a bad external store unusable to all callers."""
        if status not in _VALID_STATUSES:
            raise ValueError("invalid token store status")
        self._tokens = {}
        self._store_status = status
        self._store_signature = signature

    @staticmethod
    def _parse_store(data: object) -> dict[str, _StoredToken]:
        """Validate the complete store before publishing any parsed entry.

        Token files are an authentication boundary, not a best-effort cache.
        One malformed or duplicate record therefore invalidates the whole file.
        """
        if not isinstance(data, list):
            raise ValueError("token store root must be a list")

        parsed: dict[str, _StoredToken] = {}
        hashes: set[str] = set()
        for entry in data:
            if not isinstance(entry, dict):
                raise ValueError("token store entry must be an object")

            user_id = entry.get("user_id")
            token_hash = entry.get("token_hash")
            token_prefix = entry.get("token_prefix", "")
            tier = entry.get("tier", "admin")
            allowed_tools = entry.get("allowed_tools", [])
            raw_hosts = entry.get("allowed_hosts")
            username = entry.get("username", "API")
            label = entry.get("label", "")
            default_host = entry.get("default_host", "")

            if (
                not isinstance(user_id, str)
                or not user_id
                or not isinstance(token_hash, str)
                or len(token_hash) != 64
                or any(character not in "0123456789abcdef" for character in token_hash)
                or not isinstance(token_prefix, str)
                or not isinstance(tier, str)
                or tier not in _VALID_TIERS
                or not isinstance(username, str)
                or not isinstance(label, str)
                or not isinstance(default_host, str)
                or not isinstance(allowed_tools, list)
                or not all(isinstance(tool, str) for tool in allowed_tools)
            ):
                raise ValueError("invalid token store entry")
            if raw_hosts is None:
                allowed_hosts = None
            elif isinstance(raw_hosts, list) and all(isinstance(host, str) for host in raw_hosts):
                allowed_hosts = raw_hosts
            else:
                raise ValueError("invalid token store entry")
            if user_id in parsed or token_hash in hashes:
                raise ValueError("duplicate token store entry")

            identity = ApiTokenIdentity(
                token="",
                user_id=user_id,
                username=username,
                tier=tier,
                label=label,
                allowed_tools=allowed_tools,
                allowed_hosts=allowed_hosts,
                default_host=default_host,
            )
            parsed[user_id] = _StoredToken(token_hash, token_prefix, identity)
            hashes.add(token_hash)
        return parsed

    def _refresh_store(self) -> None:
        """Reload only after an external store change and fail closed on error."""
        try:
            signature = self._stat_signature()
        except OSError:
            self._invalidate_store("unreadable")
            log.warning("API token store is unavailable")
            return
        if signature == self._store_signature:
            return
        if signature is None:
            if self._store_status != "missing":
                self._invalidate_store("unreadable")
                log.warning("Previously observed API token store is missing")
                return
            self._tokens = {}
            self._store_status = "missing"
            self._store_signature = None
            return
        try:
            parsed = self._parse_store(json.loads(
                self._path.read_text(), object_pairs_hook=_unique_object
            ))
            # A non-atomic external writer may have changed the file while it
            # was read. Do not authenticate against an uncertain snapshot.
            if self._stat_signature() != signature:
                raise OSError("token store changed during read")
        except json.JSONDecodeError:
            self._invalidate_store("malformed", signature)
            log.warning("API token store is malformed")
            return
        except OSError:
            self._invalidate_store("unreadable", signature)
            log.warning("API token store is unavailable")
            return
        except (TypeError, ValueError):
            self._invalidate_store("malformed", signature)
            log.warning("API token store is malformed")
            return
        self._tokens = parsed
        self._store_status = "valid"
        self._store_signature = signature

    def _require_writable_store(self) -> None:
        self._refresh_store()
        if self._store_status in {"malformed", "unreadable"}:
            raise RuntimeError("API token store must be repaired before credentials can change")

    def _save(self, candidate: dict[str, _StoredToken] | None = None) -> bool:
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
        self.durability_degraded = not write_private_atomic(self._path, json.dumps(data, indent=2))
        self._store_signature = self._stat_signature()
        self._store_status = "valid"
        if self.durability_degraded:
            log.error("API token store durability is degraded after publishing credentials")
        # False means replacement committed but its directory fsync failed.
        # This is degraded durability, not a rollback.
        return not self.durability_degraded

    @property
    def credential_inventory(self) -> CredentialInventory:
        """Validated non-secret dynamic count. Bad stores count as zero."""
        self._refresh_store()
        return CredentialInventory(
            dynamic_usable=len(self._tokens) if self._store_status == "valid" else 0
        )

    @property
    def credential_store_status(self) -> str:
        """Current non-secret store state for authentication policy."""
        self._refresh_store()
        return self._store_status

    @property
    def credential_store_auth_required(self) -> bool:
        """Whether a corrupt dynamic store must deny unauthenticated access."""
        self._refresh_store()
        return self._store_status in {"malformed", "unreadable"}

    @property
    def dynamic_auth_required(self) -> bool:
        """Whether this validated dynamic store has usable credentials."""
        self._refresh_store()
        return self._store_status == "valid" and bool(self._tokens)

    def set_last_credential_guard(self, guard) -> None:
        self._last_credential_guard = guard

    async def _may_publish_candidate(self, candidate: dict[str, _StoredToken]) -> bool:
        if self._last_credential_guard is None:
            return True
        result = self._last_credential_guard(CredentialInventory(dynamic_usable=len(candidate)))
        if hasattr(result, "__await__"):
            result = await result
        if type(result) is not bool:
            raise TypeError("last credential guard must return bool")
        return result

    def resolve(self, raw_token: str) -> ApiTokenIdentity | None:
        """HMAC-safe lookup by hashing the incoming token and comparing."""
        self._refresh_store()
        if self._store_status != "valid":
            return None
        if not raw_token:
            return None
        incoming_hash = _hash_token(raw_token)
        for st in self._tokens.values():
            if hmac.compare_digest(st.token_hash, incoming_hash):
                return st.identity
        return None

    def list_tokens(self) -> list[dict]:
        """Return all tokens with masked prefix for display."""
        self._refresh_store()
        if self._store_status != "valid":
            return []
        result = []
        for st in self._tokens.values():
            d = st.identity.model_dump()
            d["token"] = st.token_prefix + "..."
            d["source"] = "dynamic"
            result.append(d)
        return result

    def get(self, user_id: str) -> ApiTokenIdentity | None:
        self._refresh_store()
        if self._store_status != "valid":
            return None
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
        async with config_transaction(), self._lock:
            self._require_writable_store()
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
        async with config_transaction(), self._lock:
            self._require_writable_store()
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
        async with config_transaction(), self._lock:
            self._require_writable_store()
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
        async with config_transaction(), self._lock:
            self._require_writable_store()
            if user_id in self._tokens:
                candidate = dict(self._tokens)
                del candidate[user_id]
                if not await self._may_publish_candidate(candidate):
                    raise PermissionError(
                        "cannot remove the last usable credential from a non-loopback listener"
                    )
                self._save(candidate)
                self._tokens = candidate
                log.info("Deleted API token for user_id=%s", user_id)
                return True
        return False
