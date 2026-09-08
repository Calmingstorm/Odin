"""Attached capture with task-owned XI2 masters, removed on verified detach."""
from __future__ import annotations

import asyncio
import base64
import copy
import hashlib
import json
import os
import re
import sys
import time
import uuid
from fractions import Fraction
from pathlib import Path
from typing import Any

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
    Both scopes originate in AppScope's XRes/process and geometry checks.
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
    input_limits: dict[str, Any] = {"text": "unicode_existing_keymap_only", "lease_seconds": 2,
                    "widget_focus": "shared_within_window",
                    "keyboard_overlap": "uncertain_no_replay",
                    "click_count": {"minimum": 1, "maximum": 3},
                    "click_modifiers": ["ctrl", "alt", "shift", "super"],
                    "scroll_modifiers": ["ctrl", "alt", "shift", "super"],
                    "drag_modifiers": ["ctrl", "alt", "shift", "super"],
                    "constrained_drag": "shift_held_application_defined_no_geometric_snapping",
                    "key_chords": "active_group_base_symbols_explicit_modifiers_only",
                    "modifier_mapping": "conventional_unambiguous_xkb_slots_only",
                    "accessible_targets": "unavailable", "replace_field": "unavailable",
                    "element_targeting": "observed_pixel_region_click",
                    "replace_field_pixels": "explicit_region_click_select_type_visual_only",
                    "pixel_field_requires": ["fresh_observed_editable_region", "single_line_text",
                                             "same_native_window_focus", "visual_inspection"],
                    "effect_expectations": ["visual_change", "pointer_at", "region_changed",
                                            "dialog_appeared", "menu_appeared", "window_gone"]}
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
        self.input_readiness = "not_checked"
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
        self._device_identity = None
        self._topology_task = None
        self._topology_child = None
        self._topology_epoch = 0
        self._topology_error = None
        self._power_status = "unknown"
        self._frame = self._scope = self._fingerprint = None
        self._window_inventory = None
        self._modal_id = None
        self._captured_at = 0.0
        self._runtime_descriptor = None
        self.runtime_identity_callback = None
        self._spawn_lock = asyncio.Lock()
        self._lock = asyncio.Lock()
        self._stop_lock = asyncio.Lock()
        self._lifecycle = None
        self._lifecycle_job = None
        self._session_lease_fd = None
        self._session_prefix = "Odin session " + uuid.uuid4().hex
        self._restoration = {}
        self._detach_job = None
        self._pause_job = None
        self._lease_revoked = False
        self._shared_cleanup_identity = None
        self._accessibility_private = {}
        self.input_limits = copy.deepcopy(type(self).input_limits)

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
        identity = receipt.get("device_identity")
        if self._device_identity is not None and identity != self._device_identity:
            self._release_failed = True
            self._device_state = ("session_release_unverified" if self.creates_devices
                                  else "persistent_release_unverified")
            raise AttachedFailure("input_device_identity_changed")
        if identity is not None:
            self._device_identity = copy.deepcopy(identity)
        if receipt.get("session_input_devices") is True:
            self.creates_devices = True
            self._device_state = ("session_idle" if receipt.get("released") is True
                                  else "session_release_unverified")
        elif receipt.get("persistent_input_devices") is True:
            self.creates_devices = True
            self._persistent_devices = True
            self._device_state = ("retained_inactive" if receipt.get("released") is True
                                  and receipt.get("owned_devices") in {
                                      "persistent_idle", "retained_inactive"}
                                  else "persistent_release_unverified")
        elif (receipt.get("persistent_input_devices") is False and not self._persistent_devices
              and not self.creates_devices):
            self._device_state = "not_created"
        pointer, keyboard = receipt.get("pointer"), receipt.get("keyboard_focus")
        if pointer in {"independent", "shared"} and keyboard in {
                "independent_per_window", "shared"}:
            self.capabilities = BackendCapabilities(
                self.capabilities.platform, self.capabilities.environment, pointer,
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
        if filename not in {"x11_attached_worker.py", "x11_guardian.py",
                            "x11_session_lifecycle.py"}:
            raise AttachedFailure("unapproved_worker")
        argv = [sys.executable, "-I", str(Path(__file__).with_name(filename))]
        if self._runtime_sudo:
            # Explicit operator privilege, no fallback. Clear ambient X authority.
            preserve = (["-C", str(self._session_lease_fd + 1)]
                        if self._session_lease_fd is not None
                        and filename != "x11_attached_worker.py" else [])
            argv = ["/usr/bin/sudo", "-n", *preserve, "--", "/usr/bin/env", "-i"] + [
                f"{key}={value}" for key, value in
                worker_environment(self._config["xauthority"]).items()] + argv + ["--identity-gate"]
        return argv

    async def _worker_ready(self, child, role, *, parent=None, pending=False, line=None):
        """Private stdout identity, verified against proc before persistence/ACK."""
        from .recovery import process_identity
        assert child.stdout is not None
        if line is None:
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

    async def _reap_owned(self, child: asyncio.subprocess.Process):
        assert child.stdin is not None
        if self._topology_child is not None and child is self._topology_child:
            child.stdin.close()
            try:
                await asyncio.wait_for(child.wait(), 3)
            except TimeoutError:
                self._release_failed = True
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

    async def _read_worker(self, operation, *, selected=None, crop=None, verify_scope=None):
        return await self._work("capture", self._read_worker_owned, operation,
                                selected=selected, crop=crop, verify_scope=verify_scope)

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
                self._topology_child = child
                self._children.add(child)
                self._workers[revoked] = child
            self._record_spawn(child, pending=self._runtime_sudo)
            if self._runtime_sudo:
                await self._worker_ready(child, "capture")
            if self._closed or self._paused or revoked.is_set():
                raise AttachedFailure("capture_revoked")
            assert child.stdin is not None and child.stdout is not None
            child.stdin.write(json.dumps(self._config).encode() + b"\n")
            await child.stdin.drain()
            while not revoked.is_set() and not self._closed and not self._paused:
                line = await child.stdout.readline()
                if revoked.is_set() or self._closed or self._paused:
                    self._accept_shutdown_identity(line)
                    break
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
                assert child.stdin is not None
                child.stdin.close()
                if child.stdout is not None:
                    try:
                        while line := await asyncio.wait_for(child.stdout.readline(), 2):
                            self._accept_shutdown_identity(line)
                    except Exception:
                        pass
                await self._reap(child)

    def _accept_shutdown_identity(self, line):
        try:
            receipt = json.loads(line)
            if receipt.get("event") == "shared_identity_at_close" and receipt.get("ok") is True:
                self._shared_cleanup_identity = receipt.get("device_identity")
        except (ValueError, TypeError):
            pass

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

    async def _read_worker_owned(self, revoked, operation, *, selected=None, crop=None,
                                 verify_scope=None):
        if self._closed or self._paused:
            raise AttachedFailure("capture_revoked")
        request = {**self._config, "operation": operation, "input_enabled": self._input_enabled}
        if selected is not None:
            request["selected"] = selected
        if crop is not None:
            request["crop"] = crop
        if verify_scope is not None:
            request["verify_scope"] = verify_scope
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
                    "display_asleep", "display_power_unavailable", "topology_changed",
                    "stale_capture_topology", "topology_changed_during_capture",
                    "topology_changed_during_render", "invalid_source_crop"}:
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

    async def _start_device_lifecycle(self):
        ready = asyncio.get_running_loop().create_future()
        self._session_lease_fd = os.memfd_create("odin-x11-lease", os.MFD_CLOEXEC)
        os.write(self._session_lease_fd, b"0")
        self._lifecycle_job = asyncio.create_task(self._own_device_lifecycle(ready))
        self._lifecycle_job.add_done_callback(
            lambda task: task.exception() if not task.cancelled() else None)
        result = await asyncio.wait_for(asyncio.shield(ready), CAPTURE_TIMEOUT)
        if result.get("session_input_devices") is False:
            await asyncio.wait_for(asyncio.shield(self._lifecycle_job), CAPTURE_TIMEOUT)
            if self._device_state != "not_created":
                raise AttachedFailure("shared_fallback_cleanup_unverified")
            assert self._session_lease_fd is not None
            os.close(self._session_lease_fd)
            self._session_lease_fd = None
        return result

    async def _own_device_lifecycle(self, ready):
        child = None
        try:
            assert self._session_lease_fd is not None
            async with self._spawn_lock:
                if self._closed or self._paused or self._lease_revoked:
                    raise AttachedFailure("input_revoked")
                self._record_spawn()
                child = await asyncio.create_subprocess_exec(
                    *self._worker_argv("x11_session_lifecycle.py"),
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    pass_fds=(self._session_lease_fd,),
                    env=worker_environment(self._config["xauthority"]),
                    start_new_session=True, limit=65536)
                self._lifecycle = child
            assert child.stdin is not None and child.stdout is not None
            self._record_spawn(child, pending=self._runtime_sudo)
            if self._runtime_sudo:
                await self._worker_ready(child, "lifecycle")
            if self._closed or self._paused or self._lease_revoked:
                raise AttachedFailure("input_revoked")
            child.stdin.write(json.dumps({**self._config,
                "session_prefix": self._session_prefix,
                "session_lease_fd": self._session_lease_fd}).encode() + b"\n")
            await child.stdin.drain()
            first = json.loads(await asyncio.wait_for(child.stdout.readline(), CAPTURE_TIMEOUT))
            shared = (first.get("session_input_devices") is False
                      and first.get("persistent_input_devices") is False
                      and first.get("owned_devices") == "not_created"
                      and first.get("pointer") == "shared")
            if first.get("ok") is not True or not (
                    first.get("session_input_devices") is True or shared):
                raise AttachedFailure("session_devices_unavailable")
            ready.set_result(first)
            while True:
                receipt = json.loads(await child.stdout.readline())
                self._restoration = receipt
                if (receipt.get("owned_devices") == ("not_created" if shared else "removed")
                        and receipt.get("released") is True):
                    break
                self._device_state = "session_release_unverified"
                self._paused = True
                self.input_supported = False
            await child.wait()
            if child.returncode != 0 or (self._runtime_sudo
                    and not await self._identities_gone(child)):
                raise AttachedFailure("session_cleanup_unverified")
            self._restoration = receipt
            self._device_state = receipt.get("owned_devices", "unknown")
        except Exception as exc:
            self._device_state = "session_release_unverified"
            self._paused = True
            self._frame = None
            self._revision += 1
            self.input_supported = False
            if self._session_lease_fd is not None:
                os.pwrite(self._session_lease_fd, b"0", 0)
            if not ready.done():
                ready.set_exception(exc)
        finally:
            if child is not None:
                if child.stdin is not None:
                    child.stdin.close()
                if child.returncode is None:
                    try:
                        await asyncio.wait_for(child.wait(), CLEANUP_TIMEOUT)
                    except TimeoutError:
                        self._release_failed = True
            if not ready.done():
                ready.set_exception(AttachedFailure("input_revoked"))

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
            self._selected = next(iter(self._sources))
            scope_ready = False
            if self._input_enabled:
                readiness = await self._read_worker("scope_readiness")
                from .x11_app_scope import SCOPE_REASONS
                rows = readiness.get("scope_readiness", [])
                if (type(rows) is not list or len(rows) != len(monitors)
                        or any(type(row) is not dict or type(row.get("eligible")) is not bool
                               for row in rows)
                        or {row.get("name") for row in rows}
                        != {monitor["name"] for monitor in monitors}):
                    raise AttachedFailure("scope_readiness_unavailable")
                for identity, monitor in self._sources.items():
                    row = next(row for row in rows if row["name"] == monitor["name"])
                    if row["eligible"]:
                        self._selected = identity
                        scope_ready = True
                        break
                reasons = [row.get("reason") for row in rows]
                self.input_blocker = (None if scope_ready else next(
                    (reason for reason in reasons if isinstance(reason, str)
                     and reason in SCOPE_REASONS),
                    "application_scope_unavailable"))
                self.input_readiness = "target_available" if scope_ready else "no_input_target"
            if self._input_enabled:
                # Shared-only until independent per-application detach is safe.
                # No created pair, lifecycle FD, or sudo closefrom permission.
                device = await self._read_worker("input_capabilities")
                self._accept_device_receipt(device)
                if (device.get("released") is not True or self._device_identity is None
                        or self.creates_devices
                        or self.capabilities.pointer_separation != "shared"):
                    raise AttachedFailure("owned_release_unverified")
            self.input_supported = self._input_enabled and scope_ready
            return {"ok": True, "session_id": session_id, "capture_only": not self.input_supported,
                    "input_supported": self.input_supported, "input_blocker": self.input_blocker,
                    "input_readiness": self.input_readiness,
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

    async def follow_focus(self):
        """Choose the granted monitor containing current focus, not startup focus.

        This read-only selection is for an explicit observation request only.
        Action revalidation and post-action capture must stay on their bound
        source. If a window spans monitors, keep the current source when eligible.
        """
        async with self._lock:
            if self._closed or self._paused or not self._started:
                raise AttachedFailure("capture_not_active")
            if not self._input_enabled:
                return
            reply = await self._read_worker("scope_readiness")
            rows = reply.get("scope_readiness")
            names = {monitor["name"] for monitor in self._sources.values()}
            if (type(rows) is not list or len(rows) != len(names)
                    or any(type(row) is not dict or type(row.get("eligible")) is not bool
                           or type(row.get("name")) is not str for row in rows)
                    or {row["name"] for row in rows} != names):
                raise AttachedFailure("scope_readiness_unavailable")
            eligible = {row["name"] for row in rows if row["eligible"]}
            if self._sources[self._selected]["name"] in eligible:
                return
            selected = next((identity for identity, monitor in self._sources.items()
                             if monitor["name"] in eligible), self._selected)
            if selected != self._selected:
                self._select_source(selected)

    def _select_source(self, source_id):
        self._selected = source_id
        self._frame = None
        self.input_supported = False
        self.input_readiness = "observation_required"
        self.input_blocker = "fresh_observation_required"

    async def select_source(self, source_id):
        async with self._lock:
            if self._closed or self._paused or not self._started:
                raise AttachedFailure("capture_not_active")
            if source_id not in self._sources:
                raise AttachedFailure("capture_source_not_granted")
            self._select_source(source_id)
            return {"selected_source": source_id, "capture_only": not self._input_enabled}

    async def observe_sequence(self, crop=None):
        """Sequence checkpoints never hide a sampled human focus excursion."""
        return await self.observe(crop=crop, _settle_focus=False)

    async def observe(self, crop=None, *, _settle_focus=True):
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
            # Give a brief human focus excursion time to settle BEFORE publishing
            # a new source revision. Only the exact previous native scope can
            # qualify, including its window/process provenance and geometry.
            # No activation, input, revision rollback or coordinate remapping.
            previous_scope = self._scope
            if (_settle_focus and self._input_enabled and previous_scope
                    and previous_scope.get("focused") is True
                    and previous_scope.get("modal") is None):
                for _ in range(3):
                    if binding == previous_scope or (binding and binding.get("modal")):
                        break
                    await asyncio.sleep(0.15)
                    if self._paused or self._closed or generation != self._generation:
                        raise AttachedFailure("capture_revoked")
                    if topology_epoch != self._topology_epoch:
                        raise ComputerError("topology_changed")
                    reply = await self._read_worker("capture", selected=monitor, crop=crop)
                    if self._paused or self._closed or generation != self._generation:
                        raise AttachedFailure("capture_revoked")
                    if topology_epoch != self._topology_epoch:
                        raise ComputerError("topology_changed")
                    binding = reply.get("input_scope")
            fingerprint = (selected_id, generation, topology_epoch,
                           self._sources[selected_id], binding)
            if fingerprint != self._fingerprint:
                self._revision += 1
                self._fingerprint = fingerprint
                self._modal_id = uuid.uuid4().hex if binding and binding.get("modal") else None
            eligible = bool(binding and binding.get("focused") is True and
                            binding.get("modal_kind") in {None, "safe_application"})
            if self._input_enabled:
                from .x11_app_scope import SCOPE_REASONS
                reason = reply.get("input_scope_reason")
                self.input_supported = eligible
                self.input_readiness = "target_available" if eligible else "no_input_target"
                self.input_blocker = (None if eligible else reason if isinstance(reason, str)
                                      and reason in SCOPE_REASONS
                                      else "application_scope_unavailable")
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
                                           crop=tuple(expected_crop) if expected_crop else None,
                                           accessibility=tuple(reply.get("accessibility", [])))
                self._accessibility_private = reply.get("accessibility_private", {})
                field_available = any("replace_field" in n.get("capabilities", [])
                                      for n in frame.accessibility)
                self.input_limits["accessible_targets"] = (
                    "observation_native_handles" if frame.accessibility else "unavailable")
                self.input_limits["replace_field"] = (
                    "native_atspi_same_node_readback" if field_available else "unavailable")
                self.input_limits["field_targeting_path"] = (
                    "native_atspi_identity_or_explicit_pixels" if field_available
                    else "explicit_pixels_only_no_accessible_identity")
                self.input_limits["accessibility_evidence"] = (
                    "observed_editable_nodes" if field_available else
                    "observed_nodes_without_editable_text" if frame.accessibility else
                    "no_usable_nodes_observed_session_enabled_not_sufficient")
                self.input_limits["effect_expectations"] = [
                    *type(self).input_limits["effect_expectations"],
                    *(["field_text_equals"] if field_available else [])]
                self._frame, self._scope, self._captured_at = frame, binding, captured_at
                self._window_inventory = reply.get("window_inventory")
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
                      "replace_field": {"target", "text"},
                      "replace_field_pixels": {"region", "text"},
                      "polyline": {"points", "duration"}}
            required = {"type", "source_id", "source_revision", "consent_generation", "expected"}
            clicks = {"click", "double_click", "right_click", "middle_click"}
            optional = {"expected_modal"} | ({"count", "modifiers"}
                        if type(action) is dict and action.get("type") in clicks else set())
            if type(action) is dict and action.get("type") in {"scroll", "polyline"}:
                optional.add("modifiers")
            if (type(action) is not dict or type(action.get("type")) is not str
                    or action["type"] not in fields
                    or set(action) - optional != required | fields[action["type"]]):
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
            pointer_expected = (action["type"] == "click" and action["expected"] == {
                "type": "pointer_at", "x": action.get("x"), "y": action.get("y")})
            from ..effects import expectation_arguments
            expectation_arguments(action["expected"])
            field_expected = (action["type"] == "replace_field" and action["expected"] == {
                "type": "field_text_equals", "target": action.get("target"),
                "text": action.get("text")})
            if action["type"] == "replace_field" and not field_expected:
                raise AttachedFailure("field_text_verification_required")
            pixel_field = action["type"] == "replace_field_pixels"
            if (pixel_field and action["expected"]["type"] not in
                    {"visual_change", "region_changed"}):
                raise AttachedFailure("unsupported_postcondition")
            if (action["expected"]["type"] in {"pointer_at", "field_text_equals"}
                    and not (pointer_expected or field_expected)):
                raise AttachedFailure("unsupported_postcondition")
            payload = {"type": action["type"]}
            if action["type"] in clicks:
                from ..policy import integer
                integer(action.get("count", 2 if action["type"] == "double_click" else 1), 1, 3)
            if action["type"] in clicks | {"scroll", "polyline"}:
                modifiers = action.get("modifiers", [])
                if (type(modifiers) is not list or len(modifiers) > 4
                        or any(type(m) is not str or m not in {"ctrl", "alt", "shift", "super"}
                               for m in modifiers) or len(set(modifiers)) != len(modifiers)):
                    raise AttachedFailure("invalid_modifiers")
                for key in ("count", "modifiers"):
                    if key in action:
                        payload[key] = action[key]
            if action["type"] in {"type", "replace_field", "replace_field_pixels"}:
                text = action["text"]
                if (type(text) is not str
                        or not (0 if field_expected or pixel_field else 1) <= len(text) <= 512
                        or any((ord(c) < 32 and c not in "\n\t") or 127 <= ord(c) <= 159
                               or 0xD800 <= ord(c) <= 0xDFFF for c in text)):
                    raise ComputerError("invalid_text")
                if pixel_field and any(ord(c) < 32 for c in text):
                    raise ComputerError("invalid_text")
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
            elif pixel_field:
                from ..gui_actions import crop_arguments
                region = crop_arguments(action["region"], frame.width, frame.height)
                left, top = point([region["x"], region["y"]])
                right, bottom = point([region["x"] + region["width"] - 1,
                                       region["y"] + region["height"] - 1])
                if right < left or bottom < top:
                    raise AttachedFailure("invalid_point")
                payload.update(region={"x": left, "y": top,
                                       "width": right - left + 1, "height": bottom - top + 1},
                               text=action["text"])
            elif action["type"] == "polyline":
                if type(action["points"]) is not list or not 2 <= len(action["points"]) <= 256:
                    raise AttachedFailure("invalid_polyline")
                payload.update(points=[point(p) for p in action["points"]],
                               duration=action["duration"])
            elif field_expected:
                target = action["target"]
                if type(target) is not str or target not in self._accessibility_private:
                    raise AttachedFailure("accessible_target_unavailable")
                saved = self._accessibility_private[target]
                if "replace_field" not in saved.get("metadata", {}).get("capabilities", []):
                    raise AttachedFailure("accessible_target_unavailable")
                payload.update(target=target, text=action["text"],
                               observation_id=saved["observation_id"])
            else:
                key = "text" if action["type"] == "type" else "chord"
                payload[key] = action[key]
            request = {**self._config, "selected": monitor, "scope": self._scope, "action": payload}
            if field_expected:
                request["accessible_reference"] = copy.deepcopy(saved)
            if pointer_expected:
                request["verify_pointer"] = True
            request["input_mode"] = self.capabilities.pointer_separation
            request["expected_device_identity"] = copy.deepcopy(self._device_identity)
            if self.creates_devices:
                request["session_prefix"] = self._session_prefix
                request["session_lease_fd"] = self._session_lease_fd
            self._frame = None  # Consume before dispatch; lost replies are not retryable.
            self._accessibility_private = {}
            receipt = await self._input_worker(request)
            receipt["targeting_path"] = (
                "native_atspi_identity" if field_expected else "explicit_pixel_region"
                if pixel_field else "native_window_focus" if action["type"] in {"key", "type"}
                else "observed_pixel_coordinates")
            if receipt.get("released") is not True:
                self._release_failed = True
                self._paused = True
            receipt["postcondition"] = {"type": ("field_text_equals" if field_expected else
                                                 "pointer_at" if pointer_expected
                                                 else "visual_change"),
                                         "status": "unavailable",
                                         "source_id": frame.source.source_id,
                                         "source_revision": frame.source.source_revision,
                                         "consent_generation": frame.source.consent_generation}
            if field_expected:
                measured = receipt.pop("field_observation", None)
                if (receipt.get("released") is True and receipt.get("status") == "executed"
                        and type(measured) is dict and measured.get("text_complete") is True
                        and type(measured.get("text")) is str
                        and measured.get("target") == action["target"]):
                    receipt["postcondition"].update(
                        status="observed", method="accessibility_text_after_release",
                        target=action["target"], target_application_matches=True,
                        actual={"text": measured["text"], "text_complete": True})
                return receipt
            if pointer_expected:
                measured = receipt.pop("pointer_observation", None)
                if (receipt.get("released") is True and receipt.get("status") == "executed"
                        and type(measured) is dict
                        and type(measured.get("x")) is int and type(measured.get("y")) is int
                        and type(measured.get("target_window_matches")) is bool):
                    x, y = measured["x"] - origin[0], measured["y"] - origin[1]
                    if 0 <= x < frame.source.input_width and 0 <= y < frame.source.input_height:
                        receipt["postcondition"].update(
                            status="observed", method="pointer_query_after_release",
                            actual={"x": x, "y": y},
                            target_window_matches=measured["target_window_matches"])
                return receipt
            if (receipt.get("released") is True and receipt.get("status") == "executed"
                    and not self._closed and not self._paused):
                try:
                    crop = (dict(zip(("x", "y", "width", "height"), frame.crop, strict=True))
                            if frame.crop else None)
                    after = await self._read_worker("capture", selected=monitor, crop=crop,
                                                  verify_scope=self._scope)
                    # Preserve every sampled target transition for finite plans.
                    # Same-app effect verification may accept a dialog opening,
                    # but a later sample returning to the original target must
                    # not erase the interruption observed here.
                    receipt["sampled_target_changed"] = after.get("input_scope") != self._scope
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
                    after_scope = after.get("input_scope")
                    if (type(after_scope) is dict
                            and same_application_scope(self._scope, after_scope)):
                        from .x11_appearance import appearance_transition
                        transition = appearance_transition(
                            self._window_inventory, after.get("window_inventory"),
                            self._scope, after_scope)
                        if transition is not None:
                            evidence["transition"] = transition
                    if after.get("prior_target_state") in {"destroyed", "unmapped", "viewable"}:
                        evidence.update(target_state=after["prior_target_state"],
                                        target_state_method="native_window_state_after_release")
                    if after.get("prior_target_state") in {"destroyed", "unmapped"}:
                        evidence.update(target_disappeared=True,
                                        target_state=after["prior_target_state"],
                                        target_state_method="native_window_state_after_release")
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
                pass_fds=((self._session_lease_fd,) if self._session_lease_fd is not None else ()),
                start_new_session=True, limit=65536)
            self._guardians.add(child)
            self._workers[revoked] = child
        assert child.stdin is not None and child.stdout is not None
        received = False
        sent = False
        line = None
        previous_device_state = self._device_state
        preflight_refusal = False
        try:
            self._record_spawn(child, pending=self._runtime_sudo)
            guardian_identity = None
            if self._runtime_sudo:
                guardian_identity = await self._worker_ready(child, "guardian", pending=True)
            if self._closed or self._paused or revoked.is_set():
                raise AttachedFailure("input_revoked")
            sent = True  # Any partial write may authorize work; never infer a retry.
            self._device_state = ("session_release_unverified" if self.creates_devices
                                  else "persistent_release_unverified")
            child.stdin.write(json.dumps(request).encode() + b"\n")
            await child.stdin.drain()
            if self._runtime_sudo:
                assert guardian_identity is not None
                # Preflight can finish before an injector exists. Preserve that
                # terminal evidence instead of consuming it as a failed ready
                # message and subsequently trying to parse EOF as the receipt.
                line = await asyncio.wait_for(child.stdout.readline(), 2)
                message = json.loads(line)
                details = message.get("diagnostics") if type(message) is dict else None
                preflight_refusal = (
                    type(message) is dict and message.get("status") == "unavailable"
                    and message.get("injected") is False
                    and type(message.get("released")) is bool
                    and type(details) is dict and details.get("phase") == "preflight"
                    and details.get("steps_completed") == 0)
                if not preflight_refusal:
                    identity = await self._worker_ready(child, "injector",
                        parent=guardian_identity["pid"], line=line)
                    line = None
                    if self._closed or self._paused or revoked.is_set():
                        raise AttachedFailure("input_revoked")
                    child.stdin.write(json.dumps({"ack": identity}).encode() + b"\n")
                    await child.stdin.drain()
            # Do not close stdin: controller EOF is revocation, not framing.
            if line is None:
                line = await asyncio.wait_for(child.stdout.readline(), 4)
            await asyncio.wait_for(child.wait(), 1)
            if self._runtime_sudo and not await self._identities_gone(child):
                raise AttachedFailure("privileged_worker_remaining")
            receipt = json.loads(line)
            if child.returncode != 0 or type(receipt) is not dict:
                raise AttachedFailure("input_outcome_unknown")
            if receipt.get("released") is not True:
                self._release_failed = True
            if (preflight_refusal and receipt.get("released") is True
                    and receipt.get("device_identity") is None
                    and receipt.get("input_opened") is False):
                # Guardian exited before opening native input. Preserve the
                # previous device evidence; do not manufacture new identity.
                self._device_state = previous_device_state
            else:
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
        if self._pause_job is None or self._pause_job.done():
            self._pause_job = asyncio.create_task(self._pause_owned())
        return await asyncio.shield(self._pause_job)

    async def _pause_owned(self):
        self._paused = True
        self._frame = None
        # Emergency pause restores physical attachments too. A removed seat is
        # terminal for this backend: fresh consent must create a fresh session.
        if self.creates_devices or self._device_state == "session_release_unverified":
            self._lease_revoked = True
            self.input_supported = False
            if self._session_lease_fd is not None:
                os.pwrite(self._session_lease_fd, b"0", 0)
            if self._lifecycle is not None:
                self._lifecycle.stdin.close()
        async with self._stop_lock:
            settled = await self._cleanup_workers()
            if self._lease_revoked and self._lifecycle_job is not None:
                if self._lifecycle is not None:
                    self._lifecycle.stdin.close()
                _done, pending = await asyncio.wait({self._lifecycle_job}, timeout=CLEANUP_TIMEOUT)
                settled = settled and not pending
            restored = self._restoration_verified()
            if self._lease_revoked and restored:
                self._device_state = "removed"
        return {"paused": True, "input_revoked": True, "capture_revoked": True,
                "released": settled and (restored if self._lease_revoked else (
                    not self._release_failed and self._device_state not in {
                        "persistent_release_unverified", "session_release_unverified"})),
                "owned_devices": self._device_state,
                "resume_requires_new_session": self._lease_revoked}

    async def resume(self, *, consent_generation):
        if self._closed or not self._paused:
            raise AttachedFailure("capture_not_paused")
        if type(consent_generation) is not int or consent_generation <= self._generation:
            raise AttachedFailure("renewed_capture_consent_required")
        if (self._lease_revoked or (self.creates_devices and (
                self._session_lease_fd is None
                or os.pread(self._session_lease_fd, 1, 0) != b"1"))):
            raise AttachedFailure("session_devices_revoked_new_session_required")
        if (self._release_failed or self._device_state in {
                "persistent_release_unverified", "session_release_unverified"}
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
        if self._detach_job is None or self._detach_job.done():
            self._detach_job = asyncio.create_task(self._detach_owned())
            self._detach_job.add_done_callback(
                lambda task: task.exception() if not task.cancelled() else None)
        return await asyncio.shield(self._detach_job)

    async def _detach_owned(self):
        cleanup_deadline = time.monotonic() + 18
        self._closed = True
        self._paused = True
        self._frame = None
        if self._session_lease_fd is not None:
            os.pwrite(self._session_lease_fd, b"0", 0)
        if self._lifecycle is not None:
            self._lifecycle.stdin.close()
        async with self._stop_lock:
            settled = await self._cleanup_workers()
            if self._lifecycle_job is not None:
                if self._lifecycle is not None:
                    self._lifecycle.stdin.close()
                _done, pending = await asyncio.wait(
                    {self._lifecycle_job}, timeout=max(0, cleanup_deadline - time.monotonic())
                )
                settled = settled and not pending
            restored = self._restoration_verified()
            if restored:
                self._device_state = "removed"
            clean = settled and (
                restored
                or (
                    not self._release_failed
                    and self._device_state == "not_created"
                    and not self.creates_devices
                )
            )
            if clean and not self.creates_devices and self._device_identity is not None:
                clean = self._shared_cleanup_identity == self._device_identity
            if settled and self._session_lease_fd is not None:
                os.close(self._session_lease_fd)
                self._session_lease_fd = None
            shared = not self.creates_devices and self._device_state == "not_created"
            # Restoration certificates describe created XI2 seats only. Missing
            # certificate fields are not negative measurements of shared input.
            # Worker settlement DOES prove absence of our inflight input. There
            # is no safe global-grab probe on another client's shared devices.
            evidence = (
                {
                    "physical_slaves_restored": None,
                    "no_inflight_input": settled,
                    "no_active_grabs": None,
                    "owned_masters_removed": None,
                    "cleanup_checks": {
                        "physical_slaves_restored": "not_applicable_no_owned_masters",
                        "no_inflight_input": "measured_owned_worker_fence",
                        "no_active_grabs": "unsupported_shared_server_probe",
                        "owned_masters_removed": "not_applicable_no_owned_masters",
                    },
                }
                if shared
                else {
                    key: self._restoration.get(key) is True
                    for key in (
                        "physical_slaves_restored",
                        "no_inflight_input",
                        "no_active_grabs",
                        "owned_masters_removed",
                    )
                }
            )
            return {
                "stopped": clean,
                "released": clean,
                **evidence,
                # XI2 state cannot prove arbitrary clients consumed their
                # device events. GDK can issue stale XIBarrierReleasePointer
                # requests after removal and abort on XI_BadDevice.
                "applications_preserved": not self.creates_devices,
                "input_revoked": True,
                "capture_revoked": True,
                "owned_devices": self._device_state,
                "input_was_enabled": self._input_enabled,
                "state": "closed" if clean and not self.creates_devices else "quarantined",
                "recovery": (
                    "application_preservation_unverified"
                    if clean and self.creates_devices
                    else None
                    if clean
                    else "owned_x11_cleanup_unverified"
                ),
            }

    def _restoration_verified(self):
        return self._restoration.get("owned_devices") == "removed" and all(
            self._restoration.get(key) is True
            for key in (
                "released",
                "physical_slaves_restored",
                "no_inflight_input",
                "no_active_grabs",
                "owned_masters_removed",
            )
        )

    stop = detach
    close = detach
