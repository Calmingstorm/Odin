"""Durable, installation-bound initialization state.

This is deliberately a small persistence primitive, not an onboarding flow.
It records whether an explicitly identified installation is still being
provisioned, has completed setup, or needs operator recovery.  In particular,
credential files are not an input to this state machine: deleting a Discord or
web credential must never turn a completed installation back into setup.

The state file is separate from configuration and token stores.  It also holds
the D3 listener decision (restriction and explicit widening consent), so a
future auth change cannot reinterpret credential presence as permission to
widen a listener.
"""

from __future__ import annotations

import contextlib
import fcntl
import json
import os
import secrets
import stat
import threading
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import TypeVar

STATE_VERSION = 1
_MAX_STATE_BYTES = 64 * 1024
_MAX_INSTALLATION_ID_BYTES = 256
_MAX_CONFIG_PATH_BYTES = 4096
_T = TypeVar("_T")
_thread_locks: dict[Path, threading.RLock] = {}
_thread_locks_guard = threading.Lock()


class InitializationMode(StrEnum):
    """Externally meaningful initialization modes."""

    PENDING = "pending"
    COMPLETE = "complete"
    RECOVERY = "recovery"


class InitializationError(RuntimeError):
    """Base class for initialization-state persistence failures."""


class InitializationAlreadyCompleteError(InitializationError):
    """Completion was requested after a durable completion record existed."""


class InitializationRecoveryRequiredError(InitializationError):
    """A corrupt, unreadable, or foreign state record must not be overwritten."""


class InitializationCommittedDurabilityError(InitializationError):
    """The new record was renamed, but directory durability could not be confirmed."""


class InitializationReentrancyError(InitializationError):
    """A callback tried to operate on its store while its publication lock was held."""


@dataclass(frozen=True, slots=True)
class InstallationBinding:
    """Stable identity supplied by the active installation/configuration owner.

    ``config_path`` is deliberately a resolved path, not an inode: normal
    config persistence atomically replaces its inode.  ``installation_id`` is
    an opaque, installation-scoped value supplied by packaging/config context.
    The pair detects accidentally sharing a state file between active configs
    or installations without treating ordinary config edits as corruption.
    """

    installation_id: str
    config_path: Path

    def normalized(self) -> InstallationBinding:
        if not isinstance(self.installation_id, str) or not self.installation_id:
            raise ValueError("installation_id must be a non-empty string")
        _validate_scalar(self.installation_id, _MAX_INSTALLATION_ID_BYTES, "installation_id")
        if not isinstance(self.config_path, Path):
            raise TypeError("config_path must be a pathlib.Path")
        if not self.config_path.is_absolute():
            raise ValueError("config_path must be absolute")
        config_path = str(self.config_path)
        _validate_scalar(config_path, _MAX_CONFIG_PATH_BYTES, "config_path")
        return InstallationBinding(self.installation_id, Path(config_path))


def _validate_scalar(value: str, max_bytes: int, name: str) -> None:
    """Accept bounded UTF-8 scalar values without control characters."""
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in value):
        raise ValueError(f"{name} must not contain control characters")
    if len(value.encode("utf-8")) > max_bytes:
        raise ValueError(f"{name} exceeds the size limit")


@dataclass(frozen=True, slots=True)
class InitializationState:
    """A decoded state result. Recovery states are never persisted implicitly."""

    mode: InitializationMode
    binding: InstallationBinding
    loopback_restricted: bool
    explicit_widening: bool
    detail: str | None = None
    version: int = STATE_VERSION

    @property
    def setup_allowed(self) -> bool:
        return self.mode is InitializationMode.PENDING


def _lock_for(path: Path) -> threading.RLock:
    with _thread_locks_guard:
        return _thread_locks.setdefault(path, threading.RLock())


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """Reject duplicate JSON keys instead of accepting last-key-wins ambiguity."""
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


class InitializationStore:
    """Secure serialized state store for one declared installation binding.

    All read-modify-publish operations hold a same-process reentrant lock and a
    sidecar advisory file lock.  Completion callers publish their config/env
    work while that lock is held, then publish ``complete`` last.  This does
    not pretend the two files form a transaction: a failed publisher leaves a
    durable pending record and can be retried or recovered by an operator.
    """

    def __init__(self, path: Path | str, binding: InstallationBinding) -> None:
        # Do not resolve the state path: that follows a final symlink before we
        # can reject it as a non-regular record.
        self.path = Path(path).expanduser().absolute()
        if self.path.name in {"", ".", ".."}:
            raise ValueError("initialization state path must name a file")
        self.binding = binding.normalized()
        self._lock_path = self.path.with_name(f".{self.path.name}.lock")
        self._parent_fd: int | None = None
        self._parent_identity: tuple[int, int] | None = None
        self._operation_local = threading.local()

    def state(self, *, legacy_loopback_restricted: bool | None = None) -> InitializationState:
        """Read the current state without ever inferring it from credentials."""
        with self._locked():
            state = self._read_locked()
            if state is None:
                # D3 policy must come from a verified authentication decision.
                # Defaulting it here would silently narrow an authenticated
                # legacy installation merely because it predates this record.
                if type(legacy_loopback_restricted) is not bool:
                    return self._recovery(
                        "missing initialization record requires verified legacy bind policy"
                    )
                migrated = self._new_state(
                    InitializationMode.COMPLETE,
                    loopback_restricted=legacy_loopback_restricted,
                    explicit_widening=False,
                )
                try:
                    self._write_locked(migrated)
                except InitializationError as exc:
                    return self._recovery(str(exc))
                return migrated
            return state

    def provision_fresh(self) -> InitializationState:
        """Explicitly create a fresh-install pending record.

        Installers call this only for a real fresh provision.  Refusing to
        overwrite any existing record prevents an upgrade from resetting a
        completed installation merely because packaging ran again.
        """
        with self._locked():
            existing = self._read_locked()
            if existing is not None:
                if existing.mode is InitializationMode.RECOVERY:
                    raise InitializationRecoveryRequiredError(
                        existing.detail or "state needs recovery"
                    )
                raise InitializationError("initialization state already exists")
            pending = self._new_state(InitializationMode.PENDING)
            self._write_locked(pending)
            return pending

    def complete(self, publish: Callable[[], _T]) -> _T:
        """Run final allowlisted publication once, then durably mark complete.

        The callback may raise.  In that case this method does not alter state;
        callers get the original failure and the installation remains pending.
        A second concurrent completion waits, observes ``complete``, and gets
        :class:`InitializationAlreadyCompleteError` without running its publisher.
        """
        with self._locked():
            state = self._require_known_locked()
            if state.mode is InitializationMode.COMPLETE:
                raise InitializationAlreadyCompleteError("initialization is already complete")
            if state.mode is InitializationMode.RECOVERY:
                raise InitializationRecoveryRequiredError(state.detail or "state needs recovery")
            result = publish()
            self._write_locked(
                InitializationState(
                    mode=InitializationMode.COMPLETE,
                    binding=self.binding,
                    loopback_restricted=state.loopback_restricted,
                    explicit_widening=state.explicit_widening,
                )
            )
            return result

    def set_bind_decision(
        self, *, loopback_restricted: bool, explicit_widening: bool
    ) -> InitializationState:
        """Persist D3 policy independently from authentication or setup mode."""
        with self._locked():
            state = self._require_known_locked()
            if state.mode is InitializationMode.RECOVERY:
                raise InitializationRecoveryRequiredError(state.detail or "state needs recovery")
            self._validate_bind_decision(loopback_restricted, explicit_widening)
            changed = InitializationState(
                mode=state.mode,
                binding=self.binding,
                loopback_restricted=loopback_restricted,
                explicit_widening=explicit_widening,
            )
            self._write_locked(changed)
            return changed

    def _new_state(
        self,
        mode: InitializationMode,
        *,
        loopback_restricted: bool = True,
        explicit_widening: bool = False,
    ) -> InitializationState:
        self._validate_bind_decision(loopback_restricted, explicit_widening)
        return InitializationState(
            mode=mode,
            binding=self.binding,
            loopback_restricted=loopback_restricted,
            explicit_widening=explicit_widening,
        )

    def _recovery(self, detail: str) -> InitializationState:
        return InitializationState(
            mode=InitializationMode.RECOVERY,
            binding=self.binding,
            loopback_restricted=True,
            explicit_widening=False,
            detail=detail,
        )

    def _require_known_locked(self) -> InitializationState:
        state = self._read_locked()
        if state is None:
            # A caller completing a legacy install must first migrate it through
            # state(), rather than silently assuming a missing file is pending.
            return self._recovery("initialization record is absent")
        return state

    def _read_locked(self) -> InitializationState | None:
        parent_fd = self._require_parent_fd()
        try:
            info = os.stat(self.path.name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            return None
        except OSError:
            return self._recovery("initialization record is unreadable")
        if not stat.S_ISREG(info.st_mode):
            return self._recovery("initialization record is not a regular file")
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
            return self._recovery("initialization record has unsafe ownership or mode")
        if info.st_size > _MAX_STATE_BYTES:
            return self._recovery("initialization record exceeds the size limit")
        try:
            fd = os.open(self.path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
            try:
                opened = os.fstat(fd)
                if (
                    not stat.S_ISREG(opened.st_mode)
                    or opened.st_dev != info.st_dev
                    or opened.st_ino != info.st_ino
                    or opened.st_uid != os.geteuid()
                    or stat.S_IMODE(opened.st_mode) & 0o077
                    or opened.st_size > _MAX_STATE_BYTES
                ):
                    raise ValueError
                with os.fdopen(fd, "rb") as handle:
                    fd = -1
                    raw = handle.read(_MAX_STATE_BYTES + 1)
                if len(raw) > _MAX_STATE_BYTES:
                    raise ValueError
            except BaseException:
                if fd >= 0:
                    os.close(fd)
                raise
            decoded = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object)
            if not isinstance(decoded, dict) or set(decoded) != {
                "version",
                "mode",
                "installation_id",
                "config_path",
                "loopback_restricted",
                "explicit_widening",
            }:
                raise ValueError
            state = InitializationState(
                mode=InitializationMode(decoded["mode"]),
                binding=InstallationBinding(
                    decoded["installation_id"], Path(decoded["config_path"])
                ).normalized(),
                loopback_restricted=decoded["loopback_restricted"],
                explicit_widening=decoded["explicit_widening"],
                version=decoded["version"],
            )
            if (
                type(state.version) is not int
                or state.version != STATE_VERSION
                or not isinstance(decoded["mode"], str)
                or not isinstance(decoded["installation_id"], str)
                or not isinstance(decoded["config_path"], str)
                or not isinstance(state.loopback_restricted, bool)
                or not isinstance(state.explicit_widening, bool)
            ):
                raise ValueError
            self._validate_bind_decision(state.loopback_restricted, state.explicit_widening)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
            return self._recovery("initialization record is corrupt or unreadable")
        if state.binding != self.binding:
            return self._recovery("initialization record does not match the active installation")
        return state

    @staticmethod
    def _validate_bind_decision(loopback_restricted: bool, explicit_widening: bool) -> None:
        if type(loopback_restricted) is not bool or type(explicit_widening) is not bool:
            raise ValueError("bind decision values must be booleans")
        if loopback_restricted and explicit_widening:
            raise ValueError("a loopback-restricted listener cannot be explicitly widened")

    def _write_locked(self, state: InitializationState) -> None:
        if state.mode is InitializationMode.RECOVERY:
            raise InitializationError("recovery state is diagnostic-only")
        self._validate_bind_decision(state.loopback_restricted, state.explicit_widening)
        parent_fd = self._require_parent_fd()
        payload = {
            "version": STATE_VERSION,
            "mode": state.mode.value,
            "installation_id": state.binding.installation_id,
            "config_path": str(state.binding.config_path),
            "loopback_restricted": state.loopback_restricted,
            "explicit_widening": state.explicit_widening,
        }
        encoded = (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode()
        try:
            existing = os.stat(self.path.name, dir_fd=parent_fd, follow_symlinks=False)
            if not stat.S_ISREG(existing.st_mode):
                raise InitializationError("refusing to replace a non-regular initialization record")
            if existing.st_uid != os.geteuid() or stat.S_IMODE(existing.st_mode) & 0o077:
                raise InitializationError("refusing to replace unsafe initialization record")
        except FileNotFoundError:
            pass
        except OSError as exc:
            raise InitializationError("cannot inspect initialization record") from exc
        try:
            temporary = f".{self.path.name}.{secrets.token_hex(16)}.tmp"
            fd = os.open(
                temporary,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=parent_fd,
            )
            try:
                os.fchmod(fd, 0o600)
                with os.fdopen(fd, "wb") as handle:
                    handle.write(encoded)
                    handle.flush()
                    os.fsync(handle.fileno())
                self._check_parent_identity(parent_fd)
                os.replace(temporary, self.path.name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
            except BaseException:
                with contextlib.suppress(OSError):
                    os.unlink(temporary, dir_fd=parent_fd)
                raise
            try:
                self._check_parent_identity(parent_fd)
                os.fsync(parent_fd)
            except OSError as exc:
                raise InitializationCommittedDurabilityError(
                    "initialization record committed but directory durability is unconfirmed"
                ) from exc
        except InitializationError:
            raise
        except OSError as exc:
            raise InitializationError("cannot publish initialization record") from exc

    @contextlib.contextmanager
    def _locked(self):
        if getattr(self._operation_local, "active", False):
            raise InitializationReentrancyError(
                "nested operations on an initialization store are not permitted"
            )
        self._operation_local.active = True
        thread_lock = _lock_for(self._lock_path)
        try:
            with thread_lock:
                parent_fd: int | None = None
                fd: int | None = None
                try:
                    parent_fd = self._open_trusted_parent()
                    self._parent_fd = parent_fd
                    self._parent_identity = self._identity(parent_fd)
                    try:
                        lock_info = os.stat(
                            self._lock_path.name, dir_fd=parent_fd, follow_symlinks=False
                        )
                        if (
                            not stat.S_ISREG(lock_info.st_mode)
                            or lock_info.st_uid != os.geteuid()
                            or stat.S_IMODE(lock_info.st_mode) & 0o077
                        ):
                            raise InitializationError(
                                "initialization lock has unsafe ownership or mode"
                            )
                    except FileNotFoundError:
                        pass
                    fd = os.open(
                        self._lock_path.name,
                        os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,
                        0o600,
                        dir_fd=parent_fd,
                    )
                    opened_lock = os.fstat(fd)
                    if (
                        not stat.S_ISREG(opened_lock.st_mode)
                        or opened_lock.st_uid != os.geteuid()
                        or stat.S_IMODE(opened_lock.st_mode) & 0o077
                    ):
                        raise InitializationError(
                            "initialization lock has unsafe ownership or mode"
                        )
                    fcntl.flock(fd, fcntl.LOCK_EX)
                except (OSError, InitializationError) as exc:
                    if fd is not None:
                        with contextlib.suppress(OSError):
                            os.close(fd)
                    if parent_fd is not None:
                        with contextlib.suppress(OSError):
                            os.close(parent_fd)
                    self._parent_fd = None
                    self._parent_identity = None
                    raise InitializationError("cannot acquire initialization lock") from exc
                try:
                    yield
                finally:
                    with contextlib.suppress(OSError):
                        fcntl.flock(fd, fcntl.LOCK_UN)  # type: ignore[arg-type]
                    os.close(fd)  # type: ignore[arg-type]
                    self._parent_fd = None
                    self._parent_identity = None
                    os.close(parent_fd)  # type: ignore[arg-type]
        finally:
            self._operation_local.active = False

    @staticmethod
    def _identity(fd: int) -> tuple[int, int]:
        info = os.fstat(fd)
        return info.st_dev, info.st_ino

    def _require_parent_fd(self) -> int:
        if self._parent_fd is None:
            raise InitializationError("initialization operation has no trusted parent directory")
        self._check_parent_identity(self._parent_fd)
        return self._parent_fd

    def _check_parent_identity(self, parent_fd: int) -> None:
        if self._parent_identity != self._identity(parent_fd):
            raise InitializationError("trusted initialization parent changed during operation")
        reopened_fd = self._open_trusted_parent()
        try:
            if self._parent_identity != self._identity(reopened_fd):
                raise InitializationError(
                    "trusted initialization parent was rebound during operation"
                )
        finally:
            os.close(reopened_fd)

    def _open_trusted_parent(self) -> int:
        """Open an existing terminal parent through no-follow directory descriptors."""
        parts = self.path.parent.parts
        if not parts or parts[0] != os.path.sep:
            raise InitializationError("initialization parent must be absolute")
        fd = os.open(os.path.sep, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            self._validate_parent_directory(os.fstat(fd), terminal=len(parts) == 1)
            for index, part in enumerate(parts[1:], start=1):
                next_fd = os.open(
                    part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd
                )
                os.close(fd)
                fd = next_fd
                self._validate_parent_directory(
                    os.fstat(fd), terminal=index == len(parts) - 1
                )
            return fd
        except BaseException:
            os.close(fd)
            raise

    @staticmethod
    def _validate_parent_directory(info: os.stat_result, *, terminal: bool) -> None:
        if info.st_uid not in {0, os.geteuid()}:
            raise InitializationError("initialization ancestor has unsafe ownership")
        mode = stat.S_IMODE(info.st_mode)
        if terminal:
            if mode & 0o077:
                raise InitializationError("initialization parent has unsafe ownership or mode")
        elif mode & 0o022 and not (info.st_mode & stat.S_ISVTX):
            raise InitializationError(
                "initialization ancestor is writable without sticky protection"
            )
