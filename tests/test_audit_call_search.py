"""search_audit groups each tool call's records before filtering and the limit."""
from __future__ import annotations

import itertools
import json
from datetime import UTC, datetime, timedelta

import pytest

from src.audit.call_search import SearchFilters, call_key, search_calls
from src.audit.logger import AuditLogger
from src.discord.native_tools.knowledge import KnowledgeTools

T0 = datetime(2026, 10, 20, 14, 0, tzinfo=UTC)


def _ts(seconds: float) -> str:
    return (T0 + timedelta(seconds=seconds)).isoformat()


def _call(n: int, at: float, *, turn: str = "t1", tool: str = "run_command", error=None,
          approved: bool = True, duration_ms: int = 140, host: str = "localhost",
          user_name: str = "Claudia#4015", summary: str = "ok", status: str | None = None,
          kind: str | None = None) -> list[dict]:
    """Start event, canonical record and end event of one chat tool call."""
    ident = {"turn": {"turn_id": turn, "source": "discord", "channel_id": "c1"},
             "channel_id": "c1", "tool_name": tool}
    start = {"timestamp": _ts(at - duration_ms / 1000), "type": "tool_start", "action": tool,
             "actor": "u1", "user_id": "u1", "detail": "", "audit_observer": True,
             "metadata": {"iteration": n, "call_id": f"call_{n}", "turn_id": turn}, **ident}
    call = {"timestamp": _ts(at), "user_id": "u1", "user_name": user_name,
            "tool_input": {"host": host, "command": "<shell command: 10 bytes>"},
            "approved": approved, "result_summary": summary, "execution_time_ms": duration_ms,
            "error": error, "call_id": f"call_{n}", "iteration": n, "turn_id": turn, **ident}
    if status:
        call["status"] = status
    if kind:
        call["type"] = kind
    end = {"timestamp": _ts(at + 0.005), "type": "tool_end", "action": tool, "actor": "u1",
           "user_id": "u1", "detail": f"result text of call {n}", "audit_observer": True,
           "metadata": {"iteration": n, "call_id": f"call_{n}", "turn_id": turn}, **ident}
    return [start, call, end]


def _logger(tmp_path, *generations: list[dict]) -> AuditLogger:
    """generations[0] is the active file; later ones are older rotations."""
    path = tmp_path / "audit.jsonl"
    for index, records in enumerate(generations):
        target = path if index == 0 else path.with_name(f"audit.jsonl.{index}")
        target.write_text("".join(json.dumps(r) + "\n" for r in records))
    return AuditLogger(str(path))


async def _search(logger: AuditLogger, limit: int = 20, **filters):
    return await search_calls(logger.iter_entries_newest_first(), SearchFilters(**filters), limit)


async def test_one_result_per_call_and_no_phantom_denials(tmp_path):
    logger = _logger(tmp_path, _call(1, 10) + _call(2, 20))

    groups = await _search(logger)

    assert len(groups) == 2
    assert [g.call["call_id"] for g in groups] == ["call_2", "call_1"]
    assert all(g.start is not None and g.end is not None for g in groups)
    assert all(g.outcome() == "succeeded" for g in groups)


async def test_handler_renders_approval_and_outcome_separately(tmp_path):
    logger = _logger(tmp_path, _call(1, 10, error="exit 7", summary="partial-output"))
    tools = KnowledgeTools.__new__(KnowledgeTools)
    tools.audit = logger

    text = await tools._handle_search_audit({})

    assert "**Audit log (1 call):**" in text
    assert "by Claudia#4015 (approved, 140ms, failed)" in text
    assert "ERROR: exit 7" in text
    assert "denied" not in text and "by ?" not in text


async def test_keyword_found_only_in_result_text_returns_the_call(tmp_path):
    logger = _logger(tmp_path, _call(1, 10) + _call(2, 20))

    groups = await _search(logger, keyword="result text of call 1")

    assert [g.call["call_id"] for g in groups] == ["call_1"]
    assert groups[0].matched_in == ["result text"]


async def test_filters_may_be_satisfied_by_different_records_of_a_call(tmp_path):
    logger = _logger(tmp_path, _call(1, 10) + _call(2, 20))

    old = await logger.search(keyword="result text of call 2", user="Claudia",
                              include_agent_events=False)
    groups = await _search(logger, keyword="result text of call 2", user="Claudia")

    assert old == []
    assert [g.call["call_id"] for g in groups] == ["call_2"]


async def test_limit_counts_calls_and_keeps_each_call_whole(tmp_path):
    logger = _logger(tmp_path, _call(1, 10) + _call(2, 20) + _call(3, 30))

    groups = await _search(logger, limit=1)

    assert len(groups) == 1
    only = groups[0]
    assert only.call["call_id"] == "call_3"
    assert only.start is not None and only.end is not None


async def test_reused_call_ids_in_other_turns_stay_separate(tmp_path):
    logger = _logger(tmp_path, _call(1, 10, turn="t1") + _call(1, 20, turn="t2"))

    groups = await _search(logger)

    assert len(groups) == 2
    assert {g.call["turn_id"] for g in groups} == {"t1", "t2"}


async def test_companions_across_a_rotation_are_grouped(tmp_path):
    start, call, end = _call(1, 10)
    logger = _logger(tmp_path, [call, end], [start])

    groups = await _search(logger)

    assert len(groups) == 1
    assert groups[0].start == start


async def test_long_call_finds_its_start_far_back(tmp_path):
    records = _call(1, 1000, duration_ms=900_000)
    filler = [r for n in range(2, 6) for r in _call(n, 300 + n)]
    logger = _logger(tmp_path, [records[0], *filler, records[1], records[2]])

    groups = await _search(logger, tool_name="run_command", limit=10)

    long_call = next(g for g in groups if g.call and g.call["call_id"] == "call_1")
    assert long_call.start is not None


async def test_orphan_lifecycle_events_render_truthfully(tmp_path):
    started = _call(1, 10)[0]
    finished = _call(2, 20)[2]
    logger = _logger(tmp_path, [started, finished])
    tools = KnowledgeTools.__new__(KnowledgeTools)
    tools.audit = logger

    text = await tools._handle_search_audit({})

    assert "(finished, no call record)" in text
    assert "(started, no terminal record)" in text
    assert "denied" not in text


async def test_canonical_tool_end_records_are_the_call(tmp_path):
    start, call, _end = _call(1, 10, tool="computer_act", kind="tool_end")
    logger = _logger(tmp_path, [start, call])

    groups = await _search(logger)

    assert len(groups) == 1
    assert groups[0].call is not None and groups[0].call["type"] == "tool_end"


@pytest.mark.parametrize(
    "status,expected",
    [("error", ["call_2"]), ("failed", ["call_2"]), ("success", ["call_3", "call_1"]),
     ("succeeded", ["call_3", "call_1"]), ("denied", ["call_4"]), ("started", ["call_5"])],
)
async def test_status_aliases_match_outcomes(tmp_path, status, expected):
    records = (
        _call(1, 10) + _call(2, 20, error="boom") + _call(3, 30)
        + _call(4, 40, approved=False) + [_call(5, 50)[0]]
    )
    logger = _logger(tmp_path, records)

    groups = await _search(logger, status=status)

    assert [g.canonical.get("call_id") or g.canonical["metadata"]["call_id"]
            for g in groups] == expected


async def test_agent_records_keep_their_stored_status(tmp_path):
    agent_call = {"timestamp": _ts(10), "tool_name": "run_command", "approved": True,
                  "status": "failed", "agent_id": "a1", "call_id": "c9", "user_id": "u1"}
    lifecycle = {"timestamp": _ts(9), "type": "loop_tool_start", "agent_id": "a1",
                 "tool_name": "run_command"}
    logger = _logger(tmp_path, [lifecycle, agent_call])

    groups = await _search(logger, status="failed")

    assert len(groups) == 1 and groups[0].call == agent_call
    assert call_key(agent_call) is None


def _key_of(entry: dict):
    return call_key(entry) or json.dumps(entry, sort_keys=True)


@pytest.mark.parametrize(
    "filters",
    [
        {}, {"tool_name": "read_file"}, {"user": "claudia"}, {"user": "u1"},
        {"host": "server-2"}, {"keyword": "call 3"}, {"keyword": "partial"},
        {"date": "2026-10-20T14:00"}, {"has_error": True}, {"min_duration_ms": 500},
        {"status": "failed"}, {"tool_name": "run_command", "keyword": "result"},
    ],
)
async def test_every_call_the_old_search_matched_is_still_represented(tmp_path, filters):
    records = []
    for n, (tool, host, error) in enumerate(
        itertools.product(["run_command", "read_file"], ["localhost", "server-2"], [None, "x"]),
        start=1,
    ):
        records += _call(n, n * 7, tool=tool, host=host, error=error,
                         summary="partial-output" if error else "ok",
                         duration_ms=100 * n)
    logger = _logger(tmp_path, records)

    old = await logger.search(include_agent_events=False, limit=50, **filters)
    new = await _search(logger, limit=50, **filters)

    represented = {_key_of(entry) for group in new for entry in group.members}
    assert {_key_of(entry) for entry in old} <= represented
