"""Qt-shaped discovery and observation-to-readback behavior contracts."""

from types import SimpleNamespace
from typing import Any

import pytest

from src.computer.runtime.accessibility import Accessibility, PrimitiveError
from src.computer.runtime.x11_accessibility import AttachedAccessibility, public_nodes

STATE = SimpleNamespace(
    ENABLED=1,
    SENSITIVE=2,
    SHOWING=3,
    VISIBLE=4,
    DEFUNCT=5,
    FOCUSABLE=6,
    ACTIVE=7,
    MODAL=8,
    FOCUSED=9,
)
WINDOW = dict(
    id=20, pid=101, title="Document - Krita", modal=False, x=10, y=20, width=800, height=600
)


class Node:
    serial = 0

    def __init__(self, name="", role="panel", *, children=(), component=True, text=None):
        Node.serial += 1
        self.path = f"/accessible/{Node.serial}"
        self.app = SimpleNamespace(bus_name=":1.42")
        self.name, self.role, self.component, self.text = name, role, component, text
        self.states = {1, 2, 3, 4, 6, 7}
        self.bounds = (10, 20, 800, 600) if role == "frame" else (40, 60, 80, 20)
        self.pid = 101
        self.parent = None
        self.children = list(children)
        self.calls = []
        for child in children:
            child.parent = self

    def clear_cache(self):
        pass

    def get_role_name(self):
        return self.role

    def get_name(self):
        return self.name

    def get_state_set(self):
        return SimpleNamespace(get_states=lambda: self.states, contains=self.states.__contains__)

    def get_component_iface(self):
        return (
            SimpleNamespace(
                get_extents=lambda _: SimpleNamespace(
                    **dict(zip(("x", "y", "width", "height"), self.bounds, strict=True))
                )
            )
            if self.component
            else None
        )

    def get_interfaces(self):
        return (["Component"] if self.component else []) + (
            ["Text", "EditableText"] if self.text is not None else []
        )

    def get_text_iface(self):
        return SimpleNamespace(
            get_character_count=lambda: len(self.text), get_text=lambda a, b: self.text[a:b]
        )

    def get_editable_text_iface(self):
        def set_text(text):
            self.calls.append(text)
            self.text = text
            return True

        return SimpleNamespace(set_text_contents=set_text)

    def get_process_id(self):
        return self.pid

    def get_child_count(self):
        return len(self.children)

    def get_child_at_index(self, i):
        return self.children[i]

    def get_parent(self):
        return self.parent


def setup(*, attached=False, fields=None, extra_roots=()):
    fields = fields if fields is not None else [Node("Size", "spin button", text="40")]
    toolbar = Node("Brush toolbar", children=fields, component=False)
    root = Node("Document", "frame", children=[toolbar])
    offscreen = Node("Offscreen", "window", component=False)
    app = Node("krita", "application", children=[offscreen, root, *extra_roots])
    desktop = Node(children=[app])
    api = SimpleNamespace(
        StateType=STATE, CoordType=SimpleNamespace(SCREEN=0), get_desktop=lambda _: desktop
    )
    access: Any
    if attached:
        connection = SimpleNamespace(get_display_name=lambda: ":99")
        scope = dict(
            process=dict(pid=101, uid=1001, start_ticks=456),
            fingerprint="scope",
            source_rect=(0, 0, 1280, 960),
        )
        access = AttachedAccessibility(connection, scope)
        access.window = lambda: dict(WINDOW)
        access.bus_id = "bus-guid"
        access.owners = {":1.42": [101, 1001]}
    else:
        access = Accessibility()
    access.api = api
    access._native_frame_bounds = lambda *_: (9, 0, 802, 621)
    return access, root, fields, toolbar, app


def guard():
    pass


def test_offscreen_without_component_keeps_real_root_and_structural_children():
    access, root, fields, _, _ = setup()
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available"
    assert nodes[0]["name"] == "Document"
    field = next(n for n in nodes if "replace_field" in n["capabilities"])
    assert access.references[field["handle"]].node is fields[0]
    assert access.references[field["handle"]].root is root
    assert nodes[1]["bounds"] == dict(x=0, y=0, width=0, height=0)
    assert nodes[1]["capabilities"] == []
    assert [n["name"] for n in public_nodes(nodes, (0, 0), (0, 0, 1280, 960))] == [
        "Document",
        "Size",
    ]


@pytest.mark.parametrize(
    "name,initial,value",
    [
        ("Size", "40", "10"),
        ("Opacity", "100", "75"),
        ("Hex", "#307b87", "#87dccc"),
    ],
)
def test_attached_capture_restore_replace_and_exact_native_readback(name, initial, value):
    access, root, fields, _, _ = setup(attached=True, fields=[Node(name, "text", text=initial)])
    nodes, status, private = access.capture(guard)
    assert status == "available"
    target = next(n for n in nodes if n["name"] == name)
    saved = private[target["handle"]]
    access.stable(guard)
    worker: Any = AttachedAccessibility(access.connection, access.scope)
    worker.api, worker.bus_id, worker.owners = access.api, access.bus_id, access.owners
    worker.window = access.window
    worker._native_frame_bounds = access._native_frame_bounds
    ref = worker.restore(saved, guard)
    assert ref.metadata["node_identity"] == target["node_identity"]
    effects = []
    worker.execute(
        dict(
            type="replace_field",
            target=target["handle"],
            observation_id=saved["observation_id"],
            text=value,
        ),
        WINDOW,
        guard,
        before_effect=lambda: effects.append("authorized"),
    )
    root.name = "Document modified"
    assert worker.read_field(target["handle"], WINDOW, guard) == {
        "text": value,
        "text_complete": True,
    }
    assert fields[0].calls == [value] and effects == ["authorized"]


@pytest.mark.parametrize(
    "change", ["ambiguous", "hidden", "defunct", "modal", "pid", "geometry", "inactive_title"]
)
def test_root_binding_fails_closed(change):
    access, root, _, _, app = setup()
    if change == "ambiguous":
        app.children.append(Node("Document", "frame"))
    elif change == "hidden":
        root.states.remove(3)
    elif change == "defunct":
        root.states.add(5)
    elif change == "modal":
        root.states.add(8)
    elif change == "pid":
        root.pid = 102
    elif change == "geometry":
        root.bounds = (10, 20, 799, 600)
    else:
        root.states.remove(7)
    assert access.snapshot(WINDOW, "obs", guard) == ([], "unsupported")
    assert access.references == {}


def test_exact_title_and_native_frame_geometry():
    access, root, _, _, _ = setup()
    root.name = WINDOW["title"]
    root.states.remove(7)
    assert access.snapshot(WINDOW, "obs", guard)[1] == "available"
    root.states.add(7)
    root.name = "Document"
    root.bounds = (9, 0, 802, 621)
    assert access.snapshot(WINDOW, "obs2", guard)[1] == "available"


@pytest.mark.parametrize("location", ["application", "desktop", "later_application"])
def test_root_prefix_cannot_authorize_identity_when_scan_is_incomplete(location):
    access, _, fields, _, app = setup()
    duplicate = Node("Document", "frame")
    if location == "application":
        # One app plus only 127 roots fit. The second identical frame is the
        # 128th root, immediately outside the formerly accepted prefix.
        app.children.extend(Node(component=False) for _ in range(125))
        app.children.append(duplicate)
    else:
        desktop = access.api.get_desktop(0)
        other_app = Node("krita", "application", children=[duplicate])
        if location == "desktop":
            siblings = [Node("other", "application") for _ in range(127)]
            for sibling in siblings:
                sibling.pid = 102
            desktop.children.extend([*siblings, other_app])
        else:
            # Exhausting the first app's budget must not hide another app.
            app.children.extend(Node(component=False) for _ in range(125))
            desktop.children.append(other_app)
    assert access.snapshot(WINDOW, "obs", guard) == ([], "unsupported")
    assert access.references == {}
    assert fields[0].calls == []


def test_complete_root_scan_at_exact_budget_still_binds_real_root():
    access, root, fields, _, app = setup()
    app.children.extend(Node(component=False) for _ in range(125))
    assert 1 + len(app.children) == 128
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available"
    target = next(n for n in nodes if n["name"] == "Size")
    ref = access.references[target["handle"]]
    assert ref.root is root and ref.node is fields[0]


def test_broken_auxiliary_skipped_but_guard_cancellation_propagates():
    access, _, _, _, app = setup()
    app.children[0].get_name = lambda: (_ for _ in ()).throw(RuntimeError("gone"))
    assert access.snapshot(WINDOW, "obs", guard)[1] == "available"

    def cancelled():
        raise PrimitiveError("rejected", "cancelled")

    with pytest.raises(PrimitiveError, match="cancelled"):
        access.snapshot(WINDOW, "obs", cancelled)


def test_shallow_fields_precede_large_menu_subtree():
    access, root, _, _, _ = setup()
    menu = Node("menu", children=[Node(str(i)) for i in range(150)])
    menu.parent = root
    root.children.insert(0, menu)
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available" and len(nodes) <= 128
    assert any(n["name"] == "Size" and "replace_field" in n["capabilities"] for n in nodes)


def test_deferred_breadth_keeps_all_six_fields_in_27_node_tree():
    fields = [Node(f"field {i}", "text", text=str(i)) for i in range(6)]
    access, root, _, toolbar, _ = setup(fields=fields)
    for i in range(19):
        panel = Node(f"empty panel {i}")
        panel.parent = root
        root.children.append(panel)
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available"
    assert len(nodes) == 27
    targets = [n for n in nodes if "replace_field" in n["capabilities"]]
    assert [n["name"] for n in targets] == [field.name for field in fields]
    assert [n["depth"] for n in nodes] == sorted(n["depth"] for n in nodes)
    toolbar_handle = next(n["handle"] for n in nodes if n["name"] == toolbar.name)
    assert [target["index"] for target in targets] == list(range(6))
    assert all(target["parent"] == toolbar_handle for target in targets)
    last = targets[-1]
    access.execute(
        dict(type="replace_field", target=last["handle"], observation_id="obs", text="42"),
        WINDOW,
        guard,
    )
    assert fields[-1].calls == ["42"]
    assert access.read_field(last["handle"], WINDOW, guard) == {
        "text": "42",
        "text_complete": True,
    }


def test_deferred_expansion_is_fair_bounded_and_never_exceeds_depth_six():
    fields = [Node(f"field {i}", "text", text=str(i)) for i in range(6)]
    access, root, _, _, _ = setup(fields=fields)
    menu = Node("menu", children=[Node(f"menu item {i}") for i in range(500)])
    menu.parent = root
    root.children.insert(0, menu)
    accesses = []
    original = menu.get_child_at_index

    def tracked(index):
        accesses.append(index)
        return original(index)

    setattr(menu, "get_child_at_index", tracked)
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available" and len(nodes) == 128
    assert [n["name"] for n in nodes if "replace_field" in n["capabilities"]] == [
        field.name for field in fields
    ]
    assert len(accesses) == 119  # Root, menu, toolbar and six fields also consume slots.
    assert [n["depth"] for n in nodes] == sorted(n["depth"] for n in nodes)

    access, root, _, toolbar, _ = setup(fields=[])
    parent = toolbar
    for depth in range(2, 9):
        child = Node(f"depth {depth}", "text", text=str(depth))
        child.parent = parent
        parent.children = [child]
        parent = child
    nodes, status = access.snapshot(WINDOW, "depth-obs", guard)
    assert status == "available"
    assert [n["depth"] for n in nodes] == list(range(7))
    assert nodes[-1]["name"] == "depth 6"


@pytest.mark.parametrize(
    "change", ["replacement", "bus", "process", "root", "text", "ancestry", "scope", "window"]
)
def test_saved_native_identity_and_freshness_never_retarget(change):
    access, root, fields, toolbar, _ = setup(attached=True)
    nodes, _, private = access.capture(guard)
    target = next(n for n in nodes if n["name"] == "Size")
    saved = private[target["handle"]]
    if change == "replacement":
        replacement = Node("Size", "spin button", text="40")
        replacement.parent = toolbar
        toolbar.children = [replacement]
    elif change == "bus":
        access.bus_id = "new-bus"
    elif change == "process":
        access.owners[":1.42"] = [102, 1001]
    elif change == "root":
        root.path += "_replacement"
    elif change == "text":
        fields[0].text = "50"
    elif change == "ancestry":
        toolbar.path += "_replacement"
    elif change == "scope":
        access.scope["fingerprint"] = "different"
    else:
        access.window = lambda: {**WINDOW, "title": "Changed"}
    with pytest.raises(PrimitiveError):
        access.restore(saved, guard)
    assert fields[0].calls == []


@pytest.mark.parametrize("change", ["identity", "defunct", "ancestry", "geometry", "long_text"])
def test_readback_never_substitutes_or_accepts_partial_text(change):
    access, _, fields, toolbar, _ = setup(attached=True)
    nodes, _, _ = access.capture(guard)
    target = next(n for n in nodes if n["name"] == "Size")
    if change == "identity":
        fields[0].path += "_new"
    elif change == "defunct":
        fields[0].states.add(5)
    elif change == "ancestry":
        toolbar.path += "_new"
    elif change == "geometry":
        fields[0].bounds = (60, 60, 80, 20)
    else:
        fields[0].text = "a" * 513
    with pytest.raises(PrimitiveError):
        access.read_field(target["handle"], WINDOW, guard)


def test_text_interface_dispatch_survives_accessible_get_text_shadowing():
    access, _, fields, _, _ = setup()
    calls: list[Any] = []
    proxy = SimpleNamespace()

    # Match GI's Accessible.get_text(): it is an interface accessor, not the
    # Text.get_text(start, end) reader, and cannot accept the latter's arguments.
    def get_text_accessor():
        calls.append("wrong-accessor")
        return proxy

    proxy.get_text = get_text_accessor
    fields[0].get_text_iface = lambda: proxy

    def read(interface, start, end):
        assert interface is proxy
        calls.append((start, end))
        return fields[0].text[start:end]

    access.api.Text = SimpleNamespace(
        get_character_count=lambda interface: len(fields[0].text), get_text=read
    )
    nodes, status = access.snapshot(WINDOW, "obs", guard)
    assert status == "available"
    target = next(n for n in nodes if n["name"] == "Size")
    assert "replace_field" in target["capabilities"]
    assert target["text"] == "40" and target["text_complete"]
    access.execute(
        dict(type="replace_field", target=target["handle"], observation_id="obs", text="10"),
        WINDOW,
        guard,
    )
    assert access.read_field(target["handle"], WINDOW, guard) == {
        "text": "10",
        "text_complete": True,
    }
    assert fields[0].calls == ["10"]
    assert calls and "wrong-accessor" not in calls


def test_toolkit_without_editable_nodes_retains_pixel_fallback_contract():
    access, _, _, _, _ = setup(attached=True, fields=[Node("GIMP color area", "panel")])
    nodes, status, _ = access.capture(guard)
    assert status == "available"
    assert not any("replace_field" in n["capabilities"] for n in nodes)


def test_capture_stability_checks_native_window_again():
    access, _, _, _, _ = setup(attached=True)
    access.capture(guard)
    access.window = lambda: {**WINDOW, "title": "changed during capture"}
    with pytest.raises(PrimitiveError, match="Native window changed"):
        access.stable(guard)


@pytest.mark.parametrize("failure", [None, "property", "transport", "guid", "registry"])
def test_attached_bus_loading_is_existing_only_and_owner_bound(monkeypatch, failure):
    import sys

    from src.computer.runtime import gi_support

    calls: list[Any] = []

    def call(*args):
        calls.append(args)
        value = {
            "NameHasOwner": failure != "registry",
            "GetConnectionUnixProcessID": 101,
            "GetConnectionUnixUser": 1001,
        }[args[3]]
        assert args[6] == 4 and args[7] == 100
        return SimpleNamespace(unpack=lambda: (value,))

    bus = SimpleNamespace(
        get_guid=lambda: None if failure == "guid" else "guid",
        call_sync=call,
        close_sync=lambda _: calls.append("closed"),
    )
    gio = SimpleNamespace(
        DBusConnection=SimpleNamespace(new_for_address_sync=lambda *a: bus),
        DBusConnectionFlags=SimpleNamespace(AUTHENTICATION_CLIENT=1, MESSAGE_BUS_CONNECTION=2),
        DBusCallFlags=SimpleNamespace(NO_AUTO_START=4),
    )
    glib = SimpleNamespace(Variant=lambda *a: a, VariantType=SimpleNamespace(new=lambda x: x))
    api = SimpleNamespace(set_timeout=lambda *a: calls.append(a))
    gi = SimpleNamespace(require_version=lambda *a: None)
    monkeypatch.setattr(gi_support, "load_gi", lambda: gi)
    monkeypatch.setitem(
        sys.modules, "gi.repository", SimpleNamespace(Gio=gio, GLib=glib, Atspi=api)
    )
    monkeypatch.setenv("AT_SPI_BUS_ADDRESS", "old")
    monkeypatch.setenv("AT_SPI_DISPLAY", "old")
    prop = SimpleNamespace(
        format=8,
        bytes_after=0,
        value=b"tcp:host=example" if failure == "transport" else b"unix:path=/bus",
    )
    conn = SimpleNamespace(
        get_display_name=lambda: ":99",
        intern_atom=lambda *a, **kw: 1,
        screen=lambda: SimpleNamespace(
            root=SimpleNamespace(get_property=lambda *a: None if failure == "property" else prop)
        ),
    )
    access = AttachedAccessibility(conn, {"process": dict(pid=101, uid=1001, start_ticks=42)})
    if failure:
        with pytest.raises(PrimitiveError):
            access._load()
    else:
        assert access._load() is api
        assert access.native_identity(Node())[-3:] == [101, 1001, 42]
        assert [c[3] for c in calls if isinstance(c, tuple) and len(c) > 3] == [
            "NameHasOwner",
            "GetConnectionUnixProcessID",
            "GetConnectionUnixUser",
        ]
        assert access._load() is api
    access.close()
    if access.bus is not None:
        assert calls[-1] == "closed"


@pytest.mark.parametrize(
    "consent_modal,native_states,actual_modal",
    [
        (False, [], False),
        (True, [], False),
        (True, [42], True),
        (True, [17], False),
    ],
)
def test_attached_window_maps_scoped_native_metadata(
    monkeypatch, consent_modal, native_states, actual_modal
):
    from src.computer.runtime import x11_app_scope

    monkeypatch.setattr(x11_app_scope.AppScope, "_metadata", lambda *a: (WINDOW["title"],))
    connection = SimpleNamespace(
        get_display_name=lambda: ":99",
        create_resource_object=lambda *a: object(),
        intern_atom=lambda name, **kw: 42,
    )
    scope = dict(
        window=20,
        process=dict(pid=101),
        modal=consent_modal,
        states=native_states,
        window_rect=(10, 20, 800, 600),
    )
    assert AttachedAccessibility(connection, scope).window() == {**WINDOW, "modal": actual_modal}
    assert scope["modal"] is consent_modal


def test_native_identity_rejects_nonunique_sender_and_invalid_path():
    access, _, fields, _, _ = setup(attached=True)
    for sender, path in [("org.krita", "/field"), (":1.42", "not/a/path")]:
        fields[0].app.bus_name, fields[0].path = sender, path
        with pytest.raises(PrimitiveError, match="identity unavailable"):
            access.native_identity(fields[0])


@pytest.mark.parametrize("mismatch", [None, "modal", "ambiguous", "geometry", "pid"])
def test_modeless_dialog_native_window_capture_keeps_root_guards(monkeypatch, mismatch):
    from src.computer.runtime import x11_app_scope

    access, root, fields, _, app = setup(
        attached=True, fields=[Node("Color name", "text", text="#000000")]
    )
    root.name, root.role = "Select a Color", "dialog"
    monkeypatch.setattr(x11_app_scope.AppScope, "_metadata", lambda *a: ("Select a Color - Krita",))
    access.connection = SimpleNamespace(
        get_display_name=lambda: ":99",
        create_resource_object=lambda *a: object(),
        intern_atom=lambda *a, **kw: 42,
    )
    access.scope.update(window=20, modal=True, states=[], window_rect=(10, 20, 800, 600))
    del access.window  # Exercise the actual attached native modality mapping.
    if mismatch == "modal":
        root.states.add(STATE.MODAL)
    elif mismatch == "ambiguous":
        duplicate = Node("Select a Color", "dialog")
        duplicate.bounds = root.bounds
        app.children.append(duplicate)
    elif mismatch == "geometry":
        root.bounds = (10, 20, 799, 600)
    elif mismatch == "pid":
        root.pid = 102
    nodes, status, private = access.capture(guard)
    assert access.scope["modal"] is True
    if mismatch:
        assert status == "unsupported" and nodes == [] and private == {}
    else:
        assert status == "available"
        field = next(n for n in nodes if n["text"] == "#000000")
        ref = access.restore(private[field["handle"]], guard)
        assert ref.node is fields[0] and ref.root is root


def test_capture_changed_node_and_restore_outside_source_rejected():
    access, _, fields, _, _ = setup(attached=True)
    access.capture(guard)
    fields[0].text = "41"
    with pytest.raises(PrimitiveError, match="changed during capture"):
        access.stable(guard)
    _, _, private = access.capture(guard)
    saved = next(row for row in private.values() if row["metadata"]["name"] == "Size")
    access.scope["source_rect"] = (0, 0, 1, 1)
    with pytest.raises(PrimitiveError, match="outside granted source"):
        access.restore(saved, guard)


@pytest.mark.parametrize("kind", ["invoke", "focus", "select", "value"])
def test_owned_native_interfaces_execute_only_observed_capabilities(kind):
    access, _, fields, _, _ = setup()
    field = fields[0]
    calls = []

    def record(*args):
        calls.append(args)
        return True

    child = Node()
    child.parent = field
    field.children = [child]
    field.get_interfaces = lambda: ["Component", "Action", "Selection", "Value"]
    field.get_action_iface = lambda: SimpleNamespace(
        get_n_actions=lambda: 1,
        get_action_name=lambda _: "click",
        do_action=lambda i: record("invoke", i),
    )
    field.get_component_iface = lambda: SimpleNamespace(
        get_extents=lambda _: SimpleNamespace(x=40, y=60, width=80, height=20),
        grab_focus=lambda: record("focus"),
    )
    field.get_selection_iface = lambda: SimpleNamespace(select_child=lambda i: record("select", i))
    field.get_value_iface = lambda: SimpleNamespace(
        get_minimum_value=lambda: 0,
        get_maximum_value=lambda: 100,
        set_current_value=lambda n: record("value", n),
    )
    nodes, _ = access.snapshot(WINDOW, "obs", guard)
    target = next(n for n in nodes if n["name"] == "Size")
    access.execute(
        dict(type=kind, target=target["handle"], observation_id="obs", index=0, value=75),
        WINDOW,
        guard,
    )
    assert calls and calls[0][0] == kind


@pytest.mark.parametrize(
    "failure", ["stale", "unknown", "changed", "unsupported", "refused", "error", "bad_text"]
)
def test_execute_failures_do_not_claim_success(failure):
    access, _, fields, _, _ = setup()
    nodes, _ = access.snapshot(WINDOW, "obs", guard)
    target = next(n for n in nodes if n["name"] == "Size")
    action = dict(type="replace_field", target=target["handle"], observation_id="obs", text="10")
    if failure == "stale":
        action["observation_id"] = "old"
    elif failure == "unknown":
        action["target"] = "unknown"
    elif failure == "changed":
        fields[0].name = "new"
    elif failure == "unsupported":
        action["type"] = "invoke"
    elif failure == "refused":
        fields[0].get_editable_text_iface = lambda: SimpleNamespace(
            set_text_contents=lambda _: False
        )
    elif failure == "error":
        fields[0].get_editable_text_iface = lambda: None
    else:
        action["text"] = "\0"
    with pytest.raises(PrimitiveError):
        access.execute(action, WINDOW, guard)
    assert fields[0].calls == []


def test_metadata_bounds_and_identity_budgets_fail_closed():
    access, _, fields, _, _ = setup()
    field = fields[0]
    for name, states, bounds in [
        ("x" * 16385, {1}, (0, 0, 1, 1)),
        ("x", set(range(65)), (0, 0, 1, 1)),
        ("x", {1}, (0, 0, -1, 1)),
    ]:
        field.name, field.states, field.bounds = name, states, bounds
        with pytest.raises(PrimitiveError):
            access._data(field)
    with pytest.raises(PrimitiveError):
        Accessibility(display=":0")
    access._node_identities = [(object(), "retained") for _ in range(2048)]
    with pytest.raises(PrimitiveError, match="budget exhausted"):
        access.node_identity(field)


def test_readback_missing_window_detached_ancestor_and_unreadable_text():
    access, _, fields, _, _ = setup()
    nodes, _ = access.snapshot(WINDOW, "obs", guard)
    target = next(n for n in nodes if n["name"] == "Size")["handle"]
    with pytest.raises(PrimitiveError, match="window binding"):
        access.read_field(target, {**WINDOW, "id": 21}, guard)
    fields[0].parent = None
    with pytest.raises(PrimitiveError, match="observed native root"):
        access.read_field(target, WINDOW, guard)
    fields[0].get_text_iface = lambda: None
    assert access._text(fields[0], {"Text"}, "text") == ("", False, False)
