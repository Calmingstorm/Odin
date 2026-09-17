"""Runtime no-steer parity for the main chat iteration loop.

The goldens below were checked experimentally against pre-steering
``4ecb63b0`` with these instrumented collaborators, including real native
call/result execution, permission gates and the public resume envelope.
Keep them independent of current implementation details. Static goldens make
the same gate runnable in shallow CI clones without fetching historical code.
Persistence callbacks record their inputs rather than exercising a database;
provider/network/native side effects remain fakes, not end-to-end services.
"""

from __future__ import annotations

import asyncio
import sys
from copy import deepcopy
from dataclasses import dataclass, field
from types import SimpleNamespace

import pytest

from src.discord.channel_state import ChannelStateRegistry
from src.discord.response_guards import StuckLoopTracker
from src.discord.tool_loop import ToolLoopRunner
from src.turn_state.durability import TurnDurability

_GENERATION_PREFIX = [
    "config", "serving", "frames:True", "budget", "trace.context_budget", "compress",
]
_GENERATION = [*_GENERATION_PREFIX, "generation", "guard.response"]
_ORIGINAL = [{"role": "user", "content": "original request"}]
_SINGLE_CYCLE = [
    {"role": "assistant", "content": [
        {"type": "text", "text": "final"},
        {"type": "tool_use", "id": "call-1", "name": "read_only",
         "input": {"path": "/tmp/x"}},
    ]},
    {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "call-1", "content": "read:/tmp/x"},
    ]},
]
_SINGLE_TRACE = [
    "guard.entry", *_GENERATION,
    "config", "checkpoint.wi1:call-1", "permission:read_only:requester-1",
    "status:Running: read_only:False", "checkpoint.wi2:call-1",
    "dispatch:read_only:/tmp/x", "checkpoint.wi3:call-1:True:False:read:/tmp/x",
    "wait.fingerprint", "checkpoint.wi4", *_GENERATION,
    "classifier:original request:after tools:read_only",
    "inbox.close", "trajectory.save", "active.clear", "inbox.close",
]


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
        self.checkpoints = []

    async def on_llm_response(self, st, calls) -> None:
        self.events.append("checkpoint.wi1:" + ",".join(call.id for call in calls))
        self.checkpoints.append(("wi1", st.iteration, deepcopy(st.messages)))

    async def before_tool(self, call) -> None:
        self.events.append(f"checkpoint.wi2:{call.id}")

    async def after_tool(self, call, *, ok, uncertain, result_text) -> None:
        self.events.append(f"checkpoint.wi3:{call.id}:{ok}:{uncertain}:{result_text}")

    async def on_batch_settled(self, st) -> None:
        self.events.append("checkpoint.wi4")
        self.checkpoints.append(("wi4", st.iteration, deepcopy(st.messages)))

    async def settle_terminal(self, *, cancelled, is_error):
        self.events.append(f"checkpoint.terminal:{cancelled}:{is_error}")
        return await super().settle_terminal(cancelled=cancelled, is_error=is_error)

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
            author=SimpleNamespace(id="requester-1"),
            channel=SimpleNamespace(id="channel-1", typing=lambda: _NullCM()),
        ),
        policy=SimpleNamespace(skill_file_delivery=False),
        trace=_Trace(events),
        system_prompt="system",
        tools=[],
        messages=[{"role": "user", "content": "original request"}],
        user_id="requester-1",
        chat_cap=cap,
        stuck_tracker=StuckLoopTracker(),
        _trajectory=SimpleNamespace(
            message_id="request-1", source="discord", channel_id="channel-1", iterations=[],
        ),
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
    runner._parity_generations = []
    runner._parity_dispatches = []
    runner._parity_permissions = []
    runner._parity_bindings = []
    runner._parity_inbox_bindings = []
    later_finished = asyncio.Event()

    def config():
        events.append("config")
        return SimpleNamespace(tools=SimpleNamespace(tool_timeout_seconds=5))

    runner._get_config = config
    runner._llm_gateway = SimpleNamespace(
        capture_serving_identity=lambda _config: events.append("serving") or serving
    )
    runner._computer_frames = lambda _st, *, capture: events.append(f"frames:{capture}")
    runner._capture_budget_snapshot = lambda *_args: events.append("budget") or snapshot
    runner._snapshot_from_generation_facts = lambda _facts: snapshot
    runner._context_budget_observation = lambda _snapshot: (1000, "test", 100)
    runner._maybe_compress = lambda *_args: events.append("compress") or scenario.compress

    async def call_llm(st, **_kwargs):
        events.append("generation")
        runner._parity_generations.append((st.iteration, deepcopy(st.messages), st.user_id))
        runner._parity_bindings.append((
            runner._channel_state.active_requests.get(st._ch_id),
            runner._channel_state.cancel_events.get(st._ch_id) is st._cancel,
            st._cancel.is_set(),
        ))
        inboxes = getattr(runner._channel_state, "_steer_inboxes", {})
        inbox = inboxes.get((st._ch_id, st._req_id))
        runner._parity_inbox_bindings.append(
            None if inbox is None else (inbox.requester_id, inbox.accepting)
        )
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

    def permission(name, user_id):
        runner._parity_permissions.append((name, user_id))
        events.append(f"permission:{name}:{user_id}")
        return "Permission denied: blocked" if name == "blocked" else None

    async def dispatch(name, tool_input, *, message, user_id, skill_file_delivery):
        runner._parity_dispatches.append(
            (name, deepcopy(tool_input), message.author.id, user_id, skill_file_delivery)
        )
        events.append(f"dispatch:{name}:{tool_input['path']}")
        # Complete same-name calls out of order without timing sleeps. The
        # runner's real gather must still append results in call order.
        if tool_input["path"] == "/tmp/first":
            await later_finished.wait()
        elif tool_input["path"] == "/tmp/second":
            later_finished.set()
        return f"read:{tool_input['path']}", SimpleNamespace(rebuild_system_prompt=False)

    async def status(text, **kwargs):
        events.append(f"status:{text}:{kwargs.get('task_start', False)}")

    async def audit(**_kwargs):
        pass

    def clear_active(st):
        events.append("active.clear")
        runner._channel_state.clear_active_request(st._ch_id, st._req_id)

    def wait_fingerprint(_st, _calls, _results, *, elapsed_seconds=0):
        events.append("wait.fingerprint")
        return False

    runner._call_llm = call_llm
    runner._llm_error_done = error_done
    runner._judge_entry_stuck = entry_stuck
    runner._check_stuck_and_record = check_stuck
    # Preserve the real finalizer for the tool route. It includes the async
    # completion classifier, the steering patch's riskiest no-op checkpoint.
    if not scenario.tool_batch:
        runner._finalize_or_retry = finalize
    runner._completion_classifier = SimpleNamespace(classify=classify)
    runner._channel_state = ChannelStateRegistry()
    # Keep actual request/cancellation/mailbox ownership, not a rebind stub.
    original_close = getattr(runner._channel_state, "close_steer_inbox", None)
    if original_close is not None:
        def close(*args):
            events.append("inbox.close")
            original_close(*args)
        runner._channel_state.close_steer_inbox = close
    runner._tool_executor = SimpleNamespace(check_permission=permission)
    runner._native_tools = SimpleNamespace(handles=lambda _name: True, dispatch=dispatch)
    runner._delivery = SimpleNamespace(set_status=status)
    runner._audit = SimpleNamespace(log_event=audit, log_execution=audit)
    runner._turn_recorder = SimpleNamespace(_save_turn_trajectory=save)
    runner._clear_active = clear_active
    runner._record_wait_fingerprint = wait_fingerprint
    runner._judge_wait_stuck = lambda *_args: pytest.fail("unexpected wait judgment")
    runner._check_skill_handoff = lambda *_args: None
    runner._finalize_cap_hit = lambda _st: pytest.fail("unexpected cap finalization")
    runner._stopped = lambda *_args: pytest.fail("unexpected cancellation")
    return runner


async def _run(
    module, scenario: _Scenario, *, iteration: int = 0, cap: int = 3, resumed: bool = False,
    initial_messages: list[dict] | None = None,
):
    events: list[str] = []
    runner = _instrument(module, scenario, events)
    st = _make_state(module._ChatTurn, events, iteration=iteration, cap=cap)
    if initial_messages is not None:
        st.messages = deepcopy(initial_messages)
    original_cancel = st._cancel
    previous_cancel = asyncio.Event()
    previous_cancel.set()
    if resumed:
        # Simulate a stale process-local owner. Resume must replace only its
        # registry binding, not mutate the old cancellation signal or identity.
        runner._channel_state.set_active_request("channel-1", "previous", previous_cancel)
        previous_cancel.set()
        events.clear()
    else:
        runner._channel_state.set_active_request(st._ch_id, st._req_id, st._cancel)
        events.clear()
    inbox_before = (
        st._inbox.qsize(),
        st._inbox_event.is_set(),
        st.inbox_sequence,
        st.last_consumed_sequence,
        list(st.inbox_events),
    ) if hasattr(st, "_inbox") else None
    tasks_before = {task for task in asyncio.all_tasks() if not task.done()}
    result = await (runner.run_resumed(st) if resumed else runner._run_chat_iterations(st))
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
        "generations": runner._parity_generations,
        "bindings": runner._parity_bindings,
        "inbox_bindings": runner._parity_inbox_bindings,
        "permissions": runner._parity_permissions,
        "dispatches": runner._parity_dispatches,
        "checkpoints": st.durability.checkpoints,
        "rebound_cancel": st._cancel is original_cancel,
        "previous_cancelled": previous_cancel.is_set(),
        "active_requests": dict(runner._channel_state.active_requests),
        "op_details": st._op_tool_details,
    }


@pytest.mark.parametrize(
    ("scenario", "iteration", "cap", "expected_result", "expected_events"),
    [
        (_Scenario(responses=[_response()]), 0, 3,
         ("final", False, False, [], False), ["guard.entry", *_GENERATION, "finalize"]),
        # Loop-only index parity. The public run_resumed entry is covered below.
        (_Scenario(responses=[_response(text="resumed final")]), 1, 3,
         ("resumed final", False, False, [], False),
         ["guard.entry", *_GENERATION, "finalize"]),
        # The error return occurs before a generation and must retain the old
        # guard/checkpoint trace exactly.
        (_Scenario(responses=[], compress=False), 0, 3,
         ("error", False, True, [], False), ["guard.entry", *_GENERATION_PREFIX, "error.done"]),
    ],
    ids=["normal", "nonzero-loop-index", "error"],
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
    # The inbox closures are intentional no-steer deltas. Pin their positions
    # alongside the historical execution/permission/checkpoint trace.
    assert current["events"] == _SINGLE_TRACE
    assert current["events"].count("checkpoint.wi4") == 1
    assert current["events"].count("classifier:original request:after tools:read_only") == 1
    assert current["messages"] == [*_ORIGINAL, *_SINGLE_CYCLE]
    assert current["generations"] == [
        (0, _ORIGINAL, "requester-1"),
        (1, [*_ORIGINAL, *_SINGLE_CYCLE], "requester-1"),
    ]
    assert current["checkpoints"] == [
        ("wi1", 0, [*_ORIGINAL, _SINGLE_CYCLE[0]]),
        ("wi4", 0, [*_ORIGINAL, *_SINGLE_CYCLE]),
    ]
    assert current["permissions"] == [("read_only", "requester-1")]
    assert current["dispatches"] == [
        ("read_only", {"path": "/tmp/x"}, "requester-1", "requester-1", False),
    ]
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


@pytest.mark.parametrize("resumed", [False, True], ids=["fresh", "run-resumed-rebind"])
async def test_unsteered_native_batch_protocol_permissions_and_resume_parity(resumed):
    """Real executor, RBAC, timeout wrapper, pairing, WI-4 and resume envelope.

    Only native effects, provider calls and persistence I/O are fake. In
    particular neither _execute_tool_calls nor _run_with_guards is replaced.
    No historical checkout is needed by this deterministic golden gate.
    """
    calls = [
        SimpleNamespace(id="first", name="read_only", input={"path": "/tmp/first"}),
        SimpleNamespace(id="denied", name="blocked", input={"path": "/tmp/denied"}),
        SimpleNamespace(id="second", name="read_only", input={"path": "/tmp/second"}),
    ]
    response = SimpleNamespace(text="batch", tool_calls=calls, stop_reason="tool_use")
    scenario = _Scenario(responses=[response, _response(text="after tools")], tool_batch=True)
    # A genuine resume starts with already-settled native history. Its old
    # call must reach the model unchanged, never execute or checkpoint again.
    initial = [*_ORIGINAL, *_SINGLE_CYCLE] if resumed else _ORIGINAL
    iteration = 1 if resumed else 0
    current = await _run(
        sys.modules[ToolLoopRunner.__module__], scenario,
        resumed=resumed, iteration=iteration, initial_messages=initial,
    )
    assistant = {"role": "assistant", "content": [
        {"type": "text", "text": "batch"},
        {"type": "tool_use", "id": "first", "name": "read_only",
         "input": {"path": "/tmp/first"}},
        {"type": "tool_use", "id": "denied", "name": "blocked",
         "input": {"path": "/tmp/denied"}},
        {"type": "tool_use", "id": "second", "name": "read_only",
         "input": {"path": "/tmp/second"}},
    ]}
    results = {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "first", "content": "read:/tmp/first"},
        {"type": "tool_result", "tool_use_id": "denied", "content": "Permission denied: blocked"},
        {"type": "tool_result", "tool_use_id": "second", "content": "read:/tmp/second"},
    ]}
    transcript = [*initial, assistant, results]
    assert current["result"] == (
        "after tools", False, False, ["read_only", "blocked", "read_only"], False,
    )
    assert current["messages"] == transcript
    assert current["generations"] == [
        (iteration, initial, "requester-1"),
        (iteration + 1, transcript, "requester-1"),
    ]
    assert current["checkpoints"] == [
        ("wi1", iteration, [*initial, assistant]), ("wi4", iteration, transcript),
    ]
    assert current["permissions"] == [
        ("read_only", "requester-1"), ("blocked", "requester-1"), ("read_only", "requester-1"),
    ]
    assert current["dispatches"] == [
        ("read_only", {"path": "/tmp/first"}, "requester-1", "requester-1", False),
        ("read_only", {"path": "/tmp/second"}, "requester-1", "requester-1", False),
    ]
    assert current["events"] == [
        *(["inbox.close", "status:Resuming preserved work...:True"] if resumed else []),
        "guard.entry", *_GENERATION,
        "config", "checkpoint.wi1:first,denied,second",
        "permission:read_only:requester-1", "status:Running: read_only:False",
        "checkpoint.wi2:first", "dispatch:read_only:/tmp/first",
        "permission:blocked:requester-1",
        "checkpoint.wi3:denied:False:False:Permission denied: blocked",
        "permission:read_only:requester-1", "status:Running: read_only:False",
        "checkpoint.wi2:second", "dispatch:read_only:/tmp/second",
        "checkpoint.wi3:second:True:False:read:/tmp/second",
        "checkpoint.wi3:first:True:False:read:/tmp/first",
        "wait.fingerprint", "checkpoint.wi4", *_GENERATION,
        "classifier:original request:after tools:read_only,blocked,read_only",
        "inbox.close", "trajectory.save", "active.clear", "inbox.close",
        *(["checkpoint.terminal:False:False", "inbox.close"] if resumed else []),
    ]
    assert current["bindings"] == [("request-1", True, False)] * 2
    assert current["inbox_bindings"] == (
        [("requester-1", True)] * 2 if resumed else [None, None]
    )
    assert current["rebound_cancel"] is True
    assert current["previous_cancelled"] is True
    assert current["active_requests"] == {}
    assert current["iteration"] == iteration + 1
    assert current["continuations"] == 0
    assert current["wait_pending"] is False
    assert current["inbox_before"] == current["inbox_after"] == (0, False, 0, 0, [])
    assert not current["new_tasks"]
