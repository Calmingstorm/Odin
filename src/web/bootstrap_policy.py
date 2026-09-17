"""Pure D3 Web bootstrap bind and credential-transition policy.

This module deliberately does not read configuration, token files, DNS, or a
live socket.  Its caller supplies a non-secret :class:`CredentialInventory`:
only credentials already parsed and validated by the owning configuration and
token-manager transaction may be counted.  In particular, an unreadable,
malformed, empty, or otherwise unusable dynamic store contributes zero.

Concurrency contract
--------------------
Callers making a credential mutation must construct ``inventory`` from the
*candidate transaction-current* state, not a stale preflight snapshot.  Last
credential removal must additionally pass the actual listener address observed
at the listener boundary to :func:`may_remove_last_credential`.  A persisted
desired restriction is not proof that an already-broad listener is safe. A
real listener may own multiple sockets (notably after hostname resolution); an
integration must aggregate every actual socket and permit removal only if all
of them are numeric loopback, or another usable credential remains.

This is policy only.  It neither rebinds a listener nor authorizes a request.
Route/bootstrap authorization is intentionally absent until an integration can
prove every ingress and existing authentication boundary uses one policy.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from enum import StrEnum


class BindReason(StrEnum):
    """Why the policy selected an effective listener host."""

    NO_USABLE_AUTH = "no_usable_auth"
    PERSISTED_RESTRICTION = "persisted_restriction"
    CONFIGURED = "configured"


@dataclass(frozen=True, slots=True)
class CredentialInventory:
    """Validated, non-secret counts of usable Web credentials.

    Static credentials are the validated ``web.api_token`` and
    ``web.api_tokens`` sources.  Dynamic credentials are the validated token
    manager source.  The caller must exclude malformed/unreadable sources
    rather than representing uncertainty as a positive count.
    """

    static_usable: int = 0
    dynamic_usable: int = 0

    def __post_init__(self) -> None:
        for name, value in (
            ("static_usable", self.static_usable),
            ("dynamic_usable", self.dynamic_usable),
        ):
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"{name} must be a non-negative integer")

    @property
    def usable_count(self) -> int:
        """Total usable credentials without revealing credential material."""
        return self.static_usable + self.dynamic_usable

    @property
    def has_usable_auth(self) -> bool:
        return self.usable_count > 0


@dataclass(frozen=True, slots=True)
class BindDecision:
    """Configured versus policy-selected effective listener host."""

    configured_host: str
    effective_host: str
    reason: BindReason

    @property
    def loopback_restricted(self) -> bool:
        """Whether this decision narrowed exposure to a numeric loopback IP."""
        return self.reason is not BindReason.CONFIGURED


def numeric_loopback(host: str) -> bool:
    """Return true only for a literal IPv4 or IPv6 loopback address.

    Hostnames, including ``localhost``, are intentionally false.  DNS and
    reverse-proxy interpretation cannot prove the address of an active socket.
    Bracketed IPv6 notation is not a socket host literal and is false as well.
    """
    if not isinstance(host, str):
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _loopback_for(configured_host: str) -> str:
    """Preserve an already-safe literal, otherwise choose numeric loopback.

    IPv4-mapped IPv6 addresses are deliberately not treated as numeric
    loopback by :func:`numeric_loopback`, even when their embedded IPv4 value
    is loopback. They are conservatively narrowed rather than relied on as a
    portable listener safety proof.
    """
    if numeric_loopback(configured_host):
        return configured_host
    try:
        configured = ipaddress.ip_address(configured_host)
    except ValueError:
        return "127.0.0.1"
    return "::1" if configured.version == 6 else "127.0.0.1"


def _valid_configured_host(host: str) -> bool:
    """Reject ambiguous control, whitespace, and non-UTF-8-safe host input."""
    if not isinstance(host, str) or not host or host != host.strip():
        return False
    try:
        host.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return not any(character.isspace() or ord(character) < 32 for character in host)


def decide_bind(
    *,
    configured_host: str,
    credentials: CredentialInventory,
    persisted_restriction: bool,
    explicit_widening: bool,
) -> BindDecision:
    """Choose the effective host without changing the configured host.

    No usable auth always wins, including when an operator previously recorded
    widening consent.  With auth, a persisted restriction remains in force
    until explicit widening.  Existing authenticated unrestricted installs
    therefore retain their configured host.
    """
    if not _valid_configured_host(configured_host):
        raise ValueError("configured_host must be a non-empty, whitespace-free host string")
    if not isinstance(persisted_restriction, bool):
        raise ValueError("persisted_restriction must be a bool")
    if not isinstance(explicit_widening, bool):
        raise ValueError("explicit_widening must be a bool")

    if not credentials.has_usable_auth:
        return BindDecision(
            configured_host, _loopback_for(configured_host), BindReason.NO_USABLE_AUTH
        )
    if persisted_restriction and not explicit_widening:
        return BindDecision(
            configured_host,
            _loopback_for(configured_host),
            BindReason.PERSISTED_RESTRICTION,
        )
    return BindDecision(configured_host, configured_host, BindReason.CONFIGURED)


def may_remove_last_credential(
    *, credentials_after_removal: CredentialInventory, actual_listener_host: str
) -> bool:
    """Whether a candidate credential removal is safe at the live boundary.

    This is deliberately based on the actual effective listener host.  Do not
    substitute a persisted desired bind flag: configuration can be saved while
    a broad listener from an earlier start is still accepting connections.
    """
    return credentials_after_removal.has_usable_auth or numeric_loopback(actual_listener_host)
