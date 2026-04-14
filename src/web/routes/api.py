"""REST API endpoints for the Odin dashboard."""

from aiohttp import web


def create_api_routes() -> list[web.RouteDef]:
    routes = web.RouteTableDef()

    @routes.get("/api/v1/guilds/{guild_id}")
    async def get_guild(request: web.Request) -> web.Response:
        guild_id = request.match_info["guild_id"]
        # Placeholder — would query database
        return web.json_response({
            "guild_id": guild_id,
            "prefix": "!",
            "features": [],
        })

    @routes.patch("/api/v1/guilds/{guild_id}")
    async def update_guild(request: web.Request) -> web.Response:
        guild_id = request.match_info["guild_id"]
        body = await request.json()
        # Placeholder — would update database
        return web.json_response({"guild_id": guild_id, **body})

    @routes.get("/api/v1/guilds/{guild_id}/infractions")
    async def get_infractions(request: web.Request) -> web.Response:
        guild_id = request.match_info["guild_id"]
        # Placeholder — would query database
        return web.json_response({"guild_id": guild_id, "infractions": []})

    return list(routes)
