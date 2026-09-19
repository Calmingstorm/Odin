"""Error-path guidance must teach corrections without relaxing patch safety."""

import pytest

from src.tools.apply_patch import PatchError, apply_plan, parse_patch


def envelope(body):
    return f"*** Begin Patch\n{body}\n*** End Patch"


def test_bare_empty_hunk_teaches_a_working_named_anchor_correction(tmp_path):
    target = tmp_path / "example.py"
    original = "def example():\n    old = 1\n    return old\n"
    target.write_text(original)
    bad = envelope(
        "*** Update File: example.py\n@@\n def example():\n@@\n"
        "-    old = 1\n+    old = 2"
    )
    with pytest.raises(PatchError) as caught:
        parse_patch(bad)
    error = str(caught.value)
    assert "patch line 3 contains no '+' or '-' line" in error
    assert "a bare @@ opens a new hunk" in error
    assert "@@ def function_name" in error
    assert "drop the extra @@ marker" in error
    assert target.read_text() == original
    corrected = envelope(
        "*** Update File: example.py\n@@ def example():\n"
        "-    old = 1\n+    old = 2"
    )
    apply_plan(str(tmp_path), parse_patch(corrected))
    assert target.read_text() == original.replace("old = 1", "old = 2")


def test_named_empty_hunk_does_not_claim_a_bare_marker():
    with pytest.raises(PatchError) as caught:
        parse_patch(envelope("*** Update File: a\n@@ def example():\n unchanged"))
    assert "contains no '+' or '-' line" in str(caught.value)
    assert "bare @@" not in str(caught.value)


def test_unanchored_mismatch_guidance_preserves_exact_matching(tmp_path):
    target = tmp_path / "a"
    target.write_text("actual\n")
    with pytest.raises(PatchError) as caught:
        apply_plan(str(tmp_path), parse_patch(envelope("*** Update File: a\n@@\n-old\n+new")))
    error = str(caught.value)
    assert "anchors [<none>]" in error
    assert "re-read the current file" in error
    assert "@@ def function_name" in error
    assert "Anchors do not relax exact body matching" in error
    assert target.read_text() == "actual\n"
