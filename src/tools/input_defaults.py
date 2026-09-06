"""Defaults for optional tool fields emitted as empty schema placeholders."""

from typing import Any


def default_if_empty(value: Any, default: Any = None) -> Any:
    """Treat null and blank strings as omitted, without coercing other values.

    In particular, zero offsets remain explicit and invalid booleans, numbers,
    and nonblank strings still reach the caller's existing validation.
    """
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    return value
