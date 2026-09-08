"""Operator-only package documentation contract, without installation or GUI access."""
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs/computer-use"
SHIPPED = {"PACKAGING.md", "OPERATOR.md", "RECOVERY.md"}


def test_package_ships_exact_operator_files_not_engineering_tree():
    package = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text())
    rows = [row for row in package["contents"]
            if row.get("dst", "").startswith("/usr/share/doc/odin/computer-use")]
    assert len(rows) == len(SHIPPED)
    assert {Path(row["dst"]).name for row in rows} == SHIPPED
    for row in rows:
        name = Path(row["dst"]).name
        assert row["src"] == f"./docs/computer-use/{name}"
        assert row["dst"] == f"/usr/share/doc/odin/computer-use/{name}"
        assert row.get("type") != "tree"
        assert (ROOT / row["src"]).is_file()


def test_installed_relative_links_resolve_within_shipped_set():
    for name in SHIPPED:
        for link in re.findall(r"\]\(([^)]+)\)", (DOCS / name).read_text()):
            if "://" not in link and not link.startswith("#"):
                assert link.split("#")[0] in SHIPPED, (name, link)


def test_new_operators_see_auth_and_consent_warnings():
    for name in ("PACKAGING.md", "OPERATOR.md"):
        text = (DOCS / name).read_text()
        assert "web.api_token" in text[:1400]
        assert "general API authentication gate is disabled" in text[:1400]
    operator = (DOCS / "OPERATOR.md").read_text()
    assert "Installing dependencies is not consent" in operator
    assert "Measured examples, not an application allowlist" in operator
    assert "full KDE controller input task is not qualified" in operator
    assert "not a zero-manual-step setup" in operator
    assert "shared-pointer fallback" in operator
    assert "Remote desktop-worker transport is not implemented" in operator


def test_documents_do_not_name_individual_operators():
    for path in DOCS.glob("*.md"):
        assert not re.search(r"\b(?:Aaron|Claudia)\b", path.read_text(), re.I), path
    for name in SHIPPED:
        text = (DOCS / name).read_text()
        assert "/home/odin" not in text
        # This immutable installed extension identifier is not a host assumption.
        text = text.replace("odin-scope@calmingstorm.net", "scope-extension-id")
        assert "calmingstorm" not in text.lower()
