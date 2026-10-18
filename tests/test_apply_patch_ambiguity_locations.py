"""An ambiguous apply_patch hunk says where its context matched, in pre-patch lines.

Matching itself is unchanged: an ambiguous hunk is still refused and nothing is
written. Only the error gains locations, preceding-line context and advice that
fits which search was ambiguous.
"""

from __future__ import annotations

import json

import pytest

from src.tools.apply_patch import ANCHOR_RULE, PatchError, apply_plan, parse_patch

TWO_TESTS = (
    "class A:\n"
    "    def test_a(self):\n"
    "        x = 1\n"
    "        return x\n"
    "\n"
    "class B:\n"
    "    def test_b(self):\n"
    "        x = 1\n"
    "        return x\n"
)


def refused(tmp_path, source, body, name="target.py"):
    target = tmp_path / name
    target.write_text(source)
    plan = parse_patch(f"*** Begin Patch\n{body}\n*** End Patch\n")
    with pytest.raises(PatchError, match="context is ambiguous") as caught:
        apply_plan(str(tmp_path), plan)
    assert target.read_text() == source
    # The transported plan is plain JSON; the host runner must say the same.
    with pytest.raises(PatchError) as transported:
        apply_plan(str(tmp_path), json.loads(json.dumps(plan)))
    assert str(transported.value) == str(caught.value)
    return str(caught.value)


def test_no_anchor_names_each_match_and_the_line_above_it(tmp_path):
    message = refused(tmp_path, TWO_TESTS,
                      "*** Update File: target.py\n@@\n         x = 1\n-        return x\n+        return 0")
    assert message == (
        "context is ambiguous in target.py, hunk at patch line 3, anchors [<none>]; "
        'the context matches at line 3 (below "    def test_a(self):") and '
        'line 8 (below "    def test_b(self):"); add more unchanged lines, or an @@ anchor '
        f"naming a line above the intended match ({ANCHOR_RULE})"
    )


def test_an_ambiguous_single_anchor_gets_anchor_advice_not_more_context(tmp_path):
    source = TWO_TESTS.replace("test_b", "test_a")
    message = refused(tmp_path, source,
                      "*** Update File: target.py\n@@     def test_a(self):\n"
                      "         x = 1\n-        return x\n+        return 0")
    assert ('the @@ anchor line matches at line 2 (below "class A:") and '
            'line 7 (below "class B:"); add an earlier @@ anchor before it') in message
    assert "replace it with an exact line that appears only once" in message
    assert "put that line in the hunk body as unchanged context" in message
    assert "add more unchanged lines" not in message


def test_ambiguity_after_one_anchor_says_the_search_runs_to_the_end(tmp_path):
    message = refused(tmp_path, TWO_TESTS,
                      "*** Update File: target.py\n@@ class A:\n"
                      "         x = 1\n-        return x\n+        return 0")
    assert ('after the @@ anchor at line 1, the context matches at line 3 '
            '(below "    def test_a(self):") and line 8') in message
    assert "the search runs from the anchor to the end of the file" in message


def test_a_chain_with_several_complete_matches_lists_them(tmp_path):
    source = "a\nb\nbody\na\nb\nbody\n"
    message = refused(tmp_path, source, "*** Update File: target.py\n@@ a\n@@ b\n-body\n+BODY")
    assert ("the anchor chain and hunk body have multiple complete matches: "
            "at line 3 and line 6; add more unchanged lines or another @@ anchor") in message


def test_one_body_reached_through_two_chains_stays_ambiguous(tmp_path):
    # Two complete chains (a@1,b@2) and (a@3,b@4), and others, all end at
    # the one body on line 5: still ambiguous, never resolved to it.
    message = refused(tmp_path, "a\nb\na\nb\nbody\n",
                      "*** Update File: target.py\n@@ a\n@@ b\n-body\n+BODY")
    assert ("multiple complete matches: line 5 is reached through more than one anchor "
            "chain; make the anchors more specific") in message


def test_line_numbers_are_pre_patch_after_an_earlier_hunk_adds_or_removes_lines(tmp_path):
    source = "head\nold1\nold2\n" + TWO_TESTS
    grown = refused(tmp_path, source,
                    "*** Update File: target.py\n@@\n head\n+added1\n+added2\n"
                    "@@\n         x = 1\n-        return x\n+        return 0")
    assert "matches at line 6 (below" in grown and "line 11 (below" in grown
    shrunk = refused(tmp_path, source,
                     "*** Update File: target.py\n@@\n head\n-old1\n-old2\n"
                     "@@\n         x = 1\n-        return x\n+        return 0")
    assert "matches at line 6 (below" in shrunk and "line 11 (below" in shrunk


def test_the_hint_quotes_the_pre_patch_line_not_an_earlier_hunks_edit(tmp_path):
    source = TWO_TESTS + "\nclass C:\n    def test_c(self):\n        x = 1\n        return x\n"
    message = refused(tmp_path, source,
                      "*** Update File: target.py\n@@\n-    def test_b(self):\n"
                      "+    def test_b_renamed(self):\n"
                      "@@\n         x = 1\n-        return x\n+        return 0")
    assert 'line 8 (below "    def test_b(self):")' in message
    assert "test_b_renamed" not in message


def test_at_most_five_locations_then_how_many_more(tmp_path):
    source = "".join(f"def f{index}():\n    return 1\n" for index in range(7))
    message = refused(tmp_path, source, "*** Update File: target.py\n@@\n-    return 1\n+    return 2")
    assert "line 2 (below \"def f0():\"), " in message
    assert "line 10 (below \"def f4():\"), and 2 more" in message
    assert "line 12" not in message


def test_a_top_level_match_has_no_hint(tmp_path):
    message = refused(tmp_path, "x = 1\ny = 2\nx = 1\n",
                      "*** Update File: target.py\n@@\n-x = 1\n+x = 3")
    assert "the context matches at line 1 and line 3; add more" in message


def test_hints_stay_exact_escaped_and_bounded(tmp_path):
    long_header = "def " + "n" * 150 + "():"
    source = (f"{long_header}\n    value = 1\n"
              "class Tab:\t\x01note  \n    value = 1\n")
    message = refused(tmp_path, source,
                      "*** Update File: target.py\n@@\n-    value = 1\n+    value = 2")
    cut = json.dumps(long_header[:120])
    assert f"line 2 (below {cut} (first 120 characters))" in message
    # Tabs, control characters and trailing spaces are shown escaped, exactly.
    assert 'line 4 (below "class Tab:\\t\\u0001note  ")' in message
    assert "\x01" not in message and "\t" not in message
