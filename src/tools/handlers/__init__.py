"""Executor handler domains (RFC-004 P4–P6).

Each module owns a group of tool handlers moved verbatim from the
ToolExecutor monolith. Domains reach executor plumbing exclusively
through a shared, identity-preserving HandlerDeps (deps.py) — never a
back-reference to the executor object.
"""
