"""Production adapter contracts with explicit fakes, never a desktop connection."""

import io
import os
import sys
import time
from types import SimpleNamespace

import pytest
from PIL import Image

from src.computer.admission import CompositorIdentity, InputAdmission
from src.computer.models import ComputerError
from src.computer.runtime import wayland_backend as backend
from src.computer.runtime import wayland_guardian as guardian
from src.computer.runtime.wayland_identity import MappedObject, _hash_object


def png(color="white"):
    output = io.BytesIO()
    Image.new("RGB", (80, 60), color).save(output, format="PNG")
    return output.getvalue()


PUBLIC = CompositorIdentity("gnome-shell", "48.7", "native", "a" * 64)
SCOPE = {
    "source_digest": "s",
    "focus_digest": "f",
    "bounds_digest": "b",
    "application": {"pid": 456},
    "compositor": {"pid": 123},
    "bounds": {"x": 5, "y": 5, "width": 60, "height": 45},
}


class Portal:
    def __init__(self, *args, runtime_identity_callback=None):
        self.alive = True
        self.current_generation = 1
        self.eis_peer = {"pid": 123, "uid": os.geteuid()}
        self.source = {
            "node_id": 1,
            "mapping_id": "mapping",
            "source_type": 1,
            "position": [0, 0],
            "size": [80, 60],
            "session_handle": "/test/session",
        }
        self.color = "white"
        self.clock_verified = True
        self.callback = runtime_identity_callback

    async def open(self, timeout_seconds):
        self.callback({"pid": os.getpid(), "start_ticks": 1})
        return {"streams": [[1, self.source]], "devices": 3}

    async def connect_eis(self):
        return os.open("/dev/null", os.O_RDONLY)

    async def capture(self, node_id):
        return {
            "source_metadata": dict(self.source),
            "image": png(self.color),
            "width": 80,
            "height": 60,
            "captured_at": time.monotonic(),
            "clock_verified": self.clock_verified,
            "generation": self.current_generation,
        }

    async def close(self):
        self.alive = False
        return {
            "process_reaped": True,
            "session_close_acknowledged": True,
            "connection_closed": True,
            "cleanup_errors": [],
        }


class Scope:
    def __init__(self, **kwargs):
        self.scope = SCOPE

    async def identity(self):
        return {"pid": 123, "uid": os.geteuid()}

    async def snapshot(self, metadata):
        return {**self.scope, "observed_monotonic_ns": time.monotonic_ns()}

    async def close(self):
        pass


class Guardian:
    def __init__(self, *args):
        self.alive = True
        self.commands = []

    async def start(self, fd, mapping_id):
        os.close(fd)
        return {"width": 80, "height": 60}

    async def select(self, mapping_id):
        return {"width": 80, "height": 60}

    async def refresh_scope(self, deadline_ns):
        pass

    async def act(self, command, *, scope_deadline_ns=None):
        self.commands.append(command)
        return {"event": "action_done", "release_submitted": True}

    async def close(self):
        self.alive = False
        return {"process_reaped": True, "release_submitted": True}


@pytest.fixture
def adapter(monkeypatch):
    async def identity(*args):
        return SimpleNamespace(public=lambda: PUBLIC)

    async def revalidate(*args):
        return True

    async def qualify(identity):
        return InputAdmission(
            "eligible",
            "qualified",
            "Private behavioral probe passed.",
            "Start a new session after stack changes.",
            PUBLIC,
            "same_stack_disposable",
            ("held_button_owner_eof",),
        )

    monkeypatch.setattr(backend, "WaylandPortalSession", Portal)
    monkeypatch.setattr(backend, "GNOMEWaylandScopeProvider", Scope)
    monkeypatch.setattr(backend, "WaylandGuardian", Guardian)
    monkeypatch.setattr(backend, "capture_identity", identity)
    monkeypatch.setattr(backend, "revalidate_identity", revalidate)
    return backend.WaylandRuntimeBackend(
        enabled=True,
        app_profile="xed",
        config=backend.WaylandSessionConfig("unix:path=/private/bus", os.geteuid()),
        qualify=qualify,
    )


def action(frame, kind="type", **extra):
    return {
        "type": kind,
        "source_id": frame.source.source_id,
        "source_revision": frame.source.source_revision,
        "consent_generation": frame.source.consent_generation,
        "expected": {"type": "visual_change"},
        **(extra or {"text": "test"}),
    }


@pytest.mark.asyncio
async def test_qualified_adapter_repeated_actions_and_stop(adapter):
    assert not adapter.input_supported
    result = await adapter.start("session1")
    assert result["input_supported"]
    for _ in range(2):
        frame = await adapter.observe()
        receipt = await adapter.act(action(frame))
        assert receipt["status"] == "executed"
        assert receipt["postcondition"]["target_application_matches"]
        with pytest.raises(ComputerError):
            await adapter.act(action(frame))
    assert adapter._guardian.commands == ["T 74657374"] * 2
    assert (await adapter.stop())["stopped"]


@pytest.mark.asyncio
@pytest.mark.parametrize("fault", ["raster", "focus", "stale", "outside", "clock"])
async def test_changed_or_unmapped_evidence_refuses(adapter, fault):
    await adapter.start("session1")
    frame = await adapter.observe()
    request = action(frame)
    if fault == "raster":
        adapter._portal.color = "red"
    elif fault == "focus":
        adapter._scope_provider.scope = {**SCOPE, "focus_digest": "changed"}
    elif fault == "stale":
        request["source_revision"] += 1
    elif fault == "outside":
        request = action(frame, "click", x=0, y=0)
    else:
        adapter._portal.clock_verified = False
    with pytest.raises(ComputerError):
        await adapter.act(request)
    assert not adapter._guardian.commands
    await adapter.stop()


@pytest.mark.asyncio
async def test_precise_capture_only_probe_refusal(adapter):
    async def refuse(identity):
        return InputAdmission(
            "refused",
            "mutter_eis_drop_device_button_index_bug",
            "Held button did not release.",
            "Install a corrected compositor.",
            PUBLIC,
        )

    adapter._qualify = refuse
    result = await adapter.start("session1")
    assert result["capture_only"]
    assert result["input_admission"]["code"] == "mutter_eis_drop_device_button_index_bug"
    assert not (await adapter.observe()).focused
    await adapter.stop()


@pytest.mark.asyncio
async def test_actual_owned_subprocess_protocol_and_reap(tmp_path, monkeypatch):
    # Explicit fake primitive; this is a transport test, not libei delivery proof.
    executable = tmp_path / "fake-guardian"
    executable.write_text(
        f"#!{sys.executable}\n"
        + """import json,sys,os
os.close(int(sys.argv[1]))
def emit(event): print(json.dumps({'event':event,'width':80,'height':60}),flush=True)
emit('ready')
for line in sys.stdin:
 if line.startswith('S '): emit('selected')
 elif line.startswith('B '): emit('begun')
 elif line.startswith(('T ','J ','P ')): emit('release_sent'); emit('action_done')
 elif line.strip() in ('C','R'): break
emit('closed')
"""
    )
    executable.chmod(0o700)
    monkeypatch.setattr(guardian, "trusted_binary", lambda path: None)
    identities = []
    child = guardian.WaylandGuardian(str(executable), os.geteuid(), identities.append)
    fd = os.open("/dev/null", os.O_RDONLY)
    await child.start(fd, "mapping")
    with pytest.raises(OSError):
        os.fstat(fd)
    for command in ("T 41", "J ctrl+a"):
        await child.select("mapping")
        assert (await child.act(command))["release_submitted"]
    closed = await child.close()
    assert closed["process_reaped"] and closed["release_submitted"]
    assert identities[0] is None and identities[1]["pid"] > 1
    assert child._child.returncode == 0


def test_hash_rejects_wrong_mapped_inode(tmp_path):
    path = tmp_path / "library"
    path.write_bytes(b"fixture")
    with pytest.raises(ComputerError, match="untrusted_or_replaced"):
        _hash_object(str(path), "0:0", 12345, proc_path=str(path))


def test_bounded_capture_geometry():
    result, width, height = backend._bounded_png(png(), 80, 60)
    assert result and (width, height) == (80, 60)
    with pytest.raises(ComputerError):
        backend._bounded_png(png(), 40000, 1)
    assert MappedObject("/x", "0:1", 1, "a").sha256 == "a"
