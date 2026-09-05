"""The single Discord-native tool dispatch table (RFC-001 Phase 5a).

Replaces BOTH hand-synced if/elif chains (the chat loop's inline dispatch
and ``_dispatch_loop_tool_inner``) with one registry, so a dispatch or
safety fix can never again be applied to one pipeline and forgotten in the
other.

Phase 5a scope (per the RFC's declared escape hatch, restructured — see
RFC revision log R3): the TABLE and the swap land here; handler BODIES
remain OdinBot methods registered into the table. Phase 5b moves the
bodies into domain modules without touching dispatch again.

Behavioral contract (pinned by the P0 characterization suite):
- RBAC checks stay in the CALLERS, exactly where they were (chat's
  ``_run_tool`` prologue; ``_dispatch_loop_tool_inner``'s prologue;
  the scheduled path's structured pre-check). The dispatcher does not
  re-check.
- Skill-CRUD tools centrally invalidate the tool catalog + skills-text
  cache here and report ``effects.rebuild_system_prompt=True``; each
  caller decides how to rebuild (the chat loop rebuilds inline via the
  bot; the autonomous loop keeps its own rebuild policy until P8).
- Skill file delivery differs by pipeline and is a dispatch-time policy:
  ``skill_file_delivery="send"`` posts files to the channel immediately
  (chat behavior); ``"stage"`` appends to the per-channel pending-files
  queue (autonomous-loop behavior). ``export_skill`` always stages, in
  both pipelines — that matches the old code.
- Executor-routed tools (run_command etc.) are NOT handled here —
  ``handles()`` returns False and each caller keeps its own executor
  branch (chat needs the structured ToolResult; the loop wraps it).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Literal

from ...odin_log import get_logger
from .skills_tools import (  # noqa: F401 — re-export (P0 pins import SKILL_CRUD_TOOLS from here)
    SKILL_CRUD_TOOLS,
    SkillTools,
)

log = get_logger("discord")

# How each handler is invoked. The shapes mirror the exact call forms the
# two old chains used — do not "simplify" a shape without checking both.
Shape = Literal[
    "msg_input", "input", "none", "msg_only", "author_input", "user_input", "scoped_input"
]


@dataclass
class NativeToolEffects:
    """Side-channel results of a dispatch the caller must act on."""

    rebuild_system_prompt: bool = False


class NativeToolDispatcher:
    def __init__(
        self,
        *,
        owners: dict[str, object],
        skill_manager,
        tool_catalog,
        prompt_builder,
        channel_state,
        builtin_policy=None,
    ) -> None:
        # Handlers are stored as (OWNER KEY, ATTRIBUTE NAME) and resolved
        # against the owner object at dispatch time (RFC-002 P5). Late
        # binding on the OWNER preserves the patch seam at the domain level
        # (tests patch e.g. ``bot.media_tools._handle_analyze_image``) —
        # exactly the discipline the old bot-attr resolution provided, one
        # level down. The owners dict is mutable on purpose: wiring attaches
        # the agents domain after the tool loop exists (documented there).
        self.owners = owners
        self.skill_manager = skill_manager
        self.tool_catalog = tool_catalog
        self.prompt_builder = prompt_builder
        self.channel_state = channel_state
        # Operator tool policy (config-gated built-ins); None = ungated.
        self.builtin_policy = builtin_policy
        # RFC-004 P3: skill dispatch lives in its own domain owner, built on
        # the SAME objects (shared references — monkeypatching e.g.
        # ``dispatcher.skill_manager.has_skill`` reaches both).
        self.skills = SkillTools(
            skill_manager=skill_manager,
            tool_catalog=tool_catalog,
            prompt_builder=prompt_builder,
            channel_state=channel_state,
        )
        self._handlers: dict[str, tuple[str, str, Shape]] = {}

    # -- registration ---------------------------------------------------------

    def register(self, name: str, owner_key: str, handler_attr: str, shape: Shape) -> None:
        assert name not in self._handlers, f"duplicate native tool: {name}"
        assert owner_key in self.owners, f"unknown owner {owner_key!r} for {name}"
        assert callable(getattr(self.owners[owner_key], handler_attr)), handler_attr
        self._handlers[name] = (owner_key, handler_attr, shape)

    def handles(self, tool_name: str) -> bool:
        """Native table + skill-domain tools (skill CRUD/meta + user skills)."""
        if tool_name in self._handlers:
            return True
        return self.skills.handles(tool_name)

    # -- dispatch ---------------------------------------------------------------

    async def dispatch(
        self,
        tool_name: str,
        tool_input: dict,
        *,
        message,
        user_id: str,
        skill_file_delivery: Literal["send", "stage"],
    ) -> tuple[Any, NativeToolEffects]:
        effects = NativeToolEffects()

        # Operator-disabled built-in: typed rejection BEFORE any handler —
        # covers requests assembled before a live disable landed.
        if self.builtin_policy is not None and self.builtin_policy.is_disabled(tool_name):
            from ...tools.builtin_policy import disabled_rejection

            return disabled_rejection(tool_name), effects

        # --- registered native handlers ---
        entry = self._handlers.get(tool_name)
        if entry is not None:
            owner_key, handler_attr, shape = entry
            handler = getattr(self.owners[owner_key], handler_attr)
            if shape == "msg_input":
                result = handler(message, tool_input)
            elif shape == "input":
                result = handler(tool_input)
            elif shape == "none":
                result = handler()
            elif shape == "msg_only":
                result = handler(message)
            elif shape == "author_input":
                result = handler(tool_input, str(message.author))
            elif shape == "user_input":
                result = handler(user_id, tool_input)
            elif shape == "scoped_input":
                result = handler(tool_input, user_id=user_id, channel_id=str(message.channel.id))
            else:  # pragma: no cover — registration-time invariant
                raise RuntimeError(f"unknown shape {shape!r} for {tool_name}")
            if asyncio.iscoroutine(result):
                result = await result
            return result, effects

        # --- skill domain (CRUD/meta/invoke/dynamic — RFC-004 P3) ---
        # ``effects`` is passed in so skills_tools never imports this module.
        # Raises KeyError for non-native names (callers gate on handles()).
        return await self.skills.dispatch(
            tool_name,
            tool_input,
            message=message,
            user_id=user_id,
            skill_file_delivery=skill_file_delivery,
            effects=effects,
        )


def register_native_handlers(dispatcher: NativeToolDispatcher) -> None:
    """Build the dispatch table: tool name -> (owner key, attr, shape).

    Handlers resolve late against the domain owner objects (RFC-002 P5) —
    the same table both pipelines share since P5a. Shapes mirror the exact
    call forms of the two replaced chains. Call this AFTER every owner in
    the table is present in dispatcher.owners (registration asserts it).
    """
    d = dispatcher
    # message + input
    d.register("purge_messages", "channel_ops", "_handle_purge", "msg_input")
    d.register("browser_screenshot", "media", "_handle_browser_screenshot", "msg_input")
    d.register("generate_file", "media", "_handle_generate_file", "msg_input")
    d.register("post_file", "media", "_handle_post_file", "msg_input")
    d.register("schedule_task", "scheduling", "_handle_schedule_task", "msg_input")
    d.register("delegate_task", "agents", "_handle_delegate_task", "msg_input")
    d.register("start_loop", "agents", "_handle_start_loop", "msg_input")
    d.register("read_channel", "channel_ops", "_handle_read_channel", "msg_input")
    d.register("add_reaction", "channel_ops", "_handle_add_reaction", "msg_input")
    d.register("create_poll", "channel_ops", "_handle_create_poll", "msg_input")
    d.register("analyze_image", "media", "_handle_analyze_image", "msg_input")
    d.register("generate_image", "media", "_handle_generate_image", "msg_input")
    d.register("spawn_agent", "agents", "_handle_spawn_agent", "msg_input")
    d.register("spawn_loop_agents", "agents", "_handle_spawn_loop_agents", "msg_input")
    # input-only
    d.register("update_schedule", "scheduling", "_handle_update_schedule", "input")
    d.register("delete_schedule", "scheduling", "_handle_delete_schedule", "input")
    d.register("parse_time", "scheduling", "_handle_parse_time", "input")
    d.register("search_history", "knowledge", "_handle_search_history", "input")
    d.register("list_tasks", "agents", "_handle_list_tasks", "scoped_input")
    d.register("cancel_task", "agents", "_handle_cancel_task", "input")
    d.register("stop_loop", "agents", "_handle_stop_loop", "input")
    d.register("search_knowledge", "knowledge", "_handle_search_knowledge", "input")
    d.register("delete_knowledge", "knowledge", "_handle_delete_knowledge", "input")
    d.register("search_audit", "knowledge", "_handle_search_audit", "input")
    d.register("send_to_agent", "agents", "_handle_send_to_agent", "input")
    d.register("kill_agent", "agents", "_handle_kill_agent", "input")
    d.register("get_agent_results", "agents", "_handle_get_agent_results", "scoped_input")
    d.register("wait_for_agents", "agents", "_handle_wait_for_agents", "scoped_input")
    d.register("collect_loop_agents", "agents", "_handle_collect_loop_agents", "input")
    # no-arg
    d.register("list_schedules", "scheduling", "_handle_list_schedules", "none")
    d.register("list_loops", "agents", "_handle_list_loops", "none")
    d.register("list_knowledge", "knowledge", "_handle_list_knowledge", "none")
    # special shapes
    d.register("list_agents", "agents", "_handle_list_agents", "msg_only")
    d.register("ingest_document", "knowledge", "_handle_ingest_document", "author_input")
    d.register("bulk_ingest_knowledge", "knowledge", "_handle_bulk_ingest", "author_input")
    d.register("set_permission", "channel_ops", "_handle_set_permission", "user_input")
