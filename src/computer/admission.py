"""Bounded backend-owned input eligibility evidence, never an operator override.

These records describe the adapter's measurement. Constructing one does not grant
input: source consent, application grounding and lifecycle policy still apply.
Native IDs, socket paths and screenshot contents do not belong in this record.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .models import ComputerError


def _label(value: str, limit: int) -> None:
    if (
        type(value) is not str
        or not value
        or len(value) > limit
        or any(ord(c) < 32 or ord(c) == 127 for c in value)
    ):
        raise ValueError("invalid input admission label")
    try:
        value.encode("utf-8")
    except UnicodeError:
        raise ValueError("invalid input admission label") from None


@dataclass(frozen=True)
class CompositorIdentity:
    name: str
    version: str
    backend: str
    build_id: str

    def __post_init__(self):
        for value in (self.name, self.version, self.backend, self.build_id):
            _label(value, 160)

    def public(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "backend": self.backend,
            "build_id": self.build_id,
        }


@dataclass(frozen=True)
class InputAdmission:
    state: str
    code: str
    reason: str
    remedy: str
    compositor: CompositorIdentity | None = None
    probe_scope: str = "unmeasured"
    checks: tuple[str, ...] = ()

    def __post_init__(self):
        if self.state not in {"pending", "eligible", "refused"}:
            raise ValueError("invalid input admission state")
        if type(self.code) is not str or not re.fullmatch(r"[a-z][a-z0-9_]{0,95}", self.code):
            raise ValueError("invalid input admission code")
        _label(self.reason, 768)
        _label(self.remedy, 768)
        if self.compositor is not None and type(self.compositor) is not CompositorIdentity:
            raise ValueError("invalid compositor identity")
        if self.probe_scope not in {"unmeasured", "same_stack_disposable", "active_session"}:
            raise ValueError("invalid input probe scope")
        if type(self.checks) is not tuple or len(self.checks) > 16:
            raise ValueError("invalid input admission checks")
        for check in self.checks:
            _label(check, 128)
        if self.state == "eligible" and (
            self.compositor is None or self.probe_scope == "unmeasured" or not self.checks
        ):
            raise ValueError("eligible input requires identified measured evidence")

    def public(self) -> dict:
        return {
            "state": self.state,
            "code": self.code,
            "reason": self.reason,
            "remedy": self.remedy,
            "probe_scope": self.probe_scope,
            "compositor": None if self.compositor is None else self.compositor.public(),
            "checks": list(self.checks),
        }


class InputAdmissionError(ComputerError):
    """Safe startup failure with a reviewed evidence record, not a raw exception."""

    def __init__(self, admission: InputAdmission):
        if type(admission) is not InputAdmission or admission.state != "refused":
            raise ValueError("refused admission evidence required")
        self.admission = admission
        identity = admission.compositor
        target = (
            f"{identity.name} {identity.version} ({identity.backend})"
            if identity
            else "Unidentified compositor"
        )
        super().__init__(f"{admission.code}: {target}. {admission.reason} {admission.remedy}")


def public_admission(value) -> dict | None:
    """Revalidate public status fields at HTTP, dropping native extra metadata."""
    if not isinstance(value, dict):
        return None
    try:
        compositor = value.get("compositor")
        if compositor is not None:
            if not isinstance(compositor, dict):
                return None
            compositor = CompositorIdentity(
                **{key: compositor[key] for key in ("name", "version", "backend", "build_id")}
            )
        checks = value.get("checks", [])
        if not isinstance(checks, list) or len(checks) > 16:
            return None
        return InputAdmission(
            **{key: value[key] for key in ("state", "code", "reason", "remedy", "probe_scope")},
            compositor=compositor,
            checks=tuple(checks),
        ).public()
    except (KeyError, TypeError, ValueError):
        return None
