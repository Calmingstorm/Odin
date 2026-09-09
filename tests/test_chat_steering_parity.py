"""Runtime no-steer parity for the main chat iteration loop.

The goldens below were captured by executing pre-steering ``4ecb63b0`` with
these instrumented collaborators and compared against the current runner.
Keep them independent of current implementation details. Static goldens make
the same gate runnable in shallow CI clones without fetching historical code.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass, field
from types import SimpleNamespace

import pytest

from src.discord.response_guards import StuckLoopTracker
from src.discord.tool_loop import ToolLoopRunner
from src.turn_state.durability import TurnDurability

_GENERATION_PREFIX = [
    "config", "serving", "frames:True", "budget", "trace.context_budget", "compress",
]
_GENERATION = [*_GENERATION_PREFIX, "generation", "guard.response"]
_ORIGINAL = [{"role": "user", "content": "original request"}]


@dataclass
class _Trace:
    events: list[str]

    def context_budget(self, **_kwargs) -> None:
        self.events.append("trace.context_budget")


@dataclass
class _Durability(TurnDurability):
    events: list[str] = field(default_factory=list)

    def __init__(self, events: list[str]) -> None:
        super().__init__(None, None)
        self.events = events

    async def on_guard_injection(self, _st) -> None:
        self.events.append("checkpoint.guard")


@dataclass
class _Scenario:
    responses: list[SimpleNamespace]
    entry_outcome: tuple[str, object] | None = None
    stuck_outcomes: list[tuple[str, object] | None] = field(default_factory=list)
    compress: bool = True
    tool_batch: bool = False


def _response(*, text: str = "final", tools: bool = False) -> SimpleNamespace:
    tool_calls = []
    if tools:
        tool_calls = [SimpleNamespace(id="call-1", name="read_only", input={"path": "/tmp/x"})]
    return SimpleNamespace(text=text, tool_calls=tool_calls, stop_reason="end_turn")


def _make_state(turn_cls, events: list[str], *, iteration: int, cap: int):
    return turn_cls(
        message=SimpleNamespace(
            content="original request",
            channel=SimpleNamespace(id="channel-1", typing=lambda: _NullCM()),
        ),
        policy=SimpleNamespace(),
        trace=_Trace(events),
        system_prompt="system",
        tools=[],
        messages=[{"role": "user", "content": "original request"}],
        user_id="requester-1",
        chat_cap=cap,
        stuck_tracker=StuckLoopTracker(),
        _trajectory=SimpleNamespace(),
        _result_store_cap=10,
        _cancel=asyncio.Event(),
        _ch_id="channel-1",
        _req_id="request-1",
        iteration=iteration,
        durability=_Durability(events),
    )


class _NullCM:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


def _instrument(module, scenario: _Scenario, events: list[str]):
    """The collaborators used for the historical baseline capture."""
    runner = module.ToolLoopRunner.__new__(module.ToolLoopRunner)
    serving = SimpleNamespace(
        client=object(), provider="codex", model="model", reasoning_effort="low"
    )
    snapshot = SimpleNamespace()
    responses = iter(scenario.responses)
    stuck_outcomes = iter(scenario.stuck_outcomes)

    def config():
        events.append("config")
        return SimpleNamespace()

    runner._get_config = config
    runner._llm_gateway = SimpleNamespace(
        capture_serving_identity=lambda _config: events.append("serving") or serving
    )
    runner._computer_frames = lambda _st, *, capture: events.append(f"frames:{capture}")
    runner._capture_budget_snapshot = lambda *_args: events.append("budget") or snapshot
    runner._snapshot_from_generation_facts = lambda _facts: snapshot
    runner._context_budget_observation = lambda _snapshot: (1000, "test", 100)
    runner._maybe_compress = lambda *_args: events.append("compress") or scenario.compress

    async def call_llm(*_args, **_kwargs):
        events.append("generation")
        return ("ok", next(responses))

    async def error_done(*_args):
        events.append("error.done")
        return ("error", False, True, [], False)

    async def entry_stuck(_st):
        events.append("guard.entry")
        return scenario.entry_outcome

    async def check_stuck(_st, _response):
        events.append("guard.response")
        return next(stuck_outcomes, None)

    async def finalize(_st, response):
        events.append("finalize")
        return ("done", (response.text, False, False, list(_st.tools_used_in_loop), False))

    async def classify(request, response, tools):
        events.append(f"classifier:{request}:{response}:{','.join(tools)}")
        return (True, "")

    async def save(*_args, **_kwargs):
        events.append("trajectory.save")

    async def execute(_st, _calls):
        events.append("tools.execute")
        return [{"ok": True}]

    def wait_fingerprint(_st, _calls, _results):
        events.append("wait.fingerprint")
        return False

    async def post_iteration(_st, _calls, _results):
        events.append("checkpoint.wi4")
        return None

    runner._call_llm = call_llm
    runner._llm_error_done = error_done
    runner._judge_entry_stuck = entry_stuck
    runner._check_stuck_and_record = check_stuck
    # Preserve the real finalizer for the tool route. It includes the async
    # completion classifier, the steering patch's riskiest no-op checkpoint.
    if not scenario.tool_batch:
        runner._finalize_or_retry = finalize
    runner._completion_classifier = SimpleNamespace(classify=classify)
    runner._channel_state = SimpleNamespace(
        close_steer_inbox=lambda *_args: events.append("inbox.close")
    )
    runner._turn_recorder = SimpleNamespace(_save_turn_trajectory=save)
    runner._clear_active = lambda _st: events.append("active.clear")
    runner._execute_tool_calls = execute
    runner._record_wait_fingerprint = wait_fingerprint
    runner._post_iteration = post_iteration
    runner._judge_wait_stuck = lambda *_args: pytest.fail("unexpected wait judgment")
    runner._check_skill_handoff = lambda *_args: None
    runner._finalize_cap_hit = lambda _st: pytest.fail("unexpected cap finalization")
    runner._stopped = lambda *_args: pytest.fail("unexpected cancellation")
    return runner


async def _run(module, scenario: _Scenario, *, iteration: int = 0, cap: int = 3):
    events: list[str] = []
    runner = _instrument(module, scenario, events)
    st = _make_state(module._ChatTurn, events, iteration=iteration, cap=cap)
    inbox_before = (
        st._inbox.qsize(),
        st._inbox_event.is_set(),
        st.inbox_sequence,
        st.last_consumed_sequence,
        list(st.inbox_events),
    ) if hasattr(st, "_inbox") else None
    tasks_before = {task for task in asyncio.all_tasks() if not task.done()}
    result = await runner._run_chat_iterations(st)
    tasks_after = {task for task in asyncio.all_tasks() if not task.done()}
    inbox_after = (
        st._inbox.qsize(),
        st._inbox_event.is_set(),
        st.inbox_sequence,
        st.last_consumed_sequence,
        list(st.inbox_events),
    ) if hasattr(st, "_inbox") else None
    return {
        "result": result,
        "events": events,
        "messages": st.messages,
        "iteration": st.iteration,
        "tools": st.tools_used_in_loop,
        "continuations": st.continuation_count,
        "wait_pending": st.wait_judgment_pending,
        "inbox_before": inbox_before,
        "inbox_after": inbox_after,
        "new_tasks": tasks_after - tasks_before,
    }


@pytest.mark.parametrize(
    ("scenario", "iteration", "cap", "expected_result", "expected_events"),
    [
        (_Scenario(responses=[_response()]), 0, 3,
         ("final", False, False, [], False), ["guard.entry", *_GENERATION, "finalize"]),
        # A restored turn starts at its persisted generation index.  No new
        # checkpoint/guard work may appear merely because this is a resume.
        (_Scenario(responses=[_response(text="resumed final")]), 1, 3,
         ("resumed final", False, False, [], False),
         ["guard.entry", *_GENERATION, "finalize"]),
        # The error return occurs before a generation and must retain the old
        # guard/checkpoint trace exactly.
        (_Scenario(responses=[], compress=False), 0, 3,
         ("error", False, True, [], False), ["guard.entry", *_GENERATION_PREFIX, "error.done"]),
    ],
    ids=["normal", "resume", "error"],
)
async def test_unsteered_chat_runtime_trace_return_and_guard_parity(
    scenario, iteration, cap, expected_result, expected_events,
):
    current = await _run(
        sys.modules[ToolLoopRunner.__module__], scenario, iteration=iteration, cap=cap
    )

    assert current["result"] == expected_result
    assert current["events"] == expected_events
    assert current["messages"] == _ORIGINAL
    assert current["iteration"] == iteration
    assert current["tools"] == []
    assert current["continuations"] == 0
    assert current["wait_pending"] is False
    # The historical loop has no inbox.  The current empty-drain checks must
    # leave every mailbox primitive unchanged and install no watcher/task.
    assert current["inbox_before"] == current["inbox_after"] == (0, False, 0, 0, [])
    assert not current["new_tasks"]


async def test_unsteered_tool_checkpoint_trace_matches_pre_steer_runtime():
    scenario = _Scenario(
        responses=[_response(tools=True), _response(text="after tools")], tool_batch=True
    )
    current = await _run(sys.modules[ToolLoopRunner.__module__], scenario)

    assert current["result"] == (
        "after tools",
        False,
        False,
        ["read_only"],
        False,
    )
    # Closing admission immediately before the terminal save is the sole
    # intentional no-steer trace delta. Pin both its exact position and all
    # surrounding historical events, including the classifier await.
    assert current["events"] == [
        "guard.entry", *_GENERATION,
        "tools.execute", "wait.fingerprint", "checkpoint.wi4", *_GENERATION,
        "classifier:original request:after tools:read_only",
        "inbox.close", "trajectory.save", "active.clear",
    ]
    assert current["events"].count("checkpoint.wi4") == 1
    assert current["events"].count("classifier:original request:after tools:read_only") == 1
    assert current["events"][-3:] == ["inbox.close", "trajectory.save", "active.clear"]
    assert current["messages"] == [*_ORIGINAL, {
        "role": "assistant", "content": [
            {"type": "text", "text": "final"},
            {"type": "tool_use", "id": "call-1", "name": "read_only",
             "input": {"path": "/tmp/x"}},
        ],
    }]
    assert current["iteration"] == 1
    assert current["continuations"] == 0
    assert current["wait_pending"] is False
    assert current["inbox_before"] == current["inbox_after"] == (0, False, 0, 0, [])
    assert not current["new_tasks"]


async def test_unsteered_guard_checkpoint_trace_matches_pre_steer_runtime():
    scenario = _Scenario(
        responses=[_response(text="after guard")],
        entry_outcome=("retry", None),
    )
    current = await _run(sys.modules[ToolLoopRunner.__module__], scenario)

    assert current["result"] == ("after guard", False, False, [], False)
    assert current["events"] == [
        "guard.entry", "checkpoint.guard", *_GENERATION, "finalize",
    ]
    assert current["events"].count("checkpoint.guard") == 1
    assert current["inbox_before"] == current["inbox_after"] == (0, False, 0, 0, [])
    assert not current["new_tasks"]
