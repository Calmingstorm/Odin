"""B3 provider selection grammar. No compositor is contacted."""

import asyncio

import pytest

from src.computer.runtime.hyprland_scope import HyprlandScopeFailure, HyprlandScopeProvider


def row():
    return {
        "ok": True,
        "version": 1,
        "instance_id": "i1-" + "b" * 32,
        "topology_epoch": 9,
        "topology_digest": "d" * 64,
        "candidates": [
            {
                "id": "c1-" + "a" * 32,
                "label": "Drawing",
                "output_id": "DP-1",
                "output_name": "DP-1",
                "topology_digest": "e" * 64,
                "output": {
                    "x": 0,
                    "y": 0,
                    "width": 1920,
                    "height": 1080,
                    "pixel_width": 1920,
                    "pixel_height": 1080,
                    "scale": 1.0,
                    "transform": 0,
                },
                "identity": {
                    "pid": 1234,
                    "uid": 1000,
                    "start_ticks": 77,
                    "executable": "/usr/bin/drawing",
                    "exe_device": 1,
                    "exe_inode": 2,
                },
            }
        ],
    }


@pytest.mark.asyncio
async def test_inventory_hides_identity_and_focus_requires_native_fresh_pin(monkeypatch):
    provider = object.__new__(HyprlandScopeProvider)
    provider._lock = asyncio.Lock()
    provider._inventory = {}
    provider._inventory_epoch = None
    provider._inventory_instance = None
    provider.expected_uid = 1000
    replies = [
        row(),
        {
            "ok": True,
            "version": 1,
            "instance_id": "i1-" + "b" * 32,
            "candidate_id": "c1-" + "a" * 32,
            "output_id": "DP-1",
            "output_name": "DP-1",
            "topology_epoch": 9,
            "topology_digest": "e" * 64,
            "output": row()["candidates"][0]["output"],
            "identity": row()["candidates"][0]["identity"],
        },
        {"ok": False},
    ]

    async def request(_):
        return replies.pop(0)

    monkeypatch.setattr(provider, "_request", request)
    public = await provider.inventory_targets()
    assert public["candidates"] == [
        {"id": "c1-" + "a" * 32, "label": "Drawing", "output_id": "DP-1"}
    ]
    assert await provider.focus_candidate(
        candidate_id="c1-" + "a" * 32, output_id="DP-1", topology_epoch=9
    )
    with pytest.raises(HyprlandScopeFailure, match="selection_invalid"):
        await provider.focus_candidate(
            candidate_id="c1-" + "a" * 32, output_id="DP-1", topology_epoch=9
        )


@pytest.mark.asyncio
async def test_focus_rejects_forged_wrong_uid(monkeypatch):
    provider = object.__new__(HyprlandScopeProvider)
    provider._lock = asyncio.Lock()
    provider._inventory = {}
    provider._inventory_epoch = None
    provider._inventory_instance = None
    provider.expected_uid = 1000
    replies = [
        row(),
        {
            "ok": True,
            "version": 1,
            "instance_id": "i1-" + "b" * 32,
            "candidate_id": "c1-" + "a" * 32,
            "output_id": "DP-1",
            "output_name": "DP-1",
            "topology_epoch": 9,
            "topology_digest": "e" * 64,
            "output": row()["candidates"][0]["output"],
            "identity": row()["candidates"][0]["identity"] | {"uid": 7},
        },
    ]

    async def request(_):
        return replies.pop(0)

    monkeypatch.setattr(provider, "_request", request)
    await provider.inventory_targets()
    with pytest.raises(HyprlandScopeFailure, match="selection_invalid"):
        await provider.focus_candidate(
            candidate_id="c1-" + "a" * 32, output_id="DP-1", topology_epoch=9
        )


@pytest.mark.asyncio
async def test_inventory_rejects_native_over_capacity(monkeypatch):
    provider = object.__new__(HyprlandScopeProvider)
    provider._lock = asyncio.Lock()
    provider.expected_uid = 1000
    too_many = row()
    too_many["candidates"] *= 33

    async def request(_):
        return too_many

    monkeypatch.setattr(provider, "_request", request)
    with pytest.raises(HyprlandScopeFailure, match="selection_invalid"):
        await provider.inventory_targets()
