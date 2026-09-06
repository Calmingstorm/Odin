"""Source paging, not a downstream cut, honors smaller delivery budgets."""

import json
import re

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools.executor import ToolExecutor


@pytest.mark.parametrize("raw", [False, True])
async def test_small_delivery_budget_reconstructs_contiguous_file(tmp_path, raw):
    source = "".join(f"line {i:04d} — café\n" for i in range(200))
    path = tmp_path / "source.txt"
    path.write_text(source, encoding="utf-8")
    executor = ToolExecutor(ToolsConfig(
        hosts={"fixture": ToolHost(address="127.0.0.1")},
        audit_log_path=str(tmp_path / "audit.jsonl"), tool_output_max_chars=1024,
    ))
    start, chunks, calls = 1, [], 0
    while True:
        result = await executor.execute("read_file", {
            "host": "fixture", "path": str(path), "start_line": start,
            "lines": 200, "raw": raw,
        }, user_id="reader")
        assert result.ok, result.output
        assert len(result.output) <= 1024
        calls += 1
        if raw:
            header, content = result.output.split("<<<ODIN_READ_FILE_RAW_CONTENT_V1>>>\n")
            metadata = json.loads(header.removeprefix("<<<ODIN_READ_FILE_RAW_V1 ").split(">>>")[0])
            content = content.removesuffix("<<<ODIN_READ_FILE_RAW_END_V1>>>")
            assert len(content.encode("utf-8")) == metadata["content_bytes"]
            assert metadata["returned_start_line"] == start
            chunks.append(content)
            next_start = metadata["continue_at_start_line"]
        else:
            body, footer = result.output.rsplit("\n\n", 1)
            rows = body.splitlines()
            for expected, row in enumerate(rows, start):
                number, content = row.split(": ", 1)
                assert int(number) == expected
                chunks.append(content + "\n")
            match = re.search(r"continue at start_line=(\d+)", footer)
            next_start = int(match[1]) if match else None
        if next_start is None:
            break
        assert next_start > start
        start = next_start
    assert calls > 1
    assert "".join(chunks) == source


@pytest.mark.parametrize("raw", [False, True])
async def test_single_oversized_source_line_is_an_explicit_error(tmp_path, raw):
    path = tmp_path / "large.txt"
    path.write_text("x" * 2000)
    executor = ToolExecutor(ToolsConfig(
        hosts={"fixture": ToolHost(address="127.0.0.1")},
        audit_log_path=str(tmp_path / "audit.jsonl"), tool_output_max_chars=1024,
    ))
    result = await executor.execute("read_file", {
        "host": "fixture", "path": str(path), "raw": raw,
    }, user_id="reader")
    assert not result.ok
    assert "no lines returned" in result.output
    assert len(result.output) <= 1024
