"""A widget buffer is not its application's adopted value."""

import threading

import pytest

from src.computer.effects import effect_receipt
from tests.test_computer_qt_accessibility_r19 import WINDOW, Node, guard, setup
from tests.test_computer_r19_effects import receipt
from tests.test_computer_runtime_primitives import Desktop


class DeferredField(Node):
    """Model the native Qt regression: EditableText does not emit editingFinished."""

    def __init__(self):
        super().__init__("Hex", "text", text="#000000")
        self.adopted = self.text

    def reopen(self):
        self.text = self.adopted

    def explicit_commit(self):
        self.adopted = self.text


@pytest.mark.parametrize("attached", [False, True])
def test_exact_node_buffer_readback_never_claims_application_adoption(attached):
    field = DeferredField()
    access, _, _, _, _ = setup(attached=attached, fields=[field])
    if attached:
        nodes, _, private = access.capture(guard)
    else:
        nodes, _ = access.snapshot(WINDOW, "observation", guard)
    target = next(n for n in nodes if n["name"] == "Hex")["handle"]
    if attached:
        access.restore(private[target], guard)
    access.execute(
        dict(
            type="replace_field",
            observation_id=access.observation_id,
            target=target,
            text="#87dccc",
        ),
        WINDOW,
        guard,
    )
    actual = access.read_field(target, WINDOW, guard)
    assert actual["text"] == "#87dccc"
    assert field.adopted == "#000000"
    raw, observation = receipt(None)
    raw["postcondition"].update(
        type="field_text_equals",
        target=target,
        method="accessibility_text_after_release",
        actual=actual,
        # Neither an adapter verdict nor an unsubstantiated flag is proof.
        status="satisfied",
        application_adoption="proven",
    )
    raw["status"] = "verified"
    result = effect_receipt(
        raw, observation, dict(type="field_text_equals", target=target, text="#87dccc")
    )
    assert result["status"] == "executed"
    assert result["execution"] == {"sent": True, "injected": True, "released": True}
    assert result["verification"]["status"] == "unavailable"
    assert result["verification"]["text_matches"] is True
    assert result["verification"]["application_adoption"] == "unproven"
    field.reopen()
    assert field.text == "#000000"
    # Positive control: explicit application commit, then reopening, proves the
    # model really distinguishes text editing from its application state.
    field.get_editable_text_iface().set_text_contents("#87dccc")
    field.explicit_commit()
    field.reopen()
    assert field.text == "#87dccc"


@pytest.mark.parametrize("returned", ["new", "normalized"])
def test_private_worker_does_not_publish_raw_verified_for_buffer_readback(returned):
    desktop = Desktop()
    access, _, _, _, _ = setup(fields=[Node("Field", "text", text="old")])
    desktop.commands.window.update(WINDOW)
    desktop.commands.focus = WINDOW["id"]
    desktop._owned = lambda pid: pid == WINDOW["pid"]
    runner = desktop._runner
    desktop._runner = lambda argv, **kw: (
        "120 100" if argv[1] == "getdisplaygeometry" else runner(argv, **kw)
    )
    desktop._a11y = access
    desktop._capture = lambda: (bytes(120 * 100 * 3), 120, 100, "RGB")
    snapshot = desktop.snapshot(packed=True)
    desktop._root_extent = (120, 100)
    target = next(n for n in snapshot["accessibility"] if n["name"] == "Field")["handle"]
    node = access.references[target].node
    native_set = node.get_editable_text_iface

    def changed():
        iface = native_set()
        iface.set_text_contents = lambda value: setattr(node, "text", returned) or True
        return iface

    node.get_editable_text_iface = changed
    raw = desktop.grounded_execute(
        dict(
            type="replace_field",
            observation_id=snapshot["observation_id"],
            source_revision=snapshot["source_revision"],
            expected_window=snapshot["window"],
            target=target,
            text="new",
            expected=dict(type="field_text_equals", target=target, text="new"),
        ),
        threading.Event(),
    )
    assert raw["released"] is True
    assert raw["injected"] is True
    assert raw["status"] == ("executed" if returned == "new" else "not_satisfied")
    assert raw["postcondition"]["application_adoption"] == "unproven"
