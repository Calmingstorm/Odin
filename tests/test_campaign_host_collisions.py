import uuid

import pytest

from src.config.schema import ToolHost
from src.tools.hosts.registry import HostRegistry, deterministic_host_id


def host(identity=""):
    return ToolHost(address="example.invalid", ssh_user="test", host_id=identity)


@pytest.mark.parametrize("reverse", [False, True])
@pytest.mark.parametrize("legacy", [False, True])
def test_boot_preserves_but_never_targets_collision_members(tmp_path, reverse, legacy):
    identity = deterministic_host_id("alpha") if legacy else str(uuid.uuid4())
    entries = [("alpha", host("" if legacy else identity)), ("beta", host(identity)),
               ("healthy", host())]
    hosts = dict(reversed(entries) if reverse else entries)
    registry = HostRegistry(hosts, default_host="alpha", trust_dir=tmp_path)
    assert set(registry.configured_aliases()) == set(hosts)
    assert registry.active_aliases() == ("healthy",)
    assert registry.default_host == ""
    assert registry.acquire("alpha") is None
    assert registry.acquire("beta") is None
    assert registry.get("alpha").host_id == registry.get("beta").host_id == identity
    rows = {row["alias"]: row for row in registry.status_rows()}
    assert rows["alpha"]["trust_state"] == "identity_collision"
    assert rows["beta"]["trust_state"] == "identity_collision"
    assert "duplicate" in rows["alpha"]["diagnostic"].lower()
    registry.mark_test_result("alpha", {"ok": True})
    assert registry.acquire("alpha") is None
    lease = registry.acquire("healthy")
    assert lease is not None
    assert registry.force_revoke("alpha") == 0
    assert not lease.revoked
    lease.release()


@pytest.mark.parametrize("method", ["stage", "publish"])
def test_collision_mutation_rejected_before_any_publication(tmp_path, method):
    first = host(str(uuid.uuid4()))
    registry = HostRegistry({"alpha": first}, trust_dir=tmp_path)
    before = registry.snapshot()
    lease = registry.acquire("alpha")
    with pytest.raises(ValueError, match="Duplicate host identity"):
        getattr(registry, method)({"alpha": first, "beta": host(first.host_id)})
    assert registry.snapshot() is before
    assert registry.generation == 1
    assert not lease.revoked
    lease.release()


def test_removing_collision_restores_remaining_record_without_rewriting_id(tmp_path):
    identity = str(uuid.uuid4())
    registry = HostRegistry({"alpha": host(identity), "beta": host(identity)}, trust_dir=tmp_path)
    registry.publish({"alpha": host(identity)})
    lease = registry.acquire("alpha")
    assert lease is not None
    assert lease.target.host_id == identity
    lease.release()
