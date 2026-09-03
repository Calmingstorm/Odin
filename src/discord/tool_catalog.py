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

import importlib.util
from collections.abc import Callable

from ..odin_log import get_logger
from ..tools import get_tool_definitions

log = get_logger("tools")


class ToolCatalog:
    def __init__(
        self, *, get_config: Callable, skill_manager, get_mcp_definitions: Callable | None = None
    ) -> None:
        self.get_config = get_config
        self.skill_manager = skill_manager
        # Published MCP tool definitions (MCP campaign P3). None keeps the
        # catalog MCP-free; the provider returns ONLY tools satisfying the
        # publication predicate, and every publication transition invalidates
        # this cache synchronously via the manager's catalog hook.
        self.get_mcp_definitions = get_mcp_definitions
        # Cached merged tool definitions — invalidated on skill create/edit/delete
        self.cached: list[dict] | None = None

    def merged_definitions(self, *, cache_result: bool = True) -> list[dict]:
        """Merge built-in and skill tool definitions, deduplicating by name.

        Built-in tools take priority over skills with the same name.
        Tools requiring unconfigured backends are excluded. Cached — invalidated
        on skill create/edit/delete.
        """
        if self.cached is not None:
            return self.cached
        config = self.get_config()
        builtin = get_tool_definitions()
        # ALL static built-in names stay reserved even when a tool is
        # disabled or backend-hidden — skills and MCP tools must never
        # shadow one (collision checks below use this set, not post-filter
        # visibility).
        static_names = {t["name"] for t in builtin}
        # Operator-disabled built-ins (tools.disabled_tools) leave first:
        # a disabled tool does not exist for the model on any surface. The
        # dispatch-time policy guard is the backstop for requests assembled
        # before a disable landed.
        from ..tools.builtin_policy import normalize_disabled_tools

        operator_disabled = set(normalize_disabled_tools(config.tools.disabled_tools))
        if operator_disabled:
            builtin = [t for t in builtin if t["name"] not in operator_disabled]
        # Filter out tools that require unconfigured backends
        hidden = self.backend_hidden_names(config)
        if hidden:
            builtin = [t for t in builtin if t["name"] not in hidden]
        # Per-spawn agent model/effort catalogue: expose each axis's field +
        # clause on spawn_agent/spawn_loop_agents only when that agent config
        # axis is "auto" (operates on clones — never mutates the shared defs).
        from ..tools.agent_tool_policy import apply_agent_axis_policy

        builtin = apply_agent_axis_policy(builtin, config)
        skill_defs = [
            t for t in self.skill_manager.get_tool_definitions() if t["name"] not in static_names
        ]
        merged = builtin + skill_defs
        # Published MCP tools (P3): appended AFTER builtins+skills, which win
        # name conflicts — a server cannot shadow a native tool, INCLUDING a
        # disabled or backend-hidden one (reserved static names). Only tools
        # passing the manager's publication predicate ever appear here.
        if self.get_mcp_definitions is not None:
            taken = static_names | {t["name"] for t in merged}
            for mcp_def in self.get_mcp_definitions():
                if mcp_def["name"] not in taken:
                    merged.append(mcp_def)
        if cache_result:
            self.cached = merged
        return merged

    def backend_hidden_names(self, config=None) -> set[str]:
        """Built-ins hidden because their backend is not configured or their
        optional dependency is absent — shared by catalog assembly and the
        Tools-management inventory (state ``unavailable``). Behavior-identical
        to the historical inline filters."""
        if config is None:
            config = self.get_config()
        hidden: set[str] = set()
        if not getattr(config, "email", None) or not config.email.enabled:
            hidden.update({"email_send", "email_search", "email_read", "email_list_recent"})
        # issue_tracker returns "not configured" for every call unless enabled,
        # yet was always advertised — so the model kept trying it. Filter it out
        # like the other backend-gated tools.
        issue_cfg = getattr(config, "issue_tracker", None)
        if not issue_cfg or not issue_cfg.enabled:
            hidden.add("issue_tracker")
        # generate_image: visible only when a backend is structurally available —
        # native (Codex provider + creds) OR ComfyUI configured, per image.backend.
        # So Kimi with no ComfyUI hides it entirely.
        from ..tools.image.selector import image_tool_available

        if not image_tool_available(config):
            hidden.add("generate_image")
        # analyze_pdf: PyMuPDF lives in the optional `pdf` extra, and no
        # install path used to install extras — so the tool was advertised on
        # every install while its dependency was present on none of them, and
        # calls died with "No module named 'fitz'". Structural availability
        # only; the handler still converts a load failure into a clean result,
        # because find_spec proves the module is importable, not that the
        # native library loads.
        if importlib.util.find_spec("fitz") is None:
            hidden.add("analyze_pdf")
            log.info(
                "analyze_pdf hidden from the tool catalog: PyMuPDF is not "
                "installed. Install the 'pdf' extra to enable it "
                "(pip install '.[pdf]')."
            )
        return hidden

    def invalidate(self) -> None:
        self.cached = None
