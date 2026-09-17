"""Upgrade compatibility for legacy environment-source selection and publication."""
from __future__ import annotations

import logging
import stat
from pathlib import Path

from src.config.environment import EnvironmentSource, edit_environment
from src.config.startup_context import resolve_startup_context

_GROUP_WRITE_DIAGNOSTIC = (
    "Existing configuration ancestor is group-writable; continuing for upgrade "
    "compatibility: "
)


def test_existing_775_environment_parent_is_accepted_and_diagnosed_once(
    tmp_path: Path, caplog,
) -> None:
    source = tmp_path / "ordinary-umask-002-clone"
    source.mkdir(mode=0o775)
    source.chmod(0o775)

    with caplog.at_level(logging.WARNING, logger="src.config.environment"):
        edit_environment(EnvironmentSource(source / ".env"), {"FIRST": "one"})
        edit_environment(EnvironmentSource(source / ".env"), {"SECOND": "two"})

    assert (source / ".env").read_text() == "FIRST=one\nSECOND=two\n"
    assert stat.S_IMODE((source / ".env").stat().st_mode) == 0o600
    matching = [
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith(_GROUP_WRITE_DIAGNOSTIC)
        and record.getMessage().endswith(str(source))
    ]
    assert matching == [f"{_GROUP_WRITE_DIAGNOSTIC}{source}"]


def test_implicit_environment_source_is_startup_working_directory_not_config_parent(
    tmp_path: Path, monkeypatch,
) -> None:
    startup_directory = tmp_path / "launch"
    startup_directory.mkdir()
    external_config = tmp_path / "configuration" / "config.yml"
    external_config.parent.mkdir()
    external_config.write_text("web: {}\n")
    monkeypatch.chdir(startup_directory)

    context = resolve_startup_context(external_config)
    monkeypatch.chdir(tmp_path)

    assert context.environment_path == startup_directory / ".env"


def test_explicit_environment_source_remains_authoritative(
    tmp_path: Path, monkeypatch,
) -> None:
    startup_directory = tmp_path / "launch"
    startup_directory.mkdir()
    explicit = tmp_path / "secrets" / "odin.env"
    config = tmp_path / "configuration" / "config.yml"
    config.parent.mkdir()
    monkeypatch.chdir(startup_directory)

    context = resolve_startup_context(config, env_file=explicit)

    assert context.environment_path == explicit.absolute()
