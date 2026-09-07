"""Async controller adapter. No launch or optional dependency unless enabled."""

from __future__ import annotations

import asyncio
import copy
import hashlib
import sys
import time
import uuid
from pathlib import Path
from typing import Any, cast

from ..geometry import AffineTransform, SourceGeometry
from ..models import BackendCapabilities, BackendObservation, CaptureScope
from .profile import (
    APP_PROFILES,
    MAX_EXPORT_BYTES,
    basename,
    clean_environment,
    preflight,
    unit_for,
    validate_session,
)
from .protocol import MAX_WIRE_BYTES, decode, encode, unpack_blob


class RuntimeFailure(RuntimeError):  # noqa: N818 - Existing private adapter API name.
    """No effect guarantee: callers must record pending mutations as unknown."""


class LinuxDesktopBackend:
    capabilities = BackendCapabilities("x11", "isolated", "shared", "shared")
    input_limits = {
        "lease_seconds": 2, "max_text_chars": 512,
        "text": "xdotool_private_keymap", "max_polyline_points": 256,
        "max_polyline_seconds": 1, "polyline_dispatch_budget": "native_prepress_estimate",
        "click_count": {"min": 1, "max": 3},
        "click_modifiers": ["ctrl", "alt", "shift", "super"],
        "scroll_modifiers": ["ctrl", "alt", "shift", "super"],
        "drag_modifiers": ["ctrl", "alt", "shift", "super"],
        "constrained_drag": "shift_held_application_defined_no_geometric_snapping",
        "key_chords": "active_group_base_symbols_explicit_modifiers_only",
        "modifier_mapping": "conventional_unambiguous_xkb_slots_only",
        "click_modifier_resolution": "existing_native_keymap_before_input",
        "accessibility": "isolated_atspi_observation_scoped",
        "replace_field": "available_nodes_only", "replace_field_max_chars": 512,
        "replace_field_requires": ["replace_field", "text_readable", "text_complete"],
        "field_text_equals": "independent_same_native_node_after_release",
        "effect_expectations": ["visual_change", "pointer_at", "region_changed",
                                "field_text_equals"],
    }

    def __init__(
        self, *, enabled: bool = False, app_profile: str = "drawing", runtime_sudo: bool = False
    ):
        if app_profile not in APP_PROFILES:
            raise ValueError("unapproved application profile")
        self.enabled, self.app_profile = enabled, app_profile
        self.runtime_sudo = runtime_sudo
        self._process: asyncio.subprocess.Process | None = None
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._writer = asyncio.Lock()
        self._ordinary = asyncio.Lock()
        self._stop_lock = asyncio.Lock()
        self._closed = False
        self._ready: asyncio.Future[dict[str, Any]] | None = None
        self._reader_task: asyncio.Task[None] | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._unit: str | None = None
        self._last_window = None
        self._last_observation: str | None = None
        self._paused = False
        self._source_id = uuid.uuid4().hex
        self._source_revision = 0
        self._consent_generation = 1
        self._frame: BackendObservation | None = None
        self._captured_at = 0.0
        self._descriptor: dict[str, Any] | None = None
        self.runtime_identity_callback = None

    def startup_descriptor(self, session_id: str) -> dict:
        from .recovery import boot_id
        validate_session(session_id)
        if self._descriptor is None:
            owned = hashlib.sha256(session_id.encode()).hexdigest()[:32] + '-' + uuid.uuid4().hex
            self._unit = unit_for(owned)
            self._descriptor = {
                'version': 1, 'kind': 'isolated', 'session_id': session_id,
                'boot_id': boot_id(), 'token': owned, 'unit': self._unit,
                'processes': [], 'launch_pending': True,
            }
        if self._descriptor['session_id'] != session_id:
            raise RuntimeFailure('runtime identity changed')
        return copy.deepcopy(self._descriptor)

    async def start(self, session_id: str) -> dict:
        if not self.enabled:
            raise RuntimeFailure("isolated computer use is disabled")
        if self._closed or self._process is not None:
            raise RuntimeFailure("backend instances are single-use")
        validate_session(session_id)
        preflight(self.app_profile)
        descriptor = self.startup_descriptor(session_id)
        assert self._descriptor is not None  # startup_descriptor establishes this identity.
        owned = descriptor['token']
        self._ready = asyncio.get_running_loop().create_future()
        try:
            self._process = await asyncio.create_subprocess_exec(
                sys.executable, "-I", str(Path(__file__).with_name("supervisor.py")),
                owned, self.app_profile,
                "sudo" if self.runtime_sudo else "direct",
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL, env=clean_environment(),
                start_new_session=True, limit=MAX_WIRE_BYTES,
            )
            from .recovery import process_identity
            self._descriptor['processes'].append(process_identity(self._process.pid))
            self._descriptor['launch_pending'] = False
            if self.runtime_identity_callback is not None:
                self.runtime_identity_callback(copy.deepcopy(self._descriptor))
            # Supervisor cannot launch the unit before its exact PID and unit are durable.
            await self._send({'op': 'launch'})
            self._reader_task = asyncio.create_task(self._read())
            self._heartbeat_task = asyncio.create_task(self._heartbeats())
            result = await asyncio.wait_for(asyncio.shield(self._ready), 20.0)
            if not result.get("ok"):
                raise RuntimeFailure("isolated desktop startup failed")
            return {**result, "unit": self._unit, "session_id": session_id}
        except BaseException:
            await asyncio.shield(self.stop())
            raise

    async def _send(self, message: dict) -> None:
        async with self._writer:
            if (self._process is None or self._process.stdin is None
                    or self._process.returncode is not None):
                raise RuntimeFailure("isolated desktop controller disconnected")
            self._process.stdin.write(encode(message))
            await self._process.stdin.drain()

    async def _read(self) -> None:
        try:
            while self._process and self._process.stdout:
                line = await self._process.stdout.readline()
                if not line:
                    break
                message = decode(line)
                request_id = message.get("id")
                future = (
                    self._ready if message.get("event") == "ready"
                    else self._pending.get(request_id) if isinstance(request_id, str) else None
                )
                if future is not None and not future.done():
                    future.set_result(message)
        except (Exception, asyncio.CancelledError):
            pass
        finally:
            for future in [self._ready, *self._pending.values()]:
                if future is not None and not future.done():
                    future.set_exception(RuntimeFailure("desktop connection lost; outcome unknown"))

    async def _heartbeats(self) -> None:
        try:
            while not self._closed:
                await self._send({"op": "heartbeat"})
                await asyncio.sleep(0.4)
        except (Exception, asyncio.CancelledError):
            return

    async def _rpc(self, operation: str, *, timeout: float = 5.0, **payload) -> dict:
        if self._closed:
            raise RuntimeFailure("desktop session is revoked")
        request_id = uuid.uuid4().hex
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        try:
            await self._send({"id": request_id, "op": operation, **payload})
            result = await asyncio.wait_for(asyncio.shield(future), timeout)
            if self._closed:
                raise RuntimeFailure("desktop session revoked during operation")
            if not result.get("ok"):
                raise RuntimeFailure(str(result.get("error", "isolated operation failed"))[:160])
            return result
        except (TimeoutError, asyncio.CancelledError):
            await asyncio.shield(self.stop())
            raise
        finally:
            self._pending.pop(request_id, None)
            if not future.done():
                future.cancel()

    async def observe(self, crop=None) -> BackendObservation:
        async with self._ordinary:
            from ..gui_actions import crop_arguments
            from ..render import render_frame
            from ..vision import FrameCrop
            if crop is not None:
                crop = crop_arguments(crop)
            self._frame = None
            captured = time.monotonic()
            reply = await self._rpc("observe")
            result = reply["observation"]
            if "source_revision" not in result or "raster_mode" not in result:
                if crop is not None:
                    raise RuntimeFailure("crop_requires_source_metadata")
                # Unknown worker metadata never grants an inferred input mapping.
                from ..vision import FrameMetadata, _validate_png
                image = unpack_blob(result["image"], cap=2 * 1024 * 1024)
                self._source_revision += 1
                source = SourceGeometry(self._source_id, self._source_revision,
                                        self._consent_generation, result["width"], result["height"])
                metadata = FrameMetadata(
                    observation_id=uuid.uuid4().hex, session_id=self._source_id, generation=1,
                    captured_monotonic_ns=max(1, int(captured * 1e9)),
                    source_id=source.source_id, source_revision=source.source_revision,
                    consent_generation=source.consent_generation,
                    source_width=source.pixel_width, source_height=source.pixel_height,
                    width=source.pixel_width, height=source.pixel_height)
                _validate_png(image, metadata)
                if self._closed or self._paused or time.monotonic() - captured > 5:
                    raise RuntimeFailure("capture revoked or expired")
                return BackendObservation(source, CaptureScope(self._consent_generation,
                                          frozenset({self._source_id})), result["width"],
                                          result["height"], AffineTransform(), image)
            pixels = unpack_blob(result["image"], cap=16 * 1024 * 1024)
            self._last_window = result["window"]
            observation_id = result["observation_id"]
            if not isinstance(observation_id, str):
                raise RuntimeFailure("invalid private observation identity")
            self._last_observation = observation_id
            revision = result["source_revision"]
            if type(revision) is not int or revision < max(1, self._source_revision):
                raise RuntimeFailure("invalid private source revision")
            self._source_revision = revision
            source = SourceGeometry(self._source_id, self._source_revision,
                                    self._consent_generation, result["width"], result["height"],
                                    self._source_id, result["width"], result["height"],
                                    AffineTransform())
            rendered = await asyncio.to_thread(render_frame,
                pixels, source, mode=result["raster_mode"],
                observation_id=observation_id, session_id=self._source_id,
                generation=1, captured_monotonic_ns=max(1, int(captured * 1e9)),
                crop=FrameCrop(**crop) if crop is not None else None)
            if self._closed or self._paused or time.monotonic() - captured > 5:
                raise RuntimeFailure("capture revoked or expired")
            scope = CaptureScope(self._consent_generation, frozenset({self._source_id}),
                                 frozenset({self._source_id}))
            metadata = rendered.metadata
            self._frame = BackendObservation(
                source, scope, metadata.width, metadata.height, metadata.delivered_to_source,
                rendered.png, focused=result.get("focused") is True,
                modal=result.get("modal_id"), resize_scale=metadata.resize_scale,
                crop=tuple(crop[k] for k in ("x", "y", "width", "height"))
                if crop is not None else None,
                modal_kind=("safe_application" if result.get("modal_kind") == "safe_application"
                            else "unrecognized") if result.get("modal_id") is not None else None,
                accessibility=tuple(result.get("accessibility", ())))
            self._captured_at = captured
            return self._frame

    async def act(self, action: dict) -> dict:
        """Strict private GUI actions; evidence never implies application semantics."""
        action = copy.deepcopy(action)
        async with self._ordinary:
            frame = self._frame
            if (self._closed or self._paused or frame is None or not frame.focused
                    or not 0 <= time.monotonic() - self._captured_at <= 5):
                raise RuntimeFailure("capture only; fresh focused nonmodal observation required")
            fields = {"click": {"x", "y"}, "double_click": {"x", "y"},
                      "right_click": {"x", "y"}, "middle_click": {"x", "y"},
                      "scroll": {"x", "y", "direction", "count"},
                      "type": {"text"}, "key": {"chord"},
                      "polyline": {"points", "duration"},
                      "replace_field": {"target", "text"}}
            required = {"type", "source_id", "source_revision", "consent_generation", "expected"}
            optional = {"expected_modal"}
            if type(action) is dict and action.get("type") in {
                    "click", "double_click", "right_click", "middle_click"}:
                optional.add("count")
            if type(action) is dict and action.get("type") in {
                    "click", "double_click", "right_click", "middle_click", "scroll", "polyline"}:
                optional.add("modifiers")
            if (type(action) is not dict or not isinstance(action.get("type"), str)
                    or action["type"] not in fields
                    or set(action) - optional != required | fields[action["type"]]):
                raise RuntimeFailure("unsupported grounded action")
            if frame.modal is not None:
                if (frame.modal_kind != "safe_application"
                        or action.get("expected_modal") != frame.modal):
                    raise RuntimeFailure("unexpected or denied application modal")
            elif "expected_modal" in action:
                raise RuntimeFailure("expected modal is not present")
            source = frame.source
            for key in ("source_id", "source_revision", "consent_generation"):
                if (type(action[key]) is not type(getattr(source, key))
                        or action[key] != getattr(source, key)):
                    raise RuntimeFailure("stale source binding")
            expected = action["expected"]
            if type(expected) is dict and expected.get("type") == "region_changed":
                from ..effects import expectation_arguments
                from ..gui_actions import crop_arguments
                expectation_arguments(expected)
                crop_arguments({k: expected[k] for k in ("x", "y", "width", "height")},
                               frame.width, frame.height)
                expected = {"type": "visual_change"}
            visual = type(expected) is dict and expected == {"type": "visual_change"}
            pointer = (action["type"] == "click" and type(expected) is dict
                       and set(expected) == {"type", "x", "y"}
                       and expected["type"] == "pointer_at"
                       and all(type(expected[k]) is int and expected[k] == action[k]
                               for k in ("x", "y")))
            from .primitives import (
                MODIFIED_POINTER,
                click_options,
                field_expectation,
                parse_key_chord,
                pointer_modifiers,
            )
            field = field_expectation(action)
            if ((action["type"] == "replace_field" and not field)
                    or not pointer and not visual and not field):
                raise RuntimeFailure("unsupported postcondition")
            payload = {"type": action["type"], "source_revision": source.source_revision,
                       "expected_window": self._last_window,
                       "observation_id": self._last_observation,
                       "expected": expected}
            if "expected_modal" in action:
                payload["expected_modal"] = action["expected_modal"]
            from .accessibility import PrimitiveError, bounded_text, finite
            try:
                if action["type"] in MODIFIED_POINTER:
                    payload["modifiers"] = pointer_modifiers(action)
                if action["type"] in {
                        "click", "double_click", "right_click", "middle_click", "scroll"}:
                    if any(type(action[k]) is not int for k in ("x", "y")):
                        raise RuntimeFailure("click coordinates must be integers")
                    x, y = source.input_point(frame.delivered_to_source, action["x"], action["y"],
                                              frame.width, frame.height)
                    payload.update(x=int(x), y=int(y))
                    if action["type"] == "scroll":
                        if (action["direction"] not in ("up", "down", "left", "right")
                                or type(action["count"]) is not int
                                or not 1 <= action["count"] <= 20):
                            raise RuntimeFailure("invalid_scroll")
                        payload.update(direction=action["direction"], count=action["count"])
                    else:
                        count, modifiers = click_options(action)
                        payload.update(count=count, modifiers=modifiers)
                    if pointer:
                        payload["expected"] = {"type": "pointer_at", "x": int(x), "y": int(y)}
                elif action["type"] == "polyline":
                    points = action["points"]
                    if (type(points) is not list or not 2 <= len(points) <= 256
                            or any(type(p) is not list or len(p) != 2
                                   or any(type(v) is not int for v in p) for p in points)):
                        raise RuntimeFailure("invalid bounded polyline")
                    finite(action["duration"], 0, 1.0)
                    payload["points"] = [[int(v) for v in source.input_point(
                        frame.delivered_to_source, *cast(tuple[int, int], tuple(p)),
                        frame.width, frame.height)] for p in points]
                    payload["duration"] = action["duration"]
                elif action["type"] == "type":
                    payload["text"] = bounded_text(action["text"])
                elif action["type"] == "replace_field":
                    text = bounded_text(action["text"])
                    matches = [node for node in frame.accessibility
                               if node.get("handle") == action["target"]]
                    if (len(matches) != 1
                            or "replace_field" not in matches[0].get("capabilities", ())
                            or matches[0].get("text_readable") is not True
                            or matches[0].get("text_complete") is not True):
                        raise RuntimeFailure("accessible_field_unavailable")
                    payload.update(target=action["target"], text=text)
                else:
                    parse_key_chord(action["chord"])
                    payload["chord"] = action["chord"]
            except (PrimitiveError, ValueError) as exc:
                raise RuntimeFailure(str(exc)) from exc
            self._frame = None  # Consume before sending, including lost/failed replies.
            self._last_window = None
            receipt = (await self._rpc("act", action=payload, timeout=5.0))["receipt"]
            if receipt.get("released") is not True:
                self._paused = True  # Failed owned-input cleanup requires teardown.
            post = receipt.get("postcondition", {"type": expected["type"], "status": "unavailable"})
            receipt["postcondition"] = {**post, "source_id": source.source_id,
                                        "source_revision": source.source_revision,
                                        "consent_generation": source.consent_generation}
            return receipt

    async def _legacy_private_act(self, action: dict) -> dict:
        """Compatibility name, never an alternate admission route."""
        return await self.act(action)

    async def export(self, name: str) -> bytes:
        basename(name)
        async with self._ordinary:
            result = await self._rpc("export", name=name)
            return unpack_blob(result["blob"], cap=MAX_EXPORT_BYTES)

    async def pause(self) -> dict:
        self._paused = True
        self._frame = None
        self._last_window = None
        try:
            return await self._rpc("pause", timeout=0.7)
        except BaseException:
            await asyncio.shield(self.stop())
            raise

    async def resume(self, *, consent_generation: int) -> dict:
        if not self._paused:
            raise RuntimeFailure("desktop is not paused")
        if type(consent_generation) is not int or consent_generation <= self._consent_generation:
            raise RuntimeFailure("fresh capture consent generation required")
        result = await self._rpc("resume", timeout=0.7)
        self._consent_generation = consent_generation
        self._paused = False
        self._last_window = None
        return result

    async def stop(self) -> dict:
        self._closed = True  # Independent of both ordinary-action and write locks.
        self._frame = None
        async with self._stop_lock:
            if self._heartbeat_task:
                self._heartbeat_task.cancel()
            verified = self._unit is None
            if self._unit:
                # A direct fixed-profile control path remains useful if supervisor I/O hangs.
                from .supervisor import terminate_unit
                verified = await terminate_unit(self._unit, runtime_sudo=self.runtime_sudo)
            if self._process and self._process.returncode is None:
                self._process.terminate()
                try:
                    await asyncio.wait_for(self._process.wait(), 0.4)
                except TimeoutError:
                    self._process.kill()
                    await self._process.wait()
            for task in (self._heartbeat_task, self._reader_task):
                if task and task is not asyncio.current_task():
                    task.cancel()
            await asyncio.gather(
                *(task for task in (self._heartbeat_task, self._reader_task)
                  if task and task is not asyncio.current_task()),
                return_exceptions=True,
            )
            for future in [self._ready, *self._pending.values()]:
                if future and future.done() and not future.cancelled():
                    future.exception()
            return {"stopped": verified, "state": "closed" if verified else "quarantined"}

    async def close(self) -> dict:
        return await self.stop()
