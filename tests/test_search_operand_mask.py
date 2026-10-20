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
