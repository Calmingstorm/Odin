"""Coverage for src/search/fts.py channel/knowledge/error paths (RFC-006 P19, safe).

Complements test_fts_search.py: the channel_id-filtered session/channel-log
search branches, the knowledge index/search/delete cycle, channel-log
index/clear, empty-input guards, and every `except` error arm (exercised by
closing the connection so the sqlite op raises and is caught). SAFE: real sqlite
FTS5 in a tmp db; no network, no external service.
"""
from __future__ import annotations

import pytest

from src.search.fts import FullTextIndex


@pytest.fixture
def idx(tmp_path):
    return FullTextIndex(str(tmp_path / "fts.db"))


class TestSessions:
    def test_channel_filtered_search(self, idx):
        idx.index_session("s1", "alpha content here", "c1", 100.0)
        idx.index_session("s2", "alpha content there", "c2", 200.0)
        assert len(idx.search_sessions("alpha")) == 2
        assert len(idx.search_sessions("alpha", channel_id="c1")) == 1   # channel filter
        assert idx.search_sessions("alpha", channel_id="cX") == []
        assert idx.has_session("s1") is True and idx.has_session("nope") is False

    def test_reindex_replaces(self, idx):
        idx.index_session("s1", "first version", "c1", 100.0)
        idx.index_session("s1", "second version", "c1", 101.0)   # delete-then-insert
        res = idx.search_sessions("second")
        assert len(res) == 1 and "second" in res[0]["content"].lower()
        assert idx.search_sessions("first") == []


class TestKnowledge:
    def test_index_search_delete(self, idx):
        idx.index_knowledge_chunk("k1", "vector databases rock", "doc-a", 0)
        idx.index_knowledge_chunk("k2", "vector search is fast", "doc-b", 1)
        assert len(idx.search_knowledge("vector")) == 2
        assert idx.has_knowledge_chunk("k1") is True
        assert idx.delete_knowledge_source("doc-a") == 1     # one row removed
        assert idx.has_knowledge_chunk("k1") is False
        assert len(idx.search_knowledge("vector")) == 1


class TestChannelLogs:
    def test_index_search_clear(self, idx):
        n = idx.index_channel_messages([
            {"content": "hello world", "author": "alice", "channel_id": "c1", "ts": 1.0},
            {"content": "goodbye world", "author": "bob", "channel_id": "c2", "ts": 2.0},
            {"content": "", "author": "empty", "channel_id": "c1", "ts": 3.0},  # skipped
        ])
        assert n == 2                                          # empty content dropped
        assert len(idx.search_channel_logs("world")) == 2
        assert len(idx.search_channel_logs("world", channel_id="c1")) == 1
        assert idx.clear_channel_logs() is True
        assert idx.search_channel_logs("world") == []

    def test_empty_inputs_are_guarded(self, idx):
        assert idx.index_channel_messages([]) == 0
        assert idx.index_channel_messages([{"author": "x"}]) == 0   # no content → 0
        assert idx.search_channel_logs("") == []                    # empty query
        assert idx.search_sessions("   ") == []                     # whitespace query
        assert idx.search_knowledge("") == []


class TestErrorBranches:
    def test_closed_connection_returns_safe_defaults(self, idx):
        idx.index_session("s1", "content", "c1", 1.0)
        idx.index_knowledge_chunk("k1", "content", "src", 0)
        idx.index_channel_messages([
            {"content": "x", "author": "a", "channel_id": "c", "ts": 1.0}])
        assert idx._conn is not None
        idx._conn.close()   # every subsequent sqlite op raises → caught by except arms

        assert idx.index_session("s2", "x", "c1", 1.0) is False
        with pytest.raises(Exception, match="closed database"):
            idx.search_sessions("content")
        assert idx.index_knowledge_chunk("k2", "x", "s", 0) is False
        assert idx.get_knowledge_source_rows("src") is None
        with pytest.raises(Exception, match="closed database"):
            idx.search_knowledge("content")
        assert idx.delete_knowledge_source("src") == 0
        assert idx.index_channel_messages([
            {"content": "x", "author": "a", "channel_id": "c", "ts": 1.0}]) == 0
        with pytest.raises(Exception, match="closed database"):
            idx.search_channel_logs("x")
        assert idx.clear_channel_logs() is False


def test_knowledge_source_probes_are_safe_without_a_connection(tmp_path):
    """The confirmed-deletion probes must not raise when the index is closed."""
    index = FullTextIndex(str(tmp_path / "fts.db"))
    index._conn = None

    assert index.count_knowledge_source("anything") == 0
    assert index.has_knowledge_source("anything") is False
    assert index.get_knowledge_source_rows("anything") is None
