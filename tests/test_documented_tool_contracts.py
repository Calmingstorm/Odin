"""Pin published capability counts and the installed CLI's actual default request."""

import runpy
from pathlib import Path
from unittest.mock import Mock

import yaml

from src.config.schema import WebConfig
from src.tools.registry import TOOLS

ROOT = Path(__file__).resolve().parents[1]


def test_installed_cli_default_matches_config(monkeypatch):
    monkeypatch.delenv("ODIN_URL", raising=False)
    monkeypatch.delenv("ODIN_API_TOKEN", raising=False)
    monkeypatch.setattr("sys.argv", ["odin", "hello"])
    transport = Mock(return_value=Mock(read=lambda: b'{"response":"ok"}'))
    monkeypatch.setattr("urllib.request.urlopen", transport)
    cli = runpy.run_path(str(ROOT / "scripts/odin-cli.py"))
    assert cli["main"]() == 0
    port = WebConfig().port
    assert port == 3000  # A coordinated drift in schema/template/CLI must fail too.
    assert port == yaml.safe_load((ROOT / "config.yml").read_text())["web"]["port"]
    assert transport.call_args.args[0].full_url == f"http://localhost:{port}/api/execute"


def test_documented_counts_match_registry():
    count = len(TOOLS)
    core = sum(bool(t.get("is_core")) for t in TOOLS)
    reference = (ROOT / "docs/reference/tools.md").read_text()
    assert str(count) in reference and str(core) in reference
    assert "static built-in tool catalog" in (ROOT / "README.md").read_text()
    assert f"{count} built-in tools" in (ROOT / "packaging/nfpm.yml").read_text()
    for path in ("docs/security.md", "docs/configuration.md"):
        assert "built-in tool" in (ROOT / path).read_text()
