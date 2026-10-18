"""Agent reports into a running chat/API turn, through the real iteration runner.

Only the provider is fake. Ownership, admission, drains, durability hooks,
closure and (end to end) spawn, dispatch, audit and waits run production code.
Contract: docs/agent-transcript-contract.md "Upward reports".
"""

from __future__ import annotations

import asyncio
import copy
import json

import pytest

from src.agents.execution_context import AgentDispatch
from src.agents.manager import AgentInfo
from src.agents.reports import (
    CLOSED_RECEIPT,
    REPORT_HEADER,
    STOPPING_RECEIPT,
    ReportTarget,
    admit_report,
)
from src.audit.tool_context import _pending_observers
from src.discord.channel_state import ChannelStateRegistry, ChatTurnInbox
from src.discord.response_guards import StuckLoopTracker
from src.discord.tool_loop import CHAT_POLICY, _ChatTurn
from src.llm.context_compressor import (
    SurfaceBoundary,
    compress_tool_context,
    emergency_compress_for_window,
    split_prefix_and_iterations,
)
from src.llm.openai_codex import CodexChatClient
from src.llm.openai_compatible import OpenAICompatibleClient
from src.turn_state import TurnStatus
from src.turn_state.codec import restore_field_values, snapshot_chat_turn
from src.turn_state.durability import TurnDurability
from tests.fakes import FakeLLM, FakeMessage, make_bot, text_response, tool_call_response
from tests.test_resume_admission import (
    Harness,
    capacity_forever,
    heal_capacity,
    resume_msg,
)


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


async def _turn(bot, message_id: int, text: str = "do the task") -> _ChatTurn:
    message = FakeMessage(text, id=message_id)
    return await bot.tool_loop._prepare_chat_turn(
        message, [{"role": "user", "content": text}], None, None, CHAT_POLICY
    )


def _child(turn: _ChatTurn, agent_id: str = "child") -> AgentInfo:
    agent = AgentInfo(
        id=agent_id,
        label=agent_id,
        goal="g",
        channel_id=turn._ch_id,
        requester_id=turn.user_id,
        requester_name="user",
        report_target=ReportTarget.for_turn(turn._ch_id, turn._req_id),
    )
    agent.iteration_count = 2
    return agent


def _report(bot, agent: AgentInfo, text: str, call_id: str = "call-1"):
    return admit_report(
        AgentDispatch(agent, {"id": call_id}),
        text,
        lambda target: bot.channel_state.report_endpoint(target.channel_id, target.request_id),
    )


def _steer(bot, turn: _ChatTurn, text: str) -> None:
    receipt = bot.channel_state.request_steer(turn._ch_id, text, user_id=turn.user_id)
    assert receipt.startswith("Message queued")


def _reports(messages: list[dict]) -> list[dict]:
    return [m for m in messages if m.get("provenance") == "agent_report"]


def _bodies(message: dict) -> list[str]:
    lines = message["content"].split("\n")
    assert lines[0] == REPORT_HEADER
    return [json.loads(line)["report"] for line in lines[1:]]


def _count_injections(turn: _ChatTurn) -> list:
    calls: list = []
    original = turn.durability.on_guard_injection

    async def counted(*args, **kwargs):
        calls.append([m.get("provenance") for m in turn.messages])
        return await original(*args, **kwargs)

    turn.durability.on_guard_injection = counted
    return calls


class TestLoopHead:
    async def test_report_during_a_tool_generation_reaches_the_next_one_once(self):
        fake = FakeLLM([])
        bot = make_bot(fake_llm=fake)
        turn = await _turn(bot, 8001)
        child = _child(turn)
        injections = _count_injections(turn)
        receipts = []

        def report_then_call():
            receipts.append(_report(bot, child, "found the cause"))
            return tool_call_response(("parse_time", {"text": "tomorrow"}))

        fake.responses[:] = [report_then_call, text_response("done")]
        result = await bot.tool_loop._run_chat_iterations(turn)

        assert result[0] == "done" and len(fake.calls) == 2
        assert receipts[0].ok and "report sequence 1" in receipts[0].output
        assert _reports(fake.messages_of_call(0)) == []
        (delivered,) = _reports(fake.messages_of_call(1))
        assert _bodies(delivered) == ["found the cause"]
        # After the paired tool results, as the newest message of the next request.
        assert fake.messages_of_call(1)[-1] == delivered
        assert fake.messages_of_call(1)[-2]["content"][0]["type"] == "tool_result"
        assert len(injections) == 1
        assert turn.continuation_count == 0 and not turn.fabrication_retried

    async def test_a_report_during_the_final_generation_never_suppresses_it(self):
        fake = FakeLLM([])
        bot = make_bot(fake_llm=fake)
        turn = await _turn(bot, 8002)
        child = _child(turn)
        receipts = []

        def report_then_answer():
            receipts.append(_report(bot, child, "too late to matter"))
            return text_response("final answer")

        fake.responses[:] = [report_then_answer]
        injections = _count_injections(turn)
        result = await bot.tool_loop._run_with_guards(turn)

        assert result[0] == "final answer" and len(fake.calls) == 1
        assert receipts[0].ok and injections == []
        late = _report(bot, child, "after the end")
        assert late.output == CLOSED_RECEIPT
        assert late.audit_metadata["report_closed_reason"] == "finished"
        events = [(r["event"], r["report_sequence"]) for r in turn._steer_inbox.reports.history]
        assert events == [("queued", 1), ("closed", 1)]

    async def test_reports_ride_ahead_of_steering_consumed_after_a_tool_batch(self):
        fake = FakeLLM([])
        bot = make_bot(fake_llm=fake)
        turn = await _turn(bot, 8003)
        child = _child(turn)
        injections = _count_injections(turn)

        def report_and_steer():
            assert _report(bot, child, "evidence").ok
            _steer(bot, turn, "use the second plan")
            return tool_call_response(("parse_time", {"text": "tomorrow"}))

        fake.responses[:] = [report_and_steer, text_response("done")]
        await bot.tool_loop._run_chat_iterations(turn)

        tail = [m.get("provenance") for m in fake.messages_of_call(1)[-2:]]
        assert tail == ["agent_report", "human_steer"]
        assert len(injections) == 1

    async def test_reports_ride_ahead_of_a_steer_that_supersedes_a_final_answer(self):
        fake = FakeLLM([])
        bot = make_bot(fake_llm=fake)
        turn = await _turn(bot, 8004)
        child = _child(turn)

        def report_steer_answer():
            assert _report(bot, child, "evidence").ok
            _steer(bot, turn, "answer differently")
            return text_response("stale answer")

        fake.responses[:] = [report_steer_answer, text_response("replanned answer")]
        result = await bot.tool_loop._run_chat_iterations(turn)

        assert result[0] == "replanned answer"
        tail = [m.get("provenance") for m in fake.messages_of_call(1)[-2:]]
        assert tail == ["agent_report", "human_steer"]

    async def test_steering_at_the_loop_head_also_comes_last(self):
        fake = FakeLLM([text_response("done")])
        bot = make_bot(fake_llm=fake)
        turn = await _turn(bot, 8005)
        child = _child(turn)
        _steer(bot, turn, "correction")
        assert _report(bot, child, "evidence").ok
        # Runner entry drains steering, with the pending report riding ahead.
        await bot.tool_loop._run_chat_iterations(turn)
        provenance = [m.get("provenance") for m in fake.messages_of_call(0)]
        assert provenance[-2:] == ["agent_report", "human_steer"]

    async def test_reports_ride_ahead_of_a_steer_consumed_after_the_classifier(self, monkeypatch):
        fake = FakeLLM([text_response("old answer"), text_response("new answer")])
        bot = make_bot(fake_llm=fake)
        turn = await _turn(bot, 8007)
        child = _child(turn)
        turn.tools_used_in_loop.append("parse_time")
        verdicts: list = []

        async def classify(*args, **kwargs):
            if not verdicts:
                assert _report(bot, child, "evidence").ok
                _steer(bot, turn, "answer differently")
            verdicts.append(args)
            return (True, "")

        monkeypatch.setattr(bot.tool_loop._completion_classifier, "classify", classify)
        result = await bot.tool_loop._run_chat_iterations(turn)
        assert result[0] == "new answer" and len(fake.calls) == 2
        tail = [m.get("provenance") for m in fake.messages_of_call(1)[-2:]]
        assert tail == ["agent_report", "human_steer"]

    async def test_no_report_means_no_report_message_or_checkpoint(self):
        fake = FakeLLM([tool_call_response(("parse_time", {"text": "now"})), text_response("ok")])
        bot = make_bot(fake_llm=fake)
        turn = await _turn(bot, 8006)
        injections = _count_injections(turn)
        await bot.tool_loop._run_chat_iterations(turn)
        assert all(_reports(fake.messages_of_call(i)) == [] for i in range(2))
        assert injections == [] and turn._steer_inbox.reports.totals["queued"] == 0


class TestOwnershipAndClosure:
    async def test_stop_refuses_then_closes_with_reason_stopped(self):
        fake = FakeLLM([text_response("never")])
        bot = make_bot(fake_llm=fake)
        turn = await _turn(bot, 8101)
        child = _child(turn)
        assert _report(bot, child, "pending").ok
        assert bot.channel_state.request_stop(turn._ch_id) is not None
        refused = _report(bot, child, "while stopping")
        assert refused.output == STOPPING_RECEIPT
        result = await bot.tool_loop._run_chat_iterations(turn)
        assert result[0].startswith("Task stopped by user.") and fake.calls == []
        closed = _report(bot, child, "after stop")
        assert closed.audit_metadata["report_closed_reason"] == "stopped"
        assert [r["event"] for r in turn._steer_inbox.reports.history] == ["queued", "closed"]

    async def test_a_different_request_in_the_channel_never_receives(self):
        bot = make_bot(fake_llm=FakeLLM([]))
        first = await _turn(bot, 8201)
        child = _child(first)
        bot.channel_state.clear_active_request(first._ch_id, first._req_id)
        second = await _turn(bot, 8202)
        refused = _report(bot, child, "stale owner")
        assert refused.output == CLOSED_RECEIPT
        assert refused.audit_metadata["report_closed_reason"] == "finished"
        assert second._steer_inbox.reports.totals["queued"] == 0
        assert first._ch_id == second._ch_id

    async def test_replacement_records_replaced_and_late_old_cleanup_is_harmless(self):
        registry = ChannelStateRegistry()
        registry.set_active_request("1", "a")
        old, new = ChatTurnInbox(), ChatTurnInbox()
        registry.bind_steer_inbox("1", "a", old)
        registry.set_active_request("1", "b")
        registry.bind_steer_inbox("1", "b", new)
        registry.close_steer_inbox("1", "a")  # late cleanup of the replaced owner
        assert registry.report_endpoint("1", "a") == ("closed", None, "replaced", "")
        assert registry.report_endpoint("1", "b").mailbox is new.reports
        assert new.reports.accepting and not old.reports.accepting

    async def test_a_refused_bind_leaves_no_accepting_endpoint(self):
        registry = ChannelStateRegistry()
        registry.set_active_request("1", "current")
        late = ChatTurnInbox()
        registry.bind_steer_inbox("1", "stale", late)
        assert not late.reports.accepting
        assert registry.report_endpoint("1", "stale").reason == "replaced"
        await registry.shutdown_steering()
        assert registry.report_endpoint("1", "current").reason == "shutdown"
        after = ChatTurnInbox()
        registry.bind_steer_inbox("1", "current", after)
        assert not after.reports.accepting and after.reports.closed_reason == "shutdown"

    async def test_shutdown_discards_pending_reports_with_reason(self):
        bot = make_bot(fake_llm=FakeLLM([]))
        turn = await _turn(bot, 8301)
        child = _child(turn)
        assert _report(bot, child, "in flight").ok
        await bot.channel_state.shutdown_steering()
        assert turn._steer_inbox.reports.history[-1]["reason"] == "shutdown"
        assert _report(bot, child, "late").audit_metadata["report_closed_reason"] == "shutdown"

    async def test_closure_reasons_are_bounded(self):
        registry = ChannelStateRegistry()
        for n in range(300):
            registry.set_active_request("1", str(n))
            registry.bind_steer_inbox("1", str(n), ChatTurnInbox())
            registry.clear_active_request("1", str(n))
        assert len(registry._report_closures) == 256
        assert registry.report_endpoint("1", "0").reason is None
        assert registry.report_endpoint("1", "299").reason == "finished"


def _restore(original: _ChatTurn) -> _ChatTurn:
    payload = snapshot_chat_turn(original, store_blob=lambda _data: "unused", generation_seq=1)
    restored = restore_field_values(
        payload, load_blob=lambda _ref: b"", stuck_tracker_cls=StuckLoopTracker
    )
    assert "reports" not in json.dumps(payload["fields"].get("_steer_inbox", {}))
    return _ChatTurn(
        message=original.message,
        policy=CHAT_POLICY,
        trace=None,
        tools=original.tools,
        _cancel=asyncio.Event(),
        durability=TurnDurability.disabled(),
        **restored,
    )


class TestSameProcessResume:
    async def test_gap_refuses_and_surviving_agents_reach_the_resumed_turn(self):
        fake = FakeLLM([])
        bot = make_bot(fake_llm=fake)
        original = await _turn(bot, 8401)
        child = _child(original)
        assert _report(bot, child, "consumed before suspension").ok
        assert original.drain_reports()
        assert _report(bot, child, "pending at suspension").ok
        old_incarnation = original._steer_inbox.reports.incarnation
        # What _suspend_turn does before its persistence await.
        bot.channel_state.close_reports(original._ch_id, original._req_id, "suspended")
        bot.channel_state.close_steer_inbox(original._ch_id, original._req_id)
        gap = _report(bot, child, "during the gap")
        assert gap.output == CLOSED_RECEIPT
        assert gap.audit_metadata["report_closed_reason"] == "suspended"

        resumed = _restore(original)
        receipts = []

        def report_after_resume():
            receipts.append(_report(bot, child, "after resume"))
            return tool_call_response(("parse_time", {"text": "tomorrow"}))

        fake.responses[:] = [report_after_resume, text_response("done")]
        await bot.tool_loop.run_resumed(resumed)

        new_mailbox = resumed._steer_inbox.reports
        assert new_mailbox.incarnation != old_incarnation
        # Visible numbering continues past the consumed report; the pending
        # one was discarded at suspension, never replayed.
        assert receipts[0].audit_metadata["report_sequence"] == 2
        assert receipts[0].audit_metadata["report_incarnation"] == new_mailbox.incarnation
        delivered = [b for m in _reports(fake.messages_of_call(1)) for b in _bodies(m)]
        assert delivered == ["consumed before suspension", "after resume"]
        assert "pending at suspension" not in json.dumps(fake.calls)

    async def test_coinciding_sequences_stay_distinguishable_by_incarnation(self):
        bot = make_bot(fake_llm=FakeLLM([]))
        original = await _turn(bot, 8402)
        child = _child(original)
        first = _report(bot, child, "first incarnation")
        bot.channel_state.close_reports(original._ch_id, original._req_id, "suspended")
        bot.channel_state.close_steer_inbox(original._ch_id, original._req_id)
        resumed = _restore(original)
        bot.channel_state.set_active_request(resumed._ch_id, resumed._req_id)
        rebound = ChatTurnInbox(requester_id=resumed.user_id)
        bot.channel_state.bind_steer_inbox(resumed._ch_id, resumed._req_id, rebound)
        second = _report(bot, child, "second incarnation")
        a, b = first.audit_metadata, second.audit_metadata
        assert a["report_sequence"] == b["report_sequence"] == 1
        assert a["report_recipient"] == b["report_recipient"]
        assert a["report_incarnation"] != b["report_incarnation"]


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


def _transcript_with_report() -> list[dict]:
    bot_message = {
        "role": "user",
        "provenance": "agent_report",
        "content": REPORT_HEADER
        + "\n"
        + json.dumps(
            {"agent_id": "a1", "label": "scout", "report_sequence": 1, "report": "r" * 3_000},
            ensure_ascii=False,
        ),
        "report_items": [
            {
                "recipient": "turn:99:1",
                "incarnation": "x",
                "report_sequence": 1,
                "agent_id": "a1",
                "sender_iteration": 1,
                "sender_call_ref": "c",
                "queued_at": 0.0,
            }
        ],
    }
    steer = {
        "role": "user",
        "content": "[Human steering from user 1] keep going",
        "provenance": "human_steer",
        "sequence": 1,
        "user_id": "1",
    }

    def cycle(call_id, payload):
        return [
            {
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": call_id, "name": "read_file", "input": {"path": "p"}}
                ],
            },
            {
                "role": "user",
                "content": [{"type": "tool_result", "tool_use_id": call_id, "content": payload}],
            },
        ]

    return [
        {"role": "developer", "content": "request preamble"},
        {"role": "user", "content": "current request"},
        *cycle("old", "old-" + "x" * 4_000),
        bot_message,
        steer,
        *cycle("new", "new-" + "y" * 500),
    ]


class TestCompressionAndWire:
    def test_compression_may_drop_reports_but_keeps_steering_and_pairing(self):
        messages = _transcript_with_report()
        boundary = SurfaceBoundary(request_start=0, envelope_len=2)
        soft, count = compress_tool_context(
            messages, max_context_chars=1, keep_recent=1, boundary=boundary
        )
        emergency, report = emergency_compress_for_window(
            messages, target_chars=1_500, boundary=boundary
        )
        assert count == 1 and report["fits"] is True
        for compressed in (soft, emergency):
            assert [m for m in compressed if m.get("provenance") == "human_steer"] == [messages[5]]
            assert not any("r" * 3_000 in str(m.get("content")) for m in compressed)
            call, result = compressed[-2:]
            assert call["content"][0]["id"] == result["content"][0]["tool_use_id"] == "new"
            assert compressed[:2] == messages[:2]

    def test_both_wire_converters_carry_the_envelope_and_drop_metadata(self):
        messages = _transcript_with_report()
        envelope = messages[4]["content"]
        codex = CodexChatClient._convert_messages_with_tools(None, messages)
        user_texts = [
            item["content"][0]["text"]
            for item in codex
            if item.get("type") == "message" and item["role"] == "user"
        ]
        assert envelope in user_texts
        compat = OpenAICompatibleClient._convert_messages(None, messages, "")
        assert {"role": "user", "content": envelope} in compat
        for wire in (codex, compat):
            assert "report_items" not in json.dumps(wire)
            assert "agent_report" not in json.dumps(wire)


class _RoutingLLM(FakeLLM):
    """One provider, two scripts: agent requests carry their AGENT CONTEXT."""

    def __init__(self, main: list, agent: list) -> None:
        super().__init__(main)
        self.agent_script = list(agent)
        self.agent_calls: list[dict] = []

    async def chat_with_tools(self, messages, system="", tools=None, **kwargs):
        if "AGENT CONTEXT" not in (system or ""):
            return await super().chat_with_tools(messages, system, tools, **kwargs)
        self.agent_calls.append({"messages": copy.deepcopy(messages), "tools": tools})
        item = self.agent_script.pop(0)
        if callable(item):
            item = item()
            if asyncio.iscoroutine(item):
                item = await item
        item.provenance_provider = "fake"
        item.provenance_model = kwargs.get("model") or self.model
        return item


async def _settled_audit(bot) -> list[dict]:
    if _pending_observers:
        await asyncio.gather(*list(_pending_observers), return_exceptions=True)
    return await bot.audit.search(limit=200)


class TestEndToEnd:
    async def test_spawned_agent_reports_without_waking_the_turns_wait(self):
        turn_waiting, reported, release = asyncio.Event(), asyncio.Event(), asyncio.Event()

        async def report_once_the_turn_waits():
            await turn_waiting.wait()
            return tool_call_response(
                ("report_to_parent", {"message": "found a blocker"}), id_prefix="child"
            )

        async def gated_final():
            reported.set()
            await release.wait()
            return text_response("child done")

        fake = _RoutingLLM([], [report_once_the_turn_waits, gated_final])
        # Agents inherit the main model, so spawn_agent needs no model choice.
        bot = make_bot(fake_llm=fake, config_overrides={"agents": {"model": None}})
        bot.agent_manager._completion_classifier = None
        turn = await _turn(bot, 8501, "inspect the repo")

        def wait_for_child():
            ids = list(bot.agent_manager._agents)
            assert len(ids) == 1
            turn_waiting.set()  # the child reports only after this loop head
            return tool_call_response(
                ("wait_for_agents", {"agent_ids": ids, "timeout": 30}), id_prefix="wait"
            )

        fake.responses[:] = [
            tool_call_response(("spawn_agent", {"label": "scout", "goal": "look"})),
            wait_for_child,
            text_response("summary"),
        ]
        task = asyncio.create_task(bot.tool_loop._run_with_guards(turn))
        try:
            await asyncio.wait_for(reported.wait(), 10)
            for _ in range(50):
                if len(fake.calls) == 2:
                    break
                await asyncio.sleep(0.02)
            await asyncio.sleep(0.3)
            # The report is queued, yet the turn is still inside its wait.
            assert len(fake.calls) == 2 and not task.done()
            assert len(turn._steer_inbox.reports.pending) == 1
            release.set()
            result = await asyncio.wait_for(task, 10)
        finally:
            release.set()
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

        assert result[0] == "summary" and len(fake.calls) == 3
        child = next(iter(bot.agent_manager._agents.values()))
        (delivered,) = _reports(fake.messages_of_call(2))
        line = json.loads(delivered["content"].split("\n")[1])
        assert line == {
            "agent_id": child.id,
            "label": "scout",
            "report_sequence": 1,
            "report": "found a blocker",
        }
        assert delivered["report_items"][0]["recipient"] == f"turn:99:{turn._req_id}"
        # Agent-only: the agent catalog has the tool, the main turn's never does.
        assert all(
            "report_to_parent" not in {t["name"] for t in call["tools"]} for call in fake.calls
        )
        assert all(
            "report_to_parent" in {t["name"] for t in call["tools"]} for call in fake.agent_calls
        )
        receipt = fake.agent_calls[1]["messages"][-1]["content"][0]["content"]
        assert receipt.startswith(
            "Report queued for the conversation that spawned you (report sequence 1;"
        )
        entries = [
            e
            for e in await _settled_audit(bot)
            if e.get("tool_name") == "report_to_parent" and e.get("type") != "event"
        ]
        executions = [e for e in entries if e.get("audit_metadata")]
        assert len(executions) == 1
        assert executions[0]["audit_metadata"] == {
            "report_outcome": "queued",
            "report_recipient": f"turn:99:{turn._req_id}",
            "report_incarnation": turn._steer_inbox.reports.incarnation,
            "report_sequence": 1,
            "report_call_ref": "child-1",
        }
        # One attributed execution record, joined to the report by its call.
        assert executions[0]["agent_id"] == child.id and executions[0]["call_id"] == "child-1"
        # The report sits behind the real spawn/wait tool boundary, never in the
        # stable prefix, and compression keeps that prefix and the newest cycle.
        final = fake.messages_of_call(2)
        prefix, cycles = split_prefix_and_iterations(final)
        assert _reports(prefix) == [] and cycles[-1][-1] == delivered
        compressed, summarized = compress_tool_context(final, max_context_chars=1, keep_recent=1)
        assert summarized == 1 and compressed[: len(prefix)] == prefix
        call, results, newest = compressed[-3:]
        assert newest == delivered
        assert call["content"][0]["id"] == results["content"][0]["tool_use_id"] == "wait-1"
