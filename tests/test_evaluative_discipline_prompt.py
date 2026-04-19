"""Tests for the evaluative-discipline additions to system + classifier prompts.

Odin's Task 1/2 self-critique identified a gap: completing mechanics
without checking that the delivered artifact actually answered the
request. This test locks the prompt wording that's supposed to
counteract that, so a future edit can't silently remove it.
"""
from __future__ import annotations

import pytest

from src.llm.system_prompt import build_system_prompt
from src.discord.client import OdinBot


class TestSystemPromptRule12:
    def _prompt(self) -> str:
        return build_system_prompt(
            context="",
            hosts={"localhost": "127.0.0.1"},
            tz="UTC",
            claude_code_dir="/opt/odin",
        )

    def test_rule_12_present(self):
        assert "12. EVALUATIVE DISCIPLINE" in self._prompt()

    def test_mentions_artifact_check(self):
        p = self._prompt()
        assert "name the artifact" in p
        assert "confirm your response actually contains it" in p

    def test_mentions_frequency_not_value(self):
        assert "frequency is not value" in self._prompt()

    def test_mentions_plausible_substitute_rejection(self):
        assert "don't ship a plausible substitute" in self._prompt()

    def test_mentions_anti_offer_pattern(self):
        assert 'Don\'t close with "I could also' in self._prompt()

    def test_prompt_size_reasonable(self):
        """Sanity-check that the rule didn't balloon the prompt. Under
        6000 chars keeps a healthy margin vs. the ~5500 baseline."""
        size = len(self._prompt())
        assert size < 6000, f"system prompt is {size} chars — Rule 12 is too long"


class TestCompletionClassifierPrompt:
    def test_classifier_rejects_plausible_substitute(self):
        """The classifier prompt now explicitly teaches it to flag
        INCOMPLETE when the artifact doesn't match the request shape."""
        prompt = OdinBot._CLASSIFIER_SYSTEM_PROMPT
        assert "plausible-shaped substitute" in prompt
        assert "artifact asked for was produced" in prompt

    def test_classifier_rejects_offering_more_work(self):
        """The classifier learns to flag 'I could also' as INCOMPLETE
        rather than closure."""
        prompt = OdinBot._CLASSIFIER_SYSTEM_PROMPT
        assert "I could also" in prompt or "would you like" in prompt
        # Example of this class of incompletion must be present so the
        # classifier has a concrete target.
        assert "offering MORE work" in prompt

    def test_classifier_example_covers_missing_source(self):
        """Concrete example from Odin's Task 1 critique: described the
        runbook without including its source."""
        assert (
            "described the synthesized runbook but did not include its source"
            in OdinBot._CLASSIFIER_SYSTEM_PROMPT
        )
