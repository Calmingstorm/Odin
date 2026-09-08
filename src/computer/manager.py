"""Lazy process lifecycle. Disabled boot opens no desktop state."""

from __future__ import annotations

import asyncio
import contextvars
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from ..config.persistence import config_transaction, persist_config_paths_locked
from .provisioning import ComputerProvisioningError, provision_storage

_TOOLS = frozenset({"computer_session", "computer_observe", "computer_act"})
_binding: contextvars.ContextVar[tuple | None] = contextvars.ContextVar(
    "computer_lifecycle_binding", default=None
)


class ComputerLifecycle:
    def __init__(self, bot, *, factory=None, persist=None):
        self.bot = bot
        self.settings = bot.config.computer.model_copy(deep=True)
        self._factory = factory
        self._persist = persist or persist_config_paths_locked
        self._service: Any = None
        self._active = False
        self._closing = False
        self.generation = 0
        self.error = ""
        self._web_grants = {}
        self._watchers = {}
        self._inflight = set()
        self._janitor = None
        self._selected_storage = None

    @property
    def enabled(self):
        return bool(self._active and not self._closing and self.bot.config.computer.enabled)

    def reserves_tool(self, name):
        return bool(self.bot.config.computer.enabled and name in _TOOLS)

    def _invalidate(self):
        catalog = getattr(self.bot, "tool_catalog", None)
        if catalog is not None:
            catalog.invalidate()

    def _construct(self):
        from ..tools.defs.computer import assert_no_computer_collisions

        skills = getattr(self.bot, "skill_manager", None)
        mcp = getattr(self.bot, "mcp_manager", None)
        assert_no_computer_collisions(
            skills.get_tool_definitions() if skills is not None else [],
            mcp.get_tool_definitions() if mcp is not None else [],
        )
        settings = self.settings
        if settings.platform == "wayland" and (
            settings.environment != "existing_session"
            or not settings.wayland_bus_address
            or settings.wayland_uid is None
        ):
            raise ValueError("Wayland needs an explicit existing session bus and desktop UID")
        if (
            settings.platform == "x11"
            and settings.environment == "existing_session"
            and (not settings.display or not settings.monitor_names)
        ):
            raise ValueError("Existing-session capture needs explicit display and monitor names")
        root = provision_storage(settings)
        self._selected_storage = str(root)
        if (self._selected_storage != settings.storage_dir
                and self.bot.config.computer.storage_dir != settings.storage_dir):
            # A deferred operator edit takes precedence over automatic selection;
            # never overwrite it while constructing from our startup snapshot.
            raise ComputerProvisioningError("storage_selection_required")
        factory = self._factory
        if factory is None:
            if settings.platform == "wayland":
                import importlib.util

                if importlib.util.find_spec("dbus_next") is None:
                    raise ValueError("Wayland session-bus dependency unavailable")
                # No bus connection, capture, consent prompt or input probe at
                # Enable. Per-session qualification belongs to backend.start().
            elif settings.environment == "isolated":
                from .runtime.profile import preflight

                preflight()
            else:
                import importlib.util

                if importlib.util.find_spec("Xlib") is None:
                    raise ValueError("X11 capture dependency unavailable")
            from .integration import ComputerIntegration

            factory = ComputerIntegration
        return factory(self.bot, settings=settings.model_copy(
            deep=True, update={"enabled": True, "storage_dir": str(root)}))

    def _storage_changes(self):
        if self._selected_storage != self.settings.storage_dir:
            return [(("computer", "storage_dir"), self._selected_storage)]
        return []

    def _publish_storage(self, config):
        if self._storage_changes():
            config.computer.storage_dir = self._selected_storage
            self.settings.storage_dir = self._selected_storage

    async def start(self):
        if not self.bot.config.computer.enabled or self._active:
            return
        async with config_transaction():
            if self._active or not self.bot.config.computer.enabled:
                return
            if self._closing or self._service is not None:
                raise RuntimeError("Computer lifecycle unavailable for startup")
            try:
                self._service = self._construct()
                if self._storage_changes():
                    try:
                        exc, cancelled = await self._persist(self._storage_changes())
                    except BaseException:
                        await self._settle(self._discard())
                        raise
                    if exc is not None:
                        await self._discard()
                        raise RuntimeError("Computer storage selection was not saved") from exc
                    config = self.bot.config.model_copy(deep=True)
                    self._publish_storage(config)
                    self.bot.config = config
                    if cancelled:
                        await self._discard()
                        raise asyncio.CancelledError
            except Exception:
                self.error = "startup_failed"
                self._invalidate()
                raise
            self.generation += 1
            self._active = True
            self.error = ""
            self._invalidate()
            try:
                self._start_janitor()
            except Exception:
                self._active = False
                self.error = "evidence_cleanup_failed"
                self._invalidate()
                await self._discard()
                raise

    async def _discard(self):
        if self._service is not None:
            try:
                await self._service.set_enabled(False)
                if self._inflight:
                    _, remaining = await asyncio.wait(tuple(self._inflight), timeout=3)
                    if remaining:
                        raise RuntimeError("Computer operations have not settled")
                if self._janitor is not None:
                    self._janitor.cancel()
                    await asyncio.gather(self._janitor, return_exceptions=True)
                    self._janitor = None
                watchers = tuple(self._watchers.values())
                for task in watchers:
                    task.cancel()
                await asyncio.gather(*watchers, return_exceptions=True)
                self._watchers.clear()
                self._web_grants.clear()
                store = getattr(self._service.controller, "store", None)
                if store is not None:
                    store.purge_evidence()
                await self._service.close()
            except BaseException:
                self.error = "cleanup_unverified"
                raise
            self._service = None

    def _start_janitor(self, *, already_pruned=False):
        store = getattr(self._service.controller, "store", None)
        if store is None:
            return
        if not already_pruned:
            store.prune()

        async def sweep():
            while True:
                await asyncio.sleep(1)
                try:
                    store.prune()
                except Exception:
                    self._active = False
                    self.error = "evidence_cleanup_failed"
                    self._invalidate()
                    await self._service.set_enabled(False)
                    return

        self._janitor = asyncio.create_task(sweep(), name="computer-evidence-expiry")

    @staticmethod
    def _prune_candidate(candidate):
        """Initial retention validation is part of preflight, before enabling is saved."""
        store = getattr(candidate.controller, "store", None)
        if store is not None:
            store.prune()

    @staticmethod
    async def _settle(operation):
        task = asyncio.create_task(operation)
        cancelled = False
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                cancelled = True
        result = task.result()
        if cancelled:
            raise asyncio.CancelledError
        return result

    async def set_enabled(self, enabled):
        if type(enabled) is not bool:
            raise ValueError("enabled must be a boolean")
        await self._settle(self._change_enabled(enabled))

    async def _change_enabled(self, enabled):
        async with config_transaction():
            if self._closing:
                raise RuntimeError("Computer lifecycle closing")
            if enabled and self.enabled:
                return
            if enabled:
                if self._service is not None:
                    raise RuntimeError("Previous desktop cleanup remains unverified")
                try:
                    candidate = self._construct()
                except Exception:
                    self.error = "enable_preflight_failed"
                    raise
                try:
                    self._prune_candidate(candidate)
                except Exception:
                    self._service = candidate
                    self.error = "evidence_cleanup_failed"
                    await self._discard()
                    raise
                exc, cancelled = await self._persist(
                    [(("computer", "enabled"), True), *self._storage_changes()])
                if exc is not None:
                    self._service = candidate
                    await self._discard()
                    self.error = "enable_not_saved"
                    raise RuntimeError("Computer enable was not saved") from exc
                config = self.bot.config.model_copy(deep=True)
                config.computer.enabled = True
                self._publish_storage(config)
                self.bot.config = config
                self._service = candidate
                self._active = not self._closing
                self.generation += 1
                self.error = ""
                self._invalidate()
                if self._closing:
                    await self._discard()
                else:
                    try:
                        self._start_janitor(already_pruned=True)
                    except Exception:
                        self._active = False
                        self.error = "evidence_cleanup_failed"
                        self._invalidate()
                        await self._discard()
                        raise
            else:
                self._active = False
                self.generation += 1
                self._invalidate()
                cleanup_error = None
                try:
                    await self._discard()
                except Exception as failure:
                    cleanup_error = failure
                exc, cancelled = await self._persist([(("computer", "enabled"), False)])
                if exc is None:
                    config = self.bot.config.model_copy(deep=True)
                    config.computer.enabled = False
                    self.bot.config = config
                elif cleanup_error is None:
                    self.error = "disable_not_saved"
                self._invalidate()
                if cleanup_error is not None:
                    raise RuntimeError("Computer revoked but cleanup unverified") from cleanup_error
                if exc is not None:
                    raise RuntimeError("Computer revoked but disable not saved") from exc
                self.error = ""
            if cancelled:
                raise asyncio.CancelledError

    async def close(self):
        self._closing = True
        self._active = False
        self.generation += 1
        self._invalidate()

        async def cleanup():
            async with config_transaction():
                await self._discard()

        await self._settle(cleanup())

    def snapshot(self):
        from .app_profiles import ISOLATED_PROFILES, application_profile

        desired = self.bot.config.computer
        restart = [
            name
            for name, value in self.settings.model_dump().items()
            if name != "enabled" and getattr(desired, name) != value
        ]
        # Pure declarations: do not open a display or probe application processes
        # from operator status, including disabled startup. Eligibility is not
        # installation, focus, task authorization or measured input readiness.
        attached = self.settings.environment == "existing_session"
        profiles = () if attached else ISOLATED_PROFILES
        applications = []
        for app in sorted(profiles):
            profile = application_profile(
                app, platform=self.settings.platform, environment=self.settings.environment
            )
            if profile is not None:
                applications.append(profile)
        return {
            "enabled": self.enabled,
            "configured_enabled": bool(desired.enabled),
            "runtime_enabled": self.enabled,
            "generation": self.generation,
            "restart_required": restart,
            "error": self.error,
            "available": self.enabled,
            "application_profiles": applications,
            "state": "quarantined" if self._service is not None and self.error else "unavailable",
            "backend": {
                "platform": self.settings.platform,
                "environment": self.settings.environment,
                "input_supported": None,
                "readiness": "not_checked",
            },
        }

    @contextmanager
    def foreground(self, st, block):
        if not self.enabled or self._service is None:
            raise PermissionError("Computer lifecycle unavailable")
        service = self._service
        context = service._context(st)
        key = (context.owner_id, context.channel_id, context.turn_id)
        if getattr(st.message, "_odin_source", None) == "web":
            check = getattr(st.message, "_computer_web_authorized", None)
            if not callable(check) or check() is not True:
                raise PermissionError("Authenticated browser session required")
            self._web_grants[key] = check
        if key not in self._watchers:
            self._watchers[key] = asyncio.create_task(
                self._watch_authority(service, st, key, context)
            )
        token = _binding.set((self, service, self.generation))
        try:
            with service.foreground(st, block):
                yield
        finally:
            _binding.reset(token)

    def _bound(self):
        binding = _binding.get()
        if (
            not self.enabled
            or binding is None
            or binding[0] is not self
            or binding[1] is not self._service
            or binding[2] != self.generation
        ):
            raise PermissionError("Computer lifecycle generation revoked")
        return binding[1]

    def grant_allows(self, name, owner, channel):
        try:
            return self._bound().grant_allows(name, owner, channel)
        except PermissionError:
            return False

    async def _handle_computer_session(self, values):
        return await self._invoke("_handle_computer_session", values)

    async def _handle_computer_observe(self, values):
        return await self._invoke("_handle_computer_observe", values)

    async def _handle_computer_act(self, values):
        return await self._invoke("_handle_computer_act", values)

    async def _invoke(self, method, values):
        service = self._bound()
        done = asyncio.get_running_loop().create_future()
        self._inflight.add(done)
        try:
            return await getattr(service, method)(values)
        finally:
            self._inflight.discard(done)
            done.set_result(None)

    async def validate_delivery(self, st, block, image):
        return await self._bound().validate_delivery(st, block, image)

    async def finish_turn(self, st):
        if self._service is not None:
            try:
                await self._service.finish_turn(st)
            finally:
                for key in list(self._watchers):
                    if key[0] == str(st.user_id) and key[2] == str(st._req_id):
                        self._web_grants.pop(key, None)
                        task = self._watchers.pop(key, None)
                        if task is not None and task is not asyncio.current_task():
                            task.cancel()
                            await asyncio.gather(task, return_exceptions=True)

    def authorize_context(self, context):
        if context.turn_id == "web-operator":
            from ..web.computer_binding import operator_context_authorized

            return operator_context_authorized(context)
        if not self.enabled:
            return False
        if context.surface != "webui":
            return True
        check = self._web_grants.get((context.owner_id, context.channel_id, context.turn_id))
        try:
            return bool(check is not None and check() is True)
        except Exception:
            return False

    async def _watch_authority(self, service, st, key, context):
        try:
            while self.enabled and service is self._service:
                await asyncio.sleep(0.25)
                try:
                    valid = service._authorize(context) is True
                except Exception:
                    valid = False
                if not valid:
                    self._web_grants.pop(key, None)
                    result = await service.finish_turn(st)
                    if isinstance(result, dict) and (
                        result.get("state") == "quarantined"
                        or (
                            isinstance(result.get("cleanup"), dict)
                            and result["cleanup"].get("complete") is not True
                        )
                    ):
                        self.error = "authority_cleanup_unverified"
                        self._active = False
                        self._invalidate()
                        # Retain the controller for explicit emergency cleanup,
                        # and stop its own authority/heartbeats wherever possible.
                        await service.set_enabled(False)
                    return
        except Exception:
            self.error = "authority_cleanup_unverified"
            self._active = False
            self._invalidate()
            # Hiding the catalogue is not backend revocation. A failed turn
            # cleanup must still fence the controller and stop its live owners.
            try:
                await service.set_enabled(False)
            except Exception:
                pass  # Retain the service and diagnostic for emergency retry.
        finally:
            self._watchers.pop(key, None)

    async def stop_channel(self, owner_id, channel_id):
        if self._service is not None:
            return await self._service.stop_channel(owner_id, channel_id)

    async def _operator(self, method, **identity):
        done = asyncio.get_running_loop().create_future()
        self._inflight.add(done)
        try:
            return await self._operator_inner(method, **identity)
        finally:
            self._inflight.discard(done)
            done.set_result(None)

    async def _operator_inner(self, method, **identity):
        request_started = datetime.now(UTC).isoformat()
        service = self._service
        if service is None:
            if method in {"status", "stop", "pause"}:
                return self.snapshot()
            raise PermissionError("Computer unavailable")
        if not self.enabled and method not in {
            "status",
            "stop",
            "pause",
            "recover",
            "reconcile",
            "acknowledge_legacy",
        }:
            raise PermissionError("Computer unavailable")
        if not self.enabled and method == "pause":
            # Failed cleanup stays inspectable without reviving input authority.
            return self.snapshot()
        try:
            value = await getattr(service, "operator_" + method)(**identity)
        except Exception as error:
            from .models import ComputerError

            if (
                isinstance(error, ComputerError)
                and str(error) == "not_found"
                and method in {"status", "stop", "pause"}
            ):
                return self.snapshot()
            raise
        if method in {"status", "stop", "pause", "recover", "reconcile", "acknowledge_legacy"}:
            result = {**self.snapshot(), **value}
            result["session_generation"] = value.get("generation")
            result["generation"] = self.generation
            result["available"] = self.enabled
            capabilities = value.get("backend_capabilities")
            if isinstance(capabilities, dict):
                input_supported = value.get("input_supported")
                live = getattr(service.controller, "_live", {}).get(value.get("session_id"))
                if live is not None and live.observations and "input_readiness" not in value:
                    latest = next(reversed(live.observations.values()))
                    input_supported = bool(latest.scope.input_sources)
                    if capabilities.get("environment") == "existing_session":
                        input_supported = bool(
                            input_supported
                            and all(
                                capabilities.get(k) == "verified"
                                for k in ("owned_input_release", "application_preserving_detach")
                            )
                        )
                result["backend"] = {
                    "platform": capabilities.get("platform"),
                    "environment": capabilities.get("environment"),
                    "input_supported": input_supported,
                    "readiness": value.get("input_readiness", "session_capabilities"),
                    "input_blocker": value.get("input_blocker"),
                }
            if value.get("state") == "quarantined":
                result["backend"] = {
                    **result["backend"],
                    "input_supported": False,
                    "readiness": "inactive",
                    "input_blocker": "session_not_active",
                }
            return result
        if method == "observe" and "image_bytes" in value:
            _, metadata = await service.controller.read_evidence(
                service._operator_context(**identity), value["evidence_id"]
            )
            return {
                "frame": {
                    "evidence_id": value["evidence_id"],
                    "captured_at": request_started,
                    "timestamp_basis": "request_start_lower_bound",
                    "expires_at": self._iso(metadata["expires_at"]),
                    "fresh_for_ms": 5000,
                }
            }
        if method in {"evidence", "download"} and isinstance(value, tuple):
            data, metadata = value
            return {
                "data": data,
                "expires_at": self._iso(metadata["expires_at"]),
                "content_type": "image/png"
                if data.startswith(b"\x89PNG")
                else "image/jpeg"
                if data.startswith(b"\xff\xd8\xff")
                else "application/octet-stream",
            }
        if method == "export" and isinstance(value, dict):
            return {**value, "expires_at": self._iso(value["expires_at"])}
        return value

    @staticmethod
    def _iso(value):
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, UTC).isoformat()
        return value

    async def operator_status(self, **identity):
        return await self._operator("status", **identity)

    async def operator_stop(self, **identity):
        return await self._operator("stop", **identity)

    async def operator_pause(self, **identity):
        return await self._operator("pause", **identity)

    async def operator_observe(self, **identity):
        return await self._operator("observe", **identity)

    async def operator_evidence(self, **identity):
        return await self._operator("evidence", **identity)

    async def operator_export(self, **identity):
        return await self._operator("export", **identity)

    async def operator_download(self, **identity):
        return await self._operator("download", **identity)

    async def operator_recover(self, **identity):
        return await self._operator("recover", **identity)

    async def operator_reconcile(self, **identity):
        return await self._operator("reconcile", **identity)

    async def operator_acknowledge_legacy(self, **identity):
        return await self._operator("acknowledge_legacy", **identity)
