"""One retained file, read for delivery under the same fences as ``get_tool_output``.

``post_file``'s ``attachment`` source posts a file a tool returned (an MCP result's
binary content, or a file retained from a Discord upload) without exporting it
to any filesystem. The bytes are read from the private output store only after:

* retrieval itself (``get_tool_output``) is currently authorized for the
  requester, as when the file was retained;
* the store's own fences pass: the requester and delivery channel that retained
  it, the originating tool's permission and scope, and any captured credential
  or host bindings, all checked before the body is loaded.

A cursor is evidence, not authority. Only a whole file's ``<result_id>:0``
cursor is accepted: a manifest or any other text snapshot, and a page offset,
are refused. The stored SHA-256 is verified before anything is delivered.
"""

from __future__ import annotations

import hashlib

from .output_authorization import request_delivery_channel
from .output_delivery import delivery_scope
from .output_retention import BinarySnapshot, RetentionError


class RetainedFileError(RetentionError):
    """A cursor that names no deliverable retained file."""


def read_retained_file(executor, cursor: str) -> BinarySnapshot:
    """Return the whole retained file named by *cursor*, or raise RetentionError."""
    # Owner and channel resolve exactly as _handle_get_tool_output resolves them.
    owner, channel = delivery_scope.get()
    owner = str(executor._current_user_id or owner or "")
    channel = request_delivery_channel.get() or channel
    if not executor._authorize_output("get_tool_output", (), owner):
        raise RetentionError("Permission denied: retrieval of retained files is not authorized.")
    snapshot, offset = executor._ensure_output_store().read(
        cursor,
        owner=owner,
        channel=str(channel),
        authorize=lambda tool, hosts: executor._authorize_output(tool, hosts, owner),
    )
    if not isinstance(snapshot, BinarySnapshot):
        raise RetainedFileError(
            "Not a retained file: this cursor names text output or an attachment manifest. "
            "Read the manifest with get_tool_output and pass one file's own cursor "
            "(its entry's retrieval cursor)."
        )
    if offset != 0:
        raise RetainedFileError(
            "Not a whole-file cursor: pass the file's own cursor, which ends in ':0' "
            "(its manifest entry's retrieval cursor)."
        )
    if hashlib.sha256(snapshot.data).hexdigest() != snapshot.sha256:
        raise RetainedFileError("Retained file failed its integrity check; nothing was posted.")
    return snapshot


# The raster signatures MCP media accepts (src/tools/mcp/client.py
# _image_media_type), mirrored rather than imported: a recognized signature
# decides the extension before any declared MIME type.
def _raster_extension(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8"):
        return ".jpg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    return None


_MIME_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "application/json": ".json",
    "application/zip": ".zip",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/csv": ".csv",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
}


def retained_filename(snapshot: BinarySnapshot) -> str:
    """A deterministic name from the result id and content index.

    Never derived from a server-supplied URI or resource name. The bytes are
    not decoded, transcoded or otherwise changed.
    """
    media_type = str(snapshot.media_type or "").split(";", 1)[0].strip().lower()
    extension = _raster_extension(snapshot.data) or _MIME_EXTENSIONS.get(media_type, ".bin")
    return f"retained-{snapshot.result_id[:8]}-{int(snapshot.content_index)}{extension}"
