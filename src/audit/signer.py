from __future__ import annotations

import hashlib
import hmac
import json

from ..odin_log import get_logger

log = get_logger("audit.signer")

GENESIS_HASH = "0" * 64


class AuditSigner:
    """HMAC-SHA256 chain signer for append-only audit log integrity.

    Each entry gets an ``_hmac`` field computed over the canonical JSON of the
    entry concatenated with the previous entry's HMAC.  Verification walks the
    file from top to bottom and checks that every link in the chain is valid.
    """

    def __init__(self, key: str | bytes) -> None:
        self._key = key.encode() if isinstance(key, str) else key
        self._prev_hmac: str = GENESIS_HASH

    @property
    def prev_hmac(self) -> str:
        return self._prev_hmac

    @prev_hmac.setter
    def prev_hmac(self, value: str) -> None:
        self._prev_hmac = value

    def sign(self, entry: dict) -> dict:
        """Add ``_prev_hmac`` and ``_hmac`` fields to *entry* (mutates in place)."""
        self.prepare(entry)
        self.commit(entry)
        return entry

    def prepare(self, entry: dict) -> dict:
        """Prepare a signature without publishing the predecessor."""
        entry["_prev_hmac"] = self._prev_hmac
        canonical = _canonical(entry)
        entry["_hmac"] = self._compute(canonical)
        return entry

    def commit(self, entry: dict) -> None:
        """Publish a prepared signature only after its append succeeds."""
        self._prev_hmac = entry["_hmac"]

    def verify_entry(self, entry: dict, expected_prev: str) -> bool:
        """Return True if a single entry's HMAC is valid given *expected_prev*."""
        stored_hmac = entry.get("_hmac")
        stored_prev = entry.get("_prev_hmac")
        if not stored_hmac or stored_prev is None:
            return False
        if not hmac.compare_digest(stored_prev, expected_prev):
            return False
        check = dict(entry)
        del check["_hmac"]
        return hmac.compare_digest(stored_hmac, self._compute(_canonical(check)))

    def _compute(self, data: str) -> str:
        return hmac.new(self._key, data.encode(), hashlib.sha256).hexdigest()


def _canonical(entry: dict) -> str:
    """Deterministic JSON: sorted keys, no whitespace, ``_hmac`` excluded."""
    filtered = {k: v for k, v in entry.items() if k != "_hmac"}
    return json.dumps(filtered, sort_keys=True, default=str, separators=(",", ":"))


REASON_INVALID_JSON = "invalid_json"
REASON_NON_OBJECT = "non_object"
REASON_UNSIGNED_AFTER_SIGNED = "unsigned_after_signed"
REASON_HMAC_MISMATCH = "hmac_mismatch"


def verify_segment(handle, size: int, key: str | bytes) -> dict:
    """Verify a single bounded file snapshot from GENESIS, one line at a time.

    The bound is captured while no append is in flight, so a later append is
    neither scanned nor mistaken for a torn audit entry. Physical line numbers
    include blank lines. This synchronous function belongs in a worker thread.
    """
    signer = AuditSigner(key)
    prev = GENESIS_HASH
    total = verified = unsigned_prefix = 0
    remaining = size
    lineno = 0

    def failure(line: int, reason: str, message: str) -> dict:
        return {
            "valid": False, "total": total, "verified": verified,
            "unsigned_prefix": unsigned_prefix, "first_bad": line,
            "reason": reason, "error": f"Line {line}: {message}",
        }

    while remaining > 0:
        raw = handle.readline(remaining)
        if not raw:
            break
        remaining -= len(raw)
        lineno += 1
        if not raw.strip():
            continue
        total += 1
        try:
            entry = json.loads(raw)
        except ValueError:  # Includes invalid UTF-8 from bytes input.
            return failure(lineno, REASON_INVALID_JSON, "invalid JSON")
        if not isinstance(entry, dict):
            return failure(lineno, REASON_NON_OBJECT, "non-object audit entry")
        if "_hmac" not in entry:
            # verified == 0 ⟺ still in the pre-enablement prefix.
            if verified == 0:
                unsigned_prefix += 1
                continue
            return failure(
                lineno, REASON_UNSIGNED_AFTER_SIGNED,
                "missing _hmac field (unsigned entry after chain began)",
            )
        try:
            valid = signer.verify_entry(entry, prev)
        except (TypeError, ValueError):
            valid = False
        if not valid:
            return failure(
                lineno, REASON_HMAC_MISMATCH,
                "HMAC verification failed (tampered or reordered)",
            )
        prev = entry["_hmac"]
        verified += 1
    return {
        "valid": True, "total": total, "verified": verified,
        "unsigned_prefix": unsigned_prefix, "first_bad": None,
        "reason": None, "error": None,
    }


async def verify_log(path, key: str) -> dict:
    """Verify the full HMAC chain of an audit log file.

    Entries written before signing was enabled (no ``_hmac`` field) are
    tolerated as an *unsigned prefix*: counted in ``unsigned_prefix`` and
    skipped, with the chain verified strictly from the first signed entry.
    Enabling a key does not retroactively sign history — the chain simply
    begins at GENESIS_HASH at the first entry written after enablement, so
    tamper evidence covers the signed suffix only. An unsigned entry
    appearing AFTER the first signed one still fails verification: once a
    chain exists, gaps in it are tamper evidence.

    Returns a dict with ``valid`` (bool), ``total`` (int), ``verified``
    (signed entries verified, int), ``unsigned_prefix`` (int), ``first_bad``
    (int or None — 1-indexed line number), and ``error`` (str or None).
    """
    import asyncio
    import os
    from pathlib import Path

    p = Path(path)
    if not p.exists():
        return {
            "valid": True,
            "total": 0,
            "verified": 0,
            "unsigned_prefix": 0,
            "first_bad": None,
            "error": None,
        }

    def _verify_file() -> dict:
        with open(p, "rb") as handle:
            return verify_segment(handle, os.fstat(handle.fileno()).st_size, key)

    try:
        result = await asyncio.to_thread(_verify_file)
    except Exception as exc:
        return {
            "valid": False, "total": 0, "verified": 0,
            "unsigned_prefix": 0, "first_bad": None, "error": str(exc),
        }
    result.pop("reason", None)
    return result
