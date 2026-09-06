"""Lazy foreground authority facade; no desktop imports until session start."""
from __future__ import annotations

import asyncio
import contextvars
import hashlib
import json
from contextlib import contextmanager
from dataclasses import dataclass, replace
from pathlib import Path

from ..tools.output_authorization import tool_scope_allows
from ..tools.result_validator import ToolResult
from .models import RequestContext

COMPUTER_TOOLS = frozenset({"computer_session", "computer_observe", "computer_act"})
VISION_MODELS = frozenset({"gpt-5.4", "gpt-5.4-mini", "gpt-5.5",
                          "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"})


@dataclass(frozen=True)
class ForegroundGrant:
    context: RequestContext
    conversation: str
    call_id: str
    tool_name: str
    task: object


_grant: contextvars.ContextVar[ForegroundGrant | None] = contextvars.ContextVar(
    "computer_foreground_grant", default=None)


def require_vision(serving) -> None:
    from ..llm.openai_codex import CodexChatClient

    if (getattr(serving, "provider", None) != "codex"
            or getattr(serving, "model", None) not in VISION_MODELS
            or not isinstance(getattr(serving, "client", None), CodexChatClient)):
        raise PermissionError("Computer use requires supported native vision transport and model.")


class ComputerIntegration:
    def __init__(self, bot, *, controller=None):
        self.bot = bot
        if controller is None:
            from .controller import ComputerController
            from .store import ComputerStore

            root = Path(bot.config.computer.storage_dir).expanduser().absolute()
            store = ComputerStore(root / "state.sqlite3", root / "evidence")
            controller = ComputerController(store, self._backend, self._authorize, enabled=True)
        self.controller = controller

    @property
    def enabled(self):
        return bool(self.bot.config.computer.enabled)

    def reserves_tool(self, name):
        return self.enabled and name in COMPUTER_TOOLS

    def _backend(self, app):
        from .runtime.backend import LinuxDesktopBackend

        return LinuxDesktopBackend(enabled=self.enabled, app_profile=app,
                                   runtime_sudo=bool(self.bot.config.computer.runtime_sudo))

    def _authorize(self, context):
        manager = getattr(self.bot, "host_access_manager", None)
        if manager is None or not manager.is_host_allowed(context.owner_id, "localhost"):
            return False
        return all(not self.bot.tool_executor.check_permission(name, context.owner_id)
                   for name in COMPUTER_TOOLS)

    def is_restricted(self, owner, channel):
        try:
            return self.controller.is_restricted(str(owner), str(channel))
        except Exception:
            return True

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

    def preflight(self, st, calls):
        """Persist taint before ANY member of a mixed response batch executes."""
        context = self._context(st)
        self.controller.restrict(replace(context, channel_id=str(st.message.channel.id)))
        self.controller.restrict(context)
        require_vision(getattr(st, "_computer_serving", None))
        if not self.bot.config.computer.enabled or not self._authorize(context):
            raise PermissionError("Computer use disabled or authority denied")

    @contextmanager
    def foreground(self, st, block):
        context = self._context(st)
        require_vision(getattr(st, "_computer_serving", None))
        grant = ForegroundGrant(context, str(st.message.channel.id), str(block.id),
                                block.name, asyncio.current_task())
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
                    and self.bot.config.computer.enabled and self._authorize(grant.context))

    async def _tool(self, name, values):
        grant = _grant.get()
        if grant is None or not self.grant_allows(name, grant.context.owner_id, grant.conversation):
            return ToolResult("Permission denied: no foreground computer grant.", ok=False,
                              error="permission_denied", tool_name=name)
        method = {"computer_session": self.controller.session,
                  "computer_observe": self.controller.observe,
                  "computer_act": self.controller.act}[name]
        try:
            result = await method(grant.context, values)
            if isinstance(result, dict) and "image_bytes" in result:
                return self.output_image(result)
            unknown = isinstance(result, dict) and (
                result.get("status") == "unknown" or result.get("state") == "unknown"
                or result.get("uncertain_outcome") is True)
            return ToolResult(json.dumps(result, ensure_ascii=True), ok=not unknown,
                              error="outcome_unknown" if unknown else None,
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
        if self.is_restricted(st.user_id, str(st.message.channel.id)):
            await self.stop_context(self._context(st))

    async def stop_channel(self, owner_id, channel_id):
        from .models import RequestContext

        await self.stop_context(RequestContext(str(owner_id), str(channel_id),
                                               "operator-stop", "localhost"))

    async def set_enabled(self, enabled):
        await self.controller.set_enabled(bool(enabled))

    async def close(self):
        await self.controller.close()

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
        result = await self.controller.session(context, {"operation": operation})
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
