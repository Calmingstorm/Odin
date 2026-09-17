"""Bounded Hyprland diagnostics safe for public error boundaries."""

from __future__ import annotations

import errno
from enum import StrEnum

from ..models import ComputerError


class HyprlandFailureStage(StrEnum):
    PROCESS = "process"
    SOCKET = "socket"
    PEER = "peer"
    READ = "read"
    PARSE = "parse"


class HyprlandFailureCause(StrEnum):
    MISSING = "missing"
    UNREADABLE = "unreadable"
    CHANGED = "changed"
    OCCUPIED = "occupied"
    MISMATCH = "mismatch"
    EOF = "eof"
    TIMEOUT = "timeout"
    INVALID = "invalid"
    UNAVAILABLE = "unavailable"


class HyprlandDiagnosticError(ComputerError):
    """A static compatible code; public serialization never includes OS/peer text."""

    def __init__(self, code: str, *, stage: HyprlandFailureStage,
                 cause: HyprlandFailureCause):
        self.stage = stage
        self.cause = cause
        super().__init__(code)

    @property
    def diagnostic(self) -> dict[str, str]:
        return {"stage": self.stage.value, "cause": self.cause.value}


def classified_cause(error: BaseException | None) -> HyprlandFailureCause:
    """Classify errno only. Never retain its text, path, token, or reply."""
    if isinstance(error, TimeoutError):
        return HyprlandFailureCause.TIMEOUT
    if isinstance(error, OSError):
        if error.errno in {errno.ENOENT, errno.ENOTCONN, errno.ECONNREFUSED}:
            return HyprlandFailureCause.MISSING
        if error.errno in {errno.EACCES, errno.EPERM}:
            return HyprlandFailureCause.UNREADABLE
        if error.errno in {errno.EADDRINUSE, errno.EEXIST}:
            return HyprlandFailureCause.OCCUPIED
    return HyprlandFailureCause.UNAVAILABLE
