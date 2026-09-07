"""Bounded, path-free application identity projection for durable receipts."""
from __future__ import annotations

import re


def canonical_application_provenance(scope):
    """Return a fresh JSON-safe projection, or None for missing/malformed evidence.

    Accepts private X11 or Wayland snapshots. Never copies titles, raw argv,
    arbitrary provider fields, or full executable/script paths.
    """
    if not isinstance(scope, dict):
        return None
    identity = scope.get("process", scope.get("application"))
    if not isinstance(identity, dict):
        return None

    def basename(value):
        if not isinstance(value, str) or not value.startswith("/") or len(value) > 4096:
            return None
        return value.rsplit("/", 1)[-1]

    script = identity.get("script_identity")
    if script is not None:
        if not isinstance(script, dict):
            return None
        script = {"interpreter_basename": basename(script.get("interpreter")),
                  "argv_digest": script.get("argv_digest"), "verified": script.get("verified")}
    result = {key: identity.get(key) for key in
              ("pid", "uid", "start_ticks", "exe_identity", "cmdline_digest", "trusted_executable")}
    result.update(exe_basename=basename(identity.get("exe")),
                  wm_class=scope.get("wm_class"), script_identity=script)
    return validate_application_provenance(result)


def validate_application_provenance(value):
    """Validate the entire canonical receipt shape; return a detached copy or None."""
    fields = {"pid", "uid", "start_ticks", "exe_basename", "exe_identity", "cmdline_digest",
              "trusted_executable", "wm_class", "script_identity"}
    if not isinstance(value, dict) or set(value) != fields:
        return None

    def text(item, limit):
        return (isinstance(item, str) and len(item) <= limit
                and not any(ord(c) < 32 or 0xD800 <= ord(c) <= 0xDFFF for c in item))

    def name(item):
        return text(item, 255) and item not in {"", ".", ".."} and "/" not in item

    def digest(item):
        return isinstance(item, str) and re.fullmatch(r"[0-9a-f]{64}", item) is not None

    for field, minimum in (("pid", 2), ("uid", 0), ("start_ticks", 1)):
        if type(value[field]) is not int or not minimum <= value[field] < 2**64:
            return None
    inode = value["exe_identity"]
    if (not isinstance(inode, (list, tuple)) or len(inode) != 2
            or any(type(v) is not int or not 0 <= v < 2**64 for v in inode)
            or not name(value["exe_basename"]) or not text(value["wm_class"], 4096)
            or type(value["trusted_executable"]) is not bool
            or not digest(value["cmdline_digest"])):
        return None
    script = value["script_identity"]
    if script is not None:
        if (not isinstance(script, dict)
                or set(script) != {"interpreter_basename", "argv_digest", "verified"}
                or not name(script["interpreter_basename"])
                or not digest(script["argv_digest"]) or script["verified"] is not False):
            return None
        script = dict(script)
    return value | {"exe_identity": list(inode), "script_identity": script}
