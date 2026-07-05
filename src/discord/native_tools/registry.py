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
import io
from dataclasses import dataclass
from typing import Any, Literal

import discord

from ...odin_log import get_logger
from ..response_guards import scrub_response_secrets

log = get_logger("discord")

# How each handler is invoked. The shapes mirror the exact call forms the
# two old chains used — do not "simplify" a shape without checking both.
Shape = Literal["msg_input", "input", "none", "msg_only", "author_input", "user_input"]


@dataclass
class NativeToolEffects:
    """Side-channel results of a dispatch the caller must act on."""

    rebuild_system_prompt: bool = False


# Skill-CRUD tool names — these invalidate the tool catalog + skills text
# and require a system-prompt rebuild (the model must see the new tool).
SKILL_CRUD_TOOLS = frozenset(
    {"create_skill", "edit_skill", "delete_skill", "enable_skill", "disable_skill", "install_skill"}
)


class NativeToolDispatcher:
    def __init__(
        self,
        *,
        handler_host,
        skill_manager,
        tool_catalog,
        prompt_builder,
        channel_state,
        invoke_skill_missing_required,
    ) -> None:
        # Handlers are stored as ATTRIBUTE NAMES and resolved against
        # handler_host at dispatch time (late binding) — exactly how the old
        # inline chains looked up self._handle_X per call. This keeps the
        # test seam (patching bot._handle_X) and lets P5b swap the host for
        # domain classes without touching dispatch.
        self.handler_host = handler_host
        self.skill_manager = skill_manager
        self.tool_catalog = tool_catalog
        self.prompt_builder = prompt_builder
        self.channel_state = channel_state
        # Bot helper (moves into the skills domain module in P5b)
        self._invoke_skill_missing_required = invoke_skill_missing_required
        self._handlers: dict[str, tuple[str, Shape]] = {}

    # -- registration ---------------------------------------------------------

    def register(self, name: str, handler_attr: str, shape: Shape) -> None:
        assert name not in self._handlers, f"duplicate native tool: {name}"
        assert callable(getattr(self.handler_host, handler_attr)), handler_attr
        self._handlers[name] = (handler_attr, shape)

    def handles(self, tool_name: str) -> bool:
        """Native table + skill-manager tools (skill CRUD/meta + user skills)."""
        if tool_name in self._handlers or tool_name in SKILL_CRUD_TOOLS:
            return True
        if tool_name in ("export_skill", "skill_status", "list_skills", "invoke_skill"):
            return True
        return self.skill_manager.has_skill(tool_name)

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

        # --- registered native handlers ---
        entry = self._handlers.get(tool_name)
        if entry is not None:
            handler_attr, shape = entry
            handler = getattr(self.handler_host, handler_attr)
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
            else:  # pragma: no cover — registration-time invariant
                raise RuntimeError(f"unknown shape {shape!r} for {tool_name}")
            if asyncio.iscoroutine(result):
                result = await result
            return result, effects

        # --- skill CRUD (centralized invalidation + rebuild signal) ---
        if tool_name in SKILL_CRUD_TOOLS:
            if tool_name == "create_skill":
                result = await asyncio.to_thread(
                    self.skill_manager.create_skill, tool_input["name"], tool_input["code"]
                )
            elif tool_name == "edit_skill":
                result = await asyncio.to_thread(
                    self.skill_manager.edit_skill, tool_input["name"], tool_input["code"]
                )
            elif tool_name == "delete_skill":
                result = await asyncio.to_thread(
                    self.skill_manager.delete_skill, tool_input["name"]
                )
            elif tool_name == "enable_skill":
                result = self.skill_manager.enable_skill(tool_input["name"])
            elif tool_name == "disable_skill":
                result = self.skill_manager.disable_skill(tool_input["name"])
            else:  # install_skill
                result = await self.skill_manager.install_from_url(tool_input["url"])
            self.tool_catalog.invalidate()
            self.prompt_builder.cached_skills_text = None
            effects.rebuild_system_prompt = True
            return result, effects

        # --- skill meta ---
        if tool_name == "export_skill":
            export_result = self.skill_manager.export_skill(tool_input["name"])
            if isinstance(export_result, str):
                return export_result, effects
            file_bytes, filename = export_result
            channel_id_key = str(getattr(message.channel, "id", ""))
            self.channel_state.pending_files.setdefault(channel_id_key, []).append(
                (file_bytes, filename)
            )
            return f"Skill '{tool_input['name']}' exported as {filename}.", effects

        if tool_name == "skill_status":
            return self.skill_manager.skill_status(tool_input["name"]), effects

        if tool_name == "list_skills":
            skills = self.skill_manager.list_skills()
            if not skills:
                return "No user-created skills.", effects
            lines = [f"**{s['name']}**: {s['description']}" for s in skills]
            return f"**User-created skills ({len(skills)}):**\n" + "\n".join(lines), effects

        if tool_name == "invoke_skill":
            target_name = tool_input.get("name")
            if not target_name:
                return "Error: invoke_skill requires 'name'.", effects
            if not self.skill_manager.has_skill(target_name):
                return (
                    f"Error: skill '{target_name}' not found or disabled. "
                    "Use list_skills to see available skills.",
                    effects,
                )
            skill_input = tool_input.get("input") or {}
            if not isinstance(skill_input, dict):
                return "Error: invoke_skill 'input' must be an object.", effects
            missing = self._invoke_skill_missing_required(target_name, skill_input)
            if missing:
                return (
                    f"Error: invoke_skill for '{target_name}' is missing required fields: "
                    f"{missing}. Pass them via the 'input' object, e.g. "
                    f"invoke_skill(name='{target_name}', input={{...}}).",
                    effects,
                )
            result = await self.skill_manager.execute(
                target_name,
                skill_input,
                message_callback=self._skill_message_cb(message),
                file_callback=self._skill_file_cb(message, skill_file_delivery),
            )
            return result, effects

        # --- user-created skills (dynamic names) ---
        if self.skill_manager.has_skill(tool_name):
            result = await self.skill_manager.execute(
                tool_name,
                tool_input,
                message_callback=self._skill_message_cb(message),
                file_callback=self._skill_file_cb(message, skill_file_delivery),
            )
            return result, effects

        raise KeyError(f"not a native tool: {tool_name}")  # callers gate on handles()

    # -- skill callbacks ----------------------------------------------------------
    # These mirror the old inline closures exactly. scrub_response_secrets is
    # imported from response_guards, whose definition is byte-identical to
    # client.py's copy (verified at extraction).

    def _skill_message_cb(self, message):
        async def _skill_msg(text: str) -> None:
            await message.channel.send(scrub_response_secrets(text))

        return _skill_msg

    def _skill_file_cb(self, message, mode: Literal["send", "stage"]):
        if mode == "send":

            async def _skill_file_send(data: bytes, filename: str, caption: str = "") -> None:
                await message.channel.send(
                    content=caption or None,
                    file=discord.File(io.BytesIO(data), filename=filename),
                )

            return _skill_file_send

        async def _skill_file_stage(data: bytes, filename: str, caption: str = "") -> None:
            ch_id_key = str(getattr(message.channel, "id", ""))
            self.channel_state.pending_files.setdefault(ch_id_key, []).append((data, filename))

        return _skill_file_stage


def register_native_handlers(dispatcher: NativeToolDispatcher) -> None:
    """Build the dispatch table (Phase 5a): tool name -> (host attr, shape).

    Handlers resolve late against dispatcher.handler_host. Phase 5b moves
    the bodies to domain classes behind the same attribute names; this
    table is the stable artifact both pipelines share. Shapes mirror the
    exact call forms of the two replaced chains.
    """
    d = dispatcher
    # message + input
    d.register("purge_messages", "_handle_purge", "msg_input")
    d.register("browser_screenshot", "_handle_browser_screenshot", "msg_input")
    d.register("generate_file", "_handle_generate_file", "msg_input")
    d.register("post_file", "_handle_post_file", "msg_input")
    d.register("schedule_task", "_handle_schedule_task", "msg_input")
    d.register("delegate_task", "_handle_delegate_task", "msg_input")
    d.register("start_loop", "_handle_start_loop", "msg_input")
    d.register("read_channel", "_handle_read_channel", "msg_input")
    d.register("add_reaction", "_handle_add_reaction", "msg_input")
    d.register("create_poll", "_handle_create_poll", "msg_input")
    d.register("analyze_image", "_handle_analyze_image", "msg_input")
    d.register("generate_image", "_handle_generate_image", "msg_input")
    d.register("spawn_agent", "_handle_spawn_agent", "msg_input")
    d.register("spawn_loop_agents", "_handle_spawn_loop_agents", "msg_input")
    # input-only
    d.register("update_schedule", "_handle_update_schedule", "input")
    d.register("delete_schedule", "_handle_delete_schedule", "input")
    d.register("parse_time", "_handle_parse_time", "input")
    d.register("search_history", "_handle_search_history", "input")
    d.register("list_tasks", "_handle_list_tasks", "input")
    d.register("cancel_task", "_handle_cancel_task", "input")
    d.register("stop_loop", "_handle_stop_loop", "input")
    d.register("search_knowledge", "_handle_search_knowledge", "input")
    d.register("delete_knowledge", "_handle_delete_knowledge", "input")
    d.register("search_audit", "_handle_search_audit", "input")
    d.register("send_to_agent", "_handle_send_to_agent", "input")
    d.register("kill_agent", "_handle_kill_agent", "input")
    d.register("get_agent_results", "_handle_get_agent_results", "input")
    d.register("wait_for_agents", "_handle_wait_for_agents", "input")
    d.register("collect_loop_agents", "_handle_collect_loop_agents", "input")
    # no-arg
    d.register("list_schedules", "_handle_list_schedules", "none")
    d.register("list_loops", "_handle_list_loops", "none")
    d.register("list_knowledge", "_handle_list_knowledge", "none")
    # special shapes
    d.register("list_agents", "_handle_list_agents", "msg_only")
    d.register("ingest_document", "_handle_ingest_document", "author_input")
    d.register("bulk_ingest_knowledge", "_handle_bulk_ingest", "author_input")
    d.register("set_permission", "_handle_set_permission", "user_input")
