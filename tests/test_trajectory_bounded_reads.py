"""Gist L5 — trajectory reads must not load a whole daily partition.

The JSONL partitions are append-only, and every read path went through
``readlines()`` before truncating by result count, so a limit-10 WebUI query
allocated an entire day's file. The fix reads backwards in fixed-size blocks
and stops at the limit.

The behavior contract is pinned by a differential test against the original
text-mode implementation, and the bounded-read property is proven by counting
bytes actually read through a byte-counting handle.
"""
from __future__ import annotations

import json

import pytest

from src.trajectories.saver import TrajectorySaver, _iter_jsonl_lines_reverse


class _CountingHandle:
    """Wraps a real binary handle and totals the bytes each read returns."""

    def __init__(self, handle) -> None:
        self._handle = handle
        self.bytes_read = 0

    def __getattr__(self, name):
        return getattr(self._handle, name)

    async def read(self, size: int = -1) -> bytes:
        data = await self._handle.read(size)
        self.bytes_read += len(data)
        return data


def _write_partition(directory, name: str, rows: list[dict], trailing_newline: bool = True):
    path = directory / name
    body = "\n".join(json.dumps(r) for r in rows)
    if rows and trailing_newline:
        body += "\n"
    path.write_text(body)
    return path


async def _old_read_file(directory, filename: str, limit: int = 100) -> list[dict]:
    """The pre-fix implementation, kept here as the behavior oracle."""
    import aiofiles

    filepath = (directory / filename)
    if not filepath.exists():
        return []
    results: list[dict] = []
    async with aiofiles.open(filepath) as f:
        lines = await f.readlines()
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            results.append(json.loads(line))
        except json.JSONDecodeError:
            continue
        if len(results) >= limit:
            break
    return results


# ---------------------------------------------------------------------------
# Behavior is unchanged (differential against the original implementation)
# ---------------------------------------------------------------------------


CASES = {
    "plain": '{"m":"1"}\n{"m":"2"}\n{"m":"3"}\n',
    "no_trailing_newline": '{"m":"1"}\n{"m":"2"}\n{"m":"3"}',
    "crlf": '{"m":"1"}\r\n{"m":"2"}\r\n',
    "blank_and_whitespace_lines": '{"m":"1"}\n\n  \n{"m":"2"}\n',
    "malformed_lines": 'garbage\n{"m":"ok"}\nnot json\n{"m":"ok2"}\n',
    "empty_file": "",
    "blank_only": "\n \n\n",
    "partial_trailing_line": '{"m":"1"}\n{"m":"2"}\n{"m":',
}


@pytest.mark.parametrize("case", sorted(CASES))
@pytest.mark.parametrize("limit", [1, 2, 3, 100])
async def test_read_file_matches_the_original_implementation(tmp_path, case, limit):
    path = tmp_path / "part.jsonl"
    path.write_bytes(CASES[case].encode())
    saver = TrajectorySaver(directory=str(tmp_path))

    assert await saver.read_file("part.jsonl", limit=limit) == await _old_read_file(
        tmp_path, "part.jsonl", limit=limit
    )


async def test_embedded_escaped_newline_stays_one_record(tmp_path):
    rows = [
        {"m": "line1\nline2", "x": 1},
        {"m": "next"},
    ]
    _write_partition(tmp_path, "p.jsonl", rows)
    saver = TrajectorySaver(directory=str(tmp_path))

    entries = await saver.read_file("p.jsonl")
    assert entries[0]["m"] == "next"
    assert entries[1]["m"] == "line1\nline2"


async def test_find_by_message_id_matches_the_original_semantics(tmp_path):
    rows = [{"message_id": f"m{i}", "n": i} for i in range(200)]
    rows.append({"not": "a message"})
    rows.append({"message_id": "old-msg"})
    _write_partition(tmp_path, "2026-01-01.jsonl", rows)
    saver = TrajectorySaver(directory=str(tmp_path))

    assert (await saver.find_by_message_id("m7"))["n"] == 7
    assert (await saver.find_by_message_id("old-msg"))["message_id"] == "old-msg"
    assert await saver.find_by_message_id("missing") is None


async def test_find_by_message_id_prefers_the_newest_file(tmp_path):
    _write_partition(tmp_path, "2026-04-14.jsonl", [{"message_id": "dup", "which": "old"}])
    _write_partition(tmp_path, "2026-04-15.jsonl", [{"message_id": "dup", "which": "new"}])
    saver = TrajectorySaver(directory=str(tmp_path))
    assert (await saver.find_by_message_id("dup"))["which"] == "new"


async def test_find_by_message_id_skips_malformed_lines(tmp_path):
    """A torn or corrupt record must not abort the lookup."""
    (tmp_path / "2026-04-16.jsonl").write_bytes(
        b'garbage\n{"message_id": "wanted"}\nnot json either\n'
    )
    saver = TrajectorySaver(directory=str(tmp_path))
    found = await saver.find_by_message_id("wanted")
    assert found is not None
    assert found["message_id"] == "wanted"


async def test_find_by_message_id_reports_a_read_failure(tmp_path):
    """An unreadable partition is logged and skipped, not raised."""
    from unittest.mock import patch

    _write_partition(tmp_path, "2026-04-17.jsonl", [{"message_id": "m1"}])
    saver = TrajectorySaver(directory=str(tmp_path))

    with patch("aiofiles.open", side_effect=OSError("unreadable")):
        assert await saver.find_by_message_id("m1") is None


async def test_find_by_loop_id_skips_malformed_lines(tmp_path):
    (tmp_path / "2026-04-18.jsonl").write_bytes(
        b'\nnot-json\n{"source": "loop", "loop_id": "a", "loop_iteration": 3}\n'
    )
    saver = TrajectorySaver(directory=str(tmp_path))
    found = await saver.find_by_loop_id("a")
    assert [entry["loop_iteration"] for entry in found] == [3]


async def test_find_by_loop_id_reports_an_open_failure(tmp_path):
    from unittest.mock import patch

    _write_partition(tmp_path, "2026-04-19.jsonl", [{"source": "loop", "loop_id": "a"}])
    saver = TrajectorySaver(directory=str(tmp_path))

    with patch("aiofiles.open", side_effect=OSError("unreadable")):
        assert await saver.find_by_loop_id("a") == []


async def test_find_by_loop_id_reports_a_mid_read_failure(tmp_path):
    """A failure while iterating an open handle must skip, not raise."""
    from unittest.mock import patch

    _write_partition(tmp_path, "2026-04-20.jsonl", [{"source": "loop", "loop_id": "a"}])
    saver = TrajectorySaver(directory=str(tmp_path))

    import aiofiles

    real_open = aiofiles.open

    class _ExplodingRead:
        def __init__(self, handle):
            self._handle = handle

        def __getattr__(self, name):
            return getattr(self._handle, name)

        async def read(self, size: int = -1):
            raise OSError("read failed mid-partition")

    def exploding_open(*args, **kwargs):
        handle = real_open(*args, **kwargs)

        async def wrapper():
            return _ExplodingRead(await handle)

        return wrapper()

    # list_files uses iterdir, not open, so the partition is still listed.
    assert await saver.list_files() == ["2026-04-20.jsonl"]
    with patch("src.trajectories.saver.aiofiles.open", exploding_open):
        assert await saver.find_by_loop_id("a") == []


async def test_find_by_loop_id_tolerates_a_failing_close(tmp_path):
    """A close error on a torn handle must not escape the scan."""
    from unittest.mock import patch

    _write_partition(tmp_path, "2026-04-21.jsonl", [{"source": "loop", "loop_id": "a"}])
    saver = TrajectorySaver(directory=str(tmp_path))

    import aiofiles

    real_open = aiofiles.open

    class _BadClose:
        def __init__(self, handle):
            self._handle = handle

        def __getattr__(self, name):
            return getattr(self._handle, name)

        async def close(self):
            raise OSError("close failed")

    def failing_close_open(*args, **kwargs):
        handle = real_open(*args, **kwargs)

        async def wrapper():
            return _BadClose(await handle)

        return wrapper()

    with patch("src.trajectories.saver.aiofiles.open", failing_close_open):
        # The results are still returned; only the close is swallowed.
        found = await saver.find_by_loop_id("a")
    assert [entry["loop_id"] for entry in found] == ["a"]


async def test_find_by_loop_id_scans_a_whole_partition(tmp_path):
    """An old loop must not hide behind newer unrelated traffic."""
    rows = [{"source": "discord", "message_id": f"chat-{i}"} for i in range(500)]
    rows.insert(0, {"source": "loop", "loop_id": "a", "loop_iteration": 1})
    _write_partition(tmp_path, "2026-03-02.jsonl", rows)
    saver = TrajectorySaver(directory=str(tmp_path))

    found = await saver.find_by_loop_id("a", limit=1)
    assert len(found) == 1
    assert found[0]["loop_iteration"] == 1


async def test_search_still_returns_newest_first_with_limit(tmp_path):
    rows = [
        {"message_id": str(i), "channel_id": "c1", "tools_used": ["run_command"]}
        for i in range(40)
    ]
    _write_partition(tmp_path, "2026-05-05.jsonl", rows)
    saver = TrajectorySaver(directory=str(tmp_path))

    results = await saver.search(channel_id="c1", limit=5)
    assert len(results) == 5
    assert [r["message_id"] for r in results] == ["39", "38", "37", "36", "35"]


# ---------------------------------------------------------------------------
# The bounded-read property itself
# ---------------------------------------------------------------------------


async def test_limited_read_does_not_allocate_the_whole_partition(tmp_path):
    """A limit-1 read of a large partition reads only its tail."""
    rows = [{"message_id": str(i), "pad": "x" * 400} for i in range(4000)]
    _write_partition(tmp_path, "big.jsonl", rows)
    path = tmp_path / "big.jsonl"
    total_bytes = path.stat().st_size
    assert total_bytes > 1_000_000

    import aiofiles

    handle = await aiofiles.open(path, "rb")
    counting = _CountingHandle(handle)
    try:
        results = []
        async for raw in _iter_jsonl_lines_reverse(counting):
            results.append(json.loads(raw))
            if len(results) >= 1:
                break
    finally:
        await handle.close()

    assert results[0]["message_id"] == "3999"
    assert counting.bytes_read <= 64 * 1024 + len(raw), (
        f"read {counting.bytes_read} of {total_bytes} bytes for a single record"
    )
    assert counting.bytes_read < total_bytes


async def test_read_file_uses_bounded_reads_end_to_end(tmp_path, monkeypatch):
    """The public read_file path is bounded too, not just the helper."""
    rows = [{"message_id": str(i), "pad": "y" * 400} for i in range(4000)]
    _write_partition(tmp_path, "2026-06-06.jsonl", rows)
    total_bytes = (tmp_path / "2026-06-06.jsonl").stat().st_size
    saver = TrajectorySaver(directory=str(tmp_path))

    opened: list[_CountingHandle] = []
    import aiofiles

    real_open = aiofiles.open

    def counting_open(*args, **kwargs):
        handle = real_open(*args, **kwargs)

        async def wrapper():
            counting = _CountingHandle(await handle)
            opened.append(counting)
            return counting

        return wrapper()

    monkeypatch.setattr("src.trajectories.saver.aiofiles.open", counting_open)
    entries = await saver.read_file("2026-06-06.jsonl", limit=3)
    assert [e["message_id"] for e in entries] == ["3999", "3998", "3997"]
    assert opened, "read_file never opened the partition"
    read_bytes = opened[0].bytes_read
    assert read_bytes < total_bytes, (
        f"read_file consumed the whole {total_bytes}-byte partition ({read_bytes} bytes)"
    )
    assert read_bytes <= 64 * 1024 + 3 * 500, f"unbounded tail read: {read_bytes} bytes"


async def test_block_boundary_straddling_lines_are_reassembled(tmp_path):
    """A line larger than the block size is still emitted whole."""
    rows = [
        {"message_id": "huge", "pad": "z" * 300_000},
        {"message_id": "small"},
    ]
    _write_partition(tmp_path, "straddle.jsonl", rows)
    saver = TrajectorySaver(directory=str(tmp_path))

    entries = await saver.read_file("straddle.jsonl", limit=2)
    assert [e["message_id"] for e in entries] == ["small", "huge"]
    assert len(entries[1]["pad"]) == 300_000


async def test_small_block_size_produces_identical_results(tmp_path):
    """Block size is an implementation detail, never a behavior change."""
    rows = [{"message_id": str(i), "pad": "q" * (i % 137)} for i in range(120)]
    _write_partition(tmp_path, "blocks.jsonl", rows)
    expected = await _old_read_file(tmp_path, "blocks.jsonl", limit=10**9)

    import aiofiles

    handle = await aiofiles.open(tmp_path / "blocks.jsonl", "rb")
    try:
        for block in (1, 2, 7, 64, 4096, 65536):
            got = []
            async for raw in _iter_jsonl_lines_reverse(handle, block_size=block):
                got.append(json.loads(raw))
            assert got == expected, f"block_size={block} changed results"
    finally:
        await handle.close()


# ---------------------------------------------------------------------------
# L5 boundary: no retention, no deletion
# ---------------------------------------------------------------------------


async def test_reads_never_modify_or_delete_the_partition(tmp_path):
    """L5's remediation boundary: fix the read, keep every byte of history."""
    rows = [{"message_id": str(i)} for i in range(50)]
    path = _write_partition(tmp_path, "2026-07-07.jsonl", rows)
    before = path.read_bytes()
    before_stat = path.stat()
    saver = TrajectorySaver(directory=str(tmp_path))

    await saver.read_file("2026-07-07.jsonl", limit=5)
    await saver.find_by_message_id("m1")
    await saver.find_by_loop_id("nope")
    await saver.search(limit=5)
    await saver.list_files()

    assert path.read_bytes() == before
    assert path.stat().st_mtime == before_stat.st_mtime
    assert await saver.list_files() == ["2026-07-07.jsonl"]


async def test_read_helper_yields_nothing_for_an_empty_file(tmp_path):
    path = tmp_path / "empty.jsonl"
    path.write_bytes(b"")

    import aiofiles

    handle = await aiofiles.open(path, "rb")
    try:
        yielded = [raw async for raw in _iter_jsonl_lines_reverse(handle)]
    finally:
        await handle.close()
    assert yielded == []
    assert path.read_bytes() == b""
