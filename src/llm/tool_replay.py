"""Transient Codex wire evidence, never a dispatch or storage representation.

Keep evidence off dictionary keys: serializers, diagnostics and exports continue
to see only canonical history. Copy/deepcopy retain it for active turns; ordinary
mapping conversion and persistence deliberately discard it. No inverse adapter
or current catalog is consulted when replaying a historical call.
"""

from __future__ import annotations

from copy import deepcopy

CODEX_ARGUMENT_LIMIT = 256 * 1024


class CodexReplay:
    """Opaque, immutable, bounded provider-specific argument text.

    Not a dataclass: dataclasses.asdict must not recursively expose the raw
    string in debug/export paths. Its printable representation is metadata only.
    """

    __slots__ = ("_arguments", "byte_count")
    _arguments: str
    byte_count: int

    def __init__(self, arguments: str):
        byte_count = len(arguments.encode("utf-8"))
        if byte_count > CODEX_ARGUMENT_LIMIT:
            raise ValueError("Codex replay arguments exceed the byte limit")
        object.__setattr__(self, "_arguments", arguments)
        object.__setattr__(self, "byte_count", byte_count)

    def __setattr__(self, name, value):
        raise AttributeError("Codex replay evidence is immutable")

    @property
    def arguments(self) -> str:
        return self._arguments

    def __repr__(self) -> str:
        return f"CodexReplay(byte_count={self.byte_count})"

    def __copy__(self):
        return self

    def __deepcopy__(self, memo):
        return self

    def __reduce_ex__(self, protocol):
        # Pickle/export is not an in-memory copy. Never persist raw evidence.
        return (type(None), ())


class ReplayCarrier:
    """Non-dataclass slot excluded from dataclass repr/asdict exports."""

    __slots__ = ("codex_replay",)
    codex_replay: CodexReplay | None

    def _set_codex_replay(self, replay: CodexReplay | None) -> None:
        self.codex_replay = replay


class ReplayDict(dict):
    """Canonical mapping with a non-enumerable, non-printable wire sidecar."""

    __slots__ = ("codex_replay",)

    def __init__(self, *args, codex_replay: CodexReplay | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.codex_replay = codex_replay

    def copy(self):
        return type(self)(self, codex_replay=self.codex_replay)

    def __copy__(self):
        return self.copy()

    def __deepcopy__(self, memo):
        result = type(self)(codex_replay=self.codex_replay)
        memo[id(self)] = result
        result.update((deepcopy(k, memo), deepcopy(v, memo)) for k, v in self.items())
        return result

    def __reduce_ex__(self, protocol):
        # Explicitly strip the attribute for non-JSON persistence as well.
        return (dict, (dict(self),))


def replay_mapping(mapping: dict, source) -> dict:
    """Carry only trusted Codex provenance across active transcript builders."""
    replay = getattr(source, "codex_replay", None)
    if isinstance(replay, CodexReplay):
        return ReplayDict(mapping, codex_replay=replay)
    return mapping


def codex_arguments(block: dict) -> str | None:
    replay = getattr(block, "codex_replay", None)
    return replay.arguments if isinstance(replay, CodexReplay) else None


def without_replay(value):
    """Explicit storage boundary, including unknown legacy block fields.

    Only the reserved transport key is dropped; ordinary canonical input still
    passes through the existing name-aware storage scrubber.
    """
    if isinstance(value, dict):
        return {k: without_replay(v) for k, v in value.items() if k != "codex_replay"}
    if isinstance(value, list):
        return [without_replay(v) for v in value]
    if isinstance(value, CodexReplay):
        return None
    return value
