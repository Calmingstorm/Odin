from __future__ import annotations

import multiprocessing
import stat
from pathlib import Path
from typing import Any

import pytest

from src.config.environment import EnvironmentSource, EnvironmentSourceError, edit_environment


def _private(path: Path) -> Path:
    path.mkdir(mode=0o700)
    path.chmod(0o700)
    return path


def test_multihop_symlink_and_preservation(tmp_path: Path) -> None:
    root = _private(tmp_path / "root")
    target = _private(root / "secrets") / "actual.env"
    target.write_text('# user\'s settings\nOTHER="before\ninside"\nTOKEN=old\n')
    _private(root / "links")
    (root / ".env").symlink_to("links/one")
    (root / "links" / "one").symlink_to("../secrets/actual.env")
    edit_environment(EnvironmentSource(root / ".env"), {"TOKEN": "new value"})
    assert (root / ".env").is_symlink() and (root / "links" / "one").is_symlink()
    assert target.read_text() == (
        "# user's settings\nOTHER=\"before\ninside\"\nTOKEN=\"new value\"\n"
    )
    assert stat.S_IMODE(target.stat().st_mode) == 0o600


def test_absent_and_crlf(tmp_path: Path) -> None:
    root = _private(tmp_path / "root")
    env = root / ".env"
    edit_environment(EnvironmentSource(env), {"A": "1"})
    assert env.read_text() == "A=1\n"
    env.write_bytes(b"KEEP=one\r\nTOKEN=old\r\n")
    edit_environment(EnvironmentSource(env), {"TOKEN": "new value"})
    assert env.read_bytes() == b'KEEP=one\r\nTOKEN="new value"\r\n'


def test_rejects_loop_control_and_ambiguous_value(tmp_path: Path) -> None:
    root = _private(tmp_path / "root")
    env = root / ".env"
    env.symlink_to(".env")
    with pytest.raises(EnvironmentSourceError):
        edit_environment(EnvironmentSource(env), {"A": "1"})
    with pytest.raises(EnvironmentSourceError, match="control"):
        edit_environment(EnvironmentSource(root / "x"), {"A": "bad\nX=1"})
    with pytest.raises(EnvironmentSourceError, match="roundtrip"):
        edit_environment(EnvironmentSource(root / "x"), {"A": "${X}'"})


def test_invalid_update_is_rejected_before_any_secret_source_read(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Validation failures must not touch the declared credential source."""
    env = _private(tmp_path / "root") / ".env"
    env.write_text("TOKEN=private-value\n")
    import src.config.environment as environment

    def unexpected_read(*_args: object, **_kwargs: object) -> int:
        raise AssertionError("invalid input must not open the environment source")

    monkeypatch.setattr(environment.os, "open", unexpected_read)
    with pytest.raises(EnvironmentSourceError, match="invalid environment variable name") as error:
        edit_environment(EnvironmentSource(env), {"NOT VALID": "new"})
    assert "private-value" not in str(error.value)


def test_existing_invalid_owned_binding_fails_without_replacing_source(tmp_path: Path) -> None:
    env = _private(tmp_path / "root") / ".env"
    original = "TOKEN='unterminated\nKEEP=private-value\n"
    env.write_text(original)

    with pytest.raises(EnvironmentSourceError, match="invalid dotenv binding") as error:
        edit_environment(EnvironmentSource(env), {"TOKEN": "new-value"})

    assert env.read_text() == original
    assert "private-value" not in str(error.value)


def test_refuses_terminal_swap(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env = _private(tmp_path / "root") / ".env"
    env.write_text("A=old\n")
    import src.config.environment as environment

    original, swapped = environment.os.open, False

    def race(*args: object, **kwargs: object) -> int:
        nonlocal swapped
        if not swapped and kwargs.get("dir_fd") is not None and str(args[0]).startswith("."):
            swapped = True
            env.unlink()
            env.write_text("A=attacker\n")
        return original(*args, **kwargs)  # type: ignore[arg-type, call-arg]

    monkeypatch.setattr(environment.os, "open", race)
    with pytest.raises(EnvironmentSourceError, match="changed"):
        edit_environment(EnvironmentSource(env), {"A": "new"})
    assert env.read_text() == "A=attacker\n"


def _worker(path: str, key: str, start: Any) -> None:
    start.wait()
    edit_environment(EnvironmentSource(path), {key: key.lower()})


def test_alias_concurrent_process_edits(tmp_path: Path) -> None:
    root = _private(tmp_path / "root")
    target = root / "actual.env"
    target.write_text("BASE=1\n")
    alias = root / ".env"
    alias.symlink_to("actual.env")
    start = multiprocessing.Event()
    processes = [
        multiprocessing.Process(target=_worker, args=(str(alias), "ONE", start)),
        multiprocessing.Process(target=_worker, args=(str(target), "TWO", start)),
    ]
    for p in processes:
        p.start()
    start.set()
    for p in processes:
        p.join(10)
        assert p.exitcode == 0
    assert "ONE=one\n" in target.read_text() and "TWO=two\n" in target.read_text()


def test_dotenv_roundtrip(tmp_path: Path) -> None:
    dotenv = pytest.importorskip("dotenv")
    env = _private(tmp_path / "root") / ".env"
    value = r"$literal\\path 'quoted'"
    edit_environment(EnvironmentSource(env), {"TOKEN": value})
    assert dotenv.dotenv_values(env)["TOKEN"] == value


@pytest.mark.parametrize("value", [r"one\\two", r"one\two", "apostrophe's", 'a"b', "", "$plain"])
def test_literal_roundtrip_without_interpolation(tmp_path: Path, value: str) -> None:
    from dotenv import dotenv_values

    env = _private(tmp_path / "root") / ".env"
    edit_environment(EnvironmentSource(env), {"VALUE": value})
    assert dotenv_values(env)["VALUE"] == value


def test_interpolation_and_invalid_existing_grammar_refused(tmp_path: Path) -> None:
    env = _private(tmp_path / "root") / ".env"
    env.write_text("VALUE=old\n")
    with pytest.raises(EnvironmentSourceError, match="roundtrip"):
        edit_environment(EnvironmentSource(env), {"VALUE": "${ODIN_TEST_ABSENT}"})
    assert env.read_text() == "VALUE=old\n"
    env.write_text('BROKEN="unfinished\nVALUE=old\n')
    with pytest.raises(EnvironmentSourceError, match="invalid dotenv"):
        edit_environment(EnvironmentSource(env), {"VALUE": "new"})
    assert env.read_text() == 'BROKEN="unfinished\nVALUE=old\n'


@pytest.mark.parametrize("owner_uid", ["0", 1.5, True])
def test_owner_uid_must_be_exact_integer(tmp_path: Path, owner_uid: object) -> None:
    with pytest.raises(EnvironmentSourceError, match="integer UID"):
        EnvironmentSource(tmp_path / ".env", owner_uid=owner_uid)  # type: ignore[arg-type]


@pytest.mark.parametrize("path", ["relative.env", "/tmp/bad\npath", "/tmp/\ud800"])
def test_source_path_controls_and_surrogates_are_refused(path: str) -> None:
    with pytest.raises(EnvironmentSourceError):
        EnvironmentSource(path)


def test_parent_symlink_is_rejected_before_terminal_open(tmp_path: Path) -> None:
    root = _private(tmp_path / "root")
    _private(root / "real")
    alias = root / "alias"
    alias.symlink_to("real", target_is_directory=True)
    with pytest.raises(EnvironmentSourceError, match="must not be a symlink"):
        edit_environment(EnvironmentSource(alias / ".env"), {"A": "1"})


def test_sticky_ancestor_allowed_but_terminal_directory_must_be_private(tmp_path: Path) -> None:
    sticky = tmp_path / "sticky"
    sticky.mkdir(mode=0o1777)
    sticky.chmod(0o1777)
    private = _private(sticky / "private")
    edit_environment(EnvironmentSource(private / ".env"), {"A": "1"})
    for mode in (0o770, 0o707, 0o1777):
        unsafe = sticky / f"unsafe-{mode:o}"
        unsafe.mkdir(mode=mode)
        unsafe.chmod(mode)
        with pytest.raises(EnvironmentSourceError, match="writable by others"):
            edit_environment(EnvironmentSource(unsafe / ".env"), {"A": "1"})


def test_dangling_symlink_is_preserved(tmp_path: Path) -> None:
    root = _private(tmp_path / "root")
    env = root / ".env"
    env.symlink_to("created.env")
    result = edit_environment(EnvironmentSource(env), {"A": "1"})
    assert result.terminal_path == root / "created.env"
    assert env.is_symlink()
    assert (root / "created.env").read_text() == "A=1\n"


def test_duplicate_keys_are_rewritten_deterministically(tmp_path: Path) -> None:
    env = _private(tmp_path / "root") / ".env"
    env.write_text("A=old\nA=older\nB=keep\n")
    edit_environment(EnvironmentSource(env), {"A": "new"})
    assert env.read_text() == "A=new\nA=new\nB=keep\n"


def test_source_size_bound_preserves_original(tmp_path: Path) -> None:
    env = _private(tmp_path / "root") / ".env"
    original = "#" * (1024 * 1024 + 1)
    env.write_text(original)
    with pytest.raises(EnvironmentSourceError, match="too large"):
        edit_environment(EnvironmentSource(env), {"A": "1"})
    assert env.read_text() == original


def test_file_fsync_failure_preserves_original_and_cleans_temporary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = _private(tmp_path / "root") / ".env"
    env.write_text("A=old\n")
    import src.config.environment as environment

    monkeypatch.setattr(environment.os, "fsync", lambda _fd: (_ for _ in ()).throw(OSError("nope")))
    with pytest.raises(EnvironmentSourceError, match="before commit"):
        edit_environment(EnvironmentSource(env), {"A": "new"})
    assert env.read_text() == "A=old\n"
    assert not list(env.parent.glob(".*.tmp"))


def test_directory_fsync_failure_reports_not_durable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = _private(tmp_path / "root") / ".env"
    env.write_text("A=old\n")
    import src.config.environment as environment

    real_fsync, calls = environment.os.fsync, 0

    def fail_directory_sync(fd: int) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("directory sync failed")
        real_fsync(fd)

    monkeypatch.setattr(environment.os, "fsync", fail_directory_sync)
    result = edit_environment(EnvironmentSource(env), {"A": "new"})
    assert result == environment.EnvironmentWriteResult(env, False)
    assert env.read_text() == "A=new\n"


def test_publication_forces_private_mode_despite_umask(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = _private(tmp_path / "root") / ".env"
    import src.config.environment as environment

    original_open = environment.os.open

    def permissive_creation(*args: object, **kwargs: object) -> int:
        if kwargs.get("dir_fd") is not None and str(args[0]).startswith("."):
            args = (*args[:2], 0o666, *args[3:])
        return original_open(*args, **kwargs)  # type: ignore[arg-type, call-arg]

    monkeypatch.setattr(environment.os, "open", permissive_creation)
    edit_environment(EnvironmentSource(env), {"A": "1"})
    assert stat.S_IMODE(env.stat().st_mode) == 0o600
