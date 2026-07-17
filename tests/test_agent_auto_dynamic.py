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
