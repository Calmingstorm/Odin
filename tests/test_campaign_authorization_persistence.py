"""Rejected writes must not publish authorization or mutate captured identities."""
from pathlib import Path
from unittest.mock import patch

import pytest

from src.permissions.host_access import HostAccessManager
from src.permissions.manager import PermissionManager
from src.permissions.token_manager import ApiTokenManager


@pytest.mark.parametrize("operation", ["set", "delete"])
async def test_permission_failed_publication(tmp_path, operation):
    path = tmp_path / "permissions.json"
    manager = PermissionManager({}, overrides_path=str(path))
    await manager.async_set_tier("owner", "user")
    original = path.read_bytes()
    with patch.object(Path, "replace", side_effect=OSError("injected replace failure")):
        with pytest.raises(OSError):
            if operation == "set":
                await manager.async_set_tier("owner", "admin")
            else:
                await manager.async_delete_tier("owner")
    assert manager._overrides == {"owner": "user"}
    assert path.read_bytes() == original
    await manager.async_set_tier("other", "guest")
    reloaded = PermissionManager({}, overrides_path=str(path))
    assert reloaded._overrides == {"owner": "user", "other": "guest"}


@pytest.mark.parametrize("operation", ["set", "delete", "default"])
async def test_host_policy_failed_publication(tmp_path, operation):
    path = tmp_path / "hosts.json"
    manager = HostAccessManager(str(path), ["alpha", "beta"])
    await manager.set_user("owner", ["alpha"], "alpha")
    await manager.set_default_policy([], "")
    original = path.read_bytes()
    captured = manager.get_entry("owner")
    with patch.object(Path, "replace", side_effect=OSError("injected replace failure")):
        with pytest.raises(OSError):
            if operation == "set":
                await manager.set_user("owner", ["beta"], "beta")
            elif operation == "delete":
                await manager.delete_user("owner")
            else:
                await manager.set_default_policy(None, "beta")
    assert manager.get_allowed_hosts("owner") == ["alpha"]
    assert manager.get_allowed_hosts("unknown") == []
    assert captured.allowed_hosts == ["alpha"]
    assert path.read_bytes() == original
    await manager.set_user("other", [], "")
    reloaded = HostAccessManager(str(path), ["alpha", "beta"])
    assert reloaded.get_allowed_hosts("owner") == ["alpha"]
    assert reloaded.get_allowed_hosts("unknown") == []


@pytest.mark.parametrize("operation", ["create", "update", "regenerate", "delete"])
async def test_token_failed_publication(tmp_path, operation):
    path = tmp_path / "tokens.json"
    manager = ApiTokenManager(str(path))
    issued = await manager.create_token("owner", tier="user")
    captured = manager.resolve(issued.token)
    original = path.read_bytes()
    with patch.object(Path, "replace", side_effect=OSError("injected replace failure")):
        with pytest.raises(OSError):
            if operation == "create":
                await manager.create_token("rejected")
            elif operation == "update":
                await manager.update_token("owner", tier="admin")
            elif operation == "regenerate":
                await manager.regenerate_token("owner")
            else:
                await manager.delete_token("owner")
    assert manager.resolve(issued.token) is captured
    assert captured.tier == "user"
    assert manager.get("rejected") is None
    assert path.read_bytes() == original
    await manager.create_token("other", tier="guest")
    reloaded = ApiTokenManager(str(path))
    assert reloaded.resolve(issued.token).tier == "user"
    assert reloaded.get("rejected") is None


async def test_token_update_validates_detached_identity(tmp_path):
    manager = ApiTokenManager(str(tmp_path / "tokens.json"))
    issued = await manager.create_token("owner", tier="user")
    captured = manager.resolve(issued.token)
    with pytest.raises(ValueError):
        await manager.update_token("owner", tier="invalid")
    assert manager.resolve(issued.token) is captured
    assert captured.tier == "user"
