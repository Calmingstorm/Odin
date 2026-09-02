"""End-to-end range and output-budget pins for read_file."""
from __future__ import annotations

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
