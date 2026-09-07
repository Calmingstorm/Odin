"""Attached capture and input with persistent XI2 devices and shared widget focus.

No application/session is launched or destroyed, and devices are never removed.
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
from ..models import BackendCapabilities, BackendObservation, CaptureScope, ComputerError
from .profile import validate_session

MAX_REPLY = 3 * 1024 * 1024
CAPTURE_TIMEOUT = 5.0
CLEANUP_TIMEOUT = 9.0
INPUT_BLOCKER = "existing_x11_input_not_enabled"


class AttachedFailure(RuntimeError):  # noqa: N818 - Mirrors runtime adapter failure API.
    """Static failure with no native IDs, pixels, titles or credentials."""


def attachment_configuration(display_name, xauthority, monitor_names, app_profile=None):
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
    return {"display_name": display_name, "monitor_names": list(monitor_names),
            "xauthority": xauthority}


def worker_environment(xauthority):
    return {"PATH": "/usr/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
            "HOME": "/nonexistent", "XAUTHORITY": xauthority or "/dev/null",
            "PYTHONDONTWRITEBYTECODE": "1"}


def same_application_scope(before, after):
    """Fresh trusted process/source and same top-level family, not exact focus.

    Postcondition evidence only, never permission to reuse an observation.
    Both scopes originate in AppScope's XRes/process and rejection checks.
    """
    if not isinstance(before, dict) or not isinstance(after, dict):
        return False
    if (not before.get("process") or before.get("process") != after.get("process")
            or after.get("focused") is not True
            or after.get("modal_kind") not in {None, "safe_application"}):
        return False
    for field in ("topology", "source_rect", "source_origin"):
        if field not in before or before[field] != after.get(field):
            return False
    def root(scope):
        chain = scope.get("transient_chain") or []
        return chain[-1] if chain else scope.get("window")
    return bool(root(before)) and root(before) == root(after)


class X11AttachedBackend:
    creates_devices = False
    input_limits = {"text": "unicode_existing_keymap_only", "lease_seconds": 2,
                    "widget_focus": "shared_within_window",
                    "keyboard_overlap": "uncertain_no_replay"}
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
        self.input_supported = False  # Probed at startup, never a configured lifecycle claim.
        self.input_blocker = None if self._input_enabled else INPUT_BLOCKER
        self._started = self._closed = self._paused = False
        self._generation = 1
        self._revision = 0
        self._sources = {}
        self._selected = None
        self._children = set()
        self._guardians = set()
        self._worker_identities = {}
        self._jobs = {}
        self._workers = {}
        self._reapers = {}
        self._release_failed = False
        self._persistent_devices = False
        self._device_state = "not_created"
        self._device_capabilities = {}
        self._topology_task = None
        self._topology_epoch = 0
        self._topology_error = None
        self._power_status = "unknown"
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
                "boot_id": boot_id(), "no_persistent_devices": not self._input_enabled,
                "input_was_enabled": self._input_enabled, "launch_pending": False,
                "processes": []}
        return copy.deepcopy(self._runtime_descriptor)

    @property
    def application_provenance(self):
        from ..provenance import canonical_application_provenance
        return canonical_application_provenance(self._scope)

    def _accept_device_receipt(self, receipt):
        """Only a fenced, released guardian receipt can prove persistent idle."""
        if receipt.get("persistent_input_devices") is True:
            self.creates_devices = True
            self._persistent_devices = True
            self._device_state = ("retained_inactive" if receipt.get("released") is True
                                  and receipt.get("owned_devices") in {
                                      "persistent_idle", "retained_inactive"}
                                  else "persistent_release_unverified")
        elif receipt.get("persistent_input_devices") is False and not self._persistent_devices:
            self._device_state = "not_created"
        pointer, keyboard = receipt.get("pointer"), receipt.get("keyboard_focus")
        if pointer in {"independent", "shared"} and keyboard in {
                "independent_per_window", "shared"}:
            self.capabilities = BackendCapabilities(
                "x11", "existing_session", pointer,
                "independent" if keyboard == "independent_per_window" else "shared",
                "verified", "verified")
            self._device_capabilities = {key: receipt[key] for key in (
                "pointer", "keyboard_focus", "widget_focus", "shared_pointer",
                "shared_keyboard", "persistent_input_devices") if key in receipt}

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
        # A cancelled observer and Stop can arrive together. Exactly one owner
        # settles this child; cancelling a waiter never cancels its reaper.
        task = self._reapers.get(child)
        if task is None:
            task = asyncio.create_task(self._reap_owned(child))
            self._reapers[child] = task
        await asyncio.shield(task)

    async def _reap_owned(self, child):
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
                try:
                    await asyncio.wait_for(child.wait(), .3)
                except TimeoutError:
                    self._release_failed = True
                    return
        self._children.discard(child)

    async def _read_worker(self, operation, *, selected=None, crop=None):
        return await self._work("capture", self._read_worker_owned, operation,
                                selected=selected, crop=crop)

    async def _start_topology(self):
        ready = asyncio.get_running_loop().create_future()
        self._topology_error = None
        self._topology_task = asyncio.create_task(
            self._work("topology", self._watch_topology, ready))
        self._topology_task.add_done_callback(
            lambda task: task.exception() if not task.cancelled() else None)
        await asyncio.wait_for(asyncio.shield(ready), CAPTURE_TIMEOUT)

    def _topology_event(self, event):
        if (type(event) is not dict or event.get("ok") is not True
                or event.get("event") not in {"topology_ready", "topology_changed"}
                or type(event.get("topology_revision")) is not int
                or event.get("power_status") not in {
                    "on", "disabled", "unsupported", "display_asleep"}
                or type(event.get("sources")) is not list):
            raise AttachedFailure("topology_monitor_unavailable")
        sources = event["sources"]
        names = [source.get("name") for source in sources if type(source) is dict]
        if len(names) != len(sources) or len(set(names)) != len(names):
            raise AttachedFailure("topology_monitor_unavailable")
        self._topology_epoch += 1
        self._revision += 1
        self._frame = self._fingerprint = None
        self._power_status = event["power_status"]
        for source_id, previous in tuple(self._sources.items()):
            matches = [source for source in sources if source["name"] == previous["name"]]
            if len(matches) != 1:
                raise AttachedFailure("selected_sources_unavailable")
            self._sources[source_id] = matches[0]

    async def _watch_topology(self, revoked, ready):
        child = None
        try:
            async with self._spawn_lock:
                if self._closed or self._paused or revoked.is_set():
                    raise AttachedFailure("capture_revoked")
                self._record_spawn()
                child = await asyncio.create_subprocess_exec(
                    *self._worker_argv("x11_attached_worker.py"), "--watch-topology",
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    env=worker_environment(self._config["xauthority"]),
                    start_new_session=True, limit=MAX_REPLY + 1)
                self._children.add(child)
                self._workers[revoked] = child
            self._record_spawn(child, pending=self._runtime_sudo)
            if self._runtime_sudo:
                await self._worker_ready(child, "capture")
            if self._closed or self._paused or revoked.is_set():
                raise AttachedFailure("capture_revoked")
            child.stdin.write(json.dumps(self._config).encode() + b"\n")
            await child.stdin.drain()
            while not revoked.is_set() and not self._closed and not self._paused:
                line = await child.stdout.readline()
                if not line or len(line) > MAX_REPLY:
                    raise AttachedFailure("topology_monitor_unavailable")
                self._topology_event(json.loads(line))
                if not ready.done():
                    ready.set_result(True)
        except Exception as exc:
            if not self._closed and not self._paused and not revoked.is_set():
                self._topology_error = "topology_monitor_unavailable"
                self._frame = self._fingerprint = None
                self._topology_epoch += 1
                self._revision += 1
            if not ready.done():
                ready.set_exception(exc)
        finally:
            if not ready.done():
                ready.set_exception(AttachedFailure("capture_revoked"))
            if child is not None:
                child.stdin.close()
                await self._reap(child)

    async def _work(self, kind, operation, *args, **kwargs):
        """Own the complete worker lifetime, not the caller's observation wait.

        Cancellation revokes a pipe/event, never the owner task. In particular a
        cancellation during spawn cannot lose the returned process, and repeated
        caller cancellation cannot orphan receipt consumption or reaping.
        """
        if self._closed or self._paused:
            raise AttachedFailure("worker_revoked")
        revoked = asyncio.Event()
        task = asyncio.create_task(operation(revoked, *args, **kwargs))
        self._jobs[task] = (kind, revoked)

        def finished(task):
            self._jobs.pop(task, None)
            self._workers.pop(revoked, None)
            if not task.cancelled():
                task.exception()

        task.add_done_callback(finished)
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            self._revoke_job(kind, revoked)
            try:
                await asyncio.shield(task)
            except Exception:
                pass
            raise

    def _revoke_job(self, kind, revoked):
        revoked.set()
        child = self._workers.get(revoked)
        if child is not None:
            child.stdin.close()
            if kind == "capture" and child not in self._reapers:
                self._reapers[child] = asyncio.create_task(self._reap_owned(child))

    async def _read_worker_owned(self, revoked, operation, *, selected=None, crop=None):
        if self._closed or self._paused:
            raise AttachedFailure("capture_revoked")
        request = {**self._config, "operation": operation, "input_enabled": self._input_enabled}
        if selected is not None:
            request["selected"] = selected
        if crop is not None:
            request["crop"] = crop
        async with self._spawn_lock:
            if self._closed or self._paused or revoked.is_set():
                raise AttachedFailure("capture_revoked")
            self._record_spawn()
            child = await asyncio.create_subprocess_exec(
                *self._worker_argv("x11_attached_worker.py"),
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=worker_environment(self._config["xauthority"]), start_new_session=True,
                limit=MAX_REPLY + 1)
            self._children.add(child)
            self._workers[revoked] = child
        assert child.stdin is not None and child.stdout is not None
        try:
            self._record_spawn(child, pending=self._runtime_sudo)
            if self._runtime_sudo:
                await self._worker_ready(child, "capture")
            if self._closed or self._paused or revoked.is_set():
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
            if self._closed or self._paused or revoked.is_set():
                raise AttachedFailure("capture_worker_failed_or_revoked")
            reply = json.loads(output)
            if type(reply) is dict and reply.get("error") in {
                    "display_asleep", "topology_changed", "invalid_source_crop"}:
                raise ComputerError(reply["error"])
            if child.returncode != 0:
                raise AttachedFailure("capture_worker_failed_or_revoked")
            if type(reply) is not dict or reply.get("ok") is not True:
                raise AttachedFailure("capture_unavailable")
            return reply
        except asyncio.CancelledError:
            raise
        except (AttachedFailure, ComputerError):
            raise
        except Exception:
            raise AttachedFailure("capture_unavailable") from None
        finally:
            await self._reap(child)

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
            await self._start_topology()
            if self._input_enabled:
                self._device_state = "persistent_release_unverified"
                device = await self._read_worker("input_capabilities")
                self._accept_device_receipt(device)
                if device.get("released") is not True:
                    raise AttachedFailure("owned_release_unverified")
            self.input_supported = self._input_enabled
            self._selected = next(iter(self._sources))
            return {"ok": True, "session_id": session_id, "capture_only": not self._input_enabled,
                    "input_supported": self.input_supported, "input_blocker": self.input_blocker,
                    "input_limits": dict(self.input_limits),
                    "input_devices": dict(self._device_capabilities),
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

    async def observe(self, crop=None):
        async with self._lock:
            if not self._started or self._closed or self._paused or self._selected is None:
                raise AttachedFailure("capture_not_active")
            if self._topology_error:
                raise ComputerError(self._topology_error)
            if self._power_status == "display_asleep":
                raise ComputerError("display_asleep")
            topology_epoch = self._topology_epoch
            selected_id = self._selected
            from ..gui_actions import crop_arguments
            monitor = self._sources[selected_id]
            if crop is not None:
                crop = crop_arguments(crop, width=monitor["width"], height=monitor["height"])
            generation = self._generation
            captured_at = time.monotonic()
            reply = await self._read_worker("capture", selected=monitor, crop=crop)
            if self._paused or self._closed or generation != self._generation:
                raise AttachedFailure("capture_revoked")
            if topology_epoch != self._topology_epoch:
                raise ComputerError("topology_changed")
            binding = reply.get("input_scope") if self._input_enabled else None
            fingerprint = (selected_id, generation, topology_epoch,
                           self._sources[selected_id], binding)
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
                expected_crop = [crop[k] for k in ("x", "y", "width", "height")] if crop else None
                if reply.get("crop") != expected_crop:
                    raise ValueError("crop mismatch")
                if len(image) > 2 * 1024 * 1024:
                    raise ValueError("image limit")
                transform = AffineTransform(**{
                    key: Fraction(*value) for key, value in reply["delivered_to_source"].items()})
                frame = BackendObservation(source, scope, reply["width"], reply["height"],
                                           transform, image, focused=eligible,
                                           modal=self._modal_id,
                                           modal_kind=(binding.get("modal_kind")
                                                       if binding else None),
                                           resize_scale=tuple(reply["resize_scale"]),
                                           crop=tuple(expected_crop) if expected_crop else None)
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
                    or not frame.focused or not self._scope or self._topology_error
                    or not 0 <= time.monotonic() - self._captured_at <= 5):
                raise AttachedFailure("fresh_app_scoped_observation_required")
            fields = {"click": {"x", "y"}, "double_click": {"x", "y"},
                      "right_click": {"x", "y"}, "middle_click": {"x", "y"},
                      "scroll": {"x", "y", "direction", "count"},
                      "type": {"text"}, "key": {"chord"},
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
                        or any(ord(c) < 32 or 127 <= ord(c) <= 159
                               or 0xD800 <= ord(c) <= 0xDFFF for c in text)):
                    raise AttachedFailure("invalid_text")
            elif action["type"] == "key":
                from .primitives import parse_key_chord
                try:
                    parse_key_chord(action["chord"])
                except ValueError:
                    raise AttachedFailure("unsupported_key") from None
            elif action["type"] == "scroll":
                if (action["direction"] not in ("up", "down", "left", "right")
                        or type(action["count"]) is not int or not 1 <= action["count"] <= 20):
                    raise AttachedFailure("invalid_scroll")
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
            if action["type"] in {"click", "double_click", "right_click", "middle_click", "scroll"}:
                payload["x"], payload["y"] = point([action["x"], action["y"]])
                if action["type"] == "scroll":
                    payload.update(direction=action["direction"], count=action["count"])
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
                    crop = (dict(zip(("x", "y", "width", "height"), frame.crop, strict=True))
                            if frame.crop else None)
                    after = await self._read_worker("capture", selected=monitor, crop=crop)
                    if after.get("crop") != (list(frame.crop) if frame.crop else None):
                        raise AttachedFailure("postcondition_crop_mismatch")
                    data = base64.b64decode(after["image"], validate=True)
                    evidence = receipt["postcondition"]
                    evidence.update(
                        status="observed", method="raster_digest_after_release",
                        target_application_matches=same_application_scope(
                            self._scope, after.get("input_scope")),
                        actual={"before_sha256": hashlib.sha256(frame.image_bytes).hexdigest(),
                                "after_sha256": hashlib.sha256(data).hexdigest()})
                except Exception:
                    pass  # Actual input receipt stays; verification explicitly unavailable.
            return receipt

    async def _input_worker(self, request):
        return await self._work("input", self._input_worker_owned, request)

    async def _input_worker_owned(self, revoked, request):
        async with self._spawn_lock:
            if self._closed or self._paused or revoked.is_set():
                raise AttachedFailure("input_revoked")
            self._record_spawn()
            child = await asyncio.create_subprocess_exec(
                *self._worker_argv("x11_guardian.py"),
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=worker_environment(self._config["xauthority"]),
                start_new_session=True, limit=65536)
            self._guardians.add(child)
            self._workers[revoked] = child
        assert child.stdin is not None and child.stdout is not None
        received = False
        sent = False
        line = None
        try:
            self._record_spawn(child, pending=self._runtime_sudo)
            guardian_identity = None
            if self._runtime_sudo:
                guardian_identity = await self._worker_ready(child, "guardian", pending=True)
            if self._closed or self._paused or revoked.is_set():
                raise AttachedFailure("input_revoked")
            sent = True  # Any partial write may authorize work; never infer a retry.
            self._device_state = "persistent_release_unverified"
            child.stdin.write(json.dumps(request).encode() + b"\n")
            await child.stdin.drain()
            if self._runtime_sudo:
                assert guardian_identity is not None
                identity = await self._worker_ready(child, "injector",
                    parent=guardian_identity["pid"])
                if self._closed or self._paused or revoked.is_set():
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
            self._accept_device_receipt(receipt)
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
                    if not received and sent:
                        # A receipt read before a wait/identity failure is still
                        # the only receipt. Never replace it by an EOF re-read.
                        reply = line if line is not None else await asyncio.wait_for(
                            child.stdout.readline(), 1)
                        receipt = json.loads(reply)
                        if (child.returncode != 0 or type(receipt) is not dict
                                or receipt.get("released") is not True):
                            self._release_failed = True
                        else:
                            self._accept_device_receipt(receipt)
                    if self._runtime_sudo and not await self._identities_gone(child):
                        self._release_failed = True
                except Exception:
                    self._release_failed = True
                # Never kill the release supervisor to manufacture a clean stop.
                if child.returncode is not None:
                    self._guardians.discard(child)
            # This lifetime task is already shielded by _work. Keep receipt
            # settlement in that owner, not an untracked nested shield task.
            await revoke()

    async def export(self, name):
        raise AttachedFailure("existing_session_export_not_granted")

    async def pause(self):
        self._paused = True
        self._frame = None
        async with self._stop_lock:
            settled = await self._cleanup_workers()
        return {"paused": True, "input_revoked": True, "capture_revoked": True,
                "released": settled and not self._release_failed
                and self._device_state != "persistent_release_unverified"}

    async def resume(self, *, consent_generation):
        if self._closed or not self._paused:
            raise AttachedFailure("capture_not_paused")
        if type(consent_generation) is not int or consent_generation <= self._generation:
            raise AttachedFailure("renewed_capture_consent_required")
        if (self._release_failed or self._device_state == "persistent_release_unverified"
                or self._jobs or self._children or self._guardians
                or any(not task.done() for task in self._reapers.values())):
            raise AttachedFailure("owned_release_unverified")
        self._generation = consent_generation
        self._paused = False
        try:
            await self._start_topology()
        except BaseException:
            await asyncio.shield(self.pause())
            raise
        return {"resumed": True, "capture_only": not self._input_enabled}

    async def _cleanup_workers(self):
        # No raster, RandR, focus, action lock or application operation belongs
        # here. Fence authority first, settle the exact owned worker jobs only.
        for kind, revoked in tuple(self._jobs.values()):
            self._revoke_job(kind, revoked)
        for child in tuple(self._guardians):
            child.stdin.close()
        for child in tuple(self._children):
            if child not in self._reapers:
                self._reapers[child] = asyncio.create_task(self._reap_owned(child))
        tasks = set(self._jobs) | {t for t in self._reapers.values() if not t.done()}
        if tasks:
            _done, pending = await asyncio.wait(tasks, timeout=CLEANUP_TIMEOUT)
            if pending:
                # A wait deadline is not a negative release receipt. Keep the
                # owner alive and distinguish unsettled from proven failure;
                # a later Stop can accept its independently verified result.
                return False
        return not self._children and not self._guardians

    async def detach(self):
        self._closed = True
        self._paused = True
        self._frame = None
        async with self._stop_lock:
            settled = await self._cleanup_workers()
            clean = (settled and not self._release_failed
                     and self._device_state != "persistent_release_unverified")
            return {"stopped": clean, "released": clean,
                    "applications_preserved": True,
                    "input_revoked": True, "capture_revoked": True,
                    "owned_devices": self._device_state, "input_was_enabled": self._input_enabled,
                    "state": "closed" if clean else "quarantined",
                    "recovery": None if clean else "owned_x11_cleanup_unverified"}

    stop = detach
    close = detach
