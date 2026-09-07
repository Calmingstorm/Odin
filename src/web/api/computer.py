"""Authenticated operator API; no implicit captures or desktop initialization."""
from __future__ import annotations

import re
from datetime import UTC, datetime

from aiohttp import web

from ..api_common import admin_gate
from ..computer_binding import operator_binding, operator_scope

_OPAQUE = re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_. -]{0,99}\Z")
_PRIVATE = {
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


class _AuthorizedResponse(web.Response):
    """Fence after async prepare hooks and immediately before writing the body."""

    async def _write_headers(self):
        if not self._computer_current():
            self._set_status(404, "Not Found")
            self.body = b'{"error":"Not found or no longer authorized"}'
            self._compressed_body = None
            for key in ("Content-Encoding", "Content-Disposition", "Content-Type"):
                self.headers.pop(key, None)
            self.headers["Content-Type"] = "application/json"
            self.headers["Content-Length"] = str(len(self.body))
            self._payload_writer.length = len(self.body)
            self._computer_denied = True
        await super()._write_headers()

    async def write_eof(self, data=b""):
        if not getattr(self, "_computer_denied", False) and not self._computer_current():
            if self._req is not None and self._req.transport is not None:
                self._req.transport.close()
            return
        await super().write_eof(data)


def _expiry(value):
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if stamp.tzinfo is None or stamp <= datetime.now(UTC):
            raise ValueError
    except (AttributeError, TypeError, ValueError):
        raise TimeoutError from None
    return value


def _opaque(value):
    if not isinstance(value, str) or not _OPAQUE.fullmatch(value):
        raise ValueError
    return value


def register_computer(routes: web.RouteTableDef, bot) -> None:
    """Controller atomically fences owner/session on every call and readback.

    Raw web_session_id may be a bearer secret. Never log or return it. Stop and
    pause must revoke input before cleanup, independent of model/action locks.
    """
    require_admin = admin_gate(bot)

    def authenticate(request):
        identity = getattr(request, "_api_identity", None)
        if identity is None or "token" in request.query:
            raise web.HTTPUnauthorized(headers=_PRIVATE)
        if require_admin(request) is not None or getattr(identity, "tier", None) != "admin":
            raise web.HTTPForbidden(headers=_PRIVATE)
        if not getattr(identity, "user_id", None) or not getattr(request, "_session_id", None):
            raise web.HTTPUnauthorized(headers=_PRIVATE)
        binding = request.get("computer_operator_binding")
        if binding is None or binding[2]() is not True:
            raise PermissionError
        return {"owner_id": binding[0], "web_session_id": binding[1]}

    def context(request, emergency=False):
        actor = authenticate(request)
        if not emergency and not getattr(getattr(bot.config, "computer", None), "enabled", False):
            raise web.HTTPServiceUnavailable(text="Computer use is unavailable", headers=_PRIVATE)
        service = getattr(bot, "computer", None)
        if service is None:
            raise web.HTTPServiceUnavailable(text="Computer use is unavailable", headers=_PRIVATE)
        return service, actor

    async def call(request, method, **kwargs):
        service, actor = context(request, emergency=method in {
            "status", "stop", "pause", "recover", "acknowledge_legacy"})
        adapter = getattr(service, f"operator_{method}", None)
        if adapter is None:
            raise web.HTTPServiceUnavailable(headers=_PRIVATE)
        result = await adapter(**actor, **kwargs)
        authenticate(request)
        return result, actor

    async def guarded(request, operation):
        try:
            return await operation(request)
        except web.HTTPException:
            raise
        except (PermissionError, FileNotFoundError):
            message, code = "Not found or no longer authorized", 404
        except TimeoutError:
            message, code = "Evidence or artifact expired", 410
        except (ValueError, TypeError, KeyError):
            message, code = "Invalid computer request or response", 400
        except Exception:
            message, code = "Computer operation unavailable; outcome unknown. Refresh status.", 409
        return web.json_response({"error": message}, status=code, headers=_PRIVATE)

    def status_json(value, actor):
        if value.get("owner_id") not in (None, "", actor["owner_id"]):
            raise PermissionError
        state = value.get("state", "unknown")
        known = {
            "starting", "active", "paused", "cancelled", "closed",
            "quarantined", "unknown", "unavailable",
        }
        result = {
            "available": bool(value.get("available", True)),
            "state": state if state in known else "unknown",
        }
        for key in ("owner_id", "session_id", "app", "last_action", "last_verification"):
            item = value.get(key) or ""
            if not isinstance(item, str):
                raise ValueError
            result[key] = item[:160]
        for key in ("enabled", "configured_enabled", "runtime_enabled"):
            if type(value.get(key)) is bool:
                result[key] = value[key]
        if type(value.get("generation")) is int:
            result["generation"] = value["generation"]
        if type(value.get("session_generation")) is int:
            result["session_generation"] = value["session_generation"]
        restart = value.get("restart_required")
        if isinstance(restart, list) and all(isinstance(k, str) for k in restart):
            result["restart_required"] = [k[:64] for k in restart[:16]]
        backend = value.get("backend")
        if isinstance(backend, dict):
            result["backend"] = {
                "platform": backend.get("platform") if backend.get("platform") in {
                    "x11", "wayland"} else "unknown",
                "environment": backend.get("environment") if backend.get("environment") in {
                    "isolated", "existing_session"} else "unknown",
                "input_supported": backend.get("input_supported") if type(
                    backend.get("input_supported")) is bool else None,
                "readiness": str(backend.get("readiness", "not_checked"))[:64],
            }
        if isinstance(value.get("error"), str):
            result["error"] = value["error"][:120]
        recovery = value.get("recovery")
        if isinstance(recovery, dict):
            statuses = {"operator_reconciliation_required", "operator_cleanup_required", "unknown",
                        "absence_verified", "operator_acknowledged_unverified"}
            reasons = {"controller_lost", "legacy_runtime_identity_missing", "host_rebooted",
                       "launch_identity_incomplete", "owned_process_remaining",
                       "owned_process_group_remaining", "process_inspection_unavailable",
                       "unit_absence_unproven", "cgroup_absence_unproven",
                       "owned_input_release_unproven", "owned_runtime_gone",
                       "inspection_unavailable", "inspection_timeout"}
            result["recovery"] = {
                "status": (recovery.get("status")
                           if recovery.get("status") in statuses else "unknown"),
                "reason": (recovery.get("reason")
                           if recovery.get("reason") in reasons else "unknown"),
                "complete": recovery.get("complete") is True,
            }
        return web.json_response(result, headers=_PRIVATE)

    async def status(request):
        value, actor = await call(request, "status")
        return status_json(value, actor)

    async def stop(request):
        value, actor = await call(request, "stop")
        # Safety stop bypasses enabled only, never credentials/scopes; no data.
        status_json(value, actor)
        state = value.get("state")
        return web.json_response({"state": state if state in {
            "cancelled", "closed", "quarantined"} else "unknown"}, headers=_PRIVATE)

    async def pause(request):
        value, actor = await call(request, "pause")
        return status_json(value, actor)

    async def observe(request):
        value, _ = await call(request, "observe")
        frame = value.get("frame")
        if not isinstance(frame, dict):
            raise ValueError
        return web.json_response({"frame": {
            "evidence_id": _opaque(frame.get("evidence_id")),
            "captured_at": str(frame.get("captured_at", ""))[:64],
            "timestamp_basis": str(frame.get("timestamp_basis", "unavailable"))[:64],
            "expires_at": _expiry(frame.get("expires_at")),
            "fresh_for_ms": max(0, min(10000, int(frame.get("fresh_for_ms", 0)))),
        }}, headers=_PRIVATE)

    async def export(request):
        context(request)
        if request.content_length is None or request.content_length > 1024:
            raise ValueError
        body = await request.json()
        if not isinstance(body, dict) or set(body) != {"name"}:
            raise ValueError
        name = body["name"]
        if not isinstance(name, str) or not _NAME.fullmatch(name) or name.endswith((" ", ".")):
            raise ValueError
        value, _ = await call(request, "export", name=name)
        return web.json_response({
            "artifact_id": _opaque(value.get("artifact_id")),
            "name": name, "expires_at": _expiry(value.get("expires_at")),
        }, headers=_PRIVATE)

    async def binary(request, kind):
        context(request)
        identifier = _opaque(request.match_info["id"])
        key = "evidence_id" if kind == "evidence" else "artifact_id"
        value, _ = await call(request, kind, **{key: identifier})
        _expiry(value.get("expires_at"))
        data = value.get("data")
        limit = 2 * 1024 * 1024 if kind == "evidence" else 16 * 1024 * 1024
        if not isinstance(data, bytes) or not data or len(data) > limit:
            raise ValueError
        headers = dict(_PRIVATE)
        if kind == "evidence":
            mime = value.get("content_type")
            if mime not in {"image/png", "image/jpeg"}:
                raise ValueError
            signature = b"\x89PNG\r\n\x1a\n" if mime == "image/png" else b"\xff\xd8\xff"
            if not data.startswith(signature):
                raise ValueError
        else:
            mime = "application/octet-stream"
            headers["Content-Disposition"] = 'attachment; filename="computer-export"'
            headers["Content-Security-Policy"] = "sandbox; default-src 'none'"
        return web.Response(body=data, content_type=mime, headers=headers)

    async def evidence(request):
        return await binary(request, "evidence")

    async def download(request):
        return await binary(request, "download")

    async def enabled(request):
        authenticate(request)
        if request.content_length is None or request.content_length > 128:
            raise ValueError
        body = await request.json()
        if (not isinstance(body, dict) or set(body) != {"enabled"}
                or type(body["enabled"]) is not bool):
            raise ValueError
        authenticate(request)
        # Composition root owns transactional persistence and lifecycle. This
        # hook must collision-preflight before persist, revoke before disable,
        # publish config + catalog atomically, and finish publication on cancel.
        # Do NOT fall back to a plain config write or create a desktop here.
        toggle = getattr(bot, "computer_set_enabled", None)
        if toggle is None:
            raise web.HTTPServiceUnavailable(
                text="Computer lifecycle control is unavailable", headers=_PRIVATE,
            )
        await toggle(body["enabled"])
        authenticate(request)
        return web.json_response({"enabled": bool(bot.config.computer.enabled)}, headers=_PRIVATE)

    async def recovery(request, *, acknowledge=False):
        authenticate(request)
        if request.content_length is None or request.content_length > 512:
            raise ValueError
        body = await request.json()
        keys = {"session_id", "generation"} | ({"acknowledgment"} if acknowledge else set())
        if not isinstance(body, dict) or set(body) != keys:
            raise ValueError
        _opaque(body["session_id"])
        if type(body["generation"]) is not int or body["generation"] < 0:
            raise ValueError
        if acknowledge and body["acknowledgment"] != (
                "ACKNOWLEDGE UNVERIFIED CLEANUP " + body["session_id"]):
            raise ValueError
        value, actor = await call(request, "acknowledge_legacy" if acknowledge else "recover",
                                  **body)
        return status_json(value, actor)

    async def acknowledge_legacy(request):
        return await recovery(request, acknowledge=True)

    for method, path, handler in (
        ("GET", "/api/computer", status),
        ("POST", "/api/computer/stop", stop),
        ("POST", "/api/computer/pause", pause),
        ("POST", "/api/computer/observe", observe),
        ("GET", "/api/computer/evidence/{id}", evidence),
        ("POST", "/api/computer/export", export),
        ("GET", "/api/computer/download/{id}", download),
        ("POST", "/api/computer/enabled", enabled),
        ("POST", "/api/computer/recover", recovery),
        ("POST", "/api/computer/acknowledge_legacy", acknowledge_legacy),
    ):
        async def wrapped(request, operation=handler):
            binding = operator_binding(bot, request)
            request["computer_operator_binding"] = binding
            if binding is None:
                return await guarded(request, operation)
            with operator_scope(binding):
                response = await guarded(request, operation)
            fenced = _AuthorizedResponse(body=response.body, status=response.status,
                                         headers=response.headers)
            fenced._computer_current = binding[2]
            return fenced

        routes.route(method, path)(wrapped)
