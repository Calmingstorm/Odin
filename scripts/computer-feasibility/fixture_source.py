"""Unique token-aware fixture edits, independent of source formatting and quotes."""

import ast
import io
import tokenize


def replace_code(source: str, old: str, new: str) -> str:
    """Replace one reviewed token sequence, failing closed on anchor drift."""

    def tokens(text):
        result = []
        for token in tokenize.generate_tokens(io.StringIO(text).readline):
            if token.type in (
                tokenize.NL,
                tokenize.NEWLINE,
                tokenize.INDENT,
                tokenize.DEDENT,
                tokenize.ENDMARKER,
                tokenize.COMMENT,
            ):
                continue
            value = token.string
            if token.type == tokenize.STRING:
                value = ast.dump(ast.parse(value, mode="eval"), include_attributes=False)
            elif token.type == getattr(tokenize, "FSTRING_START", -1):
                value = value.rstrip("\"'")
            elif token.type == getattr(tokenize, "FSTRING_END", -1):
                value = ""
            result.append((token, (token.type, value)))
        return result

    source_tokens, old_tokens = tokens(source), tokens(old)
    needle = [value for _, value in old_tokens]
    if not needle:
        raise ValueError("empty_fixture_anchor")
    matches = [
        index
        for index in range(len(source_tokens) - len(needle) + 1)
        if [value for _, value in source_tokens[index : index + len(needle)]] == needle
    ]
    if len(matches) != 1:
        raise RuntimeError("reviewed_runner_anchor_changed")
    index = matches[0]
    start = source_tokens[index][0].start
    end = source_tokens[index + len(needle) - 1][0].end
    lines = source.splitlines(keepends=True)
    first = sum(map(len, lines[: start[0] - 1])) + start[1]
    last = sum(map(len, lines[: end[0] - 1])) + end[1]
    result = source[:first] + new + source[last:]
    compile(result, "<fixture>", "exec")
    return result
