"""Tests for tool-affordance metadata (cost/risk/latency/preconditions)."""
from __future__ import annotations

import pytest

from src.tools.affordances import (
    Affordance,
    Cost,
    Latency,
    Risk,
    all_affordances,
    decorate_description,
    format_affordance_footer,
    get_affordance,
)
from src.tools.registry import TOOLS, get_tool_definitions, invalidate_tool_defs_cache


class TestGetAffordance:
    def test_known_tool_exact(self):
        aff = get_affordance("run_command")
        assert aff.cost == Cost.MEDIUM
        assert aff.risk == Risk.HIGH
        assert aff.latency == Latency.SECONDS

    def test_prefix_match(self):
        """browser_read_page should inherit the browser_read_ defaults."""
        aff = get_affordance("browser_read_page")
        assert aff.cost == Cost.MEDIUM
        assert aff.risk == Risk.LOW

    def test_longest_prefix_wins(self):
        """list_schedules must hit list_ default, not something else."""
        aff = get_affordance("list_schedules")
        assert aff.risk == Risk.NONE

    def test_unknown_tool_falls_back_to_conservative_default(self):
        aff = get_affordance("does_not_exist_xyz")
        # Fallback is medium/low/seconds (conservative).
        assert aff.cost == Cost.MEDIUM
        assert aff.risk == Risk.LOW
        assert aff.latency == Latency.SECONDS

    def test_very_high_cost_claude_code(self):
        aff = get_affordance("claude_code")
        assert aff.cost == Cost.VERY_HIGH
        assert aff.latency == Latency.MINUTES
        assert aff.preconditions  # non-empty

    def test_critical_risk_destructive_tools(self):
        for name in ("purge_messages", "delete_knowledge", "terraform_ops"):
            assert get_affordance(name).risk == Risk.CRITICAL

    def test_new_tools_have_entries(self):
        """Tools added in this branch must be in the affordance table."""
        for name in ("validate_action",):
            aff = get_affordance(name)
            assert aff.risk == Risk.NONE


class TestFormatFooter:
    def test_footer_contains_all_dimensions(self):
        footer = format_affordance_footer("run_command")
        assert "cost=medium" in footer
        assert "risk=high" in footer
        assert "latency=seconds" in footer

    def test_footer_includes_preconditions(self):
        footer = format_affordance_footer("write_file")
        assert "requires:" in footer
        assert "writable" in footer

    def test_footer_omits_preconditions_when_empty(self):
        footer = format_affordance_footer("parse_time")
        assert "requires:" not in footer


class TestDecorate:
    def test_decorate_appends_footer(self):
        out = decorate_description("run_command", "original description")
        assert "original description" in out
        assert "[affordances:" in out

    def test_decorate_is_idempotent(self):
        once = decorate_description("run_command", "description body")
        twice = decorate_description("run_command", once)
        assert once == twice


class TestRegistryIntegration:
    def setup_method(self):
        invalidate_tool_defs_cache()

    def teardown_method(self):
        invalidate_tool_defs_cache()

    def test_all_tool_definitions_carry_affordance_footer(self):
        defs = get_tool_definitions()
        assert len(defs) == len(TOOLS)
        for d in defs:
            assert "[affordances:" in d["description"], (
                f"{d['name']} has no affordance footer"
            )

    def test_cache_does_not_double_decorate(self):
        """Calling get_tool_definitions twice must return identical results."""
        first = get_tool_definitions()
        second = get_tool_definitions()
        for a, b in zip(first, second):
            assert a["description"] == b["description"]
            assert a["description"].count("[affordances:") == 1


class TestAllAffordances:
    def test_exposes_per_prefix_records(self):
        data = all_affordances()
        assert "run_command" in data
        rec = data["run_command"]
        assert rec["cost"] == "medium"
        assert rec["risk"] == "high"
        assert isinstance(rec["preconditions"], list)
