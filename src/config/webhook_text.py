"""Source-span edits for webhook rows, without re-emitting the config document.

YAML collection end marks include following comments. Only token/leaf ends are
content boundaries: a nested block list must not swallow the section trailer.
The caller validates the complete parsed document before the atomic commit.
"""

from __future__ import annotations

import io
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.nodes import MappingNode, ScalarNode, SequenceNode
from ruamel.yaml.scalarstring import DoubleQuotedScalarString, SingleQuotedScalarString
from ruamel.yaml.tokens import AliasToken, AnchorToken, BlockEntryToken, FlowEntryToken


def _yaml() -> YAML:
    parser = YAML()
    parser.preserve_quotes = True
    parser.width = 1000000
    parser.indent(mapping=2, sequence=4, offset=2)
    parser.representer.ignore_aliases = lambda _value: True
    return parser


def _render(value: Any, *, flow: bool = False, style: str | None = None) -> str:
    if isinstance(value, str):
        if style == "'":
            value = SingleQuotedScalarString(value)
        elif style == '"' or "\n" in value:
            value = DoubleQuotedScalarString(value)
    parser = _yaml()
    parser.default_flow_style = flow
    parser.representer.default_flow_style = flow
    output = io.StringIO()
    parser.dump(value, output)
    return output.getvalue().removesuffix("...\n").rstrip("\n")


def _entry(node: Any, key: str) -> tuple[Any, Any]:
    if isinstance(node, MappingNode):
        for key_node, value_node in node.value:
            if key_node.value == key:
                return key_node, value_node
    return None, None


def _content_end(node: Any) -> int:
    """Exclude comments attached to block containers, including nested ones."""
    if isinstance(node, MappingNode) and not node.flow_style:
        return max(
            # Implicit nulls can start AFTER the trailer. The colon is the
            # last syntax belonging to such an entry, not that null's mark.
            key.end_mark.index + 1 if _implicit_null(value) else _content_end(value)
            for key, value in node.value
        )
    if isinstance(node, SequenceNode) and not node.flow_style:
        return max(_content_end(value) for value in node.value)
    return int(node.end_mark.index)


def _implicit_null(node: Any) -> bool:
    return isinstance(node, ScalarNode) and node.tag == "tag:yaml.org,2002:null" and not node.value


class WebhookTextPatch:
    """Accumulate in-memory edits; never write a file or serialize untouched rows."""

    def __init__(self, text: str):
        self.text = text
        self.newline = "\r\n" if "\r\n" in text else "\n"

    def _nodes(self) -> tuple[Any, Any, Any, Any]:
        from .persistence import ConfigPersistError

        parser = _yaml()
        root = parser.compose(self.text)
        _, section = _entry(root, "outbound_webhooks")
        key, sequence = _entry(section, "targets")
        # Aliases point at the original node's source marks, not the alias's
        # location. Refuse rather than accidentally edit its shared definition.
        if section is not None:
            start, end = section.start_mark.index, section.end_mark.index
            if any(
                isinstance(token, (AnchorToken, AliasToken))
                and start <= token.start_mark.index < end
                for token in parser.scan(self.text)
            ):
                raise ConfigPersistError("cannot safely edit anchored webhook config")
        return root, section, key, sequence

    def _splice(self, start: int, end: int, replacement: str) -> None:
        self.text = self.text[:start] + replacement + self.text[end:]

    def _line_end(self, position: int) -> int:
        if position and self.text[position - 1] == "\n":
            return position
        end = self.text.find("\n", position)
        return len(self.text) if end < 0 else end + 1

    def _insert_lines(self, position: int, lines: str) -> None:
        prefix = self.newline if position and self.text[position - 1] != "\n" else ""
        self._splice(position, position, prefix + lines)

    def _indented(self, value: Any, indent: int) -> str:
        return "".join(
            " " * indent + line + self.newline for line in _render(value).splitlines()
        )

    def _append_entry(self, mapping: Any, key: str, value: Any) -> None:
        if mapping.flow_style:
            position = mapping.end_mark.index - 1
            fragment = _render({key: value}, flow=True)[1:-1]
            self._splice(position, position, (", " if mapping.value else "") + fragment)
        else:
            self._insert_lines(
                self._line_end(_content_end(mapping)),
                self._indented({key: value}, mapping.start_mark.column),
            )

    def append(self, row: dict[str, Any]) -> None:
        root, section, key, sequence = self._nodes()
        if section is None:
            self._append_entry(root, "outbound_webhooks", {"targets": [row]})
            return
        if not isinstance(section, MappingNode):
            section_key, _ = _entry(root, "outbound_webhooks")
            self._replace_value(section_key, section, {"targets": [row]})
            return
        if key is None:
            self._append_entry(section, "targets", [row])
            return
        if not isinstance(sequence, SequenceNode) or not sequence.value:
            if section.flow_style:
                self._replace_value(key, sequence, [row])
                return
            # Keep the key's inline comment exactly where it is. Remove only
            # the empty/null value, then insert rows before any following text.
            if not _implicit_null(sequence):
                start = sequence.start_mark.index
                if self.text[start - 1:start] == " ":
                    start -= 1
                self._splice(start, sequence.end_mark.index, "")
            position = self._line_end(key.end_mark.index)
            self._insert_lines(position, self._indented([row], key.start_mark.column))
            return
        if sequence.flow_style:
            position = sequence.end_mark.index - 1
            self._splice(position, position, ", " + _render(row, flow=True))
        else:
            # Our emitter offsets the dash by two spaces; match the existing
            # dash, not the mapping's first key, for indentless sequences too.
            indent = sequence.start_mark.column - 2
            self._insert_lines(
                self._line_end(_content_end(sequence.value[-1])),
                self._indented([row], indent),
            )

    def delete(self, index: int) -> None:
        _, _, key, sequence = self._nodes()
        row = sequence.value[index]
        if sequence.flow_style:
            start, end = row.start_mark.index, _content_end(row)
            separators = [
                token.start_mark.index for token in _yaml().scan(self.text)
                if isinstance(token, FlowEntryToken)
            ]
            if index + 1 < len(sequence.value):
                comma = next(
                    position for position in separators
                    if end <= position < sequence.value[index + 1].start_mark.index
                )
                self._splice(comma, comma + 1, "")
            elif index:
                comma = next(
                    position for position in separators
                    if _content_end(sequence.value[index - 1]) <= position < start
                )
                self._splice(start, end, "")
                self._splice(comma, comma + 1, "")
                return
            self._splice(start, end, "")
            return
        entries = [
            token for token in _yaml().scan(self.text)
            if isinstance(token, BlockEntryToken)
            and token.start_mark.column == sequence.start_mark.column
            and sequence.start_mark.index <= token.start_mark.index < sequence.end_mark.index
        ]
        start = entries[index].start_mark.index - entries[index].start_mark.column
        end = self._line_end(_content_end(row))
        self._splice(start, end, "")
        if len(sequence.value) == 1:
            # Do not remove/re-attach any leading, between-row or tail comments.
            colon = self.text.index(":", key.end_mark.index)
            self._splice(colon + 1, colon + 1, " []")

    def _replace_value(self, key: Any, value: Any, replacement: Any) -> None:
        rendered = _render(replacement, flow=True, style=getattr(value, "style", None))
        if _implicit_null(value):
            position = self.text.index(":", key.end_mark.index) + 1
            self._splice(position, position, " " + rendered)
            return
        start, end = value.start_mark.index, _content_end(value)
        # Literal/folded scalar spans include their final newline. Preserve the
        # line boundary when replacing them with a quoted scalar/flow value.
        if self.text[start:end].endswith("\n"):
            rendered += self.newline
        self._splice(start, end, rendered)

    def update(self, index: int, fields: dict[str, Any]) -> None:
        for field, replacement in fields.items():
            _, _, _, sequence = self._nodes()
            row = sequence.value[index]
            key, value = _entry(row, field)
            if key is None:
                self._append_entry(row, field, replacement)
            else:
                self._replace_value(key, value, replacement)

    def validate(self, expected: Any) -> None:
        from .persistence import ConfigPersistError

        try:
            actual = _yaml().load(self.text)
        except Exception:
            raise ConfigPersistError("webhook source edit could not be validated") from None
        if actual != expected:
            raise ConfigPersistError("webhook source edit changed unexpected config values")
