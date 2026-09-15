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
import os
import time
from collections.abc import Callable

import discord

from ..odin_log import get_logger

log = get_logger("discord")

DISCORD_MAX_LEN = 2000
SEND_MAX_RETRIES = 3
# Discord's documented "Unknown Message" API error. A reply to a deleted
# source message reaches this as an invalid message-reference response.
_UNKNOWN_MESSAGE_CODE = 10008
_INVALID_FORM_BODY_CODE = 50035


def _is_confirmed_invalid_reply_reference(error: discord.HTTPException) -> bool:
    """Whether Discord positively identified this reply's source as gone.

    Discord can return either top-level ``Unknown Message`` or an ``Invalid
    Form Body`` whose structured ``message_reference`` validation error says
    ``UNKNOWN_MESSAGE``. Do not infer this from free-form error text: a 50035
    about any other field is not proof that a plain send is safe.
    """
    if error.code == _UNKNOWN_MESSAGE_CODE:
        return True
    if error.code != _INVALID_FORM_BODY_CODE:
        return False

    def contains_unknown_message(node: object) -> bool:
        if isinstance(node, dict):
            errors = node.get("_errors")
            if isinstance(errors, list) and any(
                isinstance(item, dict) and item.get("code") == "UNKNOWN_MESSAGE" for item in errors
            ):
                return True
            return any(contains_unknown_message(value) for value in node.values())
        if isinstance(node, list):
            return any(contains_unknown_message(value) for value in node)
        return False

    errors = getattr(error, "_errors", None)
    return isinstance(errors, dict) and contains_unknown_message(errors.get("message_reference"))


def _prepare_owned_file_fallbacks(
    files: list[discord.File] | None,
) -> list[tuple[discord.File, int] | None] | None:
    """Prepare independent attachment streams before attempting a reply.

    discord.py consumes and closes the supplied streams even when a reply is
    rejected.  Duplicating the already-open descriptor preserves the exact
    file object selected by the caller, rather than reopening a pathname that
    may now name something else.  The duplicate shares its offset until the
    reply finishes; the saved position is restored only for the plain-send
    fallback.
    """
    if not files:
        return []

    fallbacks: list[tuple[discord.File, int] | None] = []
    try:
        for file in files:
            original_pos = file.fp.tell()
            try:
                duplicate: io.BufferedIOBase = io.BufferedReader(
                    io.FileIO(os.dup(file.fp.fileno()), mode="rb", closefd=True)
                )
            except (AttributeError, OSError, ValueError):
                # BytesIO has no descriptor, but its immutable buffer can be
                # safely copied without borrowing or closing the caller's IO.
                if not isinstance(file.fp, io.BytesIO):
                    raise OSError("Discord file has no safe fallback stream")
                duplicate = io.BytesIO(file.fp.getvalue())
            fallbacks.append(
                (
                    discord.File(
                        duplicate,
                        filename=file.filename,
                        spoiler=file.spoiler,
                        description=file.description,
                    ),
                    original_pos,
                )
            )
    except (OSError, ValueError):
        for fallback in fallbacks:
            if fallback is not None:
                _close_generated_fallback_file(fallback[0])
        return None
    return fallbacks


def _fallback_files_after_reply_failure(
    files: list[discord.File] | None,
    prepared: list[tuple[discord.File, int] | None] | None,
) -> list[discord.File] | None:
    """Build exactly one safe attachment set for the plain-send fallback."""
    if not files:
        return []
    if prepared is None:
        return None

    fallback_files: list[discord.File] = []
    try:
        for replacement in prepared:
            if replacement is not None:
                replacement_file, original_pos = replacement
                replacement_file.fp.seek(original_pos)
                fallback_files.append(replacement_file)
    except (OSError, ValueError):
        _close_unused_fallback_files(prepared)
        return None
    return fallback_files


def _close_unused_fallback_files(files: list[tuple[discord.File, int] | None] | None) -> None:
    """Close prepared streams when the fallback was never needed."""
    for file in files or []:
        if file is not None:
            _close_generated_fallback_file(file[0])


def _close_generated_fallback_file(file: discord.File) -> None:
    """Close a wrapper and its duplicate stream, regardless of File ownership."""
    file.close()
    if not file.fp.closed:
        file.fp.close()


# Presence text per tool (moved from the OdinBot class attr, RFC-002 P4) —
# consumed by the tool loop's per-tool status updates.
TOOL_STATUS_LABELS: dict[str, str] = {
    "run_command": "Running a command",
    "run_script": "Executing a script",
    "run_command_multi": "Commanding multiple hosts",
    "read_file": "Reading a file",
    "apply_patch": "Applying a patch",
    "generate_file": "Forging an artifact",
    "post_file": "Delivering a file",
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
        """Send with bounded retries and a narrow deleted-reply fallback.

        Transport failures are not retried: Discord may have accepted the
        send before the connection failed, so retrying could duplicate it.
        """
        prepared_fallbacks = _prepare_owned_file_fallbacks(files) if as_reply else None
        fallback_files: list[discord.File] | None = None
        try:
            for attempt in range(SEND_MAX_RETRIES):
                try:
                    log.info(
                        "Sending message (attempt %d, reply=%s): %r",
                        attempt + 1,
                        as_reply,
                        text[:100],
                    )
                    kwargs: dict = {"files": files} if files else {}
                    if as_reply:
                        sent = await message.reply(text, **kwargs)
                    else:
                        sent = await message.channel.send(text, **kwargs)
                    log.info("Message sent successfully: msg_id=%s", sent.id if sent else "None")
                    return sent
                except discord.HTTPException as error:
                    if as_reply and _is_confirmed_invalid_reply_reference(error):
                        fallback_files = _fallback_files_after_reply_failure(
                            files, prepared_fallbacks
                        )
                        prepared_fallbacks = None
                        if fallback_files is None:
                            log.error(
                                "Reply target is gone, but attachments cannot be safely replayed; "
                                "not sending an incomplete fallback"
                            )
                            return None
                        log.info("Reply target is gone; sending one plain channel message")
                        try:
                            kwargs = {"files": fallback_files} if fallback_files else {}
                            sent = await message.channel.send(text, **kwargs)
                        except discord.HTTPException as fallback_error:
                            log.error(
                                "Plain-send fallback after invalid reply reference failed: %s",
                                fallback_error,
                            )
                            return None
                        except (ConnectionError, OSError) as fallback_error:
                            log.error(
                                "Plain-send fallback outcome is unknown; not retrying: %s",
                                fallback_error,
                            )
                            return None
                        log.info(
                            "Plain channel message sent: msg_id=%s", sent.id if sent else "None"
                        )
                        return sent
                    if attempt < SEND_MAX_RETRIES - 1:
                        log.warning("Discord send failed (attempt %d): %s", attempt + 1, error)
                        await asyncio.sleep(1 + attempt)
                    else:
                        log.error(
                            "Discord send failed after %d retries: %s", SEND_MAX_RETRIES, error
                        )
                except (ConnectionError, OSError) as error:
                    log.error("Discord send outcome is unknown; not retrying: %s", error)
                    return None
            return None
        finally:
            _close_unused_fallback_files(prepared_fallbacks)
            for fallback_file in fallback_files or []:
                _close_generated_fallback_file(fallback_file)

    async def send_chunked(self, message, text: str) -> None:
        """Send a response, splitting into chunks if it exceeds Discord's limit.
        If the response is very long, send as a file attachment instead.
        Attaches any pending skill files to the first message."""
        # Collect pending file attachments from skills (per-channel)
        pending = self.channel_state.pending_files.pop(str(message.channel.id), [])

        discord_files = [discord.File(io.BytesIO(data), filename=fname) for data, fname in pending]

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
