"""Lazy foreground authority facade; no desktop imports until session start."""
from __future__ import annotations

import asyncio
import contextvars
import hashlib
import json
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path

from ..tools.output_authorization import tool_scope_allows
from ..tools.result_validator import ToolResult
from .models import RequestContext

COMPUTER_TOOLS = frozenset({"computer_session", "computer_observe", "computer_act"})
NONVISUAL_OPERATIONS = frozenset({"stop", "cancel", "close", "status", "pause"})


@dataclass(frozen=True)
class ForegroundGrant:
    context: RequestContext
    conversation: str
    call_id: str
    tool_name: str
    task: object
    nonvisual_operation: str | None = None
    images: list[dict] = field(default_factory=list, compare=False)


_grant: contextvars.ContextVar[ForegroundGrant | None] = contextvars.ContextVar(
    "computer_foreground_grant", default=None)


def require_vision(serving) -> None:
    from .capabilities import native_transport_evidence

    try:
        native_transport_evidence(serving)
    except PermissionError:
        raise PermissionError("Computer use requires verified native vision transport.") from None


class ComputerIntegration:
    def __init__(self, bot, *, controller=None, settings=None):
        self.bot = bot
        # Config reload replaces the live object. Persistent paths and backend
        # attachment settings belong to this runtime generation, not the next one.
        self.settings = deepcopy(settings if settings is not None else bot.config.computer)
        self._owns_store = controller is None
        self._closed = False
        if controller is None:
            from .controller import ComputerController
            from .store import ComputerStore

            root = Path(self.settings.storage_dir).expanduser().absolute()
            store = ComputerStore(root / "state.sqlite3", root / "evidence")
            try:
                controller = ComputerController(store, self._backend, self._authorize, enabled=True)
            except BaseException:
                store.close()
                raise
        self.controller = controller

    @property
    def enabled(self):
        return not self._closed and bool(self.bot.config.computer.enabled)

    def reserves_tool(self, name):
        return self.enabled and name in COMPUTER_TOOLS

    def _backend(self, app):
        from .app_profiles import ATTACHED_NATIVE_PROFILES, validate_profile

        validate_profile(app, platform=getattr(self.settings, "platform", "x11"),
                         environment=getattr(self.settings, "environment", "isolated"))
        if getattr(self.settings, "platform", "x11") == "wayland":
            from .runtime.wayland_backend import WaylandRuntimeBackend, WaylandSessionConfig
            from .runtime.wayland_probe import GnomeSameStackQualifier

            return WaylandRuntimeBackend(
                enabled=self.enabled, app_profile=app,
                environment=self.settings.environment,
                config=WaylandSessionConfig(
                    bus_address=self.settings.wayland_bus_address,
                    expected_uid=self.settings.wayland_uid,
                    guardian_binary=self.settings.wayland_guardian_binary),
                qualify=GnomeSameStackQualifier())
        if getattr(self.settings, "environment", "isolated") == "existing_session":
            from .runtime.x11_attached import X11AttachedBackend

            return X11AttachedBackend(
                enabled=self.enabled, app_profile=app,
                display_name=self.settings.display, xauthority=self.settings.xauthority,
                monitor_names=self.settings.monitor_names,
                input_enabled=app in ATTACHED_NATIVE_PROFILES,
                runtime_sudo=bool(self.settings.runtime_sudo))
        from .runtime.backend import LinuxDesktopBackend

        return LinuxDesktopBackend(enabled=self.enabled, app_profile=app,
                                   runtime_sudo=bool(self.settings.runtime_sudo))

    def _authorize(self, context):
        if context.turn_id == "web-operator":
            from ..web.computer_binding import operator_context_authorized

            if not operator_context_authorized(context):
                return False
        manager = getattr(self.bot, "host_access_manager", None)
        if manager is None or not manager.is_host_allowed(context.owner_id, "localhost"):
            return False
        authorize_context = getattr(self.bot, "computer_authorize_context", None)
        if callable(authorize_context) and authorize_context(context) is not True:
            return False
        return all(not self.bot.tool_executor.check_permission(name, context.owner_id)
                   for name in COMPUTER_TOOLS)

    def _context(self, st):
        from .models import RequestContext

        owner = str(st.message.author.id)
        if owner != str(st.user_id) or not st._req_id:
            raise PermissionError("Missing authenticated foreground identity")
        if getattr(st.policy, "trajectory_source", None) != "discord":
            raise PermissionError("Background computer use is not authorized")
        surface, channel = "discord", str(st.message.channel.id)
        if getattr(st.message, "_odin_source", None) == "web":
            binding = getattr(st.message, "_computer_web_session_id", None)
            if not isinstance(binding, str) or not binding:
                raise PermissionError("Missing authenticated web session binding")
            surface, channel = "webui", self.web_binding(binding)
        return RequestContext(owner, channel, str(st._req_id), "localhost", surface=surface)

    @staticmethod
    def web_binding(binding):
        return "web:" + hashlib.sha256(binding.encode("utf-8")).hexdigest()

    @contextmanager
    def foreground(self, st, block):
        context = self._context(st)
        values = getattr(block, "input", None)
        operation = values.get("operation") if isinstance(values, dict) else None
        nonvisual = (block.name == "computer_session" and isinstance(operation, str)
                     and operation in NONVISUAL_OPERATIONS)
        if not nonvisual:
            require_vision(getattr(st, "_computer_serving", None))
        grant = ForegroundGrant(context, str(st.message.channel.id), str(block.id),
                                block.name, asyncio.current_task(),
                                operation if nonvisual else None)
        token = _grant.set(grant)
        try:
            yield
        finally:
            _grant.reset(token)

    def grant_allows(self, name, owner, channel):
        grant = _grant.get()
        return bool(grant is not None and grant.task is asyncio.current_task()
                    and grant.tool_name == name and grant.context.owner_id == str(owner)
                    and grant.conversation == str(channel) and tool_scope_allows(name)
                    and self.enabled and self._authorize(grant.context))

    async def _tool(self, name, values):
        grant = _grant.get()
        if grant is None or not self.grant_allows(name, grant.context.owner_id, grant.conversation):
            return ToolResult("Permission denied: no foreground computer grant.", ok=False,
                              error="permission_denied", tool_name=name)
        if (grant.nonvisual_operation is not None
                and (not isinstance(values, dict)
                     or values.get("operation") != grant.nonvisual_operation)):
            return ToolResult("Permission denied: computer operation changed.", ok=False,
                              error="permission_denied", tool_name=name)
        method = {"computer_session": self.controller.session,
                  "computer_observe": self.controller.observe,
                  "computer_act": self.controller.act}[name]
        try:
            result = await method(grant.context, values)
            if isinstance(result, dict) and "image_bytes" in result:
                from .models import ComputerError

                try:
                    image = self.output_image(result)
                except (ValueError, TypeError, KeyError):
                    raise ComputerError("invalid_observation_response") from None
                grant.images.append(image)
                return image
            unknown = isinstance(result, dict) and (
                result.get("status") == "unknown"
                or result.get("state") in {"unknown", "quarantined"}
                or (isinstance(result.get("cleanup"), dict)
                    and result["cleanup"].get("complete") is not True)
                or result.get("uncertain_outcome") is True)
            rejected = isinstance(result, dict) and result.get("status") in {
                "unavailable", "not_satisfied", "rejected", "failed",
            }
            return ToolResult(json.dumps(result, ensure_ascii=True), ok=not (unknown or rejected),
                              error=("outcome_unknown" if unknown else
                                     "computer_not_satisfied" if rejected else None),
                              uncertain_outcome=unknown, tool_name=name,
                              audit_metadata={"computer_call_id": grant.call_id,
                                              "computer_turn_id": grant.context.turn_id})
        except asyncio.CancelledError:
            await self.stop_context(grant.context)
            raise
        except Exception as exc:
            from .models import ComputerError

            if isinstance(exc, (ComputerError, PermissionError)):
                return ToolResult("Computer request rejected: " + str(exc), ok=False,
                                  error="computer_rejected", tool_name=name)
            await self.stop_context(grant.context)
            return ToolResult("Computer outcome unknown; reconcile with fresh evidence. "
                              "Do not replay.",
                              ok=False, error="outcome_unknown", uncertain_outcome=True,
                              tool_name=name)

    async def _handle_computer_session(self, values):
        return await self._tool("computer_session", values)

    async def _handle_computer_observe(self, values):
        return await self._tool("computer_observe", values)

    async def _handle_computer_act(self, values):
        return await self._tool("computer_act", values)

    async def validate_delivery(self, st, block, image):
        """Consume only this invocation's native image, never transcript evidence."""
        from .vision import VisionError, _validate_native_frame

        grant = _grant.get()
        if (grant is None or grant.nonvisual_operation is not None
                or grant.call_id != str(block.id)
                or grant.context != self._context(st)
                or not self.grant_allows(block.name, st.user_id, str(st.message.channel.id))
                or not any(image is issued for issued in grant.images)):
            raise VisionError("Computer observation delivery is not authorized")
        grant.images.clear()
        native = image.get("__image_block__")
        if (not isinstance(native, dict) or native.get("type") != "image"
                or "__computer_frame__" not in native
                or not isinstance(image.get("__prompt__"), str)
                or image.get("__computer_frame__") != native["__computer_frame__"]):
            raise VisionError("Invalid computer observation response")
        metadata = _validate_native_frame(native)
        await self.controller.validate_observation_delivery(
            grant.context, metadata, native["__computer_frame__"]["sha256"])

    @staticmethod
    def output_image(result):
        from .vision import FrameCrop, FrameMetadata, VisionError, observation_image

        # Render provenance comes from the capture adapter, never from comparing
        # frame/source dimensions (an overview may be downsampled, not cropped).
        values = dict(result["frame_metadata"])
        transform = values.pop("delivered_to_source")
        if values.get("crop") is not None:
            values["crop"] = FrameCrop(**values["crop"])
        values["resize_scale"] = tuple(values["resize_scale"])
        metadata = FrameMetadata(**values)
        source = result["source"]
        if (transform != metadata.delivered_to_source.public()
                or transform != result["delivered_to_source"]
                or any(getattr(metadata, key) != result[key] for key in (
                    "observation_id", "session_id", "generation", "captured_monotonic_ns",
                    "consent_generation", "width", "height"))
                or any(getattr(metadata, key) != source[key] for key in (
                    "source_id", "source_revision", "consent_generation"))
                or (metadata.source_width, metadata.source_height) != (
                    source["pixel_width"], source["pixel_height"])):
            raise VisionError("Observation render binding mismatch")
        image = observation_image(result["image_bytes"], metadata)
        public = {k: v for k, v in result.items() if k != "image_bytes"}
        image["__prompt__"] += "\n" + json.dumps(public, ensure_ascii=True)
        return image

    async def stop_context(self, context):
        await self.controller.session(context, {"operation": "stop"})

    async def finish_turn(self, st):
        return await self.controller.finish_turn(self._context(st))

    async def stop_channel(self, owner_id, channel_id):
        from .models import RequestContext

        await self.stop_context(RequestContext(str(owner_id), str(channel_id),
                                               "operator-stop", "localhost"))

    async def set_enabled(self, enabled):
        await self.controller.set_enabled(bool(enabled))

    async def close(self):
        if self._closed:
            return
        await self.controller.close()
        # Keep a failed cleanup's controller/evidence usable for emergency retry.
        # A manager must not replace it and lose the only owner of a live backend.
        if getattr(self.controller, "_live", None):
            raise RuntimeError("Computer cleanup incomplete; runtime retained")
        if self._owns_store:
            self.controller.store.close()
        self._closed = True

    def _operator_context(self, owner_id, web_session_id, *, emergency=False):
        from .models import RequestContext

        if ((not self.bot.config.computer.enabled and not emergency)
                or not owner_id or not web_session_id):
            raise PermissionError("Computer unavailable")
        context = RequestContext(str(owner_id), self.web_binding(web_session_id),
                                 "web-operator", "localhost", surface="webui")
        if not self._authorize(context):
            raise PermissionError("Computer unavailable")
        return context

    async def _operator_session(self, operation, *, owner_id, web_session_id):
        context = self._operator_context(owner_id, web_session_id,
                                         emergency=operation == "stop")
        result = await self.controller.operator_session(context, operation)
        return {**result, "available": True, "owner_id": owner_id}

    async def operator_status(self, **identity):
        return await self._operator_session("status", **identity)

    async def operator_stop(self, **identity):
        return await self._operator_session("stop", **identity)

    async def operator_pause(self, **identity):
        return await self._operator_session("pause", **identity)

    async def operator_observe(self, *, owner_id, web_session_id):
        # Operator capture needs a dedicated read-only controller API, never
        # fake an active foreground turn to bypass its generation/turn fence.
        context = self._operator_context(owner_id, web_session_id)
        return await self.controller.operator_observe(context)

    async def operator_evidence(self, *, owner_id, web_session_id, evidence_id):
        return await self.controller.read_evidence(
            self._operator_context(owner_id, web_session_id), evidence_id)

    async def operator_export(self, *, owner_id, web_session_id, name):
        context = self._operator_context(owner_id, web_session_id)
        return await self.controller.operator_export(context, name)

    async def operator_download(self, *, owner_id, web_session_id, artifact_id):
        return await self.operator_evidence(owner_id=owner_id, web_session_id=web_session_id,
                                            evidence_id=artifact_id)

    async def operator_recover(self, *, owner_id, web_session_id, session_id, generation):
        context = self._operator_context(owner_id, web_session_id, emergency=True)
        return await self.controller.reconcile_recovery(context, session_id, generation)

    async def operator_acknowledge_legacy(self, *, owner_id, web_session_id, session_id,
                                          generation, acknowledgment):
        context = self._operator_context(owner_id, web_session_id, emergency=True)
        return await self.controller.acknowledge_legacy_recovery(
            context, session_id, generation, acknowledgment)
