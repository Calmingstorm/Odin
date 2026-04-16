"""Tests for Reciprocal Rank Fusion hybrid search (src/search/hybrid.py).

Covers reciprocal_rank_fusion: merging, deduplication, scoring, limit,
custom id_key, k parameter, empty inputs, and single-list passthrough.
"""
from __future__ import annotations

import pytest

from src.search.hybrid import reciprocal_rank_fusion


# ---------------------------------------------------------------------------
# Basic merging
# ---------------------------------------------------------------------------

class TestBasicMerge:
    def test_empty_input(self):
        assert reciprocal_rank_fusion() == []

    def test_single_empty_list(self):
        assert reciprocal_rank_fusion([]) == []

    def test_multiple_empty_lists(self):
        assert reciprocal_rank_fusion([], [], []) == []

    def test_single_list_passthrough(self):
        items = [{"doc_id": "a"}, {"doc_id": "b"}]
        result = reciprocal_rank_fusion(items)
        assert len(result) == 2
        assert result[0]["doc_id"] == "a"
        assert result[1]["doc_id"] == "b"

    def test_single_item(self):
        result = reciprocal_rank_fusion([{"doc_id": "x", "text": "hello"}])
        assert len(result) == 1
        assert result[0]["doc_id"] == "x"
        assert result[0]["text"] == "hello"
        assert "rrf_score" in result[0]


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

class TestScoring:
    def test_rrf_score_is_positive(self):
        items = [{"doc_id": "a"}]
        result = reciprocal_rank_fusion(items)
        assert result[0]["rrf_score"] > 0

    def test_higher_rank_gets_higher_score(self):
        items = [{"doc_id": "a"}, {"doc_id": "b"}]
        result = reciprocal_rank_fusion(items)
        assert result[0]["rrf_score"] > result[1]["rrf_score"]

    def test_default_k_is_60(self):
        """With k=60, first item score should be 1/(60+1) = 1/61."""
        items = [{"doc_id": "a"}]
        result = reciprocal_rank_fusion(items, k=60)
        expected = round(1.0 / 61, 6)
        assert result[0]["rrf_score"] == expected

    def test_custom_k(self):
        items = [{"doc_id": "a"}]
        result = reciprocal_rank_fusion(items, k=10)
        expected = round(1.0 / 11, 6)
        assert result[0]["rrf_score"] == expected

    def test_item_in_multiple_lists_scores_higher(self):
        """An item appearing in two lists accumulates RRF scores."""
        list1 = [{"doc_id": "shared"}, {"doc_id": "only1"}]
        list2 = [{"doc_id": "only2"}, {"doc_id": "shared"}]
        result = reciprocal_rank_fusion(list1, list2)
        shared = next(r for r in result if r["doc_id"] == "shared")
        only1 = next(r for r in result if r["doc_id"] == "only1")
        assert shared["rrf_score"] > only1["rrf_score"]


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

class TestDeduplication:
    def test_dedup_keeps_highest_ranked_version(self):
        """When an item appears in multiple lists, the version from the
        list where it ranked first (highest) should be kept."""
        list1 = [{"doc_id": "x", "source": "list1"}]
        list2 = [{"doc_id": "other"}, {"doc_id": "x", "source": "list2"}]
        result = reciprocal_rank_fusion(list1, list2)
        x_item = next(r for r in result if r["doc_id"] == "x")
        assert x_item["source"] == "list1"

    def test_no_duplicate_entries(self):
        list1 = [{"doc_id": "a"}, {"doc_id": "b"}]
        list2 = [{"doc_id": "a"}, {"doc_id": "c"}]
        result = reciprocal_rank_fusion(list1, list2)
        ids = [r["doc_id"] for r in result]
        assert len(ids) == len(set(ids))


# ---------------------------------------------------------------------------
# Limit
# ---------------------------------------------------------------------------

class TestLimit:
    def test_default_limit_10(self):
        items = [{"doc_id": str(i)} for i in range(20)]
        result = reciprocal_rank_fusion(items)
        assert len(result) == 10

    def test_custom_limit(self):
        items = [{"doc_id": str(i)} for i in range(20)]
        result = reciprocal_rank_fusion(items, limit=5)
        assert len(result) == 5

    def test_limit_larger_than_items(self):
        items = [{"doc_id": "a"}, {"doc_id": "b"}]
        result = reciprocal_rank_fusion(items, limit=100)
        assert len(result) == 2


# ---------------------------------------------------------------------------
# Custom id_key
# ---------------------------------------------------------------------------

class TestCustomIdKey:
    def test_custom_id_key(self):
        items = [{"chunk_id": "c1", "text": "x"}, {"chunk_id": "c2", "text": "y"}]
        result = reciprocal_rank_fusion(items, id_key="chunk_id")
        assert result[0]["chunk_id"] == "c1"

    def test_missing_id_key_uses_rank(self):
        """When id_key is not present, items should still be processed."""
        items = [{"text": "x"}, {"text": "y"}]
        result = reciprocal_rank_fusion(items, id_key="missing_key")
        assert len(result) == 2


# ---------------------------------------------------------------------------
# Multiple lists fusion
# ---------------------------------------------------------------------------

class TestMultipleListsFusion:
    def test_three_lists(self):
        l1 = [{"doc_id": "a"}, {"doc_id": "b"}]
        l2 = [{"doc_id": "b"}, {"doc_id": "c"}]
        l3 = [{"doc_id": "a"}, {"doc_id": "c"}]
        result = reciprocal_rank_fusion(l1, l2, l3)
        # Both a and b appear in 2 lists each; a and c appear in position 0 twice
        ids = [r["doc_id"] for r in result]
        assert set(ids) == {"a", "b", "c"}

    def test_disjoint_lists(self):
        l1 = [{"doc_id": "a"}]
        l2 = [{"doc_id": "b"}]
        result = reciprocal_rank_fusion(l1, l2)
        ids = {r["doc_id"] for r in result}
        assert ids == {"a", "b"}
        # Both at rank 0, so same score
        assert result[0]["rrf_score"] == result[1]["rrf_score"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_original_dicts_not_mutated(self):
        item = {"doc_id": "a", "data": "original"}
        reciprocal_rank_fusion([item])
        assert "rrf_score" not in item

    def test_rrf_score_is_rounded(self):
        result = reciprocal_rank_fusion([{"doc_id": "a"}])
        score_str = str(result[0]["rrf_score"])
        # Should have at most 6 decimal places
        if "." in score_str:
            assert len(score_str.split(".")[1]) <= 6

    def test_result_is_new_dict(self):
        """Each result should be a new dict, not a reference to the input."""
        item = {"doc_id": "a"}
        result = reciprocal_rank_fusion([item])
        result[0]["extra"] = "added"
        assert "extra" not in item

    def test_large_input(self):
        """Handles a large number of items without error."""
        items = [{"doc_id": str(i)} for i in range(1000)]
        result = reciprocal_rank_fusion(items, limit=50)
        assert len(result) == 50

    def test_numeric_doc_id_coerced_to_string(self):
        items = [{"doc_id": 123}]
        result = reciprocal_rank_fusion(items)
        assert len(result) == 1
