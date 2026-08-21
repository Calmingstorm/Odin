"""Generic scheduled-report contract, persistence, and pagination tests."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.discord.scheduled_report import (
    MAX_DESCRIPTION_CHARS,
    MAX_EMBED_CHARS,
    MAX_FIELD_NAME_CHARS,
    MAX_FIELD_VALUE_CHARS,
    MAX_FIELDS_PER_PAGE,
    MAX_FOOTER_INPUT_CHARS,
    MAX_LINK_LABEL_CHARS,
    MAX_LINK_URL_CHARS,
    MAX_LINKS,
    MAX_PAGES,
    MAX_TITLE_CHARS,
    PAGINATED_EMBED_V1,
    PaginatedEmbedV1Renderer,
    ScheduledReportPaginationService,
    ScheduledReportRendererRegistry,
)


def _registry():
    registry = ScheduledReportRendererRegistry()
    registry.register(PaginatedEmbedV1Renderer())
    return registry


def _payload(**page_overrides):
    page = {
        "title": "Status",
        "description": "Everything is nominal.",
        "fields": [{"name": "Check", "value": "Healthy", "inline": True}],
        "footer": "Generated recently",
        "links": [{"label": "Details", "url": "https://example.com/report"}],
    }
    page.update(page_overrides)
    return {"format": PAGINATED_EMBED_V1, "pages": [page]}


class TestPaginatedEmbedV1Contract:
    def test_required_optional_defaults_and_rendering(self):
        registry = _registry()
        projection = registry.project(
            PAGINATED_EMBED_V1,
            json.dumps(
                {
                    "format": PAGINATED_EMBED_V1,
                    "pages": [
                        {"title": "One"},
                        {
                            "title": "Two",
                            "description": "Body",
                            "fields": [{"name": "N", "value": "V"}],
                            "footer": "Footer",
                            "links": [{"label": "Docs", "url": "https://example.com"}],
                        },
                    ],
                }
            ),
        )
        assert projection["pages"][0] == {
            "title": "One",
            "description": "",
            "fields": [],
            "footer": "",
            "links": [],
        }
        embed = registry.render_page(PAGINATED_EMBED_V1, projection, 1)
        data = embed.to_dict()
        assert data["title"] == "Two"
        assert data["fields"][0] == {"name": "N", "value": "V", "inline": False}
        assert data["fields"][1]["name"] == "Links"
        assert data["footer"]["text"].startswith("Footer · Page 2/2")

    def test_empty_pages_normalize_to_bounded_empty_state(self):
        projection = _registry().project(
            PAGINATED_EMBED_V1,
            json.dumps({"format": PAGINATED_EMBED_V1, "pages": []}),
        )
        assert projection["pages"] == [
            {
                "title": "Scheduled report",
                "description": "No report data.",
                "fields": [],
                "footer": "",
                "links": [],
            }
        ]

    @pytest.mark.parametrize(
        "payload,error",
        [
            ([], "must be an object"),
            ({"format": PAGINATED_EMBED_V1}, "pages must be an array"),
            ({"format": "other", "pages": []}, "report.format"),
            ({"format": PAGINATED_EMBED_V1, "pages": [], "junk": 1}, "unknown keys"),
            ({"format": PAGINATED_EMBED_V1, "pages": ["junk"]}, "must be an object"),
            ({"format": PAGINATED_EMBED_V1, "pages": [{}]}, "title is required"),
            ({"format": PAGINATED_EMBED_V1, "pages": [{"title": 1}]}, "must be a string"),
            ({"format": PAGINATED_EMBED_V1, "pages": [{"title": " "}]}, "non-empty"),
            ({"format": PAGINATED_EMBED_V1, "pages": [{"title": "x", "junk": 1}]}, "unknown keys"),
            (
                {"format": PAGINATED_EMBED_V1, "pages": [{"title": "x", "fields": {}}]},
                "fields must be an array",
            ),
            (
                {"format": PAGINATED_EMBED_V1, "pages": [{"title": "x", "fields": [1]}]},
                "must be an object",
            ),
            (
                {
                    "format": PAGINATED_EMBED_V1,
                    "pages": [{"title": "x", "fields": [{"name": "n"}]}],
                },
                "requires name and value",
            ),
            (
                {
                    "format": PAGINATED_EMBED_V1,
                    "pages": [{"title": "x", "fields": [{"name": "n", "value": "v", "inline": 1}]}],
                },
                "must be a boolean",
            ),
            (
                {"format": PAGINATED_EMBED_V1, "pages": [{"title": "x", "links": {}}]},
                "links must be an array",
            ),
            (
                {
                    "format": PAGINATED_EMBED_V1,
                    "pages": [{"title": "x", "links": [{"label": "l"}]}],
                },
                "requires label and url",
            ),
        ],
    )
    def test_hostile_shapes_are_rejected(self, payload, error):
        with pytest.raises(ValueError, match=error):
            _registry().project(PAGINATED_EMBED_V1, json.dumps(payload))

    @pytest.mark.parametrize(
        "overrides,error",
        [
            ({"title": "x" * (MAX_TITLE_CHARS + 1)}, "title exceeds"),
            ({"description": "x" * (MAX_DESCRIPTION_CHARS + 1)}, "description exceeds"),
            ({"footer": "x" * (MAX_FOOTER_INPUT_CHARS + 1)}, "footer exceeds"),
            (
                {"fields": [{"name": "x" * (MAX_FIELD_NAME_CHARS + 1), "value": "v"}]},
                "name exceeds",
            ),
            (
                {"fields": [{"name": "n", "value": "x" * (MAX_FIELD_VALUE_CHARS + 1)}]},
                "value exceeds",
            ),
            (
                {
                    "links": [
                        {"label": "x" * (MAX_LINK_LABEL_CHARS + 1), "url": "https://example.com"}
                    ]
                },
                "label exceeds",
            ),
            (
                {
                    "links": [
                        {"label": "x", "url": "https://example.com/" + "x" * MAX_LINK_URL_CHARS}
                    ]
                },
                "1-512",
            ),
            ({"links": [{"label": "x", "url": "javascript:alert(1)"}]}, "absolute HTTP"),
            ({"links": [{"label": "x", "url": "https://user:pass@example.com"}]}, "credentials"),
            ({"links": [{"label": "x", "url": "https://example.com/bad path"}]}, "whitespace"),
            ({"links": [{"label": "x", "url": "https://example.com/\u0001"}]}, "control"),
            ({"links": [{"label": "x", "url": "https://example.com:99999"}]}, "valid URL"),
        ],
    )
    def test_hard_character_and_link_caps(self, overrides, error):
        with pytest.raises(ValueError, match=error):
            _registry().project(PAGINATED_EMBED_V1, json.dumps(_payload(**overrides)))

    def test_page_field_link_and_embed_caps(self):
        registry = _registry()
        with pytest.raises(ValueError, match="10-page"):
            registry.project(
                PAGINATED_EMBED_V1,
                json.dumps(
                    {"format": PAGINATED_EMBED_V1, "pages": [{"title": "x"}] * (MAX_PAGES + 1)}
                ),
            )
        with pytest.raises(ValueError, match="rendered fields"):
            registry.project(
                PAGINATED_EMBED_V1,
                json.dumps(
                    _payload(fields=[{"name": "n", "value": "v"}] * (MAX_FIELDS_PER_PAGE + 1))
                ),
            )
        with pytest.raises(ValueError, match="10-link"):
            registry.project(
                PAGINATED_EMBED_V1,
                json.dumps(
                    _payload(
                        links=[
                            {"label": "x", "url": f"https://example.com/{i}"}
                            for i in range(MAX_LINKS + 1)
                        ]
                    )
                ),
            )
        # Every component is below its own cap, but their sum exceeds Discord's
        # 6,000-character per-embed aggregate limit.
        aggregate = _payload(
            title="t" * MAX_TITLE_CHARS,
            description="d" * MAX_DESCRIPTION_CHARS,
            fields=[{"name": "n", "value": "v" * MAX_FIELD_VALUE_CHARS}],
            footer="f" * 700,
            links=[],
        )
        with pytest.raises(ValueError, match=str(MAX_EMBED_CHARS)):
            registry.project(PAGINATED_EMBED_V1, json.dumps(aggregate))

    def test_parse_first_then_scrub_rendered_strings_only(self):
        raw = json.dumps(
            {
                "format": PAGINATED_EMBED_V1,
                "pages": [{"title": "token=super-secret", "description": "@everyone **raw**"}],
            }
        )
        with patch(
            "src.discord.scheduled_report.scrub_response_secrets",
            side_effect=lambda value: value.replace("super-secret", "[REDACTED]"),
        ) as scrub:
            projection = _registry().project(PAGINATED_EMBED_V1, raw)
        assert scrub.call_count == 3  # title, description, and default footer
        assert projection["pages"][0]["title"] == r"token=\[REDACTED\]"
        assert "@\u200beveryone" in projection["pages"][0]["description"]
        assert r"\*\*raw\*\*" in projection["pages"][0]["description"]
        assert "super-secret" not in json.dumps(projection)

    def test_freeform_text_cannot_create_clickable_links(self):
        projection = _registry().project(
            PAGINATED_EMBED_V1,
            json.dumps(_payload(description="[click](https://example.com) <https://example.com>")),
        )
        description = projection["pages"][0]["description"]
        assert description == (
            r"\[click\]\(https://example.com\) \<https://example.com\>"
        )

    def test_link_urls_are_scrubbed_after_parse_before_validation(self):
        raw = json.dumps(
            _payload(
                links=[
                    {
                        "label": "Details",
                        "url": "https://example.com/?token=super-secret",
                    }
                ]
            )
        )
        with patch(
            "src.discord.scheduled_report.scrub_response_secrets",
            side_effect=lambda value: value.replace("super-secret", "redacted"),
        ):
            projection = _registry().project(PAGINATED_EMBED_V1, raw)
        assert projection["pages"][0]["links"][0]["url"].endswith("token=redacted")
        assert "super-secret" not in json.dumps(projection)

    def test_unknown_registry_format_is_rejected_at_render_time(self):
        with pytest.raises(ValueError, match="Unsupported scheduled report format"):
            _registry().project("unknown_v1", "{}")


class _Message:
    def __init__(self, message_id=99):
        self.id = message_id
        self.add_reaction = AsyncMock()
        self.edit = AsyncMock()
        self.remove_reaction = AsyncMock()


class _Channel:
    def __init__(self, channel_id=42, message=None):
        self.id = channel_id
        self.message = message or _Message()
        self.send = AsyncMock(return_value=self.message)
        self.fetch_message = AsyncMock(return_value=self.message)


def _reaction(*, emoji="➡️", message_id=99, channel_id=42, user_id=7):
    return SimpleNamespace(
        emoji=emoji,
        message_id=message_id,
        channel_id=channel_id,
        user_id=user_id,
    )


class TestPaginationState:
    async def test_post_persists_only_normalized_projection_and_reloads(self, tmp_path):
        state_path = (tmp_path / "scheduled_reports.json").resolve()
        channel = _Channel()
        service = ScheduledReportPaginationService(
            registry=_registry(), data_path=state_path, get_channel=lambda _cid: channel
        )
        raw = json.dumps(_payload(title="**Title**", description="@everyone"))
        await service.post(channel, PAGINATED_EMBED_V1, raw)

        stored = json.loads(state_path.read_text())
        assert set(stored[0]) == {
            "message_id",
            "channel_id",
            "format",
            "projection",
            "page",
            "created_at",
        }
        projection = stored[0]["projection"]
        assert "payload" not in stored[0]
        assert "raw_output" not in stored[0]
        assert projection["pages"][0]["title"] == r"\*\*Title\*\*"
        assert projection["pages"][0]["description"] == "@\u200beveryone"

        reloaded = ScheduledReportPaginationService(
            registry=_registry(), data_path=state_path, get_channel=lambda _cid: channel
        )
        assert reloaded.handles(99, "➡️")
        assert await reloaded.handle_reaction(_reaction())
        channel.message.edit.assert_awaited_once()

    async def test_refresh_is_redraw_only_and_does_not_reproject_or_execute(self, tmp_path):
        state_path = (tmp_path / "scheduled_reports.json").resolve()
        channel = _Channel()
        registry = _registry()
        service = ScheduledReportPaginationService(
            registry=registry, data_path=state_path, get_channel=lambda _cid: channel
        )
        await service.post(
            channel,
            PAGINATED_EMBED_V1,
            json.dumps(
                {
                    "format": PAGINATED_EMBED_V1,
                    "pages": [{"title": "Page one"}, {"title": "Page two"}],
                }
            ),
        )
        with patch.object(registry, "project", side_effect=AssertionError("refresh reprojected")):
            assert await service.handle_reaction(_reaction(emoji="🔄"))
        edited = channel.message.edit.await_args.kwargs["embed"].to_dict()
        assert edited["title"] == "Page one"
        assert json.loads(state_path.read_text())[0]["page"] == 0

    async def test_navigation_wraps_and_removes_user_reaction(self, tmp_path):
        channel = _Channel()
        service = ScheduledReportPaginationService(
            registry=_registry(),
            data_path=(tmp_path / "state.json").resolve(),
            get_channel=lambda _cid: channel,
        )
        await service.post(
            channel,
            PAGINATED_EMBED_V1,
            json.dumps(
                {
                    "format": PAGINATED_EMBED_V1,
                    "pages": [{"title": "One"}, {"title": "Two"}],
                }
            ),
        )
        assert await service.handle_reaction(_reaction(emoji="⬅️"))
        assert channel.message.edit.await_args.kwargs["embed"].to_dict()["title"] == "Two"
        channel.message.remove_reaction.assert_awaited_once()

    async def test_missing_message_removes_persisted_state(self, tmp_path):
        import discord

        channel = _Channel()
        service = ScheduledReportPaginationService(
            registry=_registry(),
            data_path=(tmp_path / "state.json").resolve(),
            get_channel=lambda _cid: channel,
        )
        await service.post(channel, PAGINATED_EMBED_V1, json.dumps(_payload()))
        response = MagicMock(status=404, reason="missing")
        channel.fetch_message = AsyncMock(side_effect=discord.NotFound(response, "missing"))
        assert not await service.handle_reaction(_reaction())
        assert not service.handles(99, "➡️")

    def test_requires_absolute_state_path_and_prunes_older_than_26h(self, tmp_path):
        with pytest.raises(ValueError, match="absolute"):
            ScheduledReportPaginationService(
                registry=_registry(),
                data_path=tmp_path.__class__("relative.json"),
                get_channel=lambda _cid: None,
            )
        state = [
            {
                "message_id": 99,
                "channel_id": 42,
                "format": PAGINATED_EMBED_V1,
                "projection": _registry().project(PAGINATED_EMBED_V1, json.dumps(_payload())),
                "page": 0,
                "created_at": (datetime.now(UTC) - timedelta(hours=27)).isoformat(),
            }
        ]
        path = (tmp_path / "state.json").resolve()
        path.write_text(json.dumps(state))
        service = ScheduledReportPaginationService(
            registry=_registry(), data_path=path, get_channel=lambda _cid: None
        )
        assert not service.handles(99, "➡️")


class TestRegistryAndPersistenceFailureEdges:
    def test_duplicate_registration_and_formats(self):
        registry = _registry()
        assert registry.formats == (PAGINATED_EMBED_V1,)
        with pytest.raises(ValueError, match="already registered"):
            registry.register(PaginatedEmbedV1Renderer())

    def test_malformed_json_has_stable_error(self):
        with pytest.raises(ValueError, match="did not return valid JSON"):
            _registry().project(PAGINATED_EMBED_V1, "{")

    def test_malformed_persisted_state_fails_closed(self, tmp_path):
        path = (tmp_path / "state.json").resolve()
        path.write_text("not-json")
        service = ScheduledReportPaginationService(
            registry=_registry(), data_path=path, get_channel=lambda _cid: None
        )
        assert not service.handles(1, "➡️")

    async def test_reaction_unknown_emoji_or_message_is_ignored(self, tmp_path):
        service = ScheduledReportPaginationService(
            registry=_registry(),
            data_path=(tmp_path / "state.json").resolve(),
            get_channel=lambda _cid: None,
        )
        assert not await service.handle_reaction(_reaction(emoji="not-a-control"))
        assert not await service.handle_reaction(_reaction(message_id=1234))

    async def test_missing_channel_keeps_state_without_editing(self, tmp_path):
        channel = _Channel()
        service = ScheduledReportPaginationService(
            registry=_registry(),
            data_path=(tmp_path / "state.json").resolve(),
            get_channel=lambda _cid: None,
        )
        await service.post(channel, PAGINATED_EMBED_V1, json.dumps(_payload()))
        assert not await service.handle_reaction(_reaction())
        assert service.handles(99, "➡️")

    async def test_discord_edit_error_keeps_state(self, tmp_path):
        import discord

        channel = _Channel()
        response = MagicMock(status=403, reason="forbidden")
        channel.message.edit = AsyncMock(
            side_effect=discord.Forbidden(response, "forbidden")
        )
        service = ScheduledReportPaginationService(
            registry=_registry(),
            data_path=(tmp_path / "state.json").resolve(),
            get_channel=lambda _cid: channel,
        )
        await service.post(channel, PAGINATED_EMBED_V1, json.dumps(_payload()))
        assert not await service.handle_reaction(_reaction())
        assert service.handles(99, "➡️")

    async def test_reaction_add_failures_do_not_fail_delivery(self, tmp_path):
        import discord

        channel = _Channel()
        response = MagicMock(status=403, reason="forbidden")
        channel.message.add_reaction = AsyncMock(
            side_effect=discord.Forbidden(response, "forbidden")
        )
        service = ScheduledReportPaginationService(
            registry=_registry(),
            data_path=(tmp_path / "state.json").resolve(),
            get_channel=lambda _cid: channel,
        )
        posted = await service.post(
            channel, PAGINATED_EMBED_V1, json.dumps(_payload())
        )
        assert posted is channel.message
        assert channel.message.add_reaction.await_count == 3

    async def test_reaction_removal_failure_does_not_fail_redraw(self, tmp_path):
        import discord

        channel = _Channel()
        response = MagicMock(status=403, reason="forbidden")
        channel.message.remove_reaction = AsyncMock(
            side_effect=discord.Forbidden(response, "forbidden")
        )
        service = ScheduledReportPaginationService(
            registry=_registry(),
            data_path=(tmp_path / "state.json").resolve(),
            get_channel=lambda _cid: channel,
        )
        await service.post(channel, PAGINATED_EMBED_V1, json.dumps(_payload()))
        assert await service.handle_reaction(_reaction())

    async def test_persistence_failure_after_post_is_best_effort(self, tmp_path):
        channel = _Channel()
        service = ScheduledReportPaginationService(
            registry=_registry(),
            data_path=(tmp_path / "state.json").resolve(),
            get_channel=lambda _cid: channel,
        )
        with patch.object(service, "_save", side_effect=OSError("disk full")):
            posted = await service.post(
                channel, PAGINATED_EMBED_V1, json.dumps(_payload())
            )
        assert posted is channel.message
