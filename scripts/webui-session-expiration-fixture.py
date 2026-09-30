"""Disposable loopback HTTP/WS fixture using Odin's real auth/session code.

Only the browser check launches this process, with a synthetic config. Never
load installation configuration, data, or the application runtime.
"""
import asyncio
import json
from types import SimpleNamespace

from aiohttp import web

from src.config.schema import WebConfig
from src.health.server import SessionManager, _make_auth_middleware
from src.web.api.security import register_auth
from src.web.websocket import _bearer_subprotocol


async def main():
    config = WebConfig(api_token="browser-fixture-credential")
    sessions = SessionManager()
    bot = SimpleNamespace(config=SimpleNamespace(web=config), api_token_manager=None)
    app = web.Application(middlewares=[_make_auth_middleware(config, sessions)])
    app["session_manager"] = sessions
    routes = web.RouteTableDef()
    register_auth(routes, bot)
    app.add_routes(routes)
    state = {"mode": "normal", "requests": [], "sockets": 0}
    release_mount = asyncio.Event()

    async def control(request):
        body = await request.json()
        if body.get("invalidate"):
            sessions.destroy_by_user_id("api-admin")
        if "mode" in body:
            state["mode"] = body["mode"]
        if body.get("release_mount"):
            release_mount.set()
        return web.json_response(state)

    async def api(request):
        state["requests"].append(request.path)
        if state["mode"] == "mount401" and request.path == "/api/knowledge":
            await release_mount.wait()
        if state["mode"] == "forbidden" and request.path != "/api/status":
            return web.json_response({"error": "not permitted"}, status=403)
        if state["mode"] in {"page401", "mount401"} and request.path != "/api/status":
            return web.json_response({"error": "unauthorized"}, status=401)
        if request.path == "/api/status":
            return web.json_response({"status": "online", "uptime_seconds": 1})
        if request.path == "/api/setup/status":
            return web.json_response({"mode": "complete"})
        if request.path in {"/api/audit", "/api/agents", "/api/knowledge"}:
            return web.json_response([])
        return web.json_response({})

    async def websocket(request):
        # Admission is production middleware. A rejected upgrade is a real HTTP
        # 401, hidden from Chromium JS as the abnormal close code 1006.
        protocol = _bearer_subprotocol(request)
        socket = web.WebSocketResponse(protocols=(protocol,) if protocol else ())
        await socket.prepare(request)
        state["sockets"] += 1
        async for message in socket:
            if message.type == web.WSMsgType.TEXT:
                payload = json.loads(message.data)
                if "subscribe" in payload:
                    await socket.send_json({"type": "subscribed", "channel": payload["subscribe"]})
                if payload.get("type") == "ping":
                    await socket.send_json({"type": "pong", "ts": payload["ts"]})
        return socket

    app.router.add_post("/fixture/control", control)
    app.router.add_get("/api/ws", websocket)
    app.router.add_get("/api/{tail:.*}", api)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    print(json.dumps({"port": port}), flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
