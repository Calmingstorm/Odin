"""Shared test fakes for characterization and unit tests.

Introduced by RFC-001 Phase 0 (client.py decomposition campaign). Before
this package, every test file re-improvised its own bot factory, fake LLM,
and MagicMock discord objects; these are the blessed shared versions.

Import surface:
    from tests.fakes import FakeLLM, text_response, tool_call_response
    from tests.fakes import FakeMessage, FakeChannel, FakeAuthor, FakeThread
    from tests.fakes import make_bot
"""

from .bot_factory import make_bot
from .discord_objects import (
    FakeAttachment,
    FakeAuthor,
    FakeChannel,
    FakeMessage,
    FakeSentMessage,
    FakeThread,
)
from .llm import (
    FakeLLM,
    parse_error_call,
    text_response,
    tool_call_response,
)

__all__ = [
    "FakeLLM",
    "text_response",
    "tool_call_response",
    "parse_error_call",
    "FakeAuthor",
    "FakeChannel",
    "FakeThread",
    "FakeMessage",
    "FakeAttachment",
    "FakeSentMessage",
    "make_bot",
]
