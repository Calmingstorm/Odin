"""Exit-code behavior of the ``python -m src`` entry point.

Fatal startup errors must exit nonzero so process supervisors (systemd
``Restart=on-failure``, monitoring) can distinguish a crash from a clean
stop. Historically every fatal path exited 0 — the live service only
recovered because the unit uses ``Restart=always``.

These tests drive the real ``main()`` control flow with the heavy
collaborators (OdinBot, HealthServer, load_config) replaced by fakes:
``main()`` imports them inside the function body, so monkeypatching the
source module attributes is enough.
"""
from __future__ import annotations

import asyncio
import sys

import pytest


class _FakeMetrics:
    def register_source(self, name, fn):
        pass


class _FakeHealthServer:
    """Stands in for src.health.HealthServer; records lifecycle calls."""

    instances: list[_FakeHealthServer] = []

    def __init__(self, *args, **kwargs):
        self.metrics = _FakeMetrics()
        self.started = False
        self.stopped = False
        self.fail_start: Exception | None = None
        _FakeHealthServer.instances.append(self)

    async def start(self):
        if self.fail_start is not None:
            raise self.fail_start
        self.started = True

    async def stop(self):
        self.stopped = True

    def set_bot(self, bot):
        pass

    def set_send_message(self, cb):
        pass

    def set_trigger_callback(self, cb):
        pass

    def set_ready(self, value):
        pass

    def register_component(self, name, fn):
        pass


class _FakeBot:
    """Stands in for OdinBot; ``start_error`` drives the scenario."""

    instances: list[_FakeBot] = []
    start_error: BaseException | None = None

    def __init__(self, config):
        self.config = config
        self.closed = False
        self.sessions = None
        _FakeBot.instances.append(self)

    @property
    def latency(self):
        return 0.0

    def is_ready(self):
        return False

    def get_channel(self, channel_id):
        return None

    async def start(self, token):
        if type(self).start_error is not None:
            raise type(self).start_error

    async def close(self):
        self.closed = True


@pytest.fixture
def entry_point(monkeypatch, tmp_path):
    """Wire main() to the fakes and return a callable that runs it."""
    import src.config
    import src.discord.client
    import src.health

    cfg_path = tmp_path / "config.yml"
    cfg_path.write_text("# contents irrelevant; load_config is faked\n")

    from src.config.schema import Config

    _FakeBot.instances = []
    _FakeBot.start_error = None
    _FakeHealthServer.instances = []

    monkeypatch.setattr(
        src.config, "load_config", lambda path: Config(discord={"token": "fake-token"})
    )
    monkeypatch.setattr(src.discord.client, "OdinBot", _FakeBot)
    monkeypatch.setattr(src.health, "HealthServer", _FakeHealthServer)
    monkeypatch.setattr(sys, "argv", ["odin", str(cfg_path)])

    from src.__main__ import main

    return main


class TestFatalStartupExitsNonzero:
    def test_bot_start_failure_exits_1(self, entry_point):
        # The historical bug: bad token / boot-time DNS failure exited 0.
        _FakeBot.start_error = RuntimeError("Temporary failure in name resolution")
        with pytest.raises(SystemExit) as excinfo:
            entry_point()
        assert excinfo.value.code == 1

    def test_bot_start_failure_still_cleans_up(self, entry_point):
        _FakeBot.start_error = RuntimeError("boom")
        with pytest.raises(SystemExit):
            entry_point()
        assert _FakeBot.instances[0].closed is True
        assert _FakeHealthServer.instances[0].stopped is True

    def test_health_start_failure_exits_1_with_cleanup(self, entry_point, monkeypatch):
        # Failures BEFORE run()'s own try block (e.g. port bind) previously
        # tracebacked out of main() with no clean shutdown at all.
        def _fail_health_init(*args, **kwargs):
            server = _FakeHealthServer()
            server.fail_start = OSError(98, "address already in use")
            return server

        import src.health

        monkeypatch.setattr(src.health, "HealthServer", _fail_health_init)
        with pytest.raises(SystemExit) as excinfo:
            entry_point()
        assert excinfo.value.code == 1
        assert _FakeBot.instances[0].closed is True

    def test_intentional_systemexit_code_preserved(self, entry_point):
        # An explicit SystemExit(3) must not be normalized to 1.
        _FakeBot.start_error = SystemExit(3)
        with pytest.raises(SystemExit) as excinfo:
            entry_point()
        assert excinfo.value.code == 3


class TestCleanStopsExitZero:
    def test_clean_return_does_not_exit(self, entry_point):
        # bot.start() returning (close-triggered) is a clean stop: main()
        # returns normally instead of raising SystemExit.
        assert entry_point() is None

    def test_keyboard_interrupt_is_clean(self, entry_point):
        _FakeBot.start_error = KeyboardInterrupt()
        assert entry_point() is None
        assert _FakeBot.instances[0].closed is True

    def test_cancelled_error_is_clean(self, entry_point):
        # CancelledError is BaseException, so run()'s `except Exception`
        # doesn't turn it fatal — top-level cancellation is a shutdown path.
        _FakeBot.start_error = asyncio.CancelledError()
        assert entry_point() is None
        assert _FakeBot.instances[0].closed is True


class TestMissingConfig:
    def test_missing_config_exits_1(self, monkeypatch, tmp_path):
        monkeypatch.setattr(sys, "argv", ["odin", str(tmp_path / "nope.yml")])
        from src.__main__ import main

        with pytest.raises(SystemExit) as excinfo:
            main()
        assert excinfo.value.code == 1
