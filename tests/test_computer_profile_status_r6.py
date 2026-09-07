"""Declaration-only operator profile status cannot probe or grant desktop access."""
from types import SimpleNamespace

import pytest

from src.computer.manager import ComputerLifecycle
from src.config.schema import Config


@pytest.mark.parametrize("environment,platform,expected", [
    ("isolated", "x11", {"drawing": "supported", "xed": "supported"}),
    ("existing_session", "x11", {"drawing": "capture_only", "xed": "supported",
                                 "inkscape": "supported", "libreoffice": "supported"}),
    ("existing_session", "wayland", {}),
])
def test_profile_status_is_pure_declaration(environment, platform, expected):
    config = Config(discord={"token": "fixture-only"})
    config.computer.environment = environment
    config.computer.platform = platform
    config.computer.enabled = False

    def forbidden(*args, **kwargs):
        raise AssertionError("operator snapshot must not construct a desktop")

    manager = ComputerLifecycle(SimpleNamespace(config=config), factory=forbidden)
    snapshot = manager.snapshot()
    assert {p["id"]: p["input"] for p in snapshot["application_profiles"]} == expected
    assert snapshot["backend"]["input_supported"] is None
    assert snapshot["backend"]["readiness"] == "not_checked"
    assert snapshot["runtime_enabled"] is False
    assert manager._service is None
    assert manager._janitor is None
    assert not manager._watchers
    if environment == "existing_session" and platform == "x11":
        drawing = next(p for p in snapshot["application_profiles"] if p["id"] == "drawing")
        assert drawing["reason"] == "attached_application_provenance_unavailable"


def test_profile_status_uses_pinned_environment_not_pending_configuration():
    config = Config(discord={"token": "fixture-only"})
    config.computer.environment = "isolated"
    manager = ComputerLifecycle(SimpleNamespace(config=config))
    config.computer.environment = "existing_session"
    snapshot = manager.snapshot()
    assert {p["id"] for p in snapshot["application_profiles"]} == {"drawing", "xed"}
    assert "environment" in snapshot["restart_required"]
