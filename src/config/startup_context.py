"""Explicit, CWD-independent startup inputs for configuration and setup state."""
from __future__ import annotations

import argparse
import hashlib
import os
import stat
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from .environment import EnvironmentSource
from .initialization import InitializationStore, InstallationBinding

_MACHINE_ID_PATHS = (Path("/etc/machine-id"), Path("/var/lib/dbus/machine-id"))


def _absolute(path: str | Path) -> Path:
    """Make a path CWD-independent without dereferencing its final symlink."""
    return Path(os.path.abspath(os.fspath(Path(path).expanduser())))


def default_environment_path(config_path: Path) -> Path:
    """Source installs keep their declared environment beside active config."""
    return config_path.parent / ".env"


def default_initialization_state_path(config_path: Path) -> Path:
    """Keep state in a private child, not the shared application data directory."""
    return config_path.parent / "data" / "initialization" / "state.json"


def _validate_initialization_ancestor(info: os.stat_result, *, terminal: bool) -> None:
    if info.st_uid not in {0, os.geteuid()}:
        raise RuntimeError("initialization directory has unsafe ownership")
    mode = stat.S_IMODE(info.st_mode)
    if terminal:
        if mode & 0o077:
            raise RuntimeError("initialization directory has unsafe mode")
    elif mode & 0o022 and not (info.st_mode & stat.S_ISVTX):
        raise RuntimeError("initialization ancestor is writable without sticky protection")


def provision_initialization_parent(state_path: Path) -> None:
    """Create the terminal private state directory through no-follow descriptors."""
    parent = _absolute(state_path).parent
    parts = parent.parts
    fd = os.open(os.path.sep, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for index, part in enumerate(parts[1:], start=1):
            terminal = index == len(parts) - 1
            try:
                next_fd = os.open(
                    part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd
                )
            except FileNotFoundError:
                os.mkdir(part, 0o700 if terminal else 0o755, dir_fd=fd)
                next_fd = os.open(
                    part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd
                )
            os.close(fd)
            fd = next_fd
            _validate_initialization_ancestor(os.fstat(fd), terminal=terminal)
    except BaseException:
        os.close(fd)
        raise
    os.close(fd)


def _machine_identity() -> str:
    for path in _MACHINE_ID_PATHS:
        try:
            value = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if value:
            return value
    return "machine-id-unavailable"


def installation_id(config_path: Path) -> str:
    """Stable non-secret binding from canonical config path and host machine ID.

    Configuration writes atomically replace inodes, so the canonical path is
    the stable config identity. Machine ID keeps portable paths on distinct
    machines distinct without introducing a second mutable identity record.
    """
    material = f"odin-initialization-v1\0{_machine_identity()}\0{config_path}".encode()
    return "sha256:" + hashlib.sha256(material).hexdigest()


@dataclass(frozen=True, slots=True)
class StartupContext:
    config_path: Path
    environment_path: Path
    initialization_state_path: Path

    def onboarding_store(self) -> InitializationStore:
        return InitializationStore(
            self.initialization_state_path,
            InstallationBinding(installation_id(self.config_path), self.config_path),
        )

    def environment_source(self) -> EnvironmentSource:
        return EnvironmentSource(self.environment_path)


def resolve_startup_context(
    config_path: str | Path,
    *,
    env_file: str | Path | None = None,
    initialization_state: str | Path | None = None,
) -> StartupContext:
    """Resolve supported inputs once, independently of later CWD changes."""
    # Config persistence atomically replaces files, so its canonical path is
    # the installation identity. Other inputs retain their declared symlink.
    config = Path(config_path).expanduser().resolve()
    env = _absolute(env_file) if env_file is not None else default_environment_path(config)
    state = (_absolute(initialization_state) if initialization_state is not None
             else default_initialization_state_path(config))
    return StartupContext(config, env, state)


def parse_startup_arguments(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="odin")
    parser.add_argument("config_positional", nargs="?", help="active configuration file")
    parser.add_argument(
        "-c", "--config", dest="config_override", help="active configuration file"
    )
    parser.add_argument("--env-file", default=os.environ.get("ODIN_ENV_FILE"))
    parser.add_argument(
        "--initialization-state", default=os.environ.get("ODIN_INITIALIZATION_STATE")
    )
    parser.add_argument(
        "--provision-fresh-initialization", action="store_true", help=argparse.SUPPRESS
    )
    args = parser.parse_args(argv)
    args.config = args.config_override or args.config_positional or "config.yml"
    return args


def provision_fresh_from_cli(argv: Sequence[str] | None = None) -> int:
    """Package-only entrypoint creating a pending record as the service user."""
    args = parse_startup_arguments(argv)
    if not args.provision_fresh_initialization:
        raise SystemExit("--provision-fresh-initialization is required")
    context = resolve_startup_context(
        args.config, env_file=args.env_file, initialization_state=args.initialization_state
    )
    context.onboarding_store().provision_fresh()
    return 0


if __name__ == "__main__":
    raise SystemExit(provision_fresh_from_cli())
