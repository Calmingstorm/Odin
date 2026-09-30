"""Opt-in private WebUI session records. No bearer values belong on disk."""
from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import secrets
import stat
from pathlib import Path

from ..odin_log import get_logger
from ..permissions.persistence import write_private_atomic

log = get_logger("web.sessions")
LIFETIME = 30 * 24 * 60 * 60
WRITE_INTERVAL = 60


def session_hash(sid: str) -> str:
    return hashlib.sha256(sid.encode()).hexdigest()


def _private_read(path: Path, limit: int) -> str:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_uid != os.geteuid() or info.st_size > limit):
            raise ValueError("unsafe session state file")
        with os.fdopen(fd, "r", encoding="utf-8") as stream:
            fd = -1
            text = stream.read(limit + 1)
            if len(text) > limit:
                raise ValueError("oversized session state file")
            return text
    finally:
        if fd >= 0:
            os.close(fd)


class SessionStore:
    def __init__(self, path: Path, config, snapshot, timeout: int, now: float):
        self.path = path
        self.secret_path = path.with_suffix(".key")
        self.config = config
        self.snapshot = snapshot
        self.timeout = timeout
        self.records: dict[str, dict] = {}
        self.origins: dict[str, object] = {}
        self.secret: bytes | None = None
        self.last_write = now
        self.disabled = False
        try:
            text = _private_read(path, 8 * 1024 * 1024)
        except FileNotFoundError:
            return
        except (OSError, ValueError):
            self._fail_closed()
            return
        try:
            self.secret = self._read_secret()
            payload = json.loads(text)
            if not isinstance(payload, dict) or set(payload) != {"version", "sessions"}:
                raise ValueError("invalid session store")
            if (type(payload["version"]) is not int or payload["version"] != 1
                    or not isinstance(payload["sessions"], dict)):
                raise ValueError("invalid session store")
            for key, record in payload["sessions"].items():
                self._check_record(key, record, now)
            for key, record in payload["sessions"].items():
                identity = None if self.expired(record, now) else self.identity(record)
                if identity is not None:
                    self.records[key] = record
                    if record["auth_source"] == "dynamic":
                        self.origins[key] = identity
            if len(self.records) != len(payload["sessions"]):
                try:
                    self.flush(now)
                except OSError:
                    try:
                        self.invalidate()
                    except OSError:
                        log.warning(
                            "WebUI durable session revocation failed; storage repair required",
                        )
                    raise
        except (OSError, ValueError, TypeError, KeyError, OverflowError, RecursionError):
            self._fail_closed()

    def _fail_closed(self):
        self.records.clear()
        self.origins.clear()
        self.disabled = True
        log.warning("WebUI session store unavailable or corrupt; no sessions restored")

    def _read_secret(self) -> bytes:
        text = _private_read(self.secret_path, 128)
        if len(text) != 64 or any(c not in "0123456789abcdef" for c in text):
            raise ValueError("invalid session secret")
        return bytes.fromhex(text)

    def _ensure_secret(self):
        if self.secret is not None:
            return
        try:
            self.secret = self._read_secret()
        except FileNotFoundError:
            self.secret_path.parent.mkdir(parents=True, exist_ok=True)
            candidate = secrets.token_bytes(32)
            try:
                fd = os.open(self.secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except FileExistsError:
                self.secret = self._read_secret()
            else:
                with os.fdopen(fd, "w", encoding="ascii") as stream:
                    stream.write(candidate.hex())
                    stream.flush()
                    os.fsync(stream.fileno())
                self.secret = candidate
                directory = os.open(self.secret_path.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)

    @staticmethod
    def _check_record(key, record, now):
        def digest(value):
            return (isinstance(value, str) and len(value) == 64
                    and all(c in "0123456789abcdef" for c in value))

        if not digest(key) or not isinstance(record, dict):
            raise ValueError("invalid session record")
        source = record.get("auth_source")
        binding = "issuer_fingerprint" if source == "dynamic" else "credential_digest"
        if (source not in {"static", "legacy", "dynamic"}
                or set(record) != {"user_id", "auth_source", "created_at", "last_activity", binding}
                or not isinstance(record["user_id"], str) or not record["user_id"]
                or not digest(record[binding])):
            raise ValueError("invalid session record")
        for field in ("created_at", "last_activity"):
            value = record[field]
            if (type(value) not in (float, int) or not math.isfinite(value)
                    or value < 0 or value > now):
                raise ValueError("invalid session time")
        if record["last_activity"] < record["created_at"]:
            raise ValueError("invalid session time")

    def digest(self, credential: str) -> str:
        if self.secret is None:
            raise ValueError("session key unavailable")
        return hmac.new(self.secret, credential.encode(), hashlib.sha256).hexdigest()

    def identity(self, record):
        from ..config.schema import ApiTokenIdentity

        source = record["auth_source"]
        if source == "dynamic":
            snapshot = self.snapshot()
            if snapshot is None:
                return None
            return snapshot.restore_identity(record["user_id"], record["issuer_fingerprint"])
        config = self.config()
        if source == "legacy":
            if (record["user_id"] == "api-admin" and config.api_token
                    and hmac.compare_digest(self.digest(config.api_token),
                                            record["credential_digest"])):
                return ApiTokenIdentity(token=config.api_token, user_id="api-admin",
                                        username="Admin", tier="admin", label="default")
            return None
        return next((entry.model_copy(deep=True) for entry in config.api_tokens
                     if entry.user_id == record["user_id"] and entry.token
                     and entry.tier in {"admin", "user", "guest"}
                     and hmac.compare_digest(self.digest(entry.token),
                                             record["credential_digest"])), None)

    def expired(self, record, now):
        return (now < record["last_activity"] or now < record["created_at"]
                or now - record["created_at"] >= LIFETIME
                or (self.timeout > 0 and now - record["last_activity"] >= self.timeout))

    def add(self, sid, identity, source, now):
        if self.disabled or identity is None or source not in {"static", "legacy", "dynamic"}:
            return
        self._ensure_secret()
        record = {"user_id": identity.user_id, "auth_source": source,
                  "created_at": now, "last_activity": now}
        if source == "dynamic":
            snapshot = self.snapshot()
            fingerprint = snapshot.issuer_fingerprint(identity) if snapshot else None
            if fingerprint is None:
                return
            record["issuer_fingerprint"] = fingerprint
        else:
            record["credential_digest"] = self.digest(identity.token)
        self.records[session_hash(sid)] = record
        self.flush(now)

    def flush(self, now):
        write_private_atomic(self.path, json.dumps({"version": 1, "sessions": self.records}))
        self.last_write = now

    def invalidate(self):
        """Fence stale records after an atomic publication failure.

        Truncating the existing key requires no new blocks/directory entries.
        If even this fails, callers report failure: durable logout is impossible
        on an entirely unwritable filesystem.
        """
        fd = os.open(self.secret_path, os.O_WRONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid():
                raise OSError("unsafe session key")
            os.ftruncate(fd, 0)
            os.fsync(fd)
        finally:
            os.close(fd)
