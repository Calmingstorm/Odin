"""Overview documentation must defer inventories to their real sources."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def test_overview_links_to_generated_catalog_and_api_inventory():
    from scripts.docs.generate_api_reference import collect_rest_routes
    from scripts.docs.generate_api_reference import render as render_api_reference
    from scripts.docs.generate_tool_reference import generate as generate_tool_reference
    from src.tools.registry import TOOLS

    index = (ROOT / "docs/index.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    tools_reference = (ROOT / "docs/reference/tools.md").read_text(encoding="utf-8")
    api_reference = (ROOT / "docs/reference/api.md").read_text(encoding="utf-8")

    assert "Generated from the built-in tool registry" in index
    assert "/reference/tools" in index
    assert "Generated from shipped route registrations" in index
    assert "/reference/api" in index
    assert "Regression-tested against the code" in index
    assert "Regression tests exercise" in readme
    assert "11,712" not in index + readme
    assert "346 files" not in index + readme
    assert "211 REST routes" not in index + readme
    assert "74</strong>" not in index
    assert "23 core" not in index

    # Compare to live generators, not pinned totals: registry and route changes
    # update the authoritative inventory without requiring prose edits.
    generated_tools = generate_tool_reference()
    generated_api = render_api_reference()
    assert generated_tools.startswith("# Built-in tool reference\n")
    assert f"**{len(TOOLS)} built-in tools**" in generated_tools
    route_count = len(collect_rest_routes())
    assert f"The **{route_count} REST registrations** below" in generated_api
    assert "# Built-in tool reference" in tools_reference
    assert "# API reference" in api_reference


def test_computer_use_handoff_description_matches_package_manifest():
    guide = (ROOT / "docs/computer-use/README.md").read_text(encoding="utf-8")
    package = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text(encoding="utf-8"))
    handoffs = {
        Path(row["dst"]).name
        for row in package["contents"]
        if row.get("dst", "").startswith("/usr/share/doc/odin/computer-use/")
    }

    assert handoffs == {"OPERATOR.md", "PACKAGING.md", "RECOVERY.md", "HYPRLAND-OPERATOR-R32.md"}
    for name in handoffs:
        assert f"[{name}]({name})" in guide
        assert (ROOT / "docs/computer-use" / name).is_file()
    assert "These three files" not in guide
