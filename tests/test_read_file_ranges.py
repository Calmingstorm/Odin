"""End-to-end range and output-budget pins for read_file."""
from __future__ import annotations

import base64
import hashlib
import json
import os
from unittest.mock import AsyncMock

from src.config.schema import ToolHost, ToolsConfig
from src.tools.executor import ToolExecutor


def _executor() -> ToolExecutor:
    return ToolExecutor(
        config=ToolsConfig(hosts={"localhost": ToolHost(address="127.0.0.1")})
    )


async def _read(executor: ToolExecutor, path, **kwargs):
    return await executor.execute(
        "read_file", {"host": "localhost", "path": str(path), **kwargs}
    )


async def test_returns_true_source_numbers_and_exact_interval(tmp_path):
    target = tmp_path / "sample.txt"
    target.write_text("".join(f"value-{i}\n" for i in range(1, 11)))

    result = await _read(_executor(), target, start_line=4, lines=3)

    assert result.ok
    assert result.output == (
        "4: value-4\n5: value-5\n6: value-6\n\n"
        "[returned 4-6, continue at start_line=7]"
    )
    assert result.truncated is False


async def test_past_eof_is_explicit_empty_range(tmp_path):
    target = tmp_path / "sample.txt"
    target.write_text("one\ntwo\n")

    result = await _read(_executor(), target, start_line=50, lines=10)

    assert result.ok
    assert result.output == "[returned empty range starting at start_line=50]"
    assert result.truncated is False


async def test_maximum_start_line_is_preserved_exactly(tmp_path):
    target = tmp_path / "sample.txt"
    target.write_text("one\ntwo\n")
    maximum = 2**53 - 1

    result = await _read(_executor(), target, start_line=maximum, lines=1)

    assert result.ok
    assert result.output == f"[returned empty range starting at start_line={maximum}]"


async def test_output_budget_keeps_contiguous_prefix_and_cursor(tmp_path):
    target = tmp_path / "large.txt"
    target.write_text("".join(f"row-{i}-" + ("x" * 180) + "\n" for i in range(1, 301)))

    first = await _read(_executor(), target, start_line=80, lines=200)

    assert first.ok
    assert len(first.output) < 12_000
    assert "characters omitted" not in first.output
    body, notice = first.output.rsplit("\n\n", 1)
    numbered = [int(line.split(":", 1)[0]) for line in body.splitlines()]
    assert numbered == list(range(80, numbered[-1] + 1))
    assert notice == (
        f"[returned 80-{numbered[-1]}, continue at start_line={numbered[-1] + 1}]"
    )
    assert numbered[-1] < 279
    assert first.truncated is False

    second = await _read(
        _executor(), target, start_line=numbered[-1] + 1, lines=200
    )
    assert second.output.startswith(f"{numbered[-1] + 1}: row-{numbered[-1] + 1}-")


async def test_one_oversize_source_line_fails_without_splicing(tmp_path):
    target = tmp_path / "wide.txt"
    target.write_text(("z" * 30_000) + "\nafter\n")

    result = await _read(_executor(), target, start_line=1, lines=2)

    assert result.ok is False
    assert len(result.output) < 12_000
    assert "output truncated" not in result.output
    assert "characters omitted" not in result.output
    assert result.output == (
        "Error: source line 1 exceeds the read_file output budget; no lines returned."
    )


async def test_read_error_is_bounded_by_handler(tmp_path):
    executor = _executor()
    long_error = "Command failed (exit 1):\n" + ("e" * 30_000)
    executor.files_docs_tools._run_on_host = AsyncMock(return_value=(long_error, 1))

    result = await _read(executor, tmp_path / "missing", lines=2)

    assert result.ok is False
    assert len(result.output) < 12_000
    assert result.output.endswith("[read_file error truncated by handler output budget]")
    assert "characters omitted" not in result.output


async def test_transport_marker_literal_in_file_content_is_not_rejected(tmp_path):
    target = tmp_path / "marker.txt"
    target.write_text(
        "before\n... (output truncated) ...\nafter\nlast\n",
        encoding="utf-8",
    )

    result = await _read(_executor(), target, start_line=1, lines=3)

    assert result.ok
    assert result.output == (
        "1: before\n2: ... (output truncated) ...\n3: after\n\n"
        "[returned 1-3, continue at start_line=4]"
    )
    assert result.truncated is False


async def test_overbudget_transport_output_is_bounded_by_handler(tmp_path):
    executor = _executor()
    transported = (
        ("h" * 8_000)
        + "\n\n... (output truncated) ...\n\n"
        + ("t" * 8_000)
    )
    executor.files_docs_tools._run_on_host = AsyncMock(
        return_value=(transported, 1)
    )

    result = await _read(executor, tmp_path / "missing", lines=2)

    assert result.ok is False
    assert len(result.output) < 12_000
    assert result.output.endswith("[read_file error truncated by handler output budget]")

_RAW_HEADER = "<<<ODIN_READ_FILE_RAW_V1 "
_RAW_SEPARATOR = ">>>\n<<<ODIN_READ_FILE_RAW_CONTENT_V1>>>\n"
_RAW_END = "<<<ODIN_READ_FILE_RAW_END_V1>>>"


def _split_raw(output: str) -> tuple[dict, bytes]:
    header, framed = output[len(_RAW_HEADER):].split(_RAW_SEPARATOR, 1)
    metadata = json.loads(header)
    encoded = framed.encode("utf-8")
    content_bytes = metadata["content_bytes"]
    content = encoded[:content_bytes]
    assert encoded[content_bytes:] == _RAW_END.encode("ascii")
    return metadata, content


async def test_raw_mode_temp_artifacts_are_private_and_unpredictable(tmp_path, monkeypatch):
    target = tmp_path / "raw-private.txt"
    target.write_bytes(b"private source bytes\n")
    observed = tmp_path / "observed-modes.txt"
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    shim_dir = tmp_path / "shim"
    shim_dir.mkdir()
    shim = shim_dir / "base64"
    shim.write_text(
        "#!/bin/sh\n"
        f"for p in \"$TMPDIR\"/*; do stat -c '%a %n' \"$p\"; "
        f"done > {observed}\n"
        "exec /usr/bin/base64 \"$@\"\n",
        encoding="utf-8",
    )
    shim.chmod(0o755)
    monkeypatch.setenv("PATH", f"{shim_dir}:{os.environ['PATH']}")
    monkeypatch.setenv("TMPDIR", str(artifacts))

    old_umask = os.umask(0o022)
    try:
        result = await _read(_executor(), target, raw=True)
    finally:
        os.umask(old_umask)

    assert result.ok
    modes = [line.split(" ", 1)[0] for line in observed.read_text().splitlines()]
    assert len(modes) == 3
    assert modes == ["600", "600", "600"]


async def test_raw_mode_returns_framed_byte_faithful_content(tmp_path):
    target = tmp_path / "raw.txt"
    source = b"alpha\r\nbeta\r\ngamma\r\n"
    target.write_bytes(source)

    result = await _read(_executor(), target, start_line=1, lines=2, raw=True)
    metadata, content = _split_raw(result.output)

    assert result.ok
    assert metadata == {
        "requested_start_line": 1,
        "requested_lines": 2,
        "returned_start_line": 1,
        "returned_end_line": 2,
        "truncated": True,
        "continue_at_start_line": 3,
        "content_encoding": "utf-8",
        "content_bytes": len(b"alpha\r\nbeta\r\n"),
        "content_redacted": False,
    }
    assert content == b"alpha\r\nbeta\r\n"
    assert b"1: " not in content


async def test_raw_mode_preserves_missing_final_newline(tmp_path):
    target = tmp_path / "raw-no-newline.txt"
    source = b"one\ntwo"
    target.write_bytes(source)

    result = await _read(_executor(), target, raw=True)
    metadata, content = _split_raw(result.output)

    assert metadata["truncated"] is False
    assert metadata["continue_at_start_line"] is None
    assert metadata["content_bytes"] == len(source)
    assert content == source


async def test_raw_mode_machine_content_hash_matches_source(tmp_path):
    target = tmp_path / "raw-hash.txt"
    source = b"first\r\nsecond\nthird-without-final-newline"
    target.write_bytes(source)

    result = await _read(_executor(), target, raw=True)
    metadata, content = _split_raw(result.output)

    assert metadata["truncated"] is False
    assert hashlib.sha256(content).digest() == hashlib.sha256(source).digest()


async def test_raw_mode_rejects_non_utf8_content(tmp_path):
    target = tmp_path / "raw-non-utf8.bin"
    target.write_bytes(b"\xff\xfe\x00ordinary-source-bytes\n")

    result = await _read(_executor(), target, raw=True)

    assert result.ok is False
    assert result.output == "Error: read_file raw mode requires UTF-8 text content."


async def test_raw_mode_redacts_before_framing_and_updates_length(tmp_path):
    target = tmp_path / "raw-secret.txt"
    target.write_bytes(b"before password=do-not-reveal after\n")

    result = await _read(_executor(), target, raw=True)
    metadata, content = _split_raw(result.output)

    assert result.ok
    assert content == b"before [REDACTED] after\n"
    assert metadata["content_redacted"] is True
    assert metadata["content_bytes"] == len(content)


async def test_raw_frame_survives_outer_secret_scrubber(tmp_path):
    from src.llm.secret_scrubber import scrub_output_secrets

    target = tmp_path / "raw.txt"
    target.write_bytes(b"ordinary UTF-8 source\n")
    result = await _read(_executor(), target, raw=True)

    assert scrub_output_secrets(result.output) == result.output


async def test_raw_mode_rejects_invalid_internal_transport_envelope(tmp_path):
    executor = _executor()
    executor.files_docs_tools._run_on_host = AsyncMock(
        return_value=("not-base64\nODIN_READ_FILE_RAW_META_V1\t1\t2\t1\t1\t-\t3\n", 0)
    )

    result = await _read(executor, tmp_path / "ignored", raw=True)

    assert result.ok is False
    assert result.output == "Error: read_file raw transport returned an invalid envelope."


async def test_raw_mode_empty_range_is_explicit_and_unambiguous(tmp_path):
    target = tmp_path / "raw-empty.txt"
    target.write_bytes(b"one\n")

    result = await _read(_executor(), target, start_line=9, raw=True)
    metadata, content = _split_raw(result.output)

    assert metadata == {
        "requested_start_line": 9,
        "requested_lines": 200,
        "returned_start_line": None,
        "returned_end_line": None,
        "truncated": False,
        "continue_at_start_line": None,
        "content_encoding": "utf-8",
        "content_bytes": 0,
        "content_redacted": False,
    }
    assert content == b""


async def test_raw_mode_content_may_contain_markers(tmp_path):
    target = tmp_path / "raw-markers.txt"
    source = (
        b"... (output truncated) ...\n"
        b"<<<ODIN_READ_FILE_RAW_CONTENT_V1>>>\n"
        b"<<<ODIN_READ_FILE_RAW_END_V1>>>\n"
    )
    target.write_bytes(source)

    result = await _read(_executor(), target, raw=True)
    metadata, content = _split_raw(result.output)

    assert result.ok
    assert metadata["content_bytes"] == len(source)
    assert content == source


async def test_raw_budget_is_contiguous_and_signals_continuation(tmp_path):
    target = tmp_path / "raw-large.txt"
    source_lines = [f"raw-{i}-".encode() + (b"x" * 180) + b"\n" for i in range(1, 301)]
    target.write_bytes(b"".join(source_lines))

    first = await _read(_executor(), target, start_line=80, lines=200, raw=True)
    metadata, content = _split_raw(first.output)

    assert first.ok
    assert len(first.output) < 12_000
    assert "characters omitted" not in first.output
    assert metadata["truncated"] is True
    assert metadata["returned_start_line"] == 80
    assert metadata["returned_end_line"] < 279
    assert metadata["continue_at_start_line"] == metadata["returned_end_line"] + 1
    expected = b"".join(source_lines[79:metadata["returned_end_line"]])
    assert content == expected

    second = await _read(
        _executor(), target,
        start_line=metadata["continue_at_start_line"], lines=200, raw=True,
    )
    second_metadata, second_content = _split_raw(second.output)
    assert second_metadata["returned_start_line"] == metadata["continue_at_start_line"]
    assert second_content.startswith(source_lines[metadata["continue_at_start_line"] - 1])


async def test_raw_mode_one_oversize_source_line_fails_without_envelope(tmp_path):
    target = tmp_path / "raw-wide.txt"
    target.write_bytes((b"z" * 30_000) + b"\nafter\n")

    result = await _read(_executor(), target, raw=True)

    assert result.ok is False
    assert result.output == (
        "Error: source line 1 exceeds the read_file output budget; no lines returned."
    )
    assert "characters omitted" not in result.output


async def test_raw_mode_validation_rejects_non_boolean(tmp_path):
    executor = _executor()
    for value in (0, 1, "true", None):
        result = await _read(executor, tmp_path / "x", raw=value)
        assert result.ok is False
        assert result.output == "Error: 'raw' must be a boolean."


async def test_raw_mode_rejects_unparsable_oversize_line_number(tmp_path):
    """A malformed ERROR envelope must not surface a bogus line number."""
    executor = _executor()
    executor.files_docs_tools._run_on_host = AsyncMock(return_value=("ERROR\tnot-a-number", 0))

    result = await _read(executor, tmp_path / "ignored", raw=True)

    assert result.ok is False
    assert result.output == "Error: read_file raw transport returned an invalid envelope."


async def test_raw_mode_accepts_metadata_only_envelope_without_leading_body(tmp_path):
    """A zero-byte range arrives as a bare metadata line with no content line."""
    executor = _executor()
    executor.files_docs_tools._run_on_host = AsyncMock(
        return_value=("ODIN_READ_FILE_RAW_META_V1\t1\t5\t-\t-\t-\t0", 0)
    )

    result = await _read(executor, tmp_path / "ignored", raw=True)

    assert result.ok is True
    header = json.loads(
        result.output.split("\n", 1)[0][len("<<<ODIN_READ_FILE_RAW_V1 ") : -len(">>>")]
    )
    assert header["content_bytes"] == 0
    assert header["returned_start_line"] is None
    assert header["truncated"] is False


async def test_raw_mode_rejects_metadata_with_wrong_field_count(tmp_path):
    """A truncated metadata line must fail rather than be parsed positionally."""
    executor = _executor()
    executor.files_docs_tools._run_on_host = AsyncMock(
        return_value=("aGk=\nODIN_READ_FILE_RAW_META_V1\t1\t5\t1\t1", 0)
    )

    result = await _read(executor, tmp_path / "ignored", raw=True)

    assert result.ok is False
    assert result.output == "Error: read_file raw transport returned an invalid envelope."


async def test_raw_mode_rejects_declared_length_mismatch(tmp_path):
    """A declared byte count that disagrees with the payload is never trusted."""
    executor = _executor()
    encoded = base64.b64encode(b"hello").decode()
    executor.files_docs_tools._run_on_host = AsyncMock(
        return_value=(f"{encoded}\nODIN_READ_FILE_RAW_META_V1\t1\t5\t1\t1\t-\t99", 0)
    )

    result = await _read(executor, tmp_path / "ignored", raw=True)

    assert result.ok is False
    assert result.output == "Error: read_file raw transport returned an invalid envelope."
