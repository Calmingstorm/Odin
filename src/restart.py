"""Process-global in-place restart intent (self-update, setup wizard).

The WebUI self-updater and the first-boot setup wizard both need the
process to come back after they mutate code or config. Historically they
sent SIGTERM to their own pid and trusted the service supervisor to
resurrect the process — which only ``systemd Restart=always`` (or a Docker
restart policy) actually does: a clean exit under ``Restart=on-failure``,
systemd's default ``Restart=no``, or no supervisor at all is a permanent
stop. The endpoints now record restart intent here instead, and ``main()``
re-execs the interpreter in place once the event loop has fully drained —
same PID, so recovery does not depend on any supervisor policy.
"""

from __future__ import annotations

import os
import sys
from typing import NoReturn

from .odin_log import get_logger

log = get_logger("restart")

_requested: bool = False
_env_overrides: dict[str, str] = {}
_reexec_blocked: str | None = None


def request_restart(env_overrides: dict[str, str] | None = None) -> None:
    """Record that the process should re-exec after graceful shutdown.

    ``env_overrides`` are applied on top of the inherited environment at
    exec time. The setup wizard passes the freshly written
    ``DISCORD_TOKEN``: exec inherits the already-populated ``os.environ``,
    and ``load_dotenv(override=False)`` in the new image would otherwise
    keep serving the stale value. Values may be secrets — never log them.
    """
    global _requested
    _requested = True
    if env_overrides:
        _env_overrides.update(env_overrides)


def restart_requested() -> bool:
    """True once an admin action has requested an in-place restart."""
    return _requested


def block_reexec(reason: str) -> None:
    """Veto the in-place restart (PR #244 round-8 #3).

    Teardown that cannot PROVE it terminated everything it owned must not
    be followed by ``execve``: the new image would inherit surviving
    descendants of the old one with no record of them. The process exits
    instead, so the supervisor starts a clean image.
    """
    global _reexec_blocked
    _reexec_blocked = reason
    log.error("In-place restart vetoed: %s", reason)


def reexec_blocked() -> str | None:
    """The veto reason, or None when re-exec may proceed."""
    return _reexec_blocked


def pending_env_overrides() -> dict[str, str]:
    """Copy of the exec-time environment overrides (inspection/test hook)."""
    return dict(_env_overrides)


def reset() -> None:
    """Clear restart state (test hygiene)."""
    global _requested, _reexec_blocked
    _requested = False
    _reexec_blocked = None
    _env_overrides.clear()


def reexec() -> NoReturn:
    """Replace this process image with a fresh ``python -m src``.

    Must only run after shutdown has completed and the event loop is
    closed — exec destroys the process image immediately, including
    threads and unflushed buffers. The entry point is reconstructed rather
    than replayed from ``sys.argv[0]`` so the systemd unit's
    ``ExecStart=… -m src`` and the ``odin`` console script restart
    identically; positional arguments (the config path) pass through.
    Raises ``OSError`` if exec fails — the caller must exit nonzero so a
    supervisor running ``Restart=on-failure`` gets its chance.
    """
    sys.stdout.flush()
    sys.stderr.flush()
    os.execve(
        sys.executable,
        [sys.executable, "-m", "src", *sys.argv[1:]],
        {**os.environ, **_env_overrides},
    )
