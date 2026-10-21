"""read_file refuses directories and keeps every diagnostic except gawk's locale warning."""
from __future__ import annotations

import os

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.executor import ToolExecutor
from src.tools.handlers.files_docs import _drop_known_awk_warnings

_WARNING = (
    "awk: cmd. line:16: (FILENAME=- FNR=1) warning: Invalid multibyte data detected. "
    "There may be a mismatch between your data and your locale"
)


def _executor() -> ToolExecutor:
    return ToolExecutor(
        config=ToolsConfig(hosts={"localhost": ToolHost(address="127.0.0.1")})
    )


async def _read(path, **kwargs):
    return await _executor().execute(
        "read_file", {"host": "localhost", "path": str(path), **kwargs}
    )


@pytest.mark.parametrize("raw", [False, True])
async def test_directory_is_a_failure_not_an_empty_range(tmp_path, raw):
    folder = tmp_path / "multi"
    folder.mkdir()

    result = await _read(folder, raw=raw)

    assert not result.ok
    assert "is a directory, not a file." in result.output
    assert "returned empty range" not in result.output
    assert "awk:" not in result.output


@pytest.mark.parametrize("raw", [False, True])
async def test_symlink_to_directory_is_a_failure(tmp_path, raw):
    folder = tmp_path / "real"
    folder.mkdir()
    link = tmp_path / "link"
    link.symlink_to(folder)

    result = await _read(link, raw=raw)

    assert not result.ok
    assert "is a directory, not a file." in result.output


async def test_non_utf8_numbered_read_has_no_awk_warning(tmp_path, monkeypatch):
    monkeypatch.setenv("LC_ALL", "C.UTF-8")
    target = tmp_path / "latin1.txt"
    target.write_bytes(b"caf\xe9\nna\xefve\nplain\n")

    result = await _read(target)

    assert result.ok, result.output
    assert "awk:" not in result.output
    assert result.output.startswith("1: caf")
    assert "3: plain" in result.output


async def test_a_later_invalid_byte_never_joins_the_previous_line(tmp_path, monkeypatch):
    monkeypatch.setenv("LC_ALL", "C.UTF-8")
    target = tmp_path / "later.txt"
    target.write_bytes(b"valid first line\nna\xefve\nplain\n")

    result = await _read(target)

    assert result.ok, result.output
    assert "awk:" not in result.output
    assert result.output.startswith("1: valid first line\n2: na")
    assert result.output.endswith("3: plain\n\n[returned 1-3]")


async def test_utf8_numbered_output_is_unchanged(tmp_path):
    target = tmp_path / "utf8.txt"
    target.write_text("é and 漢字\nsecond 🦊\n", encoding="utf-8")

    result = await _read(target)

    assert result.ok
    assert result.output == "1: é and 漢字\n2: second 🦊\n\n[returned 1-2]"


async def test_missing_file_keeps_its_error(tmp_path):
    result = await _read(tmp_path / "absent.txt")

    assert not result.ok
    assert "No such file" in result.output and "absent.txt" in result.output


@pytest.mark.skipif(os.geteuid() == 0, reason="root can read a mode-000 file")
async def test_unreadable_file_keeps_its_error(tmp_path):
    target = tmp_path / "locked.txt"
    target.write_text("secret-free text\n")
    target.chmod(0)
    try:
        result = await _read(target)
    finally:
        target.chmod(0o600)

    assert not result.ok
    assert "Permission denied" in result.output


@pytest.mark.parametrize(
    "text,expected",
    [
        (f"{_WARNING}\n1: caf�\n\n[returned 1-1]", "1: caf�\n\n[returned 1-1]"),
        (f"1: a\n{_WARNING}.\n2: b", "1: a\n2: b"),
        (f"1: {_WARNING}\n", f"1: {_WARNING}\n"),
        ("awk: cmd. line:3: warning: something else\n1: a",
         "awk: cmd. line:3: warning: something else\n1: a"),
        ("awk: fatal: cannot open file", "awk: fatal: cannot open file"),
        (f"1: a\n{_WARNING} and more\n2: b", f"1: a\n{_WARNING} and more\n2: b"),
    ],
)
def test_only_the_exact_gawk_warning_is_dropped(text, expected):
    assert _drop_known_awk_warnings(text) == expected
