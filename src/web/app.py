"""Odin web dashboard application factory."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

from src.web.routes.api import create_api_routes
from src.web.routes.auth import create_auth_routes
from src.web.routes.health import create_health_routes

if TYPE_CHECKING:
    from src.config import OdinConfig

DASHBOARD_DIR = Path(__file__).parent / "dashboard"


def create_app(config: OdinConfig) -> web.Application:
    """Create and configure the aiohttp web application."""
    app = web.Application()
    app["config"] = config

    # Register route groups
    app.router.add_routes(create_health_routes())
    app.router.add_routes(create_api_routes())
    app.router.add_routes(create_auth_routes())

    # Serve static dashboard files
    if DASHBOARD_DIR.exists():
        app.router.add_static("/static/", DASHBOARD_DIR, name="static")
        app.router.add_get("/", _serve_dashboard)
        app.router.add_get("/dashboard", _serve_dashboard)

    return app


async def _serve_dashboard(request: web.Request) -> web.FileResponse:
    index = DASHBOARD_DIR / "index.html"
    if index.exists():
        return web.FileResponse(index)
    raise web.HTTPNotFound()
