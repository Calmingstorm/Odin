"""Response delivery (RFC-001 Phase 6).

Verbatim moves from OdinBot: presence/status updates (with the active-task
counter + debounce), send-with-retry, and the code-fence-aware chunker with
its long-response file fallback and pending-file attachment. Pending files
live in the ChannelStateRegistry (same objects the bot aliases).

``change_presence`` is the bot's bound method (stable for the process
lifetime; gateway state resolves internally).
"""

from __future__ import annotations

import asyncio
import io
import time
from collections.abc import Callable

import discord

from ..odin_log import get_logger

log = get_logger("discord")

DISCORD_MAX_LEN = 2000
SEND_MAX_RETRIES = 3

# Presence text per tool (moved from the OdinBot class attr, RFC-002 P4) —
# consumed by the tool loop's per-tool status updates.
TOOL_STATUS_LABELS: dict[str, str] = {
    "run_command": "Running a command",
    "run_script": "Executing a script",
    "run_command_multi": "Commanding multiple hosts",
    "read_file": "Reading a file",
    "write_file": "Writing to disk",
    "generate_file": "Forging an artifact",
    "post_file": "Delivering a file",
    "claude_code": "Thinking expensively",
    "analyze_image": "Staring at a picture",
    "analyze_pdf": "Suffering through a PDF",
    "web_search": "Googling it like a mortal",
    "fetch_url": "Fetching a URL",
    "http_probe": "Checking a pulse",
    "browser_read_page": "Reading a webpage",
    "browser_screenshot": "Screenshotting a page",
    "browser_read_table": "Parsing a table",
    "browser_click": "Clicking things",
    "browser_fill": "Filling out a form",
    "browser_evaluate": "Running browser JS",
    "docker_ops": "Wrangling containers",
    "kubectl": "Talking to Kubernetes",
    "terraform_ops": "Terraforming",
    "git_ops": "Doing git things",
    "manage_process": "Babysitting a process",
    "validate_action": "Checking if it's still alive",
    "schedule_task": "Scheduling a future problem",
    "list_schedules": "Reviewing pending regrets",
    "update_schedule": "Adjusting the timeline",
    "delete_schedule": "Cancelling a fate",
    "start_loop": "Starting a watch",
    "stop_loop": "Ending a watch",
    "list_loops": "Checking active watches",
    "parse_time": "Deciphering mortal time",
    "spawn_agent": "Delegating the suffering",
    "wait_for_agents": "Waiting on subordinates",
    "get_agent_results": "Collecting the findings",
    "list_agents": "Checking on the crew",
    "kill_agent": "Terminating a subordinate",
    "delegate_task": "Handing off work",
    "list_tasks": "Reviewing the queue",
    "cancel_task": "Killing a task",
    "send_to_agent": "Messaging a subordinate",
    "spawn_loop_agents": "Deploying a patrol",
    "collect_loop_agents": "Recalling the patrol",
    "memory_manage": "Remembering, reluctantly",
    "search_audit": "Reviewing the audit log",
    "search_history": "Digging through history",
    "search_knowledge": "Consulting the knowledge base",
    "ingest_document": "Ingesting a document",
    "bulk_ingest_knowledge": "Bulk ingesting documents",
    "list_knowledge": "Listing known documents",
    "delete_knowledge": "Forgetting on purpose",
    "create_skill": "Teaching myself a new trick",
    "edit_skill": "Refining a skill",
    "delete_skill": "Unlearning",
    "list_skills": "Listing skills",
    "enable_skill": "Enabling a skill",
    "disable_skill": "Shelving a skill",
    "invoke_skill": "Running a skill",
    "install_skill": "Installing a skill",
    "export_skill": "Exporting a skill",
    "skill_status": "Checking a skill",
    "read_channel": "Reading the channel",
    "add_reaction": "Reacting",
    "create_poll": "Creating a poll",
    "purge_messages": "Purging messages",
    "generate_image": "Bothering the GPU",
    "manage_list": "Managing a list",
    "set_permission": "Adjusting permissions",
    "issue_tracker": "Filing paperwork",
}


class ResponseDelivery:
    STATUS_DEBOUNCE: float = 5.0

    def __init__(self, *, channel_state, change_presence: Callable) -> None:
        self.channel_state = channel_state
        self.change_presence = change_presence
        self.active_tasks: int = 0
        self.last_status_update: float = 0.0

    async def set_status(
        self, text: str | None = None, task_start: bool = False, task_end: bool = False
    ) -> None:
        """Set Discord presence. Tracks active task count to avoid clearing while work remains."""
        if task_start:
            self.active_tasks += 1
        if task_end:
            self.active_tasks = max(0, self.active_tasks - 1)
        now = time.monotonic()
        is_finish = task_end and self.active_tasks == 0
        if not is_finish and now - self.last_status_update < self.STATUS_DEBOUNCE:
            return
        try:
            if self.active_tasks > 0 and text:
                activity = discord.Activity(type=discord.ActivityType.watching, name=text)
                await self.change_presence(activity=activity, status=discord.Status.online)
            elif self.active_tasks == 0:
                await self.change_presence(activity=None, status=discord.Status.online)
            self.last_status_update = now
        except Exception:
            log.debug("Presence update failed (non-fatal)", exc_info=True)

    async def send_with_retry(
        self,
        message,
        text: str,
        as_reply: bool = True,
        files: list[discord.File] | None = None,
    ) -> discord.Message | None:
        """Send a message with retry on failure. Optionally attach files."""
        for attempt in range(SEND_MAX_RETRIES):
            try:
                log.info(
                    "Sending message (attempt %d, reply=%s): %r", attempt + 1, as_reply, text[:100]
                )
                kwargs: dict = {}
                if files:
                    kwargs["files"] = files
                if as_reply:
                    sent = await message.reply(text, **kwargs)
                else:
                    sent = await message.channel.send(text, **kwargs)
                log.info("Message sent successfully: msg_id=%s", sent.id if sent else "None")
                return sent
            except (discord.HTTPException, ConnectionError, OSError) as e:
                if attempt < SEND_MAX_RETRIES - 1:
                    log.warning("Discord send failed (attempt %d): %s", attempt + 1, e)
                    await asyncio.sleep(1 + attempt)
                else:
                    log.error("Discord send failed after %d retries: %s", SEND_MAX_RETRIES, e)
        return None

    async def send_chunked(self, message, text: str) -> None:
        """Send a response, splitting into chunks if it exceeds Discord's limit.
        If the response is very long, send as a file attachment instead.
        Attaches any pending skill files to the first message."""
        # Collect pending file attachments from skills (per-channel)
        pending = self.channel_state.pending_files.pop(str(message.channel.id), [])

        discord_files = [
            discord.File(io.BytesIO(data), filename=fname) for data, fname in pending
        ]

        # A deliberately-silent turn (work done, nothing to add) delivers
        # nothing — Discord rejects empty content, and fabricating filler to
        # satisfy the API would be worse. Files still go out: an attachment
        # with no commentary is a complete reply.
        if not text.strip():
            if discord_files:
                await self.send_with_retry(message, "", files=discord_files)
            else:
                log.debug("Empty response with no files — nothing to send")
            return

        # If the response is extremely long, send as file
        if len(text) > DISCORD_MAX_LEN * 4:
            text_file = discord.File(
                io.BytesIO(text.encode("utf-8")),
                filename="response.md",
            )
            discord_files.append(text_file)
            await self.send_with_retry(
                message, "Response too long for chat, attached as file:", files=discord_files
            )
            return

        if len(text) <= DISCORD_MAX_LEN:
            if discord_files:
                await self.send_with_retry(message, text, files=discord_files)
            else:
                await self.send_with_retry(message, text)
            return

        chunks: list[str] = []
        current = ""
        in_code_block = False
        code_block_lang = ""

        # Pre-split any lines longer than the chunk limit so the chunker
        # never encounters a single line that can't fit in one chunk.
        max_line_len = DISCORD_MAX_LEN - 20
        lines: list[str] = []
        for raw_line in text.split("\n"):
            while len(raw_line) > max_line_len:
                lines.append(raw_line[:max_line_len])
                raw_line = raw_line[max_line_len:]
            lines.append(raw_line)

        for line in lines:
            # Track code block state (toggle on ``` lines)
            if line.startswith("```"):
                if in_code_block:
                    in_code_block = False
                    code_block_lang = ""
                else:
                    in_code_block = True
                    code_block_lang = line[3:].strip()

            if len(current) + len(line) + 1 > DISCORD_MAX_LEN - 10:
                if in_code_block:
                    current += "\n```"
                if current.strip():
                    chunks.append(current)
                current = ""
                if in_code_block:
                    current = f"```{code_block_lang}\n"
            current += line + "\n"

        if current.strip():
            chunks.append(current)

        for i, chunk in enumerate(chunks):
            if i == 0 and discord_files:
                await self.send_with_retry(message, chunk, files=discord_files)
            elif i == 0:
                await self.send_with_retry(message, chunk)
            else:
                await self.send_with_retry(message, chunk, as_reply=False)
