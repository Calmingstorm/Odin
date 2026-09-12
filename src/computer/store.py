"""Durable no-replay receipts and bounded private evidence; no desktop imports."""

import hashlib
import json
import math
import os
import re
import sqlite3
import stat
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from .models import ComputerError, RequestContext, SessionGrant
from .policy import MAX_TASK_SECONDS
from .provisioning import ComputerProvisioningError, checked_path, open_private_directory

FRAME_MAX_BYTES = 2 * 1024 * 1024
FRAME_MAX_PIXELS = 2_000_000
SESSION_MAX_BYTES = 64 * 1024 * 1024
GLOBAL_MAX_BYTES = 256 * 1024 * 1024
EVIDENCE_TTL = 24 * 3600
STORE_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class HyprlandOutputGrant:
    """Immutable durable binding, never live scope or input authority."""

    grant_id: int
    session_id: str
    generation: int
    consent_generation: int
    output_name: str
    source_id: str
    application_identity: dict[str, object]
    created_at: float
    parent_grant_id: int | None = None


@dataclass(frozen=True)
class RecoveryPending:
    """CAS-owned recovery coordination state; no release attestation fields."""

    session_id: str
    recovery_generation: int
    grant_generation: int
    stop_epoch: int
    phase: str
    reason: str
    attempt: int
    next_retry_at: float | None
    old_grant: dict[str, object]
    candidate_epoch: str | None


def _private_path(path: str | Path, *, directory: bool) -> Path:
    p = checked_path(path)
    target = p if directory else p.parent
    fd = open_private_directory(target)
    os.close(fd)
    return p


def canonical_hash(payload: dict) -> str:
    try:
        raw = json.dumps(
            payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
        ).encode("utf-8")
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
        parent_fd = open_private_directory(path.parent)
        try:
            # Validate pre-existing SQLite sidecars as well as the receipt file;
            # no chmod/chown/unlink repair can discard durable no-replay state.
            for name in (path.name, path.name + "-wal", path.name + "-shm", path.name + "-journal"):
                flags = os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK
                if name == path.name:
                    flags |= os.O_CREAT
                try:
                    fd = os.open(name, flags, 0o600, dir_fd=parent_fd)
                except FileNotFoundError:
                    if name != path.name:
                        continue
                    raise
                try:
                    info = os.fstat(fd)
                    named = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
                    if (
                        not stat.S_ISREG(info.st_mode)
                        or info.st_uid != os.geteuid()
                        or info.st_mode & 0o077
                        or info.st_nlink != 1
                        or (info.st_dev, info.st_ino) != (named.st_dev, named.st_ino)
                    ):
                        raise ComputerProvisioningError("storage_not_private")
                finally:
                    os.close(fd)
        except OSError as exc:
            raise ComputerProvisioningError("storage_unavailable") from exc
        finally:
            os.close(parent_fd)
        self.dir_fd = open_private_directory(self.evidence_path)
        try:
            self.db = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
        except BaseException:
            os.close(self.dir_fd)
            raise
        try:
            self._initialize_database()
        except BaseException:
            try:
                self.db.close()
            finally:
                os.close(self.dir_fd)
            raise

    def _initialize_database(self) -> None:
        """Initialize only while the constructor owns failure cleanup."""
        self.db.row_factory = sqlite3.Row
        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        if type(version) is not int or not 0 <= version <= STORE_SCHEMA_VERSION:
            raise ComputerProvisioningError("storage_schema_unsupported")
        if version == STORE_SCHEMA_VERSION:
            with self.lock:
                self.db.execute("BEGIN IMMEDIATE")
                try:
                    self._validate_current_schema(allow_obsolete_restrictions=True)
                    self.db.execute("DROP TABLE IF EXISTS restrictions")
                    self._validate_current_schema()
                    self.db.execute("COMMIT")
                except BaseException:
                    self.db.execute("ROLLBACK")
                    raise
            self.db.execute("PRAGMA journal_mode=WAL")
            self.db.execute("PRAGMA synchronous=FULL")
            return
        tables = {
            row[0]
            for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if tables:
            self._validate_base_schema()
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                if not tables:
                    self._create_base_schema()
                # Upgrade development stores without recreating sessions or their evidence.
                columns = {row[1] for row in self.db.execute("PRAGMA table_info(sessions)")}
                for name, definition in (
                    ("consent_generation", "INTEGER NOT NULL DEFAULT 1"),
                    ("platform", "TEXT NOT NULL DEFAULT 'x11'"),
                    ("environment", "TEXT NOT NULL DEFAULT 'isolated'"),
                ):
                    if name not in columns:
                        self.db.execute(f"ALTER TABLE sessions ADD COLUMN {name} {definition}")
                self.db.execute("DROP TABLE IF EXISTS restrictions")
                self._migrate_schema()
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def _create_base_schema(self) -> None:
        """Create the historic generic schema only for an empty database."""
        for statement in (
            # These are SQLite DDL literals, deliberately not reformatted.  # noqa: E501
            "CREATE TABLE sessions (session_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, channel_id TEXT NOT NULL, turn_id TEXT NOT NULL, host_id TEXT NOT NULL, generation INTEGER NOT NULL, state TEXT NOT NULL, app TEXT NOT NULL, created_at REAL NOT NULL, expires_at REAL NOT NULL, actions INTEGER NOT NULL DEFAULT 0)",  # noqa: E501
            "CREATE UNIQUE INDEX single_active_computer ON sessions ((1)) WHERE state IN ('starting','active','paused','quarantined')",  # noqa: E501
            "CREATE TABLE receipts (session_id TEXT NOT NULL, action_id TEXT NOT NULL, payload_hash TEXT NOT NULL, status TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(session_id,action_id))",  # noqa: E501
            "CREATE TABLE session_cleanup (session_id TEXT PRIMARY KEY, result TEXT NOT NULL)",
            "CREATE TABLE session_runtime (session_id TEXT PRIMARY KEY, descriptor TEXT NOT NULL)",
            "CREATE TABLE session_recovery (session_id TEXT PRIMARY KEY, result TEXT NOT NULL)",
            "CREATE TABLE evidence (evidence_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, digest TEXT NOT NULL, device INTEGER NOT NULL, inode INTEGER NOT NULL, expires_at REAL NOT NULL)",  # noqa: E501
        ):
            self.db.execute(statement)

    @staticmethod
    def _required_columns() -> dict[str, set[str]]:
        return {
            "sessions": {
                "session_id", "owner_id", "channel_id", "turn_id", "host_id", "generation",
                "state", "app", "created_at", "expires_at", "actions", "consent_generation",
                "platform", "environment",
            },
            "receipts": {"session_id", "action_id", "payload_hash", "status", "result"},
            "session_cleanup": {"session_id", "result"},
            "session_runtime": {"session_id", "descriptor"},
            "session_recovery": {"session_id", "result"},
            "evidence": {
                "evidence_id", "session_id", "name", "kind", "size", "digest", "device",
                "inode", "expires_at",
            },
        }

    def _validate_base_schema(self) -> None:
        required = self._required_columns()
        required["sessions"] -= {"consent_generation", "platform", "environment"}
        self._validate_tables(required, allow_session_upgrade_columns=True)
        found_tables = {
            row[0]
            for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        permitted_tables = {frozenset(required), frozenset(set(required) | {"restrictions"})}
        if frozenset(found_tables) not in permitted_tables:
            raise ComputerProvisioningError("storage_schema_unsupported")
        if "restrictions" in found_tables:
            restrictions_shape = tuple(
                (row[1], row[2], row[3], row[4], row[5])
                for row in self.db.execute("PRAGMA table_info(restrictions)")
            )
            if restrictions_shape != (
                ("owner_id", "TEXT", 1, None, 1),
                ("channel_id", "TEXT", 1, None, 2),
                ("turn_id", "TEXT", 1, None, 0),
                ("created_at", "REAL", 1, None, 0),
            ):
                raise ComputerProvisioningError("storage_schema_unsupported")
        if self.db.execute(
            "SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') LIMIT 1"
        ).fetchone():
            raise ComputerProvisioningError("storage_schema_unsupported")

        indexes = {
            row[1]: (
                row[2],
                row[4],
                tuple(
                    (detail[1], detail[2], detail[3], detail[4], detail[5])
                    for detail in self.db.execute(f"PRAGMA index_xinfo({row[1]})")
                ),
            )
            for table in required
            for row in self.db.execute(f"PRAGMA index_list({table})")
            if not row[1].startswith("sqlite_autoindex_")
        }
        expected_index = (
            1,
            1,
            ((-2, None, 0, "BINARY", 1), (-1, None, 0, "BINARY", 0)),
        )
        index_sql = self.db.execute(
            "SELECT sql FROM sqlite_master WHERE type='index' AND name='single_active_computer'"
        ).fetchone()
        normalized_index_sql = " ".join(index_sql[0].split()) if index_sql and index_sql[0] else ""
        expected_index_sql = (
            "CREATE UNIQUE INDEX single_active_computer ON sessions ((1)) "
            "WHERE state IN ('starting','active','paused','quarantined')"
        )
        if (
            indexes != {"single_active_computer": expected_index}
            or normalized_index_sql != expected_index_sql
        ):
            raise ComputerProvisioningError("storage_schema_unsupported")

    @staticmethod
    def _historic_schema_shapes() -> dict[str, tuple[tuple[str, str, int, str | None, int], ...]]:
        """Exact schemas emitted before the first versioned computer-store migration."""
        return {
            "sessions": (
                ("session_id", "TEXT", 0, None, 1),
                ("owner_id", "TEXT", 1, None, 0),
                ("channel_id", "TEXT", 1, None, 0),
                ("turn_id", "TEXT", 1, None, 0),
                ("host_id", "TEXT", 1, None, 0),
                ("generation", "INTEGER", 1, None, 0),
                ("state", "TEXT", 1, None, 0),
                ("app", "TEXT", 1, None, 0),
                ("created_at", "REAL", 1, None, 0),
                ("expires_at", "REAL", 1, None, 0),
                ("actions", "INTEGER", 1, "0", 0),
            ),
            "receipts": (
                ("session_id", "TEXT", 1, None, 1),
                ("action_id", "TEXT", 1, None, 2),
                ("payload_hash", "TEXT", 1, None, 0),
                ("status", "TEXT", 1, None, 0),
                ("result", "TEXT", 1, None, 0),
            ),
            "session_cleanup": (
                ("session_id", "TEXT", 0, None, 1),
                ("result", "TEXT", 1, None, 0),
            ),
            "session_runtime": (
                ("session_id", "TEXT", 0, None, 1),
                ("descriptor", "TEXT", 1, None, 0),
            ),
            "session_recovery": (
                ("session_id", "TEXT", 0, None, 1),
                ("result", "TEXT", 1, None, 0),
            ),
            "evidence": (
                ("evidence_id", "TEXT", 0, None, 1),
                ("session_id", "TEXT", 1, None, 0),
                ("name", "TEXT", 1, None, 0),
                ("kind", "TEXT", 1, None, 0),
                ("size", "INTEGER", 1, None, 0),
                ("digest", "TEXT", 1, None, 0),
                ("device", "INTEGER", 1, None, 0),
                ("inode", "INTEGER", 1, None, 0),
                ("expires_at", "REAL", 1, None, 0),
            ),
            "session_backends": (
                ("session_id", "TEXT", 0, None, 1),
                ("backend", "TEXT", 1, None, 0),
            ),
            "session_output_grants": (
                ("grant_id", "INTEGER", 0, None, 1),
                ("session_id", "TEXT", 1, None, 0),
                ("generation", "INTEGER", 1, None, 0),
                ("consent_generation", "INTEGER", 1, None, 0),
                ("output_name", "TEXT", 1, None, 0),
                ("source_id", "TEXT", 1, None, 0),
                ("application_identity", "TEXT", 1, None, 0),
                ("created_at", "REAL", 1, None, 0),
                ("parent_grant_id", "INTEGER", 0, None, 0),
            ),
            "recovery_pending": (
                ("session_id", "TEXT", 0, None, 1),
                ("recovery_generation", "INTEGER", 1, None, 0),
                ("grant_generation", "INTEGER", 1, None, 0),
                ("stop_epoch", "INTEGER", 1, None, 0),
                ("phase", "TEXT", 1, None, 0),
                ("reason", "TEXT", 1, None, 0),
                ("attempt", "INTEGER", 1, None, 0),
                ("next_retry_at", "REAL", 0, None, 0),
                ("old_grant", "TEXT", 1, None, 0),
                ("candidate_epoch", "TEXT", 0, None, 0),
            ),
        }

    def _validate_tables(
        self,
        required: dict[str, set[str]],
        *,
        allow_session_upgrade_columns: bool = False,
    ) -> None:
        historic = self._historic_schema_shapes()
        upgrade_columns = {
            "consent_generation": ("consent_generation", "INTEGER", 1, "1", 0),
            "platform": ("platform", "TEXT", 1, "'x11'", 0),
            "environment": ("environment", "TEXT", 1, "'isolated'", 0),
        }
        for table, columns in required.items():
            rows = self.db.execute(f"PRAGMA table_info({table})").fetchall()
            shape = tuple((row[1], row[2], row[3], row[4], row[5]) for row in rows)
            expected = historic.get(table)
            if table == "sessions" and expected is not None:
                upgraded = expected + tuple(upgrade_columns.values())
                if allow_session_upgrade_columns:
                    if shape not in {expected, upgraded}:
                        raise ComputerProvisioningError("storage_schema_unsupported")
                    expected = shape
                else:
                    expected = upgraded
            if expected is not None and shape != expected:
                raise ComputerProvisioningError("storage_schema_unsupported")
            found = {row[1] for row in rows}
            if not columns <= found:
                raise ComputerProvisioningError("storage_schema_unsupported")

    def _validate_current_schema(self, *, allow_obsolete_restrictions: bool = False) -> None:
        """Refuse partial current schemas rather than repairing durable state."""
        required = self._required_columns()
        required.update({
            "session_backends": {"session_id", "backend"},
            "session_output_grants": {
                "grant_id",
                "session_id",
                "generation",
                "consent_generation",
                "output_name",
                "source_id",
                "application_identity",
                "created_at",
                "parent_grant_id",
            },
            "recovery_pending": {
                "session_id",
                "recovery_generation",
                "grant_generation",
                "stop_epoch",
                "phase",
                "reason",
                "attempt",
                "next_retry_at",
                "old_grant",
                "candidate_epoch",
            },
        })
        self._validate_tables(required)
        expected_tables = set(required)
        found_tables = {
            row[0]
            for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        permitted_tables = {frozenset(expected_tables)}
        if allow_obsolete_restrictions:
            permitted_tables.add(frozenset(expected_tables | {"restrictions"}))
        if frozenset(found_tables) not in permitted_tables:
            raise ComputerProvisioningError("storage_schema_unsupported")
        if "restrictions" in found_tables:
            restrictions_shape = tuple(
                (row[1], row[2], row[3], row[4], row[5])
                for row in self.db.execute("PRAGMA table_info(restrictions)")
            )
            if restrictions_shape != (
                ("owner_id", "TEXT", 1, None, 1),
                ("channel_id", "TEXT", 1, None, 2),
                ("turn_id", "TEXT", 1, None, 0),
                ("created_at", "REAL", 1, None, 0),
            ):
                raise ComputerProvisioningError("storage_schema_unsupported")
        if self.db.execute(
            "SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') LIMIT 1"
        ).fetchone():
            raise ComputerProvisioningError("storage_schema_unsupported")
        indexes = {
            row[1]: (
                row[2],
                row[4],
                tuple(
                    index_row[2]
                    for index_row in self.db.execute(f"PRAGMA index_info({row[1]})")
                ),
            )
            for table in required
            for row in self.db.execute(f"PRAGMA index_list({table})")
            if not row[1].startswith("sqlite_autoindex_")
        }
        expected_indexes = {
            "single_active_computer": (1, 1, (None,)),
            "session_output_grants_lineage": (
                1,
                0,
                ("session_id", "generation", "consent_generation"),
            ),
            "session_output_grants_session": (0, 0, ("session_id", "grant_id")),
        }
        index_sql = {
            row[0]: " ".join(row[1].split())
            for row in self.db.execute(
                "SELECT name,sql FROM sqlite_master WHERE type='index' "
                "AND name NOT LIKE 'sqlite_autoindex_%'"
            )
        }
        expected_index_sql = {
            "single_active_computer": (
                "CREATE UNIQUE INDEX single_active_computer ON sessions ((1)) "
                "WHERE state IN ('starting','active','paused','quarantined')"
            ),
            "session_output_grants_lineage": (
                "CREATE UNIQUE INDEX session_output_grants_lineage ON "
                "session_output_grants(session_id, generation, consent_generation)"
            ),
            "session_output_grants_session": (
                "CREATE INDEX session_output_grants_session ON "
                "session_output_grants(session_id, grant_id DESC)"
            ),
        }
        if indexes != expected_indexes or index_sql != expected_index_sql:
            raise ComputerProvisioningError("storage_schema_unsupported")
        expected_foreign_keys = {
            "session_backends": {
                ("sessions", "session_id", "session_id", "NO ACTION", "NO ACTION", "NONE")
            },
            "session_output_grants": {
                (
                    "sessions", "session_id", "session_id", "NO ACTION", "NO ACTION", "NONE"
                ),
                (
                    "session_output_grants",
                    "parent_grant_id",
                    "grant_id",
                    "NO ACTION",
                    "NO ACTION",
                    "NONE",
                ),
            },
            "recovery_pending": {
                ("sessions", "session_id", "session_id", "NO ACTION", "NO ACTION", "NONE")
            },
        }
        for table, expected in expected_foreign_keys.items():
            found = {
                (row[2], row[3], row[4], row[5], row[6], row[7])
                for row in self.db.execute(f"PRAGMA foreign_key_list({table})")
            }
            if found != expected:
                raise ComputerProvisioningError("storage_schema_unsupported")
        if self.db.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise ComputerProvisioningError("storage_schema_unsupported")
        for row in self.db.execute("SELECT * FROM recovery_pending"):
            try:
                pending = self._recovery_pending_row(row)
                session = self.db.execute(
                    "SELECT generation,consent_generation,state,platform,environment "
                    "FROM sessions WHERE session_id=?",
                    (pending.session_id,),
                ).fetchone()
                if session is None:
                    raise ComputerError("invalid_recovery_pending")
                if pending.phase in {
                    "hyprland_handoff_pending", "native_continuity_lost", "unknown_release"
                }:
                    backend = self.db.execute(
                        "SELECT backend FROM session_backends WHERE session_id=?",
                        (pending.session_id,),
                    ).fetchone()
                    if (
                        session["platform"] != "wayland"
                        or session["environment"] != "existing_session"
                        or backend is None
                        or backend["backend"] != "hyprland"
                    ):
                        raise ComputerError("invalid_recovery_pending")
                if pending.phase == "hyprland_handoff_pending":
                    valid = (
                        session["state"] == "paused"
                        and pending.recovery_generation == session["generation"]
                        and pending.grant_generation == session["generation"]
                    )
                elif pending.phase in {"native_continuity_lost", "unknown_release"}:
                    fenced_generation = cast(int, pending.old_grant["generation"]) + 1
                    fenced_consent_generation = (
                        cast(int, pending.old_grant["consent_generation"]) + 1
                    )
                    lineage_advance = session["generation"] - fenced_generation
                    resolution_row = self.db.execute(
                        "SELECT result FROM session_recovery WHERE session_id=?",
                        (pending.session_id,),
                    ).fetchone()
                    try:
                        resolution = json.loads(resolution_row[0]) if resolution_row else None
                    except (TypeError, ValueError):
                        resolution = None
                    resolved = (
                        type(resolution) is dict
                        and (
                            resolution.get("status") == "absence_verified"
                            and resolution.get("complete") is True
                            or resolution.get("status") == "operator_acknowledged_unverified"
                            and resolution.get("complete") is False
                        )
                    )
                    valid = (
                        (
                            session["state"] == "quarantined"
                            or session["state"] == "closed" and resolved
                        )
                        and pending.recovery_generation == fenced_generation
                        and pending.grant_generation == fenced_generation
                        and lineage_advance >= 0
                        and session["consent_generation"] - fenced_consent_generation
                        == lineage_advance
                    )
                else:
                    valid = (
                        session["state"] in {"starting", "active"}
                        and pending.grant_generation == session["generation"]
                        and pending.recovery_generation >= session["generation"]
                    )
                if not valid:
                    raise ComputerError("invalid_recovery_pending")
            except ComputerError as exc:
                raise ComputerProvisioningError("storage_schema_unsupported") from exc

    def _migrate_schema(self) -> None:
        """Install the one shipped additive schema over the prior unversioned store."""
        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        if version != 0:
            raise ComputerProvisioningError("storage_schema_unsupported")
        else:
            self.db.execute("""
                CREATE TABLE session_output_grants (
                    grant_id INTEGER PRIMARY KEY, session_id TEXT NOT NULL,
                    generation INTEGER NOT NULL, consent_generation INTEGER NOT NULL,
                    output_name TEXT NOT NULL, source_id TEXT NOT NULL,
                    application_identity TEXT NOT NULL,
                    created_at REAL NOT NULL, parent_grant_id INTEGER,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id),
                    FOREIGN KEY(parent_grant_id) REFERENCES session_output_grants(grant_id))
                """)
            self.db.execute(
            "CREATE UNIQUE INDEX session_output_grants_lineage ON "
            "session_output_grants(session_id, generation, consent_generation)"
            )
            self.db.execute(
            "CREATE INDEX session_output_grants_session ON "
            "session_output_grants(session_id, grant_id DESC)"
            )
            self.db.execute("""
                CREATE TABLE recovery_pending (
                    session_id TEXT PRIMARY KEY, recovery_generation INTEGER NOT NULL,
                    grant_generation INTEGER NOT NULL, stop_epoch INTEGER NOT NULL,
                    phase TEXT NOT NULL, reason TEXT NOT NULL, attempt INTEGER NOT NULL,
                    next_retry_at REAL, old_grant TEXT NOT NULL, candidate_epoch TEXT,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id))
                """)
            self.db.execute("""
                CREATE TABLE session_backends (
                    session_id TEXT PRIMARY KEY, backend TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id))
                """)
        self.db.execute(f"PRAGMA user_version={STORE_SCHEMA_VERSION}")
        self._validate_current_schema()

    @staticmethod
    def _output_grant_values(
        output_name: str, source_id: str, application_identity: dict
    ) -> tuple[str, str, str]:
        keys = ("pid", "uid", "start_ticks", "exe", "exe_identity")
        if (
            type(output_name) is not str
            or not 1 <= len(output_name) <= 256
            or output_name != output_name.strip()
        ):
            raise ComputerError("invalid_hyprland_output_grant")
        if type(source_id) is not str or not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", source_id):
            raise ComputerError("invalid_hyprland_output_grant")
        if (
            type(application_identity) is not dict
            or set(application_identity) != set(keys)
            or any(type(application_identity.get(key)) is not int for key in keys[:3])
            or application_identity["pid"] <= 1
            or application_identity["uid"] < 0
            or application_identity["start_ticks"] <= 0
            or type(application_identity.get("exe")) is not str
            or not application_identity["exe"].startswith("/")
            or type(application_identity.get("exe_identity")) is not list
            or len(application_identity["exe_identity"]) != 2
            or any(
                type(value) is not int or value < 0
                for value in application_identity["exe_identity"]
            )
        ):
            raise ComputerError("invalid_hyprland_application_identity")
        return output_name, source_id, json.dumps(
            {key: application_identity[key] for key in keys},
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )

    @staticmethod
    def _output_grant_row(row: sqlite3.Row) -> HyprlandOutputGrant:
        return HyprlandOutputGrant(
            row["grant_id"],
            row["session_id"],
            row["generation"],
            row["consent_generation"],
            row["output_name"],
            row["source_id"],
            json.loads(row["application_identity"]),
            row["created_at"],
            row["parent_grant_id"],
        )

    @staticmethod
    def _recovery_pending_row(row: sqlite3.Row) -> RecoveryPending:
        try:
            old_grant = json.loads(row["old_grant"])
        except (TypeError, ValueError) as exc:
            raise ComputerError("invalid_recovery_pending") from exc
        phase = row["phase"]
        reason = row["reason"]
        integer_values = (
            row["recovery_generation"],
            row["grant_generation"],
            row["stop_epoch"],
            row["attempt"],
        )
        next_retry = row["next_retry_at"]
        candidate = row["candidate_epoch"]
        scalars_valid = (
            type(row["session_id"]) is str
            and bool(row["session_id"])
            and all(type(value) is int for value in integer_values)
            and row["recovery_generation"] >= 1
            and row["grant_generation"] >= 1
            and row["stop_epoch"] >= 0
            and row["attempt"] >= 0
            and (
                next_retry is None
                or type(next_retry) in {int, float}
                and math.isfinite(next_retry)
            )
            and (candidate is None or type(candidate) is str and bool(candidate))
        )
        if phase in {"native_continuity_lost", "unknown_release"}:
            valid = (
                reason == phase
                and ComputerStore._reconciliation_snapshot_valid(old_grant)
                and row["stop_epoch"] >= 1
                and row["attempt"] == 0
                and next_retry is None
                and candidate is None
            )
        elif phase == "hyprland_handoff_pending":
            valid = (
                reason == "no_input_stale_output"
                and type(old_grant) is dict
                and set(old_grant)
                == {
                    "grant_id",
                    "generation",
                    "consent_generation",
                    "output_name",
                    "source_id",
                    "application_identity",
                }
                and type(old_grant.get("grant_id")) is int
                and old_grant["grant_id"] >= 1
                and type(old_grant.get("generation")) is int
                and old_grant["generation"] >= 1
                and type(old_grant.get("consent_generation")) is int
                and old_grant["consent_generation"] >= 1
                and row["attempt"] >= 1
                and next_retry is None
                and candidate is None
            )
        elif phase in {"probe", "retry"}:
            valid = (
                reason == "lost"
                and type(old_grant) is dict
                and set(old_grant) == {"id"}
                and type(old_grant.get("id")) is int
                and old_grant["id"] >= 1
                and ((phase == "probe" and row["attempt"] == 0) or row["attempt"] >= 1)
            )
        else:
            valid = False
        if not scalars_valid or not valid:
            raise ComputerError("invalid_recovery_pending")
        return RecoveryPending(
            row["session_id"],
            row["recovery_generation"],
            row["grant_generation"],
            row["stop_epoch"],
            phase,
            reason,
            row["attempt"],
            row["next_retry_at"],
            old_grant,
            row["candidate_epoch"],
        )

    @staticmethod
    def _reconciliation_snapshot_valid(snapshot: object) -> bool:
        if (
            type(snapshot) is not dict
            or set(snapshot)
            != {"generation", "consent_generation", "task_hints", "authorizes_input"}
            or type(snapshot.get("generation")) is not int
            or snapshot["generation"] < 1
            or type(snapshot.get("consent_generation")) is not int
            or snapshot["consent_generation"] < 1
            or type(snapshot.get("task_hints")) is not dict
            or snapshot.get("authorizes_input") is not False
        ):
            return False
        hints = snapshot["task_hints"]
        return not set(hints) - {"goal", "tool", "color", "brush"} and not any(
            type(value) is not str
            or not 1 <= len(value) <= 160
            or any(
                ord(character) < 32 or 0xD800 <= ord(character) <= 0xDFFF
                for character in value
            )
            for value in hints.values()
        )

    def record_hyprland_output_grant(
        self, grant: SessionGrant, *, output_name: str, source_id: str, application_identity: dict
    ) -> HyprlandOutputGrant:
        """Persist one verified Wayland output binding, never live input authority."""
        output_name, source_id, identity = self._output_grant_values(
            output_name, source_id, application_identity
        )
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                current = self.db.execute(
                    "SELECT 1 FROM sessions WHERE session_id=? AND generation=? "
                    "AND consent_generation=? AND state IN ('starting','active') "
                    "AND platform='wayland' AND environment='existing_session' "
                    "AND EXISTS (SELECT 1 FROM session_backends "
                    "WHERE session_id=sessions.session_id "
                    "AND backend='hyprland')",
                    (grant.session_id, grant.generation, grant.consent_generation),
                ).fetchone()
                if current is None:
                    raise ComputerError("grant_revoked")
                cursor = self.db.execute(
                    "INSERT INTO session_output_grants "
                    "(session_id,generation,consent_generation,output_name,source_id,"
                    "application_identity,created_at) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (
                        grant.session_id,
                        grant.generation,
                        grant.consent_generation,
                        output_name,
                        source_id,
                        identity,
                        self.clock(),
                    ),
                )
                row = self.db.execute(
                    "SELECT * FROM session_output_grants WHERE grant_id=?", (cursor.lastrowid,)
                ).fetchone()
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return self._output_grant_row(row)

    def hyprland_output_grants(
        self, session_id: str, *, limit: int = 16
    ) -> tuple[HyprlandOutputGrant, ...]:
        if type(limit) is not int or not 1 <= limit <= 64:
            raise ComputerError("invalid_limit")
        with self.lock:
            rows = self.db.execute(
                "SELECT * FROM session_output_grants WHERE session_id=? "
                "ORDER BY grant_id DESC LIMIT ?",
                (session_id, limit),
            ).fetchall()
        return tuple(self._output_grant_row(row) for row in rows)

    def advance_hyprland_output_grant(
        self,
        paused_grant: SessionGrant,
        *,
        old_grant_id: int,
        output_name: str,
        source_id: str,
        application_identity: dict,
    ) -> HyprlandOutputGrant:
        """Record the one successor for a durably fenced Hyprland handoff."""
        output_name, source_id, identity = self._output_grant_values(
            output_name, source_id, application_identity
        )
        if type(old_grant_id) is not int or old_grant_id <= 0:
            raise ComputerError("invalid_hyprland_output_grant")
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                current = self.db.execute(
                    "SELECT * FROM sessions WHERE session_id=?", (paused_grant.session_id,)
                ).fetchone()
                valid = (
                    current is not None
                    and current["state"] == "paused"
                    and current["generation"] == paused_grant.generation
                    and current["consent_generation"] == paused_grant.consent_generation
                    and current["platform"] == "wayland"
                    and current["environment"] == "existing_session"
                    and self.db.execute(
                        "SELECT 1 FROM session_backends WHERE session_id=? AND backend='hyprland'",
                        (paused_grant.session_id,),
                    ).fetchone()
                    is not None
                )
                handoff = self.db.execute(
                    "SELECT * FROM recovery_pending WHERE session_id=? "
                    "AND recovery_generation=? AND grant_generation=?",
                    (paused_grant.session_id, paused_grant.generation, paused_grant.generation),
                ).fetchone()
                pending = self.db.execute(
                    "SELECT 1 FROM receipts WHERE session_id=? AND status='pending' LIMIT 1",
                    (paused_grant.session_id,),
                ).fetchone()
                cleanup = self.cleanup(paused_grant.session_id)
                expected = {
                    "complete": True,
                    "stopped": True,
                    "released": True,
                    "applications_preserved": True,
                    "input_revoked": True,
                    "capture_revoked": True,
                    "owned_devices": "hyprland_owned_connections_closed",
                    "hyprland_owned_connections_closed": True,
                    "receiver_release_verified": False,
                }
                if not valid:
                    raise ComputerError("grant_revoked")
                if handoff is None or handoff["phase"] != "hyprland_handoff_pending":
                    raise ComputerError("hyprland_handoff_not_safe")
                try:
                    old_lineage = json.loads(handoff["old_grant"])
                except (TypeError, ValueError) as exc:
                    raise ComputerError("hyprland_handoff_not_safe") from exc
                if old_lineage.get("grant_id") != old_grant_id:
                    raise ComputerError("hyprland_handoff_not_safe")
                old = self.db.execute(
                    "SELECT 1 FROM session_output_grants WHERE grant_id=? AND session_id=? "
                    "AND generation=? AND consent_generation=? AND source_id=?",
                    (old_grant_id, paused_grant.session_id, old_lineage.get("generation"),
                     old_lineage.get("consent_generation"), old_lineage.get("source_id")),
                ).fetchone()
                if (
                    old is None
                    or pending is not None
                    or cleanup is None
                    or any(cleanup.get(key) != value for key, value in expected.items())
                ):
                    raise ComputerError("hyprland_handoff_not_safe")
                cursor = self.db.execute(
                    "INSERT INTO session_output_grants (session_id,generation,consent_generation,"
                    "output_name,source_id,application_identity,created_at,parent_grant_id) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (
                        paused_grant.session_id,
                        paused_grant.generation,
                        paused_grant.consent_generation,
                        output_name,
                        source_id,
                        identity,
                        self.clock(),
                        old_grant_id,
                    ),
                )
                row = self.db.execute(
                    "SELECT * FROM session_output_grants WHERE grant_id=?", (cursor.lastrowid,)
                ).fetchone()
                changed = self.db.execute(
                    "DELETE FROM recovery_pending WHERE session_id=? AND recovery_generation=? "
                    "AND grant_generation=? AND stop_epoch=? AND phase='hyprland_handoff_pending'",
                    (paused_grant.session_id, paused_grant.generation, paused_grant.generation,
                     handoff["stop_epoch"]),
                ).rowcount
                if not changed:
                    raise ComputerError("hyprland_handoff_not_safe")
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return self._output_grant_row(row)

    def begin_hyprland_handoff(
        self, grant: SessionGrant, *, old_grant_id: int, recovery_generation: int, stop_epoch: int
    ) -> SessionGrant:
        """Atomically obsolete an active native binding before backend cleanup."""
        if (
            type(old_grant_id) is not int or old_grant_id <= 0
            or type(recovery_generation) is not int or recovery_generation < 1
            or type(stop_epoch) is not int or stop_epoch < 0
        ):
            raise ComputerError("invalid_hyprland_output_grant")
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                current = self.db.execute(
                    "SELECT * FROM sessions WHERE session_id=?", (grant.session_id,)
                ).fetchone()
                old = self.db.execute(
                    "SELECT * FROM session_output_grants WHERE grant_id=? AND session_id=? "
                    "AND grant_id=(SELECT MAX(grant_id) FROM session_output_grants "
                    "WHERE session_id=?)",
                    (old_grant_id, grant.session_id, grant.session_id),
                ).fetchone()
                backend = self.db.execute(
                    "SELECT 1 FROM session_backends WHERE session_id=? AND backend='hyprland'",
                    (grant.session_id,),
                ).fetchone()
                pending = self.db.execute(
                    "SELECT 1 FROM recovery_pending WHERE session_id=?", (grant.session_id,)
                ).fetchone()
                if (
                    current is None or current["state"] not in {"starting", "active"}
                    or current["generation"] != grant.generation
                    or current["consent_generation"] != grant.consent_generation
                    or current["platform"] != "wayland"
                    or current["environment"] != "existing_session"
                    or old is None
                    or backend is None
                    or pending is not None or old["generation"] != grant.generation
                    or old["consent_generation"] != grant.consent_generation
                ):
                    raise ComputerError("hyprland_handoff_not_safe")
                lineage = {
                    "grant_id": old["grant_id"], "generation": old["generation"],
                    "consent_generation": old["consent_generation"],
                    "output_name": old["output_name"],
                    "source_id": old["source_id"],
                    "application_identity": json.loads(old["application_identity"]),
                }
                paused_generation = grant.generation + 1
                paused_consent = grant.consent_generation + 1
                self.db.execute(
                    "INSERT INTO recovery_pending VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (grant.session_id, paused_generation, paused_generation, stop_epoch,
                     "hyprland_handoff_pending", "no_input_stale_output", recovery_generation,
                     None, json.dumps(lineage, sort_keys=True, separators=(",", ":")), None),
                )
                changed = self.db.execute(
                    "UPDATE sessions SET state='paused',generation=?,consent_generation=? "
                    "WHERE session_id=? AND state IN ('starting','active') AND generation=? "
                    "AND consent_generation=?",
                    (paused_generation, paused_consent, grant.session_id, grant.generation,
                     grant.consent_generation),
                ).rowcount
                if not changed:
                    raise ComputerError("grant_revoked")
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return self.get_session(grant.session_id)

    def set_recovery_pending(
        self,
        grant: SessionGrant,
        *,
        recovery_generation: int,
        stop_epoch: int,
        phase: str,
        reason: str,
        attempt: int,
        next_retry_at: float | None,
        old_grant: dict,
        candidate_epoch: str | None = None,
    ) -> RecoveryPending:
        if (
            type(recovery_generation) is not int
            or recovery_generation < 1
            or type(stop_epoch) is not int
            or stop_epoch < 0
            or type(phase) is not str
            or not phase
            or type(reason) is not str
            or not reason
            or type(attempt) is not int
            or attempt < 0
            or (next_retry_at is not None and type(next_retry_at) not in {int, float})
            or (
                candidate_epoch is not None
                and (type(candidate_epoch) is not str or not candidate_epoch)
            )
        ):
            raise ComputerError("invalid_recovery_pending")
        try:
            old = json.dumps(old_grant, sort_keys=True, separators=(",", ":"), allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise ComputerError("invalid_recovery_pending") from exc
        if type(old_grant) is not dict or not old_grant or len(old.encode()) > 16384:
            raise ComputerError("invalid_recovery_pending")
        candidate = {
            "session_id": grant.session_id,
            "recovery_generation": recovery_generation,
            "grant_generation": grant.generation,
            "stop_epoch": stop_epoch,
            "phase": phase,
            "reason": reason,
            "attempt": attempt,
            "next_retry_at": next_retry_at,
            "old_grant": old,
            "candidate_epoch": candidate_epoch,
        }
        # Validate the exact durable representation before opening a transaction.
        # A typed API error after INSERT OR REPLACE would otherwise commit poison.
        self._recovery_pending_row(cast(sqlite3.Row, candidate))
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                current = self.db.execute(
                    "SELECT * FROM sessions WHERE session_id=?", (grant.session_id,)
                ).fetchone()
                if (
                    current is None
                    or current["generation"] != grant.generation
                    or current["consent_generation"] != grant.consent_generation
                    or current["state"] not in {"starting", "active"}
                    or self.db.execute(
                        "SELECT 1 FROM session_backends WHERE session_id=? AND backend='hyprland'",
                        (grant.session_id,),
                    ).fetchone()
                    is None
                ):
                    raise ComputerError("grant_revoked")
                existing = self.db.execute(
                    "SELECT recovery_generation, stop_epoch FROM recovery_pending "
                    "WHERE session_id=?",
                    (grant.session_id,),
                ).fetchone()
                if existing is not None and (
                    recovery_generation <= existing["recovery_generation"]
                    or stop_epoch <= existing["stop_epoch"]
                ):
                    raise ComputerError("stale_recovery_pending")
                self.db.execute(
                    "INSERT OR REPLACE INTO recovery_pending VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (
                        grant.session_id,
                        recovery_generation,
                        grant.generation,
                        stop_epoch,
                        phase,
                        reason,
                        attempt,
                        next_retry_at,
                        old,
                        candidate_epoch,
                    ),
                )
                row = self.db.execute(
                    "SELECT * FROM recovery_pending WHERE session_id=?", (grant.session_id,)
                ).fetchone()
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return self._recovery_pending_row(row)

    def begin_hyprland_reconciliation(
        self,
        grant: SessionGrant,
        *,
        phase: str,
        reason: str,
        old_grant: dict,
    ) -> SessionGrant:
        """Atomically fence native uncertainty and retain its bounded recovery state."""
        if phase not in {"native_continuity_lost", "unknown_release"} or reason != phase:
            raise ComputerError("invalid_recovery_pending")
        if (
            not self._reconciliation_snapshot_valid(old_grant)
            or old_grant.get("generation") != grant.generation
            or old_grant.get("consent_generation") != grant.consent_generation
        ):
            raise ComputerError("invalid_recovery_pending")
        try:
            old = json.dumps(old_grant, sort_keys=True, separators=(",", ":"), allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise ComputerError("invalid_recovery_pending") from exc
        if len(old.encode()) > 16384:
            raise ComputerError("invalid_recovery_pending")
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                current = self.db.execute(
                    "SELECT * FROM sessions WHERE session_id=?", (grant.session_id,)
                ).fetchone()
                backend = self.db.execute(
                    "SELECT 1 FROM session_backends WHERE session_id=? AND backend='hyprland'",
                    (grant.session_id,),
                ).fetchone()
                if (
                    current is None
                    or current["generation"] != grant.generation
                    or current["consent_generation"] != grant.consent_generation
                    or current["state"] not in {"starting", "active", "paused"}
                    or current["platform"] != "wayland"
                    or current["environment"] != "existing_session"
                    or backend is None
                ):
                    raise ComputerError("grant_revoked")
                existing = self.db.execute(
                    "SELECT stop_epoch FROM recovery_pending WHERE session_id=?",
                    (grant.session_id,),
                ).fetchone()
                generation = grant.generation + 1
                stop_epoch = existing["stop_epoch"] + 1 if existing is not None else 1
                self.db.execute(
                    "INSERT OR REPLACE INTO recovery_pending VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (
                        grant.session_id,
                        generation,
                        generation,
                        stop_epoch,
                        phase,
                        reason,
                        0,
                        None,
                        old,
                        None,
                    ),
                )
                changed = self.db.execute(
                    "UPDATE sessions SET state='quarantined',generation=?,consent_generation=? "
                    "WHERE session_id=? AND generation=? AND consent_generation=? "
                    "AND state IN ('starting','active','paused')",
                    (
                        generation,
                        grant.consent_generation + 1,
                        grant.session_id,
                        grant.generation,
                        grant.consent_generation,
                    ),
                ).rowcount
                if not changed:
                    raise ComputerError("grant_revoked")
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return self.get_session(grant.session_id)

    def get_recovery_pending(self, session_id: str) -> RecoveryPending | None:
        with self.lock:
            row = self.db.execute(
                "SELECT * FROM recovery_pending WHERE session_id=?", (session_id,)
            ).fetchone()
        return self._recovery_pending_row(row) if row else None

    def clear_recovery_pending(
        self, session_id: str, *, recovery_generation: int, grant_generation: int, stop_epoch: int
    ) -> bool:
        with self.lock:
            return bool(
                self.db.execute(
                    "DELETE FROM recovery_pending WHERE session_id=? AND recovery_generation=? "
                    "AND grant_generation=? AND stop_epoch=?",
                    (session_id, recovery_generation, grant_generation, stop_epoch),
                ).rowcount
            )

    def transition_recovery_pending(
        self,
        session_id: str,
        *,
        recovery_generation: int,
        grant_generation: int,
        stop_epoch: int,
        phase: str,
        reason: str,
        attempt: int,
        next_retry_at: float | None,
        candidate_epoch: str | None = None,
    ) -> RecoveryPending:
        if (
            type(phase) is not str
            or not phase
            or type(reason) is not str
            or not reason
            or type(attempt) is not int
            or attempt < 0
        ):
            raise ComputerError("invalid_recovery_pending")
        with self.lock:
            cursor = self.db.execute(
                "UPDATE recovery_pending SET phase=?,reason=?,attempt=?,next_retry_at=?,"
                "candidate_epoch=? "
                "WHERE session_id=? AND recovery_generation=? AND grant_generation=? "
                "AND stop_epoch=?",
                (
                    phase,
                    reason,
                    attempt,
                    next_retry_at,
                    candidate_epoch,
                    session_id,
                    recovery_generation,
                    grant_generation,
                    stop_epoch,
                ),
            )
            if not cursor.rowcount:
                raise ComputerError("stale_recovery_pending")
            row = self.db.execute(
                "SELECT * FROM recovery_pending WHERE session_id=?", (session_id,)
            ).fetchone()
        return self._recovery_pending_row(row)

    def recover(self) -> None:
        """Only the singleton controller calls this; read-only consumers must not."""
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                for row in self.db.execute(
                    "SELECT session_id,action_id,result FROM receipts WHERE status='pending'"
                ).fetchall():
                    result = json.loads(row[2])
                    result.update(status="unknown", reason="controller_lost")
                    self.db.execute(
                        "UPDATE receipts SET status='unknown',result=? "
                        "WHERE session_id=? AND action_id=?",
                        (json.dumps(result), row[0], row[1]),
                    )
                self.db.execute(
                    "UPDATE sessions SET state='quarantined', generation=generation+1, "
                    "consent_generation=consent_generation+1 "
                    "WHERE state IN ('active','starting','paused')"
                )
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def create_session(
        self,
        context: RequestContext,
        app: str | None = None,
        *,
        platform="x11",
        environment="isolated",
        backend="",
    ) -> SessionGrant:
        # Preserve the existing NOT NULL schema without making a desktop session
        # an application profile. Old attached rows remain readable on upgrade.
        if environment == "existing_session":
            app = "attached"
        elif not isinstance(app, str) or not 1 <= len(app) <= 96:
            raise ComputerError("isolated_app_required")
        if (
            type(backend) is not str
            or backend not in {"", "hyprland"}
            or (
                backend == "hyprland" and (platform, environment) != ("wayland", "existing_session")
            )
        ):
            raise ComputerError("unsupported_backend_contract")
        now = self.clock()
        values = (
            uuid.uuid4().hex,
            context.owner_id,
            context.channel_id,
            context.turn_id,
            context.host_id,
            1,
            "starting",
            app,
            now,
            now + MAX_TASK_SECONDS,
            0,
            1,
            platform,
            environment,
        )
        try:
            with self.lock:
                self.db.execute("BEGIN IMMEDIATE")
                try:
                    self.db.execute(
                        "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", values
                    )
                    if backend:
                        self.db.execute(
                            "INSERT INTO session_backends VALUES (?,?)", (values[0], backend)
                        )
                    self.db.execute("COMMIT")
                except BaseException:
                    self.db.execute("ROLLBACK")
                    raise
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
            raise ComputerError("invalid_runtime_identity") from exc
        with self.lock:
            current = self.get_session(grant.session_id)
            if current.generation != grant.generation or current.state not in {
                "starting",
                "active",
                "paused",
            }:
                raise ComputerError("grant_revoked")
            previous = self.runtime_descriptor(grant.session_id)
            if previous is not None:
                fixed = set(previous) - {"launch_pending", "processes"}
                if (
                    any(previous[k] != descriptor.get(k) for k in fixed)
                    or descriptor["processes"][: len(previous["processes"])]
                    != previous["processes"]
                ):
                    raise ComputerError("runtime_identity_changed")
            self.db.execute(
                "INSERT OR REPLACE INTO session_runtime VALUES (?,?)", (grant.session_id, encoded)
            )

    def runtime_descriptor(self, session_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute(
                "SELECT descriptor FROM session_runtime WHERE session_id=?", (session_id,)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def recovery_status(self, session_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute(
                "SELECT result FROM session_recovery WHERE session_id=?", (session_id,)
            ).fetchone()
            if row:
                return json.loads(row[0])
            grant = self.get_session(session_id)
            if grant.state != "quarantined":
                return None
            identity = self.runtime_descriptor(session_id)
        return {
            "status": "operator_reconciliation_required"
            if identity
            else "operator_cleanup_required",
            "reason": "controller_lost" if identity else "legacy_runtime_identity_missing",
            "complete": False,
        }

    def finish_recovery(self, grant: SessionGrant, result: dict, *, acknowledged=False):
        """CAS prevents delayed inspection from clearing another runtime generation."""
        clean = result.get("status") == "absence_verified" and not acknowledged
        receipt = {**result, "complete": clean}
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                current = self.get_session(grant.session_id)
                if current.generation != grant.generation or current.state != "quarantined":
                    raise ComputerError("stale_generation")
                self.db.execute(
                    "INSERT OR REPLACE INTO session_recovery VALUES (?,?)",
                    (grant.session_id, json.dumps(receipt, sort_keys=True)),
                )
                if clean or acknowledged:
                    # Attestation retains the original failed cleanup evidence.
                    if clean or self.cleanup(grant.session_id) is None:
                        self.record_cleanup(grant.session_id, {"stopped": clean}, clean=clean)
                    self.set_state(grant.session_id, "closed", revoke=True)
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
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
            row = self.db.execute(
                "SELECT * FROM sessions WHERE owner_id=? AND channel_id=? "
                "AND host_id=? ORDER BY created_at DESC LIMIT 1",
                (context.owner_id, context.channel_id, context.host_id),
            ).fetchone()
        return SessionGrant(**dict(row)) if row else None

    def set_state(
        self, session_id: str, state: str, *, revoke: bool = False, turn_id: str | None = None
    ) -> SessionGrant:
        if state not in {"starting", "active", "paused", "cancelled", "closed", "quarantined"}:
            raise ComputerError("invalid_state")
        with self.lock:
            self.db.execute(
                "UPDATE sessions SET state=?,generation=generation+?,"
                "consent_generation=consent_generation+?,"
                "turn_id=COALESCE(?,turn_id) WHERE session_id=?",
                (state, int(revoke), int(revoke), turn_id, session_id),
            )
        return self.get_session(session_id)

    def record_cleanup(self, session_id: str, result: object, *, clean: bool) -> None:
        """Persist bounded evidence, never arbitrary backend error strings or paths."""
        values = result if type(result) is dict else {}
        receipt = {
            key: (values.get(key) if type(values.get(key)) is bool else None)
            for key in (
                "stopped",
                "released",
                "applications_preserved",
                "input_revoked",
                "capture_revoked",
                "input_was_enabled",
                "portal_session_closed",
                "ei_connection_closed",
                "hyprland_owned_connections_closed",
                "receiver_release_verified",
                "portal_connection_closed",
                "physical_slaves_restored",
                "no_inflight_input",
                "no_active_grabs",
                "owned_masters_removed",
            )
        }
        devices = values.get("owned_devices")
        receipt["owned_devices"] = (
            devices
            if type(devices) is str
            and devices
            in {
                "removed",
                "retained_inactive",
                "not_created",
                "portal_owned_connections_closed",
                "hyprland_owned_connections_closed",
            }
            else "unknown"
        )
        # Only persist documented reason codes, never backend prose or paths.
        reasons = {
            "physical_slaves_restored": ("not_applicable_no_owned_masters", None),
            "no_inflight_input": ("measured_owned_worker_fence", True),
            "no_active_grabs": ("unsupported_shared_server_probe", None),
            "owned_masters_removed": ("not_applicable_no_owned_masters", None),
        }
        checks = values.get("cleanup_checks")
        if devices == "not_created" and type(checks) is dict:
            bounded = {
                key: reason
                for key, (reason, measured) in reasons.items()
                if checks.get(key) == reason and receipt[key] is measured
            }
            if bounded:
                receipt["cleanup_checks"] = bounded
        grant = self.get_session(session_id)
        if grant.environment == "existing_session":
            # A positive summary cannot override an explicit negative native
            # measurement. Unknown/not-applicable fields remain null, not false.
            if any(
                receipt[key] is False
                for key in (
                    "stopped",
                    "released",
                    "applications_preserved",
                    "input_revoked",
                    "capture_revoked",
                    "portal_session_closed",
                    "ei_connection_closed",
                    "portal_connection_closed",
                    "physical_slaves_restored",
                    "no_inflight_input",
                    "no_active_grabs",
                    "owned_masters_removed",
                )
            ):
                clean = False
            if devices == "retained_inactive":
                clean = False
            if devices == "hyprland_owned_connections_closed" and not (
                grant.platform == "wayland"
                and receipt["hyprland_owned_connections_closed"] is True
                and receipt["receiver_release_verified"] is False
                and all(
                    receipt[key] is True
                    for key in (
                        "stopped",
                        "released",
                        "applications_preserved",
                        "input_revoked",
                        "capture_revoked",
                    )
                )
            ):
                clean = False
            if devices == "removed" and not all(
                receipt[key] is True
                for key in (
                    "physical_slaves_restored",
                    "no_inflight_input",
                    "no_active_grabs",
                    "owned_masters_removed",
                )
            ):
                clean = False
        receipt["complete"] = clean is True
        with self.lock:
            self.db.execute(
                "INSERT OR REPLACE INTO session_cleanup VALUES (?,?)",
                (session_id, json.dumps(receipt, sort_keys=True)),
            )

    def cleanup(self, session_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute(
                "SELECT result FROM session_cleanup WHERE session_id=?", (session_id,)
            ).fetchone()
        return json.loads(row[0]) if row is not None else None

    def receipt(self, session_id: str, action_id: str, payload_hash: str) -> dict | None:
        with self.lock:
            row = self.db.execute(
                "SELECT * FROM receipts WHERE session_id=? AND action_id=?", (session_id, action_id)
            ).fetchone()
        if row is None:
            return None
        if row["payload_hash"] != payload_hash:
            raise ComputerError("action_id_conflict")
        result = json.loads(row["result"])
        if row["status"] == "pending":
            result.update(status="unknown", reason="pending_no_replay")
        verification = result.get("verification", {})
        if verification.get("type") == "sequence":
            # Recover individual committed facts after a crash. Reading never
            # resumes a plan, even if some reserved steps were never dispatched.
            with self.lock:
                steps = []
                for step_id in verification.get("step_action_ids", []):
                    step = self.db.execute(
                        "SELECT payload_hash FROM receipts WHERE session_id=? AND action_id=?",
                        (session_id, step_id),
                    ).fetchone()
                    if step is not None:
                        steps.append(self.receipt(session_id, step_id, step[0]))
            verification["steps"] = steps
        return {**result, "action_id": action_id, "session_id": session_id}

    def begin_sequence(
        self, grant, action_id, payload_hash, steps, max_actions, *, provenance=None
    ):
        """Atomically reserve all step IDs and their budget before any input."""
        if provenance is not None:
            from .provenance import validate_application_provenance

            provenance = validate_application_provenance(provenance)
            if provenance is None:
                raise ComputerError("invalid_application_provenance")
        identity = {} if provenance is None else {"application_provenance": provenance}
        encoded_identity = json.dumps(identity, allow_nan=False)
        if len(encoded_identity.encode("utf-8")) > 16384:
            raise ComputerError("invalid_application_provenance")
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                existing = self.receipt(grant.session_id, action_id, payload_hash)
                if existing is not None:
                    self.db.execute("COMMIT")
                    return existing
                ids = [action_id, *(step_id for step_id, _ in steps)]
                if len(ids) != len(set(ids)) or not 1 <= len(steps) <= 8:
                    raise ComputerError("invalid_sequence")
                for step_id in ids:
                    if (
                        self.db.execute(
                            "SELECT 1 FROM receipts WHERE session_id=? AND action_id=?",
                            (grant.session_id, step_id),
                        ).fetchone()
                        is not None
                    ):
                        raise ComputerError("action_id_conflict")
                changed = self.db.execute(
                    "UPDATE sessions SET actions=actions+? WHERE session_id=? AND generation=? "
                    "AND state='active' AND actions<=? AND expires_at>?",
                    (
                        len(steps),
                        grant.session_id,
                        grant.generation,
                        max_actions - len(steps),
                        self.clock(),
                    ),
                ).rowcount
                if not changed:
                    raise ComputerError("grant_revoked_or_limit")
                initial = {
                    **identity,
                    "verification": {"type": "sequence", "step_action_ids": ids[1:]},
                }
                self.db.execute(
                    "INSERT INTO receipts VALUES (?,?,?,?,?)",
                    (grant.session_id, action_id, payload_hash, "pending", json.dumps(initial)),
                )
                for step_id, step_hash in steps:
                    self.db.execute(
                        "INSERT INTO receipts VALUES (?,?,?,?,?)",
                        (grant.session_id, step_id, step_hash, "pending", encoded_identity),
                    )
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return None

    def begin_action(
        self,
        grant: SessionGrant,
        action_id: str,
        payload_hash: str,
        max_actions: int,
        *,
        provenance: dict | None = None,
    ) -> dict | None:
        if provenance is not None:
            from .provenance import validate_application_provenance

            provenance = validate_application_provenance(provenance)
            if provenance is None:
                raise ComputerError("invalid_application_provenance")
        initial = {} if provenance is None else {"application_provenance": provenance}
        encoded = json.dumps(initial, allow_nan=False)
        if len(encoded.encode("utf-8")) > 16384:
            raise ComputerError("invalid_application_provenance")
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
                    (grant.session_id, grant.generation, max_actions, self.clock()),
                ).rowcount
                if not changed:
                    raise ComputerError("grant_revoked_or_limit")
                self.db.execute(
                    "INSERT INTO receipts VALUES (?,?,?,?,?)",
                    (grant.session_id, action_id, payload_hash, "pending", encoded),
                )
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
        return None

    def finish_action(self, session_id: str, action_id: str, result: dict) -> dict:
        allowed = {
            "status",
            "reason",
            "verification",
            "observation_id",
            "execution",
            "unsupported_characters",
            "diagnostics",
            "targeting",
            "input_safety",
            "native_failure",
        }
        if set(result) - allowed or result.get("status") not in {
            "executed",
            "verified",
            "not_satisfied",
            "unavailable",
            "unknown",
            "interrupted",
        }:
            raise ComputerError("invalid_receipt")
        if "native_failure" in result:
            # One bounded native schema, not arbitrary peer data. Keep these
            # facts separate from the conservative execution/release verdict.
            from .runtime.hyprland_guardian import native_failure

            detail = result["native_failure"]
            if type(detail) is not dict:
                raise ComputerError("invalid_receipt")
            clean = native_failure({**detail, "native_failure": detail})
            if clean is None or clean != detail:
                raise ComputerError("invalid_receipt")
        with self.lock:
            row = self.db.execute(
                "SELECT result FROM receipts WHERE session_id=? AND action_id=?",
                (session_id, action_id),
            ).fetchone()
            if row is not None:
                initial = json.loads(row[0])
                if "application_provenance" in initial:
                    result = {**result, "application_provenance": initial["application_provenance"]}
            self.db.execute(
                "UPDATE receipts SET status=?,result=? WHERE session_id=? AND action_id=?",
                (result["status"], json.dumps(result), session_id, action_id),
            )
        return {**result, "session_id": session_id, "action_id": action_id}

    @staticmethod
    def validate_name(name: str) -> str:
        if (
            not isinstance(name, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_. -]{0,127}", name)
            or name in {".", ".."}
        ):
            raise ComputerError("invalid_export_name")
        return name

    def prune(self) -> None:
        with self.lock:
            rows = self.db.execute(
                "SELECT evidence_id FROM evidence WHERE expires_at<=?", (self.clock(),)
            ).fetchall()
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
                    "THEN size ELSE 0 END),0) FROM evidence",
                    (session_id,),
                ).fetchone()
                if (
                    total + len(content) > GLOBAL_MAX_BYTES
                    or local + len(content) > SESSION_MAX_BYTES
                ):
                    raise ComputerError("evidence_quota")
                fd = os.open(
                    evidence_id,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                    0o600,
                    dir_fd=self.dir_fd,
                )
                created = True
                view = memoryview(content)
                while view:
                    count = os.write(fd, view)
                    view = view[count:]
                os.fsync(fd)
                info = os.fstat(fd)
                self.db.execute(
                    "INSERT INTO evidence VALUES (?,?,?,?,?,?,?,?,?)",
                    (
                        evidence_id,
                        session_id,
                        name,
                        kind,
                        len(content),
                        hashlib.sha256(content).hexdigest(),
                        info.st_dev,
                        info.st_ino,
                        self.clock() + EVIDENCE_TTL,
                    ),
                )
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
            row = self.db.execute(
                "SELECT e.* FROM evidence e JOIN sessions s USING(session_id) "
                "WHERE evidence_id=? AND owner_id=? "
                "AND channel_id=? AND host_id=?",
                (evidence_id, context.owner_id, context.channel_id, context.host_id),
            ).fetchone()
            if row is None or row["expires_at"] <= self.clock():
                raise ComputerError("evidence_unavailable")
            try:
                fd = os.open(
                    row["evidence_id"],
                    os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                    dir_fd=self.dir_fd,
                )
                try:
                    info = os.fstat(fd)
                    if (
                        not stat.S_ISREG(info.st_mode)
                        or info.st_nlink != 1
                        or info.st_uid != os.geteuid()
                        or info.st_mode & 0o077
                        or (info.st_dev, info.st_ino, info.st_size)
                        != (row["device"], row["inode"], row["size"])
                    ):
                        raise ComputerError("evidence_changed")
                    with os.fdopen(fd, "rb", closefd=False) as source:
                        content = source.read(row["size"] + 1)
                    after = os.fstat(fd)
                    if (after.st_mtime_ns, after.st_ctime_ns, after.st_size) != (
                        info.st_mtime_ns,
                        info.st_ctime_ns,
                        info.st_size,
                    ):
                        raise ComputerError("evidence_changed")
                finally:
                    os.close(fd)
            except OSError as exc:
                raise ComputerError("evidence_unavailable") from exc
            if len(content) != row["size"] or hashlib.sha256(content).hexdigest() != row["digest"]:
                raise ComputerError("evidence_changed")
            return content, {
                "evidence_id": evidence_id,
                "name": row["name"],
                "size": row["size"],
                "sha256": row["digest"],
                "kind": row["kind"],
                "expires_at": row["expires_at"],
            }

    def close(self) -> None:
        with self.lock:
            self.db.close()
            os.close(self.dir_fd)
