"""Read-only guard tests. Never opens a display or launches a process."""

import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "main_smoke", Path(__file__).with_name("main-session-app-smoke-r6.py")
)
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)


class PrivateMainTests(unittest.TestCase):
    def test_private_flag_cannot_target_operator_display(self):
        args = SimpleNamespace(display=":0", monitor="DP-4", xauthority="/tmp/authority")
        with patch.object(harness.os, "geteuid", return_value=0):
            with self.assertRaisesRegex(RuntimeError, "private_namespace_required"):
                harness.validate_private_fixture(args)

    def test_missing_authorization_rejected_first(self):
        with self.assertRaisesRegex(RuntimeError, "explicit_current"):
            harness.validate_args(SimpleNamespace(confirm_scratch_only=False))

    def test_main_qualification_gate_is_not_private_override(self):
        with patch.object(harness, "PRIVATE_TASK_QUALIFIED", False):
            with self.assertRaisesRegex(RuntimeError, "not_privately_qualified"):
                harness.validate_args(
                    SimpleNamespace(confirm_scratch_only=True, private_qualification=False)
                )

    def test_svg_requires_real_nonempty_rectangle_and_ellipse(self):
        valid = (
            b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/>'
            b'<ellipse rx="3" ry="4"/></svg>'
        )
        self.assertEqual(harness.verify_shapes(valid)["rectangles"], 1)
        for blob in (
            valid.replace(b'width="10"', b'width="0"'),
            valid.replace(b"ellipse", b"circle"),
            b"<!DOCTYPE svg>" + valid,
        ):
            with self.assertRaises(RuntimeError):
                harness.verify_shapes(blob)


if __name__ == "__main__":
    unittest.main()
