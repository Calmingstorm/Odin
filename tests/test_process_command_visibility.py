"""Commands remain available internally; operator copies scrub before truncation."""

import asyncio
import base64
import json
import shlex
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web

from src.observability.diagnostics import safe_text
from src.tools.process_manager import ProcessRegistry
from src.web.api.agents_loops import register_processes
from tests.test_campaign_diagnostic_privacy import synthetic_patterns
from tests.test_remote_processes import _Lease


@pytest.mark.parametrize("secret", synthetic_patterns())
@pytest.mark.parametrize("remote", [False, True])
async def test_real_registry_retains_command_but_scrubs_every_operator_copy(
    monkeypatch, caplog, secret, remote,
):
    caplog.set_level("INFO")
    command = "printf ready; " + secret
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    dispatched = []

    async def remote_exec(target, script, timeout):
        args = shlex.split(script.split("nohup python3 ", 1)[1].split(" </dev/null", 1)[0])
        dispatched.append(base64.b64decode(args[3]).decode())
        return 0, json.dumps({"token": args[2], "pid": 101, "pgid": 101,
                              "sid": 99, "start_id": "77"})

    registry = ProcessRegistry(remote_exec=remote_exec)
    if remote:
        result = await registry.start_remote(_Lease(), command)
        info = registry._processes[-1]
        assert dispatched == [command]
    else:
        proc = SimpleNamespace(pid=12345)
        spawn = AsyncMock(return_value=proc)
        monkeypatch.setattr("src.tools.process_manager.asyncio.create_subprocess_shell", spawn)
        monkeypatch.setattr(registry, "_read_output", AsyncMock())
        monkeypatch.setattr(registry, "_watch_exit", AsyncMock())
        result = await registry.start("localhost", command)
        info = registry._processes[12345]
        await asyncio.gather(info._reader_task, info._exit_task)
        assert spawn.call_args.args[0] == command
    assert info.command == command
    assert safe_text(command) in result
    assert secret not in result
    listing = registry.list_all()
    assert "printf ready" in listing
    assert secret not in listing
    assert secret not in caplog.text
    assert "printf ready" not in caplog.text
    routes = web.RouteTableDef()
    register_processes(routes, SimpleNamespace(tool_executor=SimpleNamespace(
        _process_registry=registry,
    )))
    response = await next(r for r in routes if r.method == "GET").handler(None)
    assert json.loads(response.text)[0]["command"] == safe_text(command)
    assert secret not in response.text
    assert info.command == command
