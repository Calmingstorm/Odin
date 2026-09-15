"""Offline build/load trust and real lifecycle wiring; no desktop input."""

import json
import os
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_plugin as plugin
from src.computer.runtime.hyprland_backend import HyprlandRuntimeBackend
from tests.test_computer_hyprland_preinventory_r42 import config
from tests.test_hyprland_manifest_campaign import _manifest, _trusted_filesystem
from tests.test_hyprland_plugin_campaign import IPC, identity


@pytest.mark.parametrize("qualified", [False, True, None])
def test_recovery_metadata_is_not_load_authority(tmp_path, monkeypatch, qualified):
    manifest, _, value = _manifest(tmp_path, runtime_qualified=qualified)
    if qualified is None:
        del value["runtime_qualified"]
        manifest.write_text(json.dumps(value))
    _trusted_filesystem(monkeypatch)
    approval = plugin.read_trusted_plugin_manifest(str(manifest)).approval
    assert approval.auto_management_approved is True
    assert not hasattr(approval, "runtime_qualified")
    value.pop("auto_management_approved")
    manifest.write_text(json.dumps(value))
    with pytest.raises(plugin.HyprlandPluginError, match="manifest_invalid"):
        plugin.read_trusted_plugin_manifest(str(manifest))


def test_installed_document_manifest_resolves_fixed_library_root(tmp_path, monkeypatch):
    assert plugin._INSTALLED_MANIFEST == Path(
        "/usr/local/share/doc/odin-hyprland/build-identity.json")
    assert plugin._INSTALLED_PLUGIN_ROOT == Path("/usr/local/lib/odin")
    doc, library = tmp_path / "share/doc/odin-hyprland", tmp_path / "lib/odin"
    doc.mkdir(parents=True)
    library.mkdir(parents=True)
    manifest, artifact, _ = _manifest(doc)
    installed = doc / "build-identity.json"
    manifest.rename(installed)
    artifact.rename(library / artifact.name)
    monkeypatch.setattr(plugin, "_INSTALLED_MANIFEST", installed)
    monkeypatch.setattr(plugin, "_INSTALLED_PLUGIN_ROOT", library)
    _trusted_filesystem(monkeypatch)
    trusted = plugin.read_trusted_plugin_manifest(str(installed))
    assert trusted.path == str(library / artifact.name)
    # The document location must not allow a same-named sibling to override ELF.
    artifact.write_bytes(b"untrusted sibling")
    assert plugin.read_trusted_plugin_manifest(str(installed)).path == trusted.path
    (library / artifact.name).write_bytes(b"changed installed image")
    with pytest.raises(plugin.HyprlandPluginError, match="manifest_invalid"):
        plugin.read_trusted_plugin_manifest(str(installed))


@pytest.mark.parametrize("already_loaded", [False, True])
@pytest.mark.parametrize("qualification_scope", ["same-boot-retained-original-witness-v1", None])
@pytest.mark.parametrize("fault", [None, "mapped", "build_id", "artifact", "abi"])
async def test_prepare_plugin_real_trust_and_manager_without_recovery_qualification(
    tmp_path, monkeypatch, already_loaded, fault, qualification_scope,
):
    manifest, artifact, value = _manifest(tmp_path)
    assert value["runtime_qualified"] is False
    if qualification_scope is not None:
        value["runtime_qualification_scope"] = qualification_scope
        manifest.write_text(json.dumps(value))
    _trusted_filesystem(monkeypatch)
    approved = plugin.read_trusted_plugin_manifest(str(manifest)).approval
    pinned = identity(approved)
    ipc = IPC(approved.path)
    if already_loaded:
        ipc.loaded.append(approved.path)
    if fault == "build_id":
        async def wrong_build(_path):
            return "f" * 64
        ipc.plugin_instance_status = wrong_build

    # Actual mapped-image verification on an isolated fake /proc tree.
    proc = tmp_path / "proc"
    maps = proc / str(pinned.process.pid)
    (maps / "map_files").mkdir(parents=True)
    (maps / "maps").write_text(f"1000-2000 r-xp 0 0 0 {artifact}\n")
    if fault != "mapped":
        os.link(artifact, maps / "map_files/1000-2000")
    verifier = plugin.ProcMappedPluginVerifier(proc_root=str(proc), geteuid=lambda: 0)
    monkeypatch.setattr(plugin, "ProcMappedPluginVerifier", lambda: verifier)
    monkeypatch.setattr(plugin, "HyprlandPluginIPC", lambda **_kwargs: ipc)
    # Model the immutable installation root in this temporary fixture only.
    verify_artifact = plugin.PluginApproval.verify_artifact
    monkeypatch.setattr(
        plugin.PluginApproval, "verify_artifact",
        lambda self, **_kwargs: verify_artifact(self, approved_root=str(tmp_path)),
    )
    if fault == "artifact":
        artifact.write_bytes(b"tampered")
    if fault == "abi":
        value["hyprland_commit"] = "f" * 40
        manifest.write_text(json.dumps(value))
    backend = HyprlandRuntimeBackend(
        config=config(plugin_manifest_path=str(manifest)), enabled=True)
    if fault:
        errors = {
            "mapped": "mapped_image_unverified", "build_id": "companion_identity_mismatch",
            "artifact": "manifest_invalid", "abi": "compositor_pin_mismatch",
        }
        with pytest.raises(ComputerError, match=errors[fault]):
            await backend._prepare_plugin(pinned, ipc_path="/fixture/command.sock")
    else:
        await backend._prepare_plugin(pinned, ipc_path="/fixture/command.sock")
        await backend._prepare_plugin(pinned, ipc_path="/fixture/command.sock")
    assert ipc.loads == (0 if already_loaded or fault in {"artifact", "abi"} else 1)
    assert backend._guardian is None
    # Loading this non-qualified fixture remains permitted, but its artifact
    # cannot inherit the independently recorded exact native retirement tuple.
    assert backend._cross_incarnation.capability.runtime_qualified is False


def test_build_manifest_explicitly_separates_load_and_recovery_claims():
    script = Path("scripts/build-hyprland-input.sh").read_text()
    assert '"schema":2' in script
    assert '"auto_management_approved":true' in script
    assert '"runtime_qualified":%s' in script
    assert "qualified=false" in script
    assert 'grep -Fqx "$build_id $plugin_sha $guardian_sha"' in script
    assert '"runtime_qualification_scope":"same-boot-retained-original-witness-v1"' in script


@pytest.mark.parametrize("schema", [1, 2, True, 3])
@pytest.mark.parametrize("qualified", [False, True, "true"])
@pytest.mark.parametrize("artifact_mode", [0o644, 0o664, 0o646])
def test_existing_lab_harness_accepts_new_build_schema_without_claiming_qualification(
    tmp_path, schema, artifact_mode, qualified,
):
    from tests.test_hyprland_harness_exit_r48 import qualification

    manifest, artifact, _ = _manifest(
        tmp_path, schema=schema, runtime_qualified=qualified,
        hyprland_commit="39d7e209c79d451efab1b21151d5938289da838d",
    )
    # The lab harness requires its own UID and no group/world write bits.
    # Set fixture permissions explicitly rather than inheriting the runner umask;
    # unsafe modes below must still be rejected before any IPC.
    artifact.chmod(artifact_mode)
    harness = qualification.Harness.__new__(qualification.Harness)
    harness.a = SimpleNamespace(manifest=str(manifest))
    harness.uid = os.getuid()

    # Stop at the first IPC seam, after the actual offline manifest/hash checks.
    # This test never connects to a compositor or emits input.
    def no_ipc(*_args):
        raise qualification.Refusal("fixture IPC boundary")

    harness.call = no_ipc
    if type(schema) is not int or schema not in (1, 2):
        expected = "identity"
    elif type(qualified) is not bool:
        expected = "runtime_qualified invalid"
    elif artifact_mode & 0o022:
        expected = "plugin artifact type/owner/mode invalid"
    else:
        expected = "fixture IPC boundary"
    with pytest.raises(qualification.Refusal, match=expected):
        harness.manifest_check()


@pytest.mark.parametrize("value", [None, True, [], "all-recovery", ""])
def test_manifest_rejects_unknown_qualification_scope(tmp_path, monkeypatch, value):
    manifest, _, _ = _manifest(tmp_path, runtime_qualification_scope=value)
    _trusted_filesystem(monkeypatch)
    with pytest.raises(plugin.HyprlandPluginError, match="manifest_invalid"):
        plugin.read_trusted_plugin_manifest(str(manifest))
