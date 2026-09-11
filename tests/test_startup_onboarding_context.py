"""Startup setup context is explicit and does not inherit request CWD."""
from __future__ import annotations

import os

from src.config.initialization import InitializationError, InitializationMode
from src.config.startup_context import (
    default_environment_path,
    default_initialization_state_path,
    installation_id,
    parse_startup_arguments,
    resolve_startup_context,
)


def test_source_defaults_are_adjacent_to_resolved_active_config_not_cwd(tmp_path, monkeypatch):
    config = tmp_path / "installation" / "config.yml"
    config.parent.mkdir()
    elsewhere = tmp_path / "unrelated-cwd"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)

    context = resolve_startup_context(config)

    assert context.config_path == config.resolve()
    assert context.environment_path == config.parent / ".env"
    assert context.initialization_state_path == (
        config.parent / "data" / "initialization" / "state.json"
    )
    assert context.environment_path == default_environment_path(config.resolve())
    assert context.initialization_state_path == default_initialization_state_path(config.resolve())


def test_source_config_symlink_is_canonical_but_declared_env_remains_logical(tmp_path):
    real = tmp_path / "real" / "config.yml"
    real.parent.mkdir()
    real.write_text("web: {}\n")
    declared = tmp_path / "config.yml"
    declared.symlink_to(real)

    context = resolve_startup_context(declared)

    assert context.config_path == real.resolve()
    assert context.environment_path == real.parent / ".env"


def test_explicit_environment_and_state_are_resolved_once(tmp_path, monkeypatch):
    config = tmp_path / "config.yml"
    supplied_env = tmp_path / "secrets" / "odin.env"
    supplied_state = tmp_path / "private" / "state.json"
    monkeypatch.chdir(tmp_path)

    context = resolve_startup_context(
        config, env_file=supplied_env, initialization_state=supplied_state
    )
    monkeypatch.chdir(tmp_path.parent)

    assert context.environment_path == supplied_env.absolute()
    assert context.initialization_state_path == supplied_state.absolute()


def test_cli_environment_contract_prefers_cli_then_environment(monkeypatch):
    monkeypatch.setenv("ODIN_ENV_FILE", "/from/environment.env")
    monkeypatch.setenv("ODIN_INITIALIZATION_STATE", "/from/environment.json")
    inherited = parse_startup_arguments(["/etc/odin/config.yml"])
    explicit = parse_startup_arguments([
        "/etc/odin/config.yml", "--env-file", "/cli.env", "--initialization-state", "/cli.json"
    ])

    assert inherited.env_file == "/from/environment.env"
    assert inherited.initialization_state == "/from/environment.json"
    assert explicit.env_file == "/cli.env"
    assert explicit.initialization_state == "/cli.json"


def test_binding_is_stable_for_active_config_and_distinct_for_other_config(tmp_path, monkeypatch):
    monkeypatch.setattr("src.config.startup_context._machine_identity", lambda: "machine-a")
    first = (tmp_path / "one" / "config.yml").resolve()
    second = (tmp_path / "two" / "config.yml").resolve()

    assert installation_id(first) == installation_id(first)
    assert installation_id(first) != installation_id(second)
    assert not installation_id(first).removeprefix("sha256:").startswith("machine-a")


def test_fresh_context_provisions_one_pending_state_owned_by_current_user(tmp_path):
    config = tmp_path / "config.yml"
    config.write_text("web: {}\n")
    state = tmp_path / "private" / "initialization.json"
    state.parent.mkdir(mode=0o700)
    context = resolve_startup_context(config, initialization_state=state)

    created = context.onboarding_store().provision_fresh()

    assert created.mode is InitializationMode.PENDING
    assert context.onboarding_store().state().mode is InitializationMode.PENDING
    assert state.stat().st_uid == os.geteuid()
    assert state.stat().st_mode & 0o077 == 0


def test_explicit_environment_path_preserves_symlink_identity(tmp_path):
    config = tmp_path / "config.yml"
    config.write_text("web: {}\n")
    target = tmp_path / "target.env"
    link = tmp_path / "declared.env"
    link.symlink_to(target)

    context = resolve_startup_context(config, env_file=link)

    assert context.environment_path == link.absolute()
    assert context.environment_path.is_symlink()


def test_explicit_state_path_preserves_symlink_for_store_rejection(tmp_path):
    config = tmp_path / "config.yml"
    config.write_text("web: {}\n")
    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    target = private / "target.json"
    link = private / "declared.json"
    link.symlink_to(target)

    context = resolve_startup_context(config, initialization_state=link)

    assert context.initialization_state_path == link.absolute()
    assert context.onboarding_store().state().mode is InitializationMode.RECOVERY


def test_default_state_parent_is_private_without_chmodding_shared_data(tmp_path):
    from src.config.startup_context import provision_initialization_parent

    config = tmp_path / "installation" / "config.yml"
    config.parent.mkdir()
    data = config.parent / "data"
    data.mkdir(mode=0o755)
    context = resolve_startup_context(config)

    provision_initialization_parent(context.initialization_state_path)

    assert data.stat().st_mode & 0o777 == 0o755
    assert context.initialization_state_path.parent.stat().st_mode & 0o077 == 0


def test_packaged_state_path_and_legacy_upgrade_migration(tmp_path, monkeypatch):
    from src.config.startup_context import provision_initialization_parent

    monkeypatch.setattr("src.config.startup_context._machine_identity", lambda: "machine-a")
    config = tmp_path / "etc" / "config.yml"
    config.parent.mkdir()
    config.write_text("web: {}\n")
    state = tmp_path / "var" / "lib" / "odin" / "initialization" / "state.json"
    context = resolve_startup_context(config, initialization_state=state)

    provision_initialization_parent(context.initialization_state_path)
    migrated = context.onboarding_store().state(legacy_loopback_restricted=False)

    assert context.initialization_state_path == state.absolute()
    assert migrated.mode is InitializationMode.COMPLETE
    assert context.onboarding_store().state().mode is InitializationMode.COMPLETE


def test_short_config_option_preserves_positional_compatibility():
    assert parse_startup_arguments(["legacy.yml"]).config == "legacy.yml"
    assert parse_startup_arguments(["-c", "explicit.yml"]).config == "explicit.yml"


def test_cli_fresh_provision_is_idempotent_with_private_parent(tmp_path, monkeypatch):
    from src.config.startup_context import provision_fresh_from_cli, provision_initialization_parent

    monkeypatch.setattr("src.config.startup_context._machine_identity", lambda: "test-machine")
    config = tmp_path / "installation" / "config.yml"
    config.parent.mkdir()
    state = tmp_path / "state-parent" / "nested" / "state.json"
    provision_initialization_parent(state)

    assert provision_fresh_from_cli([
        "--provision-fresh-initialization", "--config", str(config),
        "--initialization-state", str(state),
    ]) == 0
    assert state.parent.stat().st_mode & 0o077 == 0
    context = resolve_startup_context(config, initialization_state=state)
    assert context.onboarding_store().state().mode is InitializationMode.PENDING
    try:
        provision_fresh_from_cli([
            "--provision-fresh-initialization", "--config", str(config),
            "--initialization-state", str(state),
        ])
    except InitializationError as exc:
        assert "already exists" in str(exc)
    else:  # pragma: no cover - repeat provisioning must not reset setup state
        raise AssertionError("existing initialization state was overwritten")


def test_cli_refuses_provision_without_explicit_flag():
    from src.config.startup_context import provision_fresh_from_cli

    try:
        provision_fresh_from_cli(["--config", "/tmp/not-used.yml"])
    except SystemExit as exc:
        assert "provision-fresh-initialization" in str(exc)
    else:  # pragma: no cover - the safety gate must remain mandatory
        raise AssertionError("missing explicit provision flag was accepted")
