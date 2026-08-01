"""Entry point for running Odin via ``python -m src``.

Loads pydantic Config from config.yml, instantiates the executor-shape
OdinBot, starts the HealthServer (web UI + webhook receiver), wires
Discord ↔ webhook callbacks, registers signal handlers, and runs the
event loop until shutdown. Mirrors Heimdall's startup flow so behavior
between the two bots stays predictable.
"""

from __future__ import annotations

import asyncio
import os
import select
import signal
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import NoReturn

from src import restart
from src.tools.process_manager import AdoptedZombieReaper


def _wire_observability(health, bot, log) -> None:
    """Register Prometheus metric sources and component health checks.

    HealthServer wires only an "active sessions" gauge by default, so without
    this /metrics exposes liveness only and /health/ready can never reflect a
    degraded subsystem — even though MetricsCollector and the component registry
    already support all of the below. Every source/check is guarded so a missing
    optional subsystem is skipped rather than fatal, and every check is cheap and
    synchronous (called on each health/metrics request).
    """
    metrics = health.metrics

    tool_executor = getattr(bot, "tool_executor", None)
    if tool_executor is not None and hasattr(tool_executor, "get_metrics"):
        metrics.register_source("tools", tool_executor.get_metrics)
    if tool_executor is not None and hasattr(tool_executor, "get_workspace_metrics"):
        # Paired with the deliberate absence of auto-pruning: growth in the
        # local command workspace must be alertable rather than silently
        # unbounded (PR #239 round-2 review).
        metrics.register_source("workspace", tool_executor.get_workspace_metrics)

    cost_tracker = getattr(bot, "cost_tracker", None)
    if cost_tracker is not None and hasattr(cost_tracker, "get_prometheus_metrics"):
        metrics.register_source("cost_tracker", cost_tracker.get_prometheus_metrics)

    trajectory_saver = getattr(bot, "trajectory_saver", None)
    if trajectory_saver is not None and hasattr(trajectory_saver, "get_prometheus_metrics"):
        metrics.register_source("trajectories", trajectory_saver.get_prometheus_metrics)

    scheduler = getattr(bot, "scheduler", None)
    if scheduler is not None:
        metrics.register_source("scheduler", lambda: len(getattr(scheduler, "_schedules", [])))

    loop_manager = getattr(bot, "loop_manager", None)
    if loop_manager is not None:
        metrics.register_source("loops", lambda: len(getattr(loop_manager, "_loops", {})))

    def _discord_health() -> tuple[bool, str]:
        try:
            latency = bot.latency
            # latency == latency filters out NaN (discord.py before first heartbeat)
            if latency and latency == latency:
                detail = f"latency={latency * 1000:.0f}ms"
            else:
                detail = "connecting"
            return (bot.is_ready(), detail)
        except Exception as exc:
            return (False, f"error: {exc}")

    health.register_component("discord", _discord_health)

    if scheduler is not None:
        def _scheduler_health() -> tuple[bool, str]:
            task = getattr(scheduler, "_task", None)
            alive = task is not None and not task.done()
            return (alive, f"{len(getattr(scheduler, '_schedules', []))} schedules")

        health.register_component("scheduler", _scheduler_health)

    log.info("Observability wired: metric sources and component health checks registered")


def _enable_process_containment(log) -> bool:
    """Become a child subreaper so escaped descendants stay ours.

    Process-wide state, so it is set ONCE here at the application
    boundary rather than by any library constructor. Without it, a
    background descendant that double-forks and calls ``setsid()``
    reparents to PID 1 and becomes unattributable — and the process
    manager then refuses to claim its cleanup is complete (PR #244).
    """
    import secrets

    from .tools.process_manager import (
        DEFAULT_JOB_TOKEN,
        JOB_TOKEN_ENV,
        PROC_TOKEN_ENV,
        set_child_subreaper,
    )

    # Process-wide provenance: stamped into os.environ BEFORE any
    # subprocess is spawned, so every child Odin creates inherits it and
    # background-job cleanup can tell another subsystem's child (decided
    # not-ours) from one that discarded its environment (ambiguous, fails
    # closed).
    os.environ.setdefault(PROC_TOKEN_ENV, secrets.token_hex(8))
    # Every child inherits a job token; background jobs override it with
    # their own. A child that has the process marker but NO job token
    # deleted it, which is tampering — not foreign ownership.
    os.environ.setdefault(JOB_TOKEN_ENV, DEFAULT_JOB_TOKEN)

    if set_child_subreaper(True):
        log.debug("Child-subreaper containment active")
        return True
    else:
        log.error(
            "Could not become a child subreaper — escaped background "
            "descendants would be unattributable; cleanup will refuse to "
            "report success and in-place restarts will be blocked"
        )
    return False


# Cooperative per-step ceiling for the ordinary finalize barrier. It keeps
# well-behaved async work bounded, but it is NOT a hard wall-clock guarantee:
# cancellation may enter synchronous user code and prevent the loop from ever
# servicing asyncio.wait()'s timeout (round-23 #2).
_FINALIZE_STEP_TIMEOUT = 3.0

# Hard process-level ceiling, armed in an isolated helper process BEFORE
# finalization begins. The ordinary barrier has at most three cooperative 3s
# phases (task drain, async generators, default executor); the remaining margin
# covers the final zombie proof and clean close. If the main process blocks
# anywhere — including with the GIL retained in cancellation/finalization or in
# loop.close() — the helper SIGKILLs that exact incarnation via pidfd. This is
# deliberately out-of-process: once teardown starts, no code in Odin's process
# is trusted to make progress.
_FINALIZE_WATCHDOG_TIMEOUT = 12.0


# Objects caught on the emergency path are parked here FOREVER — the
# process exits moments later. CPython clears an `except ... as exc`
# binding when the handler ends; if that drops the final reference, a
# user-defined __del__ runs synchronously on the main thread BEFORE
# os._exit is reached (round-22, reproduced on all three failure
# paths). Parking keeps the reference alive so no finalizer can ever
# run on this path. Never cleared, never capped: eviction would drop
# references, which is exactly the hazard.
_PARKED_FOR_EXIT: list[object] = []


def _safe_repr(exc: BaseException) -> str:
    """Identity of ``exc`` without executing ANY of its code (round-21).

    ``repr()``/``str()``/f-string interpolation all re-enter
    user-controlled methods: a blocking ``__repr__`` hung the main
    thread on the emergency path, and a repr returning a ``str``
    SUBCLASS smuggled a hostile ``__format__`` into the f-string that
    consumed it. ``object.__repr__`` is C-level — it never calls back
    into the exception, reads the type's name from the type dict
    without the descriptor protocol, and returns an EXACT ``str`` that
    concatenates and formats inertly. The message (``args``) is
    deliberately dropped: it is user-controlled data of user-controlled
    type.
    """
    try:
        return object.__repr__(exc)
    except BaseException:
        return "unrepresentable exception"


def _finalize_loop(loop, zombie_reaper: AdoptedZombieReaper, log) -> str | None:
    """Teardown tail in the exact round-15 §3.3 order.

    Drain before close: cancel stragglers, then run the loop's async
    generator and default-executor shutdown hooks — closing without this
    destroys still-pending work mid-await, and an in-place restart would
    exec over half-finished writes. Only AFTER that barrier has every
    subprocess owner provably stopped, so only then may the final
    no-grace zombie drain run (a drain any earlier could consume an exit
    status a still-running owner legitimately awaits — round-15
    blocker #1).

    Cooperative steps use bounded ``asyncio.wait`` calls. They are backed by
    the process-level watchdog armed by :func:`_finalize_and_exit`, because no
    event-loop timeout can fire while cancellation/finalization is executing
    blocking synchronous code (round-23). Failure anywhere on this path VETOES
    the in-place re-exec
    (``restart.block_reexec``): exec'ing over an unverified process
    table hands invisible survivors to the new image, while exiting
    lets the supervisor start clean and PID 1 reap whatever remains.

    Returns None when the owner barrier completed (tasks, async
    generators and the default executor all provably stopped), else the
    failure reason. An unproven verdict means owners MAY include
    blocked non-daemon threads — the caller must then leave via the
    emergency path, never via ordinary interpreter shutdown (round-17)
    — and the unproven return path itself performs NO synchronous I/O,
    not even logging or the veto record (round-19).
    """
    owners_stopped = False
    failure = ""
    pending: list = []
    done: set = set()
    refused: set = set()
    try:
        pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
        for task in pending:
            task.cancel()
        if pending:
            done, refused = loop.run_until_complete(
                asyncio.wait(pending, timeout=_FINALIZE_STEP_TIMEOUT)
            )
            for settled in done:
                if not settled.cancelled():
                    settled.exception()  # retrieve; parity with gather()
        if refused:
            failure = f"{len(refused)} task(s) survived cancellation"
        else:
            for label, factory in (
                ("async-generator", loop.shutdown_asyncgens),
                ("default-executor", loop.shutdown_default_executor),
            ):
                hook = loop.create_task(factory())
                _done, hung = loop.run_until_complete(
                    asyncio.wait({hook}, timeout=_FINALIZE_STEP_TIMEOUT)
                )
                if hung:
                    _PARKED_FOR_EXIT.append(hook)
                    failure = f"{label} shutdown did not finish"
                    break
                if hook.exception() is not None:
                    # A hook that RAISED is as unproven as one that hung
                    # — asyncio.wait reports it done, but done-with-error
                    # is not a completed barrier. Park the task: its
                    # exception (and coroutine frame) must not be freed
                    # on this path (round-22).
                    _PARKED_FOR_EXIT.append(hook)
                    failure = f"{label} shutdown failed"
                    break
            else:
                owners_stopped = True
    except Exception as exc:
        _PARKED_FOR_EXIT.append(exc)  # a dropped ref could run __del__
        failure = "exception during loop drain: " + _safe_repr(exc)
    if not owners_stopped:
        # UNPROVEN verdict. From here to os._exit there must be NO
        # synchronous I/O: a blocking logging handler would hang the
        # main thread before the emergency exit is ever reachable, and
        # a raising one would unwind into ordinary interpreter shutdown
        # — the exact round-17 hang again (round-19). No log line, no
        # veto record (restart.block_reexec logs), not even
        # loop.close() (pending-task warnings go through logging): the
        # caller's emergency path says all of it from a bounded scribe.
        # The task collections are parked too — releasing them at frame
        # exit would free coroutine frames whose locals can carry
        # user-defined finalizers (round-22).
        _PARKED_FOR_EXIT.extend((pending, done, refused))
        return failure or "owner barrier unproven"
    try:
        drained, verified = zombie_reaper.drain_at_teardown()
    except Exception as exc:
        # A failing drain is a FAILURE VERDICT like any other: no
        # synchronous logging, no veto record here — a blocking handler
        # would hang the main thread before the emergency exit is
        # reachable (round-20 #1). The reason travels to the scribe;
        # the exception is parked so no __del__ fires here (round-22).
        _PARKED_FOR_EXIT.append(exc)
        return "final zombie drain failed: " + _safe_repr(exc)
    if not verified:
        return "final zombie drain could not verify a clean process table"
    if drained:
        log.info("Reaped %d adopted zombie(s) at teardown", drained)
    loop.close()
    log.info("Odin stopped")
    return None


_FINALIZE_WATCHDOG_PROGRAM = r"""
import os
import select
import signal
import sys

control_fd = int(sys.argv[1])
ready_fd = int(sys.argv[2])
parent_pidfd = int(sys.argv[3])
deadline = float(sys.argv[4])
try:
    os.write(ready_fd, b"R")
    os.close(ready_fd)
    readable, _, _ = select.select([control_fd], [], [], deadline)
    if not readable:
        signal.pidfd_send_signal(parent_pidfd, signal.SIGKILL)
finally:
    os._exit(0)
"""


@dataclass(frozen=True, slots=True)
class _FinalizeWatchdog:
    """Kernel-backed finalization deadline and captured disarm primitives."""

    control_fd: int
    pid: int
    hard_exit: Callable[[int], NoReturn]
    write: Callable[[int, bytes], int]
    close: Callable[[int], None]
    waitpid: Callable[[int, int], tuple[int, int]]


def _arm_finalize_watchdog(exit_code: int) -> _FinalizeWatchdog:
    """Arm an out-of-process, GIL-independent finalization deadline.

    A Python thread cannot be a hard wall-clock boundary: synchronous teardown
    can retain the GIL forever. The isolated helper process owns a pidfd for
    this exact parent incarnation and sends SIGKILL if the control pipe is not
    disarmed before the deadline. The helper acknowledges startup before this
    function returns, so finalize never begins without an active guard.

    The helper does no logging or cleanup at expiry. Its signal is deliberately
    uncatchable and pidfd-targeted, so user callbacks cannot intercept it and
    PID reuse cannot redirect it. Arm failure exits immediately rather than
    attempting unguarded finalization.
    """
    code = exit_code or 1
    # Capture every primitive before teardown can run arbitrary callbacks.
    hard_exit = os._exit
    pipe = os.pipe
    close = os.close
    read = os.read
    write = os.write
    waitpid = os.waitpid
    set_inheritable = os.set_inheritable
    pidfd_open = os.pidfd_open
    spawn = os.posix_spawn
    select_ready = select.select
    control_r = control_w = ready_r = ready_w = parent_pidfd = -1
    try:
        control_r, control_w = pipe()
        ready_r, ready_w = pipe()
        parent_pidfd = pidfd_open(os.getpid())
        for fd in (control_r, ready_w, parent_pidfd):
            set_inheritable(fd, True)
        argv = (
            sys.executable,
            "-I",
            "-S",
            "-c",
            _FINALIZE_WATCHDOG_PROGRAM,
            str(control_r),
            str(ready_w),
            str(parent_pidfd),
            str(_FINALIZE_WATCHDOG_TIMEOUT),
        )
        pid = spawn(sys.executable, argv, os.environ)
        for fd in (control_r, ready_w, parent_pidfd):
            close(fd)
        control_r = ready_w = parent_pidfd = -1

        readable, _, _ = select_ready([ready_r], [], [], 2.0)
        if not readable or read(ready_r, 1) != b"R":
            hard_exit(code)
            raise AssertionError("os._exit returned")  # test doubles only
        close(ready_r)
        ready_r = -1
        return _FinalizeWatchdog(
            control_fd=control_w,
            pid=pid,
            hard_exit=hard_exit,
            write=write,
            close=close,
            waitpid=waitpid,
        )
    except BaseException:  # noqa: BLE001 — no unguarded finalize is allowed
        for fd in (control_r, control_w, ready_r, ready_w, parent_pidfd):
            if fd >= 0:
                try:
                    close(fd)
                except BaseException:
                    pass
        hard_exit(code)
        raise AssertionError("os._exit returned")  # test doubles only


def _disarm_finalize_watchdog(
    watchdog: _FinalizeWatchdog, exit_code: int
) -> None:
    """Disarm and reap the helper after fully clean finalization.

    Only captured C-backed primitives run here. Any failure is unsafe: a live
    helper or uncertain child status must not be carried into ordinary exit or
    in-place exec, so the already-captured hard exit is used.
    """
    try:
        if watchdog.write(watchdog.control_fd, b"D") != 1:
            watchdog.hard_exit(exit_code or 1)
        watchdog.close(watchdog.control_fd)
        waited, status = watchdog.waitpid(watchdog.pid, 0)
        if waited != watchdog.pid or status != 0:
            watchdog.hard_exit(exit_code or 1)
    except BaseException:  # noqa: BLE001 — clean completion is now unprovable
        watchdog.hard_exit(exit_code or 1)


def _finalize_and_exit(
    loop, zombie_reaper: AdoptedZombieReaper, log, exit_code: int
) -> None:
    """Run the finalize barrier under a pre-armed hard deadline.

    A genuinely blocked default-executor worker is a NON-DAEMON thread:
    ordinary interpreter shutdown joins it forever. More generally, arbitrary
    finalizers may run while cancellation frames, completed task frames, or
    loop callback handles are released. Those callbacks can block before the
    cooperative barrier returns (round-23). The external watchdog is therefore
    armed *before* any finalize work and remains armed until the entire clean
    barrier has returned. It does not depend on event-loop progress.

    Returns normally only when the complete barrier finished cleanly; the
    caller then owns the ordinary restart/exit tail.
    """
    watchdog = _arm_finalize_watchdog(exit_code)
    try:
        failure = _finalize_loop(loop, zombie_reaper, log)
    except BaseException as exc:  # noqa: BLE001 — nothing may escape this path
        # Whatever leaked out of finalize, the process state is at best
        # unproven — resurfacing the exception would resurrect ordinary
        # interpreter shutdown and the round-17 hang with it. The repr
        # is guarded too: a broken __repr__ raising HERE would escape
        # this very handler (round-20 #2), and the exception is parked
        # so clearing this binding cannot run a __del__ (round-22).
        _PARKED_FOR_EXIT.append(exc)
        failure = "finalize crashed: " + _safe_repr(exc)
    if failure is None:
        _disarm_finalize_watchdog(watchdog, exit_code)
        return
    _emergency_exit(log, exit_code, failure, hard_exit=watchdog.hard_exit)
    # os._exit never returns in production. Test doubles do; disarm there so a
    # unit test cannot inherit a live watchdog that fires in a later test.
    _disarm_finalize_watchdog(watchdog, exit_code)


def _emergency_exit(
    log,
    exit_code: int,
    reason: str,
    *,
    hard_exit: Callable[[int], NoReturn] | None = None,
) -> None:
    """Leave NOW, depending on no ordinary I/O whatsoever (round-18/19).

    Behind an unproven barrier even the last words are best-effort: a
    logging HANDLER or stream flush can itself RAISE — or BLOCK forever
    on a wedged pipe — and either kept ``os._exit`` from ever running
    (round-18: a raising ``stdout.flush``; round-19: a blocking
    ``log.error`` before the verdict even returned). ALL remaining
    output — the veto record included, since ``restart.block_reexec``
    logs — therefore happens in a daemon thread with a bounded join:
    whatever it cannot say within the bound is abandoned with it at
    exit, and the exit itself depends on nothing.
    """
    import logging
    import threading

    # Direct unit callers use the current function so their test double still
    # works. _finalize_and_exit passes the pre-finalize captured C function,
    # which hostile teardown callbacks cannot replace.
    exit_now = hard_exit if hard_exit is not None else os._exit

    def _last_words() -> None:
        try:
            restart.block_reexec(
                "teardown could not prove a clean process state — "
                f"in-place re-exec unsafe ({reason})"
            )
        except Exception:
            pass
        try:
            log.error(
                "Teardown unproven (%s) — exiting without interpreter "
                "shutdown: state may include blocked non-daemon threads "
                "or unreaped children",
                reason,
            )
        except Exception:
            pass
        try:
            flushes = [h.flush for h in logging.getLogger().handlers]
            flushes += [sys.stdout.flush, sys.stderr.flush]
        except Exception:
            return
        for flush in flushes:
            try:
                flush()
            except Exception:
                pass

    try:
        scribe = threading.Thread(
            target=_last_words, name="emergency-exit-flush", daemon=True
        )
        scribe.start()
        scribe.join(timeout=1.0)
    except BaseException as exc:  # noqa: BLE001 — os._exit is unconditional
        _PARKED_FOR_EXIT.append(exc)
    exit_now(exit_code or 1)


def main() -> None:
    # ``--version`` short-circuit
    if "--version" in sys.argv or "-V" in sys.argv:
        from src.version import get_version
        print(f"Odin {get_version()}")
        return

    config_path = sys.argv[1] if len(sys.argv) > 1 else "config.yml"
    if not Path(config_path).exists():
        print(f"Config file not found: {config_path}")
        sys.exit(1)

    # Load .env before config.yml so ${DISCORD_TOKEN} substitution works
    from dotenv import load_dotenv
    env_path = Path(".env")
    if env_path.exists():
        load_dotenv(env_path)

    from src.config import load_config
    from src.discord.client import OdinBot
    from src.discord.response_guards import scrub_response_secrets
    from src.health import HealthServer
    from src.odin_log import get_logger

    config = load_config(config_path)

    import logging
    logging.basicConfig(
        level=getattr(logging, config.logging.level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    log = get_logger("main")
    log.info("Starting Odin")
    containment = _enable_process_containment(log)
    # Containment makes escaped descendants OURS, so we owe them a reaper:
    # nothing else will wait on an adopted orphan, and without this they
    # accumulate as zombies for the process lifetime (PR #244 soak).
    zombie_reaper = AdoptedZombieReaper()

    # STARTUP MIGRATION — must run after the real configuration is loaded and
    # before any command service begins.
    #
    # Local user commands run in a validated workspace outside the install and
    # refuse to run without one. A preflight in the self-updater cannot
    # bootstrap that: the update which INTRODUCES the preflight is executed by
    # the previous release's handler, which has none, so the very first upgrade
    # would re-exec into code whose workspace was never created (PR #239
    # round-5 review, verified against a live install). Provisioning here runs
    # in the NEW code on the restart that follows any update, however the
    # update arrived.
    #
    # Failure is logged, not fatal: an unusable workspace must not prevent
    # Odin from starting and answering on Discord. Local commands then fail
    # closed individually, with the same actionable error.
    try:
        from src.tools.workspace import (
            WorkspaceError,
            provision_startup_workspace,
            provisioning_hint,
        )

        def _warn_fallback(path, configured, reason) -> None:
            # A fallback is not a failure, but it must never look like normal
            # operation: on a packaged install it means the packaged default
            # could not be provisioned, which the operator needs to know
            # (cross-review of PR #239 round 13).
            log.warning(
                "Local command workspace fell back to %s — the configured "
                "default could not be provisioned (%s). Local commands work, "
                "but this indicates a packaging or permissions problem. %s",
                path,
                reason,
                provisioning_hint(configured),
            )

        workspace = provision_startup_workspace(
            config.tools,
            protected_roots=_command_protected_roots(config),
            on_fallback=_warn_fallback,
        )
        log.info("Local command workspace ready: %s", workspace)
    except WorkspaceError as exc:
        log.error(
            "Local command workspace unusable — local commands will refuse to run: %s. %s",
            exc,
            provisioning_hint(config.tools.local_working_dir),
        )
    except Exception as exc:  # never block startup on provisioning
        log.error("Local command workspace provisioning failed unexpectedly: %s", exc)

    health = HealthServer(
        port=config.web.port,
        webhook_config=config.webhook,
        web_config=config.web,
        slack_config=getattr(config, "slack", None),
        grafana_alert_config=getattr(config, "grafana_alerts", None),
    )
    bot = OdinBot(config)
    health.set_bot(bot)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Fatal paths set this nonzero so supervisors (systemd Restart=on-failure,
    # monitoring) can distinguish a crash from a clean stop. Historically every
    # fatal startup error (bad token, boot-time DNS failure) exited 0 and only
    # Restart=always kept the service recovering.
    exit_code = 0
    shutdown_task: asyncio.Task[None] | None = None

    def request_shutdown() -> asyncio.Task[None]:
        """Create the shutdown task exactly once; repeat requests reuse it.

        A second SIGTERM must not start a second teardown pass — every
        cleanup step would run twice, racing its own first invocation.
        """
        nonlocal shutdown_task
        if shutdown_task is None:
            shutdown_task = loop.create_task(shutdown())
        return shutdown_task

    async def run() -> None:
        nonlocal exit_code
        try:
            if containment:
                zombie_reaper.start()
            await health.start()

            async def _webhook_send(channel_id: str, text: str) -> None:
                channel = bot.get_channel(int(channel_id))
                if channel:
                    # Admin-configured webhook target; kind not enforced, so the
                    # union includes send-less channel types (Category/Forum).
                    await channel.send(scrub_response_secrets(text))  # type: ignore[union-attr]
                else:
                    log.warning("Webhook: channel %s not found", channel_id)

            health.set_send_message(_webhook_send)
            if hasattr(bot, "scheduler") and hasattr(health, "set_trigger_callback"):
                health.set_trigger_callback(bot.scheduler.fire_triggers)

            _wire_observability(health, bot, log)

            def handle_signal() -> None:
                log.info("Shutdown signal received")
                request_shutdown()

            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(sig, handle_signal)

            health.set_ready(True)
            log.info("Connecting to Discord…")
            await bot.start(config.discord.token)
        except Exception as exc:
            exit_code = 1
            log.error("Fatal error: %s", exc, exc_info=True)
        finally:
            # Completion barrier: run() returns only after teardown actually
            # finished. shutdown()'s bot.close() unblocks bot.start() above,
            # so without this await run_until_complete() would return — and
            # main() would close the loop — while the shutdown task was still
            # mid-cleanup ("Task was destroyed but it is pending"), silently
            # skipping whatever remained (health stop, session saves).
            await request_shutdown()

    async def shutdown() -> None:
        log.info("Shutting down…")
        # Teardown order (PR #244 round-15 §3.3, step 1): stop the periodic
        # reaper FIRST. The final no-grace drain does NOT run here — it runs
        # in _finalize_loop, after remaining tasks, async generators and the
        # default executor have all stopped, because only then has every
        # subprocess owner provably finished.
        try:
            await zombie_reaper.stop()
        except Exception:
            log.exception("zombie reaper stop error")
        for label, action in (
            # The getattr-and-call lambdas short-circuit on absent/None
            # managers; mypy can't relate the getattr probe to the direct
            # attribute access that follows it.
            (
                "browser",
                lambda: getattr(bot, "browser_manager", None)
                and bot.browser_manager.shutdown(),  # type: ignore[attr-defined]
            ),
            ("scheduler", lambda: getattr(bot, "scheduler", None) and bot.scheduler.stop()),
        ):
            try:
                coro = action()
                if coro is not None:
                    await coro
            except Exception:
                log.exception("%s shutdown error", label)
        try:
            if getattr(bot, "sessions", None):
                bot.sessions.save_all()
        except Exception:
            log.exception("sessions save error")
        try:
            await bot.close()
        except Exception:
            log.exception("bot close error")
        try:
            await health.stop()
        except Exception:
            log.exception("health stop error")

    try:
        loop.run_until_complete(run())
    except (KeyboardInterrupt, SystemExit) as exc:
        # Ctrl-C stays a clean stop; an intentional SystemExit keeps its
        # original code rather than being normalized. run()'s finally has
        # normally completed shutdown already; a raw KeyboardInterrupt that
        # broke out of the loop itself still needs it finished here.
        if isinstance(exc, SystemExit) and exc.code:
            exit_code = exc.code if isinstance(exc.code, int) else 1
        loop.run_until_complete(request_shutdown())
    except asyncio.CancelledError:
        # Cancellation reaching the top level is a shutdown path, not a
        # fatal error — exit clean unless a fatal path already set a code.
        loop.run_until_complete(request_shutdown())
    except Exception:
        # Failures outside run()'s own guard previously tracebacked out with
        # no clean shutdown. Cleanup failures are logged separately and never
        # mask the fatal code.
        exit_code = 1
        log.exception("Fatal error during startup")
        try:
            loop.run_until_complete(request_shutdown())
        except Exception:
            log.exception("Cleanup after fatal startup error failed")
    finally:
        _finalize_and_exit(loop, zombie_reaper, log, exit_code)

    if restart.restart_requested():
        veto = restart.reexec_blocked()
        if veto:
            # Teardown could not prove it terminated everything it owned
            # (PR #244 round-8 #3). Exec would hand those survivors to the
            # new image invisibly; exiting nonzero lets the supervisor
            # start a clean one instead.
            log.error(
                "Restart requested but in-place re-exec is vetoed (%s) — "
                "exiting for a supervisor restart instead", veto,
            )
            sys.exit(exit_code or 1)
        # In-place restart (self-update / setup wizard): replace the process
        # image instead of exiting so recovery does not depend on the unit's
        # Restart= policy. Exec failure exits nonzero — a clean-exit fallback
        # would recreate exactly the stranding this path removes.
        log.info("Restart requested — re-executing in place")
        try:
            restart.reexec()
        except OSError:
            log.exception("In-place restart failed")
            sys.exit(exit_code or 1)
    if exit_code:
        sys.exit(exit_code)


def _command_protected_roots(config) -> list[str]:
    """Install root plus canonical live-data roots for the startup migration.

    Delegates to the ONE shared derivation so startup, the self-update
    preflight, and the executor protect exactly the same directories. Deriving
    them separately here silently protected nothing (``Config`` has no
    ``memory`` section) while the executor protected live memory.json — so a
    workspace beside it was provisioned at startup and then refused on every
    command (PR #239 round-6 review).

    The FULL config is passed so every independently relocatable live-state
    path is covered. ``memory_path`` is left at its default: production wiring
    hardcodes that path, and startup runs before wiring exists.
    """
    from src.tools.workspace import command_protected_roots

    return command_protected_roots(Path(__file__).absolute().parents[1], config)


# The entrypoint guard MUST stay the last statement in this module. Python
# executes a module top-to-bottom, so a guard placed above a helper runs main()
# before that helper's `def` is reached: the startup migration raised NameError
# and its own nonfatal handler swallowed it, leaving the workspace uncreated and
# resurrecting the first-update bootstrap failure this migration exists to fix
# (PR #239 round-6 review). tests/test_local_workspace.py executes `python -m src`
# for real to keep this honest.
if __name__ == "__main__":
    main()
