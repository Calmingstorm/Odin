"""Typed failures shared by the search stack and its public boundaries."""

from __future__ import annotations


class InvalidSearchQuery(ValueError):  # noqa: N818 — public domain exception name
    """The caller supplied text that cannot be represented safely in search."""


class SearchExecutionError(RuntimeError):
    """A configured search backend could not execute the query."""


class SearchInvariantError(RuntimeError):
    """An internal search result violated the identity contract."""


def validate_search_query(query: str) -> None:
    """Reject text that cannot be represented safely as SQLite UTF-8 input."""
    if "\x00" in query:
        raise InvalidSearchQuery("invalid query: unsupported character")
    try:
        query.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise InvalidSearchQuery("invalid query: text is not valid UTF-8") from exc
