"""Independent lifecycle review: leader evidence is not cleanup authority."""

import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.tools import process_manager as pm


class Lease:
    def __init__(self):
        self.target = SimpleNamespace(alias="fixture")
        self.released = False

    async def run(self, operation):
        return await operation()

    def release(self):
        self.released = True


async def test_unknown_remote_cleanup_keeps_authority_but_starts_output_retention(monkeypatch):
    registry = pm.ProcessRegistry()
    lease = Lease()
    record = pm.ProcessInfo(-1, "fixture", "fixture", 100, remote=True, remote_lease=lease)
    registry._processes[-1] = record
    registry._retained_generations[record.generation] = record
    output = b"legitimate output\n" * 500
    reply = {
        "ok": True, "status": "unknown", "unknown": True,
        "exit": {"exit_code": 0, "finished_at": 200, "empty": False,
                 "group_empty": True, "containment": "process_group_only"},
        "output": base64.b64encode(output).decode("ascii"),
        "start": 0, "cursor": len(output), "size": len(output), "emitted": len(output),
    }
    async def remote_reply(target, command, timeout):
        request = json.loads(command)
        offset = request["offset"]
        chunk = output[offset:offset + request["limit"]]
        return 0, json.dumps({
            **reply, "output": base64.b64encode(chunk).decode("ascii"),
            "start": offset, "cursor": offset + len(chunk),
        })

    registry._remote_exec = AsyncMock(side_effect=remote_reply)
    monkeypatch.setattr(registry, "_remote_controller_command",
                        lambda record, operation, payload, deadline: payload)
    scheduled = []
    monkeypatch.setattr(registry, "_schedule_output_expiry", scheduled.append)
    monkeypatch.setattr(pm.time, "time", lambda: 201)
    page = await registry._poll_remote(record, 0, offset=0, limit=pm.OUTPUT_PAGE_MAX)
    assert record.status == "unknown" and record.transport_unknown
    assert not record.session_confirmed_empty and not lease.released
    assert record.finished_at == 200
    assert scheduled == [record]
    assert "legitimate output" in page and json.loads(page)["status"] == "unknown"
    collected = ""
    while True:
        delivered = json.loads(page)
        collected += delivered["text"]
        if not delivered["truncated"]:
            break
        offset = int(delivered["cursor"].split(":")[1])
        page = await registry._poll_remote(record, 0, offset=offset, limit=pm.OUTPUT_PAGE_MAX)
    assert collected.encode("utf-8") == output
    assert scheduled == [record]

    # Expiring evidence must not imply unknown descendants were terminated.
    monkeypatch.setattr(pm.time, "time", lambda: 200 + pm.OUTPUT_RETENTION_SECONDS)
    assert "retention expired" in await registry._poll_remote(record, 0, offset=0)
    assert record.output_revoked and not lease.released
    assert not record.session_confirmed_empty


async def test_explicit_local_kill_retires_authority_only_on_owned_cleanup(monkeypatch):
    registry = pm.ProcessRegistry()
    lease = Lease()
    process = SimpleNamespace(pid=12345, returncode=0)
    record = pm.ProcessInfo(12345, "fixture", "localhost", 100,
                            process=process, host_lease=lease)
    registry._processes[record.pid] = record
    proven = False

    async def terminate(proc, **kwargs):
        pass

    async def confirm(info):
        return proven

    monkeypatch.setattr("src.tools.ssh.terminate_process_tree", terminate)
    monkeypatch.setattr(registry, "_kill_group_until_gone", confirm)
    monkeypatch.setattr(registry, "_schedule_output_expiry", lambda info: None)
    result = await registry.kill(record.pid)
    assert "outcome_unknown=true" in result
    assert record.status != "killed" and not lease.released
    assert not record.session_confirmed_empty
    proven = True
    assert await registry.kill(record.pid) == f"Process {record.pid} killed."
    assert record.session_confirmed_empty and lease.released
    assert record.host_lease is None and record.status == "killed"
