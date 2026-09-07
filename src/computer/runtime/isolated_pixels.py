"""Compound private-:77 replacement with preflighted codes, never keymap writes.

Pixels identify a region, not a toolkit field. Native calls share the worker's
cooperative two-second deadline and its external process-teardown boundary.
"""

import ctypes

from .accessibility import PrimitiveError


def validate_field(action):
    region, text = action.get("region"), action.get("text")
    if (type(region) is not dict or set(region) != {"x", "y", "width", "height"}
            or any(type(v) is not int for v in region.values())
            or region["x"] < 0 or region["y"] < 0
            or region["width"] < 1 or region["height"] < 1):
        raise PrimitiveError("rejected", "invalid_field_region")
    if (type(text) is not str or len(text) > 512
            or any(ord(c) < 32 or 127 <= ord(c) <= 159
                   or 0xD800 <= ord(c) <= 0xDFFF for c in text)):
        raise PrimitiveError("rejected", "invalid_text")


class IsolatedPixelInput:
    def __init__(self, desktop):
        from .x11_owned_device import ExistingXTest
        if desktop._runner is not None:
            raise PrimitiveError("unsupported", "Native pixel keyplan requires private X authority")
        desktop._guard()
        self.desktop = desktop
        self.pending: dict[str, set[int]] = {"key": set(), "button": set()}
        self.held: dict[str, set[int]] = {"keys": set(), "buttons": set()}
        self.order = []
        self.point = None
        self.modifier_masks = {}
        self.native = ExistingXTest(":77")  # Queries/subscription only; no device creation.

    def check(self):
        from .x11_owned_device import _XkbState
        d, n = self.desktop, self.native
        d._guard()
        d._assert_field_window()  # Dirty titles are allowed, changed windows are not.
        if (d._pixel_focus_at_observation is None
                or int(d._run("getwindowfocus", "-f")) != d._pixel_focus_at_observation):
            raise PrimitiveError("rejected", "Pixel field native focus changed")
        if n.physical_events() or n.physical_seen:
            raise PrimitiveError("rejected", "Private input state changed")
        n._assert_keyboard_mapping()
        if n.held() != self.held or any(n.physical_held().values()):
            raise PrimitiveError("rejected", "Private input is busy or changed")
        state = _XkbState()
        if n._x.XkbGetState(n._display, n._keyboard_id(), ctypes.byref(state)) != 0:
            raise PrimitiveError("rejected", "Private keyboard state unavailable")
        mask = 0
        for code in self.held["keys"]:
            mask |= self.modifier_masks.get(code, 0)
        if state.base_mods != mask or state.latched_mods:
            raise PrimitiveError("rejected", "Private keyboard modifiers changed")
        if self.point is not None:
            if n.pointer() != self.point or not d._pointer_target(d._expected["id"]):
                raise PrimitiveError("rejected", "Pixel field pointer target changed")
        d._guard()

    def execute(self, action):
        from .pixel_fields import pixel_field_steps
        from .x11_owned_device import _prove_modifier_effects
        validate_field(action)
        d, n = self.desktop, self.native
        region = action["region"]
        left, top = d._point(region["x"], region["y"])
        right, bottom = d._point(left + region["width"] - 1, top + region["height"] - 1)
        if (d._root_extent is None or right >= d._root_extent[0]
                or bottom >= d._root_extent[1]):
            raise PrimitiveError("rejected", "Field outside observed source")
        self.check()
        # Pin one state across every constituent resolution, not just the last.
        n.key_plan((), "BackSpace")
        initial_state = n._text_state
        if initial_state is None:
            raise PrimitiveError("rejected", "Private keyboard state unavailable")
        steps = pixel_field_steps(
            action, n, error=lambda reason: PrimitiveError("rejected", reason))
        if n._text_state != initial_state:
            raise PrimitiveError("rejected", "Private keyboard changed during preflight")
        # Prove every Unicode modifier's actual XKB action, not only Ctrl+A.
        mapping = n._x.XGetModifierMapping(n._display)
        if not mapping:
            raise PrimitiveError("unsupported", "Private modifier mapping unavailable")
        try:
            m = mapping.contents
            if not 1 <= m.max_keypermod <= 256 or not m.modifiermap:
                raise PrimitiveError("unsupported", "Private modifier mapping unavailable")
            slots = list(m.modifiermap[:8 * m.max_keypermod])
            for code in {step[1] for step in steps if step[0] == "key"}:
                used = {i // m.max_keypermod for i, value in enumerate(slots) if value == code}
                if used:
                    if len(used) != 1:
                        raise PrimitiveError("unsupported", "Ambiguous private modifier")
                    slot = used.pop()
                    _prove_modifier_effects(n._display, n._keyboard_id(), initial_state[0],
                                            [code], [slot], initial_state[1])
                    self.modifier_masks[code] = 1 << slot
        finally:
            n._x.XFreeModifiermap(mapping)
        probe = d._clock()
        self.check()
        # Reserve full checked dispatch BEFORE motion; long plans safely refuse.
        cost = max(0.01, 3 * (d._clock() - probe))
        if len(steps) * cost + 0.20 > d._deadline - d._clock():
            raise PrimitiveError("rejected", "Pixel field exceeds private dispatch budget")
        n.dispatch_check = self.check
        for step in steps:
            self.check()
            kind, *args = step
            if kind == "wait":
                d._cancelled.wait(args[0])
                continue
            if kind in self.pending:
                code, down = args
                if down:
                    self.pending[kind].add(code)
                    self.order.append((kind, code))
            d._attempted = True
            getattr(n, kind)(*args)
            d._injected = True
            if kind == "move":
                self.point = tuple(args)
            else:
                field = "keys" if kind == "key" else "buttons"
                if down:
                    self.held[field].add(code)
                else:
                    self.held[field].discard(code)
            self.check()
            if kind in self.pending and not down:
                self.pending[kind].discard(code)

    def release(self):
        """Release potential downs despite focus/map/cancel loss; never replay."""
        n, clean = self.native, True
        n.dispatch_check = None
        if not self.desktop._attempted:
            n.close()
            return True
        for kind, code in reversed(self.order):
            if code not in self.pending[kind]:
                continue
            try:
                self.desktop._guard()
                n.release_owned(kind, code)
                field = "keys" if kind == "key" else "buttons"
                if code in n.owned_release_state()[field]:
                    raise PrimitiveError("failed", "Private input release unconfirmed")
                self.pending[kind].discard(code)
            except Exception:
                clean = False
        if clean:
            self.desktop._guard()
            if any(n.owned_release_state().values()):
                return False
            n.close()
        return clean
