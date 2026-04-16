"""Tests for tool use memory (src/tools/tool_memory.py).

Covers extract_keywords, _jaccard, _cosine, ToolMemory record/find/format,
caching, expiry, file persistence, and edge cases.
"""
from __future__ import annotations

import json
import math
import tempfile
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.tools.tool_memory import (
    MAX_ENTRIES,
    EXPIRY_DAYS,
    MIN_JACCARD_SCORE,
    MIN_SEMANTIC_SCORE,
    ToolMemory,
    _cosine,
    _jaccard,
    extract_keywords,
)


# ---------------------------------------------------------------------------
# extract_keywords
# ---------------------------------------------------------------------------

class TestExtractKeywords:
    def test_basic_extraction(self):
        result = extract_keywords("check disk usage on server")
        assert "check" in result
        assert "disk" in result
        assert "usage" in result
        assert "server" in result

    def test_stop_words_removed(self):
        result = extract_keywords("the quick brown fox is a test")
        assert "the" not in result
        assert "is" not in result
        assert "a" not in result

    def test_short_words_removed(self):
        result = extract_keywords("I a x test")
        # Single-char words should be excluded
        assert all(len(w) > 1 for w in result)

    def test_lowercased(self):
        result = extract_keywords("Check DISK Usage")
        assert "check" in result
        assert "disk" in result

    def test_empty_string(self):
        assert extract_keywords("") == []

    def test_only_stop_words(self):
        assert extract_keywords("the is a an") == []

    def test_underscore_words(self):
        result = extract_keywords("run_command on host_name")
        assert "run_command" in result
        assert "host_name" in result

    def test_numbers_included(self):
        result = extract_keywords("error 404 on port 8080")
        assert "404" in result
        assert "8080" in result


# ---------------------------------------------------------------------------
# _jaccard
# ---------------------------------------------------------------------------

class TestJaccard:
    def test_identical_sets(self):
        assert _jaccard({"a", "b"}, {"a", "b"}) == 1.0

    def test_disjoint_sets(self):
        assert _jaccard({"a"}, {"b"}) == 0.0

    def test_partial_overlap(self):
        result = _jaccard({"a", "b", "c"}, {"b", "c", "d"})
        assert abs(result - 2.0 / 4.0) < 1e-6

    def test_empty_sets(self):
        assert _jaccard(set(), set()) == 0.0
        assert _jaccard({"a"}, set()) == 0.0
        assert _jaccard(set(), {"a"}) == 0.0

    def test_subset(self):
        result = _jaccard({"a", "b"}, {"a", "b", "c"})
        assert abs(result - 2.0 / 3.0) < 1e-6


# ---------------------------------------------------------------------------
# _cosine
# ---------------------------------------------------------------------------

class TestCosine:
    def test_identical_vectors(self):
        assert abs(_cosine([1.0, 0.0], [1.0, 0.0]) - 1.0) < 1e-6

    def test_orthogonal_vectors(self):
        assert abs(_cosine([1.0, 0.0], [0.0, 1.0])) < 1e-6

    def test_opposite_vectors(self):
        assert abs(_cosine([1.0, 0.0], [-1.0, 0.0]) - (-1.0)) < 1e-6

    def test_different_lengths(self):
        assert _cosine([1.0, 2.0], [1.0]) == 0.0

    def test_zero_vector(self):
        assert _cosine([0.0, 0.0], [1.0, 1.0]) == 0.0

    def test_known_value(self):
        a = [1.0, 2.0, 3.0]
        b = [4.0, 5.0, 6.0]
        dot = 1*4 + 2*5 + 3*6  # 32
        norm_a = math.sqrt(1+4+9)
        norm_b = math.sqrt(16+25+36)
        expected = dot / (norm_a * norm_b)
        assert abs(_cosine(a, b) - expected) < 1e-6


# ---------------------------------------------------------------------------
# ToolMemory — basic lifecycle
# ---------------------------------------------------------------------------

class TestToolMemoryBasic:
    def test_init_no_path(self):
        tm = ToolMemory()
        assert tm._entries == []

    def test_init_nonexistent_path(self):
        tm = ToolMemory("/nonexistent/path/memory.json")
        assert tm._entries == []

    @pytest.mark.asyncio
    async def test_record_basic(self):
        tm = ToolMemory()
        await tm.record("check disk on server", ["run_command", "read_file"])
        assert len(tm._entries) == 1
        assert tm._entries[0]["tools_used"] == ["run_command", "read_file"]

    @pytest.mark.asyncio
    async def test_record_no_tools_skipped(self):
        tm = ToolMemory()
        await tm.record("hello", [])
        assert len(tm._entries) == 0

    @pytest.mark.asyncio
    async def test_record_no_keywords_skipped(self):
        tm = ToolMemory()
        await tm.record("the is a", ["run_command"])  # all stop words
        assert len(tm._entries) == 0

    @pytest.mark.asyncio
    async def test_record_truncates_query(self):
        tm = ToolMemory()
        long_query = "x" * 300
        await tm.record(long_query, ["tool"])
        assert len(tm._entries[0]["query"]) == 200

    @pytest.mark.asyncio
    async def test_record_with_success_flag(self):
        tm = ToolMemory()
        await tm.record("test query word", ["tool1"], success=False)
        assert tm._entries[0]["success"] is False


# ---------------------------------------------------------------------------
# ToolMemory — find_patterns
# ---------------------------------------------------------------------------

class TestToolMemoryFindPatterns:
    @pytest.mark.asyncio
    async def test_find_no_entries(self):
        tm = ToolMemory()
        results = await tm.find_patterns("check disk")
        assert results == []

    @pytest.mark.asyncio
    async def test_find_matching_pattern(self):
        tm = ToolMemory()
        await tm.record("check disk usage on server", ["run_command", "read_file"])
        results = await tm.find_patterns("check disk space")
        assert len(results) == 1
        assert results[0]["tools_used"] == ["run_command", "read_file"]

    @pytest.mark.asyncio
    async def test_find_skips_failed(self):
        tm = ToolMemory()
        await tm.record("check disk usage", ["run_command", "read_file"], success=False)
        results = await tm.find_patterns("check disk")
        assert results == []

    @pytest.mark.asyncio
    async def test_find_skips_single_tool(self):
        tm = ToolMemory()
        await tm.record("check disk usage", ["run_command"])
        results = await tm.find_patterns("check disk")
        assert results == []

    @pytest.mark.asyncio
    async def test_find_respects_allowed_tools(self):
        tm = ToolMemory()
        await tm.record("check disk on server", ["run_command", "read_file"])
        results = await tm.find_patterns(
            "check disk", allowed_tools={"run_command"}
        )
        assert results == []  # read_file not in allowed set

    @pytest.mark.asyncio
    async def test_find_limit(self):
        tm = ToolMemory()
        for i in range(5):
            await tm.record(
                f"check disk server{i}", [f"tool_{i}_a", f"tool_{i}_b"]
            )
        results = await tm.find_patterns("check disk", limit=2)
        assert len(results) <= 2

    @pytest.mark.asyncio
    async def test_find_deduplicates_sequences(self):
        tm = ToolMemory()
        await tm.record("check disk usage", ["run_command", "read_file"])
        await tm.record("check disk space", ["run_command", "read_file"])
        results = await tm.find_patterns("check disk")
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_find_no_matching_keywords(self):
        tm = ToolMemory()
        await tm.record("check disk usage", ["run_command", "read_file"])
        results = await tm.find_patterns("deploy application")
        assert results == []


# ---------------------------------------------------------------------------
# ToolMemory — format_hints
# ---------------------------------------------------------------------------

class TestToolMemoryFormatHints:
    @pytest.mark.asyncio
    async def test_empty_hints(self):
        tm = ToolMemory()
        result = await tm.format_hints("anything")
        assert result == ""

    @pytest.mark.asyncio
    async def test_hints_with_patterns(self):
        tm = ToolMemory()
        await tm.record("check disk usage", ["run_command", "read_file"])
        result = await tm.format_hints("check disk space")
        assert "Tool Use Patterns" in result
        assert "`run_command`" in result
        assert "`read_file`" in result

    @pytest.mark.asyncio
    async def test_hints_cached(self):
        tm = ToolMemory()
        await tm.record("check disk usage", ["run_command", "read_file"])
        result1 = await tm.format_hints("check disk space")
        result2 = await tm.format_hints("check disk space")
        assert result1 == result2
        # Should be in cache
        assert "check disk space"[:200] in tm._hints_cache

    @pytest.mark.asyncio
    async def test_hints_cache_eviction(self):
        tm = ToolMemory()
        tm._hints_cache_ttl = 0.01  # 10ms
        await tm.record("check disk usage", ["run_command", "read_file"])
        await tm.format_hints("query1")
        time.sleep(0.02)
        # After TTL, should recompute
        await tm.format_hints("query1")


# ---------------------------------------------------------------------------
# ToolMemory — persistence
# ---------------------------------------------------------------------------

class TestToolMemoryPersistence:
    @pytest.mark.asyncio
    async def test_save_and_load(self):
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            path = f.name
            f.write("[]")

        try:
            tm1 = ToolMemory(path)
            await tm1.record("check disk usage", ["run_command", "read_file"])
            assert Path(path).exists()

            tm2 = ToolMemory(path)
            assert len(tm2._entries) == 1
            assert tm2._entries[0]["tools_used"] == ["run_command", "read_file"]
        finally:
            Path(path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_load_corrupted_file(self):
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            path = f.name
            f.write("not valid json")

        try:
            tm = ToolMemory(path)
            assert tm._entries == []
        finally:
            Path(path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_load_non_list_json(self):
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            path = f.name
            f.write('{"key": "value"}')

        try:
            tm = ToolMemory(path)
            assert tm._entries == []
        finally:
            Path(path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# ToolMemory — max entries / expiry
# ---------------------------------------------------------------------------

class TestToolMemoryLimits:
    @pytest.mark.asyncio
    async def test_max_entries_cap(self):
        tm = ToolMemory()
        for i in range(MAX_ENTRIES + 10):
            await tm.record(f"query number {i}", [f"tool_{i}_a", f"tool_{i}_b"])
        assert len(tm._entries) <= MAX_ENTRIES

    @pytest.mark.asyncio
    async def test_expiry_removes_old(self):
        tm = ToolMemory()
        # Manually add an old entry
        tm._entries.append({
            "query": "old query word",
            "keywords": ["old", "query", "word"],
            "tools_used": ["tool1", "tool2"],
            "success": True,
            "timestamp": "2020-01-01T00:00:00+00:00",
        })
        tm._expire()
        assert len(tm._entries) == 0


# ---------------------------------------------------------------------------
# ToolMemory — embeddings
# ---------------------------------------------------------------------------

class TestToolMemoryEmbeddings:
    @pytest.mark.asyncio
    async def test_record_with_embedder(self):
        mock_embedder = AsyncMock()
        mock_embedder.embed = AsyncMock(return_value=[0.1, 0.2, 0.3])
        tm = ToolMemory()
        await tm.record("check disk", ["tool1", "tool2"], embedder=mock_embedder)
        assert "embedding" in tm._entries[0]
        assert tm._entries[0]["embedding"] == [0.1, 0.2, 0.3]

    @pytest.mark.asyncio
    async def test_find_with_semantic_match(self):
        tm = ToolMemory()
        # Add entry with embedding
        tm._entries.append({
            "query": "check disk usage",
            "keywords": ["check", "disk", "usage"],
            "tools_used": ["run_command", "read_file"],
            "success": True,
            "timestamp": "2026-01-01T00:00:00+00:00",
            "embedding": [1.0, 0.0, 0.0],
        })

        mock_embedder = AsyncMock()
        mock_embedder.embed = AsyncMock(return_value=[1.0, 0.0, 0.0])

        results = await tm.find_patterns("check disk", embedder=mock_embedder)
        assert len(results) == 1

    @pytest.mark.asyncio
    async def test_find_low_cosine_falls_to_jaccard(self):
        """When cosine similarity is below threshold, fall through to Jaccard."""
        tm = ToolMemory()
        tm._entries.append({
            "query": "check disk usage",
            "keywords": ["check", "disk", "usage"],
            "tools_used": ["run_command", "read_file"],
            "success": True,
            "timestamp": "2026-01-01T00:00:00+00:00",
            "embedding": [0.0, 1.0, 0.0],  # orthogonal to query
        })

        mock_embedder = AsyncMock()
        mock_embedder.embed = AsyncMock(return_value=[1.0, 0.0, 0.0])

        # Should still match via Jaccard since keywords overlap
        results = await tm.find_patterns("check disk", embedder=mock_embedder)
        assert len(results) == 1


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_max_entries(self):
        assert MAX_ENTRIES == 200

    def test_expiry_days(self):
        assert EXPIRY_DAYS == 30

    def test_min_semantic_score(self):
        assert 0 < MIN_SEMANTIC_SCORE < 1

    def test_min_jaccard_score(self):
        assert 0 < MIN_JACCARD_SCORE < 1
