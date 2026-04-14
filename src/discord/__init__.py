"""Odin Discord bot package."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .client import OdinBot

__all__ = ["OdinBot"]


def __getattr__(name: str):
    if name == "OdinBot":
        from .client import OdinBot
        return OdinBot
    raise AttributeError(name)
