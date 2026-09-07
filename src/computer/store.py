"""Durable no-replay receipts and bounded private evidence; no desktop imports."""

import hashlib
import json
import os
import re
import sqlite3
import stat
import threading
import time
import uuid
from pathlib import Path

from .models import ComputerError, RequestContext, SessionGrant
from .policy import MAX_TASK_SECONDS

FRAME_MAX_BYTES = 2 * 1024 * 1024
FRAME_MAX_PIXELS = 2_000_000
SESSION_MAX_BYTES = 64 * 1024 * 1024
GLOBAL_MAX_BYTES = 256 * 1024 * 1024
EVIDENCE_TTL = 24 * 3600


def _private_path(path: str | Path, *, directory: bool) -> Path:
    p = Path(path)
    if not p.is_absolute() or p.is_symlink():
        raise ComputerError("unsafe_storage_path")
    if Path("/opt/odin") in (p.resolve(), *p.resolve().parents):
        raise ComputerError("unsafe_storage_path")
    if any(parent.is_symlink() for parent in p.parents):
        raise ComputerError("unsafe_storage_path")
    target = p if directory else p.parent
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    if target.stat().st_uid != os.geteuid() or target.stat().st_mode & 0o077:
        raise ComputerError("storage_not_private")
    return p


def canonical_hash(payload: dict) -> str:
    try:
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (ValueError, TypeError, UnicodeError) as exc:
        raise ComputerError("invalid_arguments") from exc
    if len(raw) > 65536:
        raise ComputerError("arguments_too_large")
    return hashlib.sha256(raw).hexdigest()


class ComputerStore:
    def __init__(self, db_path: str | Path, evidence_path: str | Path, *, clock=time.time):
        self.clock = clock
        self.lock = threading.RLock()
        path = _private_path(db_path, directory=False)
        self.evidence_path = _private_path(evidence_path, directory=True)
        if path.exists() and (not path.is_file() or path.stat().st_mode & 0o077):
            raise ComputerError("storage_not_private")
        fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        self.dir_fd = os.open(self.evidence_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.db = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, channel_id TEXT NOT NULL,
                turn_id TEXT NOT NULL, host_id TEXT NOT NULL, generation INTEGER NOT NULL,
                state TEXT NOT NULL, app TEXT NOT NULL, created_at REAL NOT NULL,
                expires_at REAL NOT NULL, actions INTEGER NOT NULL DEFAULT 0);
            CREATE UNIQUE INDEX IF NOT EXISTS single_active_computer ON sessions ((1))
                WHERE state IN ('starting','active','paused','quarantined');
            CREATE TABLE IF NOT EXISTS receipts (
                session_id TEXT NOT NULL, action_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
                status TEXT NOT NULL, result TEXT NOT NULL,
                PRIMARY KEY(session_id,action_id));
            CREATE TABLE IF NOT EXISTS session_cleanup (
                session_id TEXT PRIMARY KEY, result TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS session_runtime (
                session_id TEXT PRIMARY KEY, descriptor TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS session_recovery (
                session_id TEXT PRIMARY KEY, result TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS evidence (
                evidence_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, name TEXT NOT NULL,
                kind TEXT NOT NULL, size INTEGER NOT NULL, digest TEXT NOT NULL,
                device INTEGER NOT NULL, inode INTEGER NOT NULL, expires_at REAL NOT NULL);
        """)
        # Upgrade development stores without recreating sessions or their evidence.
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                columns = {row[1] for row in self.db.execute("PRAGMA table_info(sessions)")}
                for name, definition in (
                    ("consent_generation", "INTEGER NOT NULL DEFAULT 1"),
                    ("platform", "TEXT NOT NULL DEFAULT 'x11'"),
                    ("environment", "TEXT NOT NULL DEFAULT 'isolated'"),
                ):
                    if name not in columns:
                        self.db.execute(f"ALTER TABLE sessions ADD COLUMN {name} {definition}")
                # R3 removes conversation restrictions, including persisted pre-R3 state.
                self.db.execute("DROP TABLE IF EXISTS restrictions")
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def recover(self) -> None:
        """Only the singleton controller calls this; read-only consumers must not."""
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                self.db.execute("UPDATE receipts SET status='unknown', result=? "
                                "WHERE status='pending'",
                                (json.dumps({"status": "unknown", "reason": "controller_lost"}),))
                self.db.execute("UPDATE sessions SET state='quarantined', generation=generation+1, "
                                "consent_generation=consent_generation+1 "
                                "WHERE state IN ('active','starting','paused')")
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def create_session(self, context: RequestContext, app: str, *, platform="x11",
                       environment="isolated") -> SessionGrant:
        from .app_profiles import validate_attached_only_profile
        validate_attached_only_profile(app, platform=platform, environment=environment)
        now = self.clock()
        values = (uuid.uuid4().hex, context.owner_id, context.channel_id, context.turn_id,
                  context.host_id, 1, "starting", app, now, now + MAX_TASK_SECONDS, 0,
                  1, platform, environment)
        try:
            with self.lock:
                self.db.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", values)
        except sqlite3.IntegrityError as exc:
            raise ComputerError("session_busy") from exc
        return SessionGrant(*values)

    def record_runtime(self, grant: SessionGrant, descriptor: dict) -> None:
        """Durable launch fence. Native IDs remain private and cannot be replaced."""
        from .runtime.recovery import validate_descriptor
        try:
            validate_descriptor(descriptor, grant.session_id)
            encoded = json.dumps(descriptor, sort_keys=True)
        except (TypeError, ValueError) as exc:
            raise ComputerError('invalid_runtime_identity') from exc
        with self.lock:
            current = self.get_session(grant.session_id)
            if (current.generation != grant.generation
                    or current.state not in {'starting', 'active'}):
                raise ComputerError('grant_revoked')
            previous = self.runtime_descriptor(grant.session_id)
            if previous is not None:
                fixed = set(previous) - {'launch_pending', 'processes'}
                if (any(previous[k] != descriptor.get(k) for k in fixed)
                        or descriptor['processes'][:len(previous['processes'])]
                        != previous['processes']):
                    raise ComputerError('runtime_identity_changed')
            self.db.execute('INSERT OR REPLACE INTO session_runtime VALUES (?,?)',
                            (grant.session_id, encoded))

    def runtime_descriptor(self, session_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute('SELECT descriptor FROM session_runtime WHERE session_id=?',
                                  (session_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def recovery_status(self, session_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute('SELECT result FROM session_recovery WHERE session_id=?',
                                  (session_id,)).fetchone()
            if row:
                return json.loads(row[0])
            grant = self.get_session(session_id)
            if grant.state != 'quarantined':
                return None
            identity = self.runtime_descriptor(session_id)
        return {'status': 'operator_reconciliation_required' if identity else
                'operator_cleanup_required', 'reason': 'controller_lost' if identity else
                'legacy_runtime_identity_missing', 'complete': False}

    def finish_recovery(self, grant: SessionGrant, result: dict, *, acknowledged=False):
        """CAS prevents delayed inspection from clearing another runtime generation."""
        clean = result.get('status') == 'absence_verified' and not acknowledged
        receipt = {**result, 'complete': clean}
        with self.lock:
            self.db.execute('BEGIN IMMEDIATE')
            try:
                current = self.get_session(grant.session_id)
                if current.generation != grant.generation or current.state != 'quarantined':
                    raise ComputerError('stale_generation')
                self.db.execute('INSERT OR REPLACE INTO session_recovery VALUES (?,?)',
                                (grant.session_id, json.dumps(receipt, sort_keys=True)))
                if clean or acknowledged:
                    self.record_cleanup(grant.session_id, {'stopped': clean}, clean=clean)
                    self.set_state(grant.session_id, 'closed', revoke=True)
                self.db.execute('COMMIT')
            except BaseException:
                self.db.execute('ROLLBACK')
                raise
        return self.get_session(grant.session_id)

    def get_session(self, session_id: str) -> SessionGrant:
        with self.lock:
            row = self.db.execute(
                "SELECT * FROM sessions WHERE session_id=?", (session_id,)
            ).fetchone()
        if row is None:
            raise ComputerError("not_found")
        return SessionGrant(**dict(row))

    def find_session(self, context: RequestContext) -> SessionGrant | None:
        with self.lock:
            row = self.db.execute("SELECT * FROM sessions WHERE owner_id=? AND channel_id=? "
                                  "AND host_id=? ORDER BY created_at DESC LIMIT 1",
                                  (context.owner_id, context.channel_id,
                                   context.host_id)).fetchone()
        return SessionGrant(**dict(row)) if row else None

    def set_state(self, session_id: str, state: str, *, revoke: bool = False,
                  turn_id: str | None = None) -> SessionGrant:
        if state not in {"starting", "active", "paused", "cancelled", "closed", "quarantined"}:
            raise ComputerError("invalid_state")
        with self.lock:
            self.db.execute("UPDATE sessions SET state=?,generation=generation+?,"
                            "consent_generation=consent_generation+?,"
                            "turn_id=COALESCE(?,turn_id) WHERE session_id=?",
                            (state, int(revoke), int(revoke), turn_id, session_id))
        return self.get_session(session_id)

    def record_cleanup(self, session_id: str, result: object, *, clean: bool) -> None:
        """Persist bounded evidence, never arbitrary backend error strings or paths."""
        values = result if type(result) is dict else {}
        receipt = {key: (values.get(key) if type(values.get(key)) is bool else None)
                   for key in ("stopped", "released", "applications_preserved",
                               "input_revoked", "capture_revoked", "input_was_enabled",
                               "portal_session_closed", "ei_connection_closed",
                               "portal_connection_closed")}
        devices = values.get("owned_devices")
        receipt["owned_devices"] = (devices if type(devices) is str and devices in
                                    {"removed", "retained_inactive", "not_created",
                                     "portal_owned_connections_closed"} else "unknown")
        receipt["complete"] = clean is True
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO session_cleanup VALUES (?,?)",
                            (session_id, json.dumps(receipt, sort_keys=True)))

    def cleanup(self, session_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT result FROM session_cleanup WHERE session_id=?",
                                  (session_id,)).fetchone()
        return json.loads(row[0]) if row is not None else None

    def receipt(self, session_id: str, action_id: str, payload_hash: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT * FROM receipts WHERE session_id=? AND action_id=?",
                                  (session_id, action_id)).fetchone()
        if row is None:
            return None
        if row["payload_hash"] != payload_hash:
            raise ComputerError("action_id_conflict")
        result = json.loads(row["result"])
        if row["status"] == "pending":
            result = {"status": "unknown", "reason": "pending_no_replay"}
        return {**result, "action_id": action_id, "session_id": session_id}

    def begin_action(self, grant: SessionGrant, action_id: str, payload_hash: str,
                     max_actions: int) -> dict | None:
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                existing = self.receipt(grant.session_id, action_id, payload_hash)
                if existing is not None:
                    self.db.execute("COMMIT")
                    return existing
                changed = self.db.execute(
                    "UPDATE sessions SET actions=actions+1 WHERE session_id=? AND generation=? "
                    "AND state='active' AND actions<? AND expires_at>?",
                    (grant.session_id, grant.generation, max_actions, self.clock())).rowcount
                if not changed:
                    raise ComputerError("grant_revoked_or_limit")
                self.db.execute("INSERT INTO receipts VALUES (?,?,?,?,?)",
                                (grant.session_id, action_id, payload_hash, "pending", "{}"))
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return None

    def finish_action(self, session_id: str, action_id: str, result: dict) -> dict:
        allowed = {"status", "reason", "verification", "observation_id", "execution"}
        if set(result) - allowed or result.get("status") not in {
            "executed", "verified", "not_satisfied", "unavailable", "unknown"
        }:
            raise ComputerError("invalid_receipt")
        with self.lock:
            self.db.execute("UPDATE receipts SET status=?,result=? "
                            "WHERE session_id=? AND action_id=?",
                            (result["status"], json.dumps(result), session_id, action_id))
        return {**result, "session_id": session_id, "action_id": action_id}

    @staticmethod
    def validate_name(name: str) -> str:
        if (not isinstance(name, str)
                or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_. -]{0,127}", name)
                or name in {".", ".."}):
            raise ComputerError("invalid_export_name")
        return name

    def prune(self) -> None:
        with self.lock:
            rows = self.db.execute("SELECT evidence_id FROM evidence WHERE expires_at<=?",
                                   (self.clock(),)).fetchall()
            for row in rows:
                try:
                    os.unlink(row[0], dir_fd=self.dir_fd)
                except FileNotFoundError:
                    pass
                self.db.execute("DELETE FROM evidence WHERE evidence_id=?", (row[0],))

    def purge_evidence(self) -> None:
        """Disable/shutdown revokes retained downloads and removes their bytes."""
        with self.lock:
            rows = self.db.execute("SELECT evidence_id FROM evidence").fetchall()
            for row in rows:
                try:
                    os.unlink(row[0], dir_fd=self.dir_fd)
                except FileNotFoundError:
                    pass
                self.db.execute("DELETE FROM evidence WHERE evidence_id=?", (row[0],))

    def put_evidence(
        self, session_id: str, content: bytes, *, kind="frame", name="frame.png"
    ) -> str:
        name = self.validate_name(name)
        if not isinstance(content, bytes) or not content or kind not in {"frame", "export"}:
            raise ComputerError("invalid_evidence")
        limit = FRAME_MAX_BYTES if kind == "frame" else SESSION_MAX_BYTES
        if len(content) > limit:
            raise ComputerError("evidence_too_large")
        evidence_id = uuid.uuid4().hex
        with self.lock:
            self.prune()
            self.db.execute("BEGIN IMMEDIATE")
            fd = None
            created = False
            try:
                total, local = self.db.execute(
                    "SELECT COALESCE(SUM(size),0),COALESCE(SUM(CASE WHEN session_id=? "
                    "THEN size ELSE 0 END),0) FROM evidence", (session_id,)).fetchone()
                if (total + len(content) > GLOBAL_MAX_BYTES
                        or local + len(content) > SESSION_MAX_BYTES):
                    raise ComputerError("evidence_quota")
                fd = os.open(evidence_id, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600, dir_fd=self.dir_fd)
                created = True
                view = memoryview(content)
                while view:
                    count = os.write(fd, view)
                    view = view[count:]
                os.fsync(fd)
                info = os.fstat(fd)
                self.db.execute("INSERT INTO evidence VALUES (?,?,?,?,?,?,?,?,?)",
                                (evidence_id, session_id, name, kind, len(content),
                                 hashlib.sha256(content).hexdigest(), info.st_dev, info.st_ino,
                                 self.clock() + EVIDENCE_TTL))
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                if created:
                    os.unlink(evidence_id, dir_fd=self.dir_fd)
                raise
            finally:
                if fd is not None:
                    os.close(fd)
        return evidence_id

    def read_evidence(self, context: RequestContext, evidence_id: str) -> tuple[bytes, dict]:
        """Caller must additionally apply the current external authorization callback."""
        with self.lock:
            row = self.db.execute("SELECT e.* FROM evidence e JOIN sessions s USING(session_id) "
                                  "WHERE evidence_id=? AND owner_id=? "
                                  "AND channel_id=? AND host_id=?",
                                  (evidence_id, context.owner_id, context.channel_id,
                                   context.host_id)).fetchone()
            if row is None or row["expires_at"] <= self.clock():
                raise ComputerError("evidence_unavailable")
            try:
                fd = os.open(row["evidence_id"], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                             dir_fd=self.dir_fd)
                try:
                    info = os.fstat(fd)
                    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                            or info.st_uid != os.geteuid() or info.st_mode & 0o077
                            or (info.st_dev, info.st_ino, info.st_size)
                            != (row["device"], row["inode"], row["size"])):
                        raise ComputerError("evidence_changed")
                    with os.fdopen(fd, "rb", closefd=False) as source:
                        content = source.read(row["size"] + 1)
                    after = os.fstat(fd)
                    if (after.st_mtime_ns, after.st_ctime_ns, after.st_size) != (
                        info.st_mtime_ns, info.st_ctime_ns, info.st_size
                    ):
                        raise ComputerError("evidence_changed")
                finally:
                    os.close(fd)
            except OSError as exc:
                raise ComputerError("evidence_unavailable") from exc
            if len(content) != row["size"] or hashlib.sha256(content).hexdigest() != row["digest"]:
                raise ComputerError("evidence_changed")
            return content, {"evidence_id": evidence_id, "name": row["name"],
                             "size": row["size"], "sha256": row["digest"],
                             "kind": row["kind"], "expires_at": row["expires_at"]}

    def close(self) -> None:
        with self.lock:
            self.db.close()
            os.close(self.dir_fd)
