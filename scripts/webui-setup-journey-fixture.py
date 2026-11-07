"""Disposable pending installation for the setup-to-sign-in browser check.

The HTTP composition, onboarding coordinator and initialization store are
production code over a temporary config. The Discord supervisor is a stub, so
nothing leaves loopback. Never load installation configuration or data.
"""
import asyncio
import json
import os
import signal
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import yaml

from src.config.environment import EnvironmentSource
from src.config.initialization import InitializationStore, InstallationBinding
from src.config.schema import Config, WebConfig, WebhookConfig, set_active_config_path
from src.health.server import HealthServer
from src.web.onboarding import OnboardingCoordinator


class _Supervisor:
    async def attach(self, token: str) -> None:
        return None

    async def detach(self) -> None:
        return None

    def status(self):
        return SimpleNamespace(state="idle", detail="fixture supervisor", generation=0)


async def main():
    with tempfile.TemporaryDirectory(prefix="odin-setup-journey-") as directory:
        root = Path(directory)
        # Production wiring opens ./data paths (web sessions, uploads). Resolve
        # them inside this installation, never in the caller's checkout.
        caller = os.getcwd()
        os.chdir(root)
        config_path = root / "config.yml"
        config = Config(
            discord={"token": "${DISCORD_TOKEN:-}"},
            web=WebConfig(enabled=True),
            openai_codex={"credentials_path": str(root / "codex-credentials.json")},
        )
        config_path.write_text(yaml.safe_dump(config.model_dump(mode="json"), sort_keys=False))
        set_active_config_path(config_path)
        (root / "private").mkdir(mode=0o700)
        store = InitializationStore(
            root / "private" / "initialization.json",
            InstallationBinding("setup-journey", config_path),
        )
        store.provision_fresh()
        bot = SimpleNamespace(
            config=config,
            onboarding=OnboardingCoordinator(store, EnvironmentSource(root / "config.env"), True),
            connection_supervisor=_Supervisor(),
            scheduler=SimpleNamespace(
                connection_status=lambda: {"state": "available", "connected": True},
                list_all=lambda: [],
            ),
            guilds=[],
            api_token_manager=None,
            audit=SimpleNamespace(
                set_event_callback=lambda _callback: None, log_web_action=AsyncMock()
            ),
            tool_executor=None,
            sessions=SimpleNamespace(items_snapshot=lambda: [], get=lambda _id: None),
            llm_gateway=SimpleNamespace(reload_codex=AsyncMock(), codex_client=None),
        )
        server = HealthServer(
            port=0, web_config=config.web, webhook_config=WebhookConfig(enabled=False)
        )
        server.set_bot(bot)
        await server.start()
        host, port = server._listener_sockets[0].getsockname()[:2]
        # SIGTERM from the browser check stops the server and removes the
        # temporary installation instead of killing the process mid-write.
        stopped = asyncio.Event()
        asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, stopped.set)
        print(json.dumps({"host": host, "port": port}), flush=True)
        try:
            await stopped.wait()
        finally:
            await server.stop()
            os.chdir(caller)


if __name__ == "__main__":
    asyncio.run(main())
