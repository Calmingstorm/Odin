"""Trusted agent wait context. Never populated from tool arguments."""

from contextvars import ContextVar
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .manager import AgentInfo

waiting_agent: ContextVar["AgentInfo | None"] = ContextVar("waiting_agent", default=None)
