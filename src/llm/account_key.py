"""Opaque, installation-local account keys for provider evidence.

The context-window observer correlates a rejection with its rescue
acceptance only when both landed on the SAME account — but raw account
identifiers must never be exposed or persisted in evidence, exceptions, or
logs. This module derives a deterministic, non-reversible, installation-
local key: HMAC-SHA256 of the stable non-secret account identifier (the
ChatGPT account id — an identity label, never token material), keyed by a
random per-installation secret generated on first use.

Contract (plan of record R2 §10/§11):

- Same account + same installation ⇒ same key across restarts.
- No stable account identity, or no establishable key material ⇒ ``None``,
  and the attempt is disqualified from account-scoped clamps. Key trouble
  degrades evidence, never requests.
- The key file lives under the runtime ``data`` directory (0600, atomic
  creation); it never leaves the installation, so keys from different
  installs never correlate.
"""

from __future__ import annotations

import contextlib
import hmac
import logging
import os
import secrets
import tempfile
from hashlib import sha256
from pathlib import Path

log = logging.getLogger("odin.llm")

DEFAULT_KEY_PATH = Path("data") / "account_key.secret"

_KEY_BYTES = 32
#: Hex prefix length: 128 bits of a keyed MAC — far beyond collision concern
#: for a handful of pool accounts, short enough to read in evidence files.
_KEY_HEX_LENGTH = 32

_key_cache: dict[Path, bytes] = {}


def _load_or_create_key(key_path: Path) -> bytes | None:
    cached = _key_cache.get(key_path)
    if cached is not None:
        return cached
    try:
        material = key_path.read_bytes()
        if len(material) >= _KEY_BYTES:
            _key_cache[key_path] = material
            return material
        # Truncated/foreign content: refuse to MAC with weak material. Never
        # overwrite it either — replacing the key would silently decorrelate
        # every previously recorded observation.
        log.warning(
            "Account key material at %s is unusable (%d bytes); account-scoped "
            "evidence is disabled until it is repaired or removed.",
            key_path,
            len(material),
        )
        return None
    except FileNotFoundError:
        pass
    except OSError as exc:
        log.warning("Could not read account key %s: %s", key_path, exc)
        return None

    material = secrets.token_bytes(_KEY_BYTES)
    try:
        key_path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(
            dir=key_path.parent, prefix=f".{key_path.name}.", suffix=".tmp"
        )
        temporary = Path(temporary_name)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "wb") as stream:
                stream.write(material)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, key_path)
        except BaseException:
            with contextlib.suppress(OSError):
                temporary.unlink()
            raise
    except OSError as exc:
        log.warning(
            "Could not create account key %s: %s — account-scoped evidence "
            "is skipped this boot.",
            key_path,
            exc,
        )
        return None
    _key_cache[key_path] = material
    return material


def opaque_account_key(
    account_id: str | None, *, key_path: str | Path | None = None
) -> str | None:
    """Derive the opaque key for ``account_id``; ``None`` disqualifies.

    Total and non-raising: any failure to establish key material logs and
    returns ``None`` — evidence is forfeited, the request is never affected.
    ``key_path`` defaults to ``DEFAULT_KEY_PATH`` resolved at CALL time so
    tests can repoint the module default (a def-time bound default would
    ignore the monkeypatch and write into the working tree).
    """
    if not account_id or not str(account_id).strip():
        return None
    material = _load_or_create_key(
        Path(key_path) if key_path is not None else DEFAULT_KEY_PATH
    )
    if material is None:
        return None
    digest = hmac.new(material, str(account_id).strip().encode("utf-8"), sha256)
    return digest.hexdigest()[:_KEY_HEX_LENGTH]
