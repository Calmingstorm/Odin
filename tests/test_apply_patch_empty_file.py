"""Line endings when apply_patch inserts into empty and unterminated files."""
from __future__ import annotations

import pytest

from src.tools.apply_patch import apply_plan, parse_patch


def _update(name: str, *hunks: str) -> dict:
    body = "".join(f"@@\n{hunk}\n" for hunk in hunks)
    return parse_patch(f"*** Begin Patch\n*** Update File: {name}\n{body}*** End Patch\n")


@pytest.mark.parametrize(
    "hunks,expected",
    [
        (("+hello",), b"hello\n"),
        (("+first\n+second",), b"first\nsecond\n"),
        (("+one", "+two"), b"one\ntwo\n"),
    ],
)
def test_lines_added_to_an_empty_file_end_with_a_newline(tmp_path, hunks, expected):
    target = tmp_path / "empty.txt"
    target.write_bytes(b"")

    apply_plan(str(tmp_path), _update("empty.txt", *hunks))

    assert target.read_bytes() == expected


def test_removing_every_line_still_leaves_an_empty_file(tmp_path):
    target = tmp_path / "lines.txt"
    target.write_bytes(b"only\n")

    apply_plan(str(tmp_path), _update("lines.txt", "-only"))

    assert target.read_bytes() == b""


@pytest.mark.parametrize(
    "source,hunk,expected",
    [
        (b"one\ntwo", " two\n+three", b"one\ntwo\nthree"),
        (b"a\nb", " b\n+c\n+d", b"a\nb\nc\nd"),
        (b"x", " x\n+y", b"x\ny"),
        (b"a\r\nb", " b\n+c", b"a\r\nb\r\nc"),
        (b"a\r\nb\nc", " a\n b\n c\n+d", b"a\r\nb\nc\nd"),
        (b"a\nb\r\nc", " b\n c\n+d\n+e", b"a\nb\r\nc\r\nd\r\ne"),
        (b"one\ntwo\n", " two\n+three", b"one\ntwo\nthree\n"),
        (b"one\r\ntwo\r\n", " two\n+three", b"one\r\ntwo\r\nthree\r\n"),
        (b"one\ntwo", "-two\n+TWO", b"one\nTWO"),
    ],
)
def test_existing_line_endings_are_unchanged(tmp_path, source, hunk, expected):
    target = tmp_path / "text.txt"
    target.write_bytes(source)

    apply_plan(str(tmp_path), _update("text.txt", hunk))

    assert target.read_bytes() == expected
