"""Deterministic coverage for KnowledgeStore's DB-error fallbacks (RFC-006 P0).

Three ``except Exception`` branches (get_source_content, _find_by_doc_hash,
_find_near_duplicate) are hit only when a query raises, which happened
intermittently depending on cross-test state — the same class of coverage
nondeterminism that made the P0 baseline flake by ~6 lines run-to-run. Each
branch is forced explicitly here so those lines are covered in every run.
"""
from __future__ import annotations

from src.knowledge.store import KnowledgeStore


class _RaisingConn:
    """Non-None connection whose execute() always raises — so ``available``
    (which is just ``_conn is not None``) stays True and the try/except in
    each query method fires deterministically."""

    def execute(self, *args, **kwargs):
        raise RuntimeError("simulated sqlite failure")


def _store_with_broken_conn() -> KnowledgeStore:
    store = KnowledgeStore.__new__(KnowledgeStore)
    store._conn = _RaisingConn()
    return store


class TestQueryErrorFallbacks:
    def test_get_source_content_swallows_and_returns_none(self):
        assert _store_with_broken_conn().get_source_content("any-source") is None

    def test_find_by_doc_hash_swallows_and_returns_none(self):
        assert _store_with_broken_conn()._find_by_doc_hash("deadbeef") is None

    def test_find_near_duplicate_swallows_and_returns_none(self):
        store = _store_with_broken_conn()
        assert store._find_near_duplicate(["h1", "h2"], exclude_source="s") is None

    def test_find_near_duplicate_empty_hashes_short_circuits(self):
        # The guard above the try: no hashes → None without touching the DB.
        store = _store_with_broken_conn()
        assert store._find_near_duplicate([], exclude_source="s") is None
