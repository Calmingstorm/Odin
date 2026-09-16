"""F8: cache reads, not authorization after changed/corrupt durable state."""
import os

from src.config.initialization import InitializationMode, InitializationStore, InstallationBinding


def make_store(tmp_path):
    parent = tmp_path / "private"
    parent.mkdir(mode=0o700)
    return InitializationStore(
        parent / "state.json", InstallationBinding("test", tmp_path / "config.yml")
    )


def test_unchanged_gate_reads_do_not_lock_or_read_contents(tmp_path, monkeypatch):
    store = make_store(tmp_path)
    store.provision_fresh()
    assert store.cached_state().mode is InitializationMode.PENDING
    def unexpected_read(**kwargs):
        raise AssertionError("disk read")
    monkeypatch.setattr(store, "state", unexpected_read)
    assert store.cached_state().mode is InitializationMode.PENDING


def test_completion_and_bind_decision_invalidate(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    store.cached_state()
    store.complete(lambda: None)
    assert store.cached_state().mode is InitializationMode.COMPLETE
    store.set_bind_decision(loopback_restricted=False, explicit_widening=True)
    assert store.cached_state().explicit_widening is True


def test_external_instance_and_corruption_invalidate(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    store.cached_state()
    other = InitializationStore(store.path, store.binding)
    other.complete(lambda: None)
    assert store.cached_state().mode is InitializationMode.COMPLETE
    store.path.write_text("{broken")
    assert store.cached_state().mode is InitializationMode.RECOVERY


def test_deleted_known_state_does_not_legacy_migrate(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    store.cached_state(legacy_loopback_restricted=False)
    store.path.unlink()
    assert store.cached_state(legacy_loopback_restricted=False).mode is InitializationMode.RECOVERY
    assert not store.path.exists()


def test_changed_parent_mode_fails_closed(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    store.cached_state()
    store.path.parent.chmod(0o777)
    assert store.cached_state().mode is InitializationMode.RECOVERY


def test_replaced_state_and_operator_repair_are_seen(tmp_path):
    store = make_store(tmp_path)
    store.provision_fresh()
    original = store.path.read_bytes()
    store.cached_state()
    replacement = store.path.with_name("replacement")
    replacement.write_text("null")
    replacement.chmod(0o600)
    os.replace(replacement, store.path)
    assert store.cached_state().mode is InitializationMode.RECOVERY
    store.path.write_bytes(original)
    assert store.cached_state().mode is InitializationMode.PENDING
