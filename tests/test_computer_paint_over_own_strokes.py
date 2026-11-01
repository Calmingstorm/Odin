"""Painting over strokes already made never stops a stroke batch.

On 2026-11-01 Odin's Krita batches stopped in two ways while he painted over
his own work. A white Dry Brushing batch at 240 px over black strokes stopped
after 2 of 8 as sequence_visual_target_changed: the next stroke's start was on
paint wider than the 48-pixel own-ink corridor. Three morning batches stopped as
sequence_step_not_verified: a stroke over existing paint showed too little
measurable ink. Aaron: "a part of painting is ... painting over strokes youve
already made ... he should not be limited."
"""

from io import BytesIO

from PIL import Image, ImageDraw

from tests.test_computer_sequences_r19 import click, plan, rig, stroke_dispatch


def paint(state, draw):
    with Image.open(BytesIO(state["image"])) as image:
        draw(ImageDraw.Draw(image))
        stream = BytesIO()
        image.save(stream, "PNG")
        state["image"] = stream.getvalue()


def batch(binding, *strokes):
    return {**binding, "action_id": "plan", "operation": "strokes", "strokes": [
        {"action_id": f"stroke-{n}", "points": points, "duration": 0.1}
        for n, points in enumerate(strokes)
    ]}


def assert_whole_batch(result, calls, total):
    assert len(calls) == total
    assert result["status"] == "executed" and "reason" not in result
    assert result["execution"]["completed_steps"] == total
    assert all(step["verification"]["continuation_accepted"] is True
               for step in result["verification"]["steps"])


async def test_broad_brush_over_its_own_earlier_stroke_runs_the_whole_batch(tmp_path, monkeypatch):
    """The 2-of-8 stop: paint 70 pixels either side of a path, far past the corridor."""
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        async def broad(payload):
            raw = stroke_dispatch(payload, state)
            (x0, y0), (x1, y1) = payload["points"][0], payload["points"][-1]
            paint(state, lambda d: d.rectangle(
                (min(x0, x1), min(y0, y1) - 70, max(x0, x1), max(y0, y1) + 70), fill="gray"))
            return raw

        b.hook = broad
        result = await c.act(ctx, batch(
            binding,
            [[20, 80], [220, 80]],
            [[40, 22], [200, 140]],  # starts on stroke 0's paint, 58 px from its path
            [[30, 135], [210, 25]],  # crosses both
        ))
        assert_whole_batch(result, b.calls, 3)


async def test_same_color_over_itself_runs_the_whole_batch(tmp_path, monkeypatch):
    """Layering or glazing: the later strokes change nothing measurable."""
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        async def layered(payload):
            return stroke_dispatch(payload, state, raster_change=len(b.calls) == 1)

        b.hook = layered
        path = [[20, 80], [220, 80]]
        result = await c.act(ctx, batch(binding, path, path, path))
        assert_whole_batch(result, b.calls, 3)
        later = result["verification"]["steps"][1]["verification"]
        assert later["path_evidence"]["continuation_supported"] is False


async def test_sparse_grainy_stroke_runs_the_whole_batch(tmp_path, monkeypatch):
    """A dry brush that leaves a few specks, not ink along the path."""
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        async def grainy(payload):
            raw = stroke_dispatch(payload, state, raster_change=False)
            raw["postcondition"]["actual"]["after_sha256"] = "b" * 64
            (x0, y0), (x1, y1) = payload["points"][0], payload["points"][-1]
            paint(state, lambda d: [d.point((x0 + (x1 - x0) * k // 7, y0 + (y1 - y0) * k // 7),
                                            fill="black") for k in (1, 4)])
            return raw

        b.hook = grainy
        result = await c.act(ctx, batch(
            binding, [[20, 40], [220, 40]], [[20, 80], [220, 80]], [[20, 120], [220, 120]]))
        assert_whole_batch(result, b.calls, 3)


async def test_a_click_after_strokes_still_refuses_when_its_target_changed(tmp_path, monkeypatch):
    """Only strokes changed. A click's start pixels are still checked (Odin F3)."""
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        async def perform(payload):
            if payload["type"] == "polyline":
                raw = stroke_dispatch(payload, state)
                paint(state, lambda d: d.rectangle((190, 120, 230, 150), fill="red"))
                return raw
            raise AssertionError("the click must not be sent")

        b.hook = perform
        result = await c.act(ctx, plan(
            binding,
            {"action_id": "ink", "operation": "polyline", "points": [[20, 40], [160, 40]],
             "duration": 0.1, "expect": {"type": "visual_change"}},
            click("swatch", x=210, y=135),
        ))
        assert len(b.calls) == 1
        assert result["reason"] == "sequence_visual_target_changed"
