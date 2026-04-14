"""Health check endpoints."""

from aiohttp import web


def create_health_routes() -> list[web.RouteDef]:
    routes = web.RouteTableDef()

    @routes.get("/health")
    async def health(request: web.Request) -> web.Response:
        return web.json_response({"status": "ok", "service": "odin"})

    return list(routes)
