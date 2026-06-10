"""Shared relevance scoring for memory surfaces.

One ranking implementation used by both memory systems — learned-context
injection (reflector) and session context assembly (messages, summary
segments) — so selection behavior stays consistent and tunable in one
place. Lexical token-overlap scoring with stop-word filtering; cheap
enough to run inline on every request over a few hundred candidates.
"""
from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from typing import TypeVar

T = TypeVar("T")

# Common stop words to ignore when scoring relevance
STOP_WORDS = frozenset({
    "a", "an", "the", "is", "it", "in", "on", "to", "of", "and", "or",
    "for", "that", "this", "with", "was", "are", "be", "has", "have",
    "had", "do", "does", "did", "but", "not", "you", "i", "me", "my",
    "we", "he", "she", "they", "what", "how", "can", "will", "just",
    "so", "if", "no", "yes", "at", "by", "from", "up", "out", "as",
})

_TOKEN_RE = re.compile(r"[a-z0-9_./:-]+")


def tokenize(text: str) -> set[str]:
    """Extract meaningful lowercase tokens from text, filtering stop words."""
    return {t for t in _TOKEN_RE.findall(text.lower()) if t not in STOP_WORDS and len(t) > 1}


def score(query: str, text: str) -> float:
    """Score how relevant *text* is to *query* — 0.0 to 1.0.

    Jaccard-like overlap: |intersection| / |query_tokens|.
    """
    query_tokens = tokenize(query)
    if not query_tokens:
        return 0.0
    text_tokens = tokenize(text)
    if not text_tokens:
        return 0.0
    return len(query_tokens & text_tokens) / len(query_tokens)


def rank(
    query: str,
    items: Iterable[T],
    text_fn: Callable[[T], str],
    *,
    top_k: int,
    floor: float = 0.0,
) -> list[T]:
    """Return up to *top_k* items most relevant to *query*, best first.

    Items scoring below *floor* are excluded entirely. Ties keep the
    original iteration order (stable sort), so callers can pre-order by
    recency to break ties in favor of newer items.
    """
    scored = [(score(query, text_fn(item)), idx, item) for idx, item in enumerate(items)]
    kept = [(s, idx, item) for s, idx, item in scored if s >= floor]
    kept.sort(key=lambda x: (-x[0], x[1]))
    return [item for _, _, item in kept[:top_k]]
