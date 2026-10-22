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


def int_or_default(value: Any, default: int) -> int:
    """Null or blank means *default*; any other value must be a whole number.

    Raises ValueError for a non-numeric value. Zero and negative numbers come
    back as given: what they mean stays the caller's policy.
    """
    value = default_if_empty(value, default)
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"expected a whole number, got {value!r}") from None
