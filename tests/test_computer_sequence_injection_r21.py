"""A failed dispatch is not evidence that input was injected."""

import json

import pytest

from tests.test_computer_gui_actions_r5 import changed
from tests.test_computer_sequences_r19 import click, plan, rig


@pytest.mark.parametrize("first_verified", [False, True])
@pytest.mark.parametrize("outcome", ["exception", "unknown", "refused"])
async def test_sequence_injection_truth_survives_durable_replay(
    tmp_path, monkeypatch, first_verified, outcome
):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, pixels):
        calls = 0

        async def perform(payload):
            nonlocal calls
            calls += 1
            if first_verified and calls == 1:
                return changed(payload)
            if outcome == "exception":
                raise RuntimeError("dispatch transport lost")
            if outcome == "unknown":
                return {"status": "unknown", "injected": None, "released": False}
            return {"status": "unavailable", "injected": False, "released": True}

        b.hook = perform
        request = plan(binding, *([click("first")] if first_verified else []), click("uncertain"))
        result = await c.act(ctx, request)
        expected = True if first_verified else False if outcome == "refused" else None
        assert result["execution"]["injected"] is expected
        step = c.store.db.execute(
            "SELECT result FROM receipts WHERE session_id=? AND action_id=?",
            (binding["session_id"], "uncertain"),
        ).fetchone()
        saved = json.loads(step[0])
        assert saved["execution"]["injected"] is (False if outcome == "refused" else None)
        replay = await c.act(ctx, request)
        assert replay["execution"]["injected"] is expected
        assert calls == 1 + first_verified
