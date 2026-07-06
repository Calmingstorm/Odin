"""Skill-tool dispatch domain (RFC-004 P3).

Moved VERBATIM from ``registry.py``, where the skill CRUD/meta/invoke/
dynamic-skill dispatch lived as inline ``if/elif`` blocks inside
``NativeToolDispatcher.dispatch()`` — a hidden domain inside the
dispatch-table file. Behavior is pinned by
``tests/characterization/test_native_skill_dispatch_pins.py``:

- skill CRUD centrally invalidates the tool catalog + skills-text cache
  and reports ``effects.rebuild_system_prompt=True``
- ``invoke_skill`` fails loudly on missing name / unknown skill /
  non-dict input / missing required fields
- ``export_skill`` ALWAYS stages, in both pipelines
- file delivery: ``"send"`` posts to the channel now (chat), ``"stage"``
  appends to the per-channel pending-files queue (autonomous loop)
"""

from __future__ import annotations

import asyncio
import io
from typing import Any, Literal

import discord

from ...odin_log import get_logger
from ..response_guards import scrub_response_secrets

log = get_logger("discord")

# Skill-CRUD tool names — these invalidate the tool catalog + skills text
# and require a system-prompt rebuild (the model must see the new tool).
SKILL_CRUD_TOOLS = frozenset(
    {"create_skill", "edit_skill", "delete_skill", "enable_skill", "disable_skill", "install_skill"}
)


class SkillTools:
    """Owner for every skill-flavored native tool, incl. dynamic user skills."""

    def __init__(self, *, skill_manager, tool_catalog, prompt_builder, channel_state) -> None:
        self.skill_manager = skill_manager
        self.tool_catalog = tool_catalog
        self.prompt_builder = prompt_builder
        self.channel_state = channel_state

    def _invoke_skill_missing_required(self, name: str, payload: dict) -> list[str]:
        """Return required input fields the payload omits, or [] if complete.

        Used by invoke_skill to fail loudly when the LLM omits the input
        object — otherwise the skill silently runs with empty params and
        returns a degenerate result that looks like a tool bug. (Moved from
        the bot, RFC-002 P5 — it only ever read the skill manager.)
        """
        try:
            skill = self.skill_manager._skills.get(name)
            if skill is None:
                return []
            schema = skill.definition.get("input_schema") or {}
            required = schema.get("required") or []
            return [f for f in required if f not in payload]
        except Exception:
            return []

    def handles(self, tool_name: str) -> bool:
        """Skill CRUD/meta + dynamic user-created skill names."""
        if tool_name in SKILL_CRUD_TOOLS:
            return True
        if tool_name in ("export_skill", "skill_status", "list_skills", "invoke_skill"):
            return True
        return self.skill_manager.has_skill(tool_name)

    async def dispatch(
        self,
        tool_name: str,
        tool_input: dict,
        *,
        message,
        user_id: str,
        skill_file_delivery: Literal["send", "stage"],
        effects,
    ) -> tuple[Any, object]:
        """Dispatch a skill-flavored tool. ``effects`` is the caller-owned
        NativeToolEffects instance (constructed in registry.dispatch) —
        passed in rather than imported to keep the module dependency
        one-directional."""
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
