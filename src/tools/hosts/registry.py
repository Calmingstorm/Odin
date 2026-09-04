"""Generation-owned runtime inventory for managed hosts.

``config.yml`` remains desired state. This registry is the one immutable
runtime view consumed by execution, prompts, authorization, health, schedules,
and skills. A target lease pins one exact host generation for an operation;
ordinary disable/edit/remove denies new work immediately and lets old leases
drain, while force revoke trips every matching lease's cancellation fence.
"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import os
import tempfile
import uuid
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, replace
from pathlib import Path
from types import MappingProxyType
from typing import Any

from ...config.schema import ToolHost
from ...odin_log import get_logger
from ..ssh import is_local_address
from .trust import normalize_public_key

log = get_logger("hosts.registry")

_HOST_ID_NAMESPACE = uuid.UUID("892c8ff8-cac7-5f34-9b0a-9a8ea3fe0323")


def deterministic_host_id(alias: str) -> str:
    """Stable boot-only identity for a legacy record without ``host_id``."""
    return str(uuid.uuid5(_HOST_ID_NAMESPACE, alias))


class HostForceRevokedError(RuntimeError):
    """An administrative revoke interrupted a possibly-effective operation."""

    def __init__(self, alias: str) -> None:
        super().__init__(
            f"Host '{alias}' was force-revoked; the remote operation outcome is unknown "
            "(outcome_unknown=true)."
        )
        self.alias = alias


@dataclass(frozen=True, slots=True)
class HostTarget:
    alias: str
    host_id: str
    generation: int
    address: str
    ssh_user: str
    os: str
    port: int
    description: str
    enabled: bool
    trust_mode: str
    host_keys: tuple[str, ...]
    key_path: str
    known_hosts_path: str
    host_key_alias: str
    targetable: bool
    trust_state: str
    last_test: dict[str, Any] | None = None

    @property
    def runtime_key(self) -> str:
        return f"{self.host_id}:{self.generation}"

    @property
    def local(self) -> bool:
        return is_local_address(self.address)

    def legacy_tuple(self) -> tuple[str, str, str]:
        return self.address, self.ssh_user, self.os


@dataclass(frozen=True, slots=True)
class HostPublication:
    expected_generation: int
    generation: int
    default_host: str
    snapshot: Mapping[str, HostTarget]


class HostLease:
    """Whole-operation lease for one immutable :class:`HostTarget`."""

    __slots__ = ("_registry", "target", "_revoked", "_released")

    def __init__(
        self,
        registry: HostRegistry | None,
        target: HostTarget,
        revoked: asyncio.Event | None = None,
    ) -> None:
        self._registry = registry
        self.target = target
        self._revoked = revoked or asyncio.Event()
        self._released = False

    def __enter__(self) -> HostLease:
        return self

    def __exit__(self, _exc_type, _exc, _tb) -> None:
        self.release()

    @property
    def revoked(self) -> bool:
        return self._revoked.is_set()

    def borrow(self) -> HostLease:
        """A nested transport fence that does not own the registry count."""
        return HostLease(None, self.target, self._revoked)

    async def run(self, factory: Callable[[], Awaitable[Any]]) -> Any:
        """Run one transport action behind the force-revoke fence."""
        if self._revoked.is_set():
            raise HostForceRevokedError(self.target.alias)
        task = asyncio.ensure_future(factory())
        revoke_wait = asyncio.create_task(self._revoked.wait())
        try:
            done, _ = await asyncio.wait(
                {task, revoke_wait}, return_when=asyncio.FIRST_COMPLETED
            )
            if task in done:
                return await task
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            raise HostForceRevokedError(self.target.alias)
        except asyncio.CancelledError:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            raise
        finally:
            revoke_wait.cancel()
            await asyncio.gather(revoke_wait, return_exceptions=True)

    def release(self) -> None:
        if self._released:
            return
        self._released = True
        if self._registry is not None:
            self._registry._release(self.target.runtime_key)


RetireCallback = Callable[[HostTarget], Awaitable[None] | None]


class HostRegistry:
    """Single runtime authority for target identity and lifecycle."""

    def __init__(
        self,
        hosts: Mapping[str, ToolHost] | None = None,
        *,
        key_path: str = "",
        legacy_known_hosts_path: str = "",
        default_host: str = "",
        trust_dir: str | Path = "./data/host_trust",
    ) -> None:
        self._generation = 0
        self._key_path = str(key_path)
        self._legacy_known_hosts_path = str(legacy_known_hosts_path)
        self._default_host = str(default_host or "")
        self._trust_dir = Path(trust_dir)
        self._snapshot: Mapping[str, HostTarget] = MappingProxyType({})
        self._lease_counts: dict[str, int] = {}
        self._revoke_events: dict[str, asyncio.Event] = {}
        self._retired: dict[str, HostTarget] = {}
        self._retire_callback: RetireCallback | None = None
        self.publish(hosts or {}, default_host=self._default_host)

    @property
    def generation(self) -> int:
        return self._generation

    @property
    def default_host(self) -> str:
        target = self._snapshot.get(self._default_host)
        return self._default_host if target is not None and target.targetable else ""

    @property
    def effective_key_path(self) -> str:
        return self._key_path

    @property
    def effective_legacy_known_hosts_path(self) -> str:
        return self._legacy_known_hosts_path

    def set_retire_callback(self, callback: RetireCallback | None) -> None:
        self._retire_callback = callback

    def snapshot(self) -> Mapping[str, HostTarget]:
        return self._snapshot

    def get(self, alias: str, *, targetable_only: bool = False) -> HostTarget | None:
        target = self._snapshot.get(alias)
        if targetable_only and (target is None or not target.targetable):
            return None
        return target

    def configured_aliases(self) -> tuple[str, ...]:
        return tuple(self._snapshot)

    def active_aliases(self) -> tuple[str, ...]:
        return tuple(alias for alias, target in self._snapshot.items() if target.targetable)

    def draining_aliases(self) -> tuple[str, ...]:
        return tuple(
            sorted(
                {
                    target.alias
                    for key, target in self._retired.items()
                    if self._lease_counts.get(key)
                }
            )
        )

    def has_active_leases(self, alias: str) -> bool:
        return any(
            target.alias == alias and self._lease_counts.get(key, 0) > 0
            for key, target in self._all_runtime_targets().items()
        )

    def acquire(self, alias: str) -> HostLease | None:
        target = self.get(alias, targetable_only=True)
        if target is None:
            return None
        key = target.runtime_key
        event = self._revoke_events.setdefault(key, asyncio.Event())
        if event.is_set():
            return None
        self._lease_counts[key] = self._lease_counts.get(key, 0) + 1
        return HostLease(self, target, event)

    @staticmethod
    def unmanaged_lease(alias: str, resolved: tuple[str, str, str]) -> HostLease:
        """Compatibility seam for tests that monkeypatch the legacy resolver."""
        address, ssh_user, host_os = resolved
        return HostLease(
            None,
            HostTarget(
                alias=alias,
                host_id=deterministic_host_id(alias),
                generation=0,
                address=address,
                ssh_user=ssh_user,
                os=host_os,
                port=22,
                description="",
                enabled=True,
                trust_mode="legacy",
                host_keys=(),
                key_path="",
                known_hosts_path="",
                host_key_alias="",
                targetable=True,
                trust_state="legacy",
            ),
        )

    def force_revoke(self, alias: str) -> int:
        """Trip cancellation fences for every leased generation of ``alias``."""
        count = 0
        for key, target in self._all_runtime_targets().items():
            if target.alias != alias or self._lease_counts.get(key, 0) <= 0:
                continue
            self._revoke_events.setdefault(key, asyncio.Event()).set()
            count += self._lease_counts.get(key, 0)
        return count

    def force_revoke_keys(self, alias: str) -> tuple[str, ...]:
        """Trip cancellation fences and return exact affected generations."""
        affected: list[str] = []
        for key, target in self._all_runtime_targets().items():
            if target.alias != alias or self._lease_counts.get(key, 0) <= 0:
                continue
            self._revoke_events.setdefault(key, asyncio.Event()).set()
            affected.append(key)
        return tuple(affected)

    def publish(
        self,
        hosts: Mapping[str, ToolHost],
        *,
        default_host: str | None = None,
    ) -> int:
        """Prepare and atomically publish an inventory."""
        return self.publish_staged(self.stage(hosts, default_host=default_host))

    def stage(
        self,
        hosts: Mapping[str, ToolHost],
        *,
        default_host: str | None = None,
    ) -> HostPublication:
        """Assemble and materialize trust without changing live state."""
        selected_default = self._default_host if default_host is None else str(default_host or "")
        generation = self._generation + 1
        previous = self._snapshot
        replacements: dict[str, HostTarget] = {}

        for alias, config in hosts.items():
            target = self._target_from_config(alias, config, generation)
            old = previous.get(alias)
            if old is not None and self._same_definition(old, target):
                replacements[alias] = old
            else:
                replacements[alias] = target

        return HostPublication(
            expected_generation=self._generation,
            generation=generation,
            default_host=selected_default,
            snapshot=MappingProxyType(replacements),
        )

    def publish_staged(self, staged: HostPublication) -> int:
        """Publish a fully prepared snapshot with no filesystem I/O."""
        if self._generation != staged.expected_generation:
            raise RuntimeError("host registry changed while publication was staged")
        previous = self._snapshot
        self._generation = staged.generation
        self._default_host = staged.default_host
        self._snapshot = staged.snapshot
        for alias, old in previous.items():
            if self._snapshot.get(alias) is not old:
                self._retire(old)
        return self._generation

    def mark_test_result(
        self,
        alias: str,
        result: Mapping[str, Any],
        *,
        host_key_mismatch: bool = False,
    ) -> int:
        old = self._snapshot.get(alias)
        if old is None:
            return self._generation
        self._generation += 1
        updated = replace(
            old,
            generation=self._generation,
            last_test=dict(result),
            targetable=old.targetable and not host_key_mismatch,
            trust_state="mismatch" if host_key_mismatch else old.trust_state,
        )
        snapshot = dict(self._snapshot)
        snapshot[alias] = updated
        self._snapshot = MappingProxyType(snapshot)
        self._retire(old)
        return self._generation

    def status_rows(self) -> list[dict[str, Any]]:
        draining = set(self.draining_aliases())
        return [
            {
                "alias": target.alias,
                "host_id": target.host_id,
                "address": target.address,
                "ssh_user": target.ssh_user,
                "os": target.os,
                "port": target.port,
                "description": target.description,
                "enabled": target.enabled,
                "active": target.enabled,
                "targetable": target.targetable,
                "trust_mode": target.trust_mode,
                "trust_state": target.trust_state,
                "last_test": target.last_test,
                "draining": target.alias in draining,
                "generation": target.generation,
            }
            for target in self._snapshot.values()
        ]

    def materialize_trust(
        self,
        host_id: str,
        key_alias: str,
        trust_mode: str,
        keys: tuple[str, ...] | list[str],
    ) -> str:
        self._trust_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self._trust_dir, 0o700)
        normalized_keys = tuple(normalize_public_key(key) for key in keys)
        identity = "\0".join((host_id, key_alias, trust_mode, *normalized_keys))
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
        destination = self._trust_dir / f"{digest}.known_hosts"
        marker = "@cert-authority " if trust_mode == "ca" else ""
        payload = "".join(
            f"{marker}{key_alias} {key}\n" for key in normalized_keys
        )
        fd, temp_name = tempfile.mkstemp(prefix=".host-trust-", dir=self._trust_dir)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, destination)
            os.chmod(destination, 0o600)
        except BaseException:
            try:
                os.unlink(temp_name)
            except OSError:
                pass
            raise
        return str(destination)

    def _target_from_config(self, alias: str, config: ToolHost, generation: int) -> HostTarget:
        host_id = getattr(config, "host_id", "") or deterministic_host_id(alias)
        local = is_local_address(config.address)
        trust_mode = getattr(config, "trust_mode", "legacy")
        trust_state: str = trust_mode
        known_hosts = self._legacy_known_hosts_path
        host_key_alias = ""
        targetable = bool(getattr(config, "enabled", True))
        keys: tuple[str, ...] = ()

        if local:
            trust_state = "local"
        elif trust_mode in {"pinned", "tofu", "ca"}:
            try:
                keys = tuple(normalize_public_key(key) for key in getattr(config, "host_keys", ()))
            except ValueError:
                keys = ()
            if not keys:
                trust_state = "invalid"
                targetable = False
            else:
                host_key_alias = f"odin-{host_id}"
                known_hosts = self.materialize_trust(
                    host_id, host_key_alias, trust_mode, keys
                )
        return HostTarget(
            alias=alias,
            host_id=host_id,
            generation=generation,
            address=config.address,
            ssh_user=config.ssh_user,
            os=config.os,
            port=getattr(config, "port", 22),
            description=getattr(config, "description", ""),
            enabled=getattr(config, "enabled", True),
            trust_mode=trust_mode,
            host_keys=keys,
            key_path=self._key_path,
            known_hosts_path=known_hosts,
            host_key_alias=host_key_alias,
            targetable=targetable,
            trust_state=trust_state,
        )

    def _retire(self, target: HostTarget) -> None:
        key = target.runtime_key
        self._retired[key] = target
        if self._lease_counts.get(key, 0) <= 0:
            self._finish_retirement(key)

    def _release(self, runtime_key: str) -> None:
        count = self._lease_counts.get(runtime_key, 0)
        if count <= 1:
            self._lease_counts.pop(runtime_key, None)
            if runtime_key in self._retired:
                self._finish_retirement(runtime_key)
        else:
            self._lease_counts[runtime_key] = count - 1

    def _finish_retirement(self, runtime_key: str) -> None:
        target = self._retired.pop(runtime_key, None)
        self._revoke_events.pop(runtime_key, None)
        if target is None or self._retire_callback is None:
            return
        try:
            result = self._retire_callback(target)
            if inspect.isawaitable(result):
                asyncio.ensure_future(result)
        except Exception:
            log.exception("Host retirement callback failed for %s", target.alias)

    def _all_runtime_targets(self) -> dict[str, HostTarget]:
        result = {target.runtime_key: target for target in self._snapshot.values()}
        result.update(self._retired)
        return result

    @staticmethod
    def _same_definition(left: HostTarget, right: HostTarget) -> bool:
        fields = (
            "alias",
            "host_id",
            "address",
            "ssh_user",
            "os",
            "port",
            "description",
            "enabled",
            "trust_mode",
            "host_keys",
            "key_path",
            "known_hosts_path",
            "host_key_alias",
            "targetable",
            "trust_state",
        )
        return all(getattr(left, field) == getattr(right, field) for field in fields)
