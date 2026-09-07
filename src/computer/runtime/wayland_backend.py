"""Portal-mediated Wayland source-local capture and qualified native input."""
from __future__ import annotations

import asyncio
import copy
import hashlib
import io
import json
import math
import re
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from ..admission import InputAdmission, InputAdmissionError
from ..geometry import AffineTransform, SourceGeometry
from ..models import BackendCapabilities, BackendObservation, CaptureScope, ComputerError
from ..provenance import canonical_application_provenance
from ..render import render_frame, source_allocation_bytes
from ..vision import FrameCrop
from .profile import validate_session
from .wayland_guardian import WaylandGuardian, WaylandGuardianError
from .wayland_identity import CompositorRuntimeIdentity, capture_identity, revalidate_identity
from .wayland_portal import WaylandPortalSession
from .wayland_scope import GNOMEWaylandScopeProvider


@dataclass(frozen=True)
class WaylandSessionConfig:
    bus_address: str
    expected_uid: int
    guardian_binary: str = "/usr/libexec/odin-computer-wayland-input"

    def __post_init__(self):
        if (type(self.bus_address) is not str
                or not re.fullmatch(r"unix:path=/[^,;\s\x00]+", self.bus_address)
                or type(self.expected_uid) is not int or not 0 <= self.expected_uid < 2**32
                or type(self.guardian_binary) is not str
                or not self.guardian_binary.startswith("/")
                or any(ord(c) < 32 for c in self.guardian_binary)):
            raise ComputerError("wayland_explicit_session_configuration_required")


def _refusal(code, *, compositor=None, reason=None):
    return InputAdmission("refused", code,
        reason or "This session did not establish the required Wayland input safety evidence.",
        "Resolve the identified session dependency or qualification failure, then start anew.",
        compositor=compositor)


def _digest(value):
    data = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(data).hexdigest()


def _scope_binding(scope):
    keys = ("source_digest", "focus_digest", "bounds_digest", "application", "compositor",
            "modal", "modal_kind", "modal_title_digest")
    return {k: scope.get(k) for k in keys} if scope else None


def _bounded_png(data: bytes, width: int, height: int, crop=None, *, with_metadata=False):
    from PIL import Image
    if (type(width) is not int or type(height) is not int or min(width, height) < 1
            or max(width, height) > 16384 or width * height > 32_000_000
            or type(data) is not bytes or len(data) > 128 * 1024 * 1024):
        raise ComputerError("wayland_capture_allocation_limit")
    # Bound decoded/packed source allocations BEFORE decoding an encoded raster.
    source_allocation_bytes(width, height, "RGB")
    rectangle = None
    if crop is not None:
        if (type(crop) is not dict or set(crop) != {"x", "y", "width", "height"}
                or any(type(v) is not int for v in crop.values())
                or min(crop["x"], crop["y"]) < 0
                or min(crop["width"], crop["height"]) < 1
                or crop["x"] + crop["width"] > width
                or crop["y"] + crop["height"] > height):
            raise ComputerError("invalid_observation_crop")
        rectangle = FrameCrop(**crop)
    with Image.open(io.BytesIO(data)) as opened:
        if opened.format != "PNG" or opened.size != (width, height):
            raise ComputerError("wayland_capture_dimensions_changed")
        opened.load()
        with opened.convert("RGB") as image:
            pixels = image.tobytes()
    rendered = render_frame(pixels, SourceGeometry("capture", 1, 1, width, height),
        mode="RGB", observation_id="capture", session_id="capture", generation=1,
        captured_monotonic_ns=time.monotonic_ns(), crop=rectangle)
    if with_metadata:
        return rendered
    return rendered.png, rendered.metadata.width, rendered.metadata.height


class WaylandRuntimeBackend:
    startup_timeout_seconds = 180
    input_supported = False
    input_blocker: str | None = "wayland_session_not_qualified"
    input_limits = {"lease_seconds": 2, "text": "unicode_current_keymap",
                    "cursor": "shared_not_restored", "scope": "authenticated_native_monitor_app"}

    def __init__(self, *, enabled=False, app_profile=None, environment="existing_session",
                 config: WaylandSessionConfig, qualify=None):
        if environment != "existing_session":
            raise ComputerError("wayland_existing_session_target_required")
        if type(config) is not WaylandSessionConfig or type(enabled) is not bool:
            raise ComputerError("wayland_invalid_configuration")
        self.enabled, self.config = enabled, config
        self.capabilities = BackendCapabilities("wayland", environment)
        self.input_admission = InputAdmission("pending", "wayland_session_not_qualified",
            "Consent, source identity and release behavior are unmeasured for this session.",
            "Start an explicitly authorized task and respond to the portal consent prompt.")
        self._qualify = qualify
        self._portal: WaylandPortalSession | None = None
        self._scope_provider: GNOMEWaylandScopeProvider | None = None
        self._guardian: WaylandGuardian | None = None
        self._identity: CompositorRuntimeIdentity | None = None
        self._generation = 1
        self._revision = 0
        self._portal_generation = 0
        self._started = self._closed = self._paused = False
        self._frame: BackendObservation | None = None
        self._scope: dict[str, Any] | None = None
        self._fingerprint: str | None = None
        self._captured_at = 0.0
        self._crop: dict[str, int] | None = None
        self._sources: dict[str, dict[str, Any]] = {}
        self._selected: str | None = None
        self._descriptor: dict[str, Any] | None = None
        self.runtime_identity_callback: Callable[[dict[str, Any]], None] | None = None
        self._lock = asyncio.Lock()
        self._stop_lock = asyncio.Lock()
        self._release_failed = False
        self._jobs: set[asyncio.Task[None]] = set()
        self._cleanup_task: asyncio.Task[bool] | None = None
        self._cleanup_evidence: dict[str, bool] = {}
        self._lifecycle_task: asyncio.Task | None = None
        self.lifecycle_reason = None

    def startup_descriptor(self, session_id):
        from .recovery import boot_id
        validate_session(session_id)
        if self._descriptor is None:
            self._descriptor = {"version": 1, "kind": "processes", "session_id": session_id,
                "boot_id": boot_id(), "no_persistent_devices": True,
                # Immutable conservative recovery classification: this adapter
                # may acquire input after qualification. Never upgrade a stored
                # capture-only descriptor after the launch fence is persisted.
                "input_was_enabled": True, "launch_pending": True, "processes": []}
        if self._descriptor["session_id"] != session_id:
            raise ComputerError("wayland_session_identity_changed")
        return copy.deepcopy(self._descriptor)

    def _record_spawn(self, identity):
        if self._descriptor is None:
            raise ComputerError("wayland_runtime_identity_missing")
        descriptor = copy.deepcopy(self._descriptor)
        if identity is not None:
            if len(descriptor["processes"]) >= 2048:
                raise ComputerError("wayland_runtime_process_limit")
            descriptor["processes"].append({k: identity[k] for k in ("pid", "start_ticks")})
        descriptor["launch_pending"] = identity is None
        if self.runtime_identity_callback:
            self.runtime_identity_callback(copy.deepcopy(descriptor))
        self._descriptor = descriptor

    async def start(self, session_id):
        if not self.enabled or self._started or self._closed:
            raise ComputerError("wayland_backend_not_startable")
        self.startup_descriptor(session_id)
        self._started = True
        try:
            await self._open()
            return {"ok": True, "session_id": session_id,
                    "capture_only": not self.input_supported,
                    "input_supported": self.input_supported,
                    "input_blocker": self.input_blocker,
                    "input_admission": self.input_admission.public(),
                    "capabilities": self.capabilities.public(), "sources": self.sources()}
        except BaseException as exc:
            await self.stop()
            if isinstance(exc, (asyncio.CancelledError, InputAdmissionError)):
                raise
            raise InputAdmissionError(_refusal("wayland_portal_start_failed",
                reason="The selected portal could not establish capture consent.")) from None

    async def _open(self):
        self._portal = WaylandPortalSession(self.config.bus_address, self.config.expected_uid,
                                            runtime_identity_callback=self._record_spawn)
        loop = asyncio.get_running_loop()
        portal = self._portal
        self._portal.lifecycle_callback = lambda event: loop.call_soon_threadsafe(
            self._portal_event, event, portal)
        self._record_spawn(None)
        grant = await self._portal.open(timeout_seconds=65)
        self._portal_generation = self._portal.current_generation
        self._sources = {uuid.uuid4().hex: {**props, "node_id": node}
                         for node, props in grant["streams"]}
        if not 1 <= len(self._sources) <= 16:
            raise ComputerError("wayland_capture_sources_unavailable")
        self._selected = next(iter(self._sources))
        self._scope_provider = GNOMEWaylandScopeProvider(bus_address=self.config.bus_address,
                                                        expected_uid=self.config.expected_uid)
        fd = None
        try:
            portal_identity = getattr(self._portal, "identity", {})
            if portal_identity.get("shell", {}).get("executable") == "/usr/bin/kwin_wayland":
                # Recognition of EIS is not proof of authenticated app scope.
                raise ComputerError("kwin_application_scope_adapter_unavailable")
            scope_identity = await self._scope_provider.identity()
            fd = await self._portal.connect_eis()
            self._identity = await capture_identity(scope_identity, self._portal.eis_peer)
            metadata = self._sources[self._selected]
            mapping_id = metadata.get("mapping_id")
            if not mapping_id:
                raise ComputerError("wayland_source_mapping_unavailable")
            self._guardian = WaylandGuardian(self.config.guardian_binary, self.config.expected_uid,
                                              self._record_spawn)
            transferred, fd = fd, None
            await self._guardian.start(transferred, mapping_id)
            qualifier = self._qualify
            if qualifier is None:
                from .wayland_probe import GnomeSameStackQualifier

                qualifier = GnomeSameStackQualifier()
            from .wayland_probe import GnomeSameStackQualifier

            if isinstance(qualifier, GnomeSameStackQualifier):
                async def record_probe(pid):
                    from .recovery import process_identity

                    self._record_spawn(process_identity(pid))

                self._record_spawn(None)
                qualifier.record_spawn = record_probe
            admission = await asyncio.wait_for(qualifier(self._identity), 90)
            if type(admission) is not InputAdmission:
                raise ComputerError("wayland_probe_evidence_invalid")
            if (admission.state == "eligible" and (admission.probe_scope == "unmeasured"
                    or not admission.checks or admission.compositor != self._identity.public())):
                raise ComputerError("wayland_probe_identity_mismatch")
            if not await revalidate_identity(self._identity, await self._scope_provider.identity(),
                                              self._portal.eis_peer):
                raise ComputerError("wayland_compositor_identity_changed")
            if not self._guardian.alive:
                raise ComputerError("wayland_guardian_input_path_lost")
            self.input_admission = admission
            if admission.state == "eligible":
                self.input_supported = True
                self.input_blocker = None
                self.capabilities = BackendCapabilities("wayland", "existing_session", "shared",
                                                         "shared", "verified", "verified")
                if self._descriptor is None:
                    raise ComputerError("wayland_runtime_identity_missing")
            else:
                self.input_blocker = admission.code
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self.input_supported = False
            code = str(exc)
            self.input_blocker = (code if re.fullmatch(r"[a-z][a-z0-9_]{0,95}", code)
                                  else "wayland_scope_or_probe_unavailable")
            self.input_admission = _refusal(self.input_blocker,
                compositor=self._identity.public() if self._identity else None)
        finally:
            if fd is not None:
                import os
                os.close(fd)
        if not self._portal.alive:
            raise ComputerError("wayland_capture_path_lost")

    def sources(self):
        return [{"source_id": key, "label": f"Granted source {n}",
                 "width": value.get("size", [0, 0])[0],
                 "height": value.get("size", [0, 0])[1]}
                for n, (key, value) in enumerate(self._sources.items(), 1)]

    @property
    def application_provenance(self):
        return canonical_application_provenance(self._scope)

    def _portal_event(self, event, portal=None):
        if self._closed or self._paused or (portal is not None and portal is not self._portal):
            return
        self.lifecycle_reason = event.get("reason", "portal_closed")
        self._revision += 1
        self._frame = self._scope = self._fingerprint = None
        self._paused = True
        self.input_supported = False
        self._lifecycle_task = asyncio.create_task(self.pause())

    async def select_source(self, source_id):
        async with self._lock:
            self._active()
            if source_id not in self._sources:
                raise ComputerError("wayland_capture_source_not_granted")
            self._selected, self._frame = source_id, None
            return {"selected_source": source_id, "capture_only": not self.input_supported}

    def _active(self):
        if (not self._started or self._closed or self._paused or not self._portal
                or not self._portal.alive
                or self._portal.current_generation != self._portal_generation):
            raise ComputerError("wayland_session_revoked")

    async def _capture(self, crop=None):
        self._active()
        if self._portal is None or self._selected is None:
            raise ComputerError("wayland_session_revoked")
        generation = self._generation
        result = await self._portal.capture(self._sources[self._selected]["node_id"])
        self._active()
        if generation != self._generation or result["generation"] != self._portal_generation:
            raise ComputerError("wayland_capture_generation_changed")
        if (result.get("clock_verified") is not True
                or not 0 <= time.monotonic() - result["captured_at"] <= 5):
            raise ComputerError("wayland_capture_clock_unverified")
        metadata = result["source_metadata"]
        expected = self._sources[self._selected]
        for key in ("node_id", "mapping_id", "position", "size", "source_type"):
            if metadata.get(key) != expected.get(key):
                raise ComputerError("wayland_capture_source_changed")
        rendered = await asyncio.to_thread(_bounded_png, result["image"],
            result["width"], result["height"], crop, with_metadata=True)
        self._active()
        return result, metadata, rendered

    async def observe(self, crop=None):
        async with self._lock:
            result, metadata, rendered = await self._capture(crop)
            scope = None
            if (self.input_supported and self._guardian and self._guardian.alive
                    and self._scope_provider is not None):
                try:
                    scope = await self._scope_provider.snapshot(metadata)
                    ready = await self._guardian.select(metadata["mapping_id"])
                    if [ready["width"], ready["height"]] != metadata["size"]:
                        raise ComputerError("wayland_input_extent_mismatch")
                except Exception:
                    scope = None
            self._active()
            fingerprint = _digest([self._selected, self._generation, metadata,
                                   result["width"], result["height"], _scope_binding(scope)])
            if fingerprint != self._fingerprint:
                self._revision += 1
                self._fingerprint = fingerprint
            eligible = scope is not None
            mapping = {}
            if eligible:
                iw, ih = metadata["size"]
                mapping = {"input_region_id": self._selected, "input_width": iw,
                           "input_height": ih, "pixel_to_input": AffineTransform(
                               a=Fraction(iw, result["width"]), e=Fraction(ih, result["height"]))}
            if self._selected is None:
                raise ComputerError("wayland_session_revoked")
            source = SourceGeometry(self._selected, self._revision, self._generation,
                                    result["width"], result["height"], **mapping)
            consent = CaptureScope(self._generation, frozenset({self._selected}),
                                   frozenset({self._selected}) if eligible else frozenset())
            fm = rendered.metadata
            frame = BackendObservation(source, consent, fm.width, fm.height,
                fm.delivered_to_source, rendered.png, focused=eligible,
                crop=(fm.crop.x, fm.crop.y, fm.crop.width, fm.crop.height) if fm.crop else None,
                resize_scale=fm.resize_scale, resize_rounding=fm.resize_rounding,
                modal=scope.get("modal_title_digest") if scope and scope.get("modal") else None,
                modal_kind=scope.get("modal_kind") if scope and scope.get("modal") else None)
            self._frame, self._scope, self._captured_at = frame, scope, result["captured_at"]
            self._crop = dict(crop) if crop else None
            return frame

    capture = observe

    def _command(self, action, frame, scope):
        fields = {"click": {"x", "y"}, "type": {"text"}, "key": {"chord"},
                  "double_click": {"x", "y"}, "right_click": {"x", "y"},
                  "middle_click": {"x", "y"}, "scroll": {"x", "y", "direction", "count"},
                  "polyline": {"points", "duration"}}
        required = {"type", "source_id", "source_revision", "consent_generation", "expected"}
        if (type(action) is not dict or type(action.get("type")) is not str
                or action["type"] not in fields
                or set(action) - {"expected_modal"} != required | fields[action["type"]]):
            raise ComputerError("wayland_unsupported_grounded_action")
        if frame.modal is not None:
            if (frame.modal_kind != "safe_application"
                    or action.get("expected_modal") != frame.modal):
                raise ComputerError("unexpected_modal")
        elif "expected_modal" in action:
            raise ComputerError("modal_not_present")
        for name in ("source_id", "source_revision", "consent_generation"):
            if (type(action[name]) is not type(getattr(frame.source, name))
                    or action[name] != getattr(frame.source, name)):
                raise ComputerError("wayland_stale_source_binding")
        if action["expected"] != {"type": "visual_change"}:
            raise ComputerError("wayland_visual_postcondition_required")
        if action["type"] == "type":
            text = action["text"]
            if (type(text) is not str or not 1 <= len(text) <= 256
                    or any(0xD800 <= ord(c) <= 0xDFFF or ord(c) == 0 for c in text)):
                raise ComputerError("wayland_invalid_unicode_text")
            return "T " + text.encode("utf-8").hex()
        if action["type"] == "key":
            chord = action["chord"]
            if type(chord) is not str or len(chord) > 128:
                raise ComputerError("unsupported_key")
            parts = chord.split("+")
            if (not re.fullmatch(r"[A-Za-z0-9_]+", parts[-1])
                    or any(p not in {"ctrl", "alt", "shift", "super"} for p in parts[:-1])
                    or len(set(parts[:-1])) != len(parts[:-1])):
                raise ComputerError("unsupported_key")
            return "J " + action["chord"]
        bounds = scope["bounds"]

        def point(p):
            if type(p) is not list or len(p) != 2 or any(type(v) is not int for v in p):
                raise ComputerError("wayland_invalid_point")
            x, y = frame.source.input_point(frame.delivered_to_source, *p,
                                             frame.width, frame.height)
            if not (bounds["x"] <= x < bounds["x"] + bounds["width"]
                    and bounds["y"] <= y < bounds["y"] + bounds["height"]):
                raise ComputerError("wayland_point_outside_authenticated_application")
            return f"{float(x):.8f} {float(y):.8f}"

        if action["type"] in {"click", "right_click", "middle_click", "double_click"}:
            button = {"right_click": 273, "middle_click": 274}.get(action["type"], 272)
            prefix = "Q" if action["type"] == "double_click" else "P"
            return f"{prefix} {button} " + point([action["x"], action["y"]])
        if action["type"] == "scroll":
            if (type(action["direction"]) is not str
                    or action["direction"] not in {"up", "down", "left", "right"}
                    or type(action["count"]) is not int or not 1 <= action["count"] <= 20):
                raise ComputerError("wayland_invalid_scroll")
            return f"W {action['direction']} {action['count']} " + point([action["x"], action["y"]])
        points, duration = action["points"], action["duration"]
        if (type(points) is not list or not 2 <= len(points) <= 256
                or type(duration) not in {int, float} or not math.isfinite(duration)
                or not 0 <= duration <= 1):
            raise ComputerError("wayland_invalid_polyline")
        return f"D 272 {len(points)} " + " ".join(point(p) for p in points)

    async def _watch_action(self, metadata, original_scope, generation) -> None:
        try:
            if self._scope_provider is None:
                raise ComputerError("wayland_session_revoked")
            while True:
                await asyncio.sleep(0.05)
                self._active()
                if generation != self._generation:
                    raise ComputerError("wayland_generation_revoked")
                fresh = await self._scope_provider.snapshot(metadata)
                if _scope_binding(fresh) != _scope_binding(original_scope):
                    raise ComputerError("wayland_focus_changed")
        except asyncio.CancelledError:
            raise
        except Exception:
            self._paused = True
            self._frame = None
            if self._guardian:
                await self._guardian.close()

    async def act(self, action):
        async with self._lock:
            self._active()
            frame, scope = self._frame, self._scope
            if (not self.input_supported or self.input_admission.state != "eligible"
                    or not self._guardian or not self._guardian.alive or self._release_failed
                    or self._scope_provider is None or self._identity is None
                    or self._portal is None
                    or frame is None or not frame.focused or scope is None
                    or not 0 <= time.monotonic() - self._captured_at <= 5):
                raise ComputerError("wayland_fresh_qualified_application_observation_required")
            command = self._command(action, frame, scope)
            _, metadata, rendered = await self._capture(self._crop)
            image, width, height = rendered.png, rendered.metadata.width, rendered.metadata.height
            fresh_scope = await self._scope_provider.snapshot(metadata)
            if (width != frame.width or height != frame.height or image != frame.image_bytes
                    or _scope_binding(scope) != _scope_binding(fresh_scope)):
                self._frame = None
                raise ComputerError("wayland_observation_changed")
            if not await revalidate_identity(self._identity, await self._scope_provider.identity(),
                                              self._portal.eis_peer):
                self._paused = True
                await self._guardian.close()
                raise ComputerError("wayland_compositor_identity_changed")
            ready = await self._guardian.select(metadata["mapping_id"])
            if [ready["width"], ready["height"]] != metadata["size"]:
                raise ComputerError("wayland_input_extent_mismatch")
            # Identity hashing and region negotiation are awaited. Recheck focus
            # after both, rather than letting their latency widen the input race.
            fresh_scope = await self._scope_provider.snapshot(metadata)
            if _scope_binding(scope) != _scope_binding(fresh_scope):
                self._frame = None
                raise ComputerError("wayland_focus_changed_before_dispatch")
            self._active()
            if not 0 <= time.monotonic() - self._captured_at <= 5:
                raise ComputerError("wayland_observation_expired")
            self._frame = None
            watchdog = asyncio.create_task(
                self._watch_action(metadata, fresh_scope, self._generation))
            self._jobs.add(watchdog)
            try:
                delivered = await self._guardian.act(command)
                if self._paused or self._closed or delivered.get("event") != "action_done":
                    raise ComputerError("wayland_action_revoked_outcome_unknown")
                receipt: dict[str, Any] = {"status": "executed", "injected": True, "released": True,
                    "application_provenance": canonical_application_provenance(scope),
                    "release_basis": "guardian_owned_ledger_and_qualified_compositor",
                    "postcondition": {"type": "visual_change", "status": "unavailable",
                        "source_id": frame.source.source_id,
                        "source_revision": frame.source.source_revision,
                        "consent_generation": frame.source.consent_generation}}
            except BaseException as exc:
                if (isinstance(exc, WaylandGuardianError)
                        and getattr(exc, "details", {}).get("event") == "action_rejected"
                        and getattr(exc, "details", {}).get("input_was_sent") is False):
                    # Return known no-input failure: dispatch exceptions become
                    # unknown outcomes after the controller reserves an action ID.
                    details = exc.details
                    receipt = {"status": "unavailable", "injected": False, "released": True,
                               "reason": details.get("reason", "unsupported_key")}
                    if details.get("reason") == "unsupported_character":
                        receipt["unsupported_characters"] = [
                            {"index": row["index"], "codepoint": row["codepoint"],
                             "reason": "unsupported_character"}
                            for row in details.get("characters", [])]
                    return receipt
                self._paused = True
                cleanup = await self._guardian.close()
                self._release_failed |= not cleanup.get("release_submitted", False)
                raise
            finally:
                watchdog.cancel()
                await asyncio.gather(watchdog, return_exceptions=True)
                self._jobs.discard(watchdog)
            try:
                _, after_metadata, after_rendered = await self._capture(self._crop)
                after_image = after_rendered.png
                after_scope = await self._scope_provider.snapshot(after_metadata)
                receipt["postcondition"].update(
                    status="observed", method="raster_digest_after_release",
                    target_application_matches=(scope["application"] == after_scope["application"]
                        and scope["source_digest"] == after_scope["source_digest"]),
                    actual={"before_sha256": hashlib.sha256(image).hexdigest(),
                            "after_sha256": hashlib.sha256(after_image).hexdigest()})
            except Exception:
                pass
            return receipt

    async def export(self, name):
        raise ComputerError("existing_session_export_not_granted")

    async def _cleanup(self):
        if self._cleanup_task is None or self._cleanup_task.done():
            # Repeated Close is an explicit retry of incomplete cleanup. A
            # cancelled waiter never cancels the resource owner's cleanup task.
            self._cleanup_task = asyncio.create_task(self._cleanup_all())
        return await asyncio.shield(self._cleanup_task)

    async def _cleanup_all(self) -> bool:
        for job in tuple(self._jobs):
            job.cancel()
        if self._jobs:
            await asyncio.gather(*tuple(self._jobs), return_exceptions=True)
        guardian = {"process_reaped": self._guardian is None,
                    "release_submitted": self._guardian is None}
        portal = {"process_reaped": self._portal is None,
                  "connection_closed": self._portal is None,
                  "session_close_acknowledged": self._portal is None}
        scope_closed = self._scope_provider is None
        # Release the original EI owner before portal revocation, but never skip
        # later resources when the earlier path fails or times out.
        if self._guardian:
            try:
                guardian = await asyncio.wait_for(self._guardian.close(), 4)
            except (Exception, asyncio.CancelledError):
                pass
        if self._portal:
            try:
                portal = await asyncio.wait_for(self._portal.close(), 4)
            except (Exception, asyncio.CancelledError):
                pass
        if self._scope_provider:
            try:
                await asyncio.wait_for(self._scope_provider.close(), 0.5)
                scope_closed = True
            except (Exception, asyncio.CancelledError):
                pass
        self._release_failed |= not guardian.get("release_submitted", False)
        portal_closed = (portal.get("process_reaped") is True
                         and portal.get("session_close_acknowledged") is True
                         and not portal.get("cleanup_errors"))
        ei_closed = guardian.get("process_reaped") is True
        self._cleanup_evidence = {"portal_session_closed": portal_closed,
                                  "portal_connection_closed": (
                                      portal.get("connection_closed") is True),
                                  "ei_connection_closed": ei_closed}
        return (ei_closed and portal_closed and scope_closed and not self._release_failed)

    async def pause(self):
        self._paused = True
        self._frame = None
        self.input_supported = False
        async with self._stop_lock:
            clean = await self._cleanup()
        return {"paused": True, "input_revoked": True, "capture_revoked": True, "released": clean}

    async def resume(self, *, consent_generation):
        if (self._closed or not self._paused or self._release_failed
                or type(consent_generation) is not int or consent_generation <= self._generation):
            raise ComputerError("wayland_renewed_session_consent_required")
        async with self._stop_lock:
            if not await self._cleanup():
                raise ComputerError("wayland_owned_cleanup_unverified")
            self._generation = consent_generation
            self._paused = False
            self._frame = self._scope = self._fingerprint = None
            self._identity = self._guardian = None
            await self._open()
        return {"resumed": True, "capture_only": not self.input_supported,
                "input_admission": self.input_admission.public()}

    async def detach(self):
        self._closed = self._paused = True
        self._frame = None
        self.input_supported = False
        async with self._stop_lock:
            clean = await self._cleanup()
        return {"stopped": clean, "released": clean, "applications_preserved": True,
                "input_revoked": True, "capture_revoked": True,
                **self._cleanup_evidence,
                "owned_devices": "portal_owned_connections_closed" if clean else "unknown",
                "state": "closed" if clean else "quarantined",
                "recovery": None if clean else "wayland_owned_cleanup_unverified"}

    stop = detach
    close = detach
