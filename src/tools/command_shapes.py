"""Bounded, offline recognition of literal command/data-flow relationships.

This is not a shell evaluator. Variables, aliases, eval, arbitrary programs and
heredoc bodies are not resolved. Quote fragments are joined only inside words.
The older structural scanner and its Git policy remain independent and intact.
"""

from __future__ import annotations

import ast
import re
import warnings
from collections.abc import Callable
from dataclasses import dataclass, field

from .command_authority import is_external_url, is_metadata_url

MAX_SOURCE = 256 * 1024
MAX_DEPTH = 32
SHELLS = frozenset({"sh", "bash", "dash", "ash", "zsh", "ksh", "fish", "csh", "tcsh"})
FETCHERS = frozenset({"curl", "wget"})


class RecognitionBoundError(ValueError):
    """Unsupported work beyond the fixed recognition budget."""


def _python_tree(code: str) -> ast.Module:
    # Parsing is classification-only. Python's literal warnings can quote
    # secret-bearing source; do not let them escape into operational logs.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", SyntaxWarning)
        return ast.parse(code)


@dataclass
class Word:
    value: str
    quoted: bool = False
    substitutions: list[list[Command]] = field(default_factory=list)
    active_glob: bool = False


@dataclass
class Command:
    words: list[Word] = field(default_factory=list)
    redirects: list[tuple[str, Word]] = field(default_factory=list)
    upstream: Command | None = None


@dataclass(frozen=True)
class Shape:
    reason: str
    category: str
    exfil: bool = False


def _parse(source: str, depth: int = 0) -> list[Command]:
    """Scan only active shell syntax, retaining substitution and pipe edges."""
    if depth > MAX_DEPTH:
        raise RecognitionBoundError
    commands: list[Command] = []
    current = Command()
    index = 0
    pending: str | None = None
    heredocs: list[tuple[str, bool]] = []

    def finish(pipe: bool = False) -> None:
        nonlocal current, pending
        if current.words or current.redirects:
            commands.append(current)
        current = Command(upstream=current if pipe else None)
        pending = None

    while index < len(source):
        char = source[index]
        if char in " \t\r":
            index += 1
            continue
        if char == "#":
            end = source.find("\n", index)
            index = len(source) if end < 0 else end
            continue
        if char in ";&|\n" or char in "()":
            finish(char == "|" and not source.startswith("||", index))
            index += 2 if source[index:index + 2] in {"||", "&&"} else 1
            if char == "\n" and heredocs:
                for delimiter, strip_tabs in heredocs:
                    while index < len(source):
                        end = source.find("\n", index)
                        end = len(source) if end < 0 else end
                        line = source[index:end]
                        index = min(end + 1, len(source))
                        if (line.lstrip("\t") if strip_tabs else line) == delimiter:
                            break
                heredocs.clear()
            continue
        if char in "<>" and not source.startswith(("<(", ">("), index):
            end = index + 1
            while end < len(source) and source[end] in "<>&":
                end += 1
            if source[index:end] == "<<" and source[end:end + 1] == "-":
                end += 1
            pending = source[index:end]
            index = end
            continue
        value: list[str] = []
        substitutions: list[list[Command]] = []
        quoted = False
        active_glob = False
        quote: str | None = None
        while index < len(source):
            char = source[index]
            if char == "\\" and quote != "'":
                if index + 1 == len(source):
                    break
                following = source[index + 1]
                if following != "\n":
                    if quote == '"' and following not in '$`"\\':
                        value.append("\\")
                    value.append(following)
                    quoted = True
                index += 2
                continue
            if quote != "'" and (source.startswith("$(", index)
                                   or quote is None and source.startswith(("<(", ">("), index)):
                start = index + 2
                end = _substitution_end(source, start, depth + 1)
                substitutions.append(_parse(source[start:end], depth + 1))
                value.append("\x00")  # Never mistake expansion for a literal.
                index = min(end + 1, len(source))
                continue
            if quote != "'" and char == "`":
                end = index + 1
                while end < len(source):
                    if source[end] == "\\":
                        end += 2
                    elif source[end] == "`":
                        break
                    else:
                        end += 1
                substitutions.append(_parse(source[index + 1:end], depth + 1))
                value.append("\x00")
                index = min(end + 1, len(source))
                continue
            if quote:
                if char == quote:
                    quote = None
                else:
                    value.append(char)
                index += 1
                continue
            if char in "\"'":
                quote = char
                quoted = True
                index += 1
                continue
            if char in " \t\r\n;&|()<>":
                break
            value.append(char)
            active_glob |= char == "*"
            index += 1
        if quote:
            return commands  # Do not invent a command from unfinished input.
        word = Word("".join(value), quoted, substitutions, active_glob)
        if pending:
            current.redirects.append((pending, word))
            if pending in {"<<", "<<-"}:
                heredocs.append((word.value, pending == "<<-"))
            pending = None
        else:
            current.words.append(word)
        # An unfinished escape must still make progress.
        if index < len(source) and source[index] == "\\":
            index += 1
    finish()
    return commands


def _substitution_end(source: str, start: int, depth: int) -> int:
    if depth > MAX_DEPTH:
        raise RecognitionBoundError
    quote: str | None = None
    index = start
    while index < len(source):
        char = source[index]
        if char == "\\" and quote != "'":
            index += 2
            continue
        if quote != "'" and (source.startswith("$(", index)
                               or quote is None and source.startswith(("<(", ">("), index)):
            index = _substitution_end(source, index + 2, depth + 1) + 1
            continue
        if quote:
            if char == quote:
                quote = None
        elif char in "\"'":
            quote = char
        elif char == ")":
            return index
        elif char == "(":
            index = _substitution_end(source, index + 1, depth + 1)
        index += 1
    return index


def _literal(value: str) -> bool:
    return not any(char in value for char in "\x00$`")


def _sensitive(value: str) -> bool:
    if not _literal(value):
        return False
    value = value.removeprefix("@")
    return (value in {"/etc/shadow", "/etc/gshadow"}
            or bool(re.search(r"(?:^|/)\.(?:netrc|env)(?:$|\.[^/]+$)", value))
            or bool(re.search(r"(?:^|/)\.(?:aws/credentials|kube/config)$", value))
            or bool(re.search(r"(?:^|/)\.ssh/id_(?:rsa|dsa|ecdsa|ed25519)$", value))
            or bool(re.search(
                r"(?:^|/)secrets/(?:[^/]*(?:api[_-]?key|token|password|credential|private[_-]?key)"
                r"[^/]*|key|[^/]+\.(?:key|pem))$", value,
            )))


# Values must not be mistaken for positional request URLs. Upload options are
# separated below; this list includes common transport/output/auth options.
_CURL_VALUES = frozenset({
    "-o", "--output", "-D", "--dump-header", "-H", "--header", "-A", "--user-agent",
    "-u", "--user", "-U", "--proxy-user", "-x", "--proxy", "--noproxy", "-X", "--request",
    "--connect-to", "--resolve", "--cacert", "--capath", "--cert", "--key", "--cookie",
    "-b", "-c", "--cookie-jar", "--referer", "-e", "--max-time", "-m", "--connect-timeout",
    "--retry", "--retry-delay", "--limit-rate", "--request-target", "--config", "-K",
})
_UPLOAD = frozenset({"-d", "--data", "--data-binary", "--data-raw", "--data-ascii",
                     "--data-urlencode", "-T", "--upload-file", "-F", "--form",
                     "--form-string", "--post-file", "--body-file", "--post-data", "--body-data"})
_WGET_VALUES = frozenset({"-O", "--output-document", "-o", "--output-file", "-a",
                          "--append-output", "-U", "--user-agent", "--header", "--user",
                          "--password", "--directory-prefix", "-P", "--timeout", "-T",
                          "--tries", "-t", "--execute", "-e", "--referer"})


def _network_args(executable: str, args: list[Word]) -> tuple[list[str], list[str], bool]:
    urls: list[str] = []
    files: list[str] = []
    stdout = executable == "curl"
    values = _CURL_VALUES if executable == "curl" else _WGET_VALUES
    index = 0
    while index < len(args):
        value = args[index].value
        option, equals, attached = value.partition("=")
        if executable == "wget" and re.fullmatch(r"-[qnv]*O.*", value):
            option, operand = "-O", value.partition("O")[2]
            if not operand and index + 1 < len(args):
                index += 1
                operand = args[index].value
        elif option == "--url" or option in values or option in _UPLOAD:
            if equals:
                operand = attached
            elif index + 1 < len(args):
                index += 1
                operand = args[index].value
            else:
                break
        elif len(value) > 2 and value[:2] in {"-d", "-T", "-F", "-o", "-O", "-H", "-A", "-u", "-x"}:
            option, operand = value[:2], value[2:]
        else:
            if not value.startswith("-") and _literal(value):
                urls.append(value)
            index += 1
            continue
        if option == "--url":
            urls.append(operand)
        elif option in {"-o", "--output", "-O", "--output-document"}:
            stdout = operand == "-"
        elif option in _UPLOAD:
            if option in {"-T", "--upload-file", "--post-file", "--body-file"}:
                files.append(operand)
            elif option in {"-F", "--form"}:
                payload = operand.partition("=")[2]
                if payload.startswith(("@", "<")):
                    files.append(payload[1:].split(";", 1)[0])
            elif option not in {"--data-raw", "--form-string", "--post-data", "--body-data"}:
                payload = (operand.partition("=")[2]
                           if option == "--data-urlencode" and "=" in operand else operand)
                if option == "--data-urlencode" and "@" in payload:
                    payload = "@" + payload.partition("@")[2]
                if payload.startswith("@"):
                    files.append(payload[1:])
        index += 1
    # Only request operands receive curl's documented default scheme. Headers,
    # proxies, upload values and other option operands never reach this list.
    urls = [value if "://" in value else "http://" + value for value in urls]
    return urls, files, stdout


def _python_calls(code: str) -> tuple[list[str], bool]:
    """Recognize literal HTTP calls and exec/eval consuming those same calls."""
    try:
        tree = _python_tree(code)
    except (SyntaxError, ValueError, RecursionError):
        return [], False

    def name(node: ast.AST) -> str:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return name(node.value) + "." + node.attr
        return ""

    def urls(node: ast.AST) -> list[str]:
        result: list[str] = []
        for call in ast.walk(node):
            if (isinstance(call, ast.Call) and name(call.func) in {
                "urlopen", "urllib.request.urlopen", "requests.get", "requests.post",
                "requests.request", "httpx.get", "httpx.post",
            }):
                offset = 1 if name(call.func) == "requests.request" else 0
                arguments = call.args[offset:offset + 1] + [
                    kw.value for kw in call.keywords if kw.arg == "url"
                ]
                result.extend(arg.value for arg in arguments
                              if isinstance(arg, ast.Constant) and isinstance(arg.value, str))
        return result

    remote = any(isinstance(node, ast.Call) and name(node.func) in {"exec", "eval"}
                 and node.args and any(_request_url(url) for url in urls(node.args[0]))
                 for node in ast.walk(tree))
    return urls(tree), remote


def _node_calls(code: str) -> tuple[list[str], bool]:
    # Match calls, not documentation strings or comments. Retain string operands
    # separately, replacing their contents in the syntax view with fixed markers.
    literals: list[str] = []
    # Mask comments before strings. A quote in a comment must not swallow real
    # syntax on a later line; slashes inside string operands remain untouched.
    parts: list[str] = []
    index = 0
    while index < len(code):
        if code.startswith("//", index):
            end = code.find("\n", index)
            index = len(code) if end < 0 else end
            parts.append(" ")
        elif code.startswith("/*", index):
            end = code.find("*/", index + 2)
            index = len(code) if end < 0 else end + 2
            parts.append(" ")
        elif code[index] in "\"'`":
            quote = code[index]
            start = index
            index += 1
            while index < len(code):
                if code[index] == "\\":
                    index += 2
                elif code[index] == quote:
                    index += 1
                    break
                else:
                    index += 1
            parts.append(code[start:index])
        else:
            parts.append(code[index])
            index += 1
    code = "".join(parts)

    def string(match: re.Match[str]) -> str:
        literals.append(match[2])
        return f"__literal_{len(literals) - 1}__"

    syntax = re.sub(r"(['\"])((?:\\.|(?!\1).)*)\1", string, code)
    if "`" in syntax or "/" in syntax:
        return [], False  # Template literals require a JS parser; never guess.
    urls: list[str] = []
    remote = False
    syntax = re.sub(
        r"\brequire\s*\(\s*__literal_(\d+)__\s*\)\.get",
        lambda match: ("https.get" if literals[int(match[1])] in {
            "http", "https", "node:http", "node:https",
        } else "unknown.get"),
        syntax,
    )
    for match in re.finditer(r"\b(fetch|https?\.get)\s*\(\s*__literal_(\d+)__", syntax):
        url = literals[int(match[2])]
        urls.append(url)
        # Explicit direct evaluation, or the ordinary promise/callback idiom.
        prefix = syntax[:match.start()]
        suffix = syntax[match.end():]
        if _request_url(url) and (re.search(r"\b(?:eval|Function)\s*\([^;]*$", prefix)
                or re.search(r"^[^;]*\.then\s*\(\s*([A-Za-z_$][\w$]*)\s*=>\s*"
                             r"(?:eval|Function)\s*\(\s*\1\s*\)", suffix)
                or match[1] == "https.get" and re.search(
                    r"^[^;]*\.on\s*\(\s*__literal_\d+__\s*,\s*"
                    r"([A-Za-z_$][\w$]*)\s*=>\s*(?:eval|Function)\s*\(\s*\1"
                    r"(?:\.toString\s*\(\s*\))?\s*\)", suffix)
                or re.search(r"^[^;]*\.then\s*\(\s*(?:eval|Function)\s*\)", suffix)):
            remote = True
    return urls, remote


def recognize(source: str, command_index: Callable[[list[Word]], int | None]) -> list[Shape]:
    """Return shared classification/enforcement facts, with no side effects."""
    if len(source) > MAX_SOURCE:
        return [Shape("command recognition exceeds safe length bound", "bounds")]
    facts: list[Shape] = []

    def executable(command: Command) -> tuple[str, list[Word]]:
        pos = command_index(command.words)
        if pos is None:
            return "", []
        return command.words[pos].value.rsplit("/", 1)[-1], command.words[pos + 1:]

    def fetch(command: Command) -> bool:
        exe, args = executable(command)
        if exe not in FETCHERS:
            return False
        urls, _, stdout = _network_args(exe, args)
        if any(op in {">", ">>", ">&"} for op, _ in command.redirects):
            stdout = False
        return stdout and any(_request_url(url) for url in urls)

    def sensitive_read(command: Command, depth: int = 0) -> bool:
        if depth > MAX_DEPTH:
            return False
        exe, args = executable(command)
        if exe not in {"cat", "head", "tail", "base64", "gzip", "tee"}:
            return False
        if any(op in {">", ">>", ">&"} for op, _ in command.redirects):
            return False
        if any(_sensitive(arg.value) for arg in args):
            return True
        redirects = [arg for op, arg in command.redirects if op == "<"]
        if redirects:
            return any(_sensitive(arg.value) for arg in redirects)
        if exe != "tee" and any(not arg.value.startswith("-") for arg in args):
            return False
        return bool(command.upstream and sensitive_read(command.upstream, depth + 1))

    def legacy(command: Command, exe: str, args: list[Word]) -> None:
        # Historical enforcement rules use the same executable/redirect facts,
        # not a second raw-text path that can match comments or documentation.
        values = [arg.value for arg in args]
        reason = None
        if exe == "bash" and "-i" in values and any(
            op == ">&" and arg.value.startswith("/dev/tcp/")
            for op, arg in command.redirects
        ):
            reason = "reverse shell via /dev/tcp"
        if exe == "nc" and any(
            value == "-e" and pos + 1 < len(values)
            and values[pos + 1] in {"/bin/sh", "/bin/bash"}
            for pos, value in enumerate(values)
        ):
            reason = "netcat reverse shell"
        if exe in {"python", "python2", "python3"} and "-c" in values:
            pos = values.index("-c")
            if pos + 1 < len(values):
                try:
                    tree = _python_tree(values[pos + 1])
                except (SyntaxError, ValueError, RecursionError):
                    pass
                else:
                    calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)]
                    if (any(isinstance(node.func, ast.Attribute) and node.func.attr == "socket"
                            for node in calls)
                            and any(isinstance(node.func, ast.Attribute)
                                    and node.func.attr == "connect" for node in calls)):
                        reason = "python reverse shell"
        if exe in SHELLS and command.upstream:
            upstream_exe, upstream_args = executable(command.upstream)
            if upstream_exe == "base64" and any(
                arg.value in {"-d", "--decode"} for arg in upstream_args
            ):
                reason = "base64 decode pipe to shell"
        if any(op == ">" and arg.value in {"/etc/passwd", "/etc/shadow", "/etc/sudoers"}
               for op, arg in command.redirects):
            reason = "write to auth files"
        if exe == "echo" and any(op == ">>" and arg.value.startswith("/etc/cron")
                                 for op, arg in command.redirects):
            reason = "cron persistence"
        if exe in {"ssh-keygen", "ssh-copy-id"} and any(
            value == "-f" and pos + 1 < len(values) and values[pos + 1].startswith("/")
            for pos, value in enumerate(values)
        ):
            reason = "SSH key manipulation to root paths"
        if reason:
            facts.append(Shape(reason, "exfiltration", True))

    def execution_substitution(arg: Word) -> bool:
        # A fetched program must occupy the script/command operand, not be
        # interpolated into an otherwise literal echo/printf command string.
        return arg.value == "\x00" and any(
            fetch(child) for sub in arg.substitutions for child in sub
        )

    def visit(commands: list[Command], depth: int = 0) -> None:
        if depth > MAX_DEPTH:
            raise RecognitionBoundError
        for command in commands:
            exe, args = executable(command)
            legacy(command, exe, args)
            if exe == "rm":
                values = [arg.value for arg in args]
                flag_values = values[:values.index("--")] if "--" in values else values
                flags = [value for value in flag_values if value.startswith("-")]
                if (any(value in {"--recursive", "--force", "--no-preserve-root"}
                        or re.fullmatch(r"-[a-zA-Z]*[rf][a-zA-Z]*", value) for value in flags)
                        and any(arg.value == "/" or arg.value == "/*" and arg.active_glob
                                for arg in args)):
                    facts.append(Shape("recursive delete on root", "destructive"))
            interpreter = (exe in SHELLS | {"source", ".", "node", "nodejs"}
                           or bool(re.fullmatch(r"python[23]?(?:\.\d+)?", exe)))
            if interpreter:
                consuming = [arg for arg in args if not arg.value.startswith("-")][:1]
                flag = next((pos for pos, arg in enumerate(args)
                             if arg.value in {"-c", "-e", "--eval", "--command"}
                             or exe in SHELLS and re.fullmatch(
                                 r"-[a-zA-Z]*c[a-zA-Z]*", arg.value)), None)
                if flag is not None:
                    consuming = args[flag + 1:flag + 2]
                stdin_redirected = any(op in {"<", "<<", "<<-", "<<<"}
                                       for op, _ in command.redirects)
                positional = [arg.value for arg in args if not arg.value.startswith("-")]
                reads_stdin = flag is None and (not positional or exe in SHELLS
                                                and any(arg.value == "-s" for arg in args))
                if (reads_stdin and not stdin_redirected
                        and command.upstream and fetch(command.upstream)
                        or any(execution_substitution(arg) for arg in consuming)
                        or any(execution_substitution(arg) for op, arg in command.redirects
                               if op in {"<", "<<<"})):
                    facts.append(Shape("pipe remote script to shell", "remote_execution", True))
                if (flag is not None and flag + 1 < len(args)
                        and not args[flag + 1].substitutions):
                    code = args[flag + 1].value
                    if exe in SHELLS:
                        visit(_parse(code, depth + 1), depth + 1)
                    else:
                        urls, remote = (_node_calls(code) if exe in {"node", "nodejs"}
                                        else _python_calls(code))
                        if remote:
                            facts.append(Shape(
                                "pipe remote script to shell", "remote_execution", True,
                            ))
                        if any(is_metadata_url(url) for url in urls):
                            facts.append(Shape("cloud metadata request", "metadata"))
            if exe in FETCHERS:
                urls, files, _ = _network_args(exe, args)
                if any(is_metadata_url(url) for url in urls):
                    facts.append(Shape("cloud metadata request", "metadata"))
                if any(is_external_url(url) for url in urls):
                    stdin = "-" in files or "/dev/stdin" in files
                    source_file = any(_sensitive(value) for value in files)
                    source_stdin = stdin and (command.upstream and sensitive_read(command.upstream)
                                              or any(op == "<" and _sensitive(arg.value)
                                                     for op, arg in command.redirects))
                    if source_file or source_stdin:
                        facts.append(Shape(
                            "sensitive source uploaded externally", "exfiltration", True,
                        ))
            for word in command.words + [arg for _, arg in command.redirects]:
                for sub in word.substitutions:
                    visit(sub, depth + 1)

    try:
        visit(_parse(source))
    except RecognitionBoundError:
        facts.append(Shape("command recognition exceeds safe nesting bound", "bounds"))
    return facts


def _request_url(value: str) -> bool:
    # Request URL operands may omit the scheme (curl's documented default).
    return _literal(value) and bool(re.match(r"(?:https?|ftp)://|[^/\s]+\.[^/\s]+(?:/|$)", value))
