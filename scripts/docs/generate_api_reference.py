#!/usr/bin/env python3
"""Generate the API inventory offline from real route registration functions."""

from __future__ import annotations

import argparse
import inspect
import sys
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import MagicMock, patch

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.docs._reference import REPO_ROOT, SOURCE_COMMIT, cell, source_link  # noqa: E402

OUTPUT = REPO_ROOT / "docs/reference/api.md"


@dataclass(frozen=True)
class Endpoint:
    method: str
    path: str
    handler_name: str
    module: str
    source: str
    line: int
    purpose: str
    admin: bool
    local_admin: bool


def first_doc_line(handler) -> str:
    """Use the actual handler's docstring, never an inferred description."""
    doc = inspect.getdoc(inspect.unwrap(handler))
    return doc.splitlines()[0] if doc else "—"


def has_local_admin_gate(handler, seen=None) -> bool:
    """Find admin_gate in a handler/decorator's captured helper chain.

    Covers direct _require_admin calls and the hosts module's `denied` helper
    without confusing owner/scope checks with admin-only gates. No execution.
    """
    if not inspect.isfunction(handler):
        return False
    seen = set() if seen is None else seen
    if id(handler) in seen:
        return False
    seen.add(id(handler))
    if (handler.__module__ == "src.web.api_common"
            and handler.__qualname__ == "admin_gate.<locals>._require_admin"):
        return True
    wrapped = getattr(handler, "__wrapped__", None)
    if wrapped is not None and has_local_admin_gate(wrapped, seen):
        return True
    for captured in handler.__closure__ or ():
        try:
            value = captured.cell_contents
        except ValueError:
            continue
        if has_local_admin_gate(value, seen):
            return True
    return False


def endpoint(method: str, path: str, handler) -> Endpoint:
    from aiohttp import web

    from src.health.server import _is_admin_only_path

    original = inspect.unwrap(handler)
    filename = inspect.getsourcefile(original)
    if filename is None:
        raise ValueError(f"No source for {method} {path}")
    source = Path(filename).resolve().relative_to(REPO_ROOT).as_posix()
    local_admin = has_local_admin_gate(handler)
    # The middleware uses router resource.canonical (regex constraints removed),
    # while the documentation must retain the originally registered path.
    canonical = web.DynamicResource(path).canonical if "{" in path else path
    return Endpoint(
        method, path, original.__name__, original.__module__, source,
        inspect.getsourcelines(original)[1], first_doc_line(original),
        _is_admin_only_path(canonical, method) or local_admin, local_admin,
    )


def collect_rest_routes() -> list[Endpoint]:
    """Same RouteTableDef mechanism/order as test_api_route_parity.py.

    Inert bot dependencies only: no host enrollment manager, config loading,
    or request-handler execution.
    """
    from src.web.api import create_api_routes

    bot = MagicMock(host_registry=None)
    return [endpoint(rd.method, rd.path, rd.handler) for rd in create_api_routes(bot)]


def collect_server_routes(
    *, web_enabled=True, webhooks_enabled=True, ui_exists=True,
    dist_exists=True, wire_bot=True,
) -> list[Endpoint]:
    """Exercise HealthServer registration with synthetic config/filesystem.

    No setup_web_api symbol exists here: constructor and set_bot are the actual
    boundary. Capture add_get/add_post to preserve regex paths and omit implicit
    HEAD expansion. Subtract the actual REST inventory, not a URL-prefix guess,
    so the separately registered /api/ws is retained. No start/handlers called.
    """
    from aiohttp import web

    from src.config.schema import SlackConfig, WebConfig, WebhookConfig
    from src.health import server

    found = []
    add_get, add_post = web.UrlDispatcher.add_get, web.UrlDispatcher.add_post

    def record_get(router, path, handler, **kwargs):
        found.append(endpoint("GET", path, handler))
        return add_get(router, path, handler, **kwargs)

    def record_post(router, path, handler, **kwargs):
        found.append(endpoint("POST", path, handler))
        return add_post(router, path, handler, **kwargs)

    # Stub only server.Path, not pathlib: source inspection remains real.
    fake_path = MagicMock()
    root = fake_path.return_value.resolve.return_value.parent.parent.parent
    ui_root = root.__truediv__.return_value
    dist = ui_root.__truediv__.return_value
    dist.__truediv__.return_value.is_file.return_value = dist_exists
    ui_root.is_dir.return_value = ui_exists
    dist.is_dir.return_value = ui_exists
    config = WebConfig(enabled=web_enabled, api_token="", api_tokens=[])
    bot = MagicMock(host_registry=None, api_token_manager=None, tool_executor=None)
    bot.config.web = config
    with (
        patch.object(server, "Path", fake_path),
        patch.object(web.UrlDispatcher, "add_get", record_get),
        patch.object(web.UrlDispatcher, "add_post", record_post),
    ):
        health = server.HealthServer(
            web_config=config,
            webhook_config=WebhookConfig(enabled=webhooks_enabled),
            slack_config=SlackConfig(enabled=False),
        )
        if wire_bot:
            health.set_bot(bot)
    rest_pairs = {(row.method, row.path) for row in collect_rest_routes()}
    return [row for row in found if (row.method, row.path) not in rest_pairs]


def _owner(row: Endpoint) -> str:
    return f"[{cell(row.module)}]({source_link(row.source, row.line)})"


def render() -> str:
    routes = collect_rest_routes()
    server_routes = collect_server_routes()
    health_link = source_link("src/health/server.py")
    parity_link = source_link("tests/characterization/test_api_route_parity.py")
    lines = [
        "# API reference", "",
        f"Source commit: `{SOURCE_COMMIT}`.", "",
        "Generated by `scripts/docs/generate_api_reference.py`; do not edit by hand.", "",
        f"The **{len(routes)} REST registrations** below follow "
        f"[`create_api_routes`]({source_link('src/web/api/__init__.py')}) in exact order, "
        f"using the same route-table mechanism as the [parity test]({parity_link}). "
        "Order matters for overlapping literal and parameter paths. "
        "Implicit aiohttp HEAD routes are not counted separately; GET registrations "
        "also accept HEAD. Purpose is the first handler-docstring line; **—** means "
        "the handler has no docstring, not a guessed description.", "",
        "## Authentication and authorization", "",
        f"The active [HTTP middleware policy]({health_link}) requires authentication "
        "on API routes except `/api/auth/login`, and makes API access admin-only "
        "by default except exact method/resource pairs in `SELF_SERVICE_ROUTES`. "
        "The older `ADMIN_ONLY_PREFIXES` constant remains in the source but is **not** "
        "the active decision rule: `_is_admin_only_path` is. The table evaluates "
        "that function and follows captured route-local `admin_gate` helpers "
        "and wrapped handlers. “Yes + local” indicates an admin requirement "
        "with a local gate. “No” does not mean public: self-service endpoints still "
        "enforce authentication and applicable identity, session, and tool restrictions.", "",
        "This describes the normal authenticated deployment. With no configured "
        "tokens (including managed tokens), authentication/admin gates allow "
        "development-mode access. HTTP API credentials may be a bearer token or "
        "server-side session credential; the HTTP middleware also accepts the "
        "historical query-token carrier. WebSockets instead use the bearer "
        "subprotocol and reject URL query tokens.", "",
        "## REST routes", "",
        "| Method | Path | Owning module / handler source | Admin-gated | Purpose |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in routes:
        admin = "Yes + local" if row.local_admin else ("Yes" if row.admin else "No")
        lines.append(
            f"| {row.method} | {cell(row.path)} | {_owner(row)} | {admin} | {cell(row.purpose)} |"
        )
    lines += [
        "", "## Other HTTP and WebSocket routes", "",
        f"Registered by [HealthServer]({health_link}) and "
        f"[`setup_websocket`]({source_link('src/web/websocket.py')}); "
        "these are outside the REST table, including the `/api/ws` upgrade endpoint. "
        "GET rows also include implicit HEAD registration. No listener is started "
        "to generate this inventory.", "",
        "| Method | Path | Owning module / handler source | Registration / access | Purpose |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in server_routes:
        if row.path.startswith("/webhook/"):
            condition = "webhooks.enabled; handler verifies webhook signature/shared secret"
        elif row.path == "/api/ws":
            condition = "web.enabled + set_bot; authenticated, not admin-only; scoped subscriptions"
        elif row.path in {"/", "/ui", "/ui/{path:.*}"}:
            condition = "web.enabled + UI directory exists; no API authentication"
        else:
            condition = "HealthServer construction; no API authentication"
        lines.append(
            f"| {row.method} | {cell(row.path)} | {_owner(row)} | "
            f"{cell(condition)} | {cell(row.purpose)} |"
        )
    lines += [
        "", "### Conditional registration", "",
        "The constructor always registers health/metrics, independently of the WebUI "
        "and webhook switches. Webhooks are registered only when `webhooks.enabled`. "
        "The UI requires `web.enabled` and an existing UI directory: it prefers "
        "`ui/dist` when `ui/dist/index.html` exists, otherwise falls back to `ui`; "
        "if the selected directory is absent, no UI routes are registered. "
        "The static file handler falls back to `index.html` for SPA routing. "
        "`HealthServer.set_bot` adds all REST routes and the WebSocket only when "
        "`web.enabled`; constructing the server alone does not add them. "
        "There is no `setup_web_api` function in this source revision.", "",
        "Regenerate with `python scripts/docs/generate_api_reference.py`; verify "
        "without writing with `python scripts/docs/generate_api_reference.py --check`. "
        "Generation uses mocked bot dependencies and UI existence checks, never "
        "loads runtime configuration or persisted data, and never invokes handlers.", "",
    ]
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail on missing or stale output")
    args = parser.parse_args(argv)
    expected = render().encode("utf-8")
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_bytes() != expected:
            print("API reference is stale; run python scripts/docs/generate_api_reference.py")
            return 1
        print("API reference is up to date.")
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(expected)
    print("Wrote docs/reference/api.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
