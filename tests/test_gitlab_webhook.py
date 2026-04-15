"""Tests for GitLab webhook integration.

Covers:
- Token verification (X-Gitlab-Token)
- Event parsing (push, merge_request, tag_push, pipeline)
- Trigger matching via scheduler
- Channel routing (gitlab_channel_id)
- Config schema (gitlab_channel_id field)
- Scheduler valid sources include 'gitlab'
"""

from __future__ import annotations

import json

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import WebhookConfig
from src.health.server import HealthServer
from src.scheduler.scheduler import Scheduler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SECRET = "test-webhook-secret"


def _make_server(
    *,
    secret: str = SECRET,
    channel_id: str = "999",
    gitlab_channel_id: str = "",
) -> HealthServer:
    cfg = WebhookConfig(
        enabled=True,
        secret=secret,
        channel_id=channel_id,
        gitlab_channel_id=gitlab_channel_id,
    )
    return HealthServer(port=0, webhook_config=cfg)


def _gitlab_push_payload(
    repo: str = "acme/widget",
    user: str = "alice",
    ref: str = "refs/heads/main",
    commits: list[dict] | None = None,
) -> dict:
    if commits is None:
        commits = [
            {"id": "abc1234567890", "message": "fix: resolve flaky test"},
        ]
    return {
        "object_kind": "push",
        "ref": ref,
        "user_name": user,
        "commits": commits,
        "project": {"path_with_namespace": repo},
    }


def _gitlab_mr_payload(
    repo: str = "acme/widget",
    action: str = "open",
    title: str = "Add feature X",
    user: str = "bob",
    iid: int = 42,
) -> dict:
    return {
        "object_kind": "merge_request",
        "user": {"name": user},
        "object_attributes": {
            "action": action,
            "title": title,
            "iid": iid,
        },
        "project": {"path_with_namespace": repo},
    }


def _gitlab_tag_push_payload(
    repo: str = "acme/widget",
    user: str = "dave",
    ref: str = "refs/tags/v1.2.0",
) -> dict:
    return {
        "object_kind": "tag_push",
        "ref": ref,
        "user_name": user,
        "project": {"path_with_namespace": repo},
    }


def _gitlab_pipeline_payload(
    repo: str = "acme/widget",
    status: str = "success",
    ref: str = "main",
    pipeline_id: int = 12345,
    user: str = "eve",
) -> dict:
    return {
        "object_kind": "pipeline",
        "object_attributes": {
            "id": pipeline_id,
            "status": status,
            "ref": ref,
        },
        "user": {"name": user},
        "project": {"path_with_namespace": repo},
    }


# ---------------------------------------------------------------------------
# Tests — Token Authentication
# ---------------------------------------------------------------------------

class TestGitLabWebhookAuth:
    """Token verification for GitLab webhooks."""

    @pytest.fixture
    def server(self):
        return _make_server()

    @pytest.fixture
    async def client(self, server):
        async with TestClient(TestServer(server._app)) as c:
            yield c

    async def test_valid_token_accepted(self, client):
        payload = _gitlab_push_payload()
        body = json.dumps(payload).encode()
        resp = await client.post(
            "/webhook/gitlab",
            data=body,
            headers={
                "X-Gitlab-Token": SECRET,
                "Content-Type": "application/json",
            },
        )
        # 500 is acceptable — no send_message callback wired, but auth passed
        assert resp.status != 403

    async def test_invalid_token_rejected(self, client):
        payload = _gitlab_push_payload()
        body = json.dumps(payload).encode()
        resp = await client.post(
            "/webhook/gitlab",
            data=body,
            headers={
                "X-Gitlab-Token": "wrong-secret",
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 403

    async def test_missing_token_rejected(self, client):
        payload = _gitlab_push_payload()
        body = json.dumps(payload).encode()
        resp = await client.post(
            "/webhook/gitlab",
            data=body,
            headers={
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 403

    async def test_no_secret_configured_rejects(self):
        server = _make_server(secret="")
        async with TestClient(TestServer(server._app)) as client:
            payload = _gitlab_push_payload()
            body = json.dumps(payload).encode()
            resp = await client.post(
                "/webhook/gitlab",
                data=body,
                headers={
                    "X-Gitlab-Token": "",
                    "Content-Type": "application/json",
                },
            )
            assert resp.status == 403


# ---------------------------------------------------------------------------
# Tests — Event Parsing & Message Formatting
# ---------------------------------------------------------------------------

class TestGitLabWebhookEvents:
    """Event parsing produces correct Discord messages."""

    @pytest.fixture
    def server(self):
        srv = _make_server()
        self.sent_messages: list[tuple[str, str]] = []

        async def capture(channel_id: str, text: str) -> None:
            self.sent_messages.append((channel_id, text))

        srv.set_send_message(capture)
        return srv

    @pytest.fixture
    async def client(self, server):
        async with TestClient(TestServer(server._app)) as c:
            yield c

    def _post(self, client, payload):
        body = json.dumps(payload).encode()
        return client.post(
            "/webhook/gitlab",
            data=body,
            headers={
                "X-Gitlab-Token": SECRET,
                "Content-Type": "application/json",
            },
        )

    async def test_push_event(self, client):
        resp = await self._post(client, _gitlab_push_payload())
        assert resp.status == 200
        assert len(self.sent_messages) == 1
        channel, text = self.sent_messages[0]
        assert channel == "999"
        assert "GitLab Push" in text
        assert "acme/widget" in text
        assert "main" in text
        assert "alice" in text
        assert "abc1234" in text  # short commit hash

    async def test_push_truncates_commits(self, client):
        commits = [
            {"id": f"{i}a1b2c3d4e5f6", "message": f"msg {i}"}
            for i in range(10)
        ]
        payload = _gitlab_push_payload(commits=commits)
        resp = await self._post(client, payload)
        assert resp.status == 200
        _, text = self.sent_messages[0]
        # Only first 5 shown ([:5] slice)
        assert "0a1b2c3" in text
        assert "4a1b2c3" in text
        assert "5a1b2c3" not in text
        assert "10 commit(s)" in text

    async def test_merge_request_event(self, client):
        resp = await self._post(
            client,
            _gitlab_mr_payload(action="open", title="Add feature X", iid=42),
        )
        assert resp.status == 200
        _, text = self.sent_messages[0]
        assert "GitLab MR !42" in text
        assert "open" in text
        assert "Add feature X" in text
        assert "bob" in text

    async def test_tag_push_event(self, client):
        resp = await self._post(
            client,
            _gitlab_tag_push_payload(ref="refs/tags/v1.2.0", user="dave"),
        )
        assert resp.status == 200
        _, text = self.sent_messages[0]
        assert "GitLab Tag" in text
        assert "v1.2.0" in text
        assert "dave" in text

    async def test_pipeline_event(self, client):
        resp = await self._post(
            client,
            _gitlab_pipeline_payload(
                status="success", ref="main", pipeline_id=12345, user="eve",
            ),
        )
        assert resp.status == 200
        _, text = self.sent_messages[0]
        assert "GitLab Pipeline #12345" in text
        assert "success" in text
        assert "main" in text
        assert "eve" in text

    async def test_unknown_event(self, client):
        payload = {
            "object_kind": "note",
            "project": {"path_with_namespace": "acme/widget"},
        }
        resp = await self._post(client, payload)
        assert resp.status == 200
        _, text = self.sent_messages[0]
        assert "GitLab" in text
        assert "note" in text

    async def test_invalid_json(self, client):
        body = b"not json"
        resp = await client.post(
            "/webhook/gitlab",
            data=body,
            headers={
                "X-Gitlab-Token": SECRET,
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 400


# ---------------------------------------------------------------------------
# Tests — Trigger Matching
# ---------------------------------------------------------------------------

class TestGitLabTriggerMatching:
    """Webhook triggers fire for gitlab source."""

    @pytest.fixture
    def server(self):
        srv = _make_server()
        self.sent_messages = []
        self.triggered_schedules = []

        async def capture(channel_id, text):
            self.sent_messages.append((channel_id, text))

        async def trigger_cb(source, event_data):
            self.triggered_schedules.append((source, event_data))
            return 0

        srv.set_send_message(capture)
        srv.set_trigger_callback(trigger_cb)
        return srv

    @pytest.fixture
    async def client(self, server):
        async with TestClient(TestServer(server._app)) as c:
            yield c

    async def test_triggers_notified_on_push(self, client):
        payload = _gitlab_push_payload(repo="acme/widget")
        body = json.dumps(payload).encode()
        resp = await client.post(
            "/webhook/gitlab",
            data=body,
            headers={
                "X-Gitlab-Token": SECRET,
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 200
        assert len(self.triggered_schedules) == 1
        source, event_data = self.triggered_schedules[0]
        assert source == "gitlab"
        assert event_data["event"] == "push"
        assert event_data["repo"] == "acme/widget"

    async def test_triggers_notified_on_mr(self, client):
        payload = _gitlab_mr_payload()
        body = json.dumps(payload).encode()
        resp = await client.post(
            "/webhook/gitlab",
            data=body,
            headers={
                "X-Gitlab-Token": SECRET,
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 200
        source, event_data = self.triggered_schedules[0]
        assert source == "gitlab"
        assert event_data["event"] == "merge_request"

    async def test_triggers_notified_on_pipeline(self, client):
        payload = _gitlab_pipeline_payload()
        body = json.dumps(payload).encode()
        resp = await client.post(
            "/webhook/gitlab",
            data=body,
            headers={
                "X-Gitlab-Token": SECRET,
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 200
        source, event_data = self.triggered_schedules[0]
        assert source == "gitlab"
        assert event_data["event"] == "pipeline"


# ---------------------------------------------------------------------------
# Tests — Channel Routing
# ---------------------------------------------------------------------------

class TestGitLabChannelRouting:
    """GitLab-specific channel overrides work."""

    async def test_default_channel(self):
        srv = _make_server(channel_id="111", gitlab_channel_id="")
        assert srv._get_channel_id("gitlab") == "111"

    async def test_gitlab_specific_channel(self):
        srv = _make_server(channel_id="111", gitlab_channel_id="222")
        assert srv._get_channel_id("gitlab") == "222"

    async def test_no_channel(self):
        srv = _make_server(channel_id="", gitlab_channel_id="")
        assert srv._get_channel_id("gitlab") is None


# ---------------------------------------------------------------------------
# Tests — Scheduler Accepts GitLab Source
# ---------------------------------------------------------------------------

class TestSchedulerGitLabSource:
    """Scheduler validates and matches gitlab triggers."""

    def test_validate_gitlab_source(self):
        # Should not raise
        Scheduler._validate_trigger({"source": "gitlab", "event": "push"})

    def test_validate_invalid_source(self):
        with pytest.raises(ValueError, match="Invalid trigger source"):
            Scheduler._validate_trigger({"source": "bitbucket"})

    def test_trigger_matches_gitlab(self):
        trigger = {"source": "gitlab", "event": "push", "repo": "acme/widget"}
        assert Scheduler._trigger_matches(
            trigger, "gitlab", {"event": "push", "repo": "acme/widget"}
        )

    def test_trigger_no_match_wrong_source(self):
        trigger = {"source": "gitlab", "event": "push"}
        assert not Scheduler._trigger_matches(
            trigger, "github", {"event": "push"}
        )

    def test_trigger_matches_repo_substring(self):
        trigger = {"source": "gitlab", "repo": "widget"}
        assert Scheduler._trigger_matches(
            trigger, "gitlab", {"event": "push", "repo": "acme/widget"}
        )

    def test_trigger_no_match_wrong_event(self):
        trigger = {"source": "gitlab", "event": "push"}
        assert not Scheduler._trigger_matches(
            trigger, "gitlab", {"event": "merge_request"}
        )

    def test_add_gitlab_trigger_schedule(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        result = sched.add(
            description="Deploy on push to main",
            action="reminder",
            channel_id="999",
            message="New push to main!",
            trigger={"source": "gitlab", "event": "push", "repo": "acme/widget"},
        )
        assert result["trigger"]["source"] == "gitlab"
        assert result["one_time"] is False
        assert len(sched.list_all()) == 1

    def test_trigger_matches_merge_request(self):
        trigger = {"source": "gitlab", "event": "merge_request"}
        assert Scheduler._trigger_matches(
            trigger, "gitlab", {"event": "merge_request", "repo": "acme/widget"}
        )

    def test_trigger_matches_pipeline(self):
        trigger = {"source": "gitlab", "event": "pipeline"}
        assert Scheduler._trigger_matches(
            trigger, "gitlab", {"event": "pipeline", "repo": "acme/widget"}
        )


# ---------------------------------------------------------------------------
# Tests — Config Schema
# ---------------------------------------------------------------------------

class TestWebhookConfigGitLab:
    """WebhookConfig includes gitlab_channel_id."""

    def test_default_empty(self):
        cfg = WebhookConfig()
        assert cfg.gitlab_channel_id == ""

    def test_set_gitlab_channel(self):
        cfg = WebhookConfig(gitlab_channel_id="12345")
        assert cfg.gitlab_channel_id == "12345"

    def test_from_dict(self):
        cfg = WebhookConfig(**{
            "enabled": True,
            "secret": "s",
            "channel_id": "1",
            "gitlab_channel_id": "2",
        })
        assert cfg.gitlab_channel_id == "2"
        assert cfg.enabled is True
