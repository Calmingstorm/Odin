"""Discord gateway credential and attachment management.

This route deliberately owns only the live credential correction path.  First
boot remains the onboarding coordinator's job; this surface uses its declared
environment and config binding rather than guessing from the process CWD.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from aiohttp import web
from dotenv import dotenv_values

from ...config.environment import edit_environment
from ...config.persistence import (
    _run_settled,
    config_transaction,
    patch_config_paths,
)
from ...config.schema import Config
from ...setup_wizard import validate_token_format
from ..api_common import _sanitize_error, admin_gate

_TOKEN_PLACEHOLDER = "${DISCORD_TOKEN}"


def _context(bot: Any):
    """Return the explicitly-bound credential stores, never a fallback path."""
    onboarding = getattr(bot, "onboarding", None)
    source = getattr(onboarding, "environment_source", None)
    binding = getattr(getattr(onboarding, "initialization_store", None), "binding", None)
    path = getattr(binding, "config_path", None)
    if source is None or not isinstance(path, Path):
        return None
    return onboarding, source, path


def _durable_status(bot: Any) -> tuple[bool, bool]:
    """Return (persisted, credential_configured), without exposing a secret.

    The env file is the intended durable credential source.  If it cannot be
    read precisely, report the independently observable YAML intent but do not
    fabricate a persisted credential claim from ``bot.config``.
    """
    context = _context(bot)
    if context is None:
        return False, False
    _onboarding, source, config_path = context
    try:
        configured = _TOKEN_PLACEHOLDER in config_path.read_text(encoding="utf-8")
    except OSError:
        configured = False
    try:
        values = dotenv_values(source.path)
        token = values.get("DISCORD_TOKEN")
        exact = isinstance(token, str) and bool(token.strip())
    except (OSError, UnicodeError):
        exact = False
    return configured and exact, configured


def _payload(bot: Any) -> dict[str, Any]:
    persisted, configured = _durable_status(bot)
    supervisor = getattr(bot, "connection_supervisor", None)
    status = supervisor.status() if supervisor is not None else None
    return {
        "persisted": persisted,
        "credential_configured": configured,
        "connection": {
            "state": getattr(status, "state", "unavailable"),
            "detail": getattr(status, "detail", "connection supervisor unavailable"),
            "generation": getattr(status, "generation", 0),
        },
    }


def register_discord_connection(routes: web.RouteTableDef, bot: Any) -> None:
    """Register the local-admin Discord connection endpoint."""
    require_admin = admin_gate(bot)

    @routes.get("/api/discord/connection")
    async def get_connection(request: web.Request) -> web.Response:
        denied = require_admin(request)
        if denied is not None:
            return denied
        return web.json_response(_payload(bot))

    @routes.post("/api/discord/connection")
    async def update_connection(request: web.Request) -> web.Response:
        denied = require_admin(request)
        if denied is not None:
            return denied
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(body, dict) or not isinstance(body.get("operation"), str):
            return web.json_response({"error": "operation is required"}, status=400)

        operation = body["operation"]
        allowed = {
            "status": {"operation"},
            "credentials": {"operation", "token"},
            "connect": {"operation"},
            "detach": {"operation"},
        }
        if operation not in allowed or set(body) != allowed[operation]:
            return web.json_response({"error": "invalid connection request"}, status=400)
        if operation == "status":
            return web.json_response(_payload(bot))

        context = _context(bot)
        if context is None:
            return web.json_response({"error": "connection context unavailable"}, status=503)
        _onboarding, environment_source, config_path = context
        supervisor = getattr(bot, "connection_supervisor", None)
        if supervisor is None:
            return web.json_response({"error": "connection supervisor unavailable"}, status=503)

        if operation == "detach":
            try:
                await supervisor.detach()
            except Exception as exc:
                return web.json_response({"error": _sanitize_error(exc)}, status=502)
            return web.json_response(_payload(bot))

        if operation == "connect":
            token = getattr(getattr(bot.config, "discord", None), "token", None)
            if not isinstance(token, str) or not validate_token_format(token):
                return web.json_response({"error": "no valid persisted credential"}, status=409)
            try:
                await supervisor.attach(token)
            except Exception:
                return web.json_response(
                    {**_payload(bot), "error": "Discord gateway activation failed"}, status=502
                )
            return web.json_response(_payload(bot))

        token = body["token"]
        if not isinstance(token, str) or not validate_token_format(token):
            return web.json_response({"error": "discord token format is invalid"}, status=400)

        # Keep write, runtime publication, and attachment serialized.  The real
        # supervisor's attach only starts a gateway task; it does not await login.
        async with config_transaction():
            current = bot.config.model_dump()
            current["discord"]["token"] = token
            try:
                candidate = Config(**current)
            except Exception:
                return web.json_response({"error": "discord configuration is invalid"}, status=400)

            config_committed = environment_committed = False

            def publish() -> None:
                nonlocal config_committed, environment_committed
                patch_config_paths(
                    [(('discord', 'token'), _TOKEN_PLACEHOLDER)], path=config_path
                )
                config_committed = True
                result = edit_environment(environment_source, {"DISCORD_TOKEN": token})
                environment_committed = result.durable
                if not result.durable:
                    raise RuntimeError("credential environment durability could not be confirmed")

            write_error, cancelled = await _run_settled(publish)
            # Publish settled durable state even if cancellation arrived while
            # the worker was committing.  A cancelled request never autoattaches.
            if write_error is None:
                bot.config = candidate
                os.environ["DISCORD_TOKEN"] = token
            if cancelled:
                raise asyncio.CancelledError
            if write_error is not None:
                return web.json_response({
                    **_payload(bot),
                    "error": f"credential save failed: {_sanitize_error(write_error)}",
                    "config_committed": config_committed,
                    "environment_committed": environment_committed,
                }, status=500)
            try:
                await supervisor.attach(token)
            except Exception:
                # The credential is intentionally retained for retry/startup.
                # Gateway exceptions are untrusted and may include the token
                # (or an upstream URL containing it).  This endpoint never
                # returns activation exception text.
                return web.json_response(
                    {**_payload(bot), "error": "Discord gateway activation failed"}, status=502
                )
            return web.json_response(_payload(bot))
