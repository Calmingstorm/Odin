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
        # analyze_pdf: PyMuPDF lives in the optional `pdf` extra, and no
        # install path used to install extras — so the tool was advertised on
        # every install while its dependency was present on none of them, and
        # calls died with "No module named 'fitz'". Structural availability
        # only; the handler still converts a load failure into a clean result,
        # because find_spec proves the module is importable, not that the
        # native library loads.
        if importlib.util.find_spec("fitz") is None:
            builtin = [t for t in builtin if t["name"] != "analyze_pdf"]
            log.info(
                "analyze_pdf hidden from the tool catalog: PyMuPDF is not "
                "installed. Install the 'pdf' extra to enable it "
                "(pip install '.[pdf]')."
            )
        # Per-spawn agent model/effort catalogue: expose each axis's field +
        # clause on spawn_agent/spawn_loop_agents only when that agent config
        # axis is "auto" (operates on clones — never mutates the shared defs).
        from ..tools.agent_tool_policy import apply_agent_axis_policy

        builtin = apply_agent_axis_policy(builtin, config)
        builtin_names = {t["name"] for t in builtin}
        skill_defs = [
            t for t in self.skill_manager.get_tool_definitions() if t["name"] not in builtin_names
        ]
        merged = builtin + skill_defs
        # Published MCP tools (P3): appended AFTER builtins+skills, which win
        # name conflicts — a server cannot shadow a native tool. Only tools
        # passing the manager's publication predicate ever appear here.
        if self.get_mcp_definitions is not None:
            taken = {t["name"] for t in merged}
            for mcp_def in self.get_mcp_definitions():
                if mcp_def["name"] not in taken:
                    merged.append(mcp_def)
        if cache_result:
            self.cached = merged
        return merged

    def invalidate(self) -> None:
        self.cached = None
