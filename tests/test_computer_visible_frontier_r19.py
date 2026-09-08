"""Visible controls survive the actual late-toolbar/hidden-docker Qt shape."""

import pytest

from src.computer.runtime.accessibility import PrimitiveError
from tests.test_computer_qt_accessibility_r19 import WINDOW, Node, guard, setup


def attach(parent, children):
    parent.children = children
    for child in children:
        child.parent = parent


def test_krita_49_root_children_late_toolbar_depth_four_capture_restore_readback():
    access, root, _, _, _ = setup(attached=True)
    fields = [Node("Size", "spin button", text="40"), Node("Opacity", "spin button", text="100")]
    toolbar = Node(
        "Brushes and Stuff", "tool bar", children=[Node(children=[Node(children=fields)])]
    )
    children = []
    hidden = []
    for index in range(49):
        if index == 45:
            children.append(toolbar)
        elif index in (0, 1, 2, 4, 9, 19, 41, 43, 44):
            children.append(
                Node(
                    f"visible resource {index}",
                    children=[
                        Node(children=[Node(f"resource {index}-{j}") for j in range(128)])
                        for _ in range(2)
                    ],
                )
            )
        else:
            docker = Node(f"hidden docker {index}", "frame", children=[Node(), Node()])
            docker.states.discard(3)
            docker.get_child_count = lambda: pytest.fail("hidden subtree expanded")
            hidden.append(docker)
            children.append(docker)
    attach(root, children)
    nodes, status, private = access.capture(guard)
    assert status == "available" and len(nodes) <= 128
    targets = [row for row in nodes if "replace_field" in row["capabilities"]]
    assert [row["name"] for row in targets] == ["Size", "Opacity"]
    assert [row["depth"] for row in targets] == [4, 4]
    assert all(row["name"] not in {node.name for node in hidden} for row in nodes)
    access.stable(guard)
    saved = private[targets[1]["handle"]]
    access.restore(saved, guard)
    access.execute(
        dict(
            type="replace_field",
            target=saved["handle"],
            observation_id=saved["observation_id"],
            text="75",
        ),
        WINDOW,
        guard,
    )
    assert fields[1].calls == ["75"]
    assert access.read_field(saved["handle"], WINDOW, guard) == {
        "text": "75",
        "text_complete": True,
    }


def test_hidden_componentless_structure_does_not_hide_visible_field():
    access, _, _, toolbar, _ = setup()
    toolbar.states.difference_update({3, 4})
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available"
    assert any(row["name"] == "Size" and "replace_field" in row["capabilities"] for row in nodes)


@pytest.mark.parametrize("kind", ["hidden", "defunct", "broken"])
def test_pruned_frontier_skips_expensive_snapshot_and_children(kind):
    access, root, _, _, _ = setup()
    node = Node("not actionable", "menu", children=[Node(text="hidden")])
    if kind == "hidden":
        node.states.discard(3)
    elif kind == "defunct":
        node.states.add(5)
    else:
        node.get_state_set = lambda: (_ for _ in ()).throw(RuntimeError("gone"))
    node.get_name = lambda: pytest.fail("pruned node was snapshotted")
    node.get_child_count = lambda: pytest.fail("pruned node was expanded")
    attach(root, [node, *root.children])
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available" and len(nodes) == 3
    assert nodes[-1]["name"] == "Size"


def test_probe_budget_bounds_hidden_fanout_without_spending_public_slots():
    access, root, _, _, _ = setup()
    probes = []
    parents = []
    for index in range(16):
        children = [Node() for _ in range(128)]
        for child in children:
            child.states.discard(3)
        parent = Node(f"parent {index}", children=children)
        original = parent.get_child_at_index

        def tracked(index, original=original):
            probes.append(index)
            return original(index)

        parent.get_child_at_index = tracked
        parents.append(parent)
    attach(root, parents)
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available" and len(nodes) == 17
    assert len(probes) == 128 * 7 - len(parents)


def test_cancellation_during_cheap_probe_propagates():
    access, _, _, toolbar, _ = setup()

    def cancelled():
        raise PrimitiveError("rejected", "cancelled frontier")

    toolbar.get_state_set = cancelled
    with pytest.raises(PrimitiveError, match="cancelled frontier"):
        access.snapshot(WINDOW, "obs", guard)


def test_editable_sibling_priority_survives_many_visible_leaf_resources():
    access, root, _, _, _ = setup()
    fields = [Node("last editable", "text", text="original")]
    attach(root, [Node(f"leaf {index}") for index in range(126)] + fields)
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available" and len(nodes) == 128
    assert nodes[1]["name"] == "last editable"
    assert "replace_field" in nodes[1]["capabilities"]


@pytest.mark.parametrize("change", ["root", "ancestor", "edge", "missing"])
def test_linear_stability_checks_all_retained_vertices_and_edges(change):
    access, root, fields, toolbar, _ = setup(attached=True)
    access.capture(guard)
    if change == "root":
        root.name += " changed"
    elif change == "ancestor":
        toolbar.bounds = (0, 0, 1, 1)
        toolbar.component = True
    elif change == "edge":
        fields[0].parent = root
    else:
        handle = next(key for key, ref in access.references.items() if ref.node == toolbar)
        del access.references[handle]
    with pytest.raises(PrimitiveError, match="changed during capture"):
        access.stable(guard)


def test_presentation_edge_uses_real_native_lineage_and_detects_later_changes():
    access, root, fields, _, _ = setup(attached=True)
    fields[0].parent = root
    nodes, status, _ = access.capture(guard)
    assert status == "available" and len(nodes) == 3
    access.stable(guard)
    fields[0].parent = Node("replacement ancestor")
    with pytest.raises(PrimitiveError, match="ancestry left"):
        access.stable(guard)


def test_stable_metadata_and_scope_guards_scale_with_vertices_not_depth():
    access, _, _, toolbar, _ = setup(attached=True, fields=[])
    parent = toolbar
    for depth in range(2, 7):
        child = Node(f"depth {depth}", "text", text=str(depth))
        attach(parent, [child])
        parent = child
    nodes, status, _ = access.capture(guard)
    assert status == "available" and len(nodes) == 7
    checked, guards = [], []
    original = access._data

    def measured(node):
        checked.append(node)
        return original(node)

    access._data = measured
    access.stable(lambda: guards.append(True))
    assert len(checked) == len(nodes) and len(guards) == len(nodes) + 1


def test_toolbar_resource_subtree_does_not_starve_nested_fields():
    access, _, _, toolbar, _ = setup()
    toolbar.role = "tool bar"
    fields = [Node("nested field", "text", text="42")]
    attach(
        toolbar,
        [
            Node("popup", "menu", children=[Node(str(i)) for i in range(128)]),
            Node(children=[Node(children=fields)]),
        ],
    )
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available"
    target = next(row for row in nodes if row["name"] == "nested field")
    assert "replace_field" in target["capabilities"] and target["depth"] == 4
