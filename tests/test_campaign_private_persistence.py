"""Private first-byte publication and pre/post-commit failure semantics."""
import os
import stat
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest

from src.permissions.host_access import HostAccessManager
from src.permissions.manager import PermissionManager
from src.permissions.persistence import write_private_atomic
from src.permissions.token_manager import ApiTokenManager
from src.setup_wizard import write_env_file

from .test_campaign_authorization_persistence import (
    test_host_policy_failed_publication as host_policy_failure,
)
from .test_campaign_authorization_persistence import (
    test_permission_failed_publication as permission_failure,
)
from .test_campaign_authorization_persistence import (
    test_token_failed_publication as token_failure,
)


@pytest.mark.parametrize("stage", ["create", "write", "flush", "fsync"])
@pytest.mark.parametrize("family,operation", [
    ("permission", "set"), ("permission", "delete"),
    ("host", "set"), ("host", "delete"), ("host", "default"),
    ("token", "create"), ("token", "update"), ("token", "regenerate"), ("token", "delete"),
])
async def test_all_mutations_precommit_failures(tmp_path, stage, family, operation):
    # Inject only inside the existing test's rejected transaction; setup and
    # unrelated subsequent saves still use the actual production writer.
    import tests.test_campaign_authorization_persistence as regression

    real_patch = patch.object
    targets = {
        "create": "src.permissions.persistence.tempfile.mkstemp",
        "write": "src.permissions.persistence.os.fdopen",
        "fsync": "src.permissions.persistence.os.fsync",
    }
    entered = []
    real_fdopen = os.fdopen

    @contextmanager
    def failing_stream(*args, **kwargs):
        with real_fdopen(*args, **kwargs) as stream:
            wrapped = MagicMock(wraps=stream)
            getattr(wrapped, stage).side_effect = OSError("injected stream failure")
            yield wrapped

    def fault_context(*args, **kwargs):
        entered.append(stage)
        if stage in {"write", "flush"}:
            return patch("src.permissions.persistence.os.fdopen", side_effect=failing_stream)
        return patch(targets[stage], side_effect=OSError("injected private write failure"))

    with real_patch(regression.patch, "object", side_effect=fault_context):
        await {"permission": permission_failure, "host": host_policy_failure,
               "token": token_failure}[family](tmp_path, operation)
    assert entered == [stage]


@pytest.mark.parametrize("writer", ["permission", "hosts", "tokens", "setup"])
async def test_private_mode_from_first_byte(tmp_path, writer):
    path = tmp_path / "private.json"
    before_fdopen = os.fdopen
    observed = []

    def inspect_fd(fd, *args, **kwargs):
        observed.append(stat.S_IMODE(os.fstat(fd).st_mode))
        assert os.fstat(fd).st_size == 0
        return before_fdopen(fd, *args, **kwargs)

    with patch("src.permissions.persistence.os.fdopen", side_effect=inspect_fd):
        if writer == "permission":
            PermissionManager({}, overrides_path=str(path)).set_tier("owner", "user")
        elif writer == "hosts":
            await HostAccessManager(str(path), []).set_user("owner", [], "")
        elif writer == "tokens":
            await ApiTokenManager(str(path)).create_token("owner")
        else:
            write_env_file(path, "INERT=fixture\n")
    assert observed == [0o600]
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert len(list(tmp_path.iterdir())) == 1


def test_post_replace_fsync_failure_is_committed_degraded(tmp_path):
    path = tmp_path / "permissions.json"
    manager = PermissionManager({}, overrides_path=str(path))
    with patch("src.permissions.persistence.os.fsync", side_effect=[None, OSError("directory")]):
        manager.set_tier("owner", "guest")
    assert manager.durability_degraded
    assert manager.get_tier("owner") == "guest"
    assert PermissionManager({}, overrides_path=str(path)).get_tier("owner") == "guest"


def test_replacement_preserves_owner_and_tightens_mode(tmp_path):
    path = tmp_path / "private"
    path.write_text("old")
    path.chmod(0o644)
    before = path.stat()
    assert write_private_atomic(path, "new")
    after = path.stat()
    assert (after.st_uid, after.st_gid) == (before.st_uid, before.st_gid)
    assert stat.S_IMODE(after.st_mode) == 0o600
    assert path.read_text() == "new"


def test_owner_preservation_failure_does_not_publish(tmp_path):
    path = tmp_path / "private"
    path.write_text("old")
    with patch("src.permissions.persistence.os.fstat") as fstat:
        fstat.return_value.st_uid = -1
        fstat.return_value.st_gid = -1
        with patch("src.permissions.persistence.os.fchown", side_effect=PermissionError):
            with pytest.raises(PermissionError):
                write_private_atomic(path, "new")
    assert path.read_text() == "old"
    assert len(list(tmp_path.iterdir())) == 1


@pytest.mark.parametrize("operation", ["set", "delete", "host_set", "host_delete", "default",
                                       "create", "update", "regenerate", "token_delete"])
async def test_all_postcommit_failures_publish_live_and_disk(tmp_path, operation):
    path = tmp_path / "state.json"
    if operation in {"set", "delete"}:
        manager = PermissionManager({}, overrides_path=str(path))
        await manager.async_set_tier("owner", "user")
        action = (manager.async_set_tier("owner", "admin") if operation == "set"
                  else manager.async_delete_tier("owner"))
    elif operation in {"host_set", "host_delete", "default"}:
        manager = HostAccessManager(str(path), ["alpha", "beta"])
        await manager.set_user("owner", ["alpha"], "alpha")
        action = {"host_set": lambda: manager.set_user("owner", ["beta"], "beta"),
                  "host_delete": lambda: manager.delete_user("owner"),
                  "default": lambda: manager.set_default_policy([], "")}[operation]()
    else:
        manager = ApiTokenManager(str(path))
        issued = await manager.create_token("owner", tier="user")
        action = {"create": lambda: manager.create_token("other"),
                  "update": lambda: manager.update_token("owner", tier="admin"),
                  "regenerate": lambda: manager.regenerate_token("owner"),
                  "token_delete": lambda: manager.delete_token("owner")}[operation]()
    before = path.read_bytes()
    with patch("src.permissions.persistence.os.fsync", side_effect=[None, OSError("directory")]):
        result = await action
    assert manager.durability_degraded
    assert path.read_bytes() != before
    if operation in {"set", "delete"}:
        reloaded = PermissionManager({}, overrides_path=str(path))
        assert manager._overrides == reloaded._overrides
    elif operation in {"host_set", "host_delete", "default"}:
        reloaded = HostAccessManager(str(path), ["alpha", "beta"])
        assert manager.get_allowed_hosts("owner") == reloaded.get_allowed_hosts("owner")
        assert manager.get_allowed_hosts("unknown") == reloaded.get_allowed_hosts("unknown")
    else:
        reloaded = ApiTokenManager(str(path))
        assert manager.resolve(issued.token) == reloaded.resolve(issued.token)
        if operation == "regenerate":
            assert manager.resolve(result) == reloaded.resolve(result)
            assert manager.resolve(issued.token) is None
