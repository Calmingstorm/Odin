"""Private routes accelerate lookup without authorizing substitute identities."""

import copy

import pytest

from src.computer.runtime.accessibility import PrimitiveError
from tests.test_computer_qt_accessibility_r19 import WINDOW, Node, guard, setup


def captured():
    access, root, fields, toolbar, app = setup(attached=True)
    nodes, status, private = access.capture(guard)
    assert status == "available"
    saved = private[next(n["handle"] for n in nodes if n["name"] == "Size")]
    return access, root, fields[0], toolbar, app, saved


def test_private_route_restores_only_observed_path_and_executes_with_fresh_guard():
    access, root, field, toolbar, _, saved = captured()
    assert saved["route"] == [0, 0]
    # An unrelated broken subtree cannot starve a known identity's input lease.
    sibling = Node("Unrelated resource browser")
    sibling.parent = root
    root.children.append(sibling)
    sibling.get_child_at_index = lambda _: pytest.fail("unrelated subtree walked")
    access.capture = lambda _: pytest.fail("whole discovery repeated")
    calls = []
    access.restore(saved, lambda: calls.append("guard"))
    access.execute(
        dict(
            type="replace_field",
            target=saved["handle"],
            observation_id=saved["observation_id"],
            text="4",
        ),
        WINDOW,
        lambda: calls.append("guard"),
        before_effect=lambda: calls.append("effect"),
    )
    assert field.calls == ["4"]
    assert calls.count("guard") > 6
    assert calls.count("effect") == 1
    assert access.read_field(saved["handle"], WINDOW, guard)["text"] == "4"


@pytest.mark.parametrize("route", [None, "0", [True], [-1], [128], [0] * 7, [0, 0, 0]])
def test_invalid_routes_never_authorize_input(route):
    access, _, field, _, _, saved = captured()
    saved["route"] = route
    with pytest.raises((PrimitiveError, IndexError)):
        access.restore(saved, guard)
    assert field.calls == []


@pytest.mark.parametrize("change", ["substitute", "ancestry", "field", "root", "pid", "owner"])
def test_route_is_not_authority_and_all_identity_checks_survive(change):
    access, root, field, toolbar, _, saved = captured()
    if change == "substitute":
        replacement = Node("Size", "spin button", text="40")
        replacement.parent = toolbar
        toolbar.children[0] = replacement
    elif change == "ancestry":
        field.parent = Node("Other parent")
    elif change == "field":
        field.text = "41"
    elif change == "root":
        root.name = "Other document"
    elif change == "pid":
        field.pid = 102
    else:
        access.owners[":1.42"] = [102, 1001]
    with pytest.raises(PrimitiveError):
        access.restore(saved, guard)
    assert field.calls == []


def test_scope_failure_during_route_read_stops_before_effect():
    access, _, field, _, _, saved = captured()
    calls = 0

    def revoked():
        nonlocal calls
        calls += 1
        if calls == 5:
            raise TimeoutError("unchanged input deadline")

    with pytest.raises(TimeoutError):
        access.restore(saved, revoked)
    assert calls == 5
    assert field.calls == []


def test_route_missing_retains_legacy_identity_validation():
    access, _, field, _, _, saved = captured()
    saved = copy.deepcopy(saved)
    del saved["route"]
    assert access.restore(saved, guard).node is field
