#!/usr/bin/env python3
"""Every config leaf must declare how it reaches the running bot.

The config page renders apply-mode from ``src/config/apply_registry.py``. A leaf
the registry cannot classify would be rendered by guessing, and a guess in the
page built to stop guessing is worse than saying nothing.

Walks the Pydantic models rather than a dumped instance, so nested and optional
sub-models (``openai_codex.retry.max_retries``, ``email.smtp.password``) are
checked too — a dump hides every branch that happens to be ``None`` today.

Fails when:
  * a schema section has no registry entry;
  * a leaf inside a section declared non-uniform (``MIXED_SECTIONS``) has no
    explicit classification, and would silently inherit an unchecked claim;
  * the registry names a section or leaf the schema no longer has;
  * a credential-shaped leaf is explicitly declassified to ``public``.

Exit 0 clean, 1 on findings.
"""

from __future__ import annotations

import sys
import types
import typing
from pathlib import Path

from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.config.apply_registry import (  # noqa: E402
    FIELDS,
    MIXED_SECTIONS,
    SECTIONS,
    element_model,
    has_explicit_spec,
    spec_for,
)
from src.config.schema import Config  # noqa: E402
from src.config.sensitivity import is_sensitive_key  # noqa: E402


def _unwrap(annotation: object) -> object:
    """Strip Optional/Union wrappers down to the first model, if any."""
    origin = typing.get_origin(annotation)
    if origin in (typing.Union, types.UnionType):
        for arg in typing.get_args(annotation):
            if arg is type(None):
                continue
            unwrapped = _unwrap(arg)
            if isinstance(unwrapped, type) and issubclass(unwrapped, BaseModel):
                return unwrapped
        return annotation
    return annotation


def _leaves(model: type[BaseModel], prefix: str = "") -> list[str]:
    """Every settable leaf path under a model.

    Container fields are reported twice over: the container itself, which is
    edited as one value when empty, and its record fields behind a ``*``
    wildcard.
    """
    out: list[str] = []
    for name, info in model.model_fields.items():
        path = f"{prefix}.{name}" if prefix else name
        annotation = _unwrap(info.annotation)
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            nested = _leaves(annotation, path)
            out.extend(nested or [path])
            continue
        out.append(path)
        element = element_model(info.annotation)
        if element is not None:
            out.extend(_leaves(element, f"{path}.*"))
    return out


def main() -> int:
    leaves = _leaves(Config)
    sections = sorted({leaf.split(".", 1)[0] for leaf in leaves})
    findings: list[str] = []

    for section in sections:
        if section not in SECTIONS:
            findings.append(
                f"schema section '{section}' has no apply_registry entry — "
                f"the config page would have to guess how it applies"
            )

    for section in sorted(SECTIONS):
        if section not in sections:
            findings.append(
                f"apply_registry declares section '{section}', which the schema "
                f"no longer has"
            )

    known = set(leaves)
    for path in sorted(FIELDS):
        if path not in known:
            findings.append(
                f"apply_registry classifies '{path}', which the schema no longer has"
            )

    for leaf in leaves:
        section = leaf.split(".", 1)[0]
        if section in MIXED_SECTIONS and not has_explicit_spec(leaf):
            findings.append(
                f"'{leaf}' inherits the '{section}' default, but '{section}' is "
                f"declared non-uniform — classify this leaf against its consumer"
            )

    for leaf in leaves:
        if (
            is_sensitive_key(leaf.rsplit(".", 1)[-1])
            and spec_for(leaf).sensitivity == "public"
        ):
            findings.append(
                f"'{leaf}' looks like a credential but is classified public — "
                f"its value would be served to the page"
            )

    for section in sorted(MIXED_SECTIONS):
        if section not in SECTIONS:
            findings.append(
                f"MIXED_SECTIONS names '{section}', which is not a config section"
            )

    print(
        f"apply-registry-gate: sections={len(sections)} leaves={len(leaves)} "
        f"classified={len(FIELDS)} mixed={len(MIXED_SECTIONS)} "
        f"findings={len(findings)}"
    )
    if findings:
        print("\nUnclassified or stale configuration:")
        for finding in findings:
            print(f"  {finding}")
        return 1
    print("every configuration leaf declares how it applies.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
