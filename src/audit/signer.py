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

    def __init__(self, key: str) -> None:
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
        entry["_prev_hmac"] = self._prev_hmac
        canonical = _canonical(entry)
        entry["_hmac"] = self._compute(canonical)
        self._prev_hmac = entry["_hmac"]
        return entry

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
    import aiofiles
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

    signer = AuditSigner(key)
    prev = GENESIS_HASH
    total = 0
    verified = 0
    unsigned_prefix = 0

    try:
        async with aiofiles.open(p, "r") as f:
            lines = await f.readlines()
    except Exception as exc:
        return {
            "valid": False,
            "total": 0,
            "verified": 0,
            "unsigned_prefix": 0,
            "first_bad": None,
            "error": str(exc),
        }

    for i, line in enumerate(lines, 1):
        line = line.strip()
        if not line:
            continue
        total += 1

        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            return {
                "valid": False,
                "total": total,
                "verified": verified,
                "unsigned_prefix": unsigned_prefix,
                "first_bad": i,
                "error": f"Line {i}: invalid JSON",
            }

        if "_hmac" not in entry:
            # verified == 0 ⟺ no signed entry seen yet (a signed entry that
            # fails returns immediately), i.e. still in the pre-enablement
            # prefix.
            if verified == 0:
                unsigned_prefix += 1
                continue
            return {
                "valid": False,
                "total": total,
                "verified": verified,
                "unsigned_prefix": unsigned_prefix,
                "first_bad": i,
                "error": f"Line {i}: missing _hmac field (unsigned entry after chain began)",
            }

        if not signer.verify_entry(entry, prev):
            return {
                "valid": False,
                "total": total,
                "verified": verified,
                "unsigned_prefix": unsigned_prefix,
                "first_bad": i,
                "error": f"Line {i}: HMAC verification failed (tampered or reordered)",
            }

        prev = entry["_hmac"]
        verified += 1

    return {
        "valid": True,
        "total": total,
        "verified": verified,
        "unsigned_prefix": unsigned_prefix,
        "first_bad": None,
        "error": None,
    }
