"""Files a WebUI chat question carries (#747), staged until a question uses them.

A page uploads each file before it sends its question (``POST
/api/chat/uploads``), gets an id, and names the ids in the question. A staged
file belongs to the identity that uploaded it, is used once (claimed, then
deleted once processed), and expires unused after a day. A claim found after
a restart is deleted, never used again: its question may already have run.

The limits bound disk use only on this new input: a file's size, a message's
file count, and the bytes and entries staged per identity and in all, counting
uploads still streaming. A full store refuses a new upload after expired ones
are removed; it never removes an unexpired one a page may be about to send.
All bookkeeping is synchronous, so a claim cannot interleave with another.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import secrets
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from aiohttp import web

from ..odin_log import get_logger

log = get_logger("web.uploads")

MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_FILES_PER_MESSAGE = 10
OWNER_BYTES = 500 * 1024 * 1024
TOTAL_BYTES = 1024 * 1024 * 1024
OWNER_ENTRIES = 100
TOTAL_ENTRIES = 1000
UNUSED_SECONDS = 24 * 60 * 60
#: One upload request ends by then, so a stalled stream frees its reservation.
UPLOAD_SECONDS = 15 * 60
CHUNK_BYTES = 64 * 1024

_UPLOAD_ID = re.compile(r"^[0-9a-f]{32}$")
_UNSAFE_NAME = re.compile(r"[\x00-\x1f\x7f\x85  ]+")


class UploadError(ValueError):
    """A refused upload or claim, with the HTTP status that says why."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def valid_upload_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_UPLOAD_ID.match(value))


INVALID_ATTACHMENTS = (
    f"attachments must be a list of at most {MAX_FILES_PER_MESSAGE} upload ids"
)


def valid_attachments(value: Any) -> bool:
    """A question's attachments: a list of upload ids, at most a message's worth."""
    return (isinstance(value, list) and len(value) <= MAX_FILES_PER_MESSAGE
            and all(valid_upload_id(item) for item in value))


def _label(filename: str | None) -> str:
    """A client's filename as a label only: never a path."""
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = " ".join(_UNSAFE_NAME.sub(" ", name).split())[:200]
    return name or "file"


@dataclass
class Upload:
    """One staged file; also the attachment shape intake's processor reads."""

    upload_id: str
    owner: str
    filename: str
    content_type: str
    size: int
    sha256: str
    created: float
    path: Path
    state: str = "staged"  # staged | claimed

    async def read(self) -> bytes:
        return await asyncio.to_thread(self.path.read_bytes)

    def public(self) -> dict:
        return {"upload_id": self.upload_id, "name": self.filename,
                "size": self.size, "content_type": self.content_type}


class UploadStore:
    """Staged chat uploads in one private directory (files and records, 0600)."""

    def __init__(
        self,
        directory: Path,
        *,
        max_file_bytes: int = MAX_FILE_BYTES,
        owner_bytes: int = OWNER_BYTES,
        total_bytes: int = TOTAL_BYTES,
        owner_entries: int = OWNER_ENTRIES,
        total_entries: int = TOTAL_ENTRIES,
        unused_seconds: float = UNUSED_SECONDS,
    ) -> None:
        self._dir = Path(directory)
        self.max_file_bytes = max_file_bytes
        self._owner_bytes = owner_bytes
        self._total_bytes = total_bytes
        self._owner_entries = owner_entries
        self._total_entries = total_entries
        self._unused_seconds = unused_seconds
        self._entries: dict[str, Upload] = {}
        # Uploads still streaming: id -> [owner, bytes received so far].
        self._streaming: dict[str, list] = {}
        self._loaded = False

    # -- state ------------------------------------------------------------

    def _load(self) -> None:
        """Adopt what an earlier run left: staged files stay, the rest goes."""
        if self._loaded:
            return
        self._dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        for path in self._dir.glob("*.part"):
            path.unlink(missing_ok=True)
        for record in self._dir.glob("*.json"):
            upload = self._read_record(record)
            if upload is None:
                record.unlink(missing_ok=True)
                (self._dir / f"{record.stem}.bin").unlink(missing_ok=True)
                continue
            self._entries[upload.upload_id] = upload
        for path in self._dir.glob("*.bin"):
            if path.stem not in self._entries:
                path.unlink(missing_ok=True)
        self._loaded = True

    def _read_record(self, record: Path) -> Upload | None:
        try:
            data = json.loads(record.read_text(encoding="utf-8"))
            upload = Upload(
                upload_id=str(data["upload_id"]), owner=str(data["owner"]),
                filename=str(data["name"]), content_type=str(data["content_type"]),
                size=int(data["size"]), sha256=str(data["sha256"]),
                created=float(data["created"]), path=self._dir / f"{record.stem}.bin",
                state=str(data["state"]),
            )
        except (OSError, ValueError, KeyError, TypeError):
            return None
        if (
            upload.upload_id != record.stem
            or not valid_upload_id(upload.upload_id)
            # A claim from an earlier run may already have been answered.
            or upload.state != "staged"
            or not upload.path.is_file()
            or upload.path.stat().st_size != upload.size
        ):
            return None
        return upload

    def _write_record(self, upload: Upload) -> None:
        record = self._dir / f"{upload.upload_id}.json"
        temp = self._dir / f"{upload.upload_id}.json.part"
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump({"upload_id": upload.upload_id, "owner": upload.owner,
                       "name": upload.filename, "content_type": upload.content_type,
                       "size": upload.size, "sha256": upload.sha256,
                       "created": upload.created, "state": upload.state}, stream)
        os.replace(temp, record)

    def _delete(self, upload: Upload) -> None:
        self._entries.pop(upload.upload_id, None)
        (self._dir / f"{upload.upload_id}.json").unlink(missing_ok=True)
        upload.path.unlink(missing_ok=True)

    def purge_expired(self) -> int:
        """Delete staged uploads unused for a day; claimed ones are in use."""
        self._load()
        cutoff = time.time() - self._unused_seconds
        expired = [u for u in self._entries.values() if u.state == "staged" and u.created < cutoff]
        for upload in expired:
            self._delete(upload)
        return len(expired)

    def _usage(self, owner: str | None) -> tuple[int, int]:
        entries = [u for u in self._entries.values() if owner is None or u.owner == owner]
        streams = [s for s in self._streaming.values() if owner is None or s[0] == owner]
        return (len(entries) + len(streams),
                sum(u.size for u in entries) + sum(s[1] for s in streams))

    def _check_room(self, owner: str, *, new_entry: bool) -> None:
        for scope, max_entries, max_bytes in ((owner, self._owner_entries, self._owner_bytes),
                                              (None, self._total_entries, self._total_bytes)):
            entries, size = self._usage(scope)
            if (new_entry and entries >= max_entries) or size > max_bytes:
                who = "your" if scope is not None else "the"
                raise UploadError(
                    f"Upload storage is full for {who} unsent files; send or remove some, "
                    "or wait for unused ones to expire.", 507)

    # -- uploads ----------------------------------------------------------

    async def receive(self, owner: str, part: Any) -> Upload:
        """Stream one multipart file part to a private staged file."""
        self.purge_expired()
        self._check_room(owner, new_entry=True)
        upload_id = secrets.token_hex(16)
        stream = self._streaming[upload_id] = [owner, 0]
        partial = self._dir / f"{upload_id}.part"
        final = self._dir / f"{upload_id}.bin"
        digest = hashlib.sha256()
        try:
            fd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as out:
                while chunk := await part.read_chunk(CHUNK_BYTES):
                    stream[1] += len(chunk)
                    if stream[1] > self.max_file_bytes:
                        mib = self.max_file_bytes // (1024 * 1024)
                        raise UploadError(f"A file may be at most {mib} MiB.", 413)
                    self._check_room(owner, new_entry=False)
                    digest.update(chunk)
                    out.write(chunk)
            content_type = (part.headers.get("Content-Type") or "application/octet-stream")
            upload = Upload(
                upload_id=upload_id, owner=owner, filename=_label(part.filename),
                content_type=content_type.split(";", 1)[0].strip()[:200]
                or "application/octet-stream",
                size=stream[1], sha256=digest.hexdigest(), created=time.time(), path=final,
            )
            os.replace(partial, final)
            self._write_record(upload)
        except BaseException:
            partial.unlink(missing_ok=True)
            final.unlink(missing_ok=True)
            (self._dir / f"{upload_id}.json").unlink(missing_ok=True)
            raise
        finally:
            self._streaming.pop(upload_id, None)
        self._entries[upload_id] = upload
        return upload

    def discard(self, upload: Upload) -> None:
        """Drop a staged upload its own request refused after receiving it."""
        if self._entries.get(upload.upload_id) is upload:
            self._delete(upload)

    def claim(self, owner: str, upload_ids: list) -> list[Upload]:
        """Claim every named upload of this owner for one question, or none."""
        self.purge_expired()
        if len(upload_ids) > MAX_FILES_PER_MESSAGE:
            raise UploadError(f"A message may carry at most {MAX_FILES_PER_MESSAGE} files.")
        if len(set(upload_ids)) != len(upload_ids):
            raise UploadError("A file is attached twice.")
        uploads = []
        for upload_id in upload_ids:
            upload = self._entries.get(upload_id) if valid_upload_id(upload_id) else None
            if upload is None or upload.owner != owner or upload.state != "staged":
                raise UploadError(
                    "An attached file is unknown, expired or already sent; attach it again.", 409)
            uploads.append(upload)
        for upload in uploads:
            upload.state = "claimed"
            try:
                self._write_record(upload)
            except OSError:
                log.warning("Could not record the claim of upload %s", upload.upload_id,
                            exc_info=True)
        return uploads

    def release(self, uploads: list[Upload]) -> None:
        """Return claimed uploads unused (their question never ran)."""
        for upload in uploads:
            if self._entries.get(upload.upload_id) is upload and upload.state == "claimed":
                upload.state = "staged"
                try:
                    self._write_record(upload)
                except OSError:
                    self._delete(upload)

    def consume(self, uploads: list[Upload]) -> None:
        """Delete claimed uploads once their question has processed them."""
        for upload in uploads:
            if self._entries.get(upload.upload_id) is upload:
                self._delete(upload)


#: The app's upload store (created with the web routes).
WEB_UPLOADS = web.AppKey("web_uploads", UploadStore)
