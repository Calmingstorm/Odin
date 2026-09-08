"""Bounded, observation-scoped AT-SPI references. Imported without loading GI."""

import hashlib
import math
import secrets
from collections import deque
from dataclasses import dataclass, field
from functools import partial
from typing import Any


class PrimitiveError(Exception):
    """An explicit, non-success native result, safe for the worker to serialize."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def bounded_text(value, limit=512):
    if not isinstance(value, str) or len(value) > limit or "\x00" in value:
        raise PrimitiveError("rejected", "Text exceeds the bounded text contract")
    try:
        value.encode("utf-8")
    except UnicodeError as exc:
        raise PrimitiveError("rejected", "Text must be valid UTF-8") from exc
    return value


def finite(value, low, high):
    if (
        isinstance(value, bool)
        or not isinstance(value, (float, int))
        or not math.isfinite(value)
        or not low <= value <= high
    ):
        raise PrimitiveError("rejected", "Numeric argument is outside its finite bounds")
    return value


@dataclass
class Reference:
    node: object
    root: object
    fingerprint: tuple
    root_fingerprint: tuple
    window: dict
    capabilities: list
    metadata: dict = field(default_factory=dict)
    children: dict = field(default_factory=dict)
    lineage: tuple = ()
    parent_handle: str | None = None


class Accessibility:
    """GI calls are worker-local; its outer process deadline remains authoritative."""

    def __init__(self, *, display=":77"):
        if display != ":77":
            raise PrimitiveError("unsupported", "Attached-session AT-SPI is not supported")
        self.display = display
        self.api: Any | None = None
        self.references = {}
        self.observation_id = None
        self.status_detail = "not_observed"
        self.root_diagnostics = []
        # Hold proxies to prevent Python/native object reuse assigning an old
        # identity to an identical-looking replacement widget.
        self._node_identities = []

    def node_identity(self, node):
        for original, token in self._node_identities:
            if original == node:
                return token
        if len(self._node_identities) >= 2048:
            raise PrimitiveError("unsupported", "Accessible identity budget exhausted")
        token = secrets.token_urlsafe(24)
        self._node_identities.append((node, token))
        return token

    def lineage(self, node, root, guard):
        result: list[tuple[str, tuple]] = []
        ancestor = node
        for _ in range(7):
            guard()
            if ancestor == root:
                return tuple(result)
            ancestor = ancestor.get_parent()
            if ancestor is None:
                break
            fingerprint, public = self._data(ancestor)
            result.append((public["node_identity"], fingerprint))
        raise PrimitiveError("rejected", "Accessible ancestry left its observed root")

    def _load(self):
        if self.api is None:
            from .gi_support import load_gi

            gi = load_gi()

            gi.require_version("Atspi", "2.0")
            from gi.repository import Atspi  # type: ignore[import-not-found]  # Optional GI.

            Atspi.set_timeout(100, 100)
            self.api = Atspi
        return self.api

    def _data(self, node):
        api = self.api
        assert api is not None  # snapshot loads GI before traversing references.
        if hasattr(node, "clear_cache"):
            node.clear_cache()
        role = node.get_role_name()
        name = node.get_name() or ""
        if not isinstance(name, str) or len(name) > 16384:
            raise PrimitiveError("unsupported", "Accessible name is unbounded")
        state = node.get_state_set()
        states = tuple(sorted(int(item) for item in state.get_states()))
        if len(states) > 64:
            raise PrimitiveError("unsupported", "Accessible states exceed metadata bounds")
        component = node.get_component_iface()
        # Qt exposes nonvisual Offscreen objects and structural ancestors without
        # Component. Keep their identity/ancestry, but never advertise them as
        # actionable fields or let them stand in for a native window.
        bounds: tuple[int, ...] = (0, 0, 0, 0)
        if component is not None:
            rect = component.get_extents(api.CoordType.SCREEN)
            bounds = tuple(int(getattr(rect, key)) for key in ("x", "y", "width", "height"))
        if bounds[2] < 0 or bounds[3] < 0:
            raise PrimitiveError("unsupported", "Accessible bounds are invalid")
        fingerprint = (role, hashlib.sha256(name.encode("utf-8")).digest(), bounds, states)
        interfaces = {str(item).rsplit(".", 1)[-1] for item in node.get_interfaces()}
        capabilities = []
        enabled = all(
            state.contains(getattr(api.StateType, key))
            for key in ("ENABLED", "SENSITIVE", "SHOWING", "VISIBLE")
        )
        if (
            enabled
            and component is not None
            and bounds[2] > 0
            and bounds[3] > 0
            and not state.contains(api.StateType.DEFUNCT)
        ):
            if "Component" in interfaces and state.contains(api.StateType.FOCUSABLE):
                capabilities.append("focus")
            if "Action" in interfaces:
                capabilities.append("invoke")
            if "EditableText" in interfaces and "password" not in role.lower():
                capabilities.append("set_text")
            for interface, action in (("Selection", "select"), ("Value", "value")):
                if interface in interfaces:
                    capabilities.append(action)
        text, text_readable, text_complete = self._text(node, interfaces, role)
        if "set_text" in capabilities and text_readable and text_complete:
            capabilities.append("replace_field")
        public = {
            "role": str(role)[:64],
            "name": name[:128],
            "text": text,
            "node_identity": self.node_identity(node),
            "focused": state.contains(api.StateType.FOCUSED),
            "text_readable": text_readable,
            "text_complete": text_complete,
            "bounds": dict(zip(("x", "y", "width", "height"), bounds, strict=True)),
            "states": list(states),
            "capabilities": capabilities,
        }
        return fingerprint, public

    def _text(self, node, interfaces, role):
        """Never confuse an unreadable or truncated field with an empty/full value."""
        if "Text" not in interfaces or "password" in role.lower():
            return "", False, False
        try:
            interface = node.get_text_iface()
            # GI may return Accessible here: its deprecated get_text() accessor
            # shadows Text.get_text(start, end). Dispatch through the interface
            # type rather than the ambiguous proxy method in real AT-SPI.
            text_api = getattr(self.api, "Text", None)
            get_count = (
                partial(text_api.get_character_count, interface)
                if text_api is not None
                else interface.get_character_count
            )
            get_text = (
                partial(text_api.get_text, interface)
                if text_api is not None
                else interface.get_text
            )
            count = get_count()
            if type(count) is not int or count < 0:
                return "", False, False
            text = get_text(0, min(512, count))
            bounded_text(text)
            after_count = get_count()
            complete = count == after_count == len(text) and count <= 512
            return text, True, complete
        except Exception:
            return "", False, False

    def _window_root(self, window, guard):
        assert self.api is not None  # Called only after _load().
        desktop = self.api.get_desktop(0)
        self.root_diagnostics = []
        budget = 128
        candidates = []
        bounds = tuple(window[key] for key in ("x", "y", "width", "height"))
        frame_bounds = None
        app_count = desktop.get_child_count()
        if type(app_count) is not int or not 0 <= app_count <= budget:
            raise PrimitiveError("unsupported", "Incomplete AT-SPI root enumeration")
        for i in range(app_count):
            guard()
            if budget <= 0:
                raise PrimitiveError("unsupported", "Incomplete AT-SPI root enumeration")
            app = desktop.get_child_at_index(i)
            budget -= 1
            if app is None or app.get_process_id() != window["pid"]:
                continue
            root_count = app.get_child_count()
            # A matching prefix is not evidence of uniqueness. Do not bind a
            # native identity unless every relevant top-level root fits the scan.
            if type(root_count) is not int or not 0 <= root_count <= budget:
                raise PrimitiveError("unsupported", "Incomplete AT-SPI root enumeration")
            for j in range(root_count):
                guard()
                budget -= 1
                root = app.get_child_at_index(j)
                if root is None:
                    continue
                try:
                    fingerprint, public = self._data(root)
                except PrimitiveError as exc:
                    if exc.status != "unsupported":
                        raise
                    continue
                except Exception:
                    # One inaccessible auxiliary window must not hide its real
                    # top-level siblings. The outer guard still owns deadlines.
                    guard()
                    continue
                self.root_diagnostics.append(
                    {"name": public["name"], "role": public["role"], "bounds": fingerprint[2]}
                )
                state = root.get_state_set()
                if (
                    root.get_process_id() != window["pid"]
                    or public["role"] not in ("frame", "dialog", "window", "alert", "file chooser")
                    or fingerprint[2][2] <= 0
                    or fingerprint[2][3] <= 0
                    or state.contains(self.api.StateType.DEFUNCT)
                    or not all(
                        state.contains(getattr(self.api.StateType, key))
                        for key in ("SHOWING", "VISIBLE")
                    )
                    or state.contains(self.api.StateType.MODAL) != window["modal"]
                ):
                    continue
                # Qt's accessible title may omit the application/document suffix.
                # Titles are descriptive, not identity. Bind to the selected native
                # window's exact client or WM ancestor geometry and require a
                # unique, visible, same-process, same-modality top-level root.
                matches = fingerprint[2] == bounds and (
                    root.get_name() == window["title"] or state.contains(self.api.StateType.ACTIVE)
                )
                if not matches:
                    if frame_bounds is None:
                        frame_bounds = self._native_frame_bounds(window, guard)
                    matches = (
                        state.contains(self.api.StateType.ACTIVE) and fingerprint[2] == frame_bounds
                    )
                if matches:
                    candidates.append((root, fingerprint))
        if len(candidates) == 1:
            return candidates[0]
        raise PrimitiveError("unsupported", "No unambiguous active-window AT-SPI root")

    def _native_frame_bounds(self, window, guard):
        from Xlib import display as xdisplay  # type: ignore[import-untyped]

        display = xdisplay.Display(self.display)
        try:
            node = display.create_resource_object("window", window["id"])
            for _ in range(64):
                guard()
                tree = node.query_tree()
                if tree.parent.id == tree.root.id:
                    geometry = node.get_geometry()
                    return (geometry.x, geometry.y, geometry.width, geometry.height)
                node = tree.parent
            return None
        finally:
            display.close()

    def _traversal_priority(self, node, inherited):
        """Cheap semantic frontier probe, not an actionable identity snapshot.

        Hidden visual widgets cannot expose actionable descendants. Nonvisual
        structural ancestors, however, may legitimately omit visibility states.
        Keep those ancestors, and prefer visible controls over resource browsers
        without relying on application names or widget labels.
        """
        assert self.api is not None
        if hasattr(node, "clear_cache"):
            node.clear_cache()
        state = node.get_state_set()
        if state.contains(self.api.StateType.DEFUNCT):
            return None
        showing = all(
            state.contains(getattr(self.api.StateType, key)) for key in ("SHOWING", "VISIBLE")
        )
        if not showing and node.get_component_iface() is not None:
            return None
        role = node.get_role_name()
        if showing and (
            role == "tool bar"
            or "EditableText" in {str(item).rsplit(".", 1)[-1] for item in node.get_interfaces()}
        ):
            return 0
        if role in {"menu", "menu bar", "list", "table", "tree", "tree table"}:
            return 2
        return inherited

    def snapshot(self, window, observation_id, guard):
        self.references.clear()
        self.observation_id = observation_id
        self.status_detail = "loading"
        try:
            self._load()
            self.status_detail = "window_root_unavailable"
            root, root_fingerprint = self._window_root(window, guard)
            stacks: list[deque[tuple[Any, int, str | None, int | None]]] = [
                deque() for _ in range(3)
            ]
            stacks[1].append((root, 0, None, None))
            deferred: list[deque[tuple[Any, int, str, int, int]]] = [deque() for _ in range(3)]
            nodes = []
            visited = set()
            probes = 0
            # Cheap rejected frontier nodes do not consume public identity slots.
            # Bound that work by the public-node budget times its depth horizon;
            # the existing outer worker deadline remains authoritative as well.
            frontier_budget = 128 * 7
            while any(stacks) or any(deferred):
                if len(nodes) >= 128:
                    break
                priority = next(i for i in range(3) if stacks[i] or deferred[i])
                stack, pending = stacks[priority], deferred[priority]
                if not stack:
                    # Fair breadth within each semantic priority, retaining every
                    # parent cursor. Inspect siblings before choosing a subtree so
                    # a late toolbar is not buried beneath hidden dockers/menus.
                    while (
                        pending and len(nodes) + sum(len(q) for q in stacks[: priority + 1]) < 128
                    ):
                        if probes >= frontier_budget:
                            break
                        guard()
                        ancestor, child_depth, owner, i, count = pending.popleft()
                        probes += 1
                        try:
                            child = ancestor.get_child_at_index(i)
                            child_priority = (
                                self._traversal_priority(child, priority)
                                if child is not None
                                else None
                            )
                            if child_priority is not None:
                                stacks[child_priority].append((child, child_depth, owner, i))
                        except PrimitiveError:
                            raise
                        except Exception:
                            pass
                        if i + 1 < count:
                            pending.append((ancestor, child_depth, owner, i + 1, count))
                    if probes >= frontier_budget:
                        for queue in deferred:
                            queue.clear()
                    if not any(stacks):
                        continue
                    priority = next(i for i in range(3) if stacks[i])
                    stack = stacks[priority]
                guard()
                node, depth, parent, index = stack.popleft()
                if node is None or id(node) in visited:
                    continue
                visited.add(id(node))
                try:
                    fingerprint, public = self._data(node)
                    if node.get_process_id() != window["pid"]:
                        continue
                    handle = secrets.token_urlsafe(18)
                    # Every parent was already fingerprinted in this capture.
                    # Verify the actual immediate edge before reusing its chain;
                    # repeated full ancestor walks add no new graph coverage.
                    lineage = ()
                    lineage_parent = parent
                    if parent is not None:
                        parent_ref = self.references[parent]
                        if node.get_parent() != parent_ref.node:
                            # Some toolkits enumerate a presentation child whose
                            # real parent is a different structural object. That
                            # edge cannot use our cached enumeration ancestry.
                            lineage = self.lineage(node, root, guard)
                            lineage_parent = None
                        else:
                            lineage = (
                                (self.node_identity(parent_ref.node), parent_ref.fingerprint),
                            ) + parent_ref.lineage
                    public.update(handle=handle, parent=parent, depth=depth, index=index)
                    public["root_identity"] = self.node_identity(root)
                    public["ancestor_identity"] = hashlib.sha256(repr(lineage).encode()).hexdigest()
                    nodes.append(public)
                    self.references[handle] = Reference(
                        node,
                        root,
                        fingerprint,
                        root_fingerprint,
                        dict(window),
                        public["capabilities"],
                        {
                            key: value
                            for key, value in public.items()
                            if key
                            not in {
                                "handle",
                                "parent",
                                "depth",
                                "index",
                                "root_identity",
                                "ancestor_identity",
                            }
                        },
                        lineage=lineage,
                        parent_handle=lineage_parent,
                    )
                    if parent is not None:
                        self.references[parent].children[index] = (node, fingerprint)
                    if depth < 6:
                        count = min(max(0, node.get_child_count()), 128)
                        if count:
                            deferred[priority].append((node, depth + 1, handle, 0, count))
                except PrimitiveError:
                    raise
                except Exception:
                    continue
            self.status_detail = "available"
            return nodes, "available"
        except PrimitiveError as exc:
            if exc.status != "unsupported":
                raise
        except Exception:
            pass
        self.references.clear()
        return [], "unsupported"

    def execute(self, action, window, guard, before_effect=None):
        if action.get("observation_id") != self.observation_id:
            raise PrimitiveError("rejected", "Stale accessibility observation")
        ref = self.references.get(action.get("target"))
        if ref is None or ref.window != window:
            raise PrimitiveError("rejected", "Unknown or stale accessibility handle")
        guard()
        try:
            current, public = self._data(ref.node)
            root_current, _ = self._data(ref.root)
            if (
                current != ref.fingerprint
                or root_current != ref.root_fingerprint
                or public != ref.metadata
                or self.lineage(ref.node, ref.root, guard) != ref.lineage
                or ref.node.get_process_id() != window["pid"]
                or ref.root.get_process_id() != window["pid"]
            ):
                raise PrimitiveError("rejected", "Accessible target changed since observation")
            ancestor = ref.node
            for _ in range(7):
                guard()
                if ancestor == ref.root:
                    break
                ancestor = ancestor.get_parent()
                if ancestor is None:
                    break
            if ancestor != ref.root:
                raise PrimitiveError("rejected", "Accessible target left the observed window")
            kind = action["type"]
            if kind not in ref.capabilities or kind not in public["capabilities"]:
                raise PrimitiveError("unsupported", "Target lacks the requested interface")
            if kind == "invoke":
                interface = ref.node.get_action_iface()
                names = [
                    (i, interface.get_action_name(i))
                    for i in range(min(interface.get_n_actions(), 32))
                ]
                allowed = {"click", "press", "activate", "toggle", "open"}
                choices = [(i, name) for i, name in names if name in allowed]
                requested = action.get("action_name")
                choices = [pair for pair in choices if requested is None or pair[1] == requested]
                if len(choices) != 1:
                    raise PrimitiveError("unsupported", "No unique supported native action")
                effect = partial(interface.do_action, choices[0][0])
            elif kind == "focus":
                effect = ref.node.get_component_iface().grab_focus
            elif kind in {"set_text", "replace_field"}:
                text = bounded_text(action.get("text"))
                effect = partial(ref.node.get_editable_text_iface().set_text_contents, text)
            elif kind == "select":
                index = action.get("index")
                if type(index) is not int or index not in ref.children:
                    raise PrimitiveError("rejected", "Selection child was not observed")
                child, fingerprint = ref.children[index]
                if (
                    ref.node.get_child_at_index(index) != child
                    or self._data(child)[0] != fingerprint
                ):
                    raise PrimitiveError("rejected", "Selection child changed since observation")
                effect = partial(ref.node.get_selection_iface().select_child, index)
            elif kind == "value":
                interface = ref.node.get_value_iface()
                value = finite(action.get("value"), -1e12, 1e12)
                finite(value, interface.get_minimum_value(), interface.get_maximum_value())
                effect = partial(interface.set_current_value, value)
            else:
                raise PrimitiveError("unsupported", "Unsupported semantic action")
            guard()
            if before_effect is not None:
                before_effect()
            if not effect():
                raise PrimitiveError("failed", "AT-SPI did not accept the native action")
        except PrimitiveError:
            raise
        except Exception as exc:
            raise PrimitiveError("unsupported", "AT-SPI interface failed") from exc

    def read_field(self, target, window, guard):
        """Read the original native node after release; never resolve another field."""
        ref = self.references.get(target)
        if ref is None or ref.window != window:
            raise PrimitiveError("rejected", "Field readback lost its window binding")
        guard()
        try:
            root_current, _ = self._data(ref.root)
            current, public = self._data(ref.node)
            # The original native root may acquire a modified-document title;
            # its identity, role, bounds and native window are still bound.
            assert self.api is not None
            if ref.node.get_state_set().contains(
                self.api.StateType.DEFUNCT
            ) or ref.root.get_state_set().contains(self.api.StateType.DEFUNCT):
                raise PrimitiveError("rejected", "Field readback node is defunct")
            if (
                (root_current[0], root_current[2])
                != (ref.root_fingerprint[0], ref.root_fingerprint[2])
                or current[:3] != ref.fingerprint[:3]
                or public["node_identity"] != ref.metadata["node_identity"]
                or ref.node.get_process_id() != window["pid"]
                or ref.root.get_process_id() != window["pid"]
            ):
                raise PrimitiveError("rejected", "Field readback target changed")
            ancestor = ref.node
            for _ in range(7):
                guard()
                if ancestor == ref.root or ancestor is None:
                    break
                ancestor = ancestor.get_parent()
            if ancestor != ref.root:
                raise PrimitiveError("rejected", "Field left its observed native root")
            if tuple(row[0] for row in self.lineage(ref.node, ref.root, guard)) != tuple(
                row[0] for row in ref.lineage
            ):
                raise PrimitiveError("rejected", "Field ancestry changed after editing")
            if not public["text_readable"] or not public["text_complete"]:
                raise PrimitiveError("unsupported", "Full field text is unavailable")
            guard()
            return {"text": public["text"], "text_complete": True}
        except PrimitiveError:
            raise
        except Exception as exc:
            raise PrimitiveError("unsupported", "Native field readback failed") from exc
