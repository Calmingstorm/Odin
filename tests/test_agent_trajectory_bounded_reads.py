"""Bounded reverse reads for agent trajectory JSONL partitions."""

from __future__ import annotations

import json
import threading

import pytest

from src.agents.trajectory import AgentTrajectorySaver, _iter_jsonl_lines_reverse


def _write(path, rows):
    path.write_text("".join(json.dumps(row) + "\n" for row in rows))
    return path


class _CountingHandle:
    def __init__(self, handle):
        self.handle = handle
        self.bytes_read = 0

    def __getattr__(self, name):
        return getattr(self.handle, name)

    async def read(self, size=-1):
        data = await self.handle.read(size)
        self.bytes_read += len(data)
        return data


@pytest.mark.parametrize(
    "body",
    [
        '{"n":1}\n{"n":2}\n',
        '{"n":1}\n{"n":2}',
        '{"n":1}\r\n\n {"n":2}\r\n',
        'broken\n{"n":1}\n{"n":',
    ],
)
async def test_read_file_reverse_matches_legacy_semantics(tmp_path, body):
    path = tmp_path / "part.jsonl"
    path.write_bytes(body.encode())
    saver = AgentTrajectorySaver(str(tmp_path))
    expected = []
    for raw in reversed(body.splitlines()):
        try:
            expected.append(json.loads(raw.strip()))
        except (json.JSONDecodeError, ValueError):
            pass
    assert await saver.read_file(path.name, limit=100) == expected


async def test_sparse_search_walks_past_unrelated_rows_and_limit_multiplier(tmp_path):
    rows = [{"agent_id": f"a{i}", "channel_id": "other"} for i in range(700)]
    rows[5] = {
        "agent_id": "target",
        "channel_id": "wanted",
        "requester_id": "r",
        "tools_used": ["x"],
        "final_state": "done",
    }
    _write(tmp_path / "2026-01-01.jsonl", rows)
    saver = AgentTrajectorySaver(str(tmp_path))

    found = await saver.search(
        channel_id="wanted", requester_id="r", tool_name="x", state="done", limit=1
    )
    assert [row["agent_id"] for row in found] == ["target"]


async def test_find_by_agent_id_returns_newest_match_across_rows_and_files(tmp_path):
    _write(tmp_path / "2026-01-01.jsonl", [{"agent_id": "same", "v": "old"}])
    _write(
        tmp_path / "2026-01-02.jsonl",
        [{"agent_id": "same", "v": "older"}, {"agent_id": "same", "v": "new"}],
    )
    saver = AgentTrajectorySaver(str(tmp_path))
    assert (await saver.find_by_agent_id("same"))["v"] == "new"
    assert await saver.find_by_agent_id("missing") is None


async def test_public_read_paths_are_bounded_and_parse_off_event_loop(tmp_path, monkeypatch):
    rows = [{"agent_id": str(i), "pad": "x" * 400} for i in range(3000)]
    path = _write(tmp_path / "2026-02-01.jsonl", rows)
    total = path.stat().st_size
    saver = AgentTrajectorySaver(str(tmp_path))

    import aiofiles

    real_open = aiofiles.open
    opened = []

    def counting_open(*args, **kwargs):
        handle = real_open(*args, **kwargs)

        async def wrap():
            counted = _CountingHandle(await handle)
            opened.append(counted)
            return counted

        return wrap()

    monkeypatch.setattr("src.agents.trajectory.aiofiles.open", counting_open)
    caller_thread = threading.get_ident()
    real_loads = json.loads
    parse_threads = []

    def track_loads(value, *args, **kwargs):
        parse_threads.append(threading.get_ident())
        return real_loads(value, *args, **kwargs)

    monkeypatch.setattr("src.agents.trajectory.json.loads", track_loads)
    result = await saver.read_file(path.name, limit=2)
    assert [row["agent_id"] for row in result] == ["2999", "2998"]
    assert opened[0].bytes_read < total
    assert opened[0].bytes_read <= 64 * 1024 + 2 * 500
    assert parse_threads and all(thread != caller_thread for thread in parse_threads)


async def test_reverse_reader_reassembles_long_lines(tmp_path):
    path = _write(
        tmp_path / "long.jsonl", [{"agent_id": "long", "pad": "z" * 200_000}, {"agent_id": "tail"}]
    )
    import aiofiles

    handle = await aiofiles.open(path, "rb")
    try:
        lines = [raw async for raw in _iter_jsonl_lines_reverse(handle, block_size=37)]
    finally:
        await handle.close()
    assert [json.loads(line)["agent_id"] for line in lines] == ["tail", "long"]


async def test_search_and_read_zero_limits_are_empty(tmp_path):
    _write(tmp_path / "2026-03-01.jsonl", [{"agent_id": "a"}])
    saver = AgentTrajectorySaver(str(tmp_path))
    assert await saver.read_file("2026-03-01.jsonl", limit=0) == []
    assert await saver.search(limit=0) == []
