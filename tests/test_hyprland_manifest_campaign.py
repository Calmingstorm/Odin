"""Trust-boundary regression coverage for the provisioned Hyprland manifest."""

import hashlib
import json
from types import SimpleNamespace

import pytest

from src.computer.runtime import hyprland_plugin
from src.computer.runtime.hyprland_plugin import (
    HyprlandPluginError,
    PluginApproval,
    read_trusted_plugin_manifest,
)


def _root_owned(stat_result):
    """Keep real inode identity/mode while modeling the production root owner."""
    return SimpleNamespace(
        st_mode=stat_result.st_mode & ~0o022,
        st_uid=0,
        st_dev=stat_result.st_dev,
        st_ino=stat_result.st_ino,
        st_size=stat_result.st_size,
        st_mtime_ns=stat_result.st_mtime_ns,
        st_ctime_ns=stat_result.st_ctime_ns,
    )


def _trusted_filesystem(monkeypatch):
    real_lstat = hyprland_plugin.os.lstat
    real_fstat = hyprland_plugin.os.fstat
    monkeypatch.setattr(hyprland_plugin.os, "lstat", lambda path: _root_owned(real_lstat(path)))
    monkeypatch.setattr(hyprland_plugin.os, "fstat", lambda fd: _root_owned(real_fstat(fd)))


def _manifest(tmp_path, **overrides):
    payload = b"manifest parser fixture"
    digest = hashlib.sha256(payload).hexdigest()
    artifact = tmp_path / f"odin-hyprland-scope-{digest}.so"
    artifact.write_bytes(payload)
    value = {
        "schema": 1,
        "hyprland_version": "0.55.2",
        "hyprland_commit": "a" * 40,
        "runtime_qualified": True,
        "companion_build_id": "b" * 64,
        "plugin_sha256": digest,
        "plugin_filename": artifact.name,
        "wayland_protocols_version": "1.42",
        "wayland_protocols_commit": "c" * 40,
        "hyprwayland_scanner_commit": "d" * 40,
        "runtime_loaded": True,
    }
    value.update(overrides)
    manifest = tmp_path / "hyprland-plugin-manifest.json"
    manifest.write_text(json.dumps(value), encoding="utf-8")
    return manifest, artifact, value


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("runtime_qualified", False),
        ("runtime_qualified", 1),
        ("schema", True),
    ],
    ids=("runtime-qualified-false", "runtime-qualified-boolwrong", "schema-bool"),
)
def test_read_trusted_plugin_manifest_rejects_unqualified_or_boolean_schema(
    tmp_path, monkeypatch, field, replacement
):
    manifest, _artifact, _value = _manifest(tmp_path, **{field: replacement})
    _trusted_filesystem(monkeypatch)
    verified = []
    monkeypatch.setattr(
        PluginApproval,
        "verify_artifact",
        lambda *_args, **_kwargs: verified.append(True),
    )

    with pytest.raises(HyprlandPluginError, match="hyprland_plugin_manifest_invalid"):
        read_trusted_plugin_manifest(str(manifest))

    # Artifact verification is downstream of parse/trust validation.  An
    # unqualified manifest must never reach an activation-capable approval.
    assert verified == []


def test_read_trusted_plugin_manifest_accepts_explicit_qualification_and_build_metadata(
    tmp_path, monkeypatch
):
    manifest, artifact, _value = _manifest(tmp_path)
    _trusted_filesystem(monkeypatch)
    verified = []
    monkeypatch.setattr(
        PluginApproval,
        "verify_artifact",
        lambda self, *, approved_root: verified.append((self.path, approved_root)),
    )

    trusted = read_trusted_plugin_manifest(str(manifest))

    assert trusted.path == str(artifact)
    assert trusted.approval.runtime_qualified is True
    assert verified == [(str(artifact), str(tmp_path))]
