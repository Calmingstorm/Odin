"""Explicit-output Hyprland runtime, without portals or receiver-proof claims."""

from __future__ import annotations

import asyncio
import copy
import hashlib
import os
import re
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction
from typing import Any, cast

from ..admission import CompositorIdentity, InputAdmission, InputAdmissionError
from ..geometry import AffineTransform, SourceGeometry
from ..models import BackendCapabilities, BackendObservation, CaptureScope, ComputerError
from ..provenance import canonical_application_provenance
from ..render import render_frame, source_allocation_bytes
from ..vision import FrameCrop
from .hyprland_capture import ExplicitOutput, NativeFrame, ScopeProof, capture_explicit_output
from .hyprland_guardian import HyprlandGuardian
from .hyprland_identity import (
    ExecutableTrust,
    HyprlandIdentity,
    connect_peer,
    pin_connections,
    revalidate,
)
from .hyprland_scope import HyprlandScopeProvider
from .profile import validate_session
from .wayland_backend import WaylandRuntimeBackend, _digest, _scope_binding
from .wayland_guardian import trusted_binary

RESIDUALS = (
    "Hyprland input is best-effort: a hard guardian kill may leave owned input held.",
    "Releasing Odin's button may clobber a simultaneous physical same-button hold.",
    "Cooperative release acknowledgements are not native receiver qualification.",
    "Not arbitrary-app qualification: only scoped native Wayland top-levels; "
    "Same-process native dialogs require fresh observations; XWayland and foreign parents "
    "are not supported.",
)


@dataclass(frozen=True)
class HyprlandSessionConfig:
    expected_uid: int
    runtime_dir: str
    wayland_display: str
    instance_signature: str
    output_name: str
    compositor_pid: int
    compositor_trust: ExecutableTrust
    guardian_binary: str = "/usr/local/libexec/odin-hyprland-input"
    capture_binary: str = "/usr/local/libexec/odin-hyprland-capture"
    scope_socket: str | None = None

    def __post_init__(self):
        paths: tuple[str, ...] = (self.runtime_dir, self.guardian_binary, self.capture_binary)
        if self.scope_socket is not None:
            paths += (self.scope_socket,)
        if (
            type(self.expected_uid) is not int or not 0 <= self.expected_uid < 2**32
            or type(self.compositor_pid) is not int or self.compositor_pid <= 1
            or type(self.compositor_trust) is not ExecutableTrust
            or any(type(p) is not str or not p.startswith("/")
                   or any(ord(c) < 32 for c in p) or ".." in p.split("/") for p in paths)
            or any(type(p) is not str or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", p)
                   or p in {".", ".."} for p in (
                       self.wayland_display, self.instance_signature, self.output_name))
        ):
            raise ComputerError("hyprland_explicit_session_configuration_required")
        if self.scope_socket is None:
            object.__setattr__(self, "scope_socket", self.runtime_dir + "/odin-hyprland-scope.sock")
        if any(len(os.fsencode(p)) > 107 for p in (
            self.wayland_path, self.ipc_path, cast(str, self.scope_socket),
        )):
            raise ComputerError("hyprland_explicit_socket_required")

    @property
    def wayland_path(self) -> str:
        return self.runtime_dir + "/" + self.wayland_display

    @property
    def ipc_path(self) -> str:
        return self.runtime_dir + "/hypr/" + self.instance_signature + "/.socket.sock"


def _binding(scope):
    # Tokens change each snapshot; monotonic serial catches lock/focus/output ABA.
    return (_scope_binding(scope), scope.get("native_scope_serial"), scope.get("output"))


def _render_native(frame, crop):
    """Orient raw pixels once, then map oriented output-local coordinates by scale."""
    from PIL import Image

    output = frame.output
    source_allocation_bytes(output.width, output.height, "RGB")
    if len(frame.pixels) != output.width * output.height * 4:
        raise ComputerError("hyprland_capture_raster_invalid")
    with Image.frombytes("RGB", (output.width, output.height), frame.pixels, "raw", "BGRX") as raw:
        image = raw.copy()
    try:
        transforms = []
        if output.transform & 4:
            transforms.append(Image.Transpose.FLIP_LEFT_RIGHT)
        rotation = output.transform & 3
        if rotation:
            transforms.append({1: Image.Transpose.ROTATE_90, 2: Image.Transpose.ROTATE_180,
                               3: Image.Transpose.ROTATE_270}[rotation])
        for transform in transforms:
            changed = image.transpose(transform)
            image.close()
            image = changed
        width, height = image.size
        rectangle = None
        if crop is not None:
            from ..gui_actions import crop_arguments

            rectangle = FrameCrop(**crop_arguments(crop, width, height))
        return render_frame(
            image.tobytes(), SourceGeometry("capture", 1, 1, width, height), mode="RGB",
            observation_id="capture", session_id="capture", generation=1,
            captured_monotonic_ns=time.monotonic_ns(), crop=rectangle,
        )
    finally:
        image.close()


class _GroundedCommandEncoder(WaylandRuntimeBackend):
    """Reuse only the synchronous encoder with its sole dependency supplied.

    This object is never started and owns no portal or runtime lifecycle.
    """

    def __init__(self, guardian: HyprlandGuardian | None):
        self._guardian = guardian


class HyprlandRuntimeBackend:
    startup_timeout_seconds = 30
    input_supported = False
    input_blocker: str | None = "hyprland_session_not_ready"
    input_limits = {
        **WaylandRuntimeBackend.input_limits,
        "text": "owned_virtual_us_keymap_representable_characters_only",
        "key_chords": "owned_virtual_us_keymap",
        "accessibility": "unavailable_pixel_targeting_only",
        "scope": "authenticated_hyprland_explicit_output_app",
        "release": "hyprland_best_effort_cooperative_ack",
        "receiver_release_verified": False,
        "residuals": list(RESIDUALS),
        "application_scope": "original_native_process_same_output_fresh_observed_own_dialogs",
        "recovery": "operator_release_all_then_close_and_start_new_session",
    }
    # Transport-neutral helpers: no portal access or compositor qualification.
    def _command(self, action, frame, scope):
        return _GroundedCommandEncoder(self._guardian)._command(action, frame, scope)

    def __init__(self, *, config: HyprlandSessionConfig, enabled=False,
                 environment="existing_session", app_profile=None):
        if (type(config) is not HyprlandSessionConfig or type(enabled) is not bool
                or environment != "existing_session"):
            raise ComputerError("hyprland_explicit_session_configuration_required")
        self.config, self.enabled = config, enabled
        # Backend family is immutable provenance, not input eligibility. Publish
        # it before startup so partial-start cleanup and emergency RELEASE-ALL
        # retain the right route even when native admission never completes.
        self.capabilities = BackendCapabilities("wayland", environment, backend="hyprland")
        self.input_admission = InputAdmission(
            "pending", cast(str, self.input_blocker),
            "Native session safety evidence is unmeasured.",
            "Explicitly configure the pinned Hyprland build and provisioned native companion.")
        self._generation, self._revision = 1, 0
        self._started = self._closed = self._paused = False
        self._frame: BackendObservation | None = None
        self._scope: dict[str, Any] | None = None
        self._fingerprint: str | None = None
        self._crop: dict[str, int] | None = None
        self._captured_at = 0.0
        self._guardian: HyprlandGuardian | None = None
        self._scope_provider: HyprlandScopeProvider | None = None
        self._identity: HyprlandIdentity | None = None
        self._output: ExplicitOutput | None = None
        # Preserve original authority over pause/resume and frame invalidation.
        self._application_pin: dict[str, Any] | None = None
        self._output_pin: ExplicitOutput | None = None
        self._original_surface: str | None = None
        self._descriptor: dict[str, Any] | None = None
        self.runtime_identity_callback: Callable[[dict[str, Any]], None] | None = None
        self._selected = uuid.uuid4().hex
        self._lock, self._stop_lock = asyncio.Lock(), asyncio.Lock()
        self._scope_jobs: set[asyncio.Task[dict[str, Any]]] = set()
        self._jobs: set[asyncio.Task[None]] = set()
        self._capture_jobs: set[asyncio.Task[NativeFrame]] = set()
        self._release_failed = False
        self._cleanup_task: asyncio.Task[bool] | None = None
        self._cleanup_evidence: dict[str, bool | list[str]] = {}
        self.lifecycle_reason: str | None = None

    def startup_descriptor(self, session_id):
        from .recovery import boot_id

        validate_session(session_id)
        if self._descriptor is None:
            self._descriptor = {
                "version": 1, "kind": "processes", "session_id": session_id,
                "boot_id": boot_id(), "no_persistent_devices": True,
                "input_was_enabled": True, "launch_pending": True, "processes": [],
            }
        if self._descriptor["session_id"] != session_id:
            raise ComputerError("wayland_session_identity_changed")
        descriptor = copy.deepcopy(self._descriptor)
        # The companion may retain pending input after guardian death.
        self._descriptor["no_persistent_devices"] = False
        descriptor["no_persistent_devices"] = False
        return descriptor

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

    async def _action_scope(self, metadata, *, deadline_ns=None):
        """Transport-neutral bounded acquisition, owned by this backend."""
        if self._scope_provider is None:
            raise ComputerError("wayland_session_revoked")
        started = time.monotonic_ns()
        expires = started + 250_000_000
        deadline = min(expires, deadline_ns) if deadline_ns is not None else expires
        if deadline <= started:
            raise ComputerError("wayland_scope_evidence_expired")
        pending = asyncio.create_task(self._scope_provider.snapshot(metadata))
        self._scope_jobs.add(pending)

        def finished(task):
            self._scope_jobs.discard(task)
            if not task.cancelled():
                task.exception()

        pending.add_done_callback(finished)
        try:
            done, _ = await asyncio.wait({pending}, timeout=(deadline - started) / 1e9)
            now = time.monotonic_ns()
            if not done or now >= deadline:
                raise ComputerError("wayland_scope_evidence_expired")
            scope = pending.result()
            observed = scope.get("observed_monotonic_ns")
            if type(observed) is not int or not started <= observed <= now:
                raise ComputerError("wayland_scope_evidence_stale")
            return scope, expires
        finally:
            if not pending.done():
                pending.cancel()

    def _new_provider(self):
        from .hyprland_scope import HyprlandScopeProvider

        return HyprlandScopeProvider(
            socket_path=self.config.scope_socket, expected_uid=self.config.expected_uid,
            expected_compositor_pid=self.config.compositor_pid)

    def _metadata(self):
        data: dict[str, str | list[int]] = {"mapping_id": self.config.output_name}
        if self._output:
            data["size"] = [self._output.logical_width, self._output.logical_height]
        return data

    async def start(self, session_id):
        if not self.enabled or self._started or self._closed:
            raise ComputerError("hyprland_backend_not_startable")
        self.startup_descriptor(session_id)
        self._started = True
        try:
            await self._open()
            return {"ok": True, "session_id": session_id, "capture_only": False,
                    "input_supported": True, "input_blocker": None,
                    "input_admission": self.input_admission.public(),
                    "capabilities": self.capabilities.public(), "sources": self.sources()}
        except BaseException as exc:
            await self.stop()
            if isinstance(exc, asyncio.CancelledError):
                raise
            code = exc.code if isinstance(exc, ComputerError) else "hyprland_native_start_failed"
            raise InputAdmissionError(InputAdmission(
                "refused", code, "The explicitly configured native Hyprland path was not ready.",
                "Check the pinned compositor, explicit output and native companion setup."
            )) from None

    async def _open(self):
        from .hyprland_guardian import HyprlandGuardian

        trusted_binary(self.config.capture_binary)
        connection = None
        try:
            self._identity, connection = await pin_connections(
                wayland_path=self.config.wayland_path, ipc_path=self.config.ipc_path,
                expected_pid=self.config.compositor_pid, expected_uid=self.config.expected_uid,
                trust=self.config.compositor_trust)
            connection.close()
            self._scope_provider = self._new_provider()
            scope, _ = await self._action_scope(self._metadata())
            self._output = self._checked_output(scope)
            self._check_scope(scope)
            self._guardian = HyprlandGuardian(
                self.config.guardian_binary, self.config.expected_uid, self._record_spawn)
            self._record_spawn(None)
            await self._guardian.start(
                self.config.wayland_path, self.config.output_name,
                self.config.scope_socket, self.config.compositor_pid,
                self._output.logical_width, self._output.logical_height)
            scope, _ = await self._action_scope(self._metadata())
            self._check_scope(scope)
            await self._guardian.bind_scope(scope)
            self._check_ready(await self._guardian.select(self.config.output_name))
            await revalidate(self._identity, time.monotonic() + 3)
            assert self._descriptor is not None  # Established by startup_descriptor.
            descriptor = copy.deepcopy(self._descriptor)
            descriptor["launch_pending"] = False
            if self.runtime_identity_callback:
                self.runtime_identity_callback(copy.deepcopy(descriptor))
            self._descriptor = descriptor
            self.capabilities = BackendCapabilities(
                "wayland", "existing_session", "shared", "shared", "hyprland_best_effort",
                "verified", backend="hyprland")
            self.input_supported, self.input_blocker = True, None
            self.input_admission = InputAdmission(
                "eligible", "hyprland_best_effort_ready", " ".join(RESIDUALS),
                "Use supervised bounded actions; release-all then renewed consent recovers.",
                compositor=CompositorIdentity("Hyprland", self.config.compositor_trust.version,
                                              "native", self.config.compositor_trust.sha256),
                probe_scope="active_session", checks=(
                    "compositor_executable_and_so_peercred_pinned", "explicit_output_native_scope",
                    "native_guardian_connected", "receiver_release_unmeasured"))
        finally:
            if connection is not None:
                connection.close()

    def _checked_output(self, scope):
        try:
            output = ExplicitOutput(**scope["output"])
        except (KeyError, TypeError):
            raise ComputerError("hyprland_native_output_unavailable") from None
        if output.name != self.config.output_name:
            raise ComputerError("hyprland_explicit_output_changed")
        return output

    def _check_scope(self, scope):
        if self._checked_output(scope) != self._output:
            raise ComputerError("hyprland_explicit_output_changed")
        measured = scope.get("observed_monotonic_ns")
        if (scope.get("locked") is not False or type(measured) is not int
                or scope.get("authenticated") is not True
                or scope.get("native_wayland") is not True or scope.get("safe_focus") is not True
                or not 0 <= time.monotonic_ns() - measured < 250_000_000
                or type(scope.get("native_scope_serial")) is not int
                or scope["native_scope_serial"] < 1
                or not scope.get("native_scope_token")):
            raise ComputerError("hyprland_scope_unknown_locked_or_stale")
        application = scope.get("application")
        if (type(application) is not dict
                or any(type(application.get(k)) is not int for k in ("pid", "uid", "start_ticks"))
                or application["pid"] <= 1 or application["start_ticks"] <= 0
                or application["uid"] != self.config.expected_uid
                or type(application.get("exe")) is not str or not application["exe"].startswith("/")
                or type(application.get("exe_identity")) is not list
                or len(application["exe_identity"]) != 2
                or any(type(n) is not int or n < 0 for n in application["exe_identity"])):
            raise ComputerError("hyprland_application_identity_unavailable")
        if self._application_pin is None:
            self._application_pin = copy.deepcopy(application)
            self._output_pin = self._output
            self._original_surface = scope.get("surface_token")
        elif application != self._application_pin:
            raise ComputerError("hyprland_original_application_changed")
        if self._output != self._output_pin:
            raise ComputerError("hyprland_explicit_output_changed")
        # Native floating is a dialog candidate, not proof that a floating
        # original canvas is modal. Returning to that canvas clears the modal.
        if scope.get("surface_token") == self._original_surface:
            scope["modal"] = False
            scope["modal_kind"] = None
            scope["modal_title_digest"] = None

    def _check_ready(self, ready):
        assert self._guardian is not None and self._output is not None
        if (not self._guardian.alive or ready.get("width") != self._output.logical_width
                or ready.get("height") != self._output.logical_height):
            raise ComputerError("hyprland_input_extent_mismatch")

    def _active(self):
        if (not self._started or self._closed or self._paused or self._identity is None
                or self._scope_provider is None or self._guardian is None
                or not self._guardian.alive):
            raise ComputerError("hyprland_session_revoked")

    def sources(self):
        width, height = self._output.oriented_size if self._output else (0, 0)
        return [{"source_id": self._selected, "label": "Explicitly granted Hyprland output",
                 "width": width, "height": height}]

    @property
    def input_readiness(self):
        if self._closed or self._paused or not self.input_supported:
            return "inactive"
        if self._frame is None or not 0 <= time.monotonic() - self._captured_at <= 5:
            return "observation_required"
        return "ready"

    async def select_source(self, source_id):
        async with self._lock:
            self._active()
            if source_id != self._selected:
                raise ComputerError("hyprland_capture_source_not_granted")
            self._frame = None
            return {"selected_source": source_id, "capture_only": False}

    @property
    def application_provenance(self):
        return canonical_application_provenance(self._scope)

    async def _capture(self, crop=None):
        self._active()
        assert self._identity is not None and self._output is not None
        generation = self._generation
        last_scope = None

        async def proof():
            nonlocal last_scope
            self._active()
            assert self._identity is not None and self._output is not None
            if generation != self._generation:
                raise ComputerError("hyprland_generation_revoked")
            scope, _ = await self._action_scope(self._metadata())
            self._check_scope(scope)
            last_scope = scope
            return ScopeProof(
                self._identity.digest, self._output, scope["native_scope_serial"], generation,
                scope["observed_monotonic_ns"], scope["locked"], _digest(_binding(scope)))

        trusted_binary(self.config.capture_binary)
        connection = await connect_peer(
            self.config.wayland_path, self.config.compositor_pid, self.config.expected_uid,
            time.monotonic() + 3)
        captured_at = time.monotonic()
        capturing = asyncio.create_task(capture_explicit_output(
            helper=self.config.capture_binary, wayland=connection, identity=self._identity,
            output=self._output, scope=proof, on_spawn=self._record_spawn))
        self._capture_jobs.add(capturing)
        try:
            native = await capturing
        finally:
            self._capture_jobs.discard(capturing)
        captured_binding = _binding(last_scope)
        rendered = await asyncio.to_thread(_render_native, native, crop)
        self._active()
        if generation != self._generation:
            raise ComputerError("hyprland_capture_generation_changed")
        await proof()
        if captured_binding != _binding(last_scope):
            raise ComputerError("hyprland_capture_scope_changed")
        return rendered, last_scope, captured_at

    async def observe(self, crop=None):
        async with self._lock:
            rendered, scope, captured_at = await self._capture(crop)
            self._check_scope(scope)
            fingerprint = _digest([self._selected, self._generation, _binding(scope)])
            if fingerprint != self._fingerprint:
                self._revision += 1
                self._fingerprint = fingerprint
            assert self._output is not None
            width, height = self._output.oriented_size
            source = SourceGeometry(
                self._selected, self._revision, self._generation, width, height,
                input_region_id=self._selected, input_width=Fraction(self._output.logical_width),
                input_height=Fraction(self._output.logical_height),
                pixel_to_input=AffineTransform(a=Fraction(self._output.logical_width, width),
                                              e=Fraction(self._output.logical_height, height)))
            fm = rendered.metadata
            frame = BackendObservation(
                source, CaptureScope(self._generation, frozenset({self._selected}),
                                     frozenset({self._selected})),
                fm.width, fm.height, fm.delivered_to_source, rendered.png, focused=True,
                crop=(fm.crop.x, fm.crop.y, fm.crop.width, fm.crop.height) if fm.crop else None,
                resize_scale=fm.resize_scale, resize_rounding=fm.resize_rounding,
                modal=scope.get("modal_title_digest") if scope.get("modal") else None,
                modal_kind=scope.get("modal_kind") if scope.get("modal") else None)
            self._frame, self._scope, self._captured_at = frame, scope, captured_at
            self._crop = dict(crop) if crop else None
            return frame

    capture = observe

    async def _watch_action(self, original, generation, lease) -> None:
        assert self._guardian is not None
        try:
            while True:
                await asyncio.sleep(min(0.05, max(0, (lease[0] - time.monotonic_ns()) / 1e9)))
                self._active()
                fresh, deadline = await self._action_scope(self._metadata(), deadline_ns=lease[0])
                self._check_scope(fresh)
                if generation != self._generation or _binding(fresh) != _binding(original):
                    raise ComputerError("hyprland_focus_changed")
                await self._guardian.bind_scope(fresh)
                await self._guardian.refresh_scope(deadline)
                lease[0] = deadline
        except asyncio.CancelledError:
            raise
        except Exception:
            self._paused = True
            self._frame = None
            self.input_supported = False
            result = await self._guardian.close()
            self._release_failed |= not self._release_ack(result)

    async def act(self, action):
        async with self._lock:
            self._active()
            assert self._guardian is not None and self._identity is not None
            frame, scope = self._frame, self._scope
            if (not self.input_supported or self.input_admission.state != "eligible"
                    or self._release_failed or frame is None or scope is None
                    or not frame.focused or not 0 <= time.monotonic() - self._captured_at <= 5):
                raise ComputerError("hyprland_fresh_application_observation_required")
            command = self._command(action, frame, scope)
            rendered, fresh, _ = await self._capture(self._crop)
            stable = rendered.png == frame.image_bytes
            if not stable and action["type"] in {
                "click", "double_click", "right_click", "middle_click", "scroll", "polyline",
            }:
                from ..grounding import pointer_target_stable

                anchor = (action["points"][0] if action["type"] == "polyline"
                          else (action["x"], action["y"]))
                stable = pointer_target_stable(frame.image_bytes, rendered.png, *anchor)
            if (not stable or rendered.metadata.width != frame.width
                    or rendered.metadata.height != frame.height
                    or _binding(scope) != _binding(fresh)):
                self._frame = None
                raise ComputerError("hyprland_observation_changed")
            await revalidate(self._identity, time.monotonic() + 3)
            self._check_ready(await self._guardian.select(self.config.output_name))
            fresh, deadline = await self._action_scope(self._metadata())
            self._check_scope(fresh)
            if _binding(fresh) != _binding(scope):
                self._frame = None
                raise ComputerError("hyprland_focus_changed_before_dispatch")
            await self._guardian.bind_scope(fresh)
            self._active()
            if not 0 <= time.monotonic() - self._captured_at <= 5:
                raise ComputerError("hyprland_observation_expired")
            self._frame = None
            lease, generation = [deadline], self._generation
            watchdog = asyncio.create_task(self._watch_action(fresh, generation, lease))
            self._jobs.add(watchdog)

            async def pixel_guard():
                self._active()
                current, _ = await self._action_scope(self._metadata(), deadline_ns=lease[0])
                self._check_scope(current)
                if generation != self._generation or _binding(current) != _binding(scope):
                    raise ComputerError("hyprland_focus_changed")

            try:
                if time.monotonic_ns() >= lease[0]:
                    raise ComputerError("hyprland_scope_evidence_expired")
                kwargs = {"scope_deadline_ns": deadline}
                if action["type"] == "replace_field_pixels":
                    kwargs["pixel_guard"] = pixel_guard
                delivered = await self._guardian.act(command, **kwargs)
                if (self._paused or self._closed or generation != self._generation
                        or time.monotonic_ns() >= lease[0]
                        or delivered.get("event") != "action_done"
                        or not self._release_ack(delivered)):
                    raise ComputerError("hyprland_action_revoked_outcome_unknown")
                if delivered.get("input_was_sent") is False:
                    return {"status": "unavailable", "injected": False, "released": True,
                            "reason": "hyprland_native_no_input_sent"}
                receipt = {
                    "status": "executed", "injected": True, "released": True,
                    "targeting_path": (
                        "explicit_pixel_region" if action["type"] == "replace_field_pixels"
                        else "native_window_focus" if action["type"] in {"type", "key"}
                        else "observed_pixel_coordinates"),
                    "release_basis": "hyprland_cooperative_native_ack_best_effort",
                    "receiver_release_verified": False, "residuals": list(RESIDUALS),
                    "application_provenance": canonical_application_provenance(scope),
                    "postcondition": {
                        "type": "visual_change", "status": "unavailable",
                        "source_id": frame.source.source_id,
                        "source_revision": frame.source.source_revision,
                        "consent_generation": frame.source.consent_generation}}
                if "diagnostics" in delivered:
                    receipt["diagnostics"] = delivered["diagnostics"]
            except BaseException as exc:
                details = getattr(exc, "details", {})
                if (details.get("event") == "action_rejected"
                        and details.get("input_was_sent") is False):
                    return {"status": "unavailable", "injected": False, "released": True,
                            "reason": details.get("reason", "hyprland_action_rejected")}
                self._paused = True
                self.input_supported = False
                cleanup = await self._guardian.close()
                self._release_failed |= not self._release_ack(cleanup)
                raise
            finally:
                watchdog.cancel()
                await asyncio.gather(watchdog, return_exceptions=True)
                self._jobs.discard(watchdog)
            try:
                after, after_scope, _ = await self._capture(self._crop)
                receipt["postcondition"].update(
                    status="observed", method="raster_digest_after_release",
                    target_application_matches=(scope["application"] == after_scope["application"]
                                                and scope["source_digest"]
                                                == after_scope["source_digest"]),
                    actual={"before_sha256": hashlib.sha256(rendered.png).hexdigest(),
                            "after_sha256": hashlib.sha256(after.png).hexdigest()})
                if (scope.get("surface_token") != after_scope.get("surface_token")
                        and after_scope.get("modal_kind") == "safe_application"):
                    # Not a complete map inventory: a focused dialog candidate
                    # may already have existed. Do not claim dialog_appeared.
                    receipt["postcondition"]["focused_dialog_transition"] = {
                        "method": "native_same_process_focused_dialog_transition",
                        "kind": "dialog_candidate", "newly_mapped": "unmeasured"}
            except Exception:
                pass
            # Controller delivers the next observation and checks region/stroke effects.
            return receipt

    @staticmethod
    def _release_ack(receipt):
        return receipt.get("release_ack") is True

    def _invalidate(self):
        self._paused = True
        self.input_supported = False
        self._frame = self._scope = self._fingerprint = None
        self._revision += 1

    async def _cleanup_all(self) -> bool:
        captures = tuple(self._capture_jobs)
        for job in captures:
            job.cancel()
        if captures:
            await asyncio.gather(*captures, return_exceptions=True)
        for scope_job in tuple(self._scope_jobs):
            scope_job.cancel()
        jobs = tuple(self._jobs)
        for action_job in jobs:
            action_job.cancel()
        if jobs:
            await asyncio.gather(*jobs, return_exceptions=True)
        released = reaped = self._guardian is None
        if self._guardian:
            try:
                result = await asyncio.wait_for(self._guardian.close(), 4)
                released, reaped = self._release_ack(result), result.get("process_reaped") is True
            except (Exception, asyncio.CancelledError):
                released = reaped = False
        scope_closed = self._scope_provider is None
        if self._scope_provider:
            try:
                await asyncio.wait_for(self._scope_provider.close(), 0.5)
                scope_closed = True
            except (Exception, asyncio.CancelledError):
                scope_closed = False
        self._release_failed |= not released
        clean = released and reaped and scope_closed and not self._release_failed
        self._cleanup_evidence = {
            "guardian_process_reaped": reaped, "scope_connection_closed": scope_closed,
            "hyprland_owned_connections_closed": clean,
            "release_ack": released, "receiver_release_verified": False,
            "residuals": list(RESIDUALS)}
        return clean

    async def _cleanup(self):
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_all())
        return await asyncio.shield(self._cleanup_task)

    async def pause(self):
        self._invalidate()
        async with self._stop_lock:
            clean = await self._cleanup()
        return {"paused": True, "input_revoked": True, "capture_revoked": True,
                "released": clean, **self._cleanup_evidence}

    async def recover_owned_input(self):
        """Operator-only native recovery; never automatic resume or qualification."""
        self._invalidate()
        async with self._stop_lock:
            await self._cleanup()
            provider = self._new_provider()
            released = False
            try:
                if self._identity is None:
                    raise ComputerError("hyprland_recovery_identity_unavailable")
                await revalidate(self._identity, time.monotonic() + 3)
                result = await asyncio.wait_for(provider.release_all(), 3)
                released = (self._release_ack(result)
                            and self._cleanup_evidence.get("guardian_process_reaped") is True)
                if released:
                    self._release_failed = False
                    self._guardian = None
            finally:
                await provider.close()
        return {"paused": True, "input_revoked": True, "capture_revoked": True,
                "released": released, "release_ack": released,
                "receiver_release_verified": False, "residuals": list(RESIDUALS)}

    async def resume(self, *, consent_generation):
        if (self._closed or not self._paused or self._release_failed
                or type(consent_generation) is not int or consent_generation <= self._generation):
            raise ComputerError("hyprland_renewed_session_consent_required")
        async with self._stop_lock:
            if not await self._cleanup():
                raise ComputerError("hyprland_owned_cleanup_unverified")
            self._generation = consent_generation
            self._guardian = self._scope_provider = self._identity = self._output = None
            self._paused = False
            try:
                await self._open()
            except BaseException:
                self._invalidate()
                await self._cleanup()
                raise
        return {"resumed": True, "capture_only": False,
                "input_admission": self.input_admission.public()}

    async def detach(self):
        self._closed = True
        self._invalidate()
        async with self._stop_lock:
            clean = await self._cleanup()
        return {"stopped": clean, "released": clean, "applications_preserved": True,
                "input_revoked": True, "capture_revoked": True, **self._cleanup_evidence,
                "owned_devices": "hyprland_owned_connections_closed" if clean else "unknown",
                "state": "closed" if clean else "quarantined",
                "recovery": None if clean else "hyprland_operator_release_all_required"}

    stop = detach
    close = detach

    async def export(self, name):
        raise ComputerError("existing_session_export_not_granted")
