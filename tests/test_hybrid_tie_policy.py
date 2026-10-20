"""RRF keyword-tie preference and match provenance (search may only get better)."""
from __future__ import annotations

import random

import pytest

from src.search.hybrid import match_label, reciprocal_rank_fusion


def _master_rrf(*result_lists, id_key="doc_id", k=60, limit=10):
    """The fusion as shipped before the tie policy, kept as an oracle."""
    scores, best, best_ranks = {}, {}, {}
    for result_list in result_lists:
        for rank_0, item in enumerate(result_list):
            item_id = str(item[id_key])
            scores[item_id] = scores.get(item_id, 0.0) + 1.0 / (k + rank_0 + 1)
            if item_id not in best or rank_0 < best_ranks[item_id]:
                best[item_id] = item
                best_ranks[item_id] = rank_0
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]
    return [{**best[i], "rrf_score": round(s, 6)} for i, s in ranked]


def _lists(rng: random.Random):
    pool = [f"d{i}" for i in range(12)]
    semantic = [{"doc_id": d, "score": round(rng.random(), 3), "src": "sem"}
                for d in rng.sample(pool, rng.randint(0, 8))]
    keyword = [{"doc_id": d, "src": "fts"} for d in rng.sample(pool, rng.randint(0, 8))]
    return semantic, keyword


@pytest.mark.parametrize("seed", range(300))
def test_defaults_are_byte_identical_to_master(seed):
    semantic, keyword = _lists(random.Random(seed))
    for limit in (1, 3, 10):
        assert reciprocal_rank_fusion(semantic, keyword, limit=limit) == _master_rrf(
            semantic, keyword, limit=limit,
        )


@pytest.mark.parametrize("seed", range(300))
def test_preference_only_reorders_exact_ties(seed):
    semantic, keyword = _lists(random.Random(seed))
    base = reciprocal_rank_fusion(semantic, keyword, limit=100)
    tied = reciprocal_rank_fusion(semantic, keyword, limit=100, prefer_list=1)

    # Identities, kept payloads and fused scores are unchanged.
    assert sorted(map(str, base), key=str) == sorted(map(str, tied), key=str)
    assert sorted(base, key=lambda r: r["doc_id"]) == sorted(tied, key=lambda r: r["doc_id"])
    # The score sequence is identical: only members of an exact tie move.
    assert [r["rrf_score"] for r in base] == [r["rrf_score"] for r in tied]
    keyword_ids = {item["doc_id"] for item in keyword}
    for a, b in zip(tied, tied[1:]):
        if a["rrf_score"] == b["rrf_score"]:
            assert not (b["doc_id"] in keyword_ids and a["doc_id"] not in keyword_ids)

    for limit in (1, 2, 3, 5):
        top = reciprocal_rank_fusion(semantic, keyword, limit=limit, prefer_list=1)
        old = reciprocal_rank_fusion(semantic, keyword, limit=limit)
        changed = {r["doc_id"] for r in top} ^ {r["doc_id"] for r in old}
        if changed:
            # Membership changes only where the cutoff splits a tie.
            cutoff = old[-1]["rrf_score"]
            assert all(r["rrf_score"] == cutoff for r in base if r["doc_id"] in changed)


def test_exact_keyword_match_wins_its_tie():
    semantic = [{"chunk_id": "unrelated", "score": 0.661, "content": "wormholes"}]
    keyword = [{"chunk_id": "the-doc", "content": ">>>zqx7781livetest<<<"}]

    assert [r["chunk_id"] for r in reciprocal_rank_fusion(
        semantic, keyword, id_key="chunk_id", limit=1)] == ["unrelated"]
    fused = reciprocal_rank_fusion(
        semantic, keyword, id_key="chunk_id", limit=1, prefer_list=1,
        list_names=("semantic", "keyword"),
    )
    assert [r["chunk_id"] for r in fused] == ["the-doc"]
    assert fused[0]["found_by"] == {"keyword": {"rank": 1}}


def test_provenance_keeps_the_semantic_score_when_the_keyword_payload_wins():
    semantic = [{"chunk_id": f"x{i}", "score": 0.9 - i / 100} for i in range(2)]
    semantic.append({"chunk_id": "both", "score": 0.66, "content": "semantic copy"})
    keyword = [{"chunk_id": "both", "content": "keyword copy"}]

    fused = reciprocal_rank_fusion(
        semantic, keyword, id_key="chunk_id", prefer_list=1,
        list_names=("semantic", "keyword"),
    )
    both = next(r for r in fused if r["chunk_id"] == "both")

    assert both["content"] == "keyword copy"
    assert both["found_by"] == {"semantic": {"rank": 3, "score": 0.66}, "keyword": {"rank": 1}}
    assert match_label(both) == "similarity: 0.66, keyword match"


@pytest.mark.parametrize(
    "result,label",
    [
        ({"found_by": {"semantic": {"rank": 1, "score": 0.755}}}, "similarity: 0.755"),
        ({"found_by": {"keyword": {"rank": 1}}}, "keyword match"),
        ({"found_by": {"semantic": {"rank": 2, "score": 0.7}, "keyword": {"rank": 1}}},
         "similarity: 0.7, keyword match"),
        ({"score": 0.5, "rrf_score": 0.016393}, "score: 0.5"),
        ({"rrf_score": 0.016393}, "score: 0.016393"),
        ({"found_by": {}, "rrf_score": 0.01}, "score: 0.01"),
    ],
)
def test_match_label(result, label):
    assert match_label(result) == label


def test_list_names_must_name_every_list():
    with pytest.raises(ValueError):
        reciprocal_rank_fusion([], [], list_names=("semantic",))
