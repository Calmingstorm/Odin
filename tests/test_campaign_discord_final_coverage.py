"""Final wrap-up regressions for Discord delivery and suspended-turn safety."""

from __future__ import annotations

import io
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import discord
from src.discord.client import OdinBot
from src.discord.delivery import (
    ResponseDelivery,
    _fallback_files_after_reply_failure,
    _is_confirmed_invalid_reply_reference,
    _prepare_owned_file_fallbacks,
)
from src.discord.native_tools.scheduling import SchedulingTools
from src.discord.turn_resume import TurnResumeManager
from src.scheduler.scheduler import (
    ConnectionAvailability,
    ConnectionReason,
    ScheduleConnectionUnavailableError,
)


def _http_error(code: int, errors=None) -> discord.HTTPException:
    response = SimpleNamespace(status=400, reason="test", headers={})
    return discord.HTTPException(response, {"code": code, "message": "test", "errors": errors})


class _Message:
    def __init__(self, reply_error, send_error=None):
        self.reply_error = reply_error
        self.channel = SimpleNamespace(send=AsyncMock(side_effect=send_error))

    async def reply(self, *_args, **_kwargs):
        raise self.reply_error


def _delivery() -> ResponseDelivery:
    return ResponseDelivery(
        channel_state=SimpleNamespace(pending_files={}),
        change_presence=AsyncMock(),
    )


def test_invalid_reply_reference_recurses_through_lists_without_text_heuristics():
    error = _http_error(
        50035,
        {"message_reference": {"nested": [{"_errors": [{"code": "UNKNOWN_MESSAGE"}]}]}},
    )
    assert _is_confirmed_invalid_reply_reference(error)
    assert not _is_confirmed_invalid_reply_reference(_http_error(50035, {"content": {}}))


@pytest.mark.asyncio
@pytest.mark.parametrize("send_error", [_http_error(50013), ConnectionError("uncertain")])
async def test_invalid_reply_attachment_fallback_failure_never_retries_or_duplicates(send_error):
    delivery = _delivery()
    message = _Message(_http_error(10008), send_error)
    attachment = discord.File(io.BytesIO(b"proof"), filename="proof.txt")

    sent = await delivery.send_with_retry(message, "result", files=[attachment])

    assert sent is None
    assert message.channel.send.await_count == 1


@pytest.mark.asyncio
async def test_invalid_reply_without_a_safe_attachment_copy_refuses_incomplete_plain_send():
    delivery = _delivery()
    message = _Message(_http_error(10008))
    attachment = discord.File(io.StringIO("not a binary descriptor"), filename="unsafe.txt")

    sent = await delivery.send_with_retry(message, "result", files=[attachment])

    assert sent is None
    message.channel.send.assert_not_awaited()


@pytest.mark.asyncio
async def test_delivery_application_change_clears_staged_files_and_presence_work():
    bot = object.__new__(OdinBot)
    bot._connection = SimpleNamespace(application_id=222)
    bot._delivery_application_id = 111
    bot.channel_state = SimpleNamespace(pending_files={"channel": ["staged"]})
    bot.delivery = SimpleNamespace(active_tasks=4, set_status=AsyncMock())

    await bot._fence_delivery_application()

    assert bot.channel_state.pending_files == {}
    assert bot.delivery.active_tasks == 0
    bot.delivery.set_status.assert_awaited_once_with(None, task_end=True)


def test_resume_revision_and_session_append_fail_closed_without_session_support():
    manager = object.__new__(TurnResumeManager)
    manager._sessions = SimpleNamespace()
    assert manager._session_revision("c") == -1

    def broken_revision(_channel):
        raise RuntimeError()

    def broken_add(*_args):
        raise RuntimeError()

    manager._sessions = SimpleNamespace(mutation_revision=broken_revision)
    assert manager._session_revision("c") == -1
    manager._sessions = SimpleNamespace(add_message=broken_add)
    manager._append_session("c", "partial", True, ["run_command"])


@pytest.mark.asyncio
async def test_auto_resume_stands_down_for_unresolved_effects_before_claiming_channel():
    manager = object.__new__(TurnResumeManager)
    manager._channel_state = SimpleNamespace(channel_locks={})
    manager._unresolved_ops = lambda _row: [{"tool_name": "apply_patch"}]
    manager._validate_and_rebuild = AsyncMock()

    await manager._run_auto_resume(SimpleNamespace(channel_id="c"), {"operations": [{}]}, {0})

    manager._validate_and_rebuild.assert_not_awaited()


@pytest.mark.asyncio
async def test_application_startup_completes_services_despite_nonfatal_component_failures(
    monkeypatch,
):
    """Application startup records diagnostics but does not publish early on soft failures."""
    import src.discord.client as client_module

    bot = object.__new__(OdinBot)
    bot._application_start_lock = __import__("asyncio").Lock()
    bot._application_started = False
    bot._application_shutdown = False
    bot.loop = __import__("asyncio").get_running_loop()
    bot.config = SimpleNamespace()
    bot.audit_signer = object()
    bot.audit = SimpleNamespace(initialize_chain=AsyncMock(side_effect=RuntimeError("bad chain")))
    bot.usage_rollup = SimpleNamespace(start=AsyncMock(side_effect=RuntimeError("backfill failed")))
    bot.computer = SimpleNamespace(start=AsyncMock(side_effect=RuntimeError("desktop unavailable")))
    bot.load_extension = AsyncMock()
    report = SimpleNamespace(
        results=[
            SimpleNamespace(
                passed=False,
                name="config",
                detail="missing optional",
                recommendation="fix later",
            ),
            SimpleNamespace(passed=True, name="state", detail="ready", recommendation=None),
        ]
    )
    bot._run_startup_diagnostics = lambda *, yaml_config: report

    async def start_mcp_stub(received):
        assert received is bot

    monkeypatch.setattr(client_module, "INITIAL_EXTENSIONS", ("test.extension",))
    monkeypatch.setattr(client_module, "start_mcp", start_mcp_stub)

    await bot.start_application()

    assert bot.startup_report is report
    assert bot._application_started is True
    bot.load_extension.assert_awaited_once_with("test.extension")
    bot.audit.initialize_chain.assert_awaited_once()
    bot.usage_rollup.start.assert_awaited_once()
    bot.computer.start.assert_awaited_once()


@pytest.mark.asyncio
async def test_application_lifecycle_is_idempotent_and_terminal_shutdown_refuses_restart(
    monkeypatch,
):
    """A completed application is not initialized twice and terminal state is permanent."""
    bot = object.__new__(OdinBot)
    bot._application_start_lock = __import__("asyncio").Lock()
    bot._application_started = True
    bot._application_shutdown = False

    await bot.start_application()

    bot._application_started = False
    bot._application_shutdown = True
    with pytest.raises(RuntimeError, match="terminal shutdown"):
        await bot.start_application()


@pytest.mark.asyncio
async def test_setup_hook_delegates_to_application_start_and_close_only_closes_transport(
    monkeypatch,
):
    bot = object.__new__(OdinBot)
    bot.start_application = AsyncMock()
    close_transport = AsyncMock()
    monkeypatch.setattr(discord.Client, "close", close_transport)

    await bot.setup_hook()
    await bot.close()

    bot.start_application.assert_awaited_once()
    close_transport.assert_awaited_once_with(bot)


def test_attachment_fallback_cleanup_and_seek_failure_are_fail_closed(monkeypatch):
    """Fallback attachments are never sent when duplication or reset fails."""
    closed = []
    monkeypatch.setattr(
        "src.discord.delivery._close_generated_fallback_file",
        lambda file: closed.append(file),
    )

    class BrokenFile:
        filename = "unsafe.txt"
        spoiler = False
        description = None
        fp = SimpleNamespace(tell=lambda: 0, fileno=lambda: (_ for _ in ()).throw(OSError()))

    assert _prepare_owned_file_fallbacks([BrokenFile()]) is None
    assert closed == []

    def broken_seek(_position):
        raise OSError("stream lost")

    replacement = SimpleNamespace(fp=SimpleNamespace(seek=broken_seek))
    prepared = [(replacement, 0)]
    assert _fallback_files_after_reply_failure([object()], prepared) is None
    assert closed == [replacement]


@pytest.mark.asyncio
async def test_delivery_exhausts_definite_http_failures_without_claiming_a_send(monkeypatch):
    delivery = _delivery()
    message = _Message(_http_error(50000))
    monkeypatch.setattr("src.discord.delivery.asyncio.sleep", AsyncMock())

    assert await delivery.send_with_retry(message, "result") is None


@pytest.mark.asyncio
async def test_scheduling_connection_outage_is_reported_for_create_and_update():
    unavailable = ScheduleConnectionUnavailableError(
        ConnectionAvailability(False, ConnectionReason.DISCONNECTED, 1)
    )
    scheduler = SimpleNamespace(
        add=AsyncMock(side_effect=unavailable),
        update=AsyncMock(side_effect=unavailable),
    )
    tools = object.__new__(SchedulingTools)
    tools.scheduler = scheduler
    message = SimpleNamespace(author=SimpleNamespace(id=42), channel=SimpleNamespace(id=9))

    created = await tools._handle_schedule_task(
        message,
        {
            "description": "test",
            "run_at": "2030-01-01T00:00:00Z",
            "message": "remind me",
        },
    )
    updated = await tools._handle_update_schedule({"schedule_id": "task-1", "message": "later"})

    assert created == "Scheduling unavailable: disconnected"
    assert updated == "Scheduling unavailable: disconnected"
