"""Server-owned offline authority with durable no-replay input and independent stop."""

import asyncio
import hashlib
import inspect
import time
import uuid
from copy import deepcopy

from .actions import click_receipt
from .gui_actions import action_arguments, action_payload, visual_receipt
from .models import (
    BackendCapabilities,
    BackendObservation,
    ComputerError,
    LiveSession,
    Observation,
    RequestContext,
)
from .policy import (
    DELIVERED_GROUNDING_SECONDS,
    FRAME_FRESH_SECONDS,
    MAX_ACTIONS,
    MAX_INPUT_SECONDS,
    MAX_TASK_SECONDS,
    STOP_TIMEOUT_SECONDS,
    exact_keys,
    foreground,
    observation_input,
    owned,
)
from .store import FRAME_MAX_PIXELS, ComputerStore, canonical_hash

_KEYS = frozenset({"Return", "Escape", "Tab", "BackSpace", "Delete", "Left", "Right",
                   "Up", "Down", "Home", "End", "Page_Up", "Page_Down", "space",
                   "ctrl+s", "ctrl+o", "ctrl+n", "ctrl+a", "ctrl+z", "ctrl+y",
                   "ctrl+shift+s", "shift+Tab"})


def _text(value, maximum=4096) -> str:
    if not isinstance(value, str) or len(value) > maximum:
        raise ComputerError("invalid_text")
    try:
        value.encode("utf-8")
    except UnicodeError as exc:
        raise ComputerError("invalid_text") from exc
    if any(ord(c) < 32 and c not in "\n\t" for c in value):
        raise ComputerError("invalid_text")
    return value


async def _bounded(awaitable, timeout: float):
    """A cancellation-resistant primitive must not extend this deadline."""
    task = asyncio.ensure_future(awaitable)
    try:
        done, _ = await asyncio.wait({task}, timeout=timeout)
        if task not in done:
            task.cancel()
            task.add_done_callback(_consume)
            raise TimeoutError
        return task.result()
    except asyncio.CancelledError:
        task.cancel()
        task.add_done_callback(_consume)
        raise


def _consume(task):
    if not task.cancelled():
        task.exception()


class ComputerController:
    def __init__(self, store: ComputerStore, backend_factory, authorize, *, enabled=False,
                 monotonic=time.monotonic):
        self.store, self.backend_factory, self.authorize = store, backend_factory, authorize
        self.enabled, self.monotonic = bool(enabled), monotonic
        self._live: dict[str, LiveSession] = {}
        self._actions = asyncio.Lock()
        self._watchdogs: dict[str, asyncio.Task] = {}
        self._delivered_observations: dict[str, str] = {}
        self._stop_locks: dict[str, asyncio.Lock] = {}
        self.store.recover()

    async def _auth(self, context, *, emergency=False):
        foreground(context)
        result = self.authorize(context)
        if inspect.isawaitable(result):
            result = await result
        if result is not True:
            raise ComputerError("not_found")
        if not self.enabled and not emergency:
            raise ComputerError("disabled")

    def _grant(self, context, inp, *, same_turn=True, generation=True):
        sid = inp.get("session_id")
        grant = self.store.get_session(sid) if isinstance(sid, str) else (
            self.store.find_session(context))
        if grant is None:
            raise ComputerError("not_found")
        owned(context, grant, same_turn=same_turn)
        if generation and (type(inp.get("generation")) is not int
                           or inp["generation"] != grant.generation):
            raise ComputerError("stale_generation")
        return grant

    def _active(self, grant):
        current = self.store.get_session(grant.session_id)
        live = self._live.get(grant.session_id)
        if (not self.enabled or current.generation != grant.generation
                or current.state != "active" or live is None):
            raise ComputerError("grant_revoked")
        if self.monotonic() >= live.deadline or self.store.clock() >= grant.expires_at:
            raise ComputerError("task_expired")
        return live

    async def _deadline(self, sid, seconds):
        await asyncio.sleep(seconds)
        await self._stop(sid, "cancelled")

    async def _stop(self, sid, state):
        async with self._stop_locks.setdefault(sid, asyncio.Lock()):
            current = self.store.get_session(sid)
            if current.state in {"closed", "cancelled"} and sid not in self._live:
                return self._public_session(current)
            return await self._stop_owned(sid, state)

    async def _stop_owned(self, sid, state):
        grant = self.store.set_state(sid, "quarantined", revoke=True)
        self._delivered_observations.pop(sid, None)
        live = self._live.get(sid)
        if live is None:
            return self._public_session(grant)
        live.observations.clear()
        timer = self._watchdogs.pop(sid, None)
        if timer and timer is not asyncio.current_task():
            timer.cancel()
        result = None
        try:
            # Attached adapters revoke their own devices only, never stop session apps.
            if live.capabilities is None:
                raise ComputerError("backend_capabilities_unknown")
            operation = (live.backend.detach if live.capabilities.environment == "existing_session"
                         else live.backend.stop)
            result = await _bounded(operation(), STOP_TIMEOUT_SECONDS)
            clean = isinstance(result, dict) and result.get("stopped") is True
            if clean and live.capabilities.environment == "existing_session":
                clean = (result.get("released") is True
                         and result.get("applications_preserved") is True
                         and result.get("input_revoked") is True
                         and result.get("capture_revoked") is True
                         and result.get("owned_devices") in {"removed", "retained_inactive"})
        except (Exception, asyncio.CancelledError):
            clean = False
        # Commit the cleanup evidence BEFORE dropping the live adapter. Inactive
        # retained devices must not become indistinguishable from actual removal.
        self.store.record_cleanup(sid, result, clean=clean)
        if clean:
            self._live.pop(sid, None)
            grant = self.store.set_state(sid, state)
        return self._public_session(grant)

    async def set_enabled(self, enabled: bool):
        self.enabled = bool(enabled)
        if not self.enabled:
            await asyncio.gather(*(self._stop(sid, "cancelled") for sid in tuple(self._live)))

    async def close(self):
        await self.set_enabled(False)

    async def finish_turn(self, context: RequestContext):
        """Release this turn's owned desktop, never a later turn's session."""
        # Revoked input permission cannot prevent trusted transport-owned cleanup.
        # This method never creates authority and is not a model tool operation.
        foreground(context)
        grant = self.store.find_session(context)
        if (grant is not None and grant.turn_id == context.turn_id
                and grant.state in {"starting", "active", "paused", "quarantined"}):
            owned(context, grant)
            return await self._stop(grant.session_id, "cancelled")
        return None

    def _public_session(self, grant):
        live = self._live.get(grant.session_id)
        capabilities = live.capabilities if live is not None else None
        return {**grant.public(), "backend_capabilities": (
            capabilities.public() if capabilities is not None else None),
                "cleanup": self.store.cleanup(grant.session_id)}

    async def session(self, context: RequestContext, inp: dict) -> dict:
        exact_keys(inp, {"operation", "session_id", "generation", "app", "name"}, {"operation"})
        operation = inp["operation"]
        await self._auth(context, emergency=operation in {"stop", "cancel", "close", "status"})
        if operation == "start":
            exact_keys(inp, {"operation", "app"}, {"operation", "app"})
            if not isinstance(inp["app"], str) or not 1 <= len(inp["app"]) <= 96:
                raise ComputerError("unsupported_app")
            backend = self.backend_factory(inp["app"])
            if inspect.isawaitable(backend):
                backend = await backend
            capabilities = getattr(backend, "capabilities", None)
            if type(capabilities) is not BackendCapabilities:
                raise ComputerError("backend_capabilities_unknown")
            if capabilities.environment != "isolated":
                raise ComputerError("attachment_unavailable")
            grant = self.store.create_session(context, inp["app"],
                                              platform=capabilities.platform,
                                              environment=capabilities.environment)
            try:
                self._live[grant.session_id] = LiveSession(
                    backend, self.monotonic() + MAX_TASK_SECONDS, capabilities=capabilities)
                await _bounded(backend.start(grant.session_id), 20)
                current = self.store.get_session(grant.session_id)
                if current.generation != grant.generation or current.state != "starting":
                    raise ComputerError("grant_revoked")
                await self._auth(context)
                grant = self.store.set_state(grant.session_id, "active")
                self._watchdogs[grant.session_id] = asyncio.create_task(
                    self._deadline(grant.session_id, MAX_TASK_SECONDS))
                async with self._actions:
                    await self._capture(grant)
            except (Exception, asyncio.CancelledError) as exc:
                await self._stop(grant.session_id, "cancelled")
                if isinstance(exc, asyncio.CancelledError):
                    raise
                raise ComputerError("start_unavailable") from None
            return self._public_session(self.store.get_session(grant.session_id))
        if operation not in {"status", "stop", "cancel", "close", "pause", "resume", "export",
                             "reconcile"}:
            raise ComputerError("unsupported_operation")
        exact_keys(inp, {"operation", "session_id", "generation"}
                   | ({"name"} if operation == "export" else set()))
        grant = self._grant(context, inp, same_turn=False,
                            generation=operation in {"resume", "export", "reconcile"})
        if operation == "status":
            return self._public_session(grant)
        if operation in {"stop", "cancel", "close"}:
            if grant.state in {"cancelled", "closed"}:
                return self._public_session(grant)
            return await self._stop(grant.session_id,
                                    "closed" if operation == "close" else "cancelled")
        if operation == "pause":
            return await self._pause(grant.session_id)
        if operation == "resume":
            if grant.state != "paused" or grant.session_id not in self._live:
                raise ComputerError("resume_unavailable")
            live = self._live[grant.session_id]
            if self.monotonic() >= live.deadline or self.store.clock() >= grant.expires_at:
                raise ComputerError("task_expired")
            async with self._actions:
                current = self.store.get_session(grant.session_id)
                if current.generation != grant.generation or current.state != "paused":
                    raise ComputerError("grant_revoked")
                grant = self.store.set_state(grant.session_id, "paused", revoke=True,
                                             turn_id=context.turn_id)
                live.observations.clear()
                resume = getattr(live.backend, "resume", None)
                if resume is None:
                    raise ComputerError("resume_unavailable")
                await _bounded(
                    resume(consent_generation=grant.consent_generation), STOP_TIMEOUT_SECONDS
                )
                await self._auth(context)
                current = self.store.get_session(grant.session_id)
                if current.generation != grant.generation or current.state != "paused":
                    raise ComputerError("grant_revoked")
                grant = self.store.set_state(grant.session_id, "active")
                obs, _ = await self._capture(grant, acknowledge_modal=True)
                live.modal_identity = obs.modal
                return self._public_session(self.store.get_session(grant.session_id))
        if operation == "reconcile":
            return await self.observe(context, {"session_id": grant.session_id,
                                                "generation": grant.generation})
        name = inp.get("name")
        if not isinstance(name, str):
            raise ComputerError("invalid_export_name")
        name = self.store.validate_name(name)
        async with self._actions:
            live = self._active(grant)
            content = await _bounded(live.backend.export(name), 5)
            self._active(grant)
            await self._auth(context)
            artifact = self.store.put_evidence(grant.session_id, content, kind="export", name=name)
        _, metadata = self.store.read_evidence(context, artifact)
        return {"artifact_id": artifact, "name": name, "expires_at": metadata["expires_at"]}

    async def _pause(self, sid):
        current = self.store.get_session(sid)
        if current.state not in {"active", "starting", "paused"}:
            raise ComputerError("grant_revoked")
        grant = self.store.set_state(sid, "paused", revoke=True)
        live = self._live.get(sid)
        if live is None:
            return self._public_session(self.store.set_state(sid, "quarantined"))
        live.observations.clear()
        pause = getattr(live.backend, "pause", None)
        if pause is None:
            return await self._stop(sid, "cancelled")
        try:
            result = await _bounded(pause(), STOP_TIMEOUT_SECONDS)
            if not isinstance(result, dict) or result.get("released") is not True:
                return await self._stop(sid, "cancelled")
        except (Exception, asyncio.CancelledError):
            return await self._stop(sid, "cancelled")
        return self._public_session(grant)

    async def _capture(self, grant, *, acknowledge_modal=False):
        from .vision import FrameCrop, FrameMetadata, _validate_png
        live = self._active(grant)
        # The private adapter captures synchronously for each request. This is
        # a conservative lower bound, not a fabricated source/arrival timestamp.
        captured = self.monotonic()
        raw = await _bounded(live.backend.observe(), 5)
        self._active(grant)
        if not 0 <= self.monotonic() - captured <= FRAME_FRESH_SECONDS:
            raise ComputerError("stale_observation")
        if type(raw) is not BackendObservation:
            raise ComputerError("neutral_observation_required")
        if raw.scope.consent_generation != grant.consent_generation:
            raise ComputerError("stale_capture_consent")
        if raw.width * raw.height > FRAME_MAX_PIXELS:
            raise ComputerError("delivered_image_too_large")
        oid = uuid.uuid4().hex
        metadata = FrameMetadata(
            observation_id=oid, session_id=grant.session_id, generation=grant.generation,
            captured_monotonic_ns=max(1, int(captured * 1_000_000_000)),
            source_id=raw.source.source_id, source_revision=raw.source.source_revision,
            consent_generation=raw.scope.consent_generation,
            source_width=raw.source.pixel_width, source_height=raw.source.pixel_height,
            width=raw.width, height=raw.height, kind="crop" if raw.crop is not None else "full",
            crop=FrameCrop(*raw.crop) if raw.crop is not None else None,
            rotation=raw.rotation, resize_scale=raw.resize_scale,
            resize_rounding=raw.resize_rounding)
        if metadata.delivered_to_source != raw.delivered_to_source:
            raise ComputerError("capture_render_mapping_mismatch")
        _validate_png(raw.image_bytes, metadata)
        evidence = self.store.put_evidence(grant.session_id, raw.image_bytes, kind="frame")
        obs = Observation(oid, grant.session_id, grant.generation,
                          captured, raw.width, raw.height, raw.source, raw.scope,
                          raw.delivered_to_source, raw.focused, raw.modal, evidence,
                          hashlib.sha256(raw.image_bytes).hexdigest(), metadata,
                          raw.modal_kind, raw.accessibility)
        live.observations.clear()
        live.observations[obs.observation_id] = obs
        if acknowledge_modal:
            live.modal_identity = obs.modal
        return obs, raw.image_bytes

    async def observe(self, context, inp):
        exact_keys(inp, {"session_id", "generation"}, {"session_id", "generation"})
        await self._auth(context)
        grant = self._grant(context, inp)
        async with self._actions:
            obs, image = await self._capture(grant)
            await self._auth(context)
            self._active(grant)
            if not 0 <= self.monotonic() - obs.captured_at <= FRAME_FRESH_SECONDS:
                raise ComputerError("stale_observation")
        live = self._active(grant)
        return {**obs.public(), "image_bytes": image,
                "backend_capabilities": (live.capabilities.public()
                                         if live.capabilities is not None else None)}

    async def validate_observation_delivery(self, context, metadata, digest):
        """Recheck live ownership, generation, freshness and exact pixels at delivery."""
        await self._auth(context)
        grant = self._grant(context, {"session_id": metadata.session_id,
                                      "generation": metadata.generation})
        live = self._active(grant)
        obs = live.observations.get(metadata.observation_id)
        if (obs is None or obs.frame_metadata != metadata or obs.image_sha256 != digest
                or not 0 <= self.monotonic() - obs.captured_at <= FRAME_FRESH_SECONDS
                or self._delivered_observations.get(grant.session_id) == obs.observation_id):
            raise ComputerError("stale_observation")
        self._delivered_observations[grant.session_id] = obs.observation_id

    async def validate_action_binding(self, grant, observation_id):
        return await self._validate_action_binding(grant, observation_id)

    def _operator_grant(self, context):
        if context.surface != "webui":
            raise ComputerError("operator_surface_required")
        with self.store.lock:
            row = self.store.db.execute(
                "SELECT session_id FROM sessions WHERE owner_id=? AND host_id=? "
                "ORDER BY created_at DESC LIMIT 1", (context.owner_id, context.host_id)).fetchone()
        if row is None:
            raise ComputerError("not_found")
        return self.store.get_session(row[0])

    async def operator_session(self, context, operation):
        if operation not in {"status", "pause", "stop", "cancel", "close"}:
            raise ComputerError("unsupported_operation")
        await self._auth(context, emergency=operation != "pause")
        grant = self._operator_grant(context)
        if operation == "status":
            return self._public_session(grant)
        if operation == "pause":
            return await self._pause(grant.session_id)
        return await self._stop(grant.session_id, "closed" if operation == "close" else "cancelled")

    async def operator_observe(self, context):
        await self._auth(context)
        grant = self._operator_grant(context)
        async with self._actions:
            obs, image = await self._capture(grant)
            await self._auth(context)
            self._active(grant)
            if not 0 <= self.monotonic() - obs.captured_at <= FRAME_FRESH_SECONDS:
                raise ComputerError("stale_observation")
        return {**obs.public(), "image_bytes": image}

    async def read_evidence(self, context, evidence_id):
        await self._auth(context)
        if context.surface != "webui":
            raise ComputerError("operator_surface_required")
        with self.store.lock:
            row = self.store.db.execute(
                "SELECT s.* FROM sessions s JOIN evidence e USING(session_id) "
                "WHERE evidence_id=? AND owner_id=? AND host_id=?",
                (evidence_id, context.owner_id, context.host_id)).fetchone()
        if row is None:
            raise ComputerError("evidence_unavailable")
        storage_context = RequestContext(context.owner_id, row["channel_id"], context.turn_id,
                                         context.host_id, surface="webui")
        content, metadata = self.store.read_evidence(storage_context, evidence_id)
        await self._auth(context)
        return content, metadata

    async def operator_export(self, context, name):
        await self._auth(context)
        grant = self._operator_grant(context)
        name = self.store.validate_name(name)
        async with self._actions:
            live = self._active(grant)
            content = await _bounded(live.backend.export(name), 5)
            self._active(grant)
            await self._auth(context)
            artifact = self.store.put_evidence(grant.session_id, content, kind="export", name=name)
        _, metadata = await self.read_evidence(context, artifact)
        return {"artifact_id": artifact, "name": name, "expires_at": metadata["expires_at"]}

    async def _validate_action_binding(self, grant, observation_id):
        """No input: compare full source geometry/consent/focus against fresh capture."""
        live = self._active(grant)
        obs = live.observations.get(observation_id)
        if (obs is None or not 0 <= self.monotonic() - obs.captured_at
                <= DELIVERED_GROUNDING_SECONDS):
            raise ComputerError("stale_observation")
        observation_input(grant, live, obs)
        current, _ = await self._capture(grant)
        now = self.monotonic()
        if (not 0 <= now - obs.captured_at <= DELIVERED_GROUNDING_SECONDS
                or not 0 <= now - current.captured_at <= FRAME_FRESH_SECONDS):
            raise ComputerError("stale_observation")
        if current.geometry != obs.geometry:
            raise ComputerError("stale_source_binding")
        observation_input(grant, live, current)
        return current

    async def act(self, context, inp):
        await self._auth(context)
        # Retain the historical empty probe's refusal, not an unconditional gate.
        if type(inp) is dict and not inp:
            raise ComputerError("grounded_actions_unavailable")
        action_arguments(inp)
        inp = deepcopy(inp)
        payload_hash = canonical_hash(inp)
        async with self._actions:
            await self._auth(context)
            # Receipts survive revocation/expiry. Identity and turn ownership do not.
            grant = self._grant(context, inp, generation=False)
            existing = self.store.receipt(grant.session_id, inp["action_id"], payload_hash)
            if existing is not None:
                return existing
            grant = self._grant(context, inp)
            live = self._active(grant)
            if (grant.environment != "isolated" or live.capabilities is None
                    or live.capabilities.environment != "isolated"):
                raise ComputerError("attachment_unavailable")
            if self._delivered_observations.get(grant.session_id) != inp["observation_id"]:
                raise ComputerError("observation_not_delivered")
            original = live.observations.get(inp["observation_id"])
            if original is None:
                raise ComputerError("stale_observation")
            # Unexpected modals pause, never become an implicit consent grant.
            try:
                action_payload(inp, original)
            except ComputerError as exc:
                if exc.code == "unexpected_modal":
                    await self._pause(grant.session_id)
                raise
            try:
                current = await self.validate_action_binding(grant, inp["observation_id"])
            except ComputerError:
                if any(obs.modal is not None for obs in live.observations.values()):
                    await self._pause(grant.session_id)
                raise
            if current.image_sha256 != original.image_sha256:
                raise ComputerError("visual_target_changed")
            payload, target = action_payload(inp, current)
            await self._auth(context)
            self._active(grant)
            if (not 0 <= self.monotonic() - original.captured_at <= DELIVERED_GROUNDING_SECONDS
                    or not 0 <= self.monotonic() - current.captured_at <= FRAME_FRESH_SECONDS):
                raise ComputerError("stale_observation")
            if not callable(getattr(live.backend, "act", None)):
                raise ComputerError("grounded_actions_unavailable")
            existing = self.store.begin_action(grant, inp["action_id"], payload_hash, MAX_ACTIONS)
            if existing is not None:
                return existing
            # Pending is now durable, before even constructing the input coroutine.
            self._delivered_observations.pop(grant.session_id, None)
            live.observations.clear()
            try:
                self._active(grant)
                raw = await _bounded(live.backend.act(payload),
                                     min(MAX_INPUT_SECONDS, live.deadline - self.monotonic()))
                self._active(grant)
                await self._auth(context)
                self._active(grant)
                visual = inp["expect"]["type"] == "visual_change"
                result = (visual_receipt(raw, current) if visual
                          else click_receipt(raw, current, target))
                if result["status"] not in {"unknown", "unavailable"}:
                    after, _ = await self._capture(grant)
                    await self._auth(context)
                    self._active(grant)
                    age = self.monotonic() - after.captured_at
                    binding_matches = after.geometry == current.geometry
                    if visual and result["verification"].get("target_application_matches") is True:
                        # A confirmed same-app title/modal transition still invalidates
                        # the old observation. It never permits retargeting another source.
                        binding_matches = (
                            after.source.source_id == current.source.source_id
                            and after.scope == current.scope
                            and after.width == current.width and after.height == current.height
                            and after.delivered_to_source == current.delivered_to_source
                            and after.source.pixel_to_input == current.source.pixel_to_input
                            and after.source.input_region_id == current.source.input_region_id
                            and after.focused)
                    if not binding_matches or not 0 <= age <= FRAME_FRESH_SECONDS:
                        raise ComputerError("postcondition_binding_changed")
                    result["observation_id"] = after.observation_id
                    result["verification"]["evidence_id"] = after.evidence_id
                receipt = self.store.finish_action(grant.session_id, inp["action_id"], result)
            except (Exception, asyncio.CancelledError) as exc:
                self.store.finish_action(grant.session_id, inp["action_id"],
                                         {"status": "unknown", "reason": "input_outcome_unknown"})
                await self._stop(grant.session_id, "cancelled")
                if isinstance(exc, asyncio.CancelledError):
                    raise
                return self.store.receipt(grant.session_id, inp["action_id"], payload_hash)
            if receipt["status"] == "unknown":
                await self._stop(grant.session_id, "cancelled")
            return receipt
