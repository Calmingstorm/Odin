"""Offline every-property-present call-shape probe. No runtime/provider/desktop I/O."""

from copy import deepcopy
from types import SimpleNamespace

import pytest
from jsonschema import Draft202012Validator

from src.computer.effects import expectation_arguments
from src.computer.gui_actions import action_arguments
from src.computer.models import ComputerError
from src.computer.sequences import sequence_arguments
from src.llm.strict_tool_adapter import _computer_cases, compile_catalog
from src.tools.defs.computer import computer_definitions


def settings(platform="x11", environment="existing_session", wayland_backend="portal"):
    return SimpleNamespace(platform=platform, environment=environment,
                           wayland_backend=wayland_backend)


def catalog(cfg=None):
    return compile_catalog(computer_definitions(cfg))


def wire_schema(adapter, name):
    return next(t["parameters"] for t in adapter.wire_tools if t["name"] == name)


def complete(value, schema):
    """Materialize EVERY wire property, using null only for absent optionals."""
    if "anyOf" in schema:
        for branch in schema["anyOf"]:
            try:
                candidate = complete(value, branch)
            except (KeyError, TypeError, ValueError):
                continue
            if Draft202012Validator(branch).is_valid(candidate):
                return candidate
        raise ValueError("no matching fixture branch")
    if schema.get("type") == "object":
        if set(value) - set(schema["properties"]):
            raise ValueError("fixture fields not allowed by branch")
        return {key: complete(value[key], child) if key in value else None
                for key, child in schema["properties"].items()}
    if schema.get("type") == "array":
        return [complete(item, schema["items"]) for item in value]
    return value


BASE = dict(session_id="s1", generation=1, consent_generation=1, source_id="src1",
            source_revision=1, action_id="a1", observation_id="o1")
REGION = dict(x=0, y=0, width=1, height=1)
OPERATIONS = {
    "focus": dict(x=0, y=0),
    "click": dict(x=0, y=0), "double_click": dict(x=0, y=0),
    "right_click": dict(x=0, y=0), "middle_click": dict(x=0, y=0),
    "scroll": dict(x=0, y=0, direction="down", count=1),
    "type": dict(text="hello"), "key": dict(key="ctrl+shift+s"),
    "drag": dict(points=[[0, 0], [1, 1]], duration=0),
    "polyline": dict(points=[[0, 0], [1, 1]], duration=0),
    "replace_field": dict(target="field1", text=""),
    "replace_field_pixels": dict(region=REGION, text=""),
}
SINGLES = [dict(BASE, operation=op, expect=(
    dict(type="field_text_equals", target="field1", text="") if op == "replace_field"
    else dict(type="visual_change")), **fields) for op, fields in OPERATIONS.items()]
SINGLES += [dict(BASE, operation=op, expect=dict(type="region_changed", **REGION), region=REGION)
            for op in ("click", "double_click", "right_click", "middle_click")]
SINGLES += [dict(BASE, operation="click", x=0, y=0, expect=dict(type="pointer_at", x=0, y=0))]
STEPS = [{key: value for key, value in inp.items() if key not in BASE or key == "action_id"}
         for inp in SINGLES if inp["operation"] not in {"focus", "replace_field_pixels"}]
PLANS = [dict(BASE, operation="sequence", steps=[dict(step, action_id=f"step{i}")
                                               for i, step in enumerate(STEPS[:8])]),
         dict(BASE, operation="strokes", strokes=[
             dict(action_id="stroke1", points=[[0, 0], [1, 1]], duration=0)])]


@pytest.mark.parametrize("inp", SINGLES + PLANS, ids=lambda inp: inp["operation"])
def test_every_wire_property_present_null_padding_preserves_valid_zero_and_empty(inp):
    adapter = catalog()
    wire = complete(dict(payload=inp), wire_schema(adapter, "computer_act"))
    assert adapter.accept("computer_act", wire) == inp
    if inp["operation"] in {"sequence", "strokes"}:
        sequence_arguments(inp)
    else:
        action_arguments(inp)


@pytest.mark.parametrize("step", STEPS, ids=lambda step: step["operation"])
def test_every_sequence_step_shape(step):
    inp = dict(BASE, operation="sequence", steps=[dict(step, action_id="step1")])
    adapter = catalog()
    wire = complete(dict(payload=inp), wire_schema(adapter, "computer_act"))
    assert adapter.accept("computer_act", wire) == inp
    sequence_arguments(inp)


SESSION_CALLS = [dict(operation="start"), dict(operation="start", app="xed"),
                 dict(operation="start", target_id="t1", candidate_epoch="e1"),
                 dict(operation="start", target_id="t1", output_id="out1", candidate_epoch="e1",
                      recovery_session_id="s0", recovery_generation=1),
                 dict(operation="inventory_targets")]
SESSION_CALLS += [dict(operation=op, session_id="s1", **(
    dict(generation=1) if op in {"resume", "export", "reconcile"} else {}))
    for op in ("status", "stop", "pause", "resume", "reconcile", "cancel", "close", "export")]
SESSION_CALLS[-1]["name"] = "drawing.png"


@pytest.mark.parametrize("inp", SESSION_CALLS, ids=lambda inp: inp["operation"])
def test_every_session_wire_property_present(inp):
    adapter = catalog()
    wire = complete(dict(payload=inp), wire_schema(adapter, "computer_session"))
    assert adapter.accept("computer_session", wire) == inp


@pytest.mark.parametrize("padding", ["", 0, None])
def test_observe_every_property_present_and_dummy_mutations(padding):
    adapter = catalog()
    schema = wire_schema(adapter, "computer_observe")
    canonical = computer_definitions()[1]["input_schema"]
    inp = dict(session_id="s1", generation=1, source_id="src1", crop=REGION,
               task_context=dict(goal="draw", tool="brush", color="black", brush="basic"))
    wire = complete(inp, schema)
    assert adapter.accept("computer_observe", wire) == inp
    for key in schema["properties"]:
        candidate = dict(wire, **{key: padding})
        expected = dict(inp)
        if padding is None and key not in canonical["required"]:
            expected.pop(key)
        else:
            expected[key] = padding
        valid = (Draft202012Validator(schema).is_valid(candidate)
                 and Draft202012Validator(canonical).is_valid(expected))
        if valid:
            assert adapter.accept("computer_observe", candidate) == expected
        else:
            with pytest.raises(ValueError):
                adapter.accept("computer_observe", candidate)
    # Zero crop coordinates survive; zero sizes and empty required notes fail.
    for field in REGION:
        candidate = deepcopy(wire)
        candidate["crop"][field] = padding
        if padding == 0 and type(padding) is int and field in {"x", "y"}:
            assert adapter.accept("computer_observe", candidate)["crop"][field] == 0
        else:
            with pytest.raises(ValueError):
                adapter.accept("computer_observe", candidate)


@pytest.mark.parametrize("kind,fields", [
    ("visual_change", {}), ("pointer_at", dict(x=0, y=0)),
    ("region_changed", REGION), ("dialog_appeared", {}), ("menu_appeared", {}),
    ("window_gone", {}), ("field_text_equals", dict(target="field1", text="")),
])
def test_expectation_shapes(kind, fields):
    expect = dict(type=kind, **fields)
    inp = (dict(BASE, operation="replace_field", target="field1", text="", expect=expect)
           if kind == "field_text_equals"
           else dict(BASE, operation="click", x=0, y=0, expect=expect))
    adapter = catalog()
    wire = complete(dict(payload=inp), wire_schema(adapter, "computer_act"))
    assert adapter.accept("computer_act", wire) == inp
    expectation_arguments(expect)
    action_arguments(inp)


@pytest.mark.parametrize("padding", ["", 0, None])
def test_blank_zero_null_are_not_universal_omission_sentinels(padding):
    """Probe all 18 action and 12 session wire alternatives with blanket padding.

    Absent fields are intentionally filled with each provider-style dummy value.
    Null is legal only for optionals; '' and 0 are never silently stripped.
    """
    adapter = catalog()
    for name in ("computer_act", "computer_session"):
        branches = wire_schema(adapter, name)["properties"]["payload"]["anyOf"]
        assert len(branches) == (18 if name == "computer_act" else 12)
        for branch in branches:
            inp = {key: padding for key in branch["properties"]}
            inp["operation"] = branch["properties"]["operation"]["const"]
            if name == "computer_session" and (
                inp == {"operation": "inventory_targets"}
                or padding is None and inp["operation"] == "start" and "target_id" not in inp
            ):
                assert adapter.accept(name, dict(payload=inp)) == {"operation": inp["operation"]}
            else:
                with pytest.raises(ValueError):
                    adapter.accept(name, dict(payload=inp))


@pytest.mark.parametrize("padding", ["", 0, None])
def test_every_property_mutation_probe_with_other_fields_valid(padding):
    """Astra-style dummy probe on each top-level property, retaining valid peers.

    Every property is present in each submitted wire call. An explicit null is
    omission only for an optional nonnullable property; valid ''/0 must survive.
    Expectation objects and sequence steps are independently exercised above.
    """
    tools = computer_definitions()
    adapter = compile_catalog(tools)
    schemas = {tool["name"]: tool["input_schema"] for tool in tools}
    probes = 0
    for name, fixtures in (("computer_act", SINGLES + PLANS),
                           ("computer_session", SESSION_CALLS)):
        for inp in fixtures:
            wire = complete(dict(payload=inp), wire_schema(adapter, name))
            payload = wire["payload"]
            branches = wire_schema(adapter, name)["properties"]["payload"]["anyOf"]
            index = next(i for i, branch in enumerate(branches)
                         if Draft202012Validator(branch).is_valid(payload))
            required = _computer_cases(schemas[name])[index]["required"]
            for key in payload:
                candidate = deepcopy(wire)
                candidate["payload"][key] = padding
                expected = dict(inp)
                if padding is None and key not in required:
                    expected.pop(key, None)
                else:
                    expected[key] = padding
                valid = (Draft202012Validator(wire_schema(adapter, name)).is_valid(candidate)
                         and Draft202012Validator(schemas[name]).is_valid(expected))
                if valid:
                    assert adapter.accept(name, candidate) == expected
                else:
                    with pytest.raises(ValueError):
                        adapter.accept(name, candidate)
                probes += 1
    assert probes == 281  # All fields of 19 action fixtures and 13 session fixtures.


@pytest.mark.parametrize("bad", [
    dict(operation="start", session_id="s1"), dict(operation="status"),
    dict(operation="resume", session_id="s1"),
    dict(operation="start", recovery_session_id="s0"),
    dict(operation="start", target_id="t1"),
    dict(operation="start", output_id="out1"),
    dict(operation="export", session_id="s1", generation=1),
    dict(operation="export", session_id="s1", generation=1, name=""),
    dict(operation="start", app="xed", target_id="t1", candidate_epoch="e1"),
])
def test_invalid_session_cross_operation_and_partial_pairs(bad):
    schema = computer_definitions()[0]["input_schema"]
    assert not Draft202012Validator(schema).is_valid(bad)


@pytest.mark.parametrize("cfg", [settings(), settings(environment="isolated"),
                                 settings("wayland"),
                                 settings("wayland", wayland_backend="hyprland")])
def test_configured_catalog_is_short_backend_specific_and_compiles(cfg):
    tools = computer_definitions(cfg)
    adapter = compile_catalog(tools)
    assert all(len(tool["description"]) < 1600 for tool in tools)
    if cfg.platform == "x11":
        assert all("Hyprland" not in tool["description"] and "portal" not in tool["description"]
                   for tool in tools)
    else:
        action_branches = wire_schema(adapter, "computer_act")["properties"]["payload"]["anyOf"]
        assert all(branch["properties"]["operation"]["const"] not in {"focus", "replace_field"}
                   for branch in action_branches)
        for branch in action_branches:
            if "expect" in branch["properties"]:
                assert {item["properties"]["type"]["const"]
                        for item in branch["properties"]["expect"]["anyOf"]} <= {
                            "visual_change", "region_changed"}
    inp = dict(operation="start", **({"app": "xed"} if cfg.environment == "isolated" else {}))
    wire = complete(dict(payload=inp), wire_schema(adapter, "computer_session"))
    assert adapter.accept("computer_session", wire) == inp


@pytest.mark.parametrize("mutation", [
    {"region": REGION}, {"expect": {"type": "visual_change", "x": 0}},
    {"expect": {"type": "pointer_at"}}, {"text": ""},
])
def test_invalid_action_shapes_fail_schema_and_parser(mutation):
    inp = dict(BASE, operation="click", x=0, y=0, expect=dict(type="visual_change"))
    inp.update(deepcopy(mutation))
    assert not Draft202012Validator(computer_definitions()[2]["input_schema"]).is_valid(inp)
    with pytest.raises(ComputerError):
        action_arguments(inp)
