"""Tests for GitHub webhook integration.

Covers:
- Signature verification (X-Hub-Signature-256)
- Event parsing (push, pull_request, issues, release, workflow_run)
- Trigger matching via scheduler
- Channel routing (github_channel_id)
- Config schema (github_channel_id field)
- Scheduler valid sources include 'github'
"""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from aiohttp import web
from aiohttp.test_utils import AioHTTPTestCase, TestClient, TestServer

from src.config.schema import WebhookConfig
from src.health.server import HealthServer
from src.scheduler.scheduler import Scheduler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sign(body: bytes, secret: str) -> str:
    """Compute GitHub-style sha256=<hex> signature."""
    mac = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={mac}"


SECRET = "test-webhook-secret"


def _make_server(
    *,
    secret: str = SECRET,
    channel_id: str = "999",
    github_channel_id: str = "",
) -> HealthServer:
    cfg = WebhookConfig(
        enabled=True,
        secret=secret,
        channel_id=channel_id,
        github_channel_id=github_channel_id,
    )
    return HealthServer(port=0, webhook_config=cfg)


def _github_push_payload(
    repo: str = "acme/widget",
    pusher: str = "alice",
    ref: str = "refs/heads/main",
    commits: list[dict] | None = None,
) -> dict:
    if commits is None:
        commits = [
            {"id": "abc1234567890", "message": "fix: resolve flaky test"},
        ]
    return {
        "ref": ref,
        "pusher": {"name": pusher},
        "commits": commits,
        "repository": {"full_name": repo},
    }


def _github_pr_payload(
    repo: str = "acme/widget",
    action: str = "opened",
    title: str = "Add feature X",
    user: str = "bob",
    number: int = 42,
) -> dict:
    return {
        "action": action,
        "pull_request": {
            "title": title,
            "number": number,
            "user": {"login": user},
        },
        "repository": {"full_name": repo},
    }


def _github_issues_payload(
    repo: str = "acme/widget",
    action: str = "opened",
    title: str = "Bug report",
    sender: str = "carol",
    number: int = 7,
) -> dict:
    return {
        "action": action,
        "issue": {"title": title, "number": number},
        "sender": {"login": sender},
        "repository": {"full_name": repo},
    }


def _github_release_payload(
    repo: str = "acme/widget",
    action: str = "published",
    tag: str = "v1.2.0",
    author: str = "dave",
) -> dict:
    return {
        "action": action,
        "release": {"tag_name": tag, "author": {"login": author}},
        "repository": {"full_name": repo},
    }


def _github_workflow_run_payload(
    repo: str = "acme/widget",
    action: str = "completed",
    name: str = "CI",
    conclusion: str = "success",
    branch: str = "main",
) -> dict:
    return {
        "action": action,
        "workflow_run": {
            "name": name,
            "conclusion": conclusion,
            "head_branch": branch,
        },
        "repository": {"full_name": repo},
    }


# ---------------------------------------------------------------------------
# Tests — Signature
# ---------------------------------------------------------------------------

class TestGitHubWebhookSignature:
    """Signature verification for GitHub webhooks."""

    @pytest.fixture
    def server(self):
        return _make_server()

    @pytest.fixture
    async def client(self, server):
        async with TestClient(TestServer(server._app)) as c:
            yield c

    async def test_valid_signature_accepted(self, client):
        payload = _github_push_payload()
        body = json.dumps(payload).encode()
        sig = _sign(body, SECRET)
        resp = await client.post(
            "/webhook/github",
            data=body,
            headers={
                "X-Hub-Signature-256": sig,
                "X-GitHub-Event": "push",
                "Content-Type": "application/json",
            },
        )
        # 500 is expected — no send_message callback wired, but auth passed
        assert resp.status != 403

    async def test_invalid_signature_rejected(self, client):
        payload = _github_push_payload()
        body = json.dumps(payload).encode()
        resp = await client.post(
            "/webhook/github",
            data=body,
            headers={
                "X-Hub-Signature-256": "sha256=badhex",
                "X-GitHub-Event": "push",
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 403

    async def test_missing_signature_rejected(self, client):
        payload = _github_push_payload()
        body = json.dumps(payload).encode()
        resp = await client.post(
            "/webhook/github",
            data=body,
            headers={
                "X-GitHub-Event": "push",
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 403

    async def test_no_secret_configured_rejects(self):
        server = _make_server(secret="")
        async with TestClient(TestServer(server._app)) as client:
            payload = _github_push_payload()
            body = json.dumps(payload).encode()
            resp = await client.post(
                "/webhook/github",
                data=body,
                headers={
                    "X-GitHub-Event": "push",
                    "Content-Type": "application/json",
                },
            )
            assert resp.status == 403


# ---------------------------------------------------------------------------
# Tests — Event Parsing & Message Formatting
# ---------------------------------------------------------------------------

class TestGitHubWebhookEvents:
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

    def _post(self, client, payload, event="push"):
        body = json.dumps(payload).encode()
        sig = _sign(body, SECRET)
        return client.post(
            "/webhook/github",
            data=body,
            headers={
                "X-Hub-Signature-256": sig,
                "X-GitHub-Event": event,
                "Content-Type": "application/json",
            },
        )

    async def test_push_event(self, client):
        resp = await self._post(client, _github_push_payload())
        assert resp.status == 200
        assert len(self.sent_messages) == 1
        channel, text = self.sent_messages[0]
        assert channel == "999"
        assert "GitHub Push" in text
        assert "acme/widget" in text
        assert "main" in text
        assert "alice" in text
        assert "abc1234" in text  # short commit hash

    async def test_push_truncates_commits(self, client):
        commits = [
            {"id": f"{i}a1b2c3d4e5f6", "message": f"msg {i}"}
            for i in range(10)
        ]
        payload = _github_push_payload(commits=commits)
        resp = await self._post(client, payload)
        assert resp.status == 200
        _, text = self.sent_messages[0]
        # Only first 5 shown ([:5] slice)
        assert "0a1b2c3" in text
        assert "4a1b2c3" in text
        assert "5a1b2c3" not in text
        assert "10 commit(s)" in text

    async def test_pull_request_event(self, client):
        resp = await self._post(
            client,
            _github_pr_payload(action="opened", title="Add feature X", number=42),
            event="pull_request",
        )
        assert resp.status == 200
        _, text = self.sent_messages[0]
        assert "GitHub PR #42" in text
        assert "opened" in text
        assert "Add feature X" in text
        assert "bob" in text

    async def test_issues_event(self, client):
        resp = await self._post(
            client,
            _github_issues_payload(number=7, title="Bug report", sender="carol"),
            event="issues",
        )
        assert resp.status == 200
        _, text = self.sent_messages[0]
        assert "GitHub Issue #7" in text
        assert "Bug report" in text
        assert "carol" in text

    async def test_release_event(self, client):
        resp = await self._post(
            client,
            _github_release_payload(tag="v1.2.0", author="dave"),
            event="release",
        )
        assert resp.status == 200
        _, text = self.sent_messages[0]
        assert "GitHub Release" in text
        assert "v1.2.0" in text
        assert "dave" in text

    async def test_workflow_run_event(self, client):
        resp = await self._post(
            client,
            _github_workflow_run_payload(name="CI", conclusion="success", branch="main"),
            event="workflow_run",
        )
        assert resp.status == 200
        _, text = self.sent_messages[0]
        assert "GitHub Workflow" in text
        assert "CI" in text
        assert "success" in text
        assert "main" in text

    async def test_unknown_event(self, client):
        payload = {"repository": {"full_name": "acme/widget"}}
        resp = await self._post(client, payload, event="star")
        assert resp.status == 200
        _, text = self.sent_messages[0]
        assert "GitHub" in text
        assert "star" in text

    async def test_invalid_json(self, client):
        body = b"not json"
        sig = _sign(body, SECRET)
        resp = await client.post(
            "/webhook/github",
            data=body,
            headers={
                "X-Hub-Signature-256": sig,
                "X-GitHub-Event": "push",
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 400


# ---------------------------------------------------------------------------
# Tests — Trigger Matching
# ---------------------------------------------------------------------------

class TestGitHubTriggerMatching:
    """Webhook triggers fire for github source."""

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
        payload = _github_push_payload(repo="acme/widget")
        body = json.dumps(payload).encode()
        sig = _sign(body, SECRET)
        resp = await client.post(
            "/webhook/github",
            data=body,
            headers={
                "X-Hub-Signature-256": sig,
                "X-GitHub-Event": "push",
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 200
        assert len(self.triggered_schedules) == 1
        source, event_data = self.triggered_schedules[0]
        assert source == "github"
        assert event_data["event"] == "push"
        assert event_data["repo"] == "acme/widget"

    async def test_triggers_notified_on_pr(self, client):
        payload = _github_pr_payload()
        body = json.dumps(payload).encode()
        sig = _sign(body, SECRET)
        resp = await client.post(
            "/webhook/github",
            data=body,
            headers={
                "X-Hub-Signature-256": sig,
                "X-GitHub-Event": "pull_request",
                "Content-Type": "application/json",
            },
        )
        assert resp.status == 200
        source, event_data = self.triggered_schedules[0]
        assert source == "github"
        assert event_data["event"] == "pull_request"


# ---------------------------------------------------------------------------
# Tests — Channel Routing
# ---------------------------------------------------------------------------

class TestGitHubChannelRouting:
    """GitHub-specific channel overrides work."""

    async def test_default_channel(self):
        srv = _make_server(channel_id="111", github_channel_id="")
        assert srv._get_channel_id("github") == "111"

    async def test_github_specific_channel(self):
        srv = _make_server(channel_id="111", github_channel_id="222")
        assert srv._get_channel_id("github") == "222"

    async def test_no_channel(self):
        srv = _make_server(channel_id="", github_channel_id="")
        assert srv._get_channel_id("github") is None


# ---------------------------------------------------------------------------
# Tests — Scheduler Accepts GitHub Source
# ---------------------------------------------------------------------------

class TestSchedulerGitHubSource:
    """Scheduler validates and matches github triggers."""

    def test_validate_github_source(self):
        # Should not raise
        Scheduler._validate_trigger({"source": "github", "event": "push"})

    def test_validate_invalid_source(self):
        with pytest.raises(ValueError, match="Invalid trigger source"):
            Scheduler._validate_trigger({"source": "bitbucket"})

    def test_trigger_matches_github(self):
        trigger = {"source": "github", "event": "push", "repo": "acme/widget"}
        assert Scheduler._trigger_matches(
            trigger, "github", {"event": "push", "repo": "acme/widget"}
        )

    def test_trigger_no_match_wrong_source(self):
        trigger = {"source": "github", "event": "push"}
        assert not Scheduler._trigger_matches(
            trigger, "gitea", {"event": "push"}
        )

    def test_trigger_matches_repo_substring(self):
        trigger = {"source": "github", "repo": "widget"}
        assert Scheduler._trigger_matches(
            trigger, "github", {"event": "push", "repo": "acme/widget"}
        )

    def test_trigger_no_match_wrong_event(self):
        trigger = {"source": "github", "event": "push"}
        assert not Scheduler._trigger_matches(
            trigger, "github", {"event": "pull_request"}
        )

    def test_add_github_trigger_schedule(self, tmp_path):
        sched = Scheduler(data_path=str(tmp_path / "schedules.json"))
        result = sched.add(
            description="Deploy on push to main",
            action="reminder",
            channel_id="999",
            message="New push to main!",
            trigger={"source": "github", "event": "push", "repo": "acme/widget"},
        )
        assert result["trigger"]["source"] == "github"
        assert result["one_time"] is False
        assert len(sched.list_all()) == 1


# ---------------------------------------------------------------------------
# Tests — Config Schema
# ---------------------------------------------------------------------------

class TestWebhookConfigGitHub:
    """WebhookConfig includes github_channel_id."""

    def test_default_empty(self):
        cfg = WebhookConfig()
        assert cfg.github_channel_id == ""

    def test_set_github_channel(self):
        cfg = WebhookConfig(github_channel_id="12345")
        assert cfg.github_channel_id == "12345"

    def test_from_dict(self):
        cfg = WebhookConfig(**{
            "enabled": True,
            "secret": "s",
            "channel_id": "1",
            "github_channel_id": "2",
        })
        assert cfg.github_channel_id == "2"
        assert cfg.enabled is True
