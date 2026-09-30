"""Explicit command roles and legacy upgrades are a tested package contract."""
import tomllib
from pathlib import Path
from unittest.mock import Mock

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


def test_explicit_names_have_matching_roles_without_rewriting_legacy_aliases():
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]["scripts"]
    assert project["odin-server"] == "src.__main__:main"
    assert project["odin-client"] == project["odin"] == "src.cli:main"
    package = yaml.safe_load((ROOT / "packaging/nfpm.yml").read_text())
    commands = {
        Path(row["dst"]).name: row["src"] for row in package["contents"]
        if row.get("dst", "").startswith("/usr/local/bin/")
    }
    assert commands["odin-client"] == commands["odin"] == "./scripts/odin-cli.py"
    assert commands["odin-server"] == "./scripts/odin-server"
    guide = (ROOT / "docs/cli.md").read_text()
    assert "`odin-server`" in guide and "`odin-client`" in guide
    assert "old server invocation" in guide
    assert "no prompt is sent" in guide


@pytest.mark.parametrize("implementation", ["python", "debian"])
@pytest.mark.parametrize("arguments", [
    ["config.yml"], ["/missing/operator.yaml"], ["-c", "config.yml"],
    ["--config", "operator"], ["--config=operator"],
    ["--env-file", ".env"], ["--env-file=.env"], ["-coperator"],
])
def test_server_style_client_calls_refuse_without_network(
    monkeypatch, capsys, implementation, arguments,
):
    import runpy

    from src import cli

    main = cli.main if implementation == "python" else runpy.run_path(
        str(ROOT / "scripts/odin-cli.py"),
    )["main"]
    network = Mock(side_effect=AssertionError("No request may be sent"))
    monkeypatch.setattr("urllib.request.urlopen", network)
    monkeypatch.setattr("sys.argv", ["odin", *arguments])
    assert main() == 2
    assert "server command is now odin-server" in capsys.readouterr().err
    network.assert_not_called()


def test_existing_custom_config_file_is_not_sent_as_a_prompt(tmp_path, monkeypatch):
    from src import cli

    config = tmp_path / "operator.conf"
    config.write_text("discord: {}\n")
    monkeypatch.setattr("sys.argv", ["odin", str(config)])
    monkeypatch.setattr("urllib.request.urlopen", Mock(side_effect=AssertionError("network")))
    assert cli.main() == 2


@pytest.mark.parametrize("arguments", [
    ["explain config.yml"], ["--token", "config.yml", "hello"],
    ["--url", "http://fixture/config.yml", "hello"], ["--help"],
])
def test_normal_client_option_values_and_prose_are_not_server_calls(arguments):
    from src.cli import legacy_server_arguments

    assert not legacy_server_arguments(arguments)
