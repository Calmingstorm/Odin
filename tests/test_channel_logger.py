"""Coverage for src/discord/channel_logger.py (RFC-006 P7).

Passive JSONL channel logger — pure file I/O. Tests use a real tmp log dir and
faked Discord message objects; the FTS index is a small fake. No gateway, no DB.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

from src.discord.channel_logger import ChannelLogger
from src.search.fts import FullTextIndex


def _msg(cid="100", gid="1", content="hello world", author_id="7", name="alice",
         bot=False, ts=1000.0, attachments=()):
    return SimpleNamespace(
        channel=SimpleNamespace(id=cid, guild=SimpleNamespace(id=gid)),
        author=SimpleNamespace(id=author_id, display_name=name, name=name, bot=bot),
        created_at=SimpleNamespace(timestamp=lambda: ts),
        content=content,
        attachments=[SimpleNamespace(filename=f) for f in attachments],
    )


def _fts(available=True):
    return FullTextIndex(":memory:") if available else SimpleNamespace(available=False)


class TestLogMessage:
    def test_writes_jsonl(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        cl.log_message(_msg(content="first", attachments=["a.png"]))
        path = tmp_path / "100.jsonl"
        rec = json.loads(path.read_text().strip())
        assert rec["content"] == "first" and rec["author"] == "alice"
        assert rec["attachments"] == ["a.png"] and rec["guild_id"] == "1"

    def test_skips_dms(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        cl.log_message(SimpleNamespace(channel=None))  # no channel
        cl.log_message(SimpleNamespace(channel=SimpleNamespace(guild=None)))  # no guild
        assert list(tmp_path.glob("*.jsonl")) == []

    def test_tolerates_missing_attrs(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        # minimal object: channel+guild present, everything else missing
        m = SimpleNamespace(channel=SimpleNamespace(id="55", guild=SimpleNamespace(id="9")))
        cl.log_message(m)
        rec = json.loads((tmp_path / "55.jsonl").read_text().strip())
        assert rec["author_id"] == "0" and rec["content"] == ""

    def test_recreates_deleted_dir(self, tmp_path):
        d = tmp_path / "logs"
        cl = ChannelLogger(d)
        import shutil
        shutil.rmtree(d)  # dir vanishes mid-run → FileNotFoundError → recreate + retry
        cl.log_message(_msg(cid="200"))
        assert (d / "200.jsonl").exists()

    def test_never_raises(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        # created_at present but .timestamp() raises → caught, swallowed
        bad = SimpleNamespace(
            channel=SimpleNamespace(id="1", guild=SimpleNamespace(id="1")),
            created_at=SimpleNamespace(timestamp=lambda: 1 / 0))
        cl.log_message(bad)  # must not raise


class TestIndexToFts:
    def test_unavailable_returns_zero(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        assert cl.index_to_fts(None) == 0  # type: ignore[arg-type]
        assert cl.index_to_fts(_fts(available=False)) == 0

    def test_indexes_new_only(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        cl.log_message(_msg(content="one", ts=100.0))
        cl.log_message(_msg(content="two", ts=200.0))
        fts = _fts()
        assert cl.index_to_fts(fts) == 2
        # second pass: nothing newer than the recorded cutoff
        assert cl.index_to_fts(fts) == 0
        # a newer message gets picked up incrementally
        cl.log_message(_msg(content="three", ts=300.0))
        assert cl.index_to_fts(fts) == 1

    def test_batch_limit(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        cl.FTS_BATCH_LIMIT = 2
        for i in range(3):
            cl.log_message(_msg(content=f"m{i}", ts=100.0 + i))
        fts = _fts()
        # Upgrade consumes every batch atomically; steady-state retains its cap.
        assert cl.index_to_fts(fts) == 3
        for i in range(3, 6):
            cl.log_message(_msg(content=f"m{i}", ts=100.0 + i))
        assert cl.index_to_fts(fts) == 2
        assert cl.index_to_fts(fts) == 1

    def test_incremental_pass_reads_from_the_cursor_not_the_whole_log(self, tmp_path):
        # #726: a pass used to json-parse every old line to find its cursor.
        cl = ChannelLogger(tmp_path)
        for i in range(50):
            cl.log_message(_msg(content=f"old {i}", ts=100.0 + i))
        fts = _fts()
        assert cl.index_to_fts(fts) == 50
        assert cl.index_to_fts(fts) == 0  # a pass with nothing new also resumes
        cl.log_message(_msg(content="new message", ts=500.0))
        parsed = []
        real = ChannelLogger._index_record

        def counting(path, number, line):
            parsed.append(number)
            return real(path, number, line)

        cl._index_record = counting  # type: ignore[method-assign]
        assert cl.index_to_fts(fts) == 1
        assert parsed == [49, 50]  # the cursor's line, then the new one
        assert cl.index_to_fts(fts) == 0

    def test_resume_falls_back_to_a_full_scan_after_rotation(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        for i in range(3):
            cl.log_message(_msg(content=f"m{i}", ts=100.0 + i))
        fts = _fts()
        assert cl.index_to_fts(fts) == 3
        log_path = tmp_path / "100.jsonl"
        rotated = log_path.read_text()
        log_path.unlink()  # a new inode with the same content plus one line
        log_path.write_text(rotated)
        cl.log_message(_msg(content="after rotation", ts=200.0))
        assert cl.index_to_fts(fts) == 1

    def test_legacy_lines_keep_their_identity_when_resuming(self, tmp_path):
        # Legacy records (no log_identity) hash their line number: resuming
        # mid-file must count lines exactly as the full scan does.
        cl = ChannelLogger(tmp_path)
        legacy = tmp_path / "9.jsonl"
        legacy.write_text("".join(
            json.dumps({"ts": float(i), "content": f"legacy {i}"}) + "\n" for i in range(4)))
        fts = _fts()
        assert cl.index_to_fts(fts) == 4
        with legacy.open("a") as handle:
            handle.write(json.dumps({"ts": 9.0, "content": "legacy tail"}) + "\n")
        assert cl.index_to_fts(fts) == 1
        cl._index_positions.clear()  # a fresh process rescans and agrees
        assert cl.index_to_fts(fts) == 0

    def test_resume_falls_back_whenever_the_remembered_line_does_not_check_out(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        for i in range(3):
            cl.log_message(_msg(content=f"m{i}", ts=100.0 + i))
        fts = _fts()
        assert cl.index_to_fts(fts) == 3  # the first pass reconciles the whole log
        assert cl.index_to_fts(fts) == 0  # an incremental pass remembers the cursor's line
        path = tmp_path / "100.jsonl"
        key = str(path)
        device, inode, offset, number, cursor = cl._index_positions[key]
        size = path.stat().st_size
        for position in (
            (device, inode + 1, offset, number, cursor),  # another file (rotation)
            (device, inode, size + 10, number, cursor),   # beyond the end (truncation)
            (device, inode, size, number, cursor),        # no complete line there
            (device, inode, 0, 0, cursor),                # a line with another identity
        ):
            cl._index_positions[key] = position
            assert cl._resume_index_batch(path, cursor) is None
        cl._index_positions[key] = (device, inode, offset, number, cursor)
        with path.open("ab") as handle:
            handle.write(b"not json\n")
            handle.write(b"\xff\xfe broken utf-8\n")
        assert cl._resume_index_batch(path, cursor) is None  # undecodable: rescan

    def test_resume_skips_unparsable_lines_after_the_cursor(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        cl.log_message(_msg(content="first", ts=100.0))
        fts = _fts()
        assert cl.index_to_fts(fts) == 1
        assert cl.index_to_fts(fts) == 0  # remembers the cursor's line
        with (tmp_path / "100.jsonl").open("a") as handle:
            handle.write("not json\n")
        cl.log_message(_msg(content="second", ts=200.0))
        assert cl.index_to_fts(fts) == 1

    def test_a_vanished_log_forgets_its_position(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        gone = tmp_path / "gone.jsonl"
        cl._index_positions[str(gone)] = (0, 0, 0, 0, "x")
        cl._remember_index_position(gone, (0, 0, "y"))
        assert str(gone) not in cl._index_positions

    def test_skips_bad_lines_and_missing_dir(self, tmp_path):
        cl = ChannelLogger(tmp_path / "gone")
        import shutil
        shutil.rmtree(tmp_path / "gone")
        assert cl.index_to_fts(_fts()) == 0  # dir missing → 0
        cl2 = ChannelLogger(tmp_path)
        (tmp_path / "9.jsonl").write_text("not json\n\n" + json.dumps(
            {"ts": 5.0, "content": "ok"}) + "\n")
        assert cl2.index_to_fts(_fts()) == 1  # bad/blank lines skipped, valid one indexed


class TestSearch:
    def test_empty_query_and_missing_dir(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        assert cl.search("") == []
        cl2 = ChannelLogger(tmp_path / "nope")
        import shutil
        shutil.rmtree(tmp_path / "nope")
        assert cl2.search("x") == []

    def test_finds_matches(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        cl.log_message(_msg(cid="100", content="the quick brown fox"))
        cl.log_message(_msg(cid="100", content="lazy dog sleeps"))
        hits = cl.search("fox")
        assert len(hits) == 1 and hits[0]["type"] == "channel"
        assert "quick brown fox" in hits[0]["content"]

    def test_channel_filter_and_limit(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        cl.log_message(_msg(cid="100", content="match here", ts=1.0))
        cl.log_message(_msg(cid="100", content="match again", ts=2.0))
        cl.log_message(_msg(cid="200", content="match elsewhere"))
        # channel filter restricts to one file
        assert all(h["channel_id"] == "100" for h in cl.search("match", channel_id="100"))
        # limit caps results
        assert len(cl.search("match", limit=1)) == 1

    def test_bad_json_and_blank_skipped(self, tmp_path):
        cl = ChannelLogger(tmp_path)
        # a blank line (skipped) and a garbage line (JSONDecodeError) around the real one
        (tmp_path / "1.jsonl").write_text("garbage\n\n" + json.dumps(
            {"content": "real match", "author": "a", "channel_id": "1", "ts": 1.0}) + "\n")
        hits = cl.search("match")
        assert len(hits) == 1 and hits[0]["author"] == "a"
