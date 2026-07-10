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
import signal
import sys
from unittest.mock import patch

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
        # Early startup failures (e.g. port bind) must exit 1 after a clean
        # shutdown — historically they tracebacked out of main() with no
        # cleanup at all.
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


class _SlowStopHealthServer(_FakeHealthServer):
    """stop() actually suspends — the shape that exposed the barrier bug:
    bot.close() unblocks bot.start(), run() used to return immediately, and
    loop.close() destroyed this still-pending stop ("Task was destroyed but
    it is pending")."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.stop_calls = 0

    async def stop(self):
        self.stop_calls += 1
        await asyncio.sleep(0.05)
        self.stopped = True


class _SignalingBot(_FakeBot):
    """Parks in start() until close(), firing the captured SIGTERM handler
    once running — the live service's shutdown shape."""

    captured: dict = {}
    signal_count = 1
    close_calls = 0
    straggler: asyncio.Task | None = None
    spawn_straggler = False

    def __init__(self, config):
        super().__init__(config)
        self._done: asyncio.Event | None = None

    async def start(self, token):
        self._done = asyncio.Event()
        loop = asyncio.get_running_loop()
        if type(self).spawn_straggler:
            type(self).straggler = loop.create_task(asyncio.sleep(30))
        handler = type(self).captured[signal.SIGTERM]
        for _ in range(type(self).signal_count):
            loop.call_soon(handler)
        await self._done.wait()

    async def close(self):
        type(self).close_calls += 1
        self.closed = True
        if self._done is not None:
            self._done.set()


@pytest.fixture
def signal_entry_point(monkeypatch, tmp_path):
    """entry_point variant with a signal-drivable bot, a slow-stopping
    health server, and a loop whose add_signal_handler records callbacks
    instead of touching process signal state."""
    import src.config
    import src.discord.client
    import src.health

    cfg_path = tmp_path / "config.yml"
    cfg_path.write_text("# contents irrelevant; load_config is faked\n")

    from src.config.schema import Config

    _FakeBot.instances = []
    _FakeBot.start_error = None
    _FakeHealthServer.instances = []
    _SignalingBot.captured = {}
    _SignalingBot.signal_count = 1
    _SignalingBot.close_calls = 0
    _SignalingBot.straggler = None
    _SignalingBot.spawn_straggler = False

    loop = asyncio.new_event_loop()

    def _capture_signal_handler(sig, cb, *args):
        _SignalingBot.captured[sig] = cb

    loop.add_signal_handler = _capture_signal_handler  # type: ignore[method-assign]
    monkeypatch.setattr(asyncio, "new_event_loop", lambda: loop)

    monkeypatch.setattr(
        src.config, "load_config", lambda path: Config(discord={"token": "fake-token"})
    )
    monkeypatch.setattr(src.discord.client, "OdinBot", _SignalingBot)
    monkeypatch.setattr(src.health, "HealthServer", _SlowStopHealthServer)
    monkeypatch.setattr(sys, "argv", ["odin", str(cfg_path)])

    from src.__main__ import main

    yield main
    if not loop.is_closed():
        loop.close()


class TestShutdownBarrierAndInPlaceRestart:
    """Design-review blockers for the in-place restart (2026-07-10): the old
    orchestration let loop.close() cut off the shutdown task mid-cleanup,
    duplicate signals started duplicate teardowns, and exec must happen only
    after genuine quiescence — failing to a NONZERO exit, never a clean one.

    SAFETY: os.execve is stubbed everywhere; a real exec would replace the
    test runner."""

    def test_signal_shutdown_completes_cleanup_before_returning(self, signal_entry_point):
        # THE barrier: health.stop() suspends mid-teardown; main() must not
        # return (nor close the loop) until it actually finished.
        assert signal_entry_point() is None
        assert _FakeHealthServer.instances[0].stopped is True
        assert _FakeBot.instances[0].closed is True

    def test_second_signal_does_not_start_second_teardown(self, signal_entry_point):
        _SignalingBot.signal_count = 3
        assert signal_entry_point() is None
        assert _FakeHealthServer.instances[0].stop_calls == 1
        assert _SignalingBot.close_calls == 1

    def test_straggler_tasks_are_drained_before_close(self, signal_entry_point):
        _SignalingBot.spawn_straggler = True
        assert signal_entry_point() is None
        straggler = _SignalingBot.straggler
        assert straggler is not None and straggler.cancelled()

    def test_exec_runs_only_after_cleanup_with_reconstructed_env(
        self, signal_entry_point, monkeypatch
    ):
        from src import restart

        monkeypatch.setenv("DISCORD_TOKEN", "stale")
        restart.request_restart(env_overrides={"DISCORD_TOKEN": "fresh"})
        seen: dict = {}

        def _fake_execve(path, argv, env):
            seen["health_stopped"] = _FakeHealthServer.instances[0].stopped
            seen["path"], seen["argv"], seen["env"] = path, argv, env

        with patch("os.execve", side_effect=_fake_execve) as execve:
            assert signal_entry_point() is None
        execve.assert_called_once()
        assert seen["health_stopped"] is True  # quiescence before exec
        assert seen["path"] == sys.executable
        assert seen["argv"][:3] == [sys.executable, "-m", "src"]
        assert seen["env"]["DISCORD_TOKEN"] == "fresh"  # wizard override wins

    def test_exec_failure_exits_nonzero_even_after_clean_shutdown(
        self, signal_entry_point
    ):
        # A clean-exit fallback would recreate the exact stranding this PR
        # removes; a nonzero exit gives Restart=on-failure its chance.
        from src import restart

        restart.request_restart()
        with patch("os.execve", side_effect=OSError("interpreter gone")):
            with pytest.raises(SystemExit) as excinfo:
                signal_entry_point()
        assert excinfo.value.code == 1

    def test_no_restart_request_means_no_exec(self, signal_entry_point):
        with patch("os.execve") as execve:
            assert signal_entry_point() is None
        execve.assert_not_called()
