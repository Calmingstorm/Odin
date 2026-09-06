"""Defaults for optional tool fields emitted as empty schema placeholders."""

from typing import Any


def default_if_empty(value: Any, default: Any = None) -> Any:
    """Treat null and blank strings as omitted, without coercing other values.

    Zero values are left for the caller's validation and default policy;
    booleans, numbers, and nonblank strings are never coerced here.
    """
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    return value
