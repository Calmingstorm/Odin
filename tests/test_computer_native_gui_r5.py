"""No-display native strictness, modal policy and independently measured effects."""

import hashlib
import threading
from types import SimpleNamespace

import pytest

from src.computer.runtime.accessibility import PrimitiveError
from src.computer.runtime.backend import LinuxDesktopBackend
from src.computer.runtime.primitives import NativeDesktop
from src.computer.runtime.protocol import pack_blob
from tests.test_computer_runtime_grounding_r4 import Desktop, native_action


@pytest.fixture(autouse=True)
def private_keymap(monkeypatch):
    """Native key mapping is covered separately, never contact X from these fakes."""

    def resolve(self, modifiers, symbol=None):
        names = {"ctrl": "Control_L", "alt": "Alt_L", "shift": "Shift_L", "super": "Super_L"}
        return [names[name] for name in modifiers] + ([symbol] if symbol is not None else [])

    monkeypatch.setattr(Desktop, "_resolve_key_plan", resolve)


def visual_action(desktop, kind="click", **fields):
    observed = desktop.snapshot(packed=True)
    action = native_action(observed)
    action.update(type=kind, expected={"type": "visual_change"})
    if kind != "click":
        action.pop("x")
        action.pop("y")
    action.update(fields)
    return action


@pytest.mark.parametrize(
    "kind,fields",
    [
        ("type", {"text": "hello"}),
        ("key", {"chord": "Return"}),
        ("key", {"chord": "alt+F4"}),
        ("key", {"chord": "F12"}),
        ("polyline", {"points": [[20, 20], [25, 26]], "duration": 0}),
        ("click", {}),
    ],
)
def test_visual_change_independently_measured_and_consumed(kind, fields):
    d = Desktop()
    d._release_typed_keys = lambda: None
    action = visual_action(d, kind, **fields)
    original = d._capture

    def release():
        d._capture = lambda: (b"\x01" * (120 * 100 * 3), 120, 100, "RGB")
        return True

    d._release = release
    receipt = d.grounded_execute(action, threading.Event())
    assert receipt["status"] == "verified"
    proof = receipt["postcondition"]
    assert proof["target_application_matches"] is True
    assert proof["actual"] == {
        "before_sha256": hashlib.sha256(original()[0]).hexdigest(),
        "after_sha256": hashlib.sha256(d._capture()[0]).hexdigest(),
    }
    with pytest.raises(PrimitiveError):
        d.grounded_execute(action, threading.Event())


def test_no_visual_change_not_fabricated():
    d = Desktop()
    receipt = d.grounded_execute(visual_action(d), threading.Event())
    assert receipt["status"] == "not_satisfied"
    actual = receipt["postcondition"]["actual"]
    assert actual["before_sha256"] == actual["after_sha256"]


def test_visual_change_cannot_verify_foreign_process_transition():
    d = Desktop()
    action = visual_action(d)

    def release():
        d.window["pid"] += 1
        d._capture = lambda: (b"\x01" * (120 * 100 * 3), 120, 100, "RGB")
        return True

    d._release = release
    receipt = d.grounded_execute(action, threading.Event())
    assert receipt["status"] == "not_satisfied"
    assert receipt["postcondition"]["target_application_matches"] is False


def test_visual_change_release_failure_quarantines():
    d = Desktop()
    action = visual_action(d)
    d._release = lambda: False
    receipt = d.grounded_execute(action, threading.Event())
    assert receipt["released"] is False
    assert receipt["status"] == "unknown"
    with pytest.raises(PrimitiveError):
        d.grounded_execute(visual_action(d), threading.Event())


def test_visual_change_cancelled_before_input():
    d = Desktop()
    action = visual_action(d)
    cancelled = threading.Event()
    cancelled.set()
    d.commands.clear()
    with pytest.raises(PrimitiveError, match="cancelled"):
        d.grounded_execute(action, cancelled)
    assert d.commands == []


@pytest.mark.parametrize(
    "kind,fields",
    [
        ("type", {"text": "\0"}),
        ("type", {"text": "x" * 513}),
        ("type", {"text": "\ud800"}),
        ("type", {"text": 1}),
        ("key", {"chord": "alt++F4"}),
        ("key", {"chord": []}),
        ("polyline", {"points": [[20, True], [25, 26]], "duration": 0}),
        ("polyline", {"points": [[20, 20]], "duration": 0}),
        ("polyline", {"points": [[20, 20], [25, 26]], "duration": float("nan")}),
        ("polyline", {"points": [[20, 20], [25, 26]], "duration": 1.1}),
        ("click", {"x": True}),
        ("click", {"x": 25.0}),
        ("click", {"button": "right"}),
        ("click", {"expected_modal": "invented"}),
    ],
)
def test_strict_new_field_validation_no_input(kind, fields):
    d = Desktop()
    action = visual_action(d, kind, **fields)
    d.commands.clear()
    with pytest.raises(PrimitiveError):
        d.grounded_execute(action, threading.Event())
    assert d.commands == []


@pytest.mark.parametrize(
    "policy,token,admitted",
    [
        ("safe_application", "correct", True),
        ("safe_application", "stale", False),
        ("unknown", "correct", False),
        ("denied", "correct", False),
        (None, "correct", False),
        ("safe_application", None, False),
    ],
)
def test_modal_requires_server_policy_and_exact_token(policy, token, admitted):
    d = Desktop()
    d.window["modal"] = True
    action = visual_action(d)
    d._modal_kind = policy
    if token is not None:
        action["expected_modal"] = d._modal_id if token == "correct" else token
    if admitted:
        assert d.grounded_execute(action, threading.Event())["injected"]
    else:
        with pytest.raises(PrimitiveError, match="modal"):
            d.grounded_execute(action, threading.Event())


@pytest.mark.parametrize(
    "change,kind",
    [
        ("none", "safe_application"),
        ("foreign", "unknown"),
        ("terminal", "safe_application"),
        ("password", "safe_application"),
        ("buttons", "unknown"),
    ],
)
def test_drawing_onboarding_classification_is_bounded(change, kind):
    d = Desktop()
    d._profile = "drawing"
    d._same_app_transient = lambda _: change != "foreign"
    window = {**d.window, "modal": True}
    nodes = [
        {"role": "alert", "name": "Information"},
        {"role": "push button", "name": "No"},
        {"role": "push button", "name": "Yes"},
    ]
    if change in ("terminal", "password"):
        nodes.append({"role": change, "name": ""})
    if change == "buttons":
        nodes.pop()
    # R16: label keywords are not application/task authority. This classifier
    # measures a same-process known startup modal; it does not authorize the
    # assistant to operate terminals, credentials or security prompts.
    assert d._classify_modal(window, nodes) == kind


def test_later_information_dialog_does_not_inherit_startup_admission():
    d = Desktop()
    d._profile = "drawing"
    d._same_app_transient = lambda _: True
    d.snapshot(packed=True)
    nodes = [
        {"role": "alert", "name": "Information"},
        {"role": "push button", "name": "No"},
        {"role": "push button", "name": "Yes"},
    ]
    assert d._classify_modal({**d.window, "modal": True}, nodes) == "unknown"


@pytest.mark.parametrize("path,expected", [([1, 2, 17, 18], True), ([1, 2, 99], False)])
def test_pointer_native_tree_proof_rejects_sibling(monkeypatch, path, expected):
    from Xlib import display

    d = Desktop()
    d._runner = None
    d._deadline = 102
    nodes = {i: SimpleNamespace(id=i) for i in path}
    for index, node in enumerate(nodes.values()):
        child = nodes[path[index + 1]] if index + 1 < len(path) else 0
        node.query_pointer = lambda child=child: SimpleNamespace(child=child)
    closed = []
    monkeypatch.setattr(
        display,
        "Display",
        lambda target: SimpleNamespace(
            screen=lambda: SimpleNamespace(root=nodes[1]), close=lambda: closed.append(target)
        ),
    )
    assert NativeDesktop._pointer_target(d, 17) is expected
    assert closed == [":77"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind,fields",
    [
        ("type", {"text": "test"}),
        ("key", {"chord": "Return"}),
        ("polyline", {"points": [[20, 20], [25, 26]], "duration": 0}),
    ],
)
async def test_native_through_adapter_visual_proof(kind, fields):
    d = Desktop()
    d._release_typed_keys = lambda: None
    backend = LinuxDesktopBackend(enabled=True)

    async def rpc(operation, **kwargs):
        if operation == "observe":
            o = d.snapshot(packed=True)
            o["image"] = pack_blob(o.pop("image_bytes"))
            return {"observation": o}
        assert operation == "act"

        def release():
            d._capture = lambda: (b"\x01" * (120 * 100 * 3), 120, 100, "RGB")
            return True

        d._release = release
        return {"receipt": d.grounded_execute(kwargs["action"], threading.Event())}

    backend._rpc = rpc
    frame = await backend.observe()
    receipt = await backend.act(
        dict(
            type=kind,
            source_id=frame.source.source_id,
            source_revision=frame.source.source_revision,
            consent_generation=frame.source.consent_generation,
            expected={"type": "visual_change"},
            **fields,
        )
    )
    assert receipt["status"] == "verified"
    assert receipt["postcondition"]["source_id"] == frame.source.source_id
    assert receipt["postcondition"]["target_application_matches"] is True
    assert backend._frame is None
