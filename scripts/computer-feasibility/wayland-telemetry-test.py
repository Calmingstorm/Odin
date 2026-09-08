"""Pure regressions: no GI, display, device or Docker daemon required."""

import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "receiver", Path(__file__).with_name("wayland-receiver.py")
)
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


portal = load("wayland-portal")
lifecycle = load("wayland-lifecycle")


class OwnershipTest(unittest.TestCase):
    def test_fd_list_is_emptied_not_duplicated(self):
        class Fds:
            fds = [101, 102]

            def get_length(self):
                return len(self.fds)

            def steal_fds(self):
                value, self.fds = self.fds, []
                return value

            def get(self, index):
                raise AssertionError("get leaves original socket open")

        fds = Fds()
        with patch.object(portal.os, "close") as close:
            self.assertEqual(portal.take_fd(fds, 1), 102)
            close.assert_called_once_with(101)
        self.assertEqual(fds.get_length(), 0)

    def test_bad_fd_index_does_not_transfer(self):
        class Fds:
            def get_length(self):
                return 1

            def steal_fds(self):
                raise AssertionError("must validate before transfer")

        for index in (-1, 1):
            with self.assertRaises(ValueError):
                portal.take_fd(Fds(), index)

    def test_alt_candidate_is_not_cleared_or_broadened(self):
        sample = dict(
            active=True, toplevel_focus=True, focused=True, keys=[65513], buttons=[], state=0
        )
        original = json.dumps(sample, sort_keys=True)
        self.assertTrue(lifecycle.needs_operator_alt_cycle(sample))
        self.assertEqual(json.dumps(sample, sort_keys=True), original)
        for field, value in [
            ("active", False),
            ("focused", False),
            ("toplevel_focus", False),
            ("keys", [65513, 65508]),
            ("keys", [65505]),
            ("buttons", [1]),
            ("state", 8),
            ("state", 4),
        ]:
            self.assertFalse(lifecycle.needs_operator_alt_cycle({**sample, field: value}))
        self.assertFalse(lifecycle.needs_operator_alt_cycle(None))


class FakeUnion:
    button = object()
    keyval = object()
    state = object()
    x = object()
    y = object()

    def get_button(self):
        return True, 1

    def get_keyval(self):
        return True, 65506

    def get_coords(self):
        return True, 241.0, 180.0

    def get_state(self):
        return True, 261


class TelemetryTest(unittest.TestCase):
    def test_button_union_is_not_serialized(self):
        value = receiver.typed_event(FakeUnion(), button_event=True)
        self.assertEqual(value, dict(button=1, key=None, x=241.0, y=180.0, state=261))
        self.assertEqual(json.loads(json.dumps(value)), value)

    def test_key_union_is_not_serialized(self):
        self.assertEqual(receiver.typed_event(FakeUnion(), key_event=True)["key"], 65506)

    def test_optional_unavailable_fields(self):
        class Missing(FakeUnion):
            def get_coords(self):
                return False, 0, 0

            def get_state(self):
                return False, 0

        value = receiver.typed_event(Missing())
        self.assertEqual(value, dict(button=None, key=None, x=None, y=None, state=None))

    def test_required_missing_is_not_success(self):
        class Missing(FakeUnion):
            def get_button(self):
                return False, 0

        with self.assertRaises(ValueError):
            receiver.typed_event(Missing(), button_event=True)

    def test_error_does_not_kill_next_sample(self):
        seen = []

        def bad():
            raise TypeError("fake union")

        self.assertTrue(receiver.recurring(bad, seen.append))
        self.assertEqual(seen, ["TypeError: fake union"])
        self.assertTrue(receiver.recurring(lambda: seen.append("fresh sample"), seen.append))
        self.assertEqual(seen[-1], "fresh sample")


if __name__ == "__main__":
    unittest.main()
