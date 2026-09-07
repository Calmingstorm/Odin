"""Explicit attached X11 capture and opt-in app-scoped supervised XTEST input.

Shared cursor/focus and same-key overlap are limitations, not separation claims.
No application/session is launched or destroyed. Input creates no native devices.
"""
from __future__ import annotations

import asyncio
import base64
import copy
import hashlib
import json
import re
import sys
import time
import uuid
from fractions import Fraction
from pathlib import Path

from ..geometry import AffineTransform, SourceGeometry
from ..models import BackendCapabilities, BackendObservation, CaptureScope
from .profile import validate_session

MAX_REPLY = 3 * 1024 * 1024
CAPTURE_TIMEOUT = 5.0
INPUT_BLOCKER = "existing_x11_input_not_enabled"


class AttachedFailure(RuntimeError):  # noqa: N818 - Mirrors runtime adapter failure API.
    """Static failure with no native IDs, pixels, titles or credentials."""


def attachment_configuration(display_name, xauthority, monitor_names, app_profile):
    if type(display_name) is not str or not re.fullmatch(r":[0-9]{1,5}", display_name):
        raise AttachedFailure("explicit_local_display_required")
    if (type(xauthority) is not str or (xauthority and not xauthority.startswith("/"))
            or any(ord(c) < 32 for c in xauthority)):
        raise AttachedFailure("explicit_authority_path_required")
    if (not isinstance(monitor_names, (tuple, list)) or not 1 <= len(monitor_names) <= 16
            or any(type(n) is not str or not 1 <= len(n) <= 128
                   or any(ord(c) < 32 for c in n) for n in monitor_names)
            or len(set(monitor_names)) != len(monitor_names)):
        raise AttachedFailure("explicit_monitor_names_required")
    if app_profile not in {"drawing", "xed"}:
        raise AttachedFailure("unapproved_application_profile")
    return {"display_name": display_name, "monitor_names": list(monitor_names),
            "app_profile": app_profile, "xauthority": xauthority}


def worker_environment(xauthority):
    return {"PATH": "/usr/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
            "HOME": "/nonexistent", "XAUTHORITY": xauthority or "/dev/null",
            "PYTHONDONTWRITEBYTECODE": "1"}


class X11AttachedBackend:
    creates_devices = False
    input_limits = {"text": "printable_ascii_existing_keymap_only", "lease_seconds": 2,
                    "cursor": "shared_not_restored", "keyboard_overlap": "uncertain_no_replay"}
    capabilities = BackendCapabilities("x11", "existing_session", "unknown", "unknown",
                                       "unknown", "verified")
    input_supported = False
    input_blocker: str | None = INPUT_BLOCKER

    def __init__(self, *, enabled=False, display_name="", xauthority="",
                 monitor_names=(), app_profile="drawing", input_enabled=False,
                 runtime_sudo=False):
        self.enabled = enabled
        self._config = attachment_configuration(
            display_name, xauthority, monitor_names, app_profile)
        if type(input_enabled) is not bool:
            raise AttachedFailure("invalid_input_configuration")
        self._input_enabled = input_enabled
        if type(runtime_sudo) is not bool:
            raise AttachedFailure("invalid_runtime_privilege_configuration")
        self._runtime_sudo = runtime_sudo
        self.input_supported = input_enabled and not runtime_sudo
        self.input_blocker = None if input_enabled else INPUT_BLOCKER
        if input_enabled:
            self.capabilities = BackendCapabilities("x11", "existing_session", "shared", "shared",
                                                    "verified", "verified")
        self._started = self._closed = self._paused = False
        self._generation = 1
        self._revision = 0
        self._sources = {}
        self._selected = None
        self._children = set()
        self._guardians = set()
        self._worker_identities = {}
        self._release_failed = False
        self._frame = self._scope = self._fingerprint = None
        self._modal_id = None
        self._captured_at = 0.0
        self._runtime_descriptor = None
        self.runtime_identity_callback = None
        self._spawn_lock = asyncio.Lock()
        self._lock = asyncio.Lock()
        self._stop_lock = asyncio.Lock()

    def startup_descriptor(self, session_id):
        from .recovery import boot_id
        validate_session(session_id)
        if self._runtime_descriptor is None:
            self._runtime_descriptor = {
                "version": 1, "kind": "processes", "session_id": session_id,
                "boot_id": boot_id(), "no_persistent_devices": True,
                "input_was_enabled": self._input_enabled, "launch_pending": False,
                "processes": []}
        return copy.deepcopy(self._runtime_descriptor)

    def _record_spawn(self, child=None, *, identity=None, pending=False):
        if self._runtime_descriptor is None:
            return
        from .recovery import process_identity
        descriptor = copy.deepcopy(self._runtime_descriptor)
        if child is None and identity is None:
            if len(descriptor["processes"]) >= 2048:
                raise AttachedFailure("runtime_process_limit")
            descriptor["launch_pending"] = True
        else:
            identity = identity or process_identity(child.pid)
            if not identity:
                raise AttachedFailure("runtime_process_identity_unavailable")
            descriptor["processes"].append({k: identity[k] for k in ("pid", "start_ticks")})
            descriptor["launch_pending"] = pending
        if self.runtime_identity_callback is not None:
            self.runtime_identity_callback(copy.deepcopy(descriptor))
        self._runtime_descriptor = descriptor

    def _worker_argv(self, filename):
        if filename not in {"x11_attached_worker.py", "x11_guardian.py"}:
            raise AttachedFailure("unapproved_worker")
        argv = [sys.executable, "-I", str(Path(__file__).with_name(filename))]
        if self._runtime_sudo:
            # Explicit operator privilege, no fallback. Clear ambient X authority.
            argv = ["/usr/bin/sudo", "-n", "--", "/usr/bin/env", "-i"] + [
                f"{key}={value}" for key, value in
                worker_environment(self._config["xauthority"]).items()] + argv + ["--identity-gate"]
        return argv

    async def _worker_ready(self, child, role, *, parent=None, pending=False):
        """Private stdout identity, verified against proc before persistence/ACK."""
        from .recovery import process_identity
        assert child.stdout is not None
        line = await asyncio.wait_for(child.stdout.readline(), 2)
        message = json.loads(line)
        identity = message.get("identity")
        if (message.get("ready") != role or type(identity) is not dict
                or set(identity) != {"pid", "start_ticks"}
                or any(type(v) is not int or v <= 0 for v in identity.values())
                or process_identity(identity["pid"]) != identity):
            raise AttachedFailure("worker_identity_unverified")
        pid = identity["pid"]
        status = Path(f"/proc/{pid}/status").read_text()
        uids = next(line for line in status.splitlines() if line.startswith("Uid:")).split()[1:]
        if uids != ["0"] * 4:
            raise AttachedFailure("worker_privilege_unverified")
        # sudo may insert a monitor. Require exact ancestry, not argv or wrapper absence.
        ancestor = pid
        for _ in range(8):
            if ancestor == (parent or child.pid):
                break
            text = Path(f"/proc/{ancestor}/stat").read_text()
            ancestor = int(text[text.rindex(")") + 2:].split()[1])
        else:
            raise AttachedFailure("worker_ancestry_unverified")
        self._worker_identities.setdefault(child, []).append(identity)
        self._record_spawn(identity=identity, pending=pending)
        return identity

    async def _identities_gone(self, child, timeout=1):
        from .recovery import process_identity
        if not self._worker_identities.get(child):
            return False
        deadline = time.monotonic() + timeout
        while True:
            remaining = False
            for identity in self._worker_identities.get(child, []):
                try:
                    remaining |= process_identity(identity["pid"]) == identity
                except FileNotFoundError:
                    pass
                except (OSError, ValueError):
                    return False
            if not remaining:
                return True
            if time.monotonic() >= deadline:
                return False
            await asyncio.sleep(.02)

    async def _reap(self, child):
        assert child.stdin is not None
        if self._runtime_sudo:
            child.stdin.close()
            try:
                await asyncio.wait_for(child.wait(), 6)
                if not await self._identities_gone(child):
                    raise AttachedFailure("privileged_worker_remaining")
            except Exception:
                self._release_failed = True
            else:
                self._children.discard(child)
            return
        if child.returncode is None:
            try:
                child.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(child.wait(), .3)
            except TimeoutError:
                try:
                    child.kill()
                except ProcessLookupError:
                    pass
                await child.wait()
        self._children.discard(child)

    async def _read_worker(self, operation, *, selected=None):
        if self._closed or self._paused:
            raise AttachedFailure("capture_revoked")
        request = {**self._config, "operation": operation, "input_enabled": self._input_enabled}
        if selected is not None:
            request["selected"] = selected
        async with self._spawn_lock:
            if self._closed or self._paused:
                raise AttachedFailure("capture_revoked")
            self._record_spawn()
            child = await asyncio.create_subprocess_exec(
                *self._worker_argv("x11_attached_worker.py"),
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=worker_environment(self._config["xauthority"]), start_new_session=True,
                limit=MAX_REPLY + 1)
            self._children.add(child)
        assert child.stdin is not None and child.stdout is not None
        try:
            self._record_spawn(child, pending=self._runtime_sudo)
            if self._runtime_sudo:
                await self._worker_ready(child, "capture")
            if self._closed or self._paused:
                raise AttachedFailure("capture_revoked")

            async def communicate_bounded():
                assert child.stdin is not None and child.stdout is not None
                child.stdin.write(json.dumps(request).encode() + b"\n")
                await child.stdin.drain()
                child.stdin.close()
                output = await child.stdout.readline()
                if len(output) > MAX_REPLY or not output.endswith(b"\n"):
                    raise AttachedFailure("capture_reply_limit")
                await child.wait()
                return output

            output = await asyncio.wait_for(communicate_bounded(), CAPTURE_TIMEOUT)
            if child.returncode != 0 or self._closed:
                raise AttachedFailure("capture_worker_failed_or_revoked")
            reply = json.loads(output)
            if type(reply) is not dict or reply.get("ok") is not True:
                raise AttachedFailure("capture_unavailable")
            return reply
        except asyncio.CancelledError:
            raise
        except AttachedFailure:
            raise
        except Exception:
            raise AttachedFailure("capture_unavailable") from None
        finally:
            await asyncio.shield(self._reap(child))

    async def start(self, session_id):
        if not self.enabled:
            raise AttachedFailure("capture_disabled")
        validate_session(session_id)
        if self._started or self._closed:
            raise AttachedFailure("backend_single_use")
        self._started = True
        try:
            reply = await self._read_worker("sources")
            monitors = reply["sources"]
            if (type(monitors) is not list or len(monitors) != len(self._config["monitor_names"])
                    or any(type(m) is not dict or m.get("name") not in self._config["monitor_names"]
                           for m in monitors)):
                raise AttachedFailure("selected_sources_unavailable")
            for monitor in monitors:
                self._sources[uuid.uuid4().hex] = monitor
            self.input_supported = self._input_enabled
            self._selected = next(iter(self._sources))
            return {"ok": True, "session_id": session_id, "capture_only": not self._input_enabled,
                    "input_supported": self.input_supported, "input_blocker": self.input_blocker,
                    "input_limits": dict(self.input_limits),
                    "sources": self.sources(), "capabilities": self.capabilities.public()}
        except BaseException:
            await asyncio.shield(self.detach())
            raise

    def sources(self):
        return [{"source_id": identity, "label": value["name"],
                 "width": value["width"], "height": value["height"]}
                for identity, value in self._sources.items()]

    async def select_source(self, source_id):
        async with self._lock:
            if self._closed or self._paused or not self._started:
                raise AttachedFailure("capture_not_active")
            if source_id not in self._sources:
                raise AttachedFailure("capture_source_not_granted")
            self._selected = source_id
            self._frame = None
            return {"selected_source": source_id, "capture_only": not self._input_enabled}

    async def observe(self):
        async with self._lock:
            if not self._started or self._closed or self._paused or self._selected is None:
                raise AttachedFailure("capture_not_active")
            selected_id = self._selected
            generation = self._generation
            captured_at = time.monotonic()
            reply = await self._read_worker("capture", selected=self._sources[selected_id])
            if self._paused or self._closed or generation != self._generation:
                raise AttachedFailure("capture_revoked")
            binding = reply.get("input_scope") if self._input_enabled else None
            fingerprint = (selected_id, generation, self._sources[selected_id], binding)
            if fingerprint != self._fingerprint:
                self._revision += 1
                self._fingerprint = fingerprint
                self._modal_id = uuid.uuid4().hex if binding and binding.get("modal") else None
            eligible = bool(binding and binding.get("focused") is True and
                            binding.get("modal_kind") in {None, "safe_application"})
            mapping = ({"input_region_id": selected_id, "input_width": reply["source_width"],
                        "input_height": reply["source_height"], "pixel_to_input": AffineTransform()}
                       if eligible else {})
            source = SourceGeometry(selected_id, self._revision, self._generation,
                                    reply["source_width"], reply["source_height"], **mapping)
            scope = CaptureScope(self._generation, frozenset({selected_id}),
                                 frozenset({selected_id}) if eligible else frozenset())
            try:
                image = base64.b64decode(reply["image"], validate=True)
                if len(image) > 2 * 1024 * 1024:
                    raise ValueError("image limit")
                transform = AffineTransform(**{
                    key: Fraction(*value) for key, value in reply["delivered_to_source"].items()})
                frame = BackendObservation(source, scope, reply["width"], reply["height"],
                                           transform, image, focused=eligible,
                                           modal=self._modal_id,
                                           modal_kind=(binding.get("modal_kind")
                                                       if binding else None),
                                           resize_scale=tuple(reply["resize_scale"]))
                self._frame, self._scope, self._captured_at = frame, binding, captured_at
                return frame
            except Exception:
                raise AttachedFailure("invalid_capture_reply") from None

    capture = observe

    async def act(self, action):
        if not self._input_enabled:
            raise AttachedFailure(INPUT_BLOCKER)
        async with self._lock:
            frame = self._frame
            if (self._closed or self._paused or self._release_failed or frame is None
                    or not frame.focused or not self._scope
                    or not 0 <= time.monotonic() - self._captured_at <= 5):
                raise AttachedFailure("fresh_app_scoped_observation_required")
            fields = {"click": {"x", "y"}, "type": {"text"}, "key": {"chord"},
                      "polyline": {"points", "duration"}}
            required = {"type", "source_id", "source_revision", "consent_generation", "expected"}
            if (type(action) is not dict or type(action.get("type")) is not str
                    or action["type"] not in fields
                    or set(action) - {"expected_modal"} != required | fields[action["type"]]):
                raise AttachedFailure("unsupported_grounded_action")
            for key in ("source_id", "source_revision", "consent_generation"):
                if (type(action[key]) is not type(getattr(frame.source, key))
                        or action[key] != getattr(frame.source, key)):
                    raise AttachedFailure("stale_source_binding")
            if frame.modal is not None:
                if (frame.modal_kind != "safe_application"
                        or action.get("expected_modal") != frame.modal):
                    raise AttachedFailure("unexpected_modal")
            elif "expected_modal" in action:
                raise AttachedFailure("stale_modal_binding")
            if action["expected"] != {"type": "visual_change"}:
                raise AttachedFailure("attached_visual_postcondition_required")
            payload = {"type": action["type"]}
            if action["type"] == "type":
                text = action["text"]
                if (type(text) is not str or not 1 <= len(text) <= 512
                        or any(not 32 <= ord(c) <= 126 for c in text)):
                    raise AttachedFailure("printable_ascii_only")
            elif action["type"] == "key":
                from ..gui_actions import KEYS
                if type(action["chord"]) is not str or action["chord"] not in KEYS:
                    raise AttachedFailure("unsupported_key")
            elif action["type"] == "polyline":
                duration = action["duration"]
                if type(duration) not in (int, float) or not 0 <= duration <= 1:
                    raise AttachedFailure("invalid_polyline_duration")
            monitor = self._sources[self._selected]
            # Native origins are never accepted from model/public transport.
            origin = self._scope["source_origin"]
            def point(p):
                if (type(p) is not list or len(p) != 2 or any(type(v) is not int for v in p)):
                    raise AttachedFailure("invalid_point")
                local = frame.source.input_point(frame.delivered_to_source, *p,
                                                 frame.width, frame.height)
                return [int(local[0]) + origin[0], int(local[1]) + origin[1]]
            if action["type"] == "click":
                payload["x"], payload["y"] = point([action["x"], action["y"]])
            elif action["type"] == "polyline":
                if type(action["points"]) is not list or not 2 <= len(action["points"]) <= 256:
                    raise AttachedFailure("invalid_polyline")
                payload.update(points=[point(p) for p in action["points"]],
                               duration=action["duration"])
            else:
                key = "text" if action["type"] == "type" else "chord"
                payload[key] = action[key]
            request = {**self._config, "selected": monitor, "scope": self._scope, "action": payload}
            self._frame = None  # Consume before dispatch; lost replies are not retryable.
            receipt = await self._input_worker(request)
            if receipt.get("released") is not True:
                self._release_failed = True
                self._paused = True
            receipt["postcondition"] = {"type": "visual_change", "status": "unavailable",
                                         "source_id": frame.source.source_id,
                                         "source_revision": frame.source.source_revision,
                                         "consent_generation": frame.source.consent_generation}
            if (receipt.get("released") is True and receipt.get("status") == "executed"
                    and not self._closed and not self._paused):
                try:
                    after = await self._read_worker("capture", selected=monitor)
                    data = base64.b64decode(after["image"], validate=True)
                    evidence = receipt["postcondition"]
                    evidence.update(
                        status="observed", method="raster_digest_after_release",
                        target_application_matches=after.get("input_scope") == self._scope,
                        actual={"before_sha256": hashlib.sha256(frame.image_bytes).hexdigest(),
                                "after_sha256": hashlib.sha256(data).hexdigest()})
                except Exception:
                    pass  # Actual input receipt stays; verification explicitly unavailable.
            return receipt

    async def _input_worker(self, request):
        async with self._spawn_lock:
            if self._closed or self._paused:
                raise AttachedFailure("input_revoked")
            self._record_spawn()
            child = await asyncio.create_subprocess_exec(
                *self._worker_argv("x11_guardian.py"),
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=worker_environment(self._config["xauthority"]),
                start_new_session=True, limit=65536)
            self._guardians.add(child)
        assert child.stdin is not None and child.stdout is not None
        received = False
        try:
            self._record_spawn(child, pending=self._runtime_sudo)
            guardian_identity = None
            if self._runtime_sudo:
                guardian_identity = await self._worker_ready(child, "guardian", pending=True)
            if self._closed or self._paused:
                raise AttachedFailure("input_revoked")
            child.stdin.write(json.dumps(request).encode() + b"\n")
            await child.stdin.drain()
            if self._runtime_sudo:
                assert guardian_identity is not None
                identity = await self._worker_ready(child, "injector",
                    parent=guardian_identity["pid"])
                if self._closed or self._paused:
                    raise AttachedFailure("input_revoked")
                child.stdin.write(json.dumps({"ack": identity}).encode() + b"\n")
                await child.stdin.drain()
            # Do not close stdin: controller EOF is revocation, not framing.
            line = await asyncio.wait_for(child.stdout.readline(), 4)
            await asyncio.wait_for(child.wait(), 1)
            if self._runtime_sudo and not await self._identities_gone(child):
                raise AttachedFailure("privileged_worker_remaining")
            receipt = json.loads(line)
            if child.returncode != 0 or type(receipt) is not dict:
                raise AttachedFailure("input_outcome_unknown")
            if receipt.get("released") is not True:
                self._release_failed = True
            received = True
            return receipt
        except asyncio.CancelledError:
            raise
        except Exception:
            raise AttachedFailure("input_outcome_unknown") from None
        finally:
            child.stdin.close()
            async def revoke():
                assert child.stdout is not None
                try:
                    await asyncio.wait_for(child.wait(), 3)
                    if not received:
                        line = await asyncio.wait_for(child.stdout.readline(), 1)
                        receipt = json.loads(line)
                        if receipt.get("released") is not True:
                            self._release_failed = True
                    if self._runtime_sudo and not await self._identities_gone(child):
                        self._release_failed = True
                except Exception:
                    self._release_failed = True
                # Never kill the release supervisor to manufacture a clean stop.
                if child.returncode is not None:
                    self._guardians.discard(child)
            await asyncio.shield(revoke())

    async def export(self, name):
        raise AttachedFailure("existing_session_export_not_granted")

    async def pause(self):
        self._paused = True
        self._frame = None
        async with self._spawn_lock:
            for child in tuple(self._guardians):
                child.stdin.close()
            for child in tuple(self._children):
                await asyncio.shield(self._reap(child))
        await self._wait_guardians()
        return {"paused": True, "input_revoked": True, "capture_revoked": True,
                "released": not self._release_failed}

    async def resume(self, *, consent_generation):
        if self._closed or not self._paused:
            raise AttachedFailure("capture_not_paused")
        if type(consent_generation) is not int or consent_generation <= self._generation:
            raise AttachedFailure("renewed_capture_consent_required")
        self._generation = consent_generation
        if self._release_failed:
            raise AttachedFailure("owned_release_unverified")
        self._paused = False
        return {"resumed": True, "capture_only": not self._input_enabled}

    async def _wait_guardians(self):
        for child in tuple(self._guardians):
            try:
                await asyncio.wait_for(asyncio.shield(child.wait()), 3)
            except TimeoutError:
                self._release_failed = True
        # Each action owner consumes its receipt and records cleanup failure.
        async with self._lock:
            pass

    async def detach(self):
        self._closed = True
        self._paused = True
        async with self._stop_lock:
            async with self._spawn_lock:
                for child in tuple(self._guardians):
                    child.stdin.close()
                for child in tuple(self._children):
                    await asyncio.shield(self._reap(child))
            await self._wait_guardians()
            return {"stopped": not self._release_failed, "released": not self._release_failed,
                    "applications_preserved": True,
                    "input_revoked": True, "capture_revoked": True,
                    "owned_devices": "not_created", "input_was_enabled": self._input_enabled,
                    "state": "quarantined" if self._release_failed else "closed"}

    stop = detach
    close = detach
