#!/usr/bin/env python3
"""Every config section must declare how it reaches the running bot.

The WebUI and the config API both render apply-mode from
``src/config/apply_registry.py``. If a new schema section can be added without
an entry, the page starts guessing again — and a page that guesses is exactly
the defect this campaign set out to remove.

Fails when:
  * a schema section has no registry entry (the page would have nothing to say);
  * the registry names a section or field the schema no longer has (a stale
    claim, which is worse than silence);
  * a field override names a section that does not exist.

Exit 0 clean, 1 on findings.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.config.apply_registry import (  # noqa: E402
    FIELDS,
    SECRET_PATHS,
    SECTIONS,
)
from src.config.schema import Config  # noqa: E402


def _schema_shape() -> dict[str, set[str]]:
    """{section: {field, ...}} from the real model, not a hand-kept list."""
    sample = Config(discord={"token": "x"})
    shape: dict[str, set[str]] = {}
    for section, value in sample.model_dump().items():
        shape[section] = set(value.keys()) if isinstance(value, dict) else set()
    return shape


def main() -> int:
    shape = _schema_shape()
    findings: list[str] = []

    for section in sorted(shape):
        if section not in SECTIONS:
            findings.append(
                f"schema section '{section}' has no apply_registry entry — "
                f"the config page would have to guess how it applies"
            )

    for section in sorted(SECTIONS):
        if section not in shape:
            findings.append(
                f"apply_registry declares '{section}', which the schema no longer has"
            )

    for path in sorted(FIELDS):
        section, _, leaf = path.partition(".")
        if section not in shape:
            findings.append(f"field override '{path}' names an unknown section")
        elif leaf and shape[section] and leaf not in shape[section]:
            findings.append(
                f"field override '{path}' names a field '{section}' no longer has"
            )

    for path in sorted(SECRET_PATHS):
        section = path.split(".", 1)[0]
        if section not in shape:
            findings.append(f"secret path '{path}' names an unknown section")

    print(
        f"apply-registry-gate: sections={len(shape)} classified={len(SECTIONS)} "
        f"overrides={len(FIELDS)} findings={len(findings)}"
    )
    if findings:
        print("\nUnclassified or stale configuration:")
        for f in findings:
            print(f"  {f}")
        return 1
    print("every configuration section declares how it applies.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
