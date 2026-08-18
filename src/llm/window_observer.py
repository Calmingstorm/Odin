"""Passive context-window observer + downward-only clamps (campaign phase 5).

Odin's normal work is the probe: every emergency rescue already carries the
server's own numbers — the overflow error's rejected input size and the
compressed retry's accepted usage echo (phase 2 stamping). This module turns
those pairs into per-account, per-model evidence and a temporary DOWNWARD
clamp on the budget resolver, so a silent serving-window regression stops
costing repeated overflow round-trips within minutes of first being seen.

Settled semantics (plan of record R2 §11):

- ``data/context_windows.json`` is runtime EVIDENCE, never configuration:
  versioned schema, strict validation, atomic replacement, UTC timestamps,
  opaque account keys only (the phase-2 HMAC identities — no raw account
  material ever lands here).
- One lock guards the complete read–merge–atomic-write transaction; the
  in-memory state is replaced wholesale under that lock and read lock-free
  by the hot path (``active_clamp`` is synchronous and touches no disk).
- A clamp qualifies only when ALL hold: structural overflow, the SAME
  logical request's successful compressed retry, a server-authoritative
  accepted-input echo, canonical model match, and rejection/acceptance on
  the same opaque account. A cross-account retry records both observations
  but derives no clamp for the rejecting account.
- The clamp value IS the successful post-rejection acceptance, exact.
  Clamps are downward-only: fresh evidence at or below a live clamp
  replaces it (value + fresh TTL); higher evidence never raises or clears
  a live clamp early. TTL is 24 hours; expiry is judged lazily at read.
  Manual clearing is account-scoped.
- The active clamp for a model is the minimum non-expired clamp across all
  accounts holding one. (The plan scopes this to currently ELIGIBLE pool
  accounts; the observer deliberately takes the conservative superset —
  the pool is sticky but failover can seat any account at any moment, and
  a stale account's clamp dies with its TTL.)
- An evidence-write failure logs and forfeits durability — it NEVER turns
  a successful user request into an error. The merged evidence still
  serves this process from memory; the next successful write persists it.
- No probe traffic, no autonomous upward adjustment: growth discovery
  stays a manual procedure.
"""

from __future__ import annotations

import asyncio
import copy
import json
import os
import stat
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TypeGuard

from ..config.schema import canonical_codex_model
from ..odin_log import get_logger

log = get_logger("window_observer")

STORE_VERSION = 1
CLAMP_TTL = timedelta(hours=24)
DEFAULT_STORE_PATH = Path("data/context_windows.json")

#: Evidence for three pool accounts across a handful of models is a few KB;
#: anything near this cap is not our file.
_MAX_STORE_BYTES = 4 * 1024 * 1024

_ACCOUNT_KEY_HEX = "0123456789abcdef"


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _iso(ts: datetime) -> str:
    return ts.isoformat(timespec="seconds").replace("+00:00", "Z")


def _parse_iso(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed


def _is_account_key(value: object) -> bool:
    return (
        isinstance(value, str) and len(value) == 32 and all(ch in _ACCOUNT_KEY_HEX for ch in value)
    )


def _positive_int(value: object) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _empty_model_record() -> dict:
    return {
        "highest_accepted_input": None,
        "highest_accepted_at": None,
        "lowest_rejection_bound": None,
        "lowest_rejection_at": None,
        "overflow_occurrences": 0,
        "last_overflow_at": None,
        "clamp": None,
    }


def _validate_store(data: object) -> bool:
    """Strict schema check — anything off-shape is not our evidence."""
    if not isinstance(data, dict) or data.get("version") != STORE_VERSION:
        return False
    accounts = data.get("accounts")
    if not isinstance(accounts, dict) or set(data) != {"version", "accounts"}:
        return False
    for account_key, account in accounts.items():
        if not _is_account_key(account_key):
            return False
        if not isinstance(account, dict) or set(account) != {"models"}:
            return False
        models = account["models"]
        if not isinstance(models, dict):
            return False
        for model, record in models.items():
            if not isinstance(model, str) or not model.strip():
                return False
            if not isinstance(record, dict) or set(record) != set(_empty_model_record()):
                return False
            for bound in ("highest_accepted_input", "lowest_rejection_bound"):
                if record[bound] is not None and not _positive_int(record[bound]):
                    return False
            occurrences = record["overflow_occurrences"]
            if not isinstance(occurrences, int) or isinstance(occurrences, bool) or occurrences < 0:
                return False
            for ts_field in ("highest_accepted_at", "lowest_rejection_at", "last_overflow_at"):
                if record[ts_field] is not None and _parse_iso(record[ts_field]) is None:
                    return False
            clamp = record["clamp"]
            if clamp is None:
                continue
            if not isinstance(clamp, dict) or set(clamp) != {
                "value",
                "set_at",
                "expires_at",
                "source",
            }:
                return False
            if not _positive_int(clamp["value"]) or clamp["source"] != "rescue":
                return False
            if _parse_iso(clamp["set_at"]) is None or _parse_iso(clamp["expires_at"]) is None:
                return False
    return True


def _read_store_bytes(path: Path) -> bytes | None:
    """Hostile-input-safe read: never block, never follow, never assume.

    Returns the raw bytes of a regular, sanely-sized file; ``None`` for
    absent. Raises ``ValueError`` for anything present-but-wrong (FIFO,
    directory, symlink, oversized) so the caller can quarantine it.
    """
    flags = os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
    except FileNotFoundError:
        return None
    except OSError as exc:
        # ELOOP = symlink refused by O_NOFOLLOW; other opens that fail on a
        # present path are equally disqualifying.
        raise ValueError(f"unreadable store file: {exc}") from exc
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("store path is not a regular file")
        if info.st_size > _MAX_STORE_BYTES:
            raise ValueError(f"store file too large ({info.st_size} bytes)")
        chunks: list[bytes] = []
        remaining = info.st_size
        while remaining > 0:
            chunk = os.read(fd, min(remaining, 1 << 20))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)
    finally:
        os.close(fd)


class WindowObserver:
    """Evidence store + clamp authority. Every public entry point is total."""

    def __init__(self, path: str | Path = DEFAULT_STORE_PATH):
        self._path = Path(path)
        self._lock = asyncio.Lock()
        self._state: dict = {"version": STORE_VERSION, "accounts": {}}
        try:
            self._load_initial()
        except Exception:
            log.exception("Window-evidence store load failed; starting empty")

    # ── load / persist ────────────────────────────────────────────────

    def _load_initial(self) -> None:
        try:
            raw = _read_store_bytes(self._path)
        except ValueError as exc:
            log.warning("Window-evidence store rejected (%s); quarantining", exc)
            self._quarantine()
            return
        if raw is None:
            return
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            data = None
        if data is None or not _validate_store(data):
            log.warning("Window-evidence store failed validation; quarantining")
            self._quarantine()
            return
        self._state = data

    def _quarantine(self) -> None:
        """Preserve questionable prior material beside the store — evidence
        is provenance-bearing and is never repaired or overwritten in place."""
        try:
            stamp = _utc_now().strftime("%Y%m%dT%H%M%SZ")
            target = self._path.with_name(f"{self._path.name}.corrupt-{stamp}")
            os.replace(self._path, target)
            log.warning("Quarantined window-evidence store to %s", target)
        except OSError:
            log.exception("Window-evidence quarantine failed; leaving file in place")

    def _persist_locked(self) -> None:
        """Atomic replacement: temp file in the same directory, fsync, rename,
        parent-directory fsync. Failure is logged by the caller and forfeits
        durability only — never the request."""
        payload = json.dumps(self._state, indent=2, sort_keys=True)
        directory = self._path.parent
        directory.mkdir(parents=True, exist_ok=True)
        tmp_path = self._path.with_name(f".{self._path.name}.tmp-{os.getpid()}")
        fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            try:
                handle = os.fdopen(fd, "w", encoding="utf-8")
            except BaseException:
                # fdopen never took ownership — close the raw fd ourselves.
                os.close(fd)
                raise
            with handle:
                # handle owns fd from here; any failure below closes it.
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_path, self._path)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
        dir_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)

    # ── hot-path read ─────────────────────────────────────────────────

    def active_clamp(self, model: str | None) -> int | None:
        """Minimum non-expired clamp for ``model`` across all accounts.

        Synchronous and disk-free — safe inside budget resolution. Total:
        any internal surprise returns ``None`` (no clamp) rather than ever
        failing a request.
        """
        try:
            canonical = canonical_codex_model(model)
            if not canonical:
                return None
            now = _utc_now()
            best: int | None = None
            for account in self._state.get("accounts", {}).values():
                record = account.get("models", {}).get(canonical)
                clamp = record.get("clamp") if isinstance(record, dict) else None
                if not isinstance(clamp, dict):
                    continue
                expires = _parse_iso(clamp.get("expires_at"))
                value = clamp.get("value")
                if expires is None or expires <= now or not _positive_int(value):
                    continue
                if best is None or value < best:
                    best = value
            return best
        except Exception:
            log.exception("active_clamp failed; treating as unclamped")
            return None

    # ── evidence intake ───────────────────────────────────────────────

    async def record_rescue(self, *, overflow: object, response: object) -> None:
        """Record one overflow→compressed-retry-acceptance pair.

        ``overflow`` is the structural overflow error (phase-2 stamped);
        ``response`` is the SAME logical request's successful retry. Total:
        every failure logs and forfeits the observation.
        """
        try:
            if getattr(overflow, "code", None) != "context_length_exceeded":
                return
            reject_key = getattr(overflow, "account_key", None)
            reject_tokens = getattr(overflow, "server_input_tokens", None)
            reject_model = canonical_codex_model(getattr(overflow, "model", None))
            accept_key = getattr(response, "account_key", None)
            accept_tokens = getattr(response, "server_input_tokens", None)
            accept_model = canonical_codex_model(getattr(response, "provenance_model", None))
            if not _positive_int(reject_tokens):
                reject_tokens = None
            if not _positive_int(accept_tokens):
                accept_tokens = None
            if not _is_account_key(reject_key):
                reject_key = None
            if not _is_account_key(accept_key):
                accept_key = None
            now = _utc_now()

            async with self._lock:
                state = copy.deepcopy(self._state)
                if reject_key and reject_model:
                    record = self._record_for(state, reject_key, reject_model)
                    record["overflow_occurrences"] += 1
                    record["last_overflow_at"] = _iso(now)
                    if reject_tokens is not None:
                        prior = record["lowest_rejection_bound"]
                        if prior is None or reject_tokens < prior:
                            record["lowest_rejection_bound"] = reject_tokens
                            record["lowest_rejection_at"] = _iso(now)
                if accept_key and accept_model and accept_tokens is not None:
                    record = self._record_for(state, accept_key, accept_model)
                    prior = record["highest_accepted_input"]
                    if prior is None or accept_tokens > prior:
                        record["highest_accepted_input"] = accept_tokens
                        record["highest_accepted_at"] = _iso(now)
                if (
                    reject_key is not None
                    and reject_key == accept_key
                    and reject_model
                    and reject_model == accept_model
                    and accept_tokens is not None
                ):
                    record = self._record_for(state, reject_key, reject_model)
                    record["clamp"] = self._merged_clamp(record.get("clamp"), accept_tokens, now)
                self._state = state
                try:
                    await asyncio.to_thread(self._persist_locked)
                except OSError:
                    log.exception(
                        "Window-evidence write failed; observation forfeited "
                        "(in-memory clamp still serves this process)"
                    )
        except Exception:
            log.exception("record_rescue failed; observation forfeited")

    @staticmethod
    def _record_for(state: dict, account_key: str, model: str) -> dict:
        account = state["accounts"].setdefault(account_key, {"models": {}})
        return account["models"].setdefault(model, _empty_model_record())

    @staticmethod
    def _merged_clamp(existing: dict | None, accepted: int, now: datetime) -> dict:
        """Downward-only merge: evidence at or below a live clamp replaces it
        (exact value, fresh TTL); higher evidence never raises or refreshes a
        live clamp; an expired clamp is replaced outright."""
        fresh = {
            "value": accepted,
            "set_at": _iso(now),
            "expires_at": _iso(now + CLAMP_TTL),
            "source": "rescue",
        }
        if not isinstance(existing, dict):
            return fresh
        expires = _parse_iso(existing.get("expires_at"))
        value = existing.get("value")
        if expires is None or expires <= now or not _positive_int(value):
            return fresh
        if accepted <= value:
            return fresh
        return existing

    # ── management surface ────────────────────────────────────────────

    async def clear_account(self, account_key: str, model: str | None = None) -> int:
        """Manually clear clamp(s) for one account (all models, or one).

        Returns the number of clamps cleared. Bounds history stays — clearing
        is a clamp operation, not evidence destruction. Total."""
        try:
            if not _is_account_key(account_key):
                return 0
            target_model = canonical_codex_model(model) if model else None
            cleared = 0
            async with self._lock:
                state = copy.deepcopy(self._state)
                account = state.get("accounts", {}).get(account_key)
                if not account:
                    return 0
                for name, record in account.get("models", {}).items():
                    if target_model and name != target_model:
                        continue
                    if record.get("clamp") is not None:
                        record["clamp"] = None
                        cleared += 1
                if cleared:
                    self._state = state
                    try:
                        await asyncio.to_thread(self._persist_locked)
                    except OSError:
                        log.exception("Window-evidence write failed after clear")
            return cleared
        except Exception:
            log.exception("clear_account failed")
            return 0

    def view(self) -> dict:
        """Deep-copied snapshot for the API: raw records plus, per clamp, a
        computed ``expired`` flag so consumers never re-implement TTL math."""
        try:
            snapshot = copy.deepcopy(self._state)
            now = _utc_now()
            for account in snapshot.get("accounts", {}).values():
                for record in account.get("models", {}).values():
                    clamp = record.get("clamp")
                    if isinstance(clamp, dict):
                        expires = _parse_iso(clamp.get("expires_at"))
                        clamp["expired"] = expires is None or expires <= now
            return snapshot
        except Exception:
            log.exception("view failed")
            return {"version": STORE_VERSION, "accounts": {}}
