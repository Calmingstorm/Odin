"""Coverage for src/trajectories/saver.py file ops (RFC-006 P20, safe).

Real TrajectorySaver against a tmp directory: save (happy + write-failure raise),
list_files (jsonl listing + missing-dir guard), read_file (entries newest-first,
path-traversal rejection, non-existent, malformed-line skip, limit), and
find_by_message_id (found + not-found). SAFE: async file I/O in tmp only; no
network, no live trajectory dir.
"""
from __future__ import annotations

import shutil
from unittest.mock import patch

import pytest

from src.trajectories.saver import TrajectorySaver


@pytest.fixture
def saver(tmp_path):
    return TrajectorySaver(directory=str(tmp_path / "traj"))


async def _save(saver, message_id="m1", **kw):
    params = dict(message_id=message_id, channel_id="c1", user_id="u1", user_name="U",
                  user_content="hi", system_prompt="sys", history=[], iterations=[],
                  final_response="resp", tools_used=[])
    params.update(kw)
    return await saver.save_from_data(**params)


class TestSave:
    async def test_save_writes_and_counts(self, saver):
        fp = await _save(saver)
        assert fp.exists() and saver.count == 1

    async def test_save_write_failure_raises(self, saver):
        with patch("aiofiles.open", side_effect=OSError("disk full")):
            with pytest.raises(OSError, match="disk full"):
                await _save(saver)


class TestListFiles:
    async def test_lists_jsonl(self, saver):
        await _save(saver)
        files = await saver.list_files()
        assert len(files) == 1 and files[0].endswith(".jsonl")

    async def test_missing_directory_returns_empty(self, tmp_path):
        s = TrajectorySaver(directory=str(tmp_path / "traj"))
        shutil.rmtree(s.directory)                    # directory no longer exists
        assert await s.list_files() == []


class TestReadFile:
    async def test_reads_entries_newest_first(self, saver):
        await _save(saver, message_id="m1")
        await _save(saver, message_id="m2")
        files = await saver.list_files()
        entries = await saver.read_file(files[0])
        assert len(entries) == 2 and entries[0]["message_id"] == "m2"   # reversed

    async def test_path_traversal_rejected(self, saver):
        assert await saver.read_file("../etc/passwd") == []
        assert await saver.read_file("nested/../../x.jsonl") == []

    async def test_nonexistent_file(self, saver):
        assert await saver.read_file("nope.jsonl") == []

    async def test_malformed_lines_skipped(self, saver):
        f = saver.directory / "2020-01-01.jsonl"
        f.write_text('not valid json\n{"message_id": "ok"}\n')
        entries = await saver.read_file("2020-01-01.jsonl")
        assert len(entries) == 1 and entries[0]["message_id"] == "ok"

    async def test_limit_caps_results(self, saver):
        f = saver.directory / "2020-01-02.jsonl"
        f.write_text("\n".join(f'{{"message_id": "m{i}"}}' for i in range(5)) + "\n")
        assert len(await saver.read_file("2020-01-02.jsonl", limit=2)) == 2


class TestFindByMessageId:
    async def test_found_and_not_found(self, saver):
        await _save(saver, message_id="target")
        found = await saver.find_by_message_id("target")
        assert found is not None and found["message_id"] == "target"
        assert await saver.find_by_message_id("missing") is None

    async def test_skips_malformed_lines(self, saver):
        f = saver.directory / "2020-02-02.jsonl"
        f.write_text('garbage\n{"message_id": "wanted"}\n')
        found = await saver.find_by_message_id("wanted")
        assert found is not None and found["message_id"] == "wanted"
