"""Skills route registrars (RFC-003 P3 — carved verbatim from api/__init__).

Each ``register_*`` moves one section of the old monolith unchanged; the
composition root calls them at the sections' original positions, so the
route REGISTRATION ORDER (aiohttp path precedence) is exactly what the
parity contract pins.
"""

from __future__ import annotations

from aiohttp import web

from ...odin_log import get_logger
from ..api_common import (
    _MAX_CODE_LEN,
    _MAX_NAME_LEN,
    _sanitize_error,
    _validate_string,
)

log = get_logger("web.api")

def register_skills(routes: web.RouteTableDef, bot) -> None:
    """Skills (verbatim from the monolith)."""
    # ------------------------------------------------------------------
    # Skills
    # ------------------------------------------------------------------

    @routes.get("/api/skills")
    async def list_skills(_request: web.Request) -> web.Response:
        skills = bot.skill_manager.list_skills()
        # Get usage counts from audit log
        counts = await bot.audit.count_by_tool()
        # Add source code and execution stats for each skill
        for skill_info in skills:
            name = skill_info["name"]
            skill_info["code"] = None
            loaded = bot.skill_manager._skills.get(name)
            if loaded and loaded.file_path.exists():
                try:
                    skill_info["code"] = loaded.file_path.read_text()
                except OSError:
                    pass
            skill_info["execution_count"] = counts.get(name, 0)
        return web.json_response(skills)

    @routes.post("/api/skills")
    async def create_skill(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        name = data.get("name", "").strip()
        code = data.get("code", "").strip()
        if not name or not code:
            return web.json_response(
                {"error": "name and code are required"}, status=400
            )
        for err in (
            _validate_string(name, "name", _MAX_NAME_LEN),
            _validate_string(code, "code", _MAX_CODE_LEN),
        ):
            if err:
                return web.json_response({"error": err}, status=400)
        result = bot.skill_manager.create_skill(name, code)
        bot.tool_catalog.invalidate()
        bot.prompt_builder.cached_skills_text = None
        is_error = "error" in result.lower() or "failed" in result.lower()
        return web.json_response(
            {"result": result},
            status=400 if is_error else 201,
        )

    @routes.put("/api/skills/{name}")
    async def update_skill(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        code = data.get("code", "").strip()
        if not code:
            return web.json_response({"error": "code is required"}, status=400)
        err = _validate_string(code, "code", _MAX_CODE_LEN)
        if err:
            return web.json_response({"error": err}, status=400)
        result = bot.skill_manager.edit_skill(name, code)
        bot.tool_catalog.invalidate()
        bot.prompt_builder.cached_skills_text = None
        is_error = "error" in result.lower() or "failed" in result.lower()
        return web.json_response(
            {"result": result},
            status=400 if is_error else 200,
        )

    @routes.post("/api/skills/{name}/test")
    async def test_skill(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        if not bot.skill_manager.has_skill(name):
            return web.json_response({"error": "skill not found"}, status=404)
        try:
            result = await bot.skill_manager.execute(name, {})
            is_error = result.startswith("Skill error:") or result.startswith("Skill '")
            return web.json_response({
                "result": result,
                "is_error": is_error,
            })
        except Exception as e:
            return web.json_response({"result": _sanitize_error(e), "is_error": True}, status=500)

    @routes.delete("/api/skills/{name}")
    async def delete_skill(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        result = bot.skill_manager.delete_skill(name)
        bot.tool_catalog.invalidate()
        bot.prompt_builder.cached_skills_text = None
        is_error = "error" in result.lower() or "not found" in result.lower()
        return web.json_response(
            {"result": result},
            status=404 if is_error else 200,
        )

    @routes.get("/api/skills/{name}")
    async def get_skill_detail(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        info = bot.skill_manager.get_skill_info(name)
        if not info:
            return web.json_response({"error": "skill not found"}, status=404)
        return web.json_response(info)

    @routes.post("/api/skills/validate")
    async def validate_skill(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)
        code = data.get("code", "").strip()
        if not code:
            return web.json_response({"error": "code is required"}, status=400)
        err = _validate_string(code, "code", _MAX_CODE_LEN)
        if err:
            return web.json_response({"error": err}, status=400)
        report = bot.skill_manager.validate_skill_code(code)
        return web.json_response(report)

    @routes.post("/api/skills/{name}/enable")
    async def enable_skill(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        result = bot.skill_manager.enable_skill(name)
        if "not found" in result.lower():
            return web.json_response({"result": result}, status=404)
        bot.tool_catalog.invalidate()
        bot.prompt_builder.cached_skills_text = None
        return web.json_response({"result": result})

    @routes.post("/api/skills/{name}/disable")
    async def disable_skill_api(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        result = bot.skill_manager.disable_skill(name)
        if "not found" in result.lower():
            return web.json_response({"result": result}, status=404)
        bot.tool_catalog.invalidate()
        bot.prompt_builder.cached_skills_text = None
        return web.json_response({"result": result})

    @routes.get("/api/skills/{name}/config")
    async def get_skill_config(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        if not bot.skill_manager.has_skill(name):
            return web.json_response({"error": "skill not found"}, status=404)
        info = bot.skill_manager.get_skill_info(name)
        return web.json_response({
            "config": bot.skill_manager.get_skill_config(name),
            "schema": info["metadata"]["config_schema"] if info else {},
        })

    @routes.put("/api/skills/{name}/config")
    async def set_skill_config(request: web.Request) -> web.Response:
        name = request.match_info["name"]
        if not bot.skill_manager.has_skill(name):
            return web.json_response({"error": "skill not found"}, status=404)
        data = await request.json()
        values = data.get("config", {})
        if not isinstance(values, dict):
            return web.json_response({"error": "config must be a dict"}, status=400)
        errors = bot.skill_manager.set_skill_config(name, values)
        if errors:
            return web.json_response({"errors": errors}, status=400)
        return web.json_response({"config": bot.skill_manager.get_skill_config(name)})


