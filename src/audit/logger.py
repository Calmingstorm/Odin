from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO, Literal

import aiofiles

from ..observability.correlation import get_turn
from ..observability.diagnostics import scrub_diagnostic
from ..observability.failure_classes import classify_failure
from ..odin_log import get_logger
from ..permissions.persistence import write_private_atomic
from .signer import GENESIS_HASH, AuditSigner, verify_log

log = get_logger("audit")


DEFAULT_RESULT_CAP = 4000
# Max serialized size of a single entry's tool_input. A full patch payload
# was stored uncapped (68 KB lines observed); oversized inputs are replaced with
# a truncation marker so one big call can't bloat the log.
DEFAULT_TOOL_INPUT_CAP = 4000
# Rotate the audit file once it exceeds this size, keeping this many old files.
# Without rotation the file grew unbounded (48 MB / 65k lines observed).
DEFAULT_MAX_BYTES = 100 * 1024 * 1024  # 100 MB
DEFAULT_MAX_FILES = 5


# Block size for reverse reads. Big enough that a limit-10 dashboard query
# usually resolves inside one block of the newest log; small enough that a
# match-poor filter walking deep never holds more than block + one line.
_REVERSE_BLOCK_SIZE = 64 * 1024


async def _iter_lines_reverse(
    path: Path | int, block_size: int = _REVERSE_BLOCK_SIZE
) -> AsyncIterator[bytes]:
    """Yield the file's non-empty lines newest-first without a full scan.

    Reads fixed-size blocks backwards from EOF, reassembling lines that
    straddle block boundaries. The iteration anchors at the EOF observed on
    open: entries appended afterwards are simply not seen (the forward scan
    had the same exposure at its own moment of EOF), and rotation renames
    the inode this handle already holds, so the anchored view stays intact.
    A torn final line (no trailing newline) is yielded as-is — callers
    already skip what fails to parse.
    """
    if isinstance(path, int):
        opened = aiofiles.open(path, "rb", closefd=False)
    else:
        opened = aiofiles.open(path, "rb")
    async with opened as f:
        pos = await f.seek(0, os.SEEK_END)
        tail = b""
        while pos > 0:
            read_size = min(block_size, pos)
            pos -= read_size
            await f.seek(pos)
            block = await f.read(read_size)
            lines = (block + tail).split(b"\n")
            # lines[0] may be the tail of a line whose head lives in the
            # not-yet-read earlier block — hold it until that block arrives
            # (or BOF proves it complete).
            tail = lines[0]
            for raw in reversed(lines[1:]):
                if raw.strip():
                    yield raw
        if tail.strip():
            yield tail


def _cap_tool_input(tool_input: dict, cap: int) -> dict | str:
    """Bound the serialized size of an audit entry's tool_input."""
    try:
        blob = json.dumps(tool_input, default=str)
    except Exception:
        return "<unserializable tool_input>"
    if len(blob) <= cap:
        return tool_input
    return f"<tool_input truncated: {len(blob)} bytes>" + blob[:cap]


class AuditLogger:
    """Append-only JSON Lines audit log for tool executions."""

    def __init__(
        self, path: str = "./data/audit.jsonl", *,
        hmac_key: str = "", classify_failures: bool = True,
        result_cap: int = DEFAULT_RESULT_CAP,
        tool_input_cap: int = DEFAULT_TOOL_INPUT_CAP,
        max_bytes: int = DEFAULT_MAX_BYTES,
        max_files: int = DEFAULT_MAX_FILES,
    ) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._event_callback: Callable | None = None
        self._signer: AuditSigner | None = AuditSigner(hmac_key) if hmac_key else None
        # Serializes every operation that reads/mutates the signer's chain
        # state or rotates the active file. The HMAC chain records ORDER: each
        # entry's _prev_hmac is the previous entry's _hmac. sign() advances that
        # running hash, so sign→write must be atomic w.r.t. other persists —
        # otherwise two concurrent audited actions sign in one order and write
        # in another, and verify sees the file out of chain-order (they invented
        # await so we could race ourselves in one thread). Invariant: _persist,
        # _maybe_rotate (as called from persist), and initialize_chain all hold
        # this lock.
        self._persist_lock = asyncio.Lock()
        self._repair_marker = self.path.with_name(self.path.name + ".repair-required")
        self.repair_required = self._repair_marker.exists()
        self.durability_degraded = self.repair_required
        self._chain_initialized = False
        self._classify_failures = classify_failures
        self._result_cap = result_cap
        self._tool_input_cap = tool_input_cap
        self._max_bytes = max_bytes
        self._max_files = max_files
        # Read-side, identity-keyed incremental counters.  Values are
        # (consumed byte offset, unconsumed torn tail, counts).  Rotation keeps
        # the inode, so an already-counted generation is reused under its new
        # pathname; only appended bytes of the active inode are consumed.
        self._tool_count_cache: dict[
            tuple[int, int], tuple[int, bytes, dict[str, int]]
        ] = {}
        self._tool_count_lock = asyncio.Lock()

    def _maybe_rotate(self) -> None:
        """Rotate audit.jsonl → .1 → .2 … once it exceeds max_bytes.

        Must be called with _persist_lock held (it resets the signer's chain
        state; rotation + first-entry-signing must be atomic). Called before
        each append. Bounds total growth to roughly
        max_bytes * (max_files + 1). The HMAC chain (if enabled) starts fresh in
        the new current file — the signer's prev-hash is reset to GENESIS after
        rotation, so verify_integrity() (which reads the current file from
        genesis) stays valid instead of chaining across the rotation boundary
        and failing on the first post-rotation entry."""
        try:
            if not self.path.exists() or self.path.stat().st_size < self._max_bytes:
                return
        except OSError:
            return
        try:
            oldest = self.path.with_name(self.path.name + f".{self._max_files}")
            if oldest.exists():
                oldest.unlink()
            for i in range(self._max_files - 1, 0, -1):
                src = self.path.with_name(self.path.name + f".{i}")
                if src.exists():
                    src.rename(self.path.with_name(self.path.name + f".{i + 1}"))
            self.path.rename(self.path.with_name(self.path.name + ".1"))
            if self._signer is not None:
                # New file = new chain from genesis (the rotated .1 keeps its own
                # self-consistent chain for offline verification).
                self._signer.prev_hmac = GENESIS_HASH
            log.info("Rotated audit log at %d bytes", self._max_bytes)
        except OSError as e:
            log.error("Audit log rotation failed: %s", e)

    def _rotated_paths_newest_first(self) -> list[Path]:
        """Current file plus existing rotated files, newest → oldest."""
        paths = [self.path]
        for i in range(1, self._max_files + 1):
            p = self.path.with_name(self.path.name + f".{i}")
            if p.exists():
                paths.append(p)
        return paths

    async def _open_read_snapshot(self) -> list[tuple[BinaryIO, os.stat_result]]:
        """Open one stable descriptor for every retained generation.

        Pathnames are mutable during rotation; descriptors are not.  The lock
        is held only while the descriptor set is opened, never while content is
        scanned.  Identity de-duplication also makes an external rename race
        fail closed rather than reading one inode twice.
        """
        opened: list[tuple[BinaryIO, os.stat_result]] = []
        seen: set[tuple[int, int]] = set()
        async with self._persist_lock:
            for path in self._rotated_paths_newest_first():
                try:
                    handle = open(path, "rb")
                    stat = os.fstat(handle.fileno())
                except FileNotFoundError:
                    continue
                except OSError as exc:
                    log.error("Failed to open audit log %s: %s", path, exc)
                    continue
                identity = (stat.st_dev, stat.st_ino)
                if identity in seen:
                    handle.close()
                    continue
                seen.add(identity)
                opened.append((handle, stat))
        return opened

    async def open_read_snapshot(self) -> list[tuple[BinaryIO, os.stat_result]]:
        """Return inode-deduplicated read descriptors for retained generations.

        Callers own and must close the descriptors.  This is a read-only
        observer seam; it never signs, appends, or mutates the HMAC chain.
        """
        return await self._open_read_snapshot()

    async def _collect_matches(self, predicate: Callable[[dict], bool], limit: int) -> list[dict]:
        """Return up to *limit* matching entries, most-recent first.

        Reads blocks backwards from a stable descriptor snapshot and stops at
        the limit.  Briefly serializing descriptor acquisition with rotation
        prevents current→.1 from being read twice while the former .1 vanishes
        to .2; scans themselves never hold the persistence lock.
        """
        if limit <= 0:
            return []
        collected: list[dict] = []
        snapshot = await self._open_read_snapshot()
        try:
            for handle, _stat in snapshot:
                try:
                    async for raw in _iter_lines_reverse(handle.fileno()):
                        try:
                            entry = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        if predicate(entry):
                            collected.append(entry)
                            if len(collected) >= limit:
                                return collected
                except OSError as exc:
                    log.error("Failed to read audit log snapshot: %s", exc)
        finally:
            for handle, _stat in snapshot:
                handle.close()
        return collected

    def set_event_callback(self, callback: Callable) -> None:
        """Set a callback to be invoked with each audit entry (for live WS events)."""
        self._event_callback = callback

    async def _persist(self, entry: dict) -> None:
        """Rotate, sign, append, and fan out one entry.

        Rotation happens BEFORE signing so that when a rotation occurs the entry
        being written becomes the first line of the fresh file and its
        _prev_hmac is GENESIS (the signer is reset in _maybe_rotate). Signing
        after rotation was the bug: the first post-rotation entry chained to the
        old file and verify_integrity() failed.

        Rotate → sign → append run under _persist_lock so the chain's write
        order matches its sign order (see __init__). The event fan-out is a
        best-effort side effect and runs AFTER the lock — the signed append has
        already durably happened, so a slow or failing callback can neither
        stall other persists nor affect the persisted result."""
        entry = scrub_diagnostic(entry)
        if not self._chain_initialized:
            await self.initialize_chain()
        async with self._persist_lock:
            if self.repair_required:
                entry["audit_durability"] = "repair_required"
            else:
                self._maybe_rotate()
                if self._signer:
                    self._signer.prepare(entry)
                line = json.dumps(entry, default=str) + "\n"
                append = asyncio.create_task(self._append_durable(line))
                cancelled = False
                try:
                    # aiofiles delegates writes to threads. Cancellation must not
                    # release chain ownership while one can still append bytes.
                    while not append.done():
                        try:
                            await asyncio.shield(append)
                        except asyncio.CancelledError:
                            cancelled = True
                    append.result()
                except BaseException as exc:
                    self.durability_degraded = True
                    entry["audit_durability"] = (
                        "repair_required" if self.repair_required else "not_persisted"
                    )
                    log.error(
                        "Audit append failed (%s); durability=%s",
                        type(exc).__name__, entry["audit_durability"],
                    )
                    if not isinstance(exc, Exception):
                        raise
                else:
                    if self._signer:
                        self._signer.commit(entry)
                    self.durability_degraded = False
                if cancelled:
                    raise asyncio.CancelledError
        if self._event_callback:
            try:
                await self._event_callback(entry)
            except Exception:
                pass

    async def _append_durable(self, line: str) -> None:
        """Persist intent before the first byte; remove it only after settlement."""
        intent = False
        try:
            async with aiofiles.open(self.path, "a", encoding="utf-8") as f:
                if not write_private_atomic(
                    self._repair_marker,
                    "Audit append pending or uncertain; operator repair required.\n",
                ):
                    self.repair_required = True
                    raise OSError("Audit intent durability unproven")
                intent = True
                written = await f.write(line)
                if written != len(line):
                    raise OSError("Short audit append")
                await f.flush()
                os.fsync(f.fileno())
            self._repair_marker.unlink()
            directory = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        except BaseException:
            if intent:
                self._quarantine_uncertain_append()
            elif self._repair_marker.exists():
                self.repair_required = True
            raise

    def _quarantine_uncertain_append(self) -> None:
        """Fence further appends, preserving every uncertain byte for repair."""
        self.repair_required = True
        self.durability_degraded = True
        try:
            write_private_atomic(
                self._repair_marker,
                "Audit append outcome uncertain. Preserve log bytes; operator repair required.\n",
            )
        except OSError:
            log.critical("Audit repair marker failed to persist; restart requires operator repair")

    async def log_execution(
        self,
        *,
        user_id: str,
        user_name: str,
        channel_id: str,
        tool_name: str,
        tool_input: dict,
        approved: bool,
        result_summary: str,
        execution_time_ms: int,
        error: str | None = None,
        diff: str | None = None,
        risk_level: str | None = None,
        risk_reason: str | None = None,
        audit_metadata: dict | None = None,
    ) -> None:
        entry = {
            "timestamp": datetime.now(UTC).isoformat(),
            "user_id": user_id,
            "user_name": user_name,
            "channel_id": channel_id,
            "tool_name": tool_name,
            "tool_input": _cap_tool_input(scrub_diagnostic(tool_input), self._tool_input_cap),
            "approved": approved,
            "result_summary": scrub_diagnostic(result_summary)[:self._result_cap],
            "execution_time_ms": execution_time_ms,
            "error": error,
        }
        if error and self._classify_failures:
            # Write-time heuristic classification (observability). The raw
            # error string is classified here; aggregates never re-store it.
            entry["failure"] = classify_failure(error)
        turn = get_turn()
        if turn:
            # Correlation: join audit entries to the trajectory turn (and
            # loop iteration) they belong to. Metadata only.
            entry["turn"] = turn
        if diff:
            entry["diff"] = diff
        if risk_level:
            entry["risk_level"] = risk_level
        if risk_reason:
            entry["risk_reason"] = risk_reason
        if audit_metadata:
            # Bounded structured metadata (e.g. image backend/route/dims) — the
            # caller guarantees no prompts, IDs, or payloads.
            entry["audit_metadata"] = audit_metadata
        await self._persist(entry)

    async def log_event(
        self,
        *,
        event_type: str,
        action: str,
        actor: str = "",
        detail: str = "",
        channel_id: str = "",
        metadata: dict | None = None,
    ) -> None:
        """Log a generic state-changing event (agents, schedules, permissions, etc.)."""
        elapsed = (metadata or {}).get("elapsed_ms")
        entry: dict = {
            "timestamp": datetime.now(UTC).isoformat(),
            "type": event_type,
            "action": action,
            "actor": actor,
            "detail": scrub_diagnostic(detail)[:self._result_cap],
            "tool_name": action,
            "user_id": actor,
        }
        if elapsed is not None:
            entry["execution_time_ms"] = elapsed
        if channel_id:
            entry["channel_id"] = channel_id
        if metadata:
            entry["metadata"] = metadata
        await self._persist(entry)

    async def log_web_action(
        self,
        *,
        method: str,
        path: str,
        status: int,
        ip: str = "",
        execution_time_ms: int = 0,
        diff: str | None = None,
        user_id: str = "",
        username: str = "",
        label: str = "",
    ) -> None:
        """Log a web UI API action (state-changing requests)."""
        entry: dict = {
            "timestamp": datetime.now(UTC).isoformat(),
            "type": "web_action",
            "method": method,
            "path": path,
            "status": status,
            "success": status < 400,
            "ip": ip,
            "execution_time_ms": execution_time_ms,
        }
        if status >= 400:
            entry["error"] = f"HTTP {status}"
        if user_id:
            entry["user_id"] = user_id
            entry["actor"] = f"web:{user_id}"
        if username:
            entry["user_name"] = username
        if label:
            entry["label"] = label
        if diff:
            entry["diff"] = diff
        await self._persist(entry)

    async def count_by_tool(self) -> dict[str, int]:
        """Return retained-history execution counts without rescanning history."""
        async with self._tool_count_lock:
            return await self._count_by_tool_unlocked()

    async def _count_by_tool_unlocked(self) -> dict[str, int]:
        """Consume each retained inode once, then only its appended bytes.

        Each retained inode is consumed once and then only from its previous
        EOF. Rotation renames an inode but does not invalidate its cached
        counts; generations that age out are pruned after the snapshot.
        """
        snapshot = await self._open_read_snapshot()
        if not snapshot:
            self._tool_count_cache.clear()
            return {}
        try:
            for handle, stat in snapshot:
                identity = (stat.st_dev, stat.st_ino)
                cached = self._tool_count_cache.get(identity)
                if cached is None or cached[0] > stat.st_size:
                    offset, tail = 0, b""
                    counts: dict[str, int] = {}
                else:
                    offset, tail, counts = cached
                    counts = dict(counts)
                if offset < stat.st_size:
                    await asyncio.to_thread(handle.seek, offset)
                    chunk = await asyncio.to_thread(handle.read, stat.st_size - offset)
                    data = tail + chunk
                    lines = data.split(b"\n")
                    tail = lines.pop()
                    for raw in lines:
                        if not raw.strip():
                            continue
                        try:
                            entry = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        name = entry.get("tool_name")
                        if name:
                            counts[name] = counts.get(name, 0) + 1
                    offset = stat.st_size
                self._tool_count_cache[identity] = (offset, tail, counts)
        finally:
            for handle, _stat in snapshot:
                handle.close()
        # Cache only COMPLETE retained generations. A descriptor can rotate
        # out after the snapshot opens; it must not contribute forever merely
        # because we saw it in this call. Current is allowed to grow beyond the
        # snapshotted size; rotated generations must still have the same size.
        retained: set[tuple[int, int]] = set()
        async with self._persist_lock:
            for index, path in enumerate(self._rotated_paths_newest_first()):
                try:
                    current_stat = path.stat()
                except OSError:
                    continue
                identity = (current_stat.st_dev, current_stat.st_ino)
                cached = self._tool_count_cache.get(identity)
                if cached is None:
                    continue
                consumed = cached[0]
                if index == 0 or current_stat.st_size == consumed:
                    retained.add(identity)
        self._tool_count_cache = {
            identity: state
            for identity, state in self._tool_count_cache.items()
            if identity in retained
        }
        total: dict[str, int] = {}
        for _offset, _tail, counts in self._tool_count_cache.values():
            for name, count in counts.items():
                total[name] = total.get(name, 0) + count
        return dict(sorted(total.items(), key=lambda item: item[1], reverse=True))

    async def search(
        self,
        *,
        tool_name: str | None = None,
        user: str | None = None,
        host: str | None = None,
        keyword: str | None = None,
        date: str | None = None,
        status: str | None = None,
        has_error: bool | None = None,
        min_duration_ms: int | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Search audit log (most recent first). Filters are ANDed.

        New filters:
        - status: match entries with this status value (e.g. "error", "success")
        - has_error: True = only entries with non-empty error field
        - min_duration_ms: only entries with duration_ms >= this value
        """
        def _match(entry: dict) -> bool:
            if tool_name and entry.get("tool_name") != tool_name:
                return False
            if user and user.lower() not in (
                entry.get("user_name", "").lower() + entry.get("user_id", "")
            ):
                return False
            if host:
                inp = entry.get("tool_input", {})
                if isinstance(inp, dict) and inp.get("host") != host:
                    return False
            if date and not entry.get("timestamp", "").startswith(date):
                return False
            if keyword:
                blob = json.dumps(entry).lower()
                if keyword.lower() not in blob:
                    return False
            if status:
                entry_status = entry.get("status") or entry.get("metadata", {}).get("status", "")
                if status.lower() != str(entry_status).lower():
                    return False
            if has_error is True:
                err = entry.get("error") or entry.get("metadata", {}).get("error", "")
                if not err:
                    return False
            if min_duration_ms is not None:
                dur = (
                    entry.get("execution_time_ms")
                    or entry.get("metadata", {}).get("duration_ms")
                    or entry.get("duration_ms")
                    or entry.get("metadata", {}).get("elapsed_ms")
                    or 0
                )
                if dur < min_duration_ms:
                    return False
            return True

        return await self._collect_matches(_match, limit)

    async def search_logs(
        self,
        *,
        level: Literal["error", "info", "all"] | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
        keyword: str | None = None,
        tool_name: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """Search audit log with level, time-range, and keyword filters.

        Level is derived from the ``error`` field: entries with a non-null
        ``error`` value are ``error``, everything else is ``info``.
        ``start_time`` / ``end_time`` are ISO-8601 prefixes compared
        lexicographically against the entry timestamp.
        """
        def _match(entry: dict) -> bool:
            ts = entry.get("timestamp", "")
            if start_time and ts < start_time:
                return False
            if end_time and ts > end_time:
                return False
            if level and level != "all":
                has_error = bool(entry.get("error"))
                if level == "error" and not has_error:
                    return False
                if level == "info" and has_error:
                    return False
            if tool_name and entry.get("tool_name") != tool_name:
                return False
            if keyword:
                blob = json.dumps(entry).lower()
                if keyword.lower() not in blob:
                    return False
            return True

        results = await self._collect_matches(_match, limit)

        return results

    async def get_log_stats(self) -> dict:
        """Return summary statistics for the log file."""
        if not self.path.exists():
            return {"total": 0, "errors": 0, "tools": 0, "web_actions": 0}

        total = 0
        errors = 0
        tools: set[str] = set()
        web_actions = 0

        try:
            async with aiofiles.open(self.path) as f:
                async for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    total += 1
                    if entry.get("error"):
                        errors += 1
                    tn = entry.get("tool_name")
                    if tn:
                        tools.add(tn)
                    if entry.get("type") == "web_action":
                        web_actions += 1
        except Exception as exc:
            log.error("Failed to read audit log for stats: %s", exc)

        return {
            "total": total,
            "errors": errors,
            "tool_count": len(tools),
            "tools": sorted(tools),
            "web_actions": web_actions,
        }

    async def search_diffs(
        self,
        *,
        tool_name: str | None = None,
        user: str | None = None,
        date: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Return audit entries that contain a diff, most recent first."""
        def _match(entry: dict) -> bool:
            if not entry.get("diff"):
                return False
            if tool_name and entry.get("tool_name") != tool_name:
                return False
            if user and user.lower() not in (
                entry.get("user_name", "").lower() + entry.get("user_id", "")
            ):
                return False
            if date and not entry.get("timestamp", "").startswith(date):
                return False
            return True

        return await self._collect_matches(_match, limit)

    async def search_by_risk(
        self,
        *,
        risk_level: str | None = None,
        tool_name: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Return audit entries that have a risk_level field, most recent first."""
        def _match(entry: dict) -> bool:
            if not entry.get("risk_level"):
                return False
            if risk_level and entry.get("risk_level") != risk_level:
                return False
            if tool_name and entry.get("tool_name") != tool_name:
                return False
            return True

        return await self._collect_matches(_match, limit)

    async def initialize_chain(self) -> None:
        """Resume only a verified chain, under the same ownership as appends."""
        async with self._persist_lock:
            if self._chain_initialized:
                return
            if self.repair_required or not self._signer or not self.path.exists():
                self._chain_initialized = True
                return
            try:
                async with aiofiles.open(self.path) as f:
                    lines = await f.readlines()
                predecessor = GENESIS_HASH
                signed = False
                for line in lines:
                    if not line.endswith("\n"):
                        raise ValueError("Unsettled audit tail")
                    if not line.strip():
                        continue
                    entry = json.loads(line)
                    if not isinstance(entry, dict):
                        raise ValueError("Non-object audit entry")
                    if "_hmac" not in entry and not signed:
                        continue  # Existing pre-signing history remains valid.
                    if not self._signer.verify_entry(entry, predecessor):
                        raise ValueError("Unverified audit chain")
                    predecessor = entry["_hmac"]
                    signed = True
                self._signer.prev_hmac = predecessor
            except Exception as exc:
                log.error("Audit chain initialization failed (%s)", type(exc).__name__)
                self._quarantine_uncertain_append()
            self._chain_initialized = True

    async def verify_integrity(self) -> dict:
        """Verify the HMAC chain of the audit log.

        Returns a dict with ``valid``, ``total``, ``verified``, ``first_bad``,
        and ``error`` fields.  Requires signing to be enabled.
        """
        if not self._signer:
            return {
                "valid": False,
                "total": 0,
                "verified": 0,
                "unsigned_prefix": 0,
                "first_bad": None,
                "availability": "not_enabled",
                "error": "Signing not enabled (no hmac_key configured)",
            }
        result = await verify_log(self.path, self._signer._key.decode())
        # Availability is distinct from verdict. A configured verifier that
        # returns valid=False is a failure even when its diagnostic has an
        # error string; only the explicit not_enabled shape is soft copy.
        result["availability"] = "available"
        result["durability"] = (
            "repair_required" if self.repair_required
            else "degraded" if self.durability_degraded else "durable"
        )
        return result
