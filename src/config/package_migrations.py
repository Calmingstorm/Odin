"""Narrow Debian upgrade repairs, preserving operator-owned identities/config."""
from __future__ import annotations

import argparse
import os
from collections.abc import Mapping
from pathlib import Path

from .initialization import (
    InitializationMode,
    InitializationRecoveryRequiredError,
    InitializationState,
)
from .persistence import ConfigPersistError, _config_file_lock, _load_document, _patch_config_paths
from .startup_context import provision_initialization_parent, resolve_startup_context


def migrate_compose_initialization(legacy_config: Path, target_config: Path) -> bool:
    """Preserve setup mode and listener consent when Compose relocates config.

    Retain the old default record for rollback; explicitly pinned records are
    rebound in place under their secured lock. Decode through the real store,
    under both store locks; never infer consent from credentials or ignore a
    corrupt/foreign record. An explicitly selected state path remains selected.
    """
    explicit_state = os.environ.get("ODIN_INITIALIZATION_STATE")
    old = resolve_startup_context(legacy_config, initialization_state=explicit_state)
    new = resolve_startup_context(target_config, initialization_state=explicit_state)
    if old.config_path == new.config_path or not os.path.lexists(old.initialization_state_path):
        return False
    if old.initialization_state_path == new.initialization_state_path:
        # Qualify a pinned record against the new binding first for idempotent
        # retries, then the old binding, under ONE secured store lock.
        store = new.onboarding_store()
        with store._locked():
            state = store._read_locked()
            if state is not None and state.mode is not InitializationMode.RECOVERY:
                return False
            store.binding = old.onboarding_store().binding
            state = store._read_locked()
            if state is None or state.mode is InitializationMode.RECOVERY:
                raise InitializationRecoveryRequiredError(
                    "explicit Compose initialization needs recovery"
                )
            store.binding = new.onboarding_store().binding
            store._write_locked(InitializationState(
                mode=state.mode,
                binding=store.binding,
                loopback_restricted=state.loopback_restricted,
                explicit_widening=state.explicit_widening,
            ))
        return True
    old_store = old.onboarding_store()
    with old_store._locked():
        state = old_store._read_locked()
        if state is None or state.mode is InitializationMode.RECOVERY:
            raise InitializationRecoveryRequiredError(
                "legacy Compose initialization needs recovery"
            )
        provision_initialization_parent(new.initialization_state_path)
        new_store = new.onboarding_store()
        with new_store._locked():
            existing = new_store._read_locked()
            if existing is not None:
                if existing.mode is InitializationMode.RECOVERY:
                    raise InitializationRecoveryRequiredError(
                        "relocated Compose initialization needs recovery"
                    )
                return False
            new_store._write_locked(InitializationState(
                mode=state.mode,
                binding=new_store.binding,
                loopback_restricted=state.loopback_restricted,
                explicit_widening=state.explicit_widening,
            ))
    return True


def migrate_packaged_ssh_key(
    config_path: Path, packaged_key: Path, legacy_key: Path = Path("/app/.ssh/id_ed25519")
) -> bool:
    """Replace only an unusable shipped default with the provisioned identity.

    Missing fields use the same old schema default. Existing files (including
    dangling symlinks) at the legacy path are operator property, not permission
    to switch identities. Custom values and placeholders are never rewritten.
    The normal persistence lock and writer preserve comments, mode and symlinks.
    """
    if not packaged_key.is_file() or os.path.lexists(legacy_key):
        return False
    target = config_path.resolve()
    with _config_file_lock(target):
        document, _mode = _load_document(target)
        if not isinstance(document, Mapping):
            return False
        tools = document.get("tools", {})
        if not isinstance(tools, Mapping):
            return False
        if tools.get("ssh_key_path", str(legacy_key)) != str(legacy_key):
            return False
        try:
            _patch_config_paths([(("tools", "ssh_key_path"), str(packaged_key))], path=target)
        except ConfigPersistError:
            # Shared YAML anchors are valid existing configurations. A repair
            # must not make their upgrade fail or rewrite unrelated aliases.
            print("Odin: SSH path repair requires a manual edit; configuration was preserved.")
            return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair the obsolete Debian SSH key default")
    parser.add_argument("config", type=Path, help="active Debian config or legacy Compose config")
    parser.add_argument("key", type=Path, help="packaged SSH key or relocated Compose config")
    parser.add_argument("--compose-initialization", action="store_true")
    args = parser.parse_args()
    if args.compose_initialization:
        migrate_compose_initialization(args.config, args.key)
        return
    if migrate_packaged_ssh_key(args.config, args.key):
        print("Odin: migrated the unused shipped SSH key path to the packaged identity.")


if __name__ == "__main__":
    main()
