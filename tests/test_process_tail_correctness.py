"""Tail safety and truthful coordinates through actual capture and delivery guards."""
import asyncio
import json
import shlex
import sys
import time
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from src.discord.response_guards import truncate_tool_output
from src.llm.secret_scrubber import scrub_output_secrets
from src.tools.output_authorization import host_binding
from src.tools.process_manager import OUTPUT_CAPTURE_BYTES, ProcessInfo, ProcessRegistry
from src.tools.runtime_delivery import execution_delivery_scope
from tests.test_executor_output_retention import executor
from tests.test_remote_process_streaming import _remote_job


@pytest.fixture(autouse=True)
def no_background(monkeypatch):
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())


@asynccontextmanager
async def job(tmp_path, producer, remote):
    ex = executor(tmp_path)
    with execution_delivery_scope("owner", "tail-fixture"):
        if remote:
            root = tmp_path / "remote"
            root.mkdir()
            async with _remote_job(root, producer) as (reg, info, lease, supervisor):
                ex._process_registry = reg
                target = ex.host_registry.get("testhost")
                info.owner_id, info.origin_channel = "owner", "tail-fixture"
                info.host_alias, info.host_binding = "testhost", host_binding(target)
                reg._retained_generations[info.generation] = info
                await asyncio.wait_for(supervisor.wait(), 15)
                yield ex, reg, info
                assert info.remote_lease is None and info.output_lease is None
                assert lease.release_count == 1
        else:
            result = await ex.execute("manage_process", {
                "action": "start", "host": "testhost",
                "command": shlex.join([sys.executable, "-c", producer]),
            }, user_id="owner")
            assert result.ok, result.output
            reg = ex._ensure_process_registry()
            info = next(iter(reg._processes.values()))
            await reg.poll(info.pid, wait_seconds=10)
            try:
                yield ex, reg, info
            finally:
                reg._expire_output(info)


async def delivered(ex, info, **kwargs):
    result = await ex.execute("manage_process", {
        "action": "poll", "pid": info.pid, **kwargs,
    }, user_id="owner")
    assert result.ok, result.output
    assert len(result.output) <= 12000
    assert truncate_tool_output(result.output) == result.output
    assert scrub_output_secrets(result.output) == result.output
    return result.output


def preview(raw):
    display, metadata = raw.split("\n[output retention] ")
    return display.split("\n", 1)[1], json.loads(metadata)


@pytest.mark.parametrize("remote", [False, True])
async def test_overflow_secret_scrubbed_newest_tail_and_prefix_retrievable(tmp_path, remote):
    suffix = ('\n{"credentials":"' + "p" * 14000
              + '"}\n{"password":"INDEPENDENT_NESTED_SECRET"}\nNEWEST_SENTINEL\n')
    producer = f"import sys;sys.stdout.write('x'*{OUTPUT_CAPTURE_BYTES - 100}+{suffix!r})"
    async with job(tmp_path, producer, remote) as (ex, reg, info):
        raw = await delivered(ex, info)
        display, meta = preview(raw)
        assert "INDEPENDENT_NESTED_SECRET" not in raw
        assert "NEWEST_SENTINEL" in display
        assert "tail withheld" not in display
        assert meta["shown_intervals"] and meta["shown_bytes"] > 0
        assert meta["emitted_bytes"] == OUTPUT_CAPTURE_BYTES - 100 + len(suffix)
        assert meta["retained_bytes"] == OUTPUT_CAPTURE_BYTES
        assert meta["capture_limit_loss_bytes"] == meta["not_retained_bytes"] > 0
        assert meta["cursor"] == info.generation + ":0"
        first = json.loads(await delivered(ex, info, cursor=meta["cursor"]))
        assert first["text"] == "x" * first["shown_bytes"]
        assert first["shown_intervals"] == [[0, first["shown_bytes"]]]
        end_raw = await delivered(ex, info, offset=OUTPUT_CAPTURE_BYTES - 60)
        end = json.loads(end_raw)
        assert end["text"] == "*" * 60
        assert end["cursor"] is None
        assert await delivered(ex, info, offset=OUTPUT_CAPTURE_BYTES - 60) == end_raw
        # The generation cursor is still evidence, not authority.
        with execution_delivery_scope("owner", "other-channel"):
            denied = await ex.execute("manage_process", {
                "action": "poll", "pid": info.pid, "cursor": meta["cursor"],
            }, user_id="owner")
            assert not denied.ok


async def test_partial_quota_records_loss_and_uses_complete_memory_tail(tmp_path, monkeypatch):
    monkeypatch.setattr("src.tools.process_manager.OUTPUT_GLOBAL_QUOTA", 8)
    text = "OLDLINE\nNEWLINE\n"
    async with job(tmp_path, f"print({text!r}, end='')", False) as (ex, reg, info):
        assert info.total_output_bytes == 16 and info.retained_bytes == 8
        assert info.capture_error == "process retention quota exhausted"
        display, meta = preview(await delivered(ex, info))
        assert display == text
        assert meta["shown_intervals"] == [[0, 16]]
        assert meta["not_retained_bytes"] == 8 and meta["capture_limit_loss_bytes"] == 0
        assert meta["capture_error"] == "process retention quota exhausted"
        prefix = json.loads(await delivered(ex, info, cursor=meta["cursor"]))
        assert prefix["text"] == "OLDLINE\n" and prefix["shown_intervals"] == [[0, 8]]
        assert prefix["cursor"] is None
        # Fault injection: if the recent tail is lost, never relabel the prefix.
        info.output_tail = b""
        display, meta = preview(await delivered(ex, info))
        assert "recent output unavailable" in display and meta["shown_intervals"] == []
        assert meta["tail_status"] == "unavailable"


async def test_partial_quota_records_loss_before_eof(monkeypatch):
    monkeypatch.setattr("src.tools.process_manager.OUTPUT_GLOBAL_QUOTA", 8)
    stream = asyncio.StreamReader()
    stream.feed_data(b"OLDLINE\nNEWLINE\n")
    info = ProcessInfo(1, "fixture", "localhost", time.time(),
                       process=SimpleNamespace(stdout=stream))
    reg = ProcessRegistry()
    reg._retained_generations[info.generation] = info
    task = asyncio.create_task(reg._read_output(info))
    try:
        await asyncio.sleep(0)
        assert not task.done()
        assert info.retained_bytes == 8 and info.total_output_bytes == 16
        assert info.capture_error == "process retention quota exhausted"
    finally:
        stream.feed_eof()
        await task
        reg._expire_output(info)


async def test_remote_incomplete_spool_uses_complete_tail_or_withholds(tmp_path):
    text = "OLDLINE\nNEWLINE\n"
    async with job(tmp_path, f"print({text!r}, end='')", True) as (ex, reg, info):
        # Fault injection after REAL supervision: storage lost half its prefix.
        with open(tmp_path / "remote" / "out", "r+b") as spool:
            spool.truncate(8)
        display, meta = preview(await delivered(ex, info))
        assert display == text and meta["shown_intervals"] == [[0, 16]]
        assert meta["retained_bytes"] == 8 and meta["not_retained_bytes"] == 8
        assert meta["capture_error"] == "process output capture incomplete"
        prefix = json.loads(await delivered(ex, info, cursor=meta["cursor"]))
        assert prefix["text"] == "OLDLINE\n" and prefix["shown_intervals"] == [[0, 8]]
        # A missing full-memory fallback must not relabel OLDLINE as NEWLINE.
        (tmp_path / "remote" / "tail.json").unlink()
        display, meta = preview(await delivered(ex, info))
        assert "recent output unavailable" in display and meta["shown_intervals"] == []
        assert meta["tail_status"] == "unavailable"


@pytest.mark.parametrize("remote", [False, True])
async def test_full_capture_ordinary_default_still_newest_fifty(tmp_path, remote):
    text = "".join(f"ordinary-{i:03d}\n" for i in range(150))
    async with job(tmp_path, f"print({text!r}, end='')", remote) as (ex, reg, info):
        display, meta = preview(await delivered(ex, info))
        expected = "".join(text.splitlines(keepends=True)[-50:])
        assert display == expected
        assert meta["shown_intervals"] == [[len(text) - len(expected), len(text)]]
        assert meta["retained_bytes"] == meta["emitted_bytes"] == len(text)
        assert "tail_status" not in meta and meta["capture_error"] is None


@pytest.mark.parametrize("remote", [False, True])
async def test_full_capture_string_secret_masked_before_tail_slicing(tmp_path, remote):
    text = ('{"credentials": "' + "p" * 14000
            + 'nested-fixture"}\npublic\n')
    async with job(tmp_path, f"print({text!r}, end='')", remote) as (ex, reg, info):
        display, meta = preview(await delivered(ex, info))
        assert "nested-fixture" not in display and display.endswith("\npublic\n")
        assert "tail_status" not in meta
        assert meta["retained_bytes"] == meta["emitted_bytes"] == len(text)
