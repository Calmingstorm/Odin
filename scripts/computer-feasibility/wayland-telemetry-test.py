"""Pure regressions: no GI, display, device or Docker daemon required."""
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).with_name('wayland-receiver.py'))
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


class FakeUnion:
    button = object()
    keyval = object()
    state = object()
    x = object()
    y = object()
    def get_button(self): return True, 1
    def get_keyval(self): return True, 65506
    def get_coords(self): return True, 241.0, 180.0
    def get_state(self): return True, 261


class TelemetryTest(unittest.TestCase):
    def test_button_union_is_not_serialized(self):
        value = receiver.typed_event(FakeUnion(), button_event=True)
        self.assertEqual(value, dict(button=1, key=None, x=241., y=180., state=261))
        self.assertEqual(json.loads(json.dumps(value)), value)

    def test_key_union_is_not_serialized(self):
        self.assertEqual(receiver.typed_event(FakeUnion(), key_event=True)['key'], 65506)

    def test_optional_unavailable_fields(self):
        class Missing(FakeUnion):
            def get_coords(self): return False, 0, 0
            def get_state(self): return False, 0
        value = receiver.typed_event(Missing())
        self.assertEqual(value, dict(button=None, key=None, x=None, y=None, state=None))

    def test_required_missing_is_not_success(self):
        class Missing(FakeUnion):
            def get_button(self): return False, 0
        with self.assertRaises(ValueError): receiver.typed_event(Missing(), button_event=True)

    def test_error_does_not_kill_next_sample(self):
        seen = []
        def bad(): raise TypeError('fake union')
        self.assertTrue(receiver.recurring(bad, seen.append))
        self.assertEqual(seen, ['TypeError: fake union'])
        self.assertTrue(receiver.recurring(lambda: seen.append('fresh sample'), seen.append))
        self.assertEqual(seen[-1], 'fresh sample')


if __name__ == '__main__': unittest.main()
