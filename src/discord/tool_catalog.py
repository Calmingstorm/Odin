"""Merged tool-definition catalog (RFC-001 Phase 3).

Owns the builtin+skill tool-definition merge and its cache. The cache is
also writable through the OdinBot facade property ``_cached_merged_tools``
because ``web/api.py`` invalidates it by assigning ``None`` (Appendix B
starred write path).

``get_config`` is a provider callable, not a captured reference: the web
API's config hot-reload REPLACES ``bot.config``, and the catalog must see
the live object.
"""

from __future__ import annotations

from collections.abc import Callable

from ..tools import get_tool_definitions


class ToolCatalog:
    def __init__(self, *, get_config: Callable, skill_manager) -> None:
        self.get_config = get_config
        self.skill_manager = skill_manager
        # Cached merged tool definitions — invalidated on skill create/edit/delete
        self.cached: list[dict] | None = None

    def merged_definitions(self) -> list[dict]:
        """Merge built-in and skill tool definitions, deduplicating by name.

        Built-in tools take priority over skills with the same name.
        Tools requiring unconfigured backends are excluded (e.g. claude_code
        without claude_code_host). Cached — invalidated on skill create/edit/delete.
        """
        if self.cached is not None:
            return self.cached
        config = self.get_config()
        builtin = get_tool_definitions()
        # Filter out tools that require unconfigured backends
        if not config.tools.claude_code_host:
            builtin = [t for t in builtin if t["name"] != "claude_code"]
        _email_tools = {"email_send", "email_search", "email_read", "email_list_recent"}
        if not getattr(config, "email", None) or not config.email.enabled:
            builtin = [t for t in builtin if t["name"] not in _email_tools]
        # issue_tracker returns "not configured" for every call unless enabled,
        # yet was always advertised — so the model kept trying it. Filter it out
        # like the other backend-gated tools.
        issue_cfg = getattr(config, "issue_tracker", None)
        if not issue_cfg or not issue_cfg.enabled:
            builtin = [t for t in builtin if t["name"] != "issue_tracker"]
        # generate_image: visible only when a backend is structurally available —
        # native (Codex provider + creds) OR ComfyUI configured, per image.backend.
        # So Kimi with no ComfyUI hides it entirely.
        from ..tools.image.selector import image_tool_available

        if not image_tool_available(config):
            builtin = [t for t in builtin if t["name"] != "generate_image"]
        builtin_names = {t["name"] for t in builtin}
        skill_defs = [
            t for t in self.skill_manager.get_tool_definitions() if t["name"] not in builtin_names
        ]
        self.cached = builtin + skill_defs
        return self.cached

    def invalidate(self) -> None:
        self.cached = None
