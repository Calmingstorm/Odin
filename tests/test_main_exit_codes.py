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


class TestFinalizeLoop:
    """PR #244 round-15 §3.3 steps 2–6: the owner barrier (loop tasks,
    async generators, default executor) must complete BEFORE the final
    zombie drain, and any unproven step VETOES the in-place re-exec."""

    @staticmethod
    def _spawn_orphan_zombie(loop, tmp_path) -> int:
        """A real, unobserved adopted zombie of THIS process (containment
        is enabled suite-wide in conftest)."""
        import os
        import time

        pidfile = tmp_path / "orphan.pid"
        script = tmp_path / "orphan.py"
        script.write_text(
            "import os, sys\n"
            "if os.fork() == 0:\n"
            f"    with open({str(pidfile)!r}, 'w') as fh:\n"
            "        fh.write(str(os.getpid()))\n"
            "    os._exit(0)\n"
            "sys.exit(0)\n"
        )

        async def spawn():
            proc = await asyncio.create_subprocess_exec(
                sys.executable, str(script),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
            for _ in range(200):
                text = pidfile.read_text().strip() if pidfile.exists() else ""
                if text:
                    return int(text)
                await asyncio.sleep(0.02)
            raise AssertionError("orphan never reported its pid")

        orphan = loop.run_until_complete(spawn())
        for _ in range(200):
            try:
                raw = open(f"/proc/{orphan}/stat", "rb").read()
                rest = raw.rsplit(b")", 1)[1].split()
                if rest[0] == b"Z" and int(rest[1]) == os.getpid():
                    return orphan
            except (OSError, IndexError, ValueError):
                pass
            time.sleep(0.02)
        raise AssertionError("orphan never became our zombie")

    def test_drain_runs_after_executor_and_consumes_unobserved_zombie(
        self, tmp_path
    ):
        import logging
        import os

        import src.tools.process_manager as pm
        from src import restart
        from src.__main__ import _finalize_loop

        loop = asyncio.new_event_loop()
        orphan = self._spawn_orphan_zombie(loop, tmp_path)
        reaper = pm.AdoptedZombieReaper()
        order: list = []
        real_exec_shutdown = loop.shutdown_default_executor

        async def traced_executor():
            order.append("executor")
            await real_exec_shutdown()

        loop.shutdown_default_executor = traced_executor  # type: ignore[method-assign]
        real_drain = reaper.drain_at_teardown

        def traced_drain():
            order.append("drain")
            return real_drain()

        reaper.drain_at_teardown = traced_drain  # type: ignore[method-assign]
        assert _finalize_loop(loop, reaper, logging.getLogger("test")) is None
        assert order == ["executor", "drain"]  # owners stop, THEN drain
        assert loop.is_closed()
        assert restart.reexec_blocked() is None  # verified drain ⇒ no veto
        assert not os.path.exists(f"/proc/{orphan}")  # consumed at teardown

    def test_unverified_drain_blocks_reexec(self):
        import logging

        import src.tools.process_manager as pm
        from src import restart
        from src.__main__ import _finalize_loop

        loop = asyncio.new_event_loop()
        reaper = pm.AdoptedZombieReaper()
        reaper.drain_at_teardown = lambda: (0, False)  # type: ignore[method-assign]
        _finalize_loop(loop, reaper, logging.getLogger("test"))
        veto = restart.reexec_blocked()
        assert veto is not None and "verify" in veto
        assert loop.is_closed()

    def test_drain_exception_blocks_reexec(self):
        import logging

        import src.tools.process_manager as pm
        from src import restart
        from src.__main__ import _finalize_loop

        loop = asyncio.new_event_loop()
        reaper = pm.AdoptedZombieReaper()

        def explode():
            raise RuntimeError("drain exploded")

        reaper.drain_at_teardown = explode  # type: ignore[method-assign]
        _finalize_loop(loop, reaper, logging.getLogger("test"))
        veto = restart.reexec_blocked()
        assert veto is not None and "failed" in veto
        assert loop.is_closed()

    def test_cancellation_resistant_task_cannot_hold_teardown(self):
        """Round-16 #2: a task that swallows CancelledError must not make
        the final drain and the re-exec veto UNREACHABLE. The barrier is
        bounded; the unproven owners veto re-exec instead."""
        import logging
        import time

        import src.tools.process_manager as pm
        from src import restart
        from src.__main__ import _finalize_loop

        loop = asyncio.new_event_loop()

        async def stubborn():
            while True:
                try:
                    await asyncio.sleep(3600)
                except asyncio.CancelledError:
                    continue  # refuses to die

        async def arm():
            loop.create_task(stubborn())

        loop.run_until_complete(arm())
        reaper = pm.AdoptedZombieReaper()
        drained: list = []
        reaper.drain_at_teardown = (  # type: ignore[method-assign]
            lambda: drained.append(True) or (0, True)
        )
        start = time.monotonic()
        failure = _finalize_loop(loop, reaper, logging.getLogger("test"))
        assert time.monotonic() - start < 5.0  # Odin's probe bound
        assert failure is not None and "survived cancellation" in failure
        assert drained == []  # owners unproven ⇒ drain skipped
        # The unproven path has NO side effects: the veto travels with
        # the emergency scribe, and the loop is left alone (round-19 —
        # close() warnings go through logging).
        assert restart.reexec_blocked() is None
        assert not loop.is_closed()
        loop.close()

    def test_hung_asyncgen_shutdown_is_bounded_and_vetoes(self):
        import logging
        import time

        import src.tools.process_manager as pm
        from src import restart
        from src.__main__ import _finalize_loop

        loop = asyncio.new_event_loop()

        async def never():
            await asyncio.Event().wait()

        loop.shutdown_asyncgens = never  # type: ignore[method-assign]
        reaper = pm.AdoptedZombieReaper()
        drained: list = []
        reaper.drain_at_teardown = (  # type: ignore[method-assign]
            lambda: drained.append(True) or (0, True)
        )
        start = time.monotonic()
        failure = _finalize_loop(loop, reaper, logging.getLogger("test"))
        assert time.monotonic() - start < 5.0
        assert failure is not None and "async-generator" in failure
        assert drained == []
        assert restart.reexec_blocked() is None
        assert not loop.is_closed()
        loop.close()

    def test_hung_executor_shutdown_is_bounded_and_vetoes(self):
        import logging
        import time

        import src.tools.process_manager as pm
        from src import restart
        from src.__main__ import _finalize_loop

        loop = asyncio.new_event_loop()

        async def never():
            await asyncio.Event().wait()

        loop.shutdown_default_executor = never  # type: ignore[method-assign]
        reaper = pm.AdoptedZombieReaper()
        drained: list = []
        reaper.drain_at_teardown = (  # type: ignore[method-assign]
            lambda: drained.append(True) or (0, True)
        )
        start = time.monotonic()
        failure = _finalize_loop(loop, reaper, logging.getLogger("test"))
        assert time.monotonic() - start < 5.0
        assert failure is not None and "default-executor" in failure
        assert drained == []
        assert restart.reexec_blocked() is None
        assert not loop.is_closed()
        loop.close()

    def test_failed_owner_barrier_skips_drain_and_blocks(self):
        """If subprocess owners cannot be proven stopped, running the
        drain could steal a status a live owner still awaits — it must
        be SKIPPED, and the re-exec vetoed."""
        import logging

        import src.tools.process_manager as pm
        from src import restart
        from src.__main__ import _finalize_loop

        loop = asyncio.new_event_loop()
        reaper = pm.AdoptedZombieReaper()

        async def broken():
            raise RuntimeError("executor wedged")

        loop.shutdown_default_executor = broken  # type: ignore[method-assign]
        drained: list = []
        reaper.drain_at_teardown = (  # type: ignore[method-assign]
            lambda: drained.append(True) or (0, True)
        )
        failure = _finalize_loop(loop, reaper, logging.getLogger("test"))
        assert failure is not None and "default-executor" in failure
        assert drained == []  # never ran on unproven owners
        assert restart.reexec_blocked() is None
        assert not loop.is_closed()
        loop.close()


class TestUncleanBarrierExit:
    """Round-17: a blocked default-executor worker is a NON-DAEMON
    thread. The bounded barrier returns and vetoes, but ordinary
    interpreter shutdown then joins that thread forever — the exit must
    not rely on Python shutdown."""

    _SINKS = {
        "healthy": "",
        "raising_log": (
            "class RaisingHandler(logging.Handler):\n"
            "    def emit(self, record):\n"
            "        raise OSError('forced handler failure')\n"
            "logging.getLogger().addHandler(RaisingHandler())\n"
        ),
        "blocking_log": (
            "class BlockingHandler(logging.Handler):\n"
            "    def emit(self, record):\n"
            "        print('BLOCKING_LOG_EMIT', file=sys.__stderr__, flush=True)\n"
            "        threading.Event().wait()\n"
            "logging.getLogger().addHandler(BlockingHandler())\n"
        ),
        "raising": (
            "class BrokenOut:\n"
            "    def write(self, *_a):\n"
            "        return 0\n"
            "    def flush(self):\n"
            "        raise OSError('forced stdout flush failure')\n"
            "sys.stdout = BrokenOut()\n"
        ),
        "blocking": (
            "class BlockedOut:\n"
            "    def write(self, *_a):\n"
            "        return 0\n"
            "    def flush(self):\n"
            "        threading.Event().wait()\n"
            "sys.stdout = BlockedOut()\n"
        ),
    }

    @pytest.mark.parametrize(
        "sink", ["healthy", "raising", "blocking", "raising_log", "blocking_log"]
    )
    def test_blocked_executor_worker_cannot_hold_process_exit(
        self, tmp_path, sink
    ):
        """Process-level, real blocked worker (Odin's round-17 repro
        shape): the process must actually EXIT nonzero, promptly — even
        when the output sink itself RAISES or BLOCKS (round-18: a
        raising stdout.flush unwound into ordinary interpreter shutdown
        and hung; a blocking sink never returned at all)."""
        import subprocess
        import time
        from pathlib import Path

        repo_root = Path(__file__).resolve().parents[1]
        script = tmp_path / f"blocked_worker_{sink}.py"
        script.write_text(
            "import asyncio\n"
            "import logging\n"
            "import sys\n"
            "import threading\n"
            "\n"
            "logging.basicConfig(level=logging.INFO)\n"
            "from src.__main__ import _finalize_and_exit\n"
            "from src.tools.process_manager import AdoptedZombieReaper\n"
            "\n"
            "loop = asyncio.new_event_loop()\n"
            "\n"
            "def blocked():\n"
            "    threading.Event().wait()  # a worker that never returns\n"
            "\n"
            "async def arm():\n"
            "    loop.run_in_executor(None, blocked)\n"
            "    await asyncio.sleep(0.2)  # let the worker actually start\n"
            "\n"
            "loop.run_until_complete(arm())\n"
            "print('FINALIZE_ENTER', file=sys.stderr, flush=True)\n"
            + self._SINKS[sink]
            + "_finalize_and_exit(\n"
            "    loop, AdoptedZombieReaper(), logging.getLogger('repro'), 0\n"
            ")\n"
            "print('UNREACHABLE', file=sys.stderr, flush=True)\n"
        )
        start = time.monotonic()
        proc = subprocess.run(
            [sys.executable, str(script)],
            cwd=repo_root,
            capture_output=True,
            timeout=15,  # a regression hangs here and fails loudly
        )
        elapsed = time.monotonic() - start
        assert proc.returncode == 1  # exit_code 0 promoted: unclean = failure
        assert elapsed < 10.0  # bounded barrier + bounded last words
        assert b"FINALIZE_ENTER" in proc.stderr
        assert b"UNREACHABLE" not in proc.stderr  # os._exit, not a return
        assert b"default-executor shutdown did not finish" in proc.stderr

    def test_unclean_barrier_uses_immediate_exit(self, monkeypatch):
        """In-process arm coverage: unproven owners → os._exit with a
        promoted nonzero code; a clean barrier returns normally."""
        import logging

        import src.__main__ as entry
        import src.tools.process_manager as pm
        from src import restart

        calls: list = []
        monkeypatch.setattr(entry.os, "_exit", lambda code: calls.append(code))
        monkeypatch.setattr(entry, "_finalize_loop", lambda *_a: "boom reason")
        loop = asyncio.new_event_loop()
        entry._finalize_and_exit(
            loop, pm.AdoptedZombieReaper(), logging.getLogger("t"), 0
        )
        assert calls == [1]
        # The veto is recorded by the emergency scribe, reason included.
        veto = restart.reexec_blocked()
        assert veto is not None and "boom reason" in veto and "owners" in veto
        entry._finalize_and_exit(
            loop, pm.AdoptedZombieReaper(), logging.getLogger("t"), 7
        )
        assert calls == [1, 7]

        monkeypatch.setattr(entry, "_finalize_loop", lambda *_a: None)
        entry._finalize_and_exit(
            loop, pm.AdoptedZombieReaper(), logging.getLogger("t"), 0
        )
        assert calls == [1, 7]  # clean barrier: no immediate exit
        loop.close()

    def test_unproven_verdict_path_never_logs(self):
        """Round-19 core: between the unproven verdict and the return
        there is NO synchronous I/O — a blocking logging handler must
        not be able to hang the main thread before the emergency exit
        is reachable."""
        import logging
        import threading
        import time

        import src.tools.process_manager as pm
        from src.__main__ import _finalize_loop

        class BlockingHandler(logging.Handler):
            def emit(self, record):
                threading.Event().wait()

        poisoned = logging.getLogger("test-poisoned-finalize")
        poisoned.propagate = False
        poisoned.addHandler(BlockingHandler())
        try:
            loop = asyncio.new_event_loop()

            async def stubborn():
                while True:
                    try:
                        await asyncio.sleep(3600)
                    except asyncio.CancelledError:
                        continue

            async def arm():
                loop.create_task(stubborn())

            loop.run_until_complete(arm())
            start = time.monotonic()
            failure = _finalize_loop(loop, pm.AdoptedZombieReaper(), poisoned)
            assert time.monotonic() - start < 5.0  # never touched the logger
            assert failure is not None and "survived cancellation" in failure
            loop.close()
        finally:
            poisoned.handlers.clear()

    def test_finalize_crash_still_exits_immediately(self, monkeypatch):
        """Nothing may escape _finalize_and_exit into ordinary
        interpreter shutdown — even finalize itself crashing becomes an
        unproven verdict and an immediate exit."""
        import logging

        import src.__main__ as entry
        import src.tools.process_manager as pm
        from src import restart

        calls: list = []
        monkeypatch.setattr(entry.os, "_exit", lambda code: calls.append(code))

        def crash(*_a):
            raise RuntimeError("finalize blew up")

        monkeypatch.setattr(entry, "_finalize_loop", crash)
        loop = asyncio.new_event_loop()
        entry._finalize_and_exit(
            loop, pm.AdoptedZombieReaper(), logging.getLogger("t"), 0
        )
        assert calls == [1]
        veto = restart.reexec_blocked()
        assert veto is not None and "finalize crashed" in veto
        loop.close()

    def test_emergency_exit_survives_raising_and_blocked_sinks(
        self, monkeypatch
    ):
        """The exit depends on NOTHING: a raising stdout is swallowed by
        the scribe thread; a blocking one is abandoned at the bounded
        join. os._exit runs either way."""
        import logging
        import threading
        import time

        import src.__main__ as entry

        calls: list = []
        monkeypatch.setattr(entry.os, "_exit", lambda code: calls.append(code))

        class Raising:
            def write(self, *_a):
                return 0

            def flush(self):
                raise OSError("flush refused")

        monkeypatch.setattr(entry.sys, "stdout", Raising())
        entry._emergency_exit(logging.getLogger("t"), 0, "test reason")
        assert calls == [1]

        class Blocking:
            def write(self, *_a):
                return 0

            def flush(self):
                threading.Event().wait()

        monkeypatch.setattr(entry.sys, "stdout", Blocking())
        start = time.monotonic()
        entry._emergency_exit(logging.getLogger("t"), 5, "test reason")
        assert calls == [1, 5]
        assert time.monotonic() - start < 3.0  # bounded by the scribe join


class TestVetoedReexec:
    def test_vetoed_reexec_exits_nonzero_instead_of_exec(self, signal_entry_point):
        """§3.6 pin: a failed final proof blocks execve — the process
        exits nonzero so the supervisor starts a clean image and PID 1
        inherits whatever survived."""
        from src import restart

        restart.request_restart()
        restart.block_reexec("unproven teardown (test)")
        with patch("os.execve") as execve:
            with pytest.raises(SystemExit) as excinfo:
                signal_entry_point()
        execve.assert_not_called()
        assert excinfo.value.code == 1
