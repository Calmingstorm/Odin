"""CLI failures must remain failures, without contacting an installed Odin."""
import io
import json
import urllib.error
from unittest.mock import Mock

import pytest

from src import cli


@pytest.mark.parametrize("interactive", [True, False])
def test_empty_prompt_prints_help_without_transport(monkeypatch, capsys, interactive):
    stdin = io.StringIO(" \n")
    stdin.isatty = lambda: interactive
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "argv", ["odin"])
    transport = Mock(side_effect=AssertionError("no network"))
    monkeypatch.setattr(cli.urllib.request, "urlopen", transport)
    assert cli.main() == 1
    assert "Send a prompt" in capsys.readouterr().out
    transport.assert_not_called()


@pytest.mark.parametrize("error", [
    urllib.error.URLError("connection refused"),
    urllib.error.HTTPError("http://example.invalid", 403, "Forbidden", {}, None),
])
def test_transport_failure_is_nonzero_even_in_json_mode(monkeypatch, capsys, error):
    monkeypatch.setattr(cli.sys, "argv", ["odin", "hello", "--json"])
    monkeypatch.setattr(cli.urllib.request, "urlopen", Mock(side_effect=error))
    assert cli.main() == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert "Connection/API error:" in output.err


def test_piped_prompt_and_environment_build_real_authenticated_request(monkeypatch, capsys):
    monkeypatch.setenv("ODIN_URL", "http://example.invalid/")
    monkeypatch.setenv("ODIN_API_TOKEN", "test-credential")
    monkeypatch.setattr(cli.sys, "argv", ["odin", "--timeout", "12"])
    stdin = io.StringIO("  diagnose the test service\n")
    stdin.isatty = lambda: False
    monkeypatch.setattr(cli.sys, "stdin", stdin)

    def transport(request, timeout):
        assert request.full_url == "http://example.invalid/api/execute"
        assert request.get_header("Authorization") == "Bearer test-credential"
        assert json.loads(request.data) == {"prompt": "diagnose the test service"}
        assert timeout == 12
        return io.BytesIO(b'{"response":"test answer","is_error":false}')

    monkeypatch.setattr(cli.urllib.request, "urlopen", transport)
    assert cli.main() == 0
    assert capsys.readouterr().out == "test answer\n"
