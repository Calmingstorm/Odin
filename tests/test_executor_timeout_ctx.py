"""The per-tool timeout is request-scoped (contextvar), not shared executor state.

Before this fix ``_current_tool_timeout`` was a single instance attribute on the
process-wide ToolExecutor, overwritten by every concurrent ``_try_tool``; a
30s-timeout tool could shrink a concurrent 900s command's inner wall (or a
3660s tool could stretch it). It is now a ContextVar: each tool call sees its
own value, the token is reset in ``finally`` (even on exception/timeout), and
nested calls restore the outer value.
"""
from __future__ import annotations

import asyncio

from src.tools.executor import ToolExecutor, _current_tool_timeout_ctx


def _executor() -> ToolExecutor:
    ex = ToolExecutor.__new__(ToolExecutor)
    ex._metrics = {}
    return ex


async def test_concurrent_tools_have_isolated_timeouts():
    ex = _executor()
    seen: dict[str, int | None] = {}

    def make_handler(name):
        async def _h(_inp):
            await asyncio.sleep(0.05)  # force the two calls to interleave
            seen[name] = _current_tool_timeout_ctx.get()
            return "ok"

        return _h

    await asyncio.gather(
        ex._try_tool("a", make_handler("a"), {}, 30, None),
        ex._try_tool("b", make_handler("b"), {}, 900, None),
    )
    # Each concurrent call saw ITS OWN timeout, not the other's.
    assert seen["a"] == 30
    assert seen["b"] == 900


async def test_timeout_cleared_after_call():
    ex = _executor()

    async def _h(_inp):
        return "ok"

    assert _current_tool_timeout_ctx.get() is None
    await ex._try_tool("a", _h, {}, 42, None)
    # A later direct read sees no stale timeout.
    assert _current_tool_timeout_ctx.get() is None


async def test_timeout_cleared_on_exception():
    ex = _executor()

    async def _boom(_inp):
        raise RuntimeError("boom")

    # _try_tool returns an error tuple rather than raising; the finally still runs.
    result = await ex._try_tool("a", _boom, {}, 42, None)
    assert isinstance(result, tuple) and result[1] == -1
    assert _current_tool_timeout_ctx.get() is None


async def test_nested_call_restores_outer_timeout():
    ex = _executor()
    seen: dict[str, int | None] = {}

    async def _inner(_inp):
        seen["inner"] = _current_tool_timeout_ctx.get()
        return "ok"

    async def _outer(_inp):
        seen["outer_before"] = _current_tool_timeout_ctx.get()
        await ex._try_tool("inner", _inner, {}, 300, None)
        seen["outer_after"] = _current_tool_timeout_ctx.get()
        return "ok"

    await ex._try_tool("outer", _outer, {}, 900, None)
    assert seen["outer_before"] == 900
    assert seen["inner"] == 300
    assert seen["outer_after"] == 900  # inner's reset restored the outer value
