"""Tests for the shared relevance module and its prompt-assembly consumers."""
from __future__ import annotations

import pytest

from src.relevance import rank, score, tokenize


class TestTokenize:
    def test_filters_stop_words_and_short_tokens(self):
        assert tokenize("the cat is on a mat") == {"cat", "mat"}

    def test_keeps_identifiers(self):
        tokens = tokenize("check /opt/odin/config.yml on host-1")
        assert "/opt/odin/config.yml" in tokens
        assert "host-1" in tokens


class TestScore:
    def test_full_overlap(self):
        assert score("nginx restart", "restart nginx now") == 1.0

    def test_no_overlap(self):
        assert score("nginx restart", "minecraft mods") == 0.0

    def test_empty_query(self):
        assert score("", "anything") == 0.0


class TestRank:
    def test_top_k_and_floor(self):
        items = ["nginx config reload", "dns zone update", "totally unrelated words"]
        result = rank("nginx config", items, lambda s: s, top_k=2, floor=0.4)
        assert result == ["nginx config reload"]

    def test_stable_order_for_ties(self):
        items = ["b unrelated", "a unrelated"]
        result = rank("xyz", items, lambda s: s, top_k=2, floor=0.0)
        assert result == ["b unrelated", "a unrelated"]  # original order kept


class TestPerChannelBudgetOverride:
    @pytest.mark.asyncio
    async def test_override_applies_to_channel(self, tmp_path):
        from src.sessions.manager import SessionManager

        mgr = SessionManager(
            max_history=200, max_age_hours=24, persist_dir=str(tmp_path),
            context_token_budget=100,
            context_budget_overrides={"hot-channel": 1_000_000},
        )
        for ch in ("hot-channel", "cold-channel"):
            for i in range(30):
                mgr.add_message(ch, "user", f"{ch} message {i} " + "filler words " * 40)

        hot = await mgr.get_task_history("hot-channel", max_messages=160)
        cold = await mgr.get_task_history("cold-channel", max_messages=160)
        # The hot channel keeps everything; the 100-token default forces
        # the cold channel down to its protected recent tail.
        assert len(hot) > len(cold)
        assert len(hot) >= 30
