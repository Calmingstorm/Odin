"""Reciprocal Rank Fusion for merging multiple ranked result lists."""
from __future__ import annotations

from .errors import SearchInvariantError


def reciprocal_rank_fusion(
    *result_lists: list[dict],
    id_key: str = "doc_id",
    k: int = 60,
    limit: int = 10,
    prefer_list: int | None = None,
    list_names: tuple[str, ...] | None = None,
) -> list[dict]:
    """Merge multiple ranked result lists using RRF.

    Each list is assumed to be in rank order (best first).
    Results identified by *id_key* are deduplicated; the dict from the
    highest-ranked occurrence is kept. A missing identity is an invariant
    violation rather than an invitation to synthesize one from rank or metadata.
    Returns top *limit* results
    sorted by fused score descending, with ``rrf_score`` added.

    ``prefer_list`` breaks exact-score ties in favour of items found by that
    list (scores, payloads and identities are unchanged; only exact ties
    reorder). ``list_names`` adds ``found_by``: per named list, the item's
    1-based rank there and that list's ``score`` if it had one, independent of
    which list's payload was kept. Both default off.
    """
    if list_names is not None and len(list_names) != len(result_lists):
        raise ValueError("list_names must name every result list")
    scores: dict[str, float] = {}
    best: dict[str, dict] = {}
    best_ranks: dict[str, int] = {}
    found: dict[str, dict[str, dict]] = {}
    preferred: set[str] = set()

    for list_index, result_list in enumerate(result_lists):
        for rank_0, item in enumerate(result_list):
            if id_key not in item or item[id_key] in (None, ""):
                raise SearchInvariantError(
                    f"search result is missing required identity field {id_key!r}"
                )
            item_id = str(item[id_key])
            rrf = 1.0 / (k + rank_0 + 1)  # rank is 1-based in the formula
            scores[item_id] = scores.get(item_id, 0.0) + rrf
            # Keep the version from the list where it ranked highest
            # Equal ranks retain the earlier list's payload deterministically.
            if item_id not in best or rank_0 < best_ranks[item_id]:
                best[item_id] = item
                best_ranks[item_id] = rank_0
            if list_index == prefer_list:
                preferred.add(item_id)
            if list_names is not None:
                evidence = {"rank": rank_0 + 1}
                if "score" in item:
                    evidence["score"] = item["score"]
                found.setdefault(item_id, {}).setdefault(list_names[list_index], evidence)

    # Stable sort: equal (score, preference) keeps first-seen order.
    ranked = sorted(
        scores.items(), key=lambda x: (x[1], x[0] in preferred), reverse=True,
    )[:limit]
    out = []
    for item_id, score in ranked:
        entry = dict(best[item_id])
        entry["rrf_score"] = round(score, 6)
        if list_names is not None:
            entry["found_by"] = found[item_id]
        out.append(entry)
    return out


def match_label(result: dict) -> str:
    """How a fused result matched, for display: similarity and keyword evidence.

    Results without ``found_by`` (other search paths) keep the old score text.
    """
    found = result.get("found_by")
    if not isinstance(found, dict):
        return f"score: {result.get('score', result.get('rrf_score', result.get('rank', 0)))}"
    parts = []
    semantic = found.get("semantic")
    if isinstance(semantic, dict) and "score" in semantic:
        parts.append(f"similarity: {semantic['score']}")
    if "keyword" in found:
        parts.append("keyword match")
    return ", ".join(parts) or f"score: {result.get('rrf_score', 0)}"
