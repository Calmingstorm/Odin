"""Mask the passive data operands of read-only search commands for text policy.

``rg -n 'close|shutdown' f`` classified critical: the ``|`` inside the quoted
pattern satisfied the separator in the shutdown rule. This module blanks the
CONTENT of quoted operands of a few search programs, and only those, before
the text patterns run. It is deliberately conservative:

- a bounded lexer that gives up (returns None: classify the original text) on
  anything it does not fully understand: expansions, substitutions, escapes,
  subshells, groups, heredocs, comments, unbalanced quotes;
- programs: grep, egrep, fgrep, rg and ``git grep``, invoked by name or by a
  standard bin path, with only known passive options; an unknown or
  execution-capable option (rg ``--pre``/``--hostname-bin``, git grep
  ``--textconv``/``--open-files-in-pager``, ...) disables masking for that
  command;
- only single-quoted segments and double-quoted segments without ``$``,
  backticks or backslashes are blanked; every other byte, including
  separators, redirects and other commands, stays as written;
- a redirect's target word is a target, never an argument: it can neither
  name the program nor end its options, and it is never blanked. A redirect
  without a target, ``>|`` and ``<>`` are not understood;
- an operand whose ``*``, ``?`` or ``[`` is unquoted is expanded by the shell
  before the program runs, so the command's real operands are not known from
  its text and masking is declined; the quoted search pattern may hold these
  characters as data and is still blanked;
- any other word carrying ``*``, ``?`` or ``[``, quoted or not, may be a
  pathname the shell, or an interpreter such as ``sh -c`` or ``eval``, expands
  on the host that runs it; masking is declined, never resolved against this
  host's files.

The exfil tier, shapes and brace-bound checks still run on the original text.
"""
from __future__ import annotations

from dataclasses import dataclass, field

_MAX_COMMAND_CHARS = 16_384
_PLAIN_CHARS = frozenset(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    "-_./=:,@%+*?[]~^"
)
_BIN_DIRS = ("/usr/bin/", "/bin/", "/usr/local/bin/")
_SEARCH_PROGRAMS = {"grep", "egrep", "fgrep", "rg"}


@dataclass
class _Word:
    start: int
    end: int
    text: str = ""
    quoted: list[tuple[int, int]] = field(default_factory=list)  # content spans
    has_quotes: bool = False


@dataclass
class _Option:
    flags: frozenset[str]
    flags_with_arg: frozenset[str]
    long: frozenset[str]
    long_with_arg: frozenset[str]


_GREP = _Option(
    flags=frozenset("EFGPivwxclLnhHoqsrRaIUzZbTu"),
    flags_with_arg=frozenset("efABCmdD"),
    long=frozenset({
        "extended-regexp", "fixed-strings", "basic-regexp", "perl-regexp", "ignore-case",
        "no-ignore-case", "invert-match", "word-regexp", "line-regexp", "count",
        "files-with-matches", "files-without-match", "line-number", "no-filename",
        "with-filename", "only-matching", "quiet", "silent", "recursive",
        "dereference-recursive", "text", "null", "null-data", "byte-offset", "initial-tab",
        "no-messages", "line-buffered", "color", "colour",
    }),
    long_with_arg=frozenset({
        "regexp", "file", "max-count", "after-context", "before-context", "context",
        "include", "exclude", "exclude-dir", "binary-files", "directories", "devices",
        "label", "color", "colour", "group-separator",
    }),
)
_RG = _Option(
    flags=frozenset("iInlLcvwxFsSuUoHhq0Pa"),
    flags_with_arg=frozenset("egtTABCmMrj"),
    long=frozenset({
        "ignore-case", "smart-case", "case-sensitive", "line-number", "no-line-number",
        "count", "count-matches", "files-with-matches", "files-without-match", "invert-match",
        "word-regexp", "line-regexp", "fixed-strings", "hidden", "no-ignore", "no-ignore-vcs",
        "follow", "only-matching", "no-heading", "heading", "json", "vimgrep", "stats",
        "with-filename", "no-filename", "null", "multiline", "multiline-dotall", "pcre2",
        "text", "binary", "no-messages", "quiet", "files", "column", "trim", "passthru",
        "byte-offset", "crlf", "unrestricted", "glob-case-insensitive", "no-config",
    }),
    long_with_arg=frozenset({
        "regexp", "glob", "iglob", "type", "type-not", "after-context", "before-context",
        "context", "max-count", "max-columns", "max-depth", "max-filesize", "replace",
        "threads", "sort", "sortr", "color", "colors", "encoding", "engine",
        "path-separator", "context-separator", "ignore-file",
    }),
)
_GIT_GREP = _Option(
    flags=frozenset("nivwclLhHEFGPIqopWa"),
    flags_with_arg=frozenset("eABCmf"),
    long=frozenset({
        "cached", "untracked", "no-index", "no-exclude-standard", "exclude-standard",
        "recurse-submodules", "line-number", "ignore-case", "word-regexp", "invert-match",
        "count", "files-with-matches", "name-only", "files-without-match", "full-name",
        "heading", "break", "and", "or", "not", "all-match", "quiet", "only-matching",
        "extended-regexp", "fixed-strings", "basic-regexp", "perl-regexp", "show-function",
        "function-context", "null", "text", "column", "color",
    }),
    long_with_arg=frozenset({
        "max-depth", "context", "after-context", "before-context", "max-count", "threads",
        "color",
    }),
)


def _lex(command: str) -> list[object] | None:
    """Words and operator strings, or None for anything outside the subset."""
    tokens: list[object] = []
    i, n = 0, len(command)
    while i < n:
        char = command[i]
        if char in " \t":
            i += 1
            continue
        if char in ";\n":
            tokens.append(char)
            i += 1
            continue
        if char in "&|":
            if command[i:i + 2] in ("&&", "||"):
                tokens.append(command[i:i + 2])
                i += 2
                continue
            if char == "&" and command[i + 1:i + 2] == ">":
                return None
            tokens.append(char)
            i += 1
            continue
        if char in "<>" or (char.isdigit() and _redirect_at(command, i)):
            end = _redirect_end(command, i)
            if end is None:
                return None
            tokens.append(("redirect", command[i:end]))
            i = end
            continue
        word = _Word(start=i, end=i)
        while i < n and command[i] not in " \t;\n&|<>":
            char = command[i]
            if char == "'":
                close = command.find("'", i + 1)
                if close < 0:
                    return None
                word.quoted.append((i + 1, close))
                word.text += command[i + 1:close]
                word.has_quotes = True
                i = close + 1
            elif char == '"':
                close = command.find('"', i + 1)
                if close < 0:
                    return None
                content = command[i + 1:close]
                if any(c in content for c in "$`\\"):
                    return None
                word.quoted.append((i + 1, close))
                word.text += content
                word.has_quotes = True
                i = close + 1
            elif char in _PLAIN_CHARS or (char.isalnum() and not char.isascii()):
                word.text += char
                i += 1
            else:
                # $ ` \\ ( ) { } ! # and anything else: not understood.
                return None
        word.end = i
        tokens.append(word)
    return tokens


def _redirect_at(command: str, i: int) -> bool:
    j = i
    while j < len(command) and command[j].isdigit():
        j += 1
    return j < len(command) and command[j] in "<>"


def _redirect_end(command: str, i: int) -> int | None:
    """End of a simple redirect operator (fd, <, >, >>, >&N, >&-).

    Heredocs, here-strings, ``<>`` and ``>|`` are not understood.
    """
    j = i
    while j < len(command) and command[j].isdigit():
        j += 1
    if command[j:j + 2] in ("<<", "<>", ">|"):
        return None
    j += 2 if command[j:j + 2] == ">>" else 1
    if command[j:j + 1] == "&":
        j += 1
        start = j
        while j < len(command) and (command[j].isdigit() or command[j] == "-"):
            j += 1
        return j if j > start else None
    return j


def _program(words: list[_Word]) -> tuple[_Option, int] | None:
    """The search option table and the index of its first argument, or None."""
    index = 0
    while index < len(words) and _is_assignment(words[index]):
        index += 1
    if index >= len(words) or words[index].has_quotes:
        return None
    name = words[index].text
    for prefix in _BIN_DIRS:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    if name in _SEARCH_PROGRAMS:
        return (_RG if name == "rg" else _GREP), index + 1
    if name == "git" and index + 1 < len(words) and words[index + 1].text == "grep" \
            and not words[index + 1].has_quotes:
        return _GIT_GREP, index + 2
    return None


def _is_assignment(word: _Word) -> bool:
    """NAME=value with an unquoted, valid NAME (the value may be quoted)."""
    head, sep, _ = word.text.partition("=")
    if not sep or not head or not (head[0].isalpha() or head[0] == "_"):
        return False
    if not all(c.isalnum() or c == "_" for c in head):
        return False
    equals_at = word.start + len(head)
    return not word.quoted or word.quoted[0][0] > equals_at


def _options_are_passive(words: list[_Word], table: _Option) -> bool:
    index, operands_only = 0, False
    while index < len(words):
        text = words[index].text
        index += 1
        if operands_only or not text.startswith("-") or text == "-":
            continue
        if text == "--":
            operands_only = True
            continue
        if text.startswith("--"):
            name, has_value, _ = text[2:].partition("=")
            if name in table.long_with_arg:
                if not has_value and name not in table.long:
                    index += 1  # its value is the next word
                continue
            if name in table.long and not has_value:
                continue
            return False  # unknown or execution-capable
        cluster = text[1:]
        for position, flag in enumerate(cluster):
            if flag in table.flags_with_arg:
                if position == len(cluster) - 1:
                    index += 1  # its value is the next word
                break
            if flag not in table.flags:
                return False
    return True


def _may_expand(word: _Word) -> bool:
    """Whether *word* holds a pathname pattern character, quoted or not: an
    interpreter can expand a quoted payload too."""
    return any(char in word.text for char in "*?[")


def _has_unquoted_glob(word: _Word, command: str) -> bool:
    """Whether *word* carries a ``*``, ``?`` or ``[`` outside its quoted spans.

    The shell expands such a character before the program runs, so the
    command's real operands are not known from its text and it cannot be
    certified passive. The same character inside a quoted span is literal data
    and does not count, so a quoted search pattern is unaffected."""
    quoted: set[int] = set()
    for start, end in word.quoted:
        quoted.update(range(start - 1, end + 1))  # the content and both quotes
    return any(
        command[position] in "*?["
        for position in range(word.start, word.end)
        if position not in quoted
    )


@dataclass(frozen=True)
class MaskedSearch:
    """A command with its search operands blanked, plus every other word as the
    shell would pass it (quotes removed): ``po'wer'off`` runs ``poweroff``."""

    masked: str
    other_words: tuple[str, ...]


def analyse_passive_search(command: str) -> MaskedSearch | None:
    """The masked command and its other words; None when nothing was masked or
    the text is outside the understood subset (classify the original)."""
    if len(command) > _MAX_COMMAND_CHARS:
        return None
    tokens = _lex(command)
    if tokens is None:
        return None
    spans: list[tuple[int, int]] = []
    other_words: list[str] = []
    simple: list[_Word] = []
    expect_target = False
    for token in [*tokens, ";"]:
        if isinstance(token, _Word):
            if expect_target:
                # The redirect's target: not an argument, and left as written.
                expect_target = False
                other_words.append(token.text)
                continue
            simple.append(token)
            continue
        if expect_target:
            return None  # a redirect without a target
        if isinstance(token, tuple):
            # ">&2" or ">&-" carries its target; any other redirect takes the
            # next word.
            expect_target = "&" not in token[1]
            continue
        found = _program(simple)
        operands: list[_Word] = []
        if found is not None:
            table, first_arg = found
            arguments = simple[first_arg:]
            if _options_are_passive(arguments, table):
                operands = arguments
                for word in arguments:
                    spans.extend(word.quoted)
        for word in simple:
            if word in operands:
                if _has_unquoted_glob(word, command):
                    return None  # an operand the shell expands before the program runs
                continue
            if _may_expand(word):
                return None  # a word that may expand into a command
            other_words.append(word.text)
        simple = []
    if not spans:
        return None
    chars = list(command)
    for start, end in spans:
        for position in range(start, end):
            chars[position] = "x"
    return MaskedSearch("".join(chars), tuple(other_words))


def mask_passive_search_operands(command: str) -> str | None:
    """The command with search commands' quoted literal operands blanked.

    None when nothing was masked or the text is outside the understood subset;
    the caller then classifies the original text.
    """
    analysis = analyse_passive_search(command)
    return analysis.masked if analysis is not None else None
