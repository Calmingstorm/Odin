"""Reverse block reader for audit reads (WebUI deep-dive W2C, read-path only).

Every bounded audit query (search/search_logs/search_diffs/search_by_risk) and
the boot-time chain resume used to scan the WHOLE log forward — seconds of
jank per dashboard query and a full multi-MB read per boot once the live log
grew. Reads now walk blocks backwards from EOF and stop at the limit.

SAFE: real file I/O in tmp only; no network, no tool dispatch. The write path
(_persist, rotation, signing) is untouched and stays covered by the existing
audit suites.
"""
from __future__ import annotations

import json

import src.audit.logger as logger_mod
from src.audit.logger import AuditLogger, _iter_lines_reverse
from src.audit.signer import GENESIS_HASH


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


class TestInitializeChainReverse:
    def _signed_logger(self, path):
        return AuditLogger(path=str(path), hmac_key="k" * 32)

    async def test_resumes_from_last_signed_entry_without_full_read(self, tmp_path, monkeypatch):
        p = tmp_path / "audit.jsonl"
        _write_lines(p, [_entry(i, _hmac=f"h{i}") for i in range(30)])
        consumed = []
        real = _iter_lines_reverse

        def counting(path, block_size=logger_mod._REVERSE_BLOCK_SIZE):
            async def gen():
                async for raw in real(path, block_size=block_size):
                    consumed.append(raw)
                    yield raw
            return gen()

        monkeypatch.setattr(logger_mod, "_iter_lines_reverse", counting)
        logger = self._signed_logger(p)
        await logger.initialize_chain()
        assert logger._signer.prev_hmac == "h29"
        assert len(consumed) == 1  # one line answers the question

    async def test_torn_tail_falls_back_to_previous_parseable(self, tmp_path):
        p = tmp_path / "audit.jsonl"
        _write_lines(p, [_entry(0, _hmac="good"), '{"torn": tr'], trailing_newline=False)
        logger = self._signed_logger(p)
        await logger.initialize_chain()
        assert logger._signer.prev_hmac == "good"

    async def test_unsigned_newest_entry_leaves_genesis(self, tmp_path):
        # Preserved semantics: the FIRST parseable entry ends the search even
        # when it carries no chain value — an unsigned tail never adopts an
        # older _hmac from deeper in the file.
        p = tmp_path / "audit.jsonl"
        _write_lines(p, [_entry(0, _hmac="older"), _entry(1)])
        logger = self._signed_logger(p)
        await logger.initialize_chain()
        assert logger._signer.prev_hmac == GENESIS_HASH
