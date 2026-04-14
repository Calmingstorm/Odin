"""Discord OAuth2 authentication routes."""

from aiohttp import web


def create_auth_routes() -> list[web.RouteDef]:
    routes = web.RouteTableDef()

    @routes.get("/auth/login")
    async def login(request: web.Request) -> web.Response:
        config = request.app["config"]
        # Redirect to Discord OAuth2
        params = (
            f"client_id={config.oauth_client_id}"
            f"&redirect_uri={config.oauth_redirect_uri}"
            f"&response_type=code&scope=identify+guilds"
        )
        raise web.HTTPFound(f"https://discord.com/api/oauth2/authorize?{params}")

    @routes.get("/auth/callback")
    async def callback(request: web.Request) -> web.Response:
        code = request.query.get("code")
        if not code:
            raise web.HTTPBadRequest(text="Missing authorization code")
        # Placeholder — would exchange code for token
        return web.json_response({"status": "authenticated"})

    @routes.get("/auth/logout")
    async def logout(request: web.Request) -> web.Response:
        return web.json_response({"status": "logged_out"})

    return list(routes)
