"""Generic structured Discord reports for scheduled checks.

A scheduled check owns command execution. A registered renderer owns validation
and presentation. :class:`ScheduledReportPaginationService` owns only durable,
message-local pagination state and redraws; reaction refresh never executes the
producer again.
"""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import quote, urlsplit

import discord

from ..odin_log import get_logger
from .response_guards import scrub_response_secrets

log = get_logger("discord")

PAGINATED_EMBED_V1 = "paginated_embed_v1"
REPORT_REACTIONS = ("⬅️", "➡️", "🔄")
LEFT_REACTIONS = frozenset({"⬅", "⬅️", "◀", "◀️"})
RIGHT_REACTIONS = frozenset({"➡", "➡️", "▶", "▶️"})
REFRESH_REACTIONS = frozenset({"🔄"})
CONTROL_REACTIONS = LEFT_REACTIONS | RIGHT_REACTIONS | REFRESH_REACTIONS

MAX_PAGES = 10
MAX_FIELDS_PER_PAGE = 25
MAX_TITLE_CHARS = 256
MAX_DESCRIPTION_CHARS = 4096
MAX_FIELD_NAME_CHARS = 256
MAX_FIELD_VALUE_CHARS = 1024
MAX_FOOTER_INPUT_CHARS = 1984
MAX_FOOTER_CHARS = 2048
MAX_LINKS = 10
MAX_LINK_LABEL_CHARS = 100
MAX_LINK_URL_CHARS = 512
MAX_EMBED_CHARS = 6000
MAX_REPORT_AGE_SECONDS = 26 * 60 * 60

_PAGE_KEYS = frozenset({"title", "description", "fields", "footer", "links"})
_FIELD_KEYS = frozenset({"name", "value", "inline"})
_LINK_KEYS = frozenset({"label", "url"})
_ROOT_KEYS = frozenset({"format", "pages"})
_EMPTY_PROJECTION = {
    "format": PAGINATED_EMBED_V1,
    "pages": [
        {
            "title": "Scheduled report",
            "description": "No report data.",
            "fields": [],
            "footer": "",
            "links": [],
        }
    ],
}


class ScheduledReportRenderer(Protocol):
    """A versioned renderer that returns a persistence-safe projection."""

    format_name: str

    def project(self, payload: Any) -> dict[str, Any]: ...

    def render_page(self, projection: Mapping[str, Any], page: int) -> discord.Embed: ...

    def validate_projection(self, projection: Any) -> dict[str, Any]: ...


class ScheduledReportRendererRegistry:
    """Format-to-renderer dispatch with no schedule-domain knowledge."""

    def __init__(self) -> None:
        self._renderers: dict[str, ScheduledReportRenderer] = {}

    def register(self, renderer: ScheduledReportRenderer) -> None:
        name = renderer.format_name
        if not name or name in self._renderers:
            raise ValueError(f"Scheduled report renderer already registered: {name!r}")
        self._renderers[name] = renderer

    @property
    def formats(self) -> tuple[str, ...]:
        return tuple(self._renderers)

    def renderer(self, report_format: str) -> ScheduledReportRenderer:
        try:
            return self._renderers[report_format]
        except KeyError as exc:
            raise ValueError(f"Unsupported scheduled report format: {report_format}") from exc

    def project(self, report_format: str, raw_output: str) -> dict[str, Any]:
        """Parse producer JSON before any string-level secret scrubbing."""
        try:
            payload = json.loads(raw_output)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Scheduled report did not return valid JSON: {exc.msg}") from exc
        return self.renderer(report_format).project(payload)

    def validate_projection(self, report_format: str, projection: Any) -> dict[str, Any]:
        return self.renderer(report_format).validate_projection(projection)

    def render_page(
        self, report_format: str, projection: Mapping[str, Any], page: int
    ) -> discord.Embed:
        return self.renderer(report_format).render_page(projection, page)


def _reject_extra_keys(value: Mapping[str, Any], allowed: frozenset[str], context: str) -> None:
    extras = set(value) - allowed
    if extras:
        raise ValueError(f"{context} contains unknown keys: {', '.join(sorted(extras))}")


def _rendered_text(
    value: Any,
    *,
    context: str,
    limit: int,
    required: bool = False,
) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{context} must be a string")
    rendered = value.strip()
    if required and not rendered:
        raise ValueError(f"{context} must be a non-empty string")
    # Scrub only the individual strings that can reach Discord. JSON structure
    # has already been parsed, so redaction cannot damage syntax or types.
    rendered = scrub_response_secrets(rendered)
    if any((ord(char) < 32 and char not in {"\n", "\t"}) or ord(char) == 127 for char in rendered):
        raise ValueError(f"{context} contains control characters")
    rendered = discord.utils.escape_mentions(rendered)
    rendered = discord.utils.escape_markdown(rendered)
    # Discord Markdown still recognizes URL syntax after escape_markdown;
    # neutralize delimiters so only the structured links array can create
    # clickable links.
    rendered = rendered.replace("[", r"\[").replace("]", r"\]")
    rendered = rendered.replace("(", r"\(").replace(")", r"\)")
    rendered = rendered.replace("<", r"\<").replace(">", r"\>")
    if len(rendered) > limit:
        raise ValueError(f"{context} exceeds {limit} characters after rendering")
    if required and not rendered:
        raise ValueError(f"{context} is empty after rendering")
    return rendered


def _safe_link_url(value: Any, *, context: str, scrub: bool = True) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{context} must be a string")
    url = value.strip()
    if scrub:
        url = scrub_response_secrets(url)
    if not url or len(url) > MAX_LINK_URL_CHARS:
        raise ValueError(f"{context} must contain 1-{MAX_LINK_URL_CHARS} characters")
    if any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in url):
        raise ValueError(f"{context} contains whitespace or control characters")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise ValueError(f"{context} is not a valid URL") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"{context} must be an absolute HTTP(S) URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError(f"{context} must not contain credentials")
    if port is not None and not 1 <= port <= 65535:
        raise ValueError(f"{context} has an invalid port")
    # Parentheses and angle brackets can break Discord's Markdown link target.
    # Keep RFC 3986 delimiters and percent-encode presentation delimiters.
    return quote(url, safe=":/?#[]@!$&'*+,;=%-._~")


def _embed_text_count(page: Mapping[str, Any], footer: str) -> int:
    total = len(page["title"]) + len(page["description"]) + len(footer)
    total += sum(len(field["name"]) + len(field["value"]) for field in page["fields"])
    if page["links"]:
        links_value = "\n".join(f"[{link['label']}]({link['url']})" for link in page["links"])
        total += len("Links") + len(links_value)
    return total


def _footer_text(page: Mapping[str, Any], page_number: int, page_count: int) -> str:
    navigation = f"Page {page_number + 1}/{page_count} · ← → navigate · ↻ redraw"
    footer = page["footer"]
    rendered = f"{footer} · {navigation}" if footer else navigation
    if len(rendered) > MAX_FOOTER_CHARS:
        raise ValueError(f"rendered footer exceeds {MAX_FOOTER_CHARS} characters")
    return rendered


class PaginatedEmbedV1Renderer:
    """Validate and render the public ``paginated_embed_v1`` contract."""

    format_name = PAGINATED_EMBED_V1

    def project(self, payload: Any) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("Scheduled report JSON must be an object")
        _reject_extra_keys(payload, _ROOT_KEYS, "report")
        if payload.get("format") != self.format_name:
            raise ValueError(f"report.format must be {self.format_name!r}")
        pages = payload.get("pages")
        if not isinstance(pages, list):
            raise ValueError("report.pages must be an array")
        if len(pages) > MAX_PAGES:
            raise ValueError(f"report.pages exceeds the {MAX_PAGES}-page limit")
        if not pages:
            return json.loads(json.dumps(_EMPTY_PROJECTION))

        projected_pages = [self._project_page(page, index) for index, page in enumerate(pages)]
        projection = {"format": self.format_name, "pages": projected_pages}
        return self.validate_projection(projection)

    def _project_page(self, page: Any, index: int) -> dict[str, Any]:
        context = f"report.pages[{index}]"
        if not isinstance(page, dict):
            raise ValueError(f"{context} must be an object")
        _reject_extra_keys(page, _PAGE_KEYS, context)
        if "title" not in page:
            raise ValueError(f"{context}.title is required")
        title = _rendered_text(
            page["title"],
            context=f"{context}.title",
            limit=MAX_TITLE_CHARS,
            required=True,
        )
        description = _rendered_text(
            page.get("description", ""),
            context=f"{context}.description",
            limit=MAX_DESCRIPTION_CHARS,
        )
        footer = _rendered_text(
            page.get("footer", ""),
            context=f"{context}.footer",
            limit=MAX_FOOTER_INPUT_CHARS,
        )

        fields_raw = page.get("fields", [])
        if not isinstance(fields_raw, list):
            raise ValueError(f"{context}.fields must be an array")
        fields: list[dict[str, Any]] = []
        for field_index, field in enumerate(fields_raw):
            field_context = f"{context}.fields[{field_index}]"
            if not isinstance(field, dict):
                raise ValueError(f"{field_context} must be an object")
            _reject_extra_keys(field, _FIELD_KEYS, field_context)
            if "name" not in field or "value" not in field:
                raise ValueError(f"{field_context} requires name and value")
            inline = field.get("inline", False)
            if not isinstance(inline, bool):
                raise ValueError(f"{field_context}.inline must be a boolean")
            fields.append(
                {
                    "name": _rendered_text(
                        field["name"],
                        context=f"{field_context}.name",
                        limit=MAX_FIELD_NAME_CHARS,
                        required=True,
                    ),
                    "value": _rendered_text(
                        field["value"],
                        context=f"{field_context}.value",
                        limit=MAX_FIELD_VALUE_CHARS,
                        required=True,
                    ),
                    "inline": inline,
                }
            )

        links_raw = page.get("links", [])
        if not isinstance(links_raw, list):
            raise ValueError(f"{context}.links must be an array")
        if len(links_raw) > MAX_LINKS:
            raise ValueError(f"{context}.links exceeds the {MAX_LINKS}-link limit")
        links: list[dict[str, str]] = []
        for link_index, link in enumerate(links_raw):
            link_context = f"{context}.links[{link_index}]"
            if not isinstance(link, dict):
                raise ValueError(f"{link_context} must be an object")
            _reject_extra_keys(link, _LINK_KEYS, link_context)
            if "label" not in link or "url" not in link:
                raise ValueError(f"{link_context} requires label and url")
            links.append(
                {
                    "label": _rendered_text(
                        link["label"],
                        context=f"{link_context}.label",
                        limit=MAX_LINK_LABEL_CHARS,
                        required=True,
                    ),
                    "url": _safe_link_url(link["url"], context=f"{link_context}.url"),
                }
            )

        if len(fields) + bool(links) > MAX_FIELDS_PER_PAGE:
            raise ValueError(
                f"{context} exceeds {MAX_FIELDS_PER_PAGE} rendered fields; links use one field"
            )
        return {
            "title": title,
            "description": description,
            "fields": fields,
            "footer": footer,
            "links": links,
        }

    def validate_projection(self, projection: Any) -> dict[str, Any]:
        """Validate persisted normalized data without escaping it a second time."""
        if not isinstance(projection, dict) or set(projection) != _ROOT_KEYS:
            raise ValueError("persisted report projection has an invalid root shape")
        if projection.get("format") != self.format_name:
            raise ValueError("persisted report projection has the wrong format")
        pages = projection.get("pages")
        if not isinstance(pages, list) or not 1 <= len(pages) <= MAX_PAGES:
            raise ValueError("persisted report projection has an invalid page count")
        for index, page in enumerate(pages):
            context = f"projection.pages[{index}]"
            if not isinstance(page, dict) or set(page) != _PAGE_KEYS:
                raise ValueError(f"{context} has an invalid shape")
            for key, limit, required in (
                ("title", MAX_TITLE_CHARS, True),
                ("description", MAX_DESCRIPTION_CHARS, False),
                ("footer", MAX_FOOTER_INPUT_CHARS, False),
            ):
                value = page[key]
                if not isinstance(value, str) or len(value) > limit or (required and not value):
                    raise ValueError(f"{context}.{key} is invalid")
            fields = page["fields"]
            links = page["links"]
            if not isinstance(fields, list) or not isinstance(links, list):
                raise ValueError(f"{context} fields and links must be arrays")
            if len(fields) + bool(links) > MAX_FIELDS_PER_PAGE or len(links) > MAX_LINKS:
                raise ValueError(f"{context} exceeds field or link limits")
            for field in fields:
                if not isinstance(field, dict) or set(field) != {"name", "value", "inline"}:
                    raise ValueError(f"{context} contains an invalid field")
                if (
                    not isinstance(field["name"], str)
                    or not field["name"]
                    or len(field["name"]) > MAX_FIELD_NAME_CHARS
                    or not isinstance(field["value"], str)
                    or not field["value"]
                    or len(field["value"]) > MAX_FIELD_VALUE_CHARS
                    or not isinstance(field["inline"], bool)
                ):
                    raise ValueError(f"{context} contains an invalid field value")
            for link in links:
                if not isinstance(link, dict) or set(link) != {"label", "url"}:
                    raise ValueError(f"{context} contains an invalid link")
                if (
                    not isinstance(link["label"], str)
                    or not link["label"]
                    or len(link["label"]) > MAX_LINK_LABEL_CHARS
                    or not isinstance(link["url"], str)
                    or len(link["url"]) > MAX_LINK_URL_CHARS
                ):
                    raise ValueError(f"{context} contains an invalid link value")
                if (
                    _safe_link_url(link["url"], context=f"{context}.link.url", scrub=False)
                    != link["url"]
                ):
                    raise ValueError(f"{context} contains a non-normalized link URL")
            links_value = "\n".join(f"[{link['label']}]({link['url']})" for link in links)
            if len(links_value) > MAX_FIELD_VALUE_CHARS:
                raise ValueError(f"{context}.links exceeds the rendered field-value limit")
            footer = _footer_text(page, index, len(pages))
            if _embed_text_count(page, footer) > MAX_EMBED_CHARS:
                raise ValueError(f"{context} exceeds the {MAX_EMBED_CHARS}-character embed limit")
        return projection

    def render_page(self, projection: Mapping[str, Any], page: int) -> discord.Embed:
        normalized = self.validate_projection(projection)
        pages = normalized["pages"]
        index = page % len(pages)
        data = pages[index]
        embed = discord.Embed(
            title=data["title"],
            description=data["description"] or None,
        )
        for field in data["fields"]:
            embed.add_field(name=field["name"], value=field["value"], inline=field["inline"])
        if data["links"]:
            embed.add_field(
                name="Links",
                value="\n".join(f"[{link['label']}]({link['url']})" for link in data["links"]),
                inline=False,
            )
        embed.set_footer(text=_footer_text(data, index, len(pages)))
        return embed


class ScheduledReportPaginationService:
    """Persist normalized projections and redraw report pages by reaction."""

    def __init__(
        self,
        *,
        registry: ScheduledReportRendererRegistry,
        data_path: Path,
        get_channel: Callable[[int], discord.abc.Messageable | None],
        max_reports: int = 100,
    ) -> None:
        if not data_path.is_absolute():
            raise ValueError("scheduled report state path must be absolute")
        self._registry = registry
        self._data_path = data_path
        self._get_channel = get_channel
        self._max_reports = max_reports
        self._reports: dict[int, dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self._load()

    @property
    def data_path(self) -> Path:
        return self._data_path

    def _load(self) -> None:
        if not self._data_path.exists():
            return
        try:
            records = json.loads(self._data_path.read_text())
            if not isinstance(records, list):
                raise ValueError("state root must be an array")
            now = datetime.now(UTC)
            loaded: dict[int, dict[str, Any]] = {}
            for record in records:
                if not isinstance(record, dict):
                    continue
                created = datetime.fromisoformat(str(record["created_at"]))
                if created.tzinfo is None:
                    created = created.replace(tzinfo=UTC)
                if (now - created).total_seconds() > MAX_REPORT_AGE_SECONDS:
                    continue
                message_id = int(record["message_id"])
                report_format = str(record["format"])
                projection = self._registry.validate_projection(report_format, record["projection"])
                loaded[message_id] = {
                    "channel_id": int(record["channel_id"]),
                    "format": report_format,
                    "projection": projection,
                    "page": int(record.get("page", 0)) % len(projection["pages"]),
                    "created_at": created,
                }
            self._reports = loaded
            self._prune_in_memory()
        except Exception as exc:
            log.warning("Could not load scheduled report state: %s", exc)
            self._reports = {}

    def _save(self) -> None:
        self._data_path.parent.mkdir(parents=True, exist_ok=True)
        records = [
            {
                "message_id": message_id,
                "channel_id": state["channel_id"],
                "format": state["format"],
                "projection": state["projection"],
                "page": state["page"],
                "created_at": state["created_at"].isoformat(),
            }
            for message_id, state in self._reports.items()
        ]
        temp = self._data_path.with_suffix(self._data_path.suffix + ".tmp")
        with open(temp, "w") as handle:
            json.dump(records, handle, separators=(",", ":"), sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, self._data_path)
        try:
            directory_fd = os.open(self._data_path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            # Some filesystems do not permit directory fsync; the data file was
            # still fsynced before the atomic replace.
            pass

    def _save_best_effort(self, *, context: str) -> None:
        try:
            self._save()
        except OSError as exc:
            log.error("Could not persist scheduled report state after %s: %s", context, exc)

    def _prune_in_memory(self) -> bool:
        now = datetime.now(UTC)
        stale = [
            message_id
            for message_id, state in self._reports.items()
            if (now - state["created_at"]).total_seconds() > MAX_REPORT_AGE_SECONDS
        ]
        for message_id in stale:
            self._reports.pop(message_id, None)
        trimmed = False
        while len(self._reports) > self._max_reports:
            self._reports.pop(next(iter(self._reports)))
            trimmed = True
        return bool(stale) or trimmed

    def handles(self, message_id: int, emoji: Any) -> bool:
        state = self._reports.get(message_id)
        if state is None or str(emoji) not in CONTROL_REACTIONS:
            return False
        return (datetime.now(UTC) - state["created_at"]).total_seconds() <= MAX_REPORT_AGE_SECONDS

    async def post(
        self,
        channel: discord.abc.Messageable,
        report_format: str,
        raw_output: str,
    ) -> discord.Message:
        projection = self._registry.project(report_format, raw_output)
        embed = self._registry.render_page(report_format, projection, 0)
        message = await channel.send(embed=embed)
        async with self._lock:
            self._reports[message.id] = {
                "channel_id": int(getattr(channel, "id", 0)),
                "format": report_format,
                "projection": projection,
                "page": 0,
                "created_at": datetime.now(UTC),
            }
            self._prune_in_memory()
            self._save_best_effort(context="posting")
        for emoji in REPORT_REACTIONS:
            try:
                await message.add_reaction(emoji)
            except (discord.Forbidden, discord.HTTPException):
                log.warning(
                    "Could not add scheduled-report reaction %s to message %s",
                    emoji,
                    message.id,
                )
        return message

    async def handle_reaction(self, payload: discord.RawReactionActionEvent) -> bool:
        """Redraw from persisted projection only; refresh never reruns a check."""
        emoji = str(payload.emoji)
        if emoji not in CONTROL_REACTIONS:
            return False
        async with self._lock:
            changed = self._prune_in_memory()
            state = self._reports.get(payload.message_id)
            if state is None:
                if changed:
                    self._save_best_effort(context="state pruning")
                return False
            page_count = len(state["projection"]["pages"])
            current = int(state["page"]) % page_count
            if emoji in LEFT_REACTIONS:
                current = (current - 1) % page_count
            elif emoji in RIGHT_REACTIONS:
                current = (current + 1) % page_count
            # REFRESH_REACTIONS intentionally leave current unchanged. The only
            # side effect below is fetching/editing the existing message.
            embed = self._registry.render_page(state["format"], state["projection"], current)
            channel = self._get_channel(payload.channel_id)
            if channel is None:
                return False
            try:
                message = await channel.fetch_message(payload.message_id)  # type: ignore[attr-defined]
                await message.edit(embed=embed)
                state["page"] = current
                self._save_best_effort(context="page redraw")
                try:
                    await message.remove_reaction(payload.emoji, discord.Object(id=payload.user_id))
                except (discord.Forbidden, discord.HTTPException):
                    pass
            except discord.NotFound:
                self._reports.pop(payload.message_id, None)
                self._save_best_effort(context="message removal")
                return False
            except (discord.Forbidden, discord.HTTPException, AttributeError) as exc:
                log.warning(
                    "Could not redraw scheduled report message %s; retaining state: %s",
                    payload.message_id,
                    exc,
                )
                return False
            return True
