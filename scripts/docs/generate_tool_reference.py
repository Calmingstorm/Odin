"""Generate the built-in catalog reference, without reading runtime configuration.

Run from any directory with the repository's Python environment. Catalog data
comes only from public registry/definition/affordance code, not skill or MCP discovery.
"""

from __future__ import annotations

import ast
import html
import importlib
import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.docs._reference import (  # noqa: E402
    REPO_ROOT,
    SOURCE_COMMIT,
    cell,
    source_link,
    write_or_check,
)
from src.tools import registry  # noqa: E402

OUTPUT = REPO_ROOT / "docs/reference/tools.md"


def tool_sections() -> list[tuple[str, list[dict]]]:
    """Follow the registry's actual starred concatenation, not alphabetical order."""
    tree = ast.parse((REPO_ROOT / "src/tools/registry.py").read_text(encoding="utf-8"))
    modules = {
        alias.asname: node.module
        for node in tree.body
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("defs.")
        for alias in node.names
        if alias.name == "TOOLS_SECTION"
    }
    composition = next(
        node.value
        for node in tree.body
        if isinstance(node, ast.AnnAssign)
        and isinstance(node.target, ast.Name)
        and node.target.id == "TOOLS"
    )
    if not isinstance(composition, ast.List):
        raise ValueError("Unsupported registry composition: update the reference generator")
    sections = []
    for element in composition.elts:
        if not isinstance(element, ast.Starred) or not isinstance(element.value, ast.Name):
            raise ValueError("Unsupported registry slice: update the reference generator")
        module_name = modules[element.value.id]
        module = importlib.import_module(f"src.tools.{module_name}")
        sections.append((module_name.removeprefix("defs."), module.TOOLS_SECTION))
    flattened = [tool for _, tools in sections for tool in tools]
    if [id(tool) for tool in flattened] != [id(tool) for tool in registry.TOOLS]:
        raise ValueError("Definition modules do not reproduce registry order and identity")
    return sections


def schema_type(schema: dict) -> str:
    """Keep type unions and array element types visible in the compact table."""
    for union in ("anyOf", "oneOf", "allOf"):
        if union in schema:
            return f"{union}(" + ", ".join(schema_type(s) for s in schema[union]) + ")"
    kind = schema.get("type", "any")
    if isinstance(kind, list):
        return " / ".join(kind)
    if kind == "array":
        return f"array<{schema_type(schema.get('items', {}))}>"
    return kind


def property_rows(schema: dict, prefix: str = "") -> list[str]:
    """List nested object properties too; required is relative to that object."""
    rows = []
    required = schema.get("required", [])
    for name, prop in schema.get("properties", {}).items():
        path = prefix + name
        description = cell(prop.get("description", ""))
        constraints = {
            key: value
            for key, value in prop.items()
            if key not in {"type", "description", "properties", "items", "required"}
        }
        if constraints:
            detail = cell(json.dumps(constraints, ensure_ascii=False, separators=(",", ":")))
            description += f"<br>Constraints: <code>{detail}</code>"
        rows.append(
            f"| <code>{cell(path)}</code> | {cell(schema_type(prop))} | "
            f"{'Yes' if name in required else 'No'} | {description or '—'} |"
        )
        rows.extend(property_rows(prop, path + "."))
        items = prop.get("items", {})
        if isinstance(items, dict):
            rows.extend(property_rows(items, path + "[]."))
    return rows


def description_html(description: str) -> str:
    """Preserve every served character, with only the affordance suffix smaller.

    Raw HTML blocks with v-pre prevent code examples and template syntax inside
    descriptions from being interpreted as Markdown fences or Vue expressions.
    """
    main, marker, footer = description.partition("\n\n[affordances:")
    escaped = html.escape(main, quote=True)
    # Vue condenses whitespace even with v-pre on a paragraph. A wrapping pre
    # preserves multiline examples byte-for-byte without horizontal scrolling.
    style = "white-space: pre-wrap; overflow-wrap: anywhere; font: inherit;"
    rendered = f'<pre v-pre style="{style}">{escaped}</pre>'
    if marker:
        escaped_footer = html.escape("[affordances:" + footer, quote=True).replace("\n", "<br>")
        rendered += f"\n\n<p v-pre><small>{escaped_footer}</small></p>"
    return rendered


def generate() -> str:
    """Return deterministic UTF-8 Markdown from the checked-out public catalog."""
    # Clear only an in-memory definition cache; never consult an operator config.
    registry.invalidate_tool_defs_cache()
    served = registry.get_tool_definitions()
    if [t["name"] for t in served] != [t["name"] for t in registry.TOOLS]:
        raise ValueError("Served definitions do not preserve registry order")
    by_name = {tool["name"]: tool for tool in served}
    lines = [
        "# Built-in tool reference",
        "",
        f"Source baseline commit: [`{SOURCE_COMMIT}`]({source_link('src/tools/registry.py')}).",
        "",
        "<!-- Generated by scripts/docs/generate_tool_reference.py; do not edit by hand. -->",
        "",
        f"**{len(served)} built-in tools**, in registry order, grouped by definition module.",
        "Descriptions are the complete affordance-decorated output of "
        "`get_tool_definitions()`; core flags and input schemas come from the same registry.",
        "This is the static catalog, not a snapshot of a running installation: backend "
        "availability, permissions and disabled-tool policy can reduce visibility. Agent "
        "limits and model/effort fields are conditioned on configuration at catalog build time.",
        "No installed extensions or externally published tools are enumerated.",
        "",
        "**Core** marks `is_core` (not a permission grant). **Required** means the property "
        "appears in its containing object's `required` list; nested rows do not make an "
        "optional parent required. Constraints show enums, defaults and numeric bounds.",
        "",
        "Regenerate from the repository checkout with "
        "`python scripts/docs/generate_tool_reference.py`; add `--check` for a read-only "
        "drift check. The explicit source baseline is stable across docs-only commits; "
        "advance it when documenting a new source baseline.",
        "",
    ]
    for module, tools in tool_sections():
        path = f"src/tools/defs/{module}.py"
        lines.extend([f"## {module}", "", f"Source: [`{path}`]({source_link(path)}).", ""])
        for definition in tools:
            tool = by_name[definition["name"]]
            lines.extend([
                f"### {tool['name']}", "",
                f"**Core:** {'Yes' if tool.get('is_core', False) else 'No'}", "",
                description_html(tool["description"]), "",
            ])
            rows = property_rows(tool["input_schema"])
            if rows:
                lines.extend([
                    "| Name | Type | Required | Description |",
                    "| --- | --- | --- | --- |",
                    *rows,
                ])
            else:
                lines.append("No input properties.")
            lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(write_or_check(generate(), OUTPUT, description=__doc__ or "Tool reference"))
