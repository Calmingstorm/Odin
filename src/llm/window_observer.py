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
- The active clamp for a model is the minimum non-expired clamp across the
  currently ELIGIBLE pool accounts. Pool knowledge is dependency-inverted:
  the observer consumes opaque-key snapshots and never imports the pool.
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
import tempfile
import time
from collections.abc import Callable, Collection
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TypeGuard

from ..config.schema import canonical_codex_model
from ..odin_log import get_logger

log = get_logger("window_observer")

STORE_VERSION = 1
CLAMP_TTL = timedelta(hours=24)
DEFAULT_STORE_PATH = Path("data/context_windows.json")

#: Density calibration is EPHEMERAL workload evidence, not durable capability
#: evidence: it lives in memory only and never enters the version-1 store
#: shape. Persisting it would demand expiry/reset semantics and a schema
#: migration to describe something a restart can safely relearn in one turn.
#:
#: Asymmetric EMA (settled with Odin): dense evidence must bite on the NEXT
#: turn, while ordinary prose must not erase the lesson just as fast. Weights
#: are integer reciprocals so the update stays exact.
_DENSITY_ALPHA_DOWN_RECIP = 2  # α = 1/2  — react fast toward denser content
_DENSITY_ALPHA_UP_RECIP = 16  # α = 1/16 — relax slowly back toward sparse

#: An observation is only meaningful once enough NON-image, non-envelope
#: material is present to attribute. Image-only or envelope-dominated
#: requests must never pin text density to the floor.
_MIN_OBSERVABLE_CONTENT_TOKENS = 32_000
_MIN_OBSERVABLE_CHARS = 32_000

#: Bounded leak defense for workload calibration. Owners release their own
#: scope on termination; this only catches abandoned entries, and evicting one
#: merely returns that workload to the fixed prior.
_MAX_WORKLOAD_SCOPES = 512

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


def derive_sample_density(
    *, chars_sent: object, images_sent: object, server_input_tokens: object
) -> int | None:
    """Raw observed millichars/token for ONE measured request, or None.

    The single attribution authority, shared by EMA calibration and by
    forensic clamp qualification. Attribution removes the fixed envelope and
    the image surcharge so the remainder describes TEXT density — the only
    thing a character measure can predict.

    Returns None whenever the sample cannot support an honest observation
    (missing/!positive usage echo, non-integer counts, too little text, or
    an image/envelope-dominated request). None means UNKNOWN, and callers
    must never read it as agreement.
    """
    from .context_budget import FIXED_ENVELOPE_RESERVE_TOKENS, IMAGE_TOKEN_SURCHARGE

    if not _positive_int(server_input_tokens):
        return None
    if not isinstance(chars_sent, int) or isinstance(chars_sent, bool):
        return None
    if not isinstance(images_sent, int) or isinstance(images_sent, bool):
        return None
    if images_sent < 0:
        return None
    if chars_sent < _MIN_OBSERVABLE_CHARS:
        return None
    content_tokens = (
        int(server_input_tokens)
        - FIXED_ENVELOPE_RESERVE_TOKENS
        - images_sent * IMAGE_TOKEN_SURCHARGE
    )
    if content_tokens < _MIN_OBSERVABLE_CONTENT_TOKENS:
        return None
    # RAW positive attribution. Do not apply the EMA/admission band here:
    # forensic qualification needs to preserve an observed value below 400
    # so it can veto a false clamp. ``record_density`` alone bands the value
    # before publishing it to future admission snapshots.
    raw = chars_sent * 1000 // content_tokens
    return raw if raw > 0 else None


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


class WindowObserverMutationError(RuntimeError):
    """An explicit operator mutation could not be durably committed."""


class WindowObserver:
    """Evidence store + clamp authority. Every passive entry point is total."""

    def __init__(
        self,
        path: str | Path = DEFAULT_STORE_PATH,
        *,
        eligible_account_keys: Callable[[], Collection[str] | None] | None = None,
    ):
        self._path = Path(path)
        self._lock = asyncio.Lock()
        # None keeps standalone/test construction backward-compatible. The
        # composition root installs the production pool-backed provider.
        self._eligible_account_keys = eligible_account_keys
        self._state: dict = {"version": STORE_VERSION, "accounts": {}}
        # Ephemeral WORKLOAD-LOCAL density calibration, keyed
        # (surface_kind, workload_id, canonical_model) -> millichars/token.
        # Never global: one job's dense content must not make every other job
        # compact against a stranger's density. Never persisted, never in
        # ``view()``. ``_scope_touched`` carries a monotonic last-use stamp so
        # abandoned workloads can be evicted even if owner cleanup fails.
        self._density_milli: dict[tuple[str, str, str], int] = {}
        self._scope_touched: dict[tuple[str, str, str], float] = {}
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

    def set_eligible_account_keys_provider(
        self, provider: Callable[[], Collection[str] | None] | None
    ) -> None:
        """Install the pool-facing opaque-key snapshot provider.

        This narrow callback is the dependency-inversion boundary: observer
        code knows nothing about credential pools or raw account identities.
        """
        self._eligible_account_keys = provider

    def _persist_locked(self, state: dict | None = None) -> None:
        """Atomic replacement: unique temp, fsync, rename, parent fsync."""
        payload = json.dumps(self._state if state is None else state, indent=2, sort_keys=True)
        directory = self._path.parent
        directory.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix=f".{self._path.name}.tmp-", dir=directory)
        tmp_path = Path(tmp_name)
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

    async def _persist_owned(
        self, state: dict
    ) -> tuple[BaseException | None, asyncio.CancelledError | None]:
        """Drain the persistence worker before the transaction lock releases.

        Cancelling an await of ``to_thread`` does not stop the worker. Shield
        it and remember cancellation so no second writer can enter while the
        first still owns an unpublished candidate.
        """
        worker = asyncio.create_task(asyncio.to_thread(self._persist_locked, state))
        cancelled: asyncio.CancelledError | None = None
        while True:
            try:
                await asyncio.shield(worker)
                break
            except asyncio.CancelledError as exc:
                # If the worker itself raised CancelledError, it is done and its
                # outcome belongs to the persistence operation. Otherwise this
                # task was cancelled; keep owning the transaction until the
                # non-cooperative thread has actually stopped.
                if worker.done():
                    break
                if cancelled is None:
                    cancelled = exc
            except BaseException:
                # The worker outcome is collected below; the important thing
                # here is that it is DONE before lock ownership can end.
                break
        try:
            worker.result()
        except BaseException as exc:
            return exc, cancelled
        return None, cancelled

    # ── hot-path read ─────────────────────────────────────────────────

    def _eligible_keys(self) -> tuple[bool, frozenset[str]]:
        """Return ``(scoped, keys)`` for the current pool snapshot.

        Standalone construction has no pool provider and preserves legacy
        all-account behavior (``scoped=False``). Once a provider is installed,
        an unavailable snapshot fails open as an empty eligible set rather than
        presenting stale evidence as active.
        """
        if self._eligible_account_keys is None:
            return False, frozenset()
        supplied = self._eligible_account_keys()
        if supplied is None:
            return True, frozenset()
        return True, frozenset(key for key in supplied if _is_account_key(key))

    @staticmethod
    def _active_clamp_for_record(record: object, now: datetime) -> int | None:
        if not isinstance(record, dict):
            return None
        clamp = record.get("clamp")
        if not isinstance(clamp, dict):
            return None
        expires = _parse_iso(clamp.get("expires_at"))
        value = clamp.get("value")
        if expires is None or expires <= now or not _positive_int(value):
            return None
        return value

    def active_clamp(self, model: str | None) -> int | None:
        """Minimum non-expired clamp across currently eligible accounts.

        Synchronous and disk-free — safe inside budget resolution. Total:
        any internal surprise returns ``None`` (no clamp) rather than ever
        failing a request.
        """
        try:
            canonical = canonical_codex_model(model)
            if not canonical:
                return None
            scoped, eligible = self._eligible_keys()
            now = _utc_now()
            best: int | None = None
            for account_key, account in self._state.get("accounts", {}).items():
                if scoped and account_key not in eligible:
                    continue
                value = self._active_clamp_for_record(account.get("models", {}).get(canonical), now)
                if value is not None and (best is None or value < best):
                    best = value
            return best
        except Exception:
            log.exception("active_clamp failed; treating as unclamped")
            return None

    def account_clamps(self) -> list[dict]:
        """Management-safe active clamp rows for the WebUI.

        The observer owns TTL and pool-eligibility semantics.  Exposing a
        normalized view keeps the browser from reimplementing either, while
        retaining the opaque account key needed for an account-scoped clear.
        """
        try:
            scoped, eligible = self._eligible_keys()
            now = _utc_now()
            rows: list[dict] = []
            for account_key, account in self._state.get("accounts", {}).items():
                if scoped and account_key not in eligible:
                    continue
                for model, record in account.get("models", {}).items():
                    value = self._active_clamp_for_record(record, now)
                    if value is None:
                        continue
                    clamp = record["clamp"]
                    rows.append(
                        {
                            "account_key": account_key,
                            "model": model,
                            "value": value,
                            "set_at": clamp["set_at"],
                            "expires_at": clamp["expires_at"],
                            "source": clamp["source"],
                        }
                    )
            return sorted(
                rows, key=lambda row: (row["model"], row["expires_at"], row["account_key"])
            )
        except Exception:
            log.exception("account_clamps failed; serving no management rows")
            return []

    # ── density calibration (ephemeral) ────────────────────────────────

    @staticmethod
    def _scope_key(scope: object, model: str | None) -> tuple[str, str, str] | None:
        """``(surface_kind, workload_id, canonical_model)`` or None.

        A missing or malformed scope is NOT silently promoted to a global
        entry — it yields None, which callers must read as "use the fixed
        prior, record nothing". There is deliberately no omitted-scope
        compatibility path: that is exactly how a workload sample would leak
        back into global calibration.
        """
        try:
            from .context_budget import WorkloadScope

            # Exact type, not duck-typing: a scope-shaped object from
            # elsewhere must not be able to claim a calibration lineage.
            if not isinstance(scope, WorkloadScope) or not scope.is_valid():
                return None
            canonical = canonical_codex_model(model)
            if not canonical:
                return None
            return (scope.surface_kind.strip(), scope.workload_id.strip(), canonical)
        except Exception:
            return None

    def density_for(self, scope: object, model: str | None) -> int | None:
        """Calibrated millichars/token for THIS workload, or None for none yet.

        Synchronous, disk-free and total — safe inside budget resolution.
        None means "no local evidence", and the caller uses the fixed prior;
        it never falls back to another workload's measurement.
        """
        try:
            key = self._scope_key(scope, model)
            if key is None:
                return None
            value = self._density_milli.get(key)
            if value is not None:
                self._scope_touched[key] = time.monotonic()
            return value
        except Exception:
            log.exception("density_for failed; treating as uncalibrated")
            return None

    def release_workload(self, scope: object) -> int:
        """Drop every model entry for a finished workload. Owner-called.

        Total and idempotent: cleanup failure is not worth an exception on a
        turn or agent that has already finished.
        """
        try:
            from .context_budget import WorkloadScope

            if not isinstance(scope, WorkloadScope) or not scope.is_valid():
                return 0
            prefix = (scope.surface_kind.strip(), scope.workload_id.strip())
            doomed = [k for k in self._density_milli if k[:2] == prefix]
            for k in doomed:
                self._density_milli.pop(k, None)
                self._scope_touched.pop(k, None)
            return len(doomed)
        except Exception:
            log.exception("release_workload failed; leaving entries for eviction")
            return 0

    def _evict_if_needed(self) -> None:
        """Bounded leak defense. Eviction only returns a workload to the fixed
        prior, so it is safe even when an owner's cleanup never ran."""
        try:
            excess = len(self._density_milli) - _MAX_WORKLOAD_SCOPES
            if excess <= 0:
                return
            oldest = sorted(self._density_milli, key=lambda k: self._scope_touched.get(k, 0.0))
            for key in oldest[:excess]:
                self._density_milli.pop(key, None)
                self._scope_touched.pop(key, None)
        except Exception:
            log.exception("density eviction failed")

    def workload_calibration_summary(self) -> dict[str, dict]:
        """Per-model OBSERVABILITY only: how many workloads are calibrated and
        the range they span.

        Deliberately not a value the API can present as a runtime target.
        After workload-local scoping there IS no global calibrated density,
        and substituting a minimum, average or most-recent value would assert
        a target that no generation actually uses.
        """
        try:
            out: dict[str, dict] = {}
            for (_kind, _wid, model), value in self._density_milli.items():
                row = out.setdefault(model, {"active_workloads": 0, "min": value, "max": value})
                row["active_workloads"] += 1
                row["min"] = min(row["min"], value)
                row["max"] = max(row["max"], value)
            return out
        except Exception:
            log.exception("workload_calibration_summary failed")
            return {}

    def record_density(
        self,
        *,
        scope: object,
        model: str | None,
        chars_sent: int,
        images_sent: int,
        server_input_tokens: object,
    ) -> None:
        """Fold one accepted request's measured density into the model's EMA.

        Attribution removes the fixed envelope and the image surcharge so the
        remainder describes TEXT density, the only thing a character measure
        can predict. Total: any unusable sample is silently skipped — a
        calibration miss must never disturb a request that already succeeded.
        """
        try:
            from .context_budget import clamp_density_milli

            key = self._scope_key(scope, model)
            if key is None:
                # No honest owner for this sample. Recording it anywhere else
                # would republish one workload's density to another.
                return
            observed = derive_sample_density(
                chars_sent=chars_sent,
                images_sent=images_sent,
                server_input_tokens=server_input_tokens,
            )
            if observed is None:
                return
            prior = self._density_milli.get(key)
            banded_observed = clamp_density_milli(observed)
            self._scope_touched[key] = time.monotonic()
            if prior is None:
                self._density_milli[key] = banded_observed
                self._evict_if_needed()
                log.info(
                    "context density calibrated for workload %s/%s on %s: "
                    "%d millichars/token (%d chars, %d images, %d server tokens; raw=%d)",
                    key[0],
                    key[1],
                    key[2],
                    banded_observed,
                    chars_sent,
                    images_sent,
                    server_input_tokens,
                    observed,
                )
                return
            # Asymmetric EMA. Moving DOWN (denser content than believed) is
            # the safety direction and reacts fast; moving UP relaxes slowly
            # so one sparse turn cannot erase a dense lesson.
            recip = (
                _DENSITY_ALPHA_DOWN_RECIP
                if banded_observed < prior
                else _DENSITY_ALPHA_UP_RECIP
            )
            updated = prior + (banded_observed - prior) // recip
            if updated == prior and banded_observed != prior:
                # Integer division stalls within one step of the target; take
                # the single-unit step so convergence cannot deadlock.
                updated = prior + (1 if banded_observed > prior else -1)
            self._density_milli[key] = clamp_density_milli(updated)
        except Exception:
            log.exception("record_density failed; sample discarded")

    # ── evidence intake ───────────────────────────────────────────────

    @staticmethod
    def _clamp_qualifies(
        rejected_attempt: object,
        *,
        rejected_tokens: int | None,
        accepted_chars: object,
        accepted_images: object,
        accepted_tokens: int,
    ) -> bool:
        """Whether this rescue is affirmative evidence that the window shrank.

        Prior belief alone is not enough: belief rests on a density estimate,
        and a COLD or stale estimate can call a dense payload "within" and
        then read its inevitable rejection as capability evidence. That is the
        original defect surviving in a narrower band — and a cold observer is
        the normal state after every restart.

        So the rescue must also survive POST-HOC consistency. When the
        rejection carries its own authoritative input-token echo, that direct
        fact decides whether the rejected payload fit the frozen budget. When
        it does not, the retry that the server accepted supplies a raw density
        sample for this workload; re-run the rejected payload's fit verdict
        against that fresh evidence:

            qualification = min(assumed density, accepted sample density)
            posthoc       = estimate(rejected chars/images, qualification)
            qualifies     ⇔ posthoc still fits the believed budget

        ``min`` is load-bearing: post-hoc evidence is a VETO, never permission
        to make the rejected payload look safer than it did when sent, so a
        sparse accepted retry cannot rehabilitate a doomed one. The raw sample
        is used rather than the smoothed EMA — smoothing is right for future
        admission, wrong for forensics about this specific rescue.

        An unusable accepted sample leaves consistency UNKNOWN, and unknown
        never clamps: clamp evidence must be affirmative, and the absence of
        contradiction is not proof that capacity moved. When a real shrink
        coincides with newly discovered density the clamp is withheld too —
        calibration protects the next request, and a later rejection that is
        still believed within under the corrected density can clamp then. One
        extra overflow costs less than a false 24-hour capability claim.
        """
        from .context_budget import (
            RejectedAttemptFacts,
            clamp_density_milli,
            estimate_request_tokens,
            estimate_request_tokens_forensic,
        )

        # This is a durable-capability decision, not a convenience API:
        # accept only the exact frozen facts type produced by the send path.
        if not isinstance(rejected_attempt, RejectedAttemptFacts):
            return False
        facts = rejected_attempt
        if facts.believed_within is not True:
            return False
        if (
            isinstance(facts.chars, bool)
            or not isinstance(facts.chars, int)
            or facts.chars < 0
            or isinstance(facts.images, bool)
            or not isinstance(facts.images, int)
            or facts.images < 0
            or not _positive_int(facts.density_milli)
            or clamp_density_milli(facts.density_milli) != facts.density_milli
            or not _positive_int(facts.estimated_tokens)
            or not _positive_int(facts.effective_budget)
        ):
            return False

        # The redundant verdict fields are an integrity check, not alternate
        # authorities. Recompute exactly as admission did and reject any
        # contradictory object rather than duck-typing it into evidence.
        expected = estimate_request_tokens(
            facts.chars,
            facts.images,
            density_milli=facts.density_milli,
        )
        if facts.estimated_tokens != expected:
            return False
        if facts.believed_within is not (expected <= facts.effective_budget):
            return False

        # A rejection-side server echo is direct evidence about the rejected
        # payload itself. If it says the request exceeded the frozen believed
        # budget, no density estimate may rehabilitate it into shrink evidence.
        if rejected_tokens is not None:
            return rejected_tokens <= facts.effective_budget

        # Older/ordinary rejections carry no usage echo. Fall back to the
        # accepted retry's raw workload density. Raw is load-bearing here:
        # applying the [400,2500] EMA/admission band can turn a true 100-milli
        # contradiction into a false clamp.
        accepted_density = derive_sample_density(
            chars_sent=accepted_chars,
            images_sent=accepted_images,
            server_input_tokens=accepted_tokens,
        )
        if accepted_density is None:
            return False
        qualification_density = min(facts.density_milli, accepted_density)
        posthoc = estimate_request_tokens_forensic(
            facts.chars,
            facts.images,
            density_milli=qualification_density,
        )
        return posthoc <= facts.effective_budget

    async def record_rescue(
        self,
        *,
        overflow: object,
        response: object,
        rejected_attempt: object = None,
        accepted_chars: object = None,
        accepted_images: object = None,
    ) -> None:
        """Record one overflow→compressed-retry-acceptance pair.

        ``overflow`` is the structural overflow error (phase-2 stamped);
        ``response`` is the SAME logical request's successful retry. Total:
        every failure logs and forfeits the observation.

        ``rejected_attempt`` is the frozen ``RejectedAttemptFacts`` for the
        payload the provider actually refused, and ``accepted_chars`` /
        ``accepted_images`` measure the retry it accepted. Together they
        qualify the CLAMP and nothing else — bounds, overflow counts and
        acceptance high-water marks record regardless.

        A clamp asserts "the served window shrank". That follows only when the
        rejected payload was believed to FIT and STILL looks like it should
        have fit once the acceptance's own density evidence is applied (see
        ``_clamp_qualifies``). A rejection explained by density — the terra
        case that clamped 288,499 against a 917,506 floor — proves nothing
        about capacity and must rescue without clamping. Absent facts (a
        resumed generation never persisted them) mean unknown, and unknown
        never clamps.
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

            cancellation: asyncio.CancelledError | None = None
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
                    and self._clamp_qualifies(
                        rejected_attempt,
                        rejected_tokens=reject_tokens,
                        accepted_chars=accepted_chars,
                        accepted_images=accepted_images,
                        accepted_tokens=accept_tokens,
                    )
                ):
                    record = self._record_for(state, reject_key, reject_model)
                    record["clamp"] = self._merged_clamp(record.get("clamp"), accept_tokens, now)
                self._state = state
                persist_error, cancellation = await self._persist_owned(state)
                if persist_error is not None:
                    log.error(
                        "Window-evidence write failed; observation forfeited "
                        "(in-memory clamp still serves this process)",
                        exc_info=(type(persist_error), persist_error, persist_error.__traceback__),
                    )
            if cancellation is not None:
                raise cancellation
        except asyncio.CancelledError:
            raise
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
        """Durably clear clamp(s) for one account (all models, or one).

        Bounds history stays. Persistence failure raises
        ``WindowObserverMutationError`` and leaves the published in-memory
        state unchanged, so API truth matches restart truth.
        """
        if not _is_account_key(account_key):
            return 0
        target_model = canonical_codex_model(model) if model else None
        cancellation: asyncio.CancelledError | None = None
        async with self._lock:
            state = copy.deepcopy(self._state)
            account = state.get("accounts", {}).get(account_key)
            if not account:
                return 0
            cleared = 0
            for name, record in account.get("models", {}).items():
                if target_model and name != target_model:
                    continue
                if record.get("clamp") is not None:
                    record["clamp"] = None
                    cleared += 1
            if not cleared:
                return 0
            persist_error, cancellation = await self._persist_owned(state)
            if persist_error is not None:
                raise WindowObserverMutationError(
                    "window-evidence clear could not be persisted"
                ) from persist_error
            # Publish only after durable commit. A cancellation delivered while
            # the worker ran still observes matching memory and disk state.
            self._state = state
        if cancellation is not None:
            raise cancellation
        return cleared

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
