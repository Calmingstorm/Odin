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

    watcher = getattr(bot, "infra_watcher", None)
    if watcher is not None:
        def _watcher_health() -> tuple[bool, str]:
            tasks = getattr(watcher, "_check_tasks", {})
            if not tasks:
                return (True, "no active checks")
            dead = [n for n, t in tasks.items() if t.done()]
            return (not dead, f"{len(tasks)} checks ok" if not dead else f"{len(dead)} dead checks")

        health.register_component("watcher", _watcher_health)

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
    from src.discord.client import OdinBot, scrub_response_secrets
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

    async def run() -> None:
        await health.start()

        async def _webhook_send(channel_id: str, text: str) -> None:
            channel = bot.get_channel(int(channel_id))
            if channel:
                await channel.send(scrub_response_secrets(text))
            else:
                log.warning("Webhook: channel %s not found", channel_id)

        health.set_send_message(_webhook_send)
        if hasattr(bot, "scheduler") and hasattr(health, "set_trigger_callback"):
            health.set_trigger_callback(bot.scheduler.fire_triggers)

        def handle_signal() -> None:
            log.info("Shutdown signal received")
            loop.create_task(shutdown())

        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, handle_signal)

        try:
            health.set_ready(True)
            log.info("Connecting to Discord…")
            await bot.start(config.discord.token)
        except Exception as exc:
            log.error("Fatal error: %s", exc, exc_info=True)
            await shutdown()

    async def shutdown() -> None:
        log.info("Shutting down…")
        for label, action in (
            ("voice", lambda: getattr(bot, "voice_manager", None) and bot.voice_manager.shutdown()),
            ("browser", lambda: getattr(bot, "browser_manager", None) and bot.browser_manager.shutdown()),
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
        loop.stop()

    try:
        loop.run_until_complete(run())
    except (KeyboardInterrupt, SystemExit):
        loop.run_until_complete(shutdown())
    finally:
        loop.close()
        log.info("Odin stopped")


if __name__ == "__main__":
    main()
