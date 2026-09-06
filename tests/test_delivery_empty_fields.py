"""Schema-filling callers may send blank optional paging fields, not just omit them."""

import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.agents.manager import AgentManager
from src.agents.results import result_page
from src.agents.trajectory import AgentTrajectorySaver
from src.tools.process_manager import ProcessInfo, ProcessRegistry
from src.tools.runtime_delivery import execution_delivery_scope
from tests.test_agent_result_pages import dispatcher
from tests.test_executor_output_retention import executor
from tests.test_process_tail_correctness import delivered, job, preview

EMPTY = [None, "", " \t\r\n", "\u2003"]


@pytest.fixture(autouse=True)
def no_background(monkeypatch):
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())


@pytest.mark.parametrize("remote", [False, True])
@pytest.mark.parametrize("cursor", ["", " \t\n"])
async def test_soak_poll_shape_empty_cursor_with_zero_offset(tmp_path, remote, cursor):
    async with job(tmp_path, "print('retained evidence')", remote) as (ex, reg, info):
        expected = await delivered(ex, info, offset=0)
        result = await ex.execute("manage_process", {
            "action": "poll", "pid": info.pid, "cursor": cursor, "offset": 0,
            "limit": 4000, "host": "", "command": "", "input_text": "",
            "wait_seconds": 0,
        }, user_id="owner")
        assert result.ok, result.output
        assert result.output == expected
        assert json.loads(result.output)["text"] == "retained evidence\n"
        assert await reg.poll(info.pid, cursor=cursor, offset=0) == expected


@pytest.mark.parametrize("remote", [False, True])
async def test_real_process_empty_fields_preserve_default_and_explicit_offset(tmp_path, remote):
    text = "".join(f"row-{i:04d} 世界\n" for i in range(400))
    async with job(tmp_path, f"print({text!r}, end='')", remote) as (ex, reg, info):
        baseline = await delivered(ex, info, offset=0)
        first = json.loads(baseline)
        assert first["shown_bytes"] == 4000 and first["truncated"]
        assert first["text"].encode() == text.encode()[:4000]
        tail, metadata = preview(await delivered(ex, info))
        assert tail == "".join(text.splitlines(keepends=True)[-50:])

        # Omission, null, and blank are equivalent independently and together.
        for empty in EMPTY:
            for field in ("cursor", "offset", "limit"):
                actual = preview(await delivered(ex, info, **{field: empty}))
                assert actual == (tail, metadata)
            filled = {"cursor": empty, "offset": empty, "limit": empty}
            assert preview(await delivered(ex, info, **filled)) == (tail, metadata)
            assert reg.output_info(info.pid, empty) is info
            assert preview(await reg.poll(info.pid, **filled)) == (tail, metadata)

            # The exact failed live shape, including all unrelated schema fields.
            result = await ex.execute("manage_process", {
                "action": "poll", "pid": info.pid, "cursor": empty,
                "offset": 0, "limit": empty, "host": "", "command": "",
                "input_text": "", "wait_seconds": 0,
            }, user_id="owner")
            assert result.ok, result.output
            assert result.output == baseline
            assert await reg.poll(info.pid, cursor=empty, offset=0, limit=empty) == baseline

            # A real continuation must also tolerate an empty offset/limit.
            following = await delivered(ex, info, cursor=first["cursor"])
            assert await delivered(ex, info, cursor=first["cursor"],
                                   offset=empty, limit=empty) == following
            assert json.loads(following)["shown_intervals"][0][0] == 4000

        # A nonempty cursor owns the position even when a schema-filling caller
        # also supplies zero. Limits and authorization still apply.
        continuation = await ex.execute("manage_process", {
            "action": "poll", "pid": info.pid, "cursor": first["cursor"], "offset": 0,
        }, user_id="owner")
        assert continuation.ok, continuation.output
        assert continuation.output == following
        invalid = await ex.execute("manage_process", {
            "action": "poll", "pid": info.pid, "cursor": "", "offset": 0, "limit": 0,
        }, user_id="owner")
        assert not invalid.ok and "limit must be an integer" in invalid.output
        denied = await ex.execute("manage_process", {
            "action": "poll", "pid": info.pid, "cursor": "", "offset": 0, "limit": "",
        }, user_id="other")
        assert not denied.ok and "row-" not in denied.output


@pytest.mark.parametrize("remote", [False, True])
async def test_soak_poll_shape_real_cursor_with_zero_offset(tmp_path, remote):
    text = "".join(f"row-{i:04d} 世界\n" for i in range(1200))
    raw = text.encode()
    async with job(tmp_path, f"print({text!r}, end='')", remote) as (ex, reg, info):
        first = json.loads(await delivered(ex, info, cursor="", offset=0))
        assert first["shown_bytes"] == 4000 and first["truncated"]
        chunks = [first["text"]]
        previous = first
        while previous["truncated"]:
            request = {
                "action": "poll", "pid": info.pid, "cursor": previous["cursor"],
                "offset": 0, "limit": 4000, "host": "", "command": "",
                "input_text": "", "wait_seconds": 0,
            }
            result = await ex.execute("manage_process", request, user_id="owner")
            assert result.ok, result.output
            current = json.loads(result.output)
            start, end = current["shown_intervals"][0]
            assert start == previous["shown_intervals"][0][1]
            assert start < end <= len(raw)
            assert current["text"].encode() == raw[start:end]
            assert result.output == await delivered(ex, info, cursor=previous["cursor"])
            # Replay does not advance a shared position, locally or remotely.
            assert result.output == await reg.poll(info.pid, cursor=previous["cursor"], offset=0)
            denied = await ex.execute("manage_process", request, user_id="other")
            assert not denied.ok and "row-" not in denied.output
            chunks.append(current["text"])
            previous = current
        assert previous["cursor"] is None
        assert "".join(chunks).encode() == raw


@pytest.mark.parametrize("empty", EMPTY)
@pytest.mark.parametrize("action", ["write", "kill"])
async def test_empty_process_fields_do_not_change_mutation_or_authorization(
    tmp_path, monkeypatch, empty, action,
):
    ex = executor(tmp_path)
    stdin = SimpleNamespace(write=Mock(), drain=AsyncMock())
    process = SimpleNamespace(stdin=stdin, returncode=None)
    terminate = AsyncMock()
    monkeypatch.setattr("src.tools.ssh.terminate_process_tree", terminate)
    with execution_delivery_scope("owner", "mutation-fixture"):
        reg = ex._ensure_process_registry()
        from src.tools.output_authorization import host_binding

        info = ProcessInfo(
            101, "fixture", "testhost", time.time(), process=process,
            owner_id="owner", host_alias="testhost", origin_channel="mutation-fixture",
            host_binding=host_binding(ex.host_registry.get("testhost")),
        )
        reg._processes[info.pid] = info
        request = {
            "action": action, "pid": info.pid, "cursor": empty, "offset": empty,
            "limit": empty, "input_text": "hello\n", "wait_seconds": 0,
            "host": "", "command": "",
        }
        denied = await ex.execute("manage_process", request, user_id="other")
        assert not denied.ok and "access denied" in denied.output
        stdin.write.assert_not_called()
        terminate.assert_not_called()
        result = await ex.execute("manage_process", request, user_id="owner")
        assert result.ok, result.output
        if action == "write":
            assert result.output == "Wrote 6 bytes to PID 101."
            stdin.write.assert_called_once_with(b"hello\n")
            stdin.drain.assert_awaited_once()
            terminate.assert_not_called()
        else:
            assert result.output == "Process 101 killed."
            terminate.assert_awaited_once_with(process, grace=5.0)
            assert info.status == "killed"
            stdin.write.assert_not_called()


@pytest.mark.parametrize("empty", EMPTY)
def test_output_info_empty_cursor_resolves_current_pid_not_retired_generation(empty):
    reg = ProcessRegistry()
    old = ProcessInfo(101, "old", "localhost", time.time())
    current = ProcessInfo(101, "current", "localhost", time.time())
    reg._processes[101] = current
    reg._retained_generations[old.generation] = old
    assert reg.output_info(101, empty) is current
    assert reg.output_info(101, old.generation + ":0") is old
    assert reg.output_info(102, empty) is None


@pytest.mark.parametrize("field", ["cursor", "limit"])
@pytest.mark.parametrize("empty", EMPTY)
async def test_agent_empty_fields_through_native_dispatch(tmp_path, field, empty):
    manager = AgentManager()
    saver = AgentTrajectorySaver(str(tmp_path / "trajectories"))
    # Native dispatch over a stable completed snapshot, with real authorization.
    snapshot = {"id": "fixture", "label": "worker", "status": "completed",
                "result": "x" * 9000, "requester_id": "7", "channel_id": "42"}
    manager.get_results = lambda aid: snapshot if aid == "fixture" else None
    call = dispatcher(tmp_path, manager, saver)
    expected = await call("get_agent_results", {"agent_id": "fixture"})
    request = {"agent_id": "fixture", field: empty}
    actual = await call("get_agent_results", request)
    assert actual == expected
    page = json.loads(actual)
    assert page["offset"] == 0 and page["end"] == 4000
    assert page["preview"] == "x" * 4000 and page["truncated"]
    assert result_page(snapshot, **{field: empty}) == page
    assert "not found" in await call("get_agent_results", request, uid="other")


@pytest.mark.parametrize("empty", EMPTY)
async def test_tool_output_empty_limit_through_executor(tmp_path, empty):
    ex = executor(tmp_path)
    with execution_delivery_scope("owner", "output-fixture"):
        output = ex.deliver_output("x" * 30000, tool_name="run_command",
                                   tool_input={}, user_id="owner")
        cursor = json.loads(output)["cursor"]
        expected = await ex.execute("get_tool_output", {"cursor": cursor}, user_id="owner")
        assert expected.ok, expected.output
        actual = await ex.execute("get_tool_output", {"cursor": cursor, "limit": empty},
                                  user_id="owner")
        assert actual.ok, actual.output
        assert actual.output == expected.output
        page = json.loads(actual.output)
        assert page["end"] - page["start"] == 4000 and page["text"] == "x" * 4000
        denied = await ex.execute("get_tool_output", {"cursor": cursor, "limit": empty},
                                  user_id="other")
        assert not denied.ok and "xxxx" not in denied.output
