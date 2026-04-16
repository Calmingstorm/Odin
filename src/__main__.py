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
