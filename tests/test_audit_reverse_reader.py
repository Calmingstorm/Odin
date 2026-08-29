"""Reverse block reader for audit reads (WebUI deep-dive W2C, read-path only).

Every bounded audit query (search/search_logs/search_diffs/search_by_risk)
used to scan the WHOLE log forward — seconds of jank per dashboard query once
the live log grew. Reads now walk blocks backwards from EOF and stop at the
limit. Chain initialization remains deliberately outside this campaign.

SAFE: real file I/O in tmp only; no network, no tool dispatch. The write path
(_persist, rotation, signing) is untouched and stays covered by the existing
audit suites.
"""
from __future__ import annotations

import json

import src.audit.logger as logger_mod
from src.audit.logger import AuditLogger, _iter_lines_reverse


def _write_lines(path, lines, *, trailing_newline=True):
    blob = "\n".join(lines)
    if trailing_newline:
        blob += "\n"
    path.write_text(blob, encoding="utf-8")


def _entry(i, **extra):
    e = {
        "timestamp": f"2026-08-29T10:{i // 60:02d}:{i % 60:02d}Z",
        "tool_name": f"tool_{i}",
        "seq": i,
    }
    e.update(extra)
    return json.dumps(e, ensure_ascii=False)


async def _drain(path, **kw):
    return [raw async for raw in _iter_lines_reverse(path, **kw)]


class TestIterLinesReverse:
    async def test_yields_newest_first_across_block_boundaries(self, tmp_path):
        # Varied line lengths, including one far longer than the block size,
        # force every reassembly case: line == block edge, line straddling
        # two blocks, line spanning MANY blocks.
        p = tmp_path / "audit.jsonl"
        lines = [_entry(i, pad="x" * (i * 37 % 200)) for i in range(40)]
        lines[7] = _entry(7, pad="y" * 5000)
        _write_lines(p, lines)
        expected = [line.encode() for line in reversed(lines)]
        for block_size in (1, 7, 16, 64, 4096):
            got = await _drain(p, block_size=block_size)
            assert got == expected, f"block_size={block_size}"

    async def test_torn_tail_without_newline_is_yielded_first(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        _write_lines(p, [_entry(0), _entry(1), '{"torn": tr'], trailing_newline=False)
        got = await _drain(p, block_size=8)
        assert got[0] == b'{"torn": tr'
        assert got[1] == _entry(1).encode()

    async def test_blank_lines_skipped_and_empty_file_yields_nothing(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        _write_lines(p, [_entry(0), "", "   ", _entry(1)])
        got = await _drain(p, block_size=4)
        assert got == [_entry(1).encode(), _entry(0).encode()]
        empty = tmp_path / "empty.jsonl"
        empty.write_text("")
        assert await _drain(empty) == []

    async def test_non_ascii_entries_survive(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        _write_lines(p, [_entry(0, note="héðin — ✓"), _entry(1)])
        got = await _drain(p, block_size=3)
        assert json.loads(got[1])["note"] == "héðin — ✓"


class TestCollectMatchesReverse:
    async def test_matches_forward_semantics_at_every_limit(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        lines = [_entry(i, error="boom" if i % 3 == 0 else "") for i in range(120)]
        _write_lines(p, lines)
        logger = AuditLogger(path=str(p))
        all_error_seqs = [i for i in reversed(range(120)) if i % 3 == 0]
        for limit in (1, 5, len(all_error_seqs), len(all_error_seqs) + 10):
            got = await logger.search(has_error=True, limit=limit)
            assert [e["seq"] for e in got] == all_error_seqs[:limit], f"limit={limit}"

    async def test_ordering_spans_rotated_files_newest_first(self, tmp_path):
        # Current file holds the newest entries, .1 older, .2 oldest — a limit
        # crossing file boundaries must keep global newest-first order.
        base = tmp_path / "audit.jsonl"
        _write_lines(base.with_name("audit.jsonl.2"), [_entry(i) for i in range(0, 4)])
        _write_lines(base.with_name("audit.jsonl.1"), [_entry(i) for i in range(4, 8)])
        _write_lines(base, [_entry(i) for i in range(8, 12)])
        logger = AuditLogger(path=str(base))
        got = await logger.search(limit=10)
        assert [e["seq"] for e in got] == [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]

    async def test_corrupt_lines_are_skipped_not_fatal(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        _write_lines(p, [_entry(0), "not json at all", _entry(1)])
        logger = AuditLogger(path=str(p))
        got = await logger.search(limit=10)
        assert [e["seq"] for e in got] == [1, 0]

    async def test_limit_zero_returns_empty(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        _write_lines(p, [_entry(0)])
        logger = AuditLogger(path=str(p))
        assert await logger.search(limit=0) == []

    async def test_stops_reading_at_the_limit(self, tmp_path, monkeypatch):
        # THE point of the reader: a small query must not walk the whole log.
        # The seam is consumption-counted; a revert to the forward scan reads
        # zero lines through it and a scan-then-slice reads all 50 — both red.
        p = tmp_path / "audit.jsonl"
        _write_lines(p, [_entry(i) for i in range(50)])
        consumed = []
        real = _iter_lines_reverse

        def counting(path, block_size=logger_mod._REVERSE_BLOCK_SIZE):
            async def gen():
                async for raw in real(path, block_size=block_size):
                    consumed.append(raw)
                    yield raw
            return gen()

        monkeypatch.setattr(logger_mod, "_iter_lines_reverse", counting)
        logger = AuditLogger(path=str(p))
        got = await logger.search(limit=3)
        assert [e["seq"] for e in got] == [49, 48, 47]
        assert len(consumed) == 3


class _TrackingLock:
    def __init__(self):
        self.held = False
    async def __aenter__(self):
        self.held = True
    async def __aexit__(self, *_args):
        self.held = False


class TestStableGenerationSnapshot:
    async def test_hardlinked_generation_is_queried_once(self, tmp_path):
        # Two retained-generation names can briefly resolve to one inode during
        # an external rename/link race.  The descriptor snapshot must collapse
        # those aliases or every matching audit entry is returned twice.
        base = tmp_path / "audit.jsonl"
        _write_lines(base, [_entry(0), _entry(1)])
        base.with_name("audit.jsonl.1").hardlink_to(base)

        logger = AuditLogger(path=str(base), max_files=2)
        got = await logger.search(limit=10)

        assert [entry["seq"] for entry in got] == [1, 0]

    async def test_descriptor_set_is_opened_under_persistence_lock(self, tmp_path, monkeypatch):
        base = tmp_path / "audit.jsonl"
        _write_lines(base, [_entry(0)])
        logger = AuditLogger(path=str(base))
        tracking = _TrackingLock()
        logger._persist_lock = tracking
        real_paths = logger._rotated_paths_newest_first
        def paths_while_locked():
            assert tracking.held, "generation names sampled outside rotation lock"
            return real_paths()
        monkeypatch.setattr(logger, "_rotated_paths_newest_first", paths_while_locked)
        assert [entry["seq"] for entry in await logger.search(limit=1)] == [0]

    async def test_rotation_between_generation_reads_neither_duplicates_nor_omits(
        self, tmp_path, monkeypatch,
    ):
        base = tmp_path / "audit.jsonl"
        _write_lines(base.with_name("audit.jsonl.1"), [_entry(i) for i in range(0, 4)])
        _write_lines(base, [_entry(i) for i in range(4, 8)])
        logger = AuditLogger(path=str(base), max_files=3)
        real = _iter_lines_reverse
        calls = 0

        def rotate_after_current_opened(path, block_size=logger_mod._REVERSE_BLOCK_SIZE):
            async def gen():
                nonlocal calls
                async for raw in real(path, block_size=block_size):
                    yield raw
                calls += 1
                if calls == 1:
                    base.with_name("audit.jsonl.1").rename(base.with_name("audit.jsonl.2"))
                    base.rename(base.with_name("audit.jsonl.1"))
                    _write_lines(base, [_entry(i) for i in range(8, 10)])
            return gen()

        monkeypatch.setattr(logger_mod, "_iter_lines_reverse", rotate_after_current_opened)
        got = await logger.search(limit=8)
        assert [entry["seq"] for entry in got] == [7, 6, 5, 4, 3, 2, 1, 0]


class TestToolCountReadCache:
    async def test_counts_rotated_history_and_consumes_only_new_bytes(self, tmp_path):
        base = tmp_path / "audit.jsonl"
        _write_lines(base.with_name("audit.jsonl.1"), [
            _entry(0, tool_name="old"), _entry(1, tool_name="shared"),
        ])
        _write_lines(base, [
            _entry(2, tool_name="new"), _entry(3, tool_name="shared"),
        ])
        logger = AuditLogger(path=str(base), max_files=3)
        assert await logger.count_by_tool() == {"shared": 2, "new": 1, "old": 1}

        # If the old bytes are reparsed, this monkeypatch makes the second call
        # red. Appended bytes alone must be consumed and folded into the cache.
        real_loads = logger_mod.json.loads
        seen = []
        def only_appended(raw):
            seen.append(raw)
            entry = real_loads(raw)
            assert entry["seq"] == 4
            return entry
        logger_mod.json.loads = only_appended
        try:
            with base.open("a") as f:
                f.write(_entry(4, tool_name="new") + "\n")
            assert await logger.count_by_tool() == {"shared": 2, "new": 2, "old": 1}
        finally:
            logger_mod.json.loads = real_loads
        assert len(seen) == 1

    async def test_rotation_reuses_inode_counts_and_adds_new_current(self, tmp_path):
        base = tmp_path / "audit.jsonl"
        _write_lines(base, [_entry(0, tool_name="old")])
        logger = AuditLogger(path=str(base), max_files=3)
        assert await logger.count_by_tool() == {"old": 1}
        base.rename(base.with_name("audit.jsonl.1"))
        _write_lines(base, [_entry(1, tool_name="new")])
        assert await logger.count_by_tool() == {"old": 1, "new": 1}


class TestReadSideFailureCoverage:
    async def test_snapshot_open_oserror_and_duplicate_identity_are_safe(
        self, tmp_path, monkeypatch,
    ):
        base = tmp_path / "audit.jsonl"
        _write_lines(base, [_entry(0)])
        alias = base.with_name("audit.jsonl.1")
        alias.hardlink_to(base)
        logger = AuditLogger(path=str(base), max_files=2)
        import builtins
        real_open = builtins.open
        calls = 0
        def flaky_open(path, mode):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise PermissionError("denied")
            return real_open(path, mode)
        monkeypatch.setattr(logger_mod, "open", flaky_open, raising=False)
        snapshot = await logger._open_read_snapshot()
        try:
            assert len(snapshot) == 1
        finally:
            for handle, _stat in snapshot:
                handle.close()

    async def test_collect_logs_snapshot_read_error_and_closes_handle(
        self, tmp_path, monkeypatch,
    ):
        base = tmp_path / "audit.jsonl"
        _write_lines(base, [_entry(0)])
        logger = AuditLogger(path=str(base))
        handle = open(base, "rb")
        stat = base.stat()
        async def snapshot():
            return [(handle, stat)]
        async def broken(_fd):
            raise OSError("read failed")
            yield b"unreachable"
        monkeypatch.setattr(logger, "_open_read_snapshot", snapshot)
        monkeypatch.setattr(logger_mod, "_iter_lines_reverse", broken)
        assert await logger.search(limit=1) == []
        assert handle.closed

    async def test_count_empty_truncated_corrupt_and_pruned_generations(
        self, tmp_path,
    ):
        base = tmp_path / "audit.jsonl"
        logger = AuditLogger(path=str(base), max_files=2)
        logger._tool_count_cache[(1, 1)] = (1, b"", {"ghost": 1})
        assert await logger.count_by_tool() == {}
        assert logger._tool_count_cache == {}

        _write_lines(base, ["", "not-json", _entry(1, tool_name="live")])
        assert await logger.count_by_tool() == {"live": 1}
        identity = next(iter(logger._tool_count_cache))
        offset, tail, counts = logger._tool_count_cache[identity]
        # Force the defensive truncate/replacement path on the next read.
        logger._tool_count_cache[identity] = (offset + 100, tail, counts)
        assert await logger.count_by_tool() == {"live": 1}

        # A formerly cached rotated generation that no longer exists is pruned.
        logger._tool_count_cache[(999, 999)] = (1, b"", {"gone": 2})
        assert await logger.count_by_tool() == {"live": 1}
        assert (999, 999) not in logger._tool_count_cache
