"""Admin-only managed-host inventory and enrollment control plane."""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any, cast

from aiohttp import web

from ...config import persistence as config_persistence
from ...config.persistence import DELETE_CONFIG_PATH, config_transaction
from ...config.schema import ToolHost
from ...tools.hosts import HostEnrollmentManager, HostTrustError
from ...tools.hosts.control import (
    fingerprint_public_key,
    public_key_info,
    scan_host_references,
)
from ..api_common import admin_gate


def _tool_host_dump(host: ToolHost) -> dict[str, Any]:
    return host.model_dump()


def _leaf_changes(before: dict[str, Any], after: dict[str, Any]) -> list:
    changes: list = []
    for alias in before.keys() - after.keys():
        changes.append((("tools", "hosts", alias), DELETE_CONFIG_PATH))
    for alias in after.keys() - before.keys():
        changes.append((("tools", "hosts", alias), after[alias]))
    for alias in before.keys() & after.keys():
        old, new = before[alias], after[alias]
        for field in old.keys() | new.keys():
            if field not in new:
                changes.append((("tools", "hosts", alias, field), DELETE_CONFIG_PATH))
            elif old.get(field) != new.get(field):
                changes.append((("tools", "hosts", alias, field), new[field]))
    return changes


async def _drain_host_mutation(operation, *, commit_started: asyncio.Event):
    """Cancel queued/preflight work; once persistence begins, drain publication."""
    task = asyncio.create_task(operation, name="host-management-mutation")
    cancelled = False
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            if not commit_started.is_set():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
                raise
            cancelled = True
            current = asyncio.current_task()
            if current is not None:
                while current.cancelling():
                    current.uncancel()
    result = await task
    if cancelled:
        raise asyncio.CancelledError
    return result


def register_hosts(routes: web.RouteTableDef, bot) -> None:
    require_admin = admin_gate(bot)
    registry = getattr(bot, "host_registry", None)
    enrollments = HostEnrollmentManager(registry) if registry is not None else None
    management_lock = asyncio.Lock()

    def denied(request: web.Request) -> web.Response | None:
        rejection = require_admin(request)
        if rejection is not None:
            return rejection
        if registry is None or enrollments is None:
            return web.json_response(
                {"error": "host registry not available"}, status=503
            )
        return None

    def manager() -> HostEnrollmentManager:
        return cast(HostEnrollmentManager, enrollments)

    def current() -> dict[str, dict[str, Any]]:
        return {name: _tool_host_dump(host) for name, host in bot.config.tools.hosts.items()}

    def response(alias: str, *, saved: bool = False, references=None) -> dict[str, Any]:
        row = next(
            (item for item in bot.host_registry.status_rows() if item["alias"] == alias), None
        )
        desired_key = bot.config.tools.ssh_key_path
        desired_known = bot.config.tools.ssh_known_hosts_path
        payload: dict[str, Any] = {
            "saved": saved,
            "active": bool(row and row["active"]),
            "targetable": bool(row and row["targetable"]),
            "trust_state": row["trust_state"] if row else "removed",
            "last_test": row["last_test"] if row else None,
            "draining": alias in bot.host_registry.draining_aliases(),
            "pending_references": references or [],
            "registry_generation": bot.host_registry.generation,
            "ssh_paths": {
                "desired_key": desired_key,
                "effective_key": bot.host_registry.effective_key_path,
                "desired_known_hosts": desired_known,
                "effective_known_hosts": bot.host_registry.effective_legacy_known_hosts_path,
                "restart_pending": (
                    desired_key != bot.host_registry.effective_key_path
                    or desired_known != bot.host_registry.effective_legacy_known_hosts_path
                ),
            },
        }
        if row:
            payload["host"] = row
        return payload

    async def audit(request: web.Request, action: str, alias: str, metadata: dict) -> None:
        logger = getattr(bot, "audit", None)
        if logger is None:
            return
        identity = getattr(request, "_api_identity", None)
        actor = getattr(identity, "user_id", "") or f"web:{getattr(request, '_session_id', '')}"
        await logger.log_event(
            event_type="host_management",
            action=action,
            actor=actor,
            detail=f"host {alias}: {metadata.get('result', '')}",
            metadata=metadata,
        )

    async def audit_candidate(
        request: web.Request, action: str, candidate, result: str
    ) -> None:
        await audit(
            request,
            action,
            candidate.alias,
            {
                "result": result,
                "alias": candidate.alias,
                "host_id": candidate.host_id,
                "new": {
                    "address": candidate.address,
                    "ssh_user": candidate.ssh_user,
                    "port": candidate.port,
                    "os": candidate.os,
                },
                "new_fingerprints": list(candidate.fingerprints),
                "trust_mode": candidate.trust_mode,
                "explicit_tofu": candidate.tofu_confirmed,
                "connection_test": candidate.test_result,
                "registry_generation": bot.host_registry.generation,
                "config_diff": [],
                "dependencies": [],
            },
        )

    async def publish_desired(
        request: web.Request,
        alias: str,
        desired: dict[str, dict[str, Any]],
        *,
        action: str,
        before: dict[str, dict[str, Any]],
        test_result: dict | None = None,
        trust_fingerprints: list[str] | None = None,
        commit_started: asyncio.Event | None = None,
    ) -> web.Response:
        changes = _leaf_changes(before, desired)
        desired_models = {name: ToolHost(**value) for name, value in desired.items()}
        try:
            staged = bot.host_registry.stage(
                desired_models, default_host=bot.config.tools.default_host
            )
        except Exception as exc:
            return web.json_response(
                {"error": f"host runtime preparation failed: {exc}"}, status=500
            )
        if commit_started is not None:
            commit_started.set()
        persist_exc, cancelled = await config_persistence.persist_config_paths_locked(changes)
        if persist_exc is not None:
            if cancelled:
                raise asyncio.CancelledError
            return web.json_response(
                {"error": f"host configuration not saved: {persist_exc}"}, status=500
            )
        bot.config.tools.hosts = desired_models
        bot.host_registry.publish_staged(staged)
        if test_result and alias in bot.config.tools.hosts:
            bot.host_registry.mark_test_result(alias, test_result)
        bot.prompt_builder.cached_hosts.clear()
        old = before.get(alias, {})
        new = desired.get(alias, {})
        diff_summary = [".".join(change[0]) for change in changes]
        request["_config_diff"] = "\n".join(diff_summary)
        metadata = {
            "result": "saved",
            "alias": alias,
            "host_id": new.get("host_id") or old.get("host_id", ""),
            "old": {k: old.get(k) for k in ("address", "ssh_user", "port", "os")},
            "new": {k: new.get(k) for k in ("address", "ssh_user", "port", "os")},
            "old_fingerprints": [
                fingerprint_public_key(key) for key in old.get("host_keys", [])
            ],
            "new_fingerprints": trust_fingerprints or [],
            "trust_mode": new.get("trust_mode", old.get("trust_mode", "legacy")),
            "explicit_tofu": new.get("trust_mode") == "tofu",
            "connection_test": test_result,
            "registry_generation": bot.host_registry.generation,
            "config_diff": diff_summary,
            "dependencies": [],
        }
        await audit(request, action, alias, metadata)
        payload = response(alias, saved=True)
        if cancelled:
            raise asyncio.CancelledError
        return web.json_response(payload, status=201 if action == "add" else 200)

    @routes.get("/api/hosts")
    async def list_hosts(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        return web.json_response(
            {
                "hosts": bot.host_registry.status_rows(),
                "default_host": bot.host_registry.default_host,
                "generation": bot.host_registry.generation,
                "tofu_enabled": bot.config.tools.allow_host_tofu,
            }
        )

    @routes.post("/api/hosts/settings")
    async def set_host_settings(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        allowed = {"default_host", "allow_host_tofu"}
        if not isinstance(body, dict) or not body or set(body) - allowed:
            return web.json_response(
                {"error": "only default_host and allow_host_tofu may be changed"},
                status=400,
            )
        default_host = body.get("default_host", bot.config.tools.default_host)
        allow_tofu = body.get("allow_host_tofu", bot.config.tools.allow_host_tofu)
        if not isinstance(default_host, str):
            return web.json_response({"error": "default_host must be a string"}, status=400)
        default_host = default_host.strip()
        if default_host and default_host not in bot.config.tools.hosts:
            return web.json_response(
                {"error": "default_host must name a configured host"}, status=400
            )
        if not isinstance(allow_tofu, bool):
            return web.json_response(
                {"error": "allow_host_tofu must be boolean"}, status=400
            )
        commit_started = asyncio.Event()

        async def operation():
            async with management_lock:
                async with config_transaction():
                    changes: list = []
                    if default_host != bot.config.tools.default_host:
                        changes.append((("tools", "default_host"), default_host))
                    if allow_tofu != bot.config.tools.allow_host_tofu:
                        changes.append((("tools", "allow_host_tofu"), allow_tofu))
                    staged = bot.host_registry.stage(
                        bot.config.tools.hosts, default_host=default_host
                    )
                    commit_started.set()
                    persist_exc, cancelled = await config_persistence.persist_config_paths_locked(
                        changes
                    )
                    if persist_exc is not None:
                        if cancelled:
                            raise asyncio.CancelledError
                        return web.json_response(
                            {"error": f"host settings not saved: {persist_exc}"}, status=500
                        )
                    old_default = bot.config.tools.default_host
                    old_tofu = bot.config.tools.allow_host_tofu
                    bot.config.tools.default_host = default_host
                    bot.config.tools.allow_host_tofu = allow_tofu
                    bot.host_registry.publish_staged(staged)
                    diff_summary = [".".join(change[0]) for change in changes]
                    request["_config_diff"] = "\n".join(diff_summary)
                    await audit(
                        request,
                        "settings",
                        default_host,
                        {
                            "result": "saved",
                            "old_default_host": old_default,
                            "new_default_host": default_host,
                            "old_allow_host_tofu": old_tofu,
                            "new_allow_host_tofu": allow_tofu,
                            "registry_generation": bot.host_registry.generation,
                            "config_diff": diff_summary,
                        },
                    )
                    payload = {
                        "saved": True,
                        "default_host": bot.host_registry.default_host,
                        "configured_default_host": default_host,
                        "tofu_enabled": allow_tofu,
                        "registry_generation": bot.host_registry.generation,
                    }
                    if cancelled:
                        raise asyncio.CancelledError
                    return web.json_response(payload)

        return await _drain_host_mutation(operation(), commit_started=commit_started)

    @routes.get("/api/hosts/public-key")
    async def get_public_key(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        try:
            info = await public_key_info(bot.host_registry.effective_key_path)
        except HostTrustError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        info["effective_key_path"] = bot.host_registry.effective_key_path
        info["desired_key_path"] = bot.config.tools.ssh_key_path
        return web.json_response(
            {
                **info,
                "restart_pending": (
                    info["effective_key_path"] != info["desired_key_path"]
                ),
            }
        )

    @routes.post("/api/hosts/candidates")
    async def prepare_candidate(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        try:
            body = await request.json()
            alias = str(body.get("alias", ""))
            existing = bot.config.tools.hosts.get(alias)
            candidate = await manager().prepare(
                alias,
                body,
                allow_tofu=bot.config.tools.allow_host_tofu,
                existing=existing,
            )
        except (HostTrustError, ValueError, TypeError) as exc:
            return web.json_response({"error": str(exc)}, status=400)
        await audit_candidate(request, "prepare", candidate, "candidate_prepared")
        return web.json_response(
            {
                "candidate_token": candidate.token,
                "alias": candidate.alias,
                "host_id": candidate.host_id,
                "fingerprints": candidate.fingerprints,
                "trust_mode": candidate.trust_mode,
                "tested": candidate.tested,
            },
            status=201,
        )

    @routes.post("/api/hosts/{alias}/import-legacy")
    async def import_legacy(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        alias = request.match_info["alias"]
        host = bot.config.tools.hosts.get(alias)
        if host is None:
            return web.json_response({"error": "host not found"}, status=404)
        try:
            candidate = await manager().import_legacy(alias, host)
        except HostTrustError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        await audit_candidate(request, "import_legacy", candidate, "candidate_prepared")
        return web.json_response(
            {
                "candidate_token": candidate.token,
                "fingerprints": candidate.fingerprints,
                "trust_mode": candidate.trust_mode,
            }
        )

    @routes.post("/api/hosts/candidates/{token}/test")
    async def test_candidate(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        try:
            candidate = await manager().test(request.match_info["token"])
        except HostTrustError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        await audit_candidate(
            request,
            "test_connection",
            candidate,
            "passed" if candidate.tested else "failed",
        )
        payload = {
            "candidate_token": candidate.token,
            "tested": candidate.tested,
            "last_test": candidate.test_result,
        }
        if not candidate.tested:
            # Use the already-sanitized diagnosis for generic API clients too.
            payload["error"] = (
                (candidate.test_result or {}).get("detail") or "connection test failed"
            )
        return web.json_response(
            payload,
            status=200 if candidate.tested else 424,
        )

    @routes.post("/api/hosts/candidates/{token}/commit")
    async def commit_candidate(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        try:
            candidate = manager().get(request.match_info["token"])
            if not candidate.tested:
                raise HostTrustError(
                    "candidate must pass the connection test before activation"
                )
            if candidate.trust_mode == "tofu" and not candidate.tofu_confirmed:
                raise HostTrustError(
                    "TOFU candidate requires a second confirmation bound to its exact fingerprints"
                )
        except HostTrustError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        commit_started = asyncio.Event()

        async def operation():
            async with management_lock:
                async with config_transaction():
                    before = current()
                    exists = candidate.alias in before
                    current_definition = (
                        tuple(sorted(before[candidate.alias].items())) if exists else None
                    )
                    if current_definition != candidate.expected_definition:
                        return web.json_response(
                            {"error": "host changed after this candidate was prepared"},
                            status=409,
                        )
                    desired = dict(before)
                    desired[candidate.alias] = candidate.as_tool_host().model_dump()
                    result = await publish_desired(
                        request,
                        candidate.alias,
                        desired,
                        action="edit" if exists else "add",
                        before=before,
                        test_result=candidate.test_result,
                        trust_fingerprints=list(candidate.fingerprints),
                        commit_started=commit_started,
                    )
                    if result.status < 400:
                        manager().discard(candidate.token)
                    return result

        return await _drain_host_mutation(operation(), commit_started=commit_started)

    @routes.post("/api/hosts/{alias}/enabled")
    async def set_host_enabled(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        alias = request.match_info["alias"]
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        if not isinstance(body.get("enabled"), bool):
            return web.json_response({"error": "enabled must be boolean"}, status=400)
        async with management_lock:
            async with config_transaction():
                before = current()
                if alias not in before:
                    return web.json_response({"error": "host not found"}, status=404)
                desired = dict(before)
                desired[alias] = {**desired[alias], "enabled": body["enabled"]}
                return await publish_desired(
                    request,
                    alias,
                    desired,
                    action="enable" if body["enabled"] else "disable",
                    before=before,
                )

    @routes.get("/api/hosts/{alias}/references")
    async def get_references(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        alias = request.match_info["alias"]
        if alias not in bot.config.tools.hosts:
            return web.json_response({"error": "host not found"}, status=404)
        return web.json_response({"alias": alias, "references": scan_host_references(bot, alias)})

    @routes.delete("/api/hosts/{alias}")
    async def delete_host(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        alias = request.match_info["alias"]
        async with management_lock:
            async with config_transaction():
                before = current()
                if alias not in before:
                    return web.json_response({"error": "host not found"}, status=404)
                references = scan_host_references(bot, alias)
                if references:
                    await audit(
                        request,
                        "remove",
                        alias,
                        {"result": "blocked", "dependencies": references},
                    )
                    return web.json_response(
                        {
                            **response(alias, references=references),
                            "error": "host deletion is blocked by configured references",
                        },
                        status=409,
                    )
                desired = dict(before)
                del desired[alias]
                return await publish_desired(
                    request, alias, desired, action="remove", before=before
                )

    @routes.post("/api/hosts/{alias}/force-revoke")
    async def force_revoke(request: web.Request) -> web.Response:
        if failure := denied(request):
            return failure
        alias = request.match_info["alias"]
        if alias not in bot.config.tools.hosts:
            return web.json_response({"error": "host not found"}, status=404)
        process_registry = getattr(bot.tool_executor, "_process_registry", None)
        process_result = (
            await process_registry.force_revoke_host(alias)
            if process_registry is not None
            else {"attempted": 0, "unknown": 0}
        )
        revoked_generations = bot.host_registry.force_revoke_keys(alias)
        interrupted = len(revoked_generations)
        await audit(
            request,
            "force_revoke",
            alias,
            {
                "result": "revoked",
                "leases_interrupted": interrupted,
                "remote_processes": process_result,
                "remote_outcome": (
                    "unknown"
                    if interrupted or process_result.get("unknown")
                    else "none"
                ),
                "revoked_generations": list(revoked_generations),
                "registry_generation": bot.host_registry.generation,
            },
        )
        return web.json_response(
            {
                **response(alias),
                "leases_interrupted": interrupted,
                "remote_processes": process_result,
            }
        )
