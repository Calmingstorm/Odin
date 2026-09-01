"""Typed failures shared by the search stack and its public boundaries."""

from __future__ import annotations


class InvalidSearchQuery(ValueError):  # noqa: N818 — public domain exception name
    """The caller supplied text that cannot be represented safely in search."""


class SearchExecutionError(RuntimeError):
    """A configured search backend could not execute the query."""


class SearchInvariantError(RuntimeError):
    """An internal search result violated the identity contract."""


def validate_search_query(query: str) -> None:
    """Reject input containing NUL, which SQLite text values cannot represent safely."""
    if "\x00" in query:
        raise InvalidSearchQuery("invalid query: unsupported control character")
