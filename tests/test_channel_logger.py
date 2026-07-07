"""Coverage for src/discord/channel_logger.py (RFC-006 P7).

Passive JSONL channel logger — pure file I/O. Tests use a real tmp log dir and
faked Discord message objects; the FTS index is a small fake. No gateway, no DB.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

from src.discord.channel_logger import ChannelLogger


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
    fts = SimpleNamespace(available=available)
    fts.clear_channel_logs = lambda: None
    fts.index_channel_messages = lambda batch: len(batch)
    return fts


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
        indexed = []
        fts = _fts()

        def _index(batch):
            indexed.extend(batch)
            return len(batch)
        fts.index_channel_messages = _index
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
        # capped at the batch limit for this cycle
        assert cl.index_to_fts(fts) == 2

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
