"""Codex quota telemetry parsed from ``x-codex-*`` response headers.

Every ``/backend-api/codex/responses`` reply carries the account's rate-limit
windows in its headers, so quota is observed for free on ordinary traffic —
there is no probe, no extra endpoint, and no extra request.  Snapshots are
process-local: quota is volatile response telemetry whose reset timers decay,
so persisting it would only manufacture stale state.  After a restart the
view truthfully reports "not yet observed" until the first ordinary response.

Only an allowlist of known headers is parsed, each with strict finite-numeric,
boolean, or bounded-text validation.  Arbitrary upstream headers are never
retained or logged.  ``reset-after-seconds`` is converted to an absolute
deadline at observation time so a stored value cannot silently mean "3600
seconds from whenever you happen to look".
"""
from __future__ import annotations

import math
import time
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass

_TEXT_LIMIT = 40
_MAX_TRACKED_ACCOUNTS = 32
_MAX_WINDOW_MINUTES = 60 * 24 * 366
_MAX_RESET_SECONDS = float(60 * 60 * 24 * 366)
_MAX_PERCENT = 100_000.0

# Header names are matched case-insensitively; values are validated per kind.
_PRIMARY_USED = "x-codex-primary-used-percent"
_PRIMARY_WINDOW = "x-codex-primary-window-minutes"
_PRIMARY_RESET_AFTER = "x-codex-primary-reset-after-seconds"
_PRIMARY_RESET_AT = "x-codex-primary-reset-at"
_SECONDARY_USED = "x-codex-secondary-used-percent"
_SECONDARY_WINDOW = "x-codex-secondary-window-minutes"
_SECONDARY_RESET_AFTER = "x-codex-secondary-reset-after-seconds"
_SECONDARY_RESET_AT = "x-codex-secondary-reset-at"
_OVER_SECONDARY = "x-codex-primary-over-secondary-limit-percent"
_ACTIVE_LIMIT = "x-codex-active-limit"
_PLAN_TYPE = "x-codex-plan-type"
_CREDITS_BALANCE = "x-codex-credits-balance"
_HAS_CREDITS = "x-codex-has-credits"
_CREDITS_UNLIMITED = "x-codex-credits-unlimited"
_LIMIT_REACHED = "x-codex-rate-limit-reached-type"

QUOTA_HEADER_ALLOWLIST: frozenset[str] = frozenset(
    {
        _PRIMARY_USED,
        _PRIMARY_WINDOW,
        _PRIMARY_RESET_AFTER,
        _PRIMARY_RESET_AT,
        _SECONDARY_USED,
        _SECONDARY_WINDOW,
        _SECONDARY_RESET_AFTER,
        _SECONDARY_RESET_AT,
        _OVER_SECONDARY,
        _ACTIVE_LIMIT,
        _PLAN_TYPE,
        _CREDITS_BALANCE,
        _HAS_CREDITS,
        _CREDITS_UNLIMITED,
        _LIMIT_REACHED,
    }
)


@dataclass(frozen=True)
class QuotaWindow:
    """One rate-limit window as the server reported it."""

    used_percent: float
    window_minutes: int | None
    resets_at: float | None  # absolute unix seconds, derived at observation

    def to_dict(self) -> dict:
        return {
            "used_percent": self.used_percent,
            "window_minutes": self.window_minutes,
            "resets_at": self.resets_at,
        }


@dataclass(frozen=True)
class QuotaSnapshot:
    """Immutable quota observation for one account."""

    observed_at: float
    account_key: str
    primary: QuotaWindow | None
    secondary: QuotaWindow | None
    over_secondary_percent: float | None
    active_limit: str | None
    plan_type: str | None
    credits_balance: float | None
    has_credits: bool | None
    credits_unlimited: bool | None
    limit_reached_type: str | None

    def to_dict(self) -> dict:
        return {
            "observed_at": self.observed_at,
            "account_key": self.account_key,
            "primary": self.primary.to_dict() if self.primary else None,
            "secondary": self.secondary.to_dict() if self.secondary else None,
            "over_secondary_percent": self.over_secondary_percent,
            "active_limit": self.active_limit,
            "plan_type": self.plan_type,
            "credits_balance": self.credits_balance,
            "has_credits": self.has_credits,
            "credits_unlimited": self.credits_unlimited,
            "limit_reached_type": self.limit_reached_type,
        }


@dataclass(frozen=True)
class QuotaView:
    """The pool-wide view: the selected account first, others last-seen."""

    current_key: str | None
    current: QuotaSnapshot | None
    others: tuple[QuotaSnapshot, ...]


def _lower_headers(headers: Mapping[str, object] | Iterable[tuple[str, object]]) -> dict[str, str]:
    """Reduce any header mapping to allowlisted lowercase-name → text value."""
    items = headers.items() if isinstance(headers, Mapping) else headers
    out: dict[str, str] = {}
    for name, value in items:
        if not isinstance(name, str):
            continue
        key = name.strip().lower()
        if key not in QUOTA_HEADER_ALLOWLIST or key in out:
            continue
        if isinstance(value, bytes):
            try:
                value = value.decode("ascii")
            except UnicodeDecodeError:
                continue
        if isinstance(value, bool) or not isinstance(value, (str, int, float)):
            continue
        out[key] = str(value)
    return out


def _finite_float(value: str | None, *, maximum: float) -> float | None:
    if value is None:
        return None
    text = value.strip()
    if not text or len(text) > 32:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if not math.isfinite(number) or number < 0 or number > maximum:
        return None
    return number


def _bounded_int(value: str | None, *, maximum: int) -> int | None:
    number = _finite_float(value, maximum=float(maximum))
    if number is None or number != int(number):
        return None
    return int(number)


def _boolean(value: str | None) -> bool | None:
    if value is None:
        return None
    text = value.strip().lower()
    if text == "true":
        return True
    if text == "false":
        return False
    return None


def _text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text or len(text) > _TEXT_LIMIT:
        return None
    if not all(32 <= ord(ch) < 127 for ch in text):
        return None
    return text


def _window(
    fields: dict[str, str],
    *,
    used: str,
    window: str,
    reset_after: str,
    reset_at: str,
    observed_at: float,
) -> QuotaWindow | None:
    used_percent = _finite_float(fields.get(used), maximum=_MAX_PERCENT)
    if used_percent is None:
        return None
    resets_at: float | None = None
    after = _finite_float(fields.get(reset_after), maximum=_MAX_RESET_SECONDS)
    if after is not None:
        resets_at = observed_at + after
    else:
        absolute = _finite_float(fields.get(reset_at), maximum=observed_at + _MAX_RESET_SECONDS)
        if absolute is not None and absolute >= observed_at - _MAX_RESET_SECONDS:
            resets_at = absolute
    return QuotaWindow(
        used_percent=used_percent,
        window_minutes=_bounded_int(fields.get(window), maximum=_MAX_WINDOW_MINUTES),
        resets_at=resets_at,
    )


def parse_quota_headers(
    headers: Mapping[str, object] | Iterable[tuple[str, object]],
    *,
    account_key: str,
    observed_at: float | None = None,
) -> QuotaSnapshot | None:
    """Parse one response's quota headers; ``None`` when no quota is present."""
    fields = _lower_headers(headers)
    if not fields:
        return None
    now = time.time() if observed_at is None else float(observed_at)
    primary = _window(
        fields,
        used=_PRIMARY_USED,
        window=_PRIMARY_WINDOW,
        reset_after=_PRIMARY_RESET_AFTER,
        reset_at=_PRIMARY_RESET_AT,
        observed_at=now,
    )
    secondary = _window(
        fields,
        used=_SECONDARY_USED,
        window=_SECONDARY_WINDOW,
        reset_after=_SECONDARY_RESET_AFTER,
        reset_at=_SECONDARY_RESET_AT,
        observed_at=now,
    )
    if primary is None and secondary is None:
        return None
    return QuotaSnapshot(
        observed_at=now,
        account_key=account_key,
        primary=primary,
        secondary=secondary,
        over_secondary_percent=_finite_float(fields.get(_OVER_SECONDARY), maximum=_MAX_PERCENT),
        active_limit=_text(fields.get(_ACTIVE_LIMIT)),
        plan_type=_text(fields.get(_PLAN_TYPE)),
        credits_balance=_finite_float(fields.get(_CREDITS_BALANCE), maximum=1e12),
        has_credits=_boolean(fields.get(_HAS_CREDITS)),
        credits_unlimited=_boolean(fields.get(_CREDITS_UNLIMITED)),
        limit_reached_type=_text(fields.get(_LIMIT_REACHED)),
    )


class CodexQuotaTracker:
    """Process-local, account-keyed quota snapshots.

    Keys are the installation-local opaque account keys — never emails, raw
    account ids, or credential slots.  ``record_headers`` is total: malformed
    input is dropped and the request is never affected.
    """

    def __init__(self, *, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock
        self._snapshots: dict[str, QuotaSnapshot] = {}

    def record_headers(
        self,
        account_key: str | None,
        headers: Mapping[str, object] | Iterable[tuple[str, object]] | None,
    ) -> QuotaSnapshot | None:
        if not isinstance(account_key, str) or not account_key or headers is None:
            return None
        try:
            snapshot = parse_quota_headers(
                headers, account_key=account_key, observed_at=self._clock()
            )
        except Exception:
            return None
        if snapshot is None:
            return None
        self._snapshots[account_key] = snapshot
        if len(self._snapshots) > _MAX_TRACKED_ACCOUNTS:
            oldest = min(self._snapshots, key=lambda key: self._snapshots[key].observed_at)
            del self._snapshots[oldest]
        return snapshot

    def snapshot_for(self, account_key: str | None) -> QuotaSnapshot | None:
        if not isinstance(account_key, str):
            return None
        return self._snapshots.get(account_key)

    def forget_missing(self, known_keys: Iterable[str]) -> None:
        """Drop snapshots for accounts that no longer exist in the pool."""
        keep = {key for key in known_keys if isinstance(key, str)}
        for key in list(self._snapshots):
            if key not in keep:
                del self._snapshots[key]

    def view(
        self,
        *,
        current_key: str | None,
        known_keys: Iterable[str] | None = None,
    ) -> QuotaView:
        allowed = None if known_keys is None else {k for k in known_keys if isinstance(k, str)}
        current = self.snapshot_for(current_key)
        others = tuple(
            sorted(
                (
                    snap
                    for key, snap in self._snapshots.items()
                    if key != current_key and (allowed is None or key in allowed)
                ),
                key=lambda snap: snap.observed_at,
                reverse=True,
            )
        )
        return QuotaView(current_key=current_key, current=current, others=others)
