"""Private grounding regression tests. Fakes never connect to an X display."""

import threading
import time
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime.accessibility import PrimitiveError
from src.computer.runtime.backend import LinuxDesktopBackend, RuntimeFailure
from src.computer.runtime.primitives import NativeDesktop
from src.computer.runtime.protocol import pack_blob


class NoAccessibility:
    def snapshot(self, *args):
        return [], "unsupported"


class Desktop(NativeDesktop):
    def __init__(self):
        self.now = 100.0
        self.window = {"id": 17, "pid": 1001, "title": "Scratch", "x": 10, "y": 10,
                       "width": 90, "height": 80, "modal": False}
        self.identity = (700, 991)
        self.pointer = (20, 20)
        self.pointer_window = 17
        self.extent = (120, 100)
        self.commands = []
        self.focused = True
        self.after_release = None
        self.injection_enabled = True
        super().__init__(clock=lambda: self.now, command_runner=self.command,
                         accessibility_backend=NoAccessibility())

    def _window(self):
        if not self.focused:
            raise PrimitiveError("rejected", "No focus")
        return dict(self.window)

    def _identity(self, pid):
        return self.identity

    def _capture(self):
        self._root_extent = self.extent
        return b"\x00" * (self.extent[0] * self.extent[1] * 3), *self.extent, "RGB"

    def command(self, argv, **kwargs):
        command = argv[1]
        self.commands.append(command)
        assert kwargs["env"]["DISPLAY"] == ":77"
        if command == "getdisplaygeometry":
            return " ".join(map(str, self.extent))
        if command == "mousemove" and self.injection_enabled:
            self.pointer = tuple(map(int, argv[2:]))
        if command == "mouseup" and self.after_release:
            self.after_release()
        if command == "getmouselocation":
            return f"X={self.pointer[0]}\nY={self.pointer[1]}\nWINDOW={self.pointer_window}"
        return ""


def native_action(obs):
    return {"type": "click", "x": 25, "y": 26,
            "source_revision": obs["source_revision"], "expected_window": obs["window"],
            "observation_id": obs["observation_id"],
            "expected": {"type": "pointer_at", "x": 25, "y": 26}}


def backend_action(frame):
    return {"type": "click", "source_id": frame.source.source_id,
            "source_revision": frame.source.source_revision,
            "consent_generation": frame.source.consent_generation, "x": 25, "y": 26,
            "expected": {"type": "pointer_at", "x": 25, "y": 26}}


def test_stable_revision_and_distinct_observation_tokens():
    d = Desktop()
    a, b = d.snapshot(packed=True), d.snapshot(packed=True)
    assert a["source_revision"] == b["source_revision"] == 1
    assert a["observation_id"] != b["observation_id"]
    for change in (lambda: d.window.update(x=11), lambda: d.window.update(id=18),
                   lambda: setattr(d, "identity", (700, 992)),
                   lambda: setattr(d, "extent", (121, 100))):
        previous = d._source_revision
        change()
        assert d.snapshot(packed=True)["source_revision"] == previous + 1


def test_modal_identity_stable_but_changed_modal_invalidates():
    d = Desktop()
    d.window["modal"] = True
    a, b = d.snapshot(packed=True), d.snapshot(packed=True)
    assert a["modal_id"] and a["modal_id"] == b["modal_id"]
    d.commands.clear()
    with pytest.raises(PrimitiveError):
        d.grounded_execute(native_action(b), threading.Event())
    assert d.commands == []


@pytest.mark.parametrize("change", ["focus", "window", "identity", "extent", "modal"])
def test_late_changed_evidence_rejects_without_input(change):
    d = Desktop()
    action = native_action(d.snapshot(packed=True))
    if change == "focus":
        d.focused = False
    elif change == "window":
        d.window["id"] = 18
    elif change == "identity":
        d.identity = (700, 992)
    elif change == "modal":
        d.window["modal"] = True
    else:
        d.extent = (121, 100)
    if change == "extent":
        with pytest.raises(PrimitiveError, match="pixels changed"):
            d.grounded_execute(action, threading.Event())
        return
    receipt = d.grounded_execute(action, threading.Event())
    assert not receipt["injected"]
    assert not set(d.commands) & {"mousemove", "mousedown", "mouseup"}


@pytest.mark.parametrize("change", ["expired", "token", "revision", "kind", "expected"])
def test_invalid_binding_rejected_before_primitive(change):
    d = Desktop()
    action = native_action(d.snapshot(packed=True))
    if change == "expired":
        d.now += 6
    elif change == "token":
        action["observation_id"] = "stale"
    elif change == "revision":
        action["source_revision"] += 1
    elif change == "kind":
        action["type"] = "key"
    else:
        action["expected"]["x"] += 1
    d.commands.clear()
    with pytest.raises(PrimitiveError):
        d.grounded_execute(action, threading.Event())
    assert d.commands == []


def test_independent_post_release_query_and_no_replay():
    d = Desktop()
    action = native_action(d.snapshot(packed=True))
    receipt = d.grounded_execute(action, threading.Event())
    assert receipt["status"] == "verified"
    assert receipt["postcondition"] == {
        "type": "pointer_at", "status": "satisfied", "method": "pointer_query_after_release",
        "target_window_matches": True,
        "actual": {"x": 25, "y": 26}}
    last_query = len(d.commands) - 1 - d.commands[::-1].index("getmouselocation")
    assert d.commands.index("mouseup") < last_query
    with pytest.raises(PrimitiveError):
        d.grounded_execute(action, threading.Event())


@pytest.mark.parametrize("change", ["pointer", "focus", "modal", "cancel"])
def test_injected_is_not_verified_when_postcondition_evidence_fails(change):
    d = Desktop()
    action = native_action(d.snapshot(packed=True))
    cancelled = threading.Event()

    def changed():
        if change == "pointer":
            d.pointer = (21, 22)
        elif change == "focus":
            d.focused = False
        elif change == "modal":
            d.window["modal"] = True
        else:
            cancelled.set()

    d.after_release = changed
    receipt = d.grounded_execute(action, cancelled)
    assert receipt["injected"] and receipt["released"]
    assert receipt["status"] != "verified"
    assert receipt["postcondition"]["status"] != "satisfied"


def test_successful_command_without_actual_motion_is_not_success():
    d = Desktop()
    action = native_action(d.snapshot(packed=True))
    d.injection_enabled = False
    receipt = d.grounded_execute(action, threading.Event())
    assert receipt["status"] == "unknown"
    assert "mousedown" not in d.commands


async def observed_backend(width=120, height=100):
    b = LinuxDesktopBackend()
    observation = {"window": {"private": "not public"}, "observation_id": "worker-token",
                   "source_revision": 1, "width": width, "height": height,
                   "image": pack_blob(bytes(width * height * 3)), "raster_mode": "RGB",
                   "focused": True, "modal_id": None}
    b._rpc = AsyncMock(return_value={"observation": observation})
    frame = await b.observe()
    return b, frame


@pytest.mark.asyncio
async def test_actual_bounded_render_mapping_and_no_private_window_metadata():
    b, frame = await observed_backend(1920, 1080)
    assert frame.width <= 1600 and frame.height <= 1000
    assert frame.width * frame.height <= 2_000_000
    assert len(frame.image_bytes) <= 2 * 1024 * 1024
    assert frame.source.pixel_width == 1920
    assert frame.source.pixel_to_input is not None
    assert "private" not in repr(frame.source.public())
    b._rpc = AsyncMock(return_value={"receipt": {"status": "executed", "injected": True,
                                                "released": True}})
    action = backend_action(frame)
    await b.act(action)
    sent = b._rpc.call_args.kwargs["action"]
    mapped = frame.source.input_point(frame.delivered_to_source, 25, 26, frame.width, frame.height)
    assert (sent["x"], sent["y"]) == tuple(map(int, mapped))
    with pytest.raises(RuntimeFailure):
        await b.act(action)


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["pause", "expiry", "source", "revision", "consent",
                                     "native_override", "kind", "expected", "bool"])
async def test_legacy_name_never_bypasses_validation(change):
    b, frame = await observed_backend()
    action = backend_action(frame)
    if change == "pause":
        b._paused = True
    elif change == "expiry":
        b._captured_at = time.monotonic() - 6
    elif change in {"source", "revision", "consent"}:
        key = {"source": "source_id", "revision": "source_revision",
               "consent": "consent_generation"}[change]
        action[key] = "stale" if change == "source" else 9
    elif change == "native_override":
        action["expected_window"] = {}
    elif change == "kind":
        action["type"] = "key"
    elif change == "bool":
        action["source_revision"] = True
    else:
        action["expected"]["x"] += 1
    b._rpc.reset_mock()
    with pytest.raises(RuntimeFailure):
        await b._legacy_private_act(action)
    b._rpc.assert_not_called()


@pytest.mark.asyncio
async def test_lost_reply_consumes_adapter_binding():
    b, frame = await observed_backend()
    b._rpc = AsyncMock(side_effect=RuntimeFailure("lost response"))
    action = backend_action(frame)
    with pytest.raises(RuntimeFailure):
        await b.act(action)
    with pytest.raises(RuntimeFailure):
        await b.act(action)
    assert b._rpc.await_count == 1


def test_native_display_fence():
    with pytest.raises(ValueError):
        NativeDesktop(display=":0")


def test_failed_release_quarantines_future_worker_actions():
    d = Desktop()
    action = native_action(d.snapshot(packed=True))
    d._release = lambda: False
    receipt = d.grounded_execute(action, threading.Event())
    assert receipt["status"] == "unknown"
    assert receipt["released"] is False
    fresh = native_action(d.snapshot(packed=True))
    with pytest.raises(PrimitiveError):
        d.grounded_execute(fresh, threading.Event())


@pytest.mark.asyncio
async def test_failed_release_receipt_fences_adapter():
    b, frame = await observed_backend()
    b._rpc = AsyncMock(return_value={"receipt": {
        "status": "unknown", "injected": True, "released": False}})
    await b.act(backend_action(frame))
    assert b._paused and b._frame is None


def test_visual_change_after_controller_check_rejects_before_input():
    d = Desktop()
    action = native_action(d.snapshot(packed=True))
    d._capture = lambda: (b"\xff" * (120 * 100 * 3), 120, 100, "RGB")
    with pytest.raises(PrimitiveError, match="pixels changed"):
        d.grounded_execute(action, threading.Event())
    assert not set(d.commands) & {"mousemove", "mousedown", "mouseup"}


def test_post_release_pointer_window_mismatch_is_explicit_evidence():
    d = Desktop()
    action = native_action(d.snapshot(packed=True))
    d.after_release = lambda: setattr(d, "pointer_window", 18)
    receipt = d.grounded_execute(action, threading.Event())
    assert receipt["status"] == "not_satisfied"
    assert receipt["postcondition"]["target_window_matches"] is False
    assert receipt["postcondition"]["actual"] == {"x": 25, "y": 26}
