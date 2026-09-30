import json

import pytest

from src.config.schema import Config
from src.health.startup import check_config_sections, run_startup_diagnostics
from src.permissions.token_manager import ApiTokenManager


def test_startup_auth_recognizes_static_user_token_without_shared_token():
    cfg = Config(discord={"token": "gateway"}, web={"enabled": True, "api_tokens": [
        {"token": "test-static-marker", "user_id": "123", "tier": "user"},
    ]})
    result = check_config_sections(cfg)
    assert result.passed
    assert "test-static-marker" not in json.dumps(result.to_dict())


@pytest.mark.asyncio
async def test_runtime_dynamic_inventory_reaches_startup_auth_check(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    identity = await manager.create_token("123", tier="user")
    cfg = Config(discord={"token": "gateway"}, web={"enabled": True})
    assert not check_config_sections(cfg).passed
    report = run_startup_diagnostics(yaml_config=cfg,
                                    credential_inventory=manager.credential_inventory)
    result = next(r for r in report.results if r.name == "config_consistency")
    assert result.passed
    assert identity.token not in json.dumps(result.to_dict())
