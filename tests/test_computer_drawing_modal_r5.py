"""Startup approval cannot spread to changed pixels, identities or new node metadata."""

import pytest

from tests.test_computer_runtime_grounding_r4 import Desktop


@pytest.mark.parametrize(
    "change,expected",
    [
        ("missing_buttons", "safe_application"),
        ("pixels", "unknown"),
        ("window", "unknown"),
        ("process", "unknown"),
        ("foreign", "unknown"),
        ("new_label", "unknown"),
        ("password", "unknown"),
        ("terminal", "unknown"),
        ("security_text", "unknown"),
        ("empty", "unknown"),
        ("unapproved", "unknown"),
    ],
)
def test_same_startup_missing_descendants_require_exact_prior_proof(change, expected):
    desktop = Desktop()
    desktop._profile = "drawing"
    desktop._same_app_transient = lambda _: True
    window = {**desktop.window, "modal": True}
    full = [
        {"role": "alert", "name": "Information"},
        {"role": "push button", "name": "No"},
        {"role": "push button", "name": "Yes"},
    ]
    assert desktop._classify_modal(window, full, b"original") == "safe_application"
    desktop._source_fingerprint = ("already-observed",)
    partial = full[:1]
    digest = b"original"
    if change == "pixels":
        digest = b"changed"
    elif change in ("window", "process"):
        window["id" if change == "window" else "pid"] += 1
    elif change == "foreign":
        desktop._same_app_transient = lambda _: False
    elif change == "new_label":
        partial.append({"role": "label", "name": "unrecognized operation"})
    elif change in ("password", "terminal"):
        partial.append({"role": change, "name": ""})
    elif change == "security_text":
        partial.append({"role": "label", "name": "", "text": "security permission"})
    elif change == "empty":
        partial = []
    elif change == "unapproved":
        desktop._startup_approval = None
    # R16 removed keyword denial, not exact-signature grounding. A new role or
    # label still cannot inherit approval from an incomplete startup snapshot.
    assert desktop._classify_modal(window, partial, digest) == expected


def test_dismissed_startup_never_reacquires_same_window_id():
    desktop = Desktop()
    desktop._profile = "drawing"
    desktop._same_app_transient = lambda _: True
    window = {**desktop.window, "modal": True}
    full = [
        {"role": "alert", "name": "Information"},
        {"role": "push button", "name": "No"},
        {"role": "push button", "name": "Yes"},
    ]
    assert desktop._classify_modal(window, full, b"original") == "safe_application"
    desktop._source_fingerprint = ("already-observed",)
    assert desktop._classify_modal({**window, "modal": False}, []) is None
    assert desktop._classify_modal(window, full, b"original") == "unknown"
