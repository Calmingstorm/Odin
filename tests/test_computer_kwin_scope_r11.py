"""KWin provider authentication and shared scope contract. No desktop access."""
import asyncio
import json
import os

import pytest

from src.computer.runtime import kwin_scope as kwin
from src.computer.runtime import wayland_scope as common

SOURCE = {"node_id": 71, "session_handle": "/org/freedesktop/portal/desktop/session/a/b",
          "source_type": 1, "position": [0, 0], "size": [1280, 720], "mapping_id": "output-1"}


class Provider(kwin.KWinWaylandScopeProvider):
    def __init__(self):
        super().__init__(bus_address="unix:path=/tmp/isolated-kwin-test-bus",
                         expected_uid=os.geteuid(), expected_compositor_pid=700)
        self.owner = self.shell_owner = ":1.70"
        self.pid, self.uid = 700, os.geteuid()
        self.identity_patch = {}
        self.snapshot_patch = {}
        self.snapshots = 0

    async def _daemon(self, member, name):
        if member == "GetNameOwner":
            return self.shell_owner if name == "org.kde.KWin" else self.owner
        return self.pid if member == "GetConnectionUnixProcessID" else self.uid

    async def _call(self, destination, path, interface, member, signature="", body=None):
        assert destination == self.owner
        assert path == kwin.OBJECT_PATH and interface == kwin.INTERFACE
        if member == "Identity":
            return [json.dumps({"challenge": body[0], "native_wayland": True,
                                "compositor_name": "kwin_wayland", "compositor_version": "6.3.6",
                                "backend_class": "KWinVirtualBackend", "backend": "native"}
                               | self.identity_patch)]
        request = json.loads(body[0])
        self.snapshots += 1
        return [json.dumps({"protocol": 1, "challenge": request["challenge"],
                            "source_digest": request["source_digest"],
                            "native_wayland": True, "safe_focus": True, "pid": 800,
                            "title": "An ordinary document", "wm_class": "org.kde.kwrite",
                            "modal": False, "focus_serial": 1, "focus_token": "44",
                            "bounds": {"x": 10, "y": 20, "width": 800, "height": 600}}
                           | self.snapshot_patch)]


@pytest.fixture
def provider(monkeypatch):
    def process(pid, uid, profile=None):
        return {"pid": pid, "uid": uid, "start_ticks": 345,
                "exe": "/usr/bin/kwin_wayland" if pid == 700 else "/home/user/custom-app",
                "exe_identity": [5, pid], "trusted_executable": pid == 700}

    monkeypatch.setattr(common, "_process_identity", process)
    monkeypatch.setattr(common, "_trusted_executable", lambda path: (path, (5, 700)))
    return Provider()


def test_identity_matches_real_compositor_connection_and_version(provider):
    identity = asyncio.run(provider.identity())
    assert identity["compositor_name"] == "kwin_wayland"
    assert identity["compositor_version"] == "6.3.6"
    assert identity["backend"] == "native"


@pytest.mark.parametrize("attr,value", [("owner", "org.kde.KWin"),
                                       ("shell_owner", ":1.99"), ("pid", 900), ("uid", 65534)])
def test_metadata_proxy_or_wrong_session_cannot_authenticate(provider, attr, value):
    setattr(provider, attr, value)
    with pytest.raises(common.WaylandScopeFailure, match="provider_untrusted"):
        asyncio.run(provider.identity())


@pytest.mark.parametrize("patch", [{"challenge": "replay"}, {"native_wayland": False},
                                   {"compositor_name": "gnome-shell"},
                                   {"compositor_version": "6.3.6\x00"},
                                   {"backend_class": "PretendBackend"},
                                   {"backend": "x11-nested"}])
def test_untrusted_identity_fields_fail_closed(provider, patch):
    provider.identity_patch = patch
    with pytest.raises(common.WaylandScopeFailure):
        asyncio.run(provider.identity())


def test_owner_restart_requires_new_session(provider):
    asyncio.run(provider.identity())
    provider.owner = provider.shell_owner = ":1.71"
    with pytest.raises(common.WaylandScopeFailure, match="owner_changed"):
        asyncio.run(provider.identity())


def test_executable_inode_must_match_trusted_kwin(provider, monkeypatch):
    monkeypatch.setattr(common, "_trusted_executable", lambda path: (path, (5, 701)))
    with pytest.raises(common.WaylandScopeFailure, match="provider_untrusted"):
        asyncio.run(provider.identity())


def test_generic_application_keeps_provenance_without_executable_allowlist(provider):
    result = asyncio.run(provider.snapshot(SOURCE))
    assert result["authenticated"] and result["safe_focus"]
    assert result["application"]["exe"] == "/home/user/custom-app"
    assert result["application"]["trusted_executable"] is False
    assert provider.snapshots == 2


@pytest.mark.parametrize("title,wm_class", [("Terminal", "org.kde.konsole"),
                                           ("Password", "custom-app"),
                                           ("Authentication", "polkit-kde"),
                                           ("Credential", "kwalletmanager")])
def test_same_denied_class_boundary_as_gnome(provider, title, wm_class):
    provider.snapshot_patch = {"title": title, "wm_class": wm_class}
    with pytest.raises(common.WaylandScopeFailure):
        asyncio.run(provider.snapshot(SOURCE))


@pytest.mark.parametrize("patch", [{"challenge": "replay"}, {"source_digest": "other"},
                                   {"safe_focus": False}, {"native_wayland": False},
                                   {"modal": "yes"}, {"title": "x" * 4097},
                                   {"bounds": {"x": 1200, "y": 0, "width": 800, "height": 600}}])
def test_shared_snapshot_policy_rejects_bad_evidence(provider, patch):
    provider.snapshot_patch = patch
    with pytest.raises(common.WaylandScopeFailure):
        asyncio.run(provider.snapshot(SOURCE))


def test_ordinary_file_dialog_is_not_a_denied_class(provider):
    provider.snapshot_patch = {"title": "Save As", "wm_class": "xdg-desktop-portal-kde",
                               "modal": True}
    result = asyncio.run(provider.snapshot(SOURCE))
    assert result["safe_focus"]
