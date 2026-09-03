"""Tests for FTS5 full-text search index (src/search/fts.py).

Covers FullTextIndex: init, session indexing/search, knowledge
indexing/search/delete, channel log indexing/search/clear, _prepare_query
escaping, and error handling.
"""
from __future__ import annotations

import os
import tempfile

import pytest

from src.search.errors import InvalidSearchQuery, SearchExecutionError
from src.search.fts import FullTextIndex, _prepare_query

# ---------------------------------------------------------------------------
# _prepare_query
# ---------------------------------------------------------------------------

class TestPrepareQuery:
    def test_empty_string(self):
        assert _prepare_query("") == ""

    def test_whitespace_only(self):
        assert _prepare_query("   ") == ""

    def test_quotes_each_term(self):
        assert _prepare_query("hello world") == '"hello" "world"'

    def test_quotes_punctuation_terms_without_changing_and_semantics(self):
        assert _prepare_query("error.log recovered") == '"error.log" "recovered"'

    def test_quotes_ip_address(self):
        result = _prepare_query("192.168.1.1")
        assert result == '"192.168.1.1"'

    def test_quotes_path(self):
        result = _prepare_query("/var/log/syslog")
        assert result == '"/var/log/syslog"'

    def test_escapes_internal_quotes(self):
        assert _prepare_query('say "hello"') == '"say" """hello"""'

    def test_reserved_words_are_literals(self):
        assert _prepare_query("this AND that") == '"this" "AND" "that"'

    def test_control_character_is_invalid(self):
        with pytest.raises(InvalidSearchQuery, match="invalid query"):
            _prepare_query("bad\x00query")

    def test_non_utf8_text_is_invalid(self):
        with pytest.raises(InvalidSearchQuery, match="invalid query"):
            _prepare_query("\ud800")


# ---------------------------------------------------------------------------
# FullTextIndex initialization
# ---------------------------------------------------------------------------

class TestFullTextIndexInit:
    def test_init_in_memory(self):
        idx = FullTextIndex(":memory:")
        assert idx.available is True

    def test_init_creates_file(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            path = f.name
        try:
            idx = FullTextIndex(path)
            assert idx.available is True
            assert os.path.exists(path)
        finally:
            os.unlink(path)

    def test_init_bad_path(self):
        idx = FullTextIndex("/nonexistent/dir/test.db")
        assert idx.available is False

    def test_unavailable_search_is_explicit_failure(self):
        idx = FullTextIndex("/nonexistent/dir/test.db")
        with pytest.raises(SearchExecutionError, match="unavailable"):
            idx.search_sessions("test")
        with pytest.raises(SearchExecutionError, match="unavailable"):
            idx.search_knowledge("test")
        with pytest.raises(SearchExecutionError, match="unavailable"):
            idx.search_channel_logs("test")


# ---------------------------------------------------------------------------
# Session methods
# ---------------------------------------------------------------------------

class TestSessionIndex:
    def setup_method(self):
        self.idx = FullTextIndex(":memory:")

    def test_index_and_search(self):
        self.idx.index_session("s1", "The quick brown fox", "ch1", 1000.0)
        results = self.idx.search_sessions("fox")
        assert len(results) == 1
        assert results[0]["doc_id"] == "s1"
        assert results[0]["type"] == "fts"

    def test_search_returns_snippet(self):
        self.idx.index_session("s1", "The quick brown fox jumps over", "ch1", 1000.0)
        results = self.idx.search_sessions("fox")
        assert "content" in results[0]

    def test_search_no_match(self):
        self.idx.index_session("s1", "hello world", "ch1", 1000.0)
        results = self.idx.search_sessions("nonexistent")
        assert results == []

    @pytest.mark.parametrize("term", ["don't", "C++", "foo,bar", "a=b", "hello!"])
    def test_punctuation_terms_return_real_results(self, term):
        self.idx.index_session("s1", f"prefix {term} suffix", "ch1", 1000.0)
        assert [r["doc_id"] for r in self.idx.search_sessions(term)] == ["s1"]

    def test_dotted_multi_term_query_is_implicit_and_not_phrase(self):
        self.idx.index_session(
            "s1", "error.log appeared many unrelated words before recovered", "ch1", 1000.0
        )
        results = self.idx.search_sessions("error.log recovered")
        assert [r["doc_id"] for r in results] == ["s1"]

    def test_control_character_surfaces_invalid_query(self):
        self.idx.index_session("s1", "bad query", "ch1", 1000.0)
        with pytest.raises(InvalidSearchQuery, match="invalid query"):
            self.idx.search_sessions("bad\x00query")

    def test_search_with_channel_filter(self):
        self.idx.index_session("s1", "error in production", "ch1", 1000.0)
        self.idx.index_session("s2", "error in staging", "ch2", 1001.0)
        results = self.idx.search_sessions("error", channel_id="ch1")
        assert len(results) == 1
        assert results[0]["doc_id"] == "s1"

    def test_search_limit(self):
        for i in range(10):
            self.idx.index_session(f"s{i}", f"common term test {i}", "ch1", float(i))
        results = self.idx.search_sessions("common", limit=3)
        assert len(results) == 3

    def test_upsert_replaces(self):
        self.idx.index_session("s1", "original content", "ch1", 1000.0)
        self.idx.index_session("s1", "updated content", "ch1", 1001.0)
        results = self.idx.search_sessions("original")
        assert len(results) == 0
        results = self.idx.search_sessions("updated")
        assert len(results) == 1

    def test_has_session(self):
        assert self.idx.has_session("s1") is False
        self.idx.index_session("s1", "content", "ch1", 1000.0)
        assert self.idx.has_session("s1") is True

    def test_index_returns_true(self):
        result = self.idx.index_session("s1", "content", "ch1", 1000.0)
        assert result is True

    def test_timestamp_in_result(self):
        self.idx.index_session("s1", "searchable text", "ch1", 1234.5)
        results = self.idx.search_sessions("searchable")
        assert results[0]["timestamp"] == 1234.5

    def test_rank_in_result(self):
        self.idx.index_session("s1", "test query data", "ch1", 1000.0)
        results = self.idx.search_sessions("test")
        assert "rank" in results[0]


# ---------------------------------------------------------------------------
# Knowledge methods
# ---------------------------------------------------------------------------

class TestKnowledgeIndex:
    def setup_method(self):
        self.idx = FullTextIndex(":memory:")

    def test_index_and_search(self):
        self.idx.index_knowledge_chunk("k1", "Docker networking basics", "docs.md", 0)
        results = self.idx.search_knowledge("Docker")
        assert len(results) == 1
        assert results[0]["chunk_id"] == "k1"
        assert results[0]["source"] == "docs.md"
        assert results[0]["type"] == "fts"

    def test_search_no_match(self):
        self.idx.index_knowledge_chunk("k1", "something else", "src.md", 0)
        results = self.idx.search_knowledge("nonexistent")
        assert results == []

    @pytest.mark.parametrize("term", ["don't", "C++", "foo,bar", "a=b", "hello!"])
    def test_punctuation_terms_return_real_results(self, term):
        self.idx.index_knowledge_chunk("k1", f"prefix {term} suffix", "src.md", 0)
        assert [r["chunk_id"] for r in self.idx.search_knowledge(term)] == ["k1"]

    def test_search_limit(self):
        for i in range(10):
            self.idx.index_knowledge_chunk(f"k{i}", f"common term doc {i}", "src.md", i)
        results = self.idx.search_knowledge("common", limit=3)
        assert len(results) == 3

    def test_upsert_replaces(self):
        self.idx.index_knowledge_chunk("k1", "original", "src.md", 0)
        self.idx.index_knowledge_chunk("k1", "updated", "src.md", 0)
        assert self.idx.search_knowledge("original") == []
        assert len(self.idx.search_knowledge("updated")) == 1

    def test_has_knowledge_chunk(self):
        assert self.idx.has_knowledge_chunk("k1") is False
        self.idx.index_knowledge_chunk("k1", "content", "src.md", 0)
        assert self.idx.has_knowledge_chunk("k1") is True

    def test_delete_exact_knowledge_chunks(self):
        self.idx.index_knowledge_chunk("k1", "one", "src.md", 0)
        self.idx.index_knowledge_chunk("k2", "two", "src.md", 1)
        self.idx.index_knowledge_chunk("k3", "three", "other.md", 0)
        assert self.idx.delete_knowledge_chunks({"k1", "k2"}) == 2
        assert not self.idx.has_knowledge_chunk("k1")
        assert not self.idx.has_knowledge_chunk("k2")
        assert self.idx.has_knowledge_chunk("k3")

    def test_delete_knowledge_source(self):
        self.idx.index_knowledge_chunk("k1", "content a", "src.md", 0)
        self.idx.index_knowledge_chunk("k2", "content b", "src.md", 1)
        self.idx.index_knowledge_chunk("k3", "content c", "other.md", 0)
        deleted = self.idx.delete_knowledge_source("src.md")
        assert deleted == 2
        assert self.idx.has_knowledge_chunk("k1") is False
        assert self.idx.has_knowledge_chunk("k3") is True

    def test_delete_nonexistent_source(self):
        deleted = self.idx.delete_knowledge_source("missing.md")
        assert deleted == 0

    def test_chunk_index_in_result(self):
        self.idx.index_knowledge_chunk("k1", "searchable text", "src.md", 5)
        results = self.idx.search_knowledge("searchable")
        assert results[0]["chunk_index"] == 5


# ---------------------------------------------------------------------------
# Channel log methods
# ---------------------------------------------------------------------------

class TestChannelLogIndex:
    def setup_method(self):
        self.idx = FullTextIndex(":memory:")

    def test_index_and_search(self):
        msgs = [
            {
                "content": "Server restarted successfully",
                "author": "admin",
                "channel_id": "ch1",
                "ts": 1000.0,
            },
        ]
        count = self.idx.index_channel_messages(msgs)
        assert count == 1
        results = self.idx.search_channel_logs("restarted")
        assert len(results) == 1
        assert results[0]["author"] == "admin"
        assert results[0]["type"] == "channel"

    def test_batch_insert(self):
        msgs = [
            {"content": f"Message {i}", "author": "user", "channel_id": "ch1", "ts": float(i)}
            for i in range(5)
        ]
        count = self.idx.index_channel_messages(msgs)
        assert count == 5

    def test_empty_content_skipped(self):
        msgs = [
            {"content": "", "author": "user", "channel_id": "ch1", "ts": 1.0},
            {"content": "valid msg", "author": "user", "channel_id": "ch1", "ts": 2.0},
        ]
        count = self.idx.index_channel_messages(msgs)
        assert count == 1

    def test_no_messages(self):
        count = self.idx.index_channel_messages([])
        assert count == 0

    def test_search_with_channel_filter(self):
        msgs = [
            {"content": "error on prod", "author": "admin", "channel_id": "ch1", "ts": 1.0},
            {"content": "error on staging", "author": "admin", "channel_id": "ch2", "ts": 2.0},
        ]
        self.idx.index_channel_messages(msgs)
        results = self.idx.search_channel_logs("error", channel_id="ch1")
        assert len(results) == 1

    @pytest.mark.parametrize("term", ["don't", "C++", "foo,bar", "a=b", "hello!"])
    def test_punctuation_terms_return_real_results(self, term):
        self.idx.index_channel_messages([{
            "content": f"prefix {term} suffix",
            "author": "user",
            "channel_id": "ch1",
            "ts": 1.0,
        }])
        assert len(self.idx.search_channel_logs(term)) == 1

    def test_clear_channel_logs(self):
        msgs = [{"content": "hello world", "author": "user", "channel_id": "ch1", "ts": 1.0}]
        self.idx.index_channel_messages(msgs)
        assert len(self.idx.search_channel_logs("hello")) == 1
        result = self.idx.clear_channel_logs()
        assert result is True
        assert self.idx.search_channel_logs("hello") == []

    def test_search_limit(self):
        msgs = [
            {
                "content": f"common term msg {i}",
                "author": "user",
                "channel_id": "ch1",
                "ts": float(i),
            }
            for i in range(10)
        ]
        self.idx.index_channel_messages(msgs)
        results = self.idx.search_channel_logs("common", limit=3)
        assert len(results) == 3

    def test_missing_fields_handled(self):
        msgs = [{"content": "just content"}]  # No author, channel_id, ts
        count = self.idx.index_channel_messages(msgs)
        assert count == 1


# ---------------------------------------------------------------------------
# Unavailable index (conn is None)
# ---------------------------------------------------------------------------

class TestUnavailableIndex:
    def setup_method(self):
        self.idx = FullTextIndex("/nonexistent/path/test.db")

    def test_index_session_returns_false(self):
        assert self.idx.index_session("s1", "c", "ch", 0.0) is False

    def test_has_session_returns_false(self):
        assert self.idx.has_session("s1") is False

    def test_index_knowledge_returns_false(self):
        assert self.idx.index_knowledge_chunk("k1", "c", "s", 0) is False

    def test_has_knowledge_returns_false(self):
        assert self.idx.has_knowledge_chunk("k1") is False

    def test_delete_knowledge_returns_zero(self):
        assert self.idx.delete_knowledge_source("s") == 0

    def test_clear_channel_logs_returns_false(self):
        assert self.idx.clear_channel_logs() is False

    def test_index_channel_messages_returns_zero(self):
        assert self.idx.index_channel_messages([{"content": "test"}]) == 0
