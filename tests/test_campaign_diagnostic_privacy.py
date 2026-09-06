import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from src.audit.logger import AuditLogger
from src.llm.codex_auth import CodexAuth
from src.llm.kimi import KimiClient
from src.llm.ollama import OllamaClient
from src.observability.diagnostics import command_display, safe_error, safe_text, scrub_diagnostic
from src.tools.ssh import run_local_command


def synthetic_patterns():
    return [
        "password=" + "synthetic-password-value",
        '"refresh_token": "' + "synthetic-refresh-value-123456" + '"',
        "Authorization: Bearer " + "synthetic-bearer-value",
        "ghp_" + "X" * 36,
        "AKIA" + "X" * 16,
        "sk-" + "X" * 24,
        "xoxb-" + "1234-5678-synthetic",
        "-----BEGIN PRIVATE KEY-----\n" + "inert-body" + "\n-----END PRIVATE KEY-----",
    ]


@pytest.mark.parametrize("secret", synthetic_patterns())
def test_descriptor_is_bounded_structured_and_scrubbed(secret):
    description = safe_error(secret + "<>" * 10000)
    assert len(description) <= 700
    assert secret not in description
    assert "[REDACTED]" in description
    assert json.loads(description)["kind"] == "upstream_error"
    assert len(safe_error("\u0000" * 10000 + "非" * 10000)) <= 700


@pytest.mark.parametrize("client_type", [KimiClient, OllamaClient])
@pytest.mark.parametrize("status", [400, 500])
@pytest.mark.parametrize("secret", synthetic_patterns())
async def test_real_adapter_errors_never_expose_upstream_body(client_type, status, secret):
    client = (
        KimiClient("inert", model="fixture", max_retries=0)
        if client_type is KimiClient else OllamaClient(model="fixture", max_retries=0)
    )
    response = AsyncMock()
    response.status = status
    response.text.return_value = secret + "x" * 10000
    response.__aenter__.return_value = response
    session = SimpleNamespace(post=lambda *args, **kwargs: response)
    with patch.object(client, "_get_session", AsyncMock(return_value=session)):
        with pytest.raises(RuntimeError) as caught:
            await client._request_with_retry({"messages": []})
    assert secret not in str(caught.value)
    assert "[REDACTED]" in str(caught.value)
    assert len(str(caught.value)) < 1000
    assert json.loads(str(caught.value).split(": ", 1)[1])["kind"] == "upstream_error"


@pytest.mark.parametrize("secret", synthetic_patterns())
async def test_audit_independently_scrubs_nested_copies(tmp_path, secret):
    path = tmp_path / "audit.jsonl"
    audit = AuditLogger(str(path), hmac_key="fixture")
    original = {"nested": [{"refresh_token": "inert-secret", "payload": secret}],
                "command": "printf noncredential-command-body"}
    await audit.log_execution(
        user_id="owner", user_name="Owner", channel_id="fixture", tool_name="test",
        tool_input=original, approved=True, result_summary=secret, error=secret,
        execution_time_ms=1, audit_metadata={"nested": {"password": "inert-secret"}},
    )
    stored = path.read_text()
    assert secret not in stored
    assert "inert-secret" not in stored
    assert "noncredential-command-body" not in stored
    assert original["nested"][0]["refresh_token"] == "inert-secret"
    assert (await audit.verify_integrity())["valid"]


async def test_shell_execution_payload_unchanged_but_never_logged(caplog):
    caplog.set_level(logging.INFO)
    command = "printf 'synthetic-command-body'"
    proc = SimpleNamespace(
        pid=123, returncode=0,
        communicate=AsyncMock(return_value=(b"synthetic-command-body", None)),
    )
    with patch(
        "src.tools.ssh.asyncio.create_subprocess_shell", AsyncMock(return_value=proc),
    ) as run:
        code, output = await run_local_command(command)
    assert run.call_args.args[0] == command
    assert code == 0 and output == "synthetic-command-body"
    assert command not in caplog.text
    assert "synthetic-command-body" not in caplog.text
    assert command_display(command) in caplog.text


def test_structured_scrub_preserves_inert_values():
    original = {"ok": True, "number": 1, "none": None, "nested": ["healthy"]}
    assert scrub_diagnostic(original) == original
    assert scrub_diagnostic(original) is not original
    telemetry = {"input_tokens": 123, "output_tokens": 45, "total_tokens": 168,
                 "server_input_tokens": 130, "token_count": 12}
    assert scrub_diagnostic(telemetry) == telemetry
    assert scrub_diagnostic({"refreshToken": "inert", "inputTokens": 123}) == {
        "refreshToken": "[REDACTED]", "inputTokens": 123,
    }


@pytest.mark.parametrize("secret", synthetic_patterns())
async def test_codex_refresh_scrubs_log_but_preserves_request(tmp_path, caplog, secret):
    caplog.set_level(logging.ERROR)
    response = AsyncMock()
    response.status = 400
    response.read.return_value = secret.encode()
    response.__aenter__.return_value = response
    from unittest.mock import MagicMock

    session = MagicMock()
    session.__aenter__.return_value = session
    session.post.return_value = response
    with patch("src.llm.codex_auth.aiohttp.ClientSession", return_value=session):
        with pytest.raises(RuntimeError) as caught:
            await CodexAuth(str(tmp_path / "auth.json"))._refresh({"refresh_token": secret})
    assert session.post.call_args.kwargs["data"]["refresh_token"] == secret
    assert secret not in caplog.text and secret not in str(caught.value)
    assert "[REDACTED]" in caplog.text


@pytest.mark.parametrize("secret", synthetic_patterns())
async def test_process_api_scrubs_legacy_and_spoofed_commands_and_output(secret):
    from aiohttp import web

    from src.web.api.agents_loops import register_processes

    info = SimpleNamespace(
        command="<shell command: " + secret, host="fixture", status="running",
        exit_code=None, start_time=1, output_buffer=[secret + "\n"],
    )
    bot = SimpleNamespace(tool_executor=SimpleNamespace(
        _process_registry=SimpleNamespace(_processes={1: info}),
    ))
    routes = web.RouteTableDef()
    register_processes(routes, bot)
    route = next(r for r in routes if r.method == "GET")
    response = await route.handler(None)
    assert secret not in response.text
    assert json.loads(response.text)[0]["command"] == safe_text(info.command)
    assert info.output_buffer == [secret + "\n"]


async def test_audit_scrubs_before_structured_input_and_output_caps(tmp_path):
    path = tmp_path / "audit.jsonl"
    audit = AuditLogger(str(path), tool_input_cap=60, result_cap=75)
    secret = "nested-sensitive-value-" + "Z" * 200
    pem = "-----BEGIN " + "PRIVATE KEY-----\n" + secret + "\n-----END PRIVATE KEY-----"
    await audit.log_execution(
        user_id="owner", user_name="Owner", channel_id="fixture", tool_name="test",
        tool_input={"authorization": secret}, approved=True, result_summary=pem,
        execution_time_ms=1,
    )
    assert "nested-sensitive-value" not in path.read_text()


async def test_process_preview_scrubs_multiline_key_before_tail():
    from aiohttp import web

    from src.web.api.agents_loops import register_processes

    lines = ["-----BEGIN " + "PRIVATE KEY-----\n", "inert-first-body\n",
             "inert-second-body\n", "inert-third-body\n", "-----END PRIVATE KEY-----\n"]
    info = SimpleNamespace(command="<shell command: 12 bytes>", host="fixture",
                           status="running", exit_code=None, start_time=1,
                           output_buffer=lines)
    routes = web.RouteTableDef()
    register_processes(routes, SimpleNamespace(tool_executor=SimpleNamespace(
        _process_registry=SimpleNamespace(_processes={1: info}),
    )))
    response = await next(r for r in routes if r.method == "GET").handler(None)
    assert "inert-" not in response.text
    assert json.loads(response.text)[0]["command"] == info.command


@pytest.mark.parametrize("secret", synthetic_patterns())
async def test_reactive_codex_transport_failure_scrubbed(tmp_path, caplog, secret):
    caplog.set_level(logging.WARNING)
    auth = CodexAuth(str(tmp_path / "auth.json"))
    with patch.object(auth, "_load", return_value={"access_token": "inert"}), patch.object(
        auth, "_refresh", AsyncMock(side_effect=OSError(secret)),
    ):
        assert not await auth.force_refresh()
    assert secret not in caplog.text
    assert "[REDACTED]" in caplog.text


@pytest.mark.parametrize("action", ["poll", "write", "kill"])
@pytest.mark.parametrize("secret", synthetic_patterns())
async def test_remote_process_transport_descriptors_scrubbed(action, secret):
    from src.tools.process_manager import ProcessInfo, ProcessRegistry

    registry = ProcessRegistry(remote_exec=AsyncMock())
    info = ProcessInfo(pid=-1, command="fixture", host="fixture", start_time=0,
                       remote_lease=SimpleNamespace(run=AsyncMock(side_effect=OSError(secret))))
    with patch.object(registry, "_remote_controller_command", return_value="inert"), patch.object(
        registry, "_remote_call", AsyncMock(side_effect=OSError(secret)),
    ):
        if action == "poll":
            output = await registry._poll_remote(info, 0)
        elif action == "write":
            output = await registry._write_remote(info, "inert input")
        else:
            output = await registry._kill_remote(info)
    assert secret not in output
    assert "[REDACTED]" in output
    assert "outcome_unknown=true" in output
