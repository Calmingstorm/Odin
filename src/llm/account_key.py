"""Opaque, installation-local account keys for provider evidence.

The context-window observer correlates a rejection with its rescue
acceptance only when both landed on the SAME account — but raw account
identifiers must never be exposed or persisted in evidence, exceptions, or
logs. This module derives a deterministic, non-reversible, installation-
local key: HMAC-SHA256 of the stable non-secret account identifier (the
ChatGPT account id — an identity label, never token material), keyed by a
random per-installation secret established on first use.

Contract (plan of record R2 §10/§11, hardened in PR #272 review round 1):

- Same account + same installation ⇒ same key across restarts AND across
  concurrent processes: first use runs an exclusive-winner protocol
  (temp-file write + fsync, then an atomic hard-link publication that fails
  if a winner already exists; losers read and use the winner's material, so
  every process converges on the one durable secret).
- Persisted material is accepted only on the exact generated shape: a
  regular file (final-component symlinks refused), owned by this process's
  uid, mode 0600, exactly 32 bytes. Anything else fails CLOSED — a warning,
  ``None``, and the questionable material left untouched (replacing it
  would silently decorrelate every previously recorded observation).
- No stable account identity — including an identifier that cannot be
  UTF-8 encoded, e.g. an unpaired surrogate smuggled through credentials
  JSON — ⇒ ``None``, and the attempt is disqualified from account-scoped
  evidence. Key trouble degrades evidence, never requests: the public
  function is total and non-raising by construction.
- The key file lives under the runtime ``data`` directory; it never leaves
  the installation, so keys from different installs never correlate.
"""

from __future__ import annotations

import contextlib
import hmac
import logging
import os
import secrets
import stat as stat_module
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


def _read_established_key(key_path: Path) -> bytes | None:
    """Read existing material under the strict generated-shape contract.

    Returns the 32 key bytes, or ``None`` for both "missing" and "present
    but refused" (each refusal logs its specific reason). Never modifies
    the file: questionable material is evidence about the installation and
    replacing it would decorrelate all prior observations.
    """
    try:
        fd = os.open(key_path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    except OSError as exc:
        # ELOOP here means the final component is a symlink — refused.
        log.warning("Refusing account key %s: %s", key_path, exc)
        return None
    try:
        info = os.fstat(fd)
        if not stat_module.S_ISREG(info.st_mode):
            log.warning("Refusing account key %s: not a regular file", key_path)
            return None
        if info.st_uid != os.getuid():
            log.warning("Refusing account key %s: not owned by this user", key_path)
            return None
        if stat_module.S_IMODE(info.st_mode) != 0o600:
            log.warning(
                "Refusing account key %s: mode %o is not 0600 — fix the "
                "permissions to re-enable account-scoped evidence.",
                key_path,
                stat_module.S_IMODE(info.st_mode),
            )
            return None
        material = os.read(fd, _KEY_BYTES + 1)
        if len(material) != _KEY_BYTES:
            log.warning(
                "Refusing account key %s: %d bytes is not the generated "
                "%d-byte shape.",
                key_path,
                len(material),
                _KEY_BYTES,
            )
            return None
        return material
    except OSError as exc:
        log.warning("Could not read account key %s: %s", key_path, exc)
        return None
    finally:
        with contextlib.suppress(OSError):
            os.close(fd)


def _fsync_parent(key_path: Path) -> None:
    """Best-effort directory fsync so the publication survives a crash."""
    with contextlib.suppress(OSError):
        directory_fd = os.open(key_path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)


def _create_key(key_path: Path) -> bytes | None:
    """Establish the installation key with an exclusive-winner protocol.

    The complete material is written and fsynced to a private temp file,
    then published with ``os.link`` — atomic and fail-if-exists, so exactly
    one process wins. Losers converge by reading the winner's file. A crash
    can only ever leave a stray temp file, never a partial key.
    """
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
            try:
                os.link(temporary, key_path)
            except FileExistsError:
                # Another process won the race: use ITS material so every
                # process MACs with the one durable secret.
                return _read_established_key(key_path)
            _fsync_parent(key_path)
            return material
        finally:
            with contextlib.suppress(OSError):
                temporary.unlink()
    except OSError as exc:
        log.warning(
            "Could not create account key %s: %s — account-scoped evidence "
            "is skipped this boot.",
            key_path,
            exc,
        )
        return None


def _load_or_create_key(key_path: Path) -> bytes | None:
    cached = _key_cache.get(key_path)
    if cached is not None:
        return cached
    material = _read_established_key(key_path)
    if material is None and not key_path.exists() and not key_path.is_symlink():
        material = _create_key(key_path)
    if material is not None:
        _key_cache[key_path] = material
    return material


def opaque_account_key(
    account_id: str | None, *, key_path: str | Path | None = None
) -> str | None:
    """Derive the opaque key for ``account_id``; ``None`` disqualifies.

    Total and non-raising: any failure to establish key material or to
    normalize the identity logs and returns ``None`` — evidence is
    forfeited, the request is never affected. ``key_path`` defaults to
    ``DEFAULT_KEY_PATH`` resolved at CALL time so tests can repoint the
    module default (a def-time bound default would ignore the monkeypatch
    and write into the working tree).
    """
    try:
        if not account_id or not str(account_id).strip():
            return None
        try:
            identity = str(account_id).strip().encode("utf-8")
        except UnicodeError:
            # E.g. an unpaired surrogate accepted by json.loads: there is no
            # stable canonical encoding, so there is no stable identity.
            log.warning(
                "Account identifier is not UTF-8 encodable; disqualifying "
                "it from account-scoped evidence."
            )
            return None
        material = _load_or_create_key(
            Path(key_path) if key_path is not None else DEFAULT_KEY_PATH
        )
        if material is None:
            return None
        return hmac.new(material, identity, sha256).hexdigest()[:_KEY_HEX_LENGTH]
    except Exception:  # noqa: BLE001 — the totality contract outranks specificity
        log.exception("Account key derivation failed; evidence forfeited")
        return None
