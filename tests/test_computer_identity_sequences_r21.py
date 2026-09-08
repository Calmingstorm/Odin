"""Identity reconciliation through real controller/store, without desktop input."""

from copy import deepcopy
from dataclasses import replace
from types import SimpleNamespace

import pytest

from src.computer.gui_actions import reconcile_accessible_action
from src.computer.models import ComputerError
from tests.test_computer_gui_actions_r5 import changed
from tests.test_computer_sequences_r19 import click, plan, raster, rig


def field(handle="original"):
    return {
        "handle": handle,
        "parent": "parent-" + handle,
        "node_identity": "native-widget",
        "root_identity": "native-window",
        "ancestor_identity": "native-lineage",
        "role": "text",
        "name": "Colour",
        "text": "#ffffff",
        "focused": True,
        "text_readable": True,
        "text_complete": True,
        "bounds": {"x": 100, "y": 60, "width": 80, "height": 20},
        "bounds_space": "source",
        "states": [1, 2, 3],
        "capabilities": ["focus", "set_text", "replace_field"],
    }


def replacement(target="original"):
    return {
        "action_id": "replace",
        "operation": "replace_field",
        "target": target,
        "text": "#123456",
        "expect": {"type": "field_text_equals", "target": target, "text": "#123456"},
    }


async def deliver_fields(c, b, ctx, binding):
    capture = b.observe
    state = {"nodes": [field()], "serial": 0}

    async def observe(**kwargs):
        state["serial"] += 1
        nodes = tuple(
            node
            | {"handle": f"handle-{state['serial']}-{i}", "parent": f"parent-{state['serial']}"}
            for i, node in enumerate(state["nodes"])
        )
        return replace(await capture(**kwargs), accessibility=nodes)

    b.observe = observe
    result = await c.observe(ctx, {"session_id": binding["session_id"], "generation": 1})
    obs = c._live[binding["session_id"]].observations[result["observation_id"]]
    await c.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
    binding["observation_id"] = obs.observation_id
    return state, result["accessible_targets"][0]["handle"]


def no_adoption(payload):
    return {"status": "executed", "injected": True, "released": True}


@pytest.mark.parametrize("sequence", [False, True])
async def test_unrelated_pixels_allow_only_reconciled_native_target(
    tmp_path, monkeypatch, sequence
):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, pixels):
        _, target = await deliver_fields(c, b, ctx, binding)
        pixels["image"] = raster((0, 0, 20, 20))

        async def perform(payload):
            assert payload["target"] != target
            assert payload["expected"]["target"] == payload["target"]
            return no_adoption(payload)

        b.hook = perform
        step = replacement(target)
        request = plan(binding, step, click("later")) if sequence else binding | step
        before = deepcopy(request)
        result = await c.act(ctx, request)
        assert len(b.calls) == 1 and b.calls[0]["type"] == "replace_field"
        assert request == before and result["status"] != "verified"
        if sequence:
            assert result["reason"] == "sequence_step_not_verified"
            assert result["verification"]["steps"][1]["status"] == "unavailable"
        await c.act(ctx, request)
        assert len(b.calls) == 1


async def test_identity_after_prior_step_uses_original_authority(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, pixels):
        _, target = await deliver_fields(c, b, ctx, binding)

        async def perform(payload):
            if payload["type"] == "click":
                pixels["image"] = raster((0, 0, 50, 50))
                return changed(payload)
            assert payload["target"] != target
            assert payload["expected"]["target"] == payload["target"]
            return no_adoption(payload)

        b.hook = perform
        result = await c.act(ctx, plan(binding, click("first"), replacement(target)))
        assert [p["type"] for p in b.calls] == ["click", "replace_field"]
        assert result["execution"]["completed_steps"] == 1
        assert result["reason"] == "sequence_step_not_verified"


@pytest.mark.parametrize("sequence", [False, True])
@pytest.mark.parametrize(
    "change",
    [
        {"node_identity": "replacement-widget"},
        {"root_identity": "replacement-root"},
        {"ancestor_identity": "changed-lineage"},
        {"role": "password"},
        {"name": "Other field"},
        {"bounds": {"x": 101, "y": 60, "width": 80, "height": 20}},
        {"bounds_space": "screen"},
        {"capabilities": ["focus"]},
        {"focused": False},
        {"text": "changed by user"},
        {"text_readable": False},
        {"text_complete": False},
        {"states": [1, 2]},
    ],
)
async def test_native_changes_veto_even_when_pixels_unchanged(
    tmp_path, monkeypatch, sequence, change
):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, pixels):
        state, target = await deliver_fields(c, b, ctx, binding)
        state["nodes"][0].update(change)
        request = plan(binding, replacement(target)) if sequence else binding | replacement(target)
        if sequence:
            result = await c.act(ctx, request)
            assert result["reason"] == "accessible_target_changed"
        else:
            with pytest.raises(ComputerError, match="accessible_target_changed"):
                await c.act(ctx, request)
        assert b.calls == []


@pytest.mark.parametrize("sequence", [False, True])
async def test_exact_source_lifecycle_gate_precedes_identity_dispatch(
    tmp_path, monkeypatch, sequence
):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, pixels):
        _, target = await deliver_fields(c, b, ctx, binding)
        b.source = replace(b.source, source_revision=2)
        request = plan(binding, replacement(target)) if sequence else binding | replacement(target)
        result = await c.act(ctx, request)
        assert result["reason"] == (
            "sequence_target_changed" if sequence else "stale_source_binding"
        )
        assert b.calls == []


@pytest.mark.parametrize("side", ["original", "current"])
def test_full_native_identity_must_be_unique_even_with_different_metadata(side):
    before = SimpleNamespace(accessibility=[field()])
    after = SimpleNamespace(accessibility=[field("fresh")])
    chosen = before if side == "original" else after
    chosen.accessibility.append(field("duplicate") | {"name": "Other"})
    with pytest.raises(ComputerError, match="accessible_target_changed"):
        reconcile_accessible_action(replacement(), before, after)


@pytest.mark.parametrize("identity", ["node_identity", "root_identity", "ancestor_identity"])
@pytest.mark.parametrize("invalid", ["", None, 1])
def test_missing_native_identity_never_rebinds(identity, invalid):
    before = SimpleNamespace(accessibility=[field() | {identity: invalid}])
    after = SimpleNamespace(accessibility=[field("fresh") | {identity: invalid}])
    with pytest.raises(ComputerError, match="accessible_native_identity_unavailable"):
        reconcile_accessible_action(replacement(), before, after)


def test_unseen_handle_cannot_select_a_fresh_target():
    before = SimpleNamespace(accessibility=[field()])
    after = SimpleNamespace(accessibility=[field("fresh")])
    with pytest.raises(ComputerError, match="accessible_native_identity_unavailable"):
        reconcile_accessible_action(replacement("fresh"), before, after)
