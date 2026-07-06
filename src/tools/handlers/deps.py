"""HandlerDeps — the narrow seam between the executor core and handler domains.

RFC-004 P4 (R1 blocker #3). Two hard rules, both contract-enforced:

1. **Identity preservation**: stateful objects (locks, stats, registries,
   config, streamer) are the executor's OWN instances, reached by
   reference — domains must never construct their own.
2. **Late resolution**: every field that touches executor state or
   methods is a ZERO-ARG or passthrough callable built in
   ``ToolExecutor.__init__`` closing over the executor *variable*
   (``lambda: self.config`` — never a captured bound method or copied
   value). Instance/class monkeypatches on the executor therefore keep
   governing domain behavior — the RFC-002 captured-vs-live lesson.

``HandlerBase`` re-exposes the executor spellings (``self.config``,
``self._resolve_host``, …) so moved handler bodies stay VERBATIM.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class HandlerDeps:
    """Late-resolving accessors into the executor core (see module doc)."""

    # state accessors (zero-arg callables → live executor attributes)
    config: Callable[[], Any]
    output_streamer: Callable[[], Any]
    host_access: Callable[[], Any]
    branch_freshness_enabled: Callable[[], bool]
    current_user_id: Callable[[], str | None]
    process_registry: Callable[[], Any]  # lazy-inits ON the executor (web API reads it there)
    # method passthroughs (resolve the executor attr per call)
    resolve_host: Callable[..., Any]
    resolve_default_host: Callable[..., Any]
    govern_command: Callable[..., Any]
    exec_command: Callable[..., Any]  # async
    run_on_host: Callable[..., Any]  # async
    annotate_with_freshness: Callable[..., Any]  # async


class HandlerBase:
    """Domain base: exposes deps under the original executor spellings so
    moved handler bodies remain verbatim."""

    def __init__(self, deps: HandlerDeps) -> None:
        self._deps = deps
        # Method passthroughs — stable wrapper objects that resolve the
        # executor attribute at call time.
        self._resolve_host = deps.resolve_host
        self._resolve_default_host = deps.resolve_default_host
        self._govern_command = deps.govern_command
        self._exec_command = deps.exec_command
        self._run_on_host = deps.run_on_host
        self._annotate_with_freshness = deps.annotate_with_freshness

    # State properties — read the LIVE executor attribute on every access.
    @property
    def config(self):
        return self._deps.config()

    @property
    def output_streamer(self):
        return self._deps.output_streamer()

    @property
    def _host_access(self):
        return self._deps.host_access()

    @property
    def _branch_freshness_enabled(self) -> bool:
        return self._deps.branch_freshness_enabled()

    @property
    def _current_user_id(self) -> str | None:
        return self._deps.current_user_id()

    def _process_registry(self):
        """The executor-owned ProcessRegistry (lazy-inited there — the web
        API and graceful shutdown read ``tool_executor._process_registry``)."""
        return self._deps.process_registry()
