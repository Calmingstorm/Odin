"""Auto/Dynamic per-spawn agent model/effort exposure.

Each agent axis (model, reasoning) is independently Inherit (null) / Auto
(per-spawn selection) / Fixed. The spawn_agent / spawn_loop_agents schema
exposes an axis's field + catalogue clause only when that axis is "auto"; the
spawn boundary hard-rejects a field on a non-auto axis; "auto" is policy and is
never sent to a provider (it resolves to inherit-main).
"""
from __future__ import annotations

import copy
from types import SimpleNamespace

import pytest

from src.config.schema import agent_axis_mode
from src.discord.native_tools.agents_tasks import _agent_llm_policy, _parse_spawn_overrides
from src.tools import get_tool_definitions
from src.tools.agent_tool_policy import agent_axis_modes, apply_agent_axis_policy


def _cfg(model=None, effort=None, main_model="gpt-5.6-sol"):
    return SimpleNamespace(
        openai_codex=SimpleNamespace(
            agent_model=model, agent_reasoning_effort=effort, model=main_model
        )
    )


def _spawn_props(defs, name):
    tool = next(x for x in defs if x["name"] == name)
    if name == "spawn_loop_agents":
        return tool["input_schema"]["properties"]["tasks"]["items"]["properties"], tool[
            "description"
        ]
    return tool["input_schema"]["properties"], tool["description"]


# --- pin 6: axis-mode classifier ---
def test_agent_axis_mode():
    assert agent_axis_mode(None) == "inherit"
    assert agent_axis_mode("auto") == "auto"
    assert agent_axis_mode("gpt-5.6-sol") == "fixed"
    assert agent_axis_mode("medium") == "fixed"


def test_agent_axis_modes_from_config():
    assert agent_axis_modes(_cfg("auto", None)) == ("auto", "inherit")
    assert agent_axis_modes(_cfg("gpt-5.6-sol", "auto")) == ("fixed", "auto")


# --- pin 1: four-combination schema matrix for BOTH spawn tools ---
@pytest.mark.parametrize("name", ["spawn_agent", "spawn_loop_agents"])
@pytest.mark.parametrize(
    "model,effort,exp_model,exp_effort",
    [
        ("auto", "auto", True, True),
        (None, None, False, False),
        ("gpt-5.6-sol", "medium", False, False),
        ("auto", "medium", True, False),
        ("gpt-5.6-sol", "auto", False, True),
    ],
)
def test_axis_matrix(name, model, effort, exp_model, exp_effort):
    out = apply_agent_axis_policy(get_tool_definitions(), _cfg(model, effort))
    props, _desc = _spawn_props(out, name)
    assert ("model" in props) is exp_model
    assert ("reasoning_effort" in props) is exp_effort


# --- pin 2: no forbidden prop/wording on a disabled axis; affordances kept ---
def test_disabled_axis_wording_and_affordances_preserved():
    defs = get_tool_definitions()
    out = apply_agent_axis_policy(defs, _cfg("gpt-5.6-sol", "auto"))
    props, desc = _spawn_props(out, "spawn_agent")
    assert "model" not in props
    assert "Set 'model'" not in desc  # model clause gone
    assert "reasoning_effort" in props
    assert "reasoning_effort" in desc  # effort clause present
    assert "[affordances:" in desc  # affordances suffix survives the rebuild

    _p2, desc2 = _spawn_props(apply_agent_axis_policy(defs, _cfg(None, None)), "spawn_loop_agents")
    assert "Set 'model'" not in desc2 and "reasoning_effort" not in desc2
    assert "[affordances:" in desc2


# --- pin 3: auto + omitted override inherits the MAIN setting, never "auto" ---
def test_auto_with_omitted_override_inherits_main():
    client = SimpleNamespace(reasoning_effort="medium")  # codex-like: has reasoning_effort
    cfg = _cfg("auto", "auto", main_model="gpt-5.6-sol")
    effort, model = _agent_llm_policy(cfg, client, model_override=None, effort_override=None)
    assert model == "gpt-5.6-sol"  # inherits the main model
    assert effort is None  # inherit-main (None) — NOT the "auto" sentinel
    assert model != "auto" and effort != "auto"


# --- pin 4: fixed/inherit reject a hand-built field (KEY PRESENCE, not truthiness) ---
@pytest.mark.parametrize("mode", ["fixed", "inherit"])
def test_non_auto_axis_rejects_model_key(mode):
    _mo, _eo, err = _parse_spawn_overrides(
        {"model": "gpt-5.6-luna"}, model_mode=mode, effort_mode="auto"
    )
    assert err and "model" in err


@pytest.mark.parametrize("mode", ["fixed", "inherit"])
def test_non_auto_axis_rejects_effort_key(mode):
    _mo, _eo, err = _parse_spawn_overrides(
        {"reasoning_effort": "low"}, model_mode="auto", effort_mode=mode
    )
    assert err and "reasoning_effort" in err


def test_null_valued_key_still_rejected_on_non_auto():
    # key presence, not truthiness: {"model": null} is outside the contract.
    _mo, _eo, err = _parse_spawn_overrides({"model": None}, model_mode="fixed", effort_mode="auto")
    assert err


def test_auto_axes_accept_overrides():
    mo, eo, err = _parse_spawn_overrides(
        {"model": "gpt-5.6-luna", "reasoning_effort": "low"},
        model_mode="auto",
        effort_mode="auto",
    )
    assert err is None
    assert mo == "gpt-5.6-luna"
    assert eo == "low"


def test_auto_axis_still_rejects_invalid_effort_value():
    _mo, _eo, err = _parse_spawn_overrides(
        {"reasoning_effort": "ultra"}, model_mode="auto", effort_mode="auto"
    )
    assert err and "invalid reasoning_effort" in err


# --- pin 5: policy never mutates the shared static definitions ---
def test_policy_never_mutates_static_defs():
    before = copy.deepcopy(get_tool_definitions())
    for m, e in [
        ("auto", "auto"),
        (None, None),
        ("gpt-5.6-sol", "medium"),
        ("auto", "medium"),
        ("gpt-5.6-sol", "auto"),
    ]:
        apply_agent_axis_policy(get_tool_definitions(), _cfg(m, e))
    assert get_tool_definitions() == before


class TestEffortCatalogueFiltering:
    """Capability-filtered effort catalogue: with the effort axis auto and the
    model axis NOT auto, every spawn runs one concrete config-resolved model
    (per-spawn model overrides are hard-rejected on a non-auto axis), so the
    exposed enum + clause offer only efforts that model can serve. Model axis
    auto keeps the full catalogue — the spawner picks the model and the spawn
    boundary owns the pair."""

    @staticmethod
    def _effort_schema(cfg, name):
        defs = apply_agent_axis_policy(get_tool_definitions(), cfg)
        props, desc = _spawn_props(defs, name)
        return props.get("reasoning_effort"), desc

    @pytest.mark.parametrize("name", ["spawn_agent", "spawn_loop_agents"])
    def test_fixed_excluded_model_drops_max(self, name):
        from src.tools.defs.agents import spawn_effort_clause

        field, desc = self._effort_schema(_cfg("gpt-5.5", "auto"), name)
        assert field["enum"] == ["none", "low", "medium", "high", "xhigh"]
        assert "max" not in desc
        # clause text matches the filtered enum exactly (one renderer)
        assert spawn_effort_clause(field["enum"]) in desc

    @pytest.mark.parametrize("name", ["spawn_agent", "spawn_loop_agents"])
    def test_inherited_excluded_main_model_drops_max(self, name):
        field, desc = self._effort_schema(
            _cfg(None, "auto", main_model="gpt-5.5"), name)
        assert field["enum"] == ["none", "low", "medium", "high", "xhigh"]
        assert "max" not in desc

    @pytest.mark.parametrize("model", ["gpt-5.6-sol", "gpt-5.6-luna", "brand-new-model"])
    def test_capable_and_unknown_models_keep_full_ordered_enum(self, model):
        field, desc = self._effort_schema(_cfg(model, "auto"), "spawn_agent")
        assert field["enum"] == ["none", "low", "medium", "high", "xhigh", "max"]
        assert "max" in desc

    def test_inherited_capable_main_model_keeps_full_enum(self):
        field, _ = self._effort_schema(
            _cfg(None, "auto", main_model="gpt-5.6-sol"), "spawn_agent")
        assert field["enum"] == ["none", "low", "medium", "high", "xhigh", "max"]

    def test_model_axis_auto_never_filters(self):
        # Even with an excluded MAIN model, auto model axis = spawner's choice.
        field, desc = self._effort_schema(
            _cfg("auto", "auto", main_model="gpt-5.5"), "spawn_agent")
        assert field["enum"] == ["none", "low", "medium", "high", "xhigh", "max"]

    def test_both_auto_returns_identity(self):
        defs = get_tool_definitions()
        assert apply_agent_axis_policy(defs, _cfg("auto", "auto")) is defs

    def test_static_definitions_never_mutated(self):
        # The filter works on deep clones — the shared static defs (and the
        # canonical exposed form) must keep the full enum after policy calls.
        apply_agent_axis_policy(get_tool_definitions(), _cfg("gpt-5.5", "auto"))
        static_props, static_desc = _spawn_props(get_tool_definitions(), "spawn_agent")
        assert static_props["reasoning_effort"]["enum"][-1] == "max"
        assert "max" in static_desc

    def test_empty_filter_omits_field_and_clause(self, monkeypatch):
        # Defensive edge: capability data filtering EVERY effort must omit the
        # property + clause, never emit an unsatisfiable empty enum.
        from src.config import schema as schema_mod
        from src.tools.defs.agents import SPAWN_EFFORT_OPTIONS

        monkeypatch.setitem(
            schema_mod.CODEX_MODEL_UNSUPPORTED_EFFORTS,
            "gpt-5.5",
            frozenset(SPAWN_EFFORT_OPTIONS),
        )
        field, desc = self._effort_schema(_cfg("gpt-5.5", "auto"), "spawn_agent")
        assert field is None
        assert "reasoning_effort" not in desc

    def test_clause_renderer_is_the_static_source(self):
        from src.tools.defs.agents import (
            SPAWN_EFFORT_CLAUSE,
            SPAWN_EFFORT_OPTIONS,
            spawn_effort_clause,
        )
        # byte-identical static output — one wording template everywhere
        assert spawn_effort_clause(SPAWN_EFFORT_OPTIONS) == SPAWN_EFFORT_CLAUSE


class TestUnservableOmission:
    """PR #246 round 1: filtering the enum is not enough — omission inherits
    the MAIN effort at spawn, so when the concrete agent model rejects that
    inherited default, omission itself is an unservable, advertised spelling.
    The field becomes REQUIRED with explicit-choice clause wording; it stays
    optional whenever the inherited default is servable. Runtime semantics
    unchanged."""

    @staticmethod
    def _cfg_main_effort(model, effort, main_model="gpt-5.6-sol", main_effort="medium"):
        from types import SimpleNamespace
        return SimpleNamespace(
            openai_codex=SimpleNamespace(
                agent_model=model, agent_reasoning_effort=effort,
                model=main_model, reasoning_effort=main_effort,
            )
        )

    @staticmethod
    def _schema_obj(defs, name):
        tool = next(x for x in defs if x["name"] == name)
        if name == "spawn_loop_agents":
            return tool["input_schema"]["properties"]["tasks"]["items"], tool["description"]
        return tool["input_schema"], tool["description"]

    @pytest.mark.parametrize("name", ["spawn_agent", "spawn_loop_agents"])
    def test_unservable_inherited_default_makes_effort_required(self, name):
        # Odin's exact repro: main sol@max, fixed agent gpt-5.5, effort auto.
        cfg = self._cfg_main_effort("gpt-5.5", "auto", main_effort="max")
        defs = apply_agent_axis_policy(get_tool_definitions(), cfg)
        schema, desc = self._schema_obj(defs, name)
        assert "reasoning_effort" in schema["required"]
        assert "REQUIRED here" in desc
        assert "Omit to use the configured agent effort" not in desc
        # enum still filtered alongside
        props, _ = _spawn_props(defs, name)
        assert props["reasoning_effort"]["enum"] == [
            "none", "low", "medium", "high", "xhigh"]

    @pytest.mark.parametrize("name", ["spawn_agent", "spawn_loop_agents"])
    def test_servable_inherited_default_stays_optional(self, name):
        cfg = self._cfg_main_effort("gpt-5.5", "auto", main_effort="xhigh")
        defs = apply_agent_axis_policy(get_tool_definitions(), cfg)
        schema, desc = self._schema_obj(defs, name)
        assert "reasoning_effort" not in schema.get("required", [])
        assert "Omit to use the configured agent effort" in desc

    def test_capable_model_never_required(self):
        cfg = self._cfg_main_effort("gpt-5.6-luna", "auto", main_effort="max")
        defs = apply_agent_axis_policy(get_tool_definitions(), cfg)
        schema, desc = self._schema_obj(defs, "spawn_agent")
        assert "reasoning_effort" not in schema.get("required", [])
        # full enum, static clause
        props, _ = _spawn_props(defs, "spawn_agent")
        assert props["reasoning_effort"]["enum"][-1] == "max"

    def test_inherited_main_model_unservable_default_required(self):
        # model axis INHERIT resolving to gpt-5.5 with main effort max is
        # load-rejected as a config (main pair 5.5+max is invalid), so the
        # reachable inherit case is: main 5.5 + main effort xhigh = servable →
        # optional. Pin that reachable shape.
        cfg = self._cfg_main_effort(None, "auto", main_model="gpt-5.5",
                                    main_effort="xhigh")
        defs = apply_agent_axis_policy(get_tool_definitions(), cfg)
        schema, _ = self._schema_obj(defs, "spawn_agent")
        assert "reasoning_effort" not in schema.get("required", [])

    def test_static_required_lists_untouched(self):
        cfg = self._cfg_main_effort("gpt-5.5", "auto", main_effort="max")
        apply_agent_axis_policy(get_tool_definitions(), cfg)
        schema, desc = self._schema_obj(get_tool_definitions(), "spawn_agent")
        assert schema["required"] == ["label", "goal"]
        assert "Omit to use the configured agent effort" in desc


class TestPropertyDescriptionTruthfulness:
    """PR #246 round 2: the FIELD-level description must agree with the
    required list and the tool clause — all three render from shared sources
    (SPAWN_EFFORT_REQUIRED_TAIL / spawn_effort_property_desc), so no
    catalogue surface can call the field optional while the schema requires
    it, or advertise the guaranteed-failure omission inside the field."""

    _CFG = None  # built per test via TestUnservableOmission's helper

    @pytest.mark.parametrize("name", ["spawn_agent", "spawn_loop_agents"])
    def test_required_state_rewrites_property_description(self, name):
        from src.tools.defs.agents import SPAWN_EFFORT_REQUIRED_TAIL

        cfg = TestUnservableOmission._cfg_main_effort(
            "gpt-5.5", "auto", main_effort="max")
        defs = apply_agent_axis_policy(get_tool_definitions(), cfg)
        props, desc = _spawn_props(defs, name)
        pd = props["reasoning_effort"]["description"]
        assert SPAWN_EFFORT_REQUIRED_TAIL in pd
        assert "Optional" not in pd
        assert "Omit to inherit" not in pd
        # the tool clause carries the SAME shared tail — one source
        assert SPAWN_EFFORT_REQUIRED_TAIL in desc

    @pytest.mark.parametrize("name", ["spawn_agent", "spawn_loop_agents"])
    def test_optional_state_keeps_static_property_description(self, name):
        cfg = TestUnservableOmission._cfg_main_effort(
            "gpt-5.5", "auto", main_effort="xhigh")
        defs = apply_agent_axis_policy(get_tool_definitions(), cfg)
        props, _ = _spawn_props(defs, name)
        static_props, _ = _spawn_props(get_tool_definitions(), name)
        assert (props["reasoning_effort"]["description"]
                == static_props["reasoning_effort"]["description"])
        assert "Omit to inherit" in props["reasoning_effort"]["description"]

    @pytest.mark.parametrize("name", ["spawn_agent", "spawn_loop_agents"])
    def test_renderer_is_the_static_property_source(self, name):
        from src.tools.defs.agents import spawn_effort_property_desc

        static_props, _ = _spawn_props(get_tool_definitions(), name)
        assert (spawn_effort_property_desc(name)
                == static_props["reasoning_effort"]["description"])

    def test_static_property_descriptions_untouched_after_required_render(self):
        cfg = TestUnservableOmission._cfg_main_effort(
            "gpt-5.5", "auto", main_effort="max")
        apply_agent_axis_policy(get_tool_definitions(), cfg)
        for name in ("spawn_agent", "spawn_loop_agents"):
            static_props, _ = _spawn_props(get_tool_definitions(), name)
            assert "Optional" in static_props["reasoning_effort"]["description"]
