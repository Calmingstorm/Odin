"""Discord-native tool dispatch (RFC-001 Phase 5).

One registry serves both pipelines (chat tool loop and autonomous loop),
replacing the two hand-synced if/elif chains. See registry.py.
"""

from .registry import NativeToolDispatcher, NativeToolEffects, register_native_handlers

__all__ = ["NativeToolDispatcher", "NativeToolEffects", "register_native_handlers"]
