"""Bounded, observation-scoped AT-SPI references. Imported without loading GI."""

import hashlib
import math
import secrets
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
    if (isinstance(value, bool) or not isinstance(value, (float, int))
            or not math.isfinite(value) or not low <= value <= high):
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

    def _load(self):
        if self.api is None:
            import gi  # type: ignore[import-not-found]  # Optional worker-local GI dependency.

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
        rect = node.get_component_iface().get_extents(api.CoordType.SCREEN)
        bounds = tuple(int(getattr(rect, key)) for key in ("x", "y", "width", "height"))
        if bounds[2] < 0 or bounds[3] < 0:
            raise PrimitiveError("unsupported", "Accessible bounds are invalid")
        fingerprint = (role, hashlib.sha256(name.encode("utf-8")).digest(), bounds, states)
        interfaces = {str(item).rsplit(".", 1)[-1] for item in node.get_interfaces()}
        capabilities = []
        enabled = all(state.contains(getattr(api.StateType, key))
                      for key in ("ENABLED", "SENSITIVE", "SHOWING", "VISIBLE"))
        if enabled and not state.contains(api.StateType.DEFUNCT):
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
        public = {"role": str(role)[:64], "name": name[:128], "text": text,
                  "text_readable": text_readable, "text_complete": text_complete,
                  "bounds": dict(zip(("x", "y", "width", "height"), bounds, strict=True)),
                  "states": list(states), "capabilities": capabilities}
        return fingerprint, public

    @staticmethod
    def _text(node, interfaces, role):
        """Never confuse an unreadable or truncated field with an empty/full value."""
        if "Text" not in interfaces or "password" in role.lower():
            return "", False, False
        try:
            interface = node.get_text_iface()
            count = interface.get_character_count()
            if type(count) is not int or count < 0:
                return "", False, False
            text = interface.get_text(0, min(512, count))
            bounded_text(text)
            after_count = interface.get_character_count()
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
        for i in range(min(desktop.get_child_count(), 128)):
            guard()
            app = desktop.get_child_at_index(i)
            budget -= 1
            if app is None or app.get_process_id() != window["pid"]:
                continue
            for j in range(min(app.get_child_count(), budget)):
                guard()
                budget -= 1
                root = app.get_child_at_index(j)
                if root is None:
                    continue
                fingerprint, _ = self._data(root)
                bounds = tuple(window[key] for key in ("x", "y", "width", "height"))
                self.root_diagnostics.append({"name": (root.get_name() or "")[:128],
                                              "role": root.get_role_name(),
                                              "bounds": fingerprint[2]})
                exact = (root.get_name() == window["title"] and fingerprint[2] == bounds
                         and root.get_role_name() in ("frame", "dialog", "window"))
                # GTK describes the WM frame, not xdotool's client geometry.
                # Require native ancestry geometry and active/modal state.
                framed = False
                if not exact:
                    state = root.get_state_set()
                    framed = (state.contains(self.api.StateType.ACTIVE)
                              and state.contains(self.api.StateType.MODAL) == window["modal"]
                              and root.get_role_name() in (
                                  "frame", "dialog", "window", "alert", "file chooser")
                              and fingerprint[2] == self._native_frame_bounds(window, guard))
                if exact or framed:
                    candidates.append((root, fingerprint))
            if budget <= 0:
                break
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

    def snapshot(self, window, observation_id, guard):
        self.references.clear()
        self.observation_id = observation_id
        self.status_detail = "loading"
        try:
            self._load()
            self.status_detail = "window_root_unavailable"
            root, root_fingerprint = self._window_root(window, guard)
            stack: list[tuple[Any, int, str | None, int | None]] = [(root, 0, None, None)]
            nodes = []
            visited = set()
            examined = 0
            while stack and examined < 128:
                guard()
                node, depth, parent, index = stack.pop()
                examined += 1
                if node is None or id(node) in visited:
                    continue
                visited.add(id(node))
                try:
                    fingerprint, public = self._data(node)
                    if node.get_process_id() != window["pid"]:
                        continue
                    handle = secrets.token_urlsafe(18)
                    public.update(handle=handle, parent=parent, depth=depth, index=index)
                    nodes.append(public)
                    self.references[handle] = Reference(
                        node, root, fingerprint, root_fingerprint, dict(window),
                        public["capabilities"],
                        {key: value for key, value in public.items()
                         if key not in {"handle", "parent", "depth", "index"}},
                    )
                    if parent is not None:
                        self.references[parent].children[index] = (node, fingerprint)
                    if depth < 6:
                        count = min(max(0, node.get_child_count()), 128 - examined - len(stack))
                        for i in reversed(range(count)):
                            guard()
                            stack.append((node.get_child_at_index(i), depth + 1, handle, i))
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
            if (current != ref.fingerprint or root_current != ref.root_fingerprint
                    or public != ref.metadata
                    or ref.node.get_process_id() != window["pid"]
                    or ref.root.get_process_id() != window["pid"]):
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
                names = [(i, interface.get_action_name(i))
                         for i in range(min(interface.get_n_actions(), 32))]
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
                if (ref.node.get_child_at_index(index) != child
                        or self._data(child)[0] != fingerprint):
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
            if (ref.node.get_state_set().contains(self.api.StateType.DEFUNCT)
                    or ref.root.get_state_set().contains(self.api.StateType.DEFUNCT)):
                raise PrimitiveError("rejected", "Field readback node is defunct")
            if ((root_current[0], root_current[2])
                    != (ref.root_fingerprint[0], ref.root_fingerprint[2])
                    or current[:3] != ref.fingerprint[:3]
                    or ref.node.get_process_id() != window["pid"]
                    or ref.root.get_process_id() != window["pid"]):
                raise PrimitiveError("rejected", "Field readback target changed")
            ancestor = ref.node
            for _ in range(7):
                guard()
                if ancestor == ref.root or ancestor is None:
                    break
                ancestor = ancestor.get_parent()
            if ancestor != ref.root:
                raise PrimitiveError("rejected", "Field left its observed native root")
            if not public["text_readable"] or not public["text_complete"]:
                raise PrimitiveError("unsupported", "Full field text is unavailable")
            guard()
            return {"text": public["text"], "text_complete": True}
        except PrimitiveError:
            raise
        except Exception as exc:
            raise PrimitiveError("unsupported", "Native field readback failed") from exc
