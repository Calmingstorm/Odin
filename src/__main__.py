"""Entry point for running Odin via ``python -m src``.

Loads pydantic Config from config.yml, instantiates the executor-shape
OdinBot, starts the HealthServer (web UI + webhook receiver), wires
Discord ↔ webhook callbacks, registers signal handlers, and runs the
event loop until shutdown. Mirrors Heimdall's startup flow so behavior
between the two bots stays predictable.
"""

from __future__ import annotations

import asyncio
import signal
import sys
from pathlib import Path

from src import restart


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
        # Drain before close: cancel stragglers, then run the loop's async
        # generator and default-executor shutdown hooks. Closing without this
        # destroys still-pending work mid-await — and an in-place restart
        # would exec over half-finished writes.
        try:
            pending = [t for t in asyncio.all_tasks(loop) if not t.done()]
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(
                    asyncio.gather(*pending, return_exceptions=True)
                )
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.run_until_complete(loop.shutdown_default_executor())
        except Exception:
            log.exception("Event-loop drain failed")
        loop.close()
        log.info("Odin stopped")

    if restart.restart_requested():
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
