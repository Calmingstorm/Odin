"""Observability: pure instrumentation of how Odin assembles context and
why operations fail. Records decisions — never influences them.

Design contract (PR #104):
- Zero behavior impact: tracing is opt-in per call site via an optional
  collector argument; absent collector means the code path is unchanged.
- Never the outage: every recording operation is exception-guarded; a
  broken trace logs a warning and the turn proceeds untouched.
- Metadata only: section names, counts, token estimates, decision reasons,
  hashed keys, opaque ids — never prompt or message content.
"""
from .context_trace import TRACE_SCHEMA_VERSION, ContextTraceCollector
from .failure_classes import classify_failure

__all__ = ["TRACE_SCHEMA_VERSION", "ContextTraceCollector", "classify_failure"]
