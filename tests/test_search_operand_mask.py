"""Read-only searches' quoted patterns are data, not commands (harmless cases).

Positive fixtures for the dangerous families are classification-only and live
in Odin's fixture file; every string here is a harmless search or echo.
"""
from __future__ import annotations

import pytest

from src.tools.risk_classifier import RiskLevel, classify_command
from src.tools.search_operand_mask import mask_passive_search_operands


@pytest.mark.parametrize(
    "command",
    [
        "rg -n 'def close|shutdown|supervisor' src/desktop/services.py",
        "grep -E 'error|reboot' /var/log/syslog",
        "journalctl -b | grep -E 'start|shutdown' | tail -5",
        "git log --oneline | grep -i 'graceful|shutdown'",
        "git grep -n 'halt|poweroff' -- src",
        "LC_ALL=C grep -E 'a|reboot' f 2>/dev/null > out.txt",
        "/usr/bin/grep -e 'x|halt' f",
        'egrep "warn|halt" log.txt',
        "rg -i --glob '*.py' -e 'a|shutdown' -e 'b|reboot' src",
        "rg 'a|shutdown' f && echo done",
        "cd /src && rg -n 'capture_active|class|def .*scope' a.py && "
        "rg -n 'def close|shutdown|supervisor' s.py | tail -30 && git status --short",
    ],
)
def test_harmless_searches_are_not_critical(command):
    assert mask_passive_search_operands(command) is not None
    assert classify_command(command).level is RiskLevel.LOW


@pytest.mark.parametrize(
    "command",
    [
        "echo 'a|halt'",                                  # not a search program
        "sudo grep 'a|shutdown' f",                       # wrapper: not recognised
        "rg --pre x 'a|shutdown' f",                      # executes a preprocessor
        "rg --pre-glob '*.gz' 'a|shutdown' f",
        "rg --hostname-bin=/bin/true 'a|halt' f",         # executes a helper
        "rg -z 'a|halt' f",                               # runs decompressors
        "git grep --textconv 'a|reboot'",                 # runs textconv filters
        "git grep -O 'a|reboot'",                         # runs a pager
        "git grep --open-files-in-pager=less 'a|halt'",
        "rg --future-option 'a|shutdown' f",              # unknown option
        'grep "a|shutdown $(id)" f',                      # active substitution
        "grep \"a|halt `id`\" f",                         # backticks
        "grep 'a|halt' <(cat f)",                         # process substitution
        "(grep 'a|halt' f)",                              # subshell
        "grep 'a|halt' f # comment",                      # comment
        "grep 'a|halt",                                   # unbalanced quote
        "git -C repo grep 'a|halt'",                      # global option before grep
    ],
)
def test_masking_is_declined_outside_the_understood_subset(command):
    assert mask_passive_search_operands(command) is None
    assert classify_command(command).level is RiskLevel.CRITICAL


def test_masking_keeps_every_byte_outside_quoted_operands():
    command = "LC_ALL=C rg -n 'a|shutdown' \"src|x\" 2>/dev/null | head -5; echo 'a|halt'"

    masked = mask_passive_search_operands(command)

    assert masked == "LC_ALL=C rg -n 'xxxxxxxxxx' \"xxxxx\" 2>/dev/null | head -5; echo 'a|halt'"
    assert len(masked) == len(command)


def test_unquoted_text_is_never_masked():
    command = "grep -c shutdown README.md"

    assert mask_passive_search_operands(command) is None
    assert classify_command(command).level is RiskLevel.LOW


@pytest.mark.parametrize(
    "command",
    ["rg -A3 -e 'x|halt' f", "grep -nri --include='*.log' 'a|reboot' .",
     "rg --max-count 5 'a|halt' f", "rg --color=never 'a|halt' f"],
)
def test_option_values_are_parsed_not_trusted(command):
    assert mask_passive_search_operands(command) is not None


@pytest.mark.parametrize(
    "command,masked",
    [
        ("rg 'a|b' f > out", "rg 'xxx' f > out"),
        ("rg 'a|b' f > 'o|t'", "rg 'xxx' f > 'o|t'"),  # a target is never blanked
        ("> out rg 'a|b' f", "> out rg 'xxx' f"),
        ("rg 'a|b' f 2>/dev/null >> log", "rg 'xxx' f 2>/dev/null >> log"),
        ("rg 'a|b' f 2>&1 | head", "rg 'xxx' f 2>&1 | head"),
    ],
)
def test_redirect_targets_are_targets(command, masked):
    assert mask_passive_search_operands(command) == masked


@pytest.mark.parametrize(
    "command",
    [
        "> rg echo 'a|b'",                 # the target is not the program
        "rg > -- --future-option 'a|b' f",  # nor the end of options
        "rg 'a|b' f >| out",
        "rg 'a|b' f <> io",
        "rg 'a|b' f >",
    ],
)
def test_redirects_outside_the_subset_decline(command):
    assert mask_passive_search_operands(command) is None


def test_an_anchored_rule_word_outside_the_mask_keeps_the_original_text():
    # Masking can only remove matches inside the search's operands; here the
    # word also appears outside them (a file name), so the text is classified
    # as written.
    command = "rg 'a|halt' docs/shutdown.md"

    assert mask_passive_search_operands(command) == "rg 'xxxxxx' docs/shutdown.md"
    assert classify_command(command).level is RiskLevel.CRITICAL
    assert classify_command("rg 'a|halt' docs/notes.md").level is RiskLevel.LOW


@pytest.mark.parametrize(
    "command",
    [
        "rg 'a|b' f; ls *.py",       # an expanding word outside the search operands
        "rg 'a|b' f && echo [x]",
        "rg 'a|b' f; cat note?.txt",
        "rg 'a|b' f; sh -c 'ls *.txt'",  # a quoted payload an interpreter expands
    ],
)
def test_expanding_words_outside_the_operands_decline(command):
    assert mask_passive_search_operands(command) is None


@pytest.mark.parametrize(
    "command,masked",
    [
        ("rg --glob '*.py' 'a|b' f", "rg --glob 'xxxx' 'xxx' f"),  # the glob is quoted data
        ("grep -nri --include='*.log' 'a|reboot' .", "grep -nri --include='xxxxx' 'xxxxxxxx' ."),
    ],
)
def test_quoted_globs_are_literal_data_and_still_masked(command, masked):
    assert mask_passive_search_operands(command) == masked


@pytest.mark.parametrize(
    "command",
    [
        "rg 'a|b' src/*.py",   # an operand the shell expands before rg runs
        "rg 'a|b' *",
        "rg 'a|b' note?.txt",
        "grep 'a|b' 'kept' [abc]*",
    ],
)
def test_unquoted_glob_operands_are_declined(command):
    # The operand expands at runtime, so the command's real arguments are not
    # known from its text; classify the original rather than certify it passive.
    assert mask_passive_search_operands(command) is None
