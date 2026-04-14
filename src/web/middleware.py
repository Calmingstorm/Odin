"""Web middleware for Odin dashboard."""

from __future__ import annotations

import logging
import time

from aiohttp import web

logger = logging.getLogger("odin.web")


@web.middleware
async def request_logger(request: web.Request, handler):
    """Log request method, path, and response time."""
    start = time.monotonic()
    try:
        response = await handler(request)
        elapsed = (time.monotonic() - start) * 1000
        logger.info(
            "%s %s → %s (%.1fms)",
            request.method,
            request.path,
            response.status,
            elapsed,
        )
        return response
    except web.HTTPException as exc:
        elapsed = (time.monotonic() - start) * 1000
        logger.info(
            "%s %s → %s (%.1fms)",
            request.method,
            request.path,
            exc.status,
            elapsed,
        )
        raise


@web.middleware
async def error_handler(request: web.Request, handler):
    """Catch unhandled exceptions and return JSON errors."""
    try:
        return await handler(request)
    except web.HTTPException:
        raise
    except Exception:
        logger.exception("Unhandled error in %s %s", request.method, request.path)
        return web.json_response(
            {"error": "Internal server error"},
            status=500,
        )
