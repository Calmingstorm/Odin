"""The explicitly approved tokenless-upgrade listener behavior stays local."""

from pathlib import Path

import aiohttp
import pytest

from src.config.environment import EnvironmentSource
from src.config.initialization import InitializationMode, InitializationStore, InstallationBinding
from src.config.schema import WebConfig
from src.health.server import HealthServer
from src.web.onboarding import OnboardingCoordinator


@pytest.mark.asyncio
async def test_legacy_tokenless_wildcard_install_serves_loopback(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yml"
    config_path.write_text("web: {host: '0.0.0.0'}\n")
    private = tmp_path / "initialization"
    private.mkdir(mode=0o700)
    store = InitializationStore(
        private / "state.json", InstallationBinding("legacy-tokenless", config_path)
    )
    assert not store.path.exists()
    server = HealthServer(port=0, web_config=WebConfig(host="0.0.0.0"))
    server.attach_onboarding(
        OnboardingCoordinator(store, EnvironmentSource(tmp_path / ".env"), True)
    )
    await server.start()
    try:
        address, port = server._listener_sockets[0].getsockname()[:2]
        assert address == "127.0.0.1"
        assert store.state().mode is InitializationMode.COMPLETE
        assert store.state().loopback_restricted is True
        async with aiohttp.ClientSession() as client:
            async with client.get(f"http://127.0.0.1:{port}/health/live") as response:
                assert response.status == 200
    finally:
        await server.stop()
