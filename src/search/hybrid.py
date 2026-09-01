"""Reciprocal Rank Fusion for merging multiple ranked result lists."""
from __future__ import annotations

from .errors import SearchInvariantError


def reciprocal_rank_fusion(
    *result_lists: list[dict],
    id_key: str = "doc_id",
    k: int = 60,
    limit: int = 10,
) -> list[dict]:
    """Merge multiple ranked result lists using RRF.

    Each list is assumed to be in rank order (best first).
    Results identified by *id_key* are deduplicated; the dict from the
    highest-ranked occurrence is kept. A missing identity is an invariant
    violation rather than an invitation to synthesize one from rank or metadata.
    Returns top *limit* results
    sorted by fused score descending, with ``rrf_score`` added.
    """
    scores: dict[str, float] = {}
    best: dict[str, dict] = {}

    for result_list in result_lists:
        for rank_0, item in enumerate(result_list):
            if id_key not in item or item[id_key] in (None, ""):
                raise SearchInvariantError(
                    f"search result is missing required identity field {id_key!r}"
                )
            item_id = str(item[id_key])
            rrf = 1.0 / (k + rank_0 + 1)  # rank is 1-based in the formula
            scores[item_id] = scores.get(item_id, 0.0) + rrf
            # Keep the version from the list where it ranked highest
            if item_id not in best:
                best[item_id] = item

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]
    out = []
    for item_id, score in ranked:
        entry = dict(best[item_id])
        entry["rrf_score"] = round(score, 6)
        out.append(entry)
    return out
