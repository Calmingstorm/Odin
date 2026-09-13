"""Hyprland recovery evidence, never input or receiver-delivery authority."""

from __future__ import annotations

import os
import select
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class HyprlandRecoveryResult:
    state: str
    binding: dict[str, Any] | None
    cleanup: dict[str, Any]
    reason: str
    inventory: dict[str, Any] | None = None
    original_outcome: str = "outcome_unknown"
    receiver_release_verified: bool = False
    runtime_qualified: bool = False


def ledger_evidence(row: Any, handle: Any) -> dict[str, bool]:
    """Validate original ledger facts; retirement cannot supply release proof."""
    from .hyprland_scope import HyprlandOwnerHandle

    matched = (
        type(handle) is HyprlandOwnerHandle
        and type(row) is dict
        and row.get("owner_matched") is True
        and all(
            type(row.get(key)) is str
            and bool(row[key])
            and row[key] == getattr(handle, key, None)
            for key in ("instance_id", "plugin_epoch", "ledger_id")
        )
    )
    confirmed = bool(
        matched
        and row.get("ledger_empty") is True
        and row.get("release_ack") is True
        and row.get("revoked") is True
        and row.get("unknown_release") is False
        and row.get("receiver_release_verified") is False
    )
    return {
        "owner_matched": bool(matched),
        "release_ack": confirmed,
        "unknown_release": not confirmed,
        "native_owner_retired": bool(
            matched and row.get("retired") is True and row.get("revoked") is True
        ),
        "receiver_release_verified": False,
    }


class CompositorIncarnation:
    """Retained pidfd used ONLY for retirement, never receiver release proof."""

    def __init__(self, pid: int):
        self._fd: int | None = os.pidfd_open(pid, 0)

    def exited(self) -> bool:
        if self._fd is None:
            return False
        poll = select.poll()
        poll.register(self._fd, select.POLLIN)
        return any(events & select.POLLIN for _, events in poll.poll(0))

    def close(self) -> None:
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None
