"""A report through the real durable path: store, suspension and resume.

Uses tests/test_resume_admission.py's harness (a real TurnStateStore, real
capacity suspension and the real TurnResumeManager), so this module joins
that serialized scheduling group. Contract: docs/agent-transcript-contract.md.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from src.agents.execution_context import AgentDispatch
from src.agents.manager import AgentInfo
from src.agents.reports import CLOSED_RECEIPT, ReportTarget, admit_report
from src.turn_state import TurnStatus
from src.turn_state.durability import TurnDurability
from tests.fakes import FakeMessage, text_response, tool_call_response
from tests.test_agent_reports_chat import _bodies, _reports
from tests.test_resume_admission import Harness, capacity_forever, heal_capacity, resume_msg


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


class TestDurableProductionPath:
    async def test_report_survives_the_real_checkpoint_suspension_and_resume(
        self, tmp_path, monkeypatch
    ):
        h = Harness([], tmp_path)
        original = FakeMessage("do the long thing")
        child = AgentInfo(
            id="child",
            label="child",
            goal="g",
            channel_id=str(original.channel.id),
            requester_id=str(original.author.id),
            requester_name="user",
            report_target=ReportTarget.for_turn(str(original.channel.id), str(original.id)),
        )
        child.iteration_count = 1

        def report(text: str, call_id: str):
            return admit_report(
                AgentDispatch(child, {"id": call_id}),
                text,
                lambda t: h.bot.channel_state.report_endpoint(t.channel_id, t.request_id),
            )

        persisted: list = []
        hook = TurnDurability.on_guard_injection

        async def recording(self, st):
            await hook(self, st)
            persisted.append(json.loads(h.row()[1]))

        monkeypatch.setattr(TurnDurability, "on_guard_injection", recording)

        def report_then_call():
            assert report("before the outage", "r1").ok
            return tool_call_response(("parse_time", {"text": "tomorrow"}))

        h.fake.responses[:] = [report_then_call, capacity_forever(h.fake)]
        _text, _, is_error, *_ = await h.run(original)
        assert is_error is True and h.row()[0] == TurnStatus.SUSPENDED
        # The real WI-5 write right after the loop-head drain persisted the report.
        stored = [
            m for m in persisted[0]["fields"]["messages"] if m.get("provenance") == "agent_report"
        ]
        assert [_bodies(m) for m in stored] == [["before the outage"]]
        assert stored[0]["report_items"][0]["report_sequence"] == 1
        gap = report("during the outage", "r2")
        assert gap.output == CLOSED_RECEIPT
        assert gap.audit_metadata["report_closed_reason"] == "suspended"
        for task in list(h.manager._waiters.values()):
            task.cancel()
        await asyncio.sleep(0)

        receipts: list = []

        def report_after_resume():
            receipts.append(report("after the resume", "r3"))
            return tool_call_response(("parse_time", {"text": "now"}), id_prefix="resumed")

        heal_capacity(h, report_after_resume, text_response("done"))
        result = await h.manager.try_explicit_resume(resume_msg(original))
        assert result is not None and result[0] == "done"
        assert h.row()[0] == TurnStatus.TERMINAL_COMPLETED
        # Numbering continues past the restored consumed report, in a new incarnation.
        assert receipts[0].ok and receipts[0].audit_metadata["report_sequence"] == 2
        delivered = [b for m in _reports(h.fake.calls[-1]["messages"]) for b in _bodies(m)]
        assert delivered == ["before the outage", "after the resume"]
        assert "during the outage" not in json.dumps(h.fake.calls)
