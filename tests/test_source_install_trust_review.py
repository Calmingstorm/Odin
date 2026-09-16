"""F1: group write requires an administrator's explicit owner/group delegation."""
import io
import json
import os
import stat
from types import SimpleNamespace

import pytest

from src.config.environment import EnvironmentSource, EnvironmentSourceError, edit_environment
from src.config.initialization import InitializationMode
from src.config.startup_context import provision_initialization_parent, resolve_startup_context


def test_explicit_owner_group_policy_allows_source_install(tmp_path, monkeypatch):
    from src.config import source_trust

    monkeypatch.setattr(source_trust, "_read_policy", lambda: {
        "version": 1, "trusted_owner_groups": [{"uid": os.geteuid(), "gid": os.getegid()}]
    })
    source = tmp_path / "source"
    source.mkdir(mode=0o775)
    source.chmod(0o775)
    (source / "data").mkdir(mode=0o775)
    (source / "data").chmod(0o775)
    context = resolve_startup_context(source / "config.yml")
    provision_initialization_parent(context.initialization_state_path)
    store = context.onboarding_store()
    assert store.state(legacy_loopback_restricted=True).mode is InitializationMode.COMPLETE
    assert stat.S_IMODE(context.initialization_state_path.parent.stat().st_mode) == 0o700
    edit_environment(EnvironmentSource(source / ".env"), {"DISCORD_TOKEN": "test"})
    assert stat.S_IMODE((source / ".env").stat().st_mode) == 0o600


@pytest.mark.parametrize("mode", [0o775, 0o777])
def test_primary_group_membership_is_not_trust(tmp_path, mode):
    source = tmp_path / "source"
    source.mkdir()
    source.chmod(mode)
    context = resolve_startup_context(source / "config.yml")
    with pytest.raises(RuntimeError, match="writable"):
        provision_initialization_parent(context.initialization_state_path)
    with pytest.raises(EnvironmentSourceError, match="writable"):
        edit_environment(EnvironmentSource(source / ".env"), {"DISCORD_TOKEN": "test"})


def test_policy_never_allows_world_write_or_other_owner(tmp_path, monkeypatch):
    from src.config import source_trust

    monkeypatch.setattr(source_trust, "_read_policy", lambda: {
        "version": 1, "trusted_owner_groups": [{"uid": os.geteuid(), "gid": os.getegid()}]
    })
    source = tmp_path / "source"
    source.mkdir()
    source.chmod(0o777)
    assert not source_trust.trusted_group_write(
        source.stat(), owner_uid=os.geteuid(), directory=source
    )
    source.chmod(0o775)
    assert not source_trust.trusted_group_write(
        source.stat(), owner_uid=os.geteuid() + 1, directory=source
    )


def test_user_writable_policy_is_not_authority(tmp_path, monkeypatch):
    from src.config import source_trust

    policy = tmp_path / "policy.json"
    policy.write_text(json.dumps({"version": 1, "trusted_owner_groups": [
        {"uid": os.geteuid(), "gid": os.getegid()}
    ]}))
    monkeypatch.setattr(source_trust, "_POLICY_PATH", policy)
    tmp_path.chmod(0o775)
    assert not source_trust.trusted_group_write(
        tmp_path.stat(), owner_uid=os.geteuid(), directory=tmp_path
    )


@pytest.mark.parametrize("policy", [
    None, {}, {"version": True, "trusted_owner_groups": []},
    {"version": 1, "trusted_owner_groups": [{"uid": True, "gid": 1}]},
    {"version": 1, "trusted_owner_groups": [{"uid": -1, "gid": 1}]},
    {"version": 1, "trusted_owner_groups": "all"},
])
def test_malformed_policy_never_delegates(tmp_path, monkeypatch, policy):
    from src.config import source_trust

    monkeypatch.setattr(source_trust, "_read_policy", lambda: policy)
    tmp_path.chmod(0o775)
    assert not source_trust.trusted_group_write(
        tmp_path.stat(), owner_uid=os.geteuid(), directory=tmp_path
    )


def test_acl_and_unknown_acl_errors_are_not_group_delegation(tmp_path, monkeypatch):
    from src.config import source_trust

    monkeypatch.setattr(source_trust, "_read_policy", lambda: {
        "version": 1, "trusted_owner_groups": [{"uid": os.geteuid(), "gid": os.getegid()}]
    })
    tmp_path.chmod(0o775)
    assert not source_trust.trusted_group_write(tmp_path.stat(), owner_uid=os.geteuid())
    monkeypatch.setattr(source_trust.os, "getxattr", lambda *a: b"acl")
    assert not source_trust.trusted_group_write(
        tmp_path.stat(), owner_uid=os.geteuid(), directory=tmp_path
    )
    def unreadable_acl(*args):
        raise PermissionError("cannot verify ACL")
    monkeypatch.setattr(source_trust.os, "getxattr", unreadable_acl)
    assert not source_trust.trusted_group_write(
        tmp_path.stat(), owner_uid=os.geteuid(), directory=tmp_path
    )


@pytest.mark.parametrize("failure", [
    None, "ancestor_owner", "ancestor_mode", "parent_owner", "file_owner",
    "file_mode", "nonregular", "oversize", "overread", "duplicate", "invalid_json",
])
def test_root_policy_reader_verifies_descriptor_metadata(monkeypatch, failure):
    """Model root-owned descriptors without creating privileged system files."""
    from src.config import source_trust

    opened = []
    closed = []

    def open_fd(path, flags, **kwargs):
        assert flags & os.O_NOFOLLOW
        opened.append(path)
        return len(opened)

    def fstat(fd):
        mode = stat.S_IFREG | 0o644 if fd == 4 else stat.S_IFDIR | 0o755
        uid = 0
        if (failure, fd) in {("ancestor_owner", 1), ("parent_owner", 3), ("file_owner", 4)}:
            uid = 1000
        if (failure, fd) in {("ancestor_mode", 1), ("file_mode", 4)}:
            mode |= 0o020
        if failure == "nonregular" and fd == 4:
            mode = stat.S_IFIFO | 0o644
        size = 20000 if failure == "oversize" and fd == 4 else 64
        return SimpleNamespace(st_mode=mode, st_uid=uid, st_size=size)

    payload = b'{"version":1,"trusted_owner_groups":[]}'
    if failure == "duplicate":
        payload = b'{"version":1,"version":1}'
    if failure == "invalid_json":
        payload = b'{broken'
    if failure == "overread":
        payload = b'x' * 17000
    monkeypatch.setattr(source_trust.os, "open", open_fd)
    monkeypatch.setattr(source_trust.os, "fstat", fstat)
    monkeypatch.setattr(source_trust.os, "close", closed.append)
    monkeypatch.setattr(source_trust.os, "fdopen", lambda *a: io.BytesIO(payload))
    if failure is None:
        assert source_trust._read_policy() == {"version": 1, "trusted_owner_groups": []}
    else:
        with pytest.raises(ValueError):
            source_trust._read_policy()
    assert 1 in closed
