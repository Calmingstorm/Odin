"""Read-only attached adapter tests. None connect to the operator's display."""
import asyncio
import base64

import pytest

from src.computer.geometry import AffineTransform
from src.computer.runtime import x11_attached as module
from src.computer.runtime.x11_attached import (
    INPUT_BLOCKER,
    AttachedFailure,
    X11AttachedBackend,
    attachment_configuration,
    worker_environment,
)


def backend(**kw):
    return X11AttachedBackend(enabled=True, display_name=":177",
                              monitor_names=["primary", "secondary", "left", "bottom"], **kw)


def sources():
    return [{"name": n, "width": w, "height": h, "seal": str(i), "index": i}
            for i, (n, w, h) in enumerate([
                ("primary", 3440, 1440), ("secondary", 2560, 1440),
                ("left", 1920, 1080), ("bottom", 1920, 1080)])]


def reply():
    return {"ok": True, "source_width": 20, "source_height": 10,
            "width": 20, "height": 10, "resize_scale": [1, 1],
            "delivered_to_source": AffineTransform().public(),
            "image": base64.b64encode(b"fixture").decode()}


@pytest.mark.parametrize("display", ["", "localhost:0", ":0.0", ":-1", ":0\n"])
def test_explicit_local_display_only(display):
    with pytest.raises(AttachedFailure):
        attachment_configuration(display, "", ["primary"], "drawing")


@pytest.mark.parametrize("names", [[], ["a", "a"], ["a\n"], [1], "a", ["a"] * 17])
def test_explicit_unique_source_names(names):
    with pytest.raises(AttachedFailure):
        attachment_configuration(":177", "", names, "drawing")


def test_no_ambient_secrets_display_cookie_or_bus(monkeypatch):
    monkeypatch.setenv("DISPLAY", ":0")
    monkeypatch.setenv("SECRET", "never-inherited")
    env = worker_environment("")
    assert "DISPLAY" not in env and "SECRET" not in env
    assert "DBUS_SESSION_BUS_ADDRESS" not in env
    assert env["XAUTHORITY"] == "/dev/null" and env["HOME"] == "/nonexistent"


def test_privileged_worker_explicit_operator_only():
    b = backend(runtime_sudo=True)
    argv = b._worker_argv("x11_guardian.py")
    assert argv[:4] == ["/usr/bin/sudo", "-n", "/usr/bin/env", "-i"]
    assert "XAUTHORITY=/dev/null" in argv
    assert argv[-2] == "-I" and argv[-1].endswith("/x11_guardian.py")
    assert "sudo" not in " ".join(backend()._worker_argv("x11_guardian.py"))


@pytest.mark.asyncio
async def test_disabled_does_not_spawn(monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail("disabled feature spawned")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    b = X11AttachedBackend(display_name=":177", monitor_names=["screen"])
    with pytest.raises(AttachedFailure, match="disabled"):
        await b.start("test")


@pytest.mark.asyncio
async def test_four_opaque_sources_capture_only_and_selection(monkeypatch):
    b = backend()
    seen = []

    async def read(operation, *, selected=None):
        seen.append(selected)
        return {"sources": sources()} if operation == "sources" else reply()
    monkeypatch.setattr(b, "_read_worker", read)
    started = await b.start("test")
    assert len(started["sources"]) == 4 and not started["input_supported"]
    assert started["capture_only"] and b.capabilities.owned_input_release == "unknown"
    for source in started["sources"]:
        assert set(source) == {"source_id", "label", "width", "height"}
        await b.select_source(source["source_id"])
        frame = await b.observe()
        assert frame.source.source_id == source["source_id"]
        assert not frame.scope.input_sources and frame.source.input_region_id is None
        assert not frame.focused
        assert seen[-1]["name"] == source["label"]
    with pytest.raises(AttachedFailure, match="not_granted"):
        await b.select_source("ungranted")


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["click", "type", "key", "polyline", "raw", None])
async def test_input_fails_closed_even_with_forged_capability(kind):
    b = backend()
    b.input_supported = True  # No instance flag creates an input route.
    with pytest.raises(AttachedFailure, match=INPUT_BLOCKER):
        await b.act({"type": kind, "verified": True, "source_id": "fake"})


@pytest.mark.asyncio
async def test_pause_resume_requires_generation_and_detach_is_application_preserving(monkeypatch):
    b = backend()
    async def read(operation, **kwargs):
        return {"sources": sources()}
    monkeypatch.setattr(b, "_read_worker", read)
    await b.start("test")
    await b.pause()
    with pytest.raises(AttachedFailure, match="not_active"):
        await b.observe()
    with pytest.raises(AttachedFailure, match="renewed"):
        await b.resume(consent_generation=1)
    await b.resume(consent_generation=2)
    receipt = await b.detach()
    assert receipt == await b.detach()
    assert receipt["stopped"] and receipt["applications_preserved"]
    assert receipt["owned_devices"] == "not_created" and not receipt["input_was_enabled"]


class StubProcess:
    def __init__(self, hang=True):
        self.returncode = None
        self.stdin = self
        self.stdout = self
        self.hang = hang
        self.terminations = self.kills = self.waits = 0
        self.reaped = asyncio.Event()

    def write(self, data):
        self.request = data

    async def drain(self):
        pass

    def close(self):
        pass

    async def readline(self):
        if self.hang:
            await self.reaped.wait()
            return b""
        return b'{"ok":true,"sources":[]}\n'

    def terminate(self):
        self.terminations += 1
        self.returncode = -15
        self.reaped.set()

    def kill(self):
        self.kills += 1
        self.returncode = -9
        self.reaped.set()

    async def wait(self):
        self.waits += 1
        await self.reaped.wait()
        return self.returncode


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["cancel", "detach", "timeout"])
async def test_hung_read_owned_process_reaped_and_no_application_target(monkeypatch, mode):
    child = StubProcess()
    spawned = asyncio.Event()
    async def spawn(*argv, **kwargs):
        assert argv[1] == "-I" and argv[2].endswith("x11_attached_worker.py")
        assert kwargs["start_new_session"] and kwargs["env"]["XAUTHORITY"] == "/dev/null"
        spawned.set()
        return child
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(module, "CAPTURE_TIMEOUT", .025)
    b = backend()
    task = asyncio.create_task(b._read_worker("sources"))
    await spawned.wait()
    if mode == "cancel":
        task.cancel()
    elif mode == "detach":
        await b.detach()
    with pytest.raises((AttachedFailure, asyncio.CancelledError)):
        await task
    assert child.terminations == 1 and child.kills == 0
    assert child.waits >= 1 and not b._children


@pytest.mark.asyncio
async def test_worker_error_does_not_expose_native_details(monkeypatch):
    b = backend()
    child = StubProcess(False)
    child.returncode = 1
    child.reaped.set()
    async def spawn(*args, **kwargs):
        return child
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    with pytest.raises(AttachedFailure, match="capture_worker_failed_or_revoked"):
        await b._read_worker("sources")
