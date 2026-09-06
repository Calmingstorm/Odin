"""Offline API inventory, authorization characterization, and committed drift gate."""

from __future__ import annotations

import functools
import html
import inspect
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from scripts.docs import generate_api_reference as reference
from scripts.docs._reference import REPO_ROOT, SOURCE_COMMIT, cell, source_link
from tests.characterization.test_api_route_parity import EXPECTED_ROUTES


def test_committed_api_reference_is_byte_identical():
    assert reference.OUTPUT.read_bytes() == reference.render().encode("utf-8"), (
        "Run python scripts/docs/generate_api_reference.py"
    )


def test_routes_exactly_match_characterization_method_path_name_and_order():
    rows = reference.collect_rest_routes()
    assert [(r.method, r.path, r.handler_name) for r in rows] == EXPECTED_ROUTES
    assert len(rows) == 211
    assert len({(r.method, r.path) for r in rows}) == len(rows)
    rendered = reference.render().split("## Other HTTP and WebSocket routes", 1)[0]
    table = [line.split(" | ") for line in rendered.splitlines() if line.startswith("| ")][2:]
    assert [(parts[0][2:], html.unescape(parts[1])) for parts in table] == [
        (r.method, r.path) for r in rows
    ]


def test_every_purpose_and_owner_come_from_the_registered_handler():
    from src.web.api import create_api_routes

    registrations = list(create_api_routes(MagicMock(host_registry=None)))
    rows = reference.collect_rest_routes()
    text = reference.render()
    assert f"`{SOURCE_COMMIT}`" in text
    missing = 0
    for row, registration in zip(rows, registrations, strict=True):
        handler = inspect.unwrap(registration.handler)
        doc = inspect.getdoc(handler)
        assert row.purpose == (doc.splitlines()[0] if doc else "—")
        missing += not bool(doc)
        assert row.module == handler.__module__
        assert row.source == inspect.getsourcefile(handler).removeprefix(str(REPO_ROOT) + "/")
        assert row.line == inspect.getsourcelines(handler)[1]
        assert source_link(row.source, row.line) in text
        assert cell(row.purpose) in text
    assert missing > 0
    assert "| — |" in text


@pytest.mark.parametrize(("method", "path", "admin", "local"), [
    ("POST", "/api/auth/login", False, False),
    ("POST", "/api/auth/logout", False, False),
    ("GET", "/api/auth/session", False, False),
    ("POST", "/api/chat", False, False),
    ("POST", "/api/execute", False, False),
    ("GET", "/api/sessions", False, False),
    ("DELETE", "/api/sessions/{channel_id}", False, False),
    ("GET", "/api/status", True, False),
    ("GET", "/api/subsystems/status", True, False),
    ("GET", "/api/ollama/models", True, False),
    ("POST", "/api/ollama/model", True, False),
    ("GET", "/api/config", True, False),
    ("GET", "/api/sessions/token-usage", True, True),
    ("GET", "/api/host-access", True, True),
    ("GET", "/api/hosts", True, True),
    ("GET", "/api/memory", True, False),
    ("GET", "/api/turn-state/turns", True, True),
])
def test_authentication_policy_characterization(method, path, admin, local):
    rows = {(r.method, r.path): r for r in reference.collect_rest_routes()}
    assert rows[method, path].admin is admin
    assert rows[method, path].local_admin is local


def test_active_policy_is_method_specific_and_not_legacy_prefixes():
    from src.health.server import ADMIN_ONLY_PREFIXES, _is_admin_only_path

    assert not "/api/status".startswith(ADMIN_ONLY_PREFIXES)
    assert _is_admin_only_path("/api/status", "GET")
    assert not _is_admin_only_path("/api/sessions", "GET")
    assert not _is_admin_only_path("/api/sessions", "HEAD")
    assert _is_admin_only_path("/api/sessions", "POST")
    assert not _is_admin_only_path("/api/sessions/{channel_id}", "DELETE")
    assert _is_admin_only_path("/api/sessions/{channel_id}", "PUT")
    assert not _is_admin_only_path("/api/ws", "GET")
    assert _is_admin_only_path("/api/ws", "POST")


@pytest.mark.asyncio
async def test_flags_match_actual_admin_middleware_without_dispatching_handlers():
    from aiohttp import web

    from src.health.server import _make_admin_middleware

    # Synthetic token presence, not a credential loaded from config or disk.
    policy = _make_admin_middleware(SimpleNamespace(api_token="", api_tokens=[object()]))
    for row in reference.collect_rest_routes():
        resource = (
            web.DynamicResource(row.path) if "{" in row.path else web.PlainResource(row.path)
        )
        request = SimpleNamespace(
            path=row.path, method=row.method, app={},
            match_info=SimpleNamespace(route=SimpleNamespace(resource=resource)),
            _api_identity=SimpleNamespace(tier="user"),
        )
        sentinel = object()
        handler = AsyncMock(return_value=sentinel)
        result = await policy(request, handler)
        if row.admin:
            assert result.status == 403
            handler.assert_not_awaited()
        else:
            assert result is sentinel
            handler.assert_awaited_once_with(request)


def test_decorated_gate_and_missing_docstring_without_execution():
    from src.web.api_common import admin_gate

    gate = admin_gate(MagicMock())

    async def plain(request):
        raise AssertionError("Do not execute handlers during documentation")

    @functools.wraps(plain)
    async def decorated(request):
        rejection = gate(request)
        return rejection if rejection is not None else await plain(request)

    assert reference.first_doc_line(decorated) == "—"
    assert not reference.has_local_admin_gate(plain)
    assert not reference.endpoint("GET", r"/api/sessions/{channel_id:\d+}", plain).admin
    assert reference.has_local_admin_gate(decorated)
    assert reference.endpoint("GET", "/api/sessions", decorated).admin

    async def documented(request):
        """First line | <tag> {{literal}}.

        Never use this second line as the purpose.
        """

    assert reference.first_doc_line(documented) == "First line | <tag> {{literal}}."


HEALTH = ["/health", "/health/live", "/health/ready", "/metrics"]
WEBHOOKS = [f"/webhook/{name}" for name in ("gitea", "grafana", "generic", "github", "gitlab")]
UI = ["/", "/ui/{path:.*}", "/ui"]


@pytest.mark.parametrize(("options", "paths"), [
    ({}, HEALTH + WEBHOOKS + UI + ["/api/ws"]),
    ({"web_enabled": False}, HEALTH + WEBHOOKS),
    ({"webhooks_enabled": False}, HEALTH + UI + ["/api/ws"]),
    ({"ui_exists": False}, HEALTH + WEBHOOKS + ["/api/ws"]),
    ({"dist_exists": False}, HEALTH + WEBHOOKS + UI + ["/api/ws"]),
    ({"wire_bot": False}, HEALTH + WEBHOOKS + UI),
    ({"web_enabled": False, "webhooks_enabled": False}, HEALTH),
])
def test_non_rest_registration_conditions_and_order(options, paths):
    rows = reference.collect_server_routes(**options)
    assert [r.path for r in rows] == paths
    assert [r.method for r in rows] == [
        "POST" if p.startswith("/webhook/") else "GET" for p in paths
    ]
    assert all(not r.admin for r in rows)


def test_generation_does_not_load_config_start_services_or_read_ui(monkeypatch):
    import socket

    from src import config
    from src.config import schema
    from src.health.server import HealthServer

    def forbidden(*args, **kwargs):
        raise AssertionError("Generator attempted runtime I/O")

    monkeypatch.setattr(config, "_load_env", forbidden)
    monkeypatch.setattr(schema, "load_config", forbidden)
    monkeypatch.setattr(HealthServer, "start", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "bind", forbidden)
    # Constructors can register routes but must not inspect UI assets on disk.
    monkeypatch.setattr(reference.Path, "is_dir", forbidden)
    monkeypatch.setattr(reference.Path, "is_file", forbidden)
    assert "**211 REST registrations**" in reference.render()


def test_cli_is_offline_and_works_outside_repo_without_git(tmp_path):
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts/docs/generate_api_reference.py"), "--check"],
        cwd=tmp_path, env={"PATH": "", "PYTHONHASHSEED": "97"},
        text=True, capture_output=True, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_check_fails_for_missing_and_stale_files_without_writes(tmp_path, monkeypatch):
    output = tmp_path / "api.md"
    monkeypatch.setattr(reference, "OUTPUT", output)
    monkeypatch.setattr(reference, "render", lambda: "expected\n")
    assert reference.main(["--check"]) == 1
    assert not output.exists()
    output.write_bytes(b"stale\r\n")
    assert reference.main(["--check"]) == 1
    assert output.read_bytes() == b"stale\r\n"
    assert reference.main([]) == 0
    assert output.read_bytes() == b"expected\n"
    assert reference.main(["--check"]) == 0
