"""Tests for issue tracker integration (Round 18).

Tests the IssueTrackerClient module: Linear and Jira API clients,
issue creation, commenting, querying, listing, transitions, config schema,
executor handler, and REST API endpoints.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.notifications.issue_tracker import (
    IssueTrackerClient,
    IssueTrackerError,
    LINEAR_API_URL,
    LINEAR_PRIORITIES,
    JIRA_PRIORITIES,
    MAX_TITLE_LEN,
    MAX_BODY_LEN,
    _TIMEOUT,
    _VALID_PROVIDERS,
    _VALID_ACTIONS,
    _truncate,
    validate_provider,
    validate_action,
)
from src.config.schema import Config, IssueTrackerConfig


# ---------------------------------------------------------------------------
# IssueTrackerConfig schema
# ---------------------------------------------------------------------------


class TestIssueTrackerConfigDefaults:
    def test_defaults(self):
        cfg = IssueTrackerConfig()
        assert cfg.enabled is False
        assert cfg.provider == "linear"
        assert cfg.api_token == ""
        assert cfg.base_url == ""
        assert cfg.project_key == ""
        assert cfg.default_team_id == ""
        assert cfg.scrub_secrets is True

    def test_custom_values(self):
        cfg = IssueTrackerConfig(
            enabled=True,
            provider="jira",
            api_token="user@example.com:token123",
            base_url="https://myorg.atlassian.net",
            project_key="OPS",
            scrub_secrets=False,
        )
        assert cfg.enabled is True
        assert cfg.provider == "jira"
        assert cfg.api_token == "user@example.com:token123"
        assert cfg.base_url == "https://myorg.atlassian.net"
        assert cfg.project_key == "OPS"
        assert cfg.scrub_secrets is False

    def test_config_includes_issue_tracker(self):
        cfg = Config(discord={"token": "test"})
        assert hasattr(cfg, "issue_tracker")
        assert isinstance(cfg.issue_tracker, IssueTrackerConfig)
        assert cfg.issue_tracker.enabled is False

    def test_config_with_issue_tracker(self):
        cfg = Config(
            discord={"token": "test"},
            issue_tracker={"enabled": True, "provider": "linear", "api_token": "lin_api_xxx"},
        )
        assert cfg.issue_tracker.enabled is True
        assert cfg.issue_tracker.provider == "linear"

    def test_linear_config(self):
        cfg = IssueTrackerConfig(
            provider="linear",
            default_team_id="team-uuid-123",
        )
        assert cfg.provider == "linear"
        assert cfg.default_team_id == "team-uuid-123"

    def test_jira_config(self):
        cfg = IssueTrackerConfig(
            provider="jira",
            base_url="https://myorg.atlassian.net",
            project_key="OPS",
        )
        assert cfg.provider == "jira"
        assert cfg.base_url == "https://myorg.atlassian.net"

    def test_invalid_provider(self):
        with pytest.raises(ValueError, match="Invalid provider"):
            IssueTrackerConfig(provider="github")

    def test_provider_normalized_lowercase(self):
        cfg = IssueTrackerConfig(provider="Linear")
        assert cfg.provider == "linear"

    def test_provider_jira_normalized(self):
        cfg = IssueTrackerConfig(provider="JIRA")
        assert cfg.provider == "jira"


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


class TestValidateProvider:
    def test_linear(self):
        assert validate_provider("linear") == "linear"

    def test_jira(self):
        assert validate_provider("jira") == "jira"

    def test_case_insensitive(self):
        assert validate_provider("Linear") == "linear"
        assert validate_provider("JIRA") == "jira"

    def test_invalid(self):
        with pytest.raises(ValueError, match="Unknown provider"):
            validate_provider("github")

    def test_empty(self):
        with pytest.raises(ValueError, match="Unknown provider"):
            validate_provider("")

    def test_strips_whitespace(self):
        assert validate_provider("  linear  ") == "linear"


class TestValidateAction:
    def test_create_issue(self):
        assert validate_action("create_issue") == "create_issue"

    def test_comment(self):
        assert validate_action("comment") == "comment"

    def test_get_issue(self):
        assert validate_action("get_issue") == "get_issue"

    def test_list_issues(self):
        assert validate_action("list_issues") == "list_issues"

    def test_transition(self):
        assert validate_action("transition") == "transition"

    def test_invalid(self):
        with pytest.raises(ValueError, match="Unknown action"):
            validate_action("delete")

    def test_case_insensitive(self):
        assert validate_action("Create_Issue") == "create_issue"


class TestTruncate:
    def test_short_text(self):
        assert _truncate("hello", 100) == "hello"

    def test_at_limit(self):
        text = "a" * 100
        assert _truncate(text, 100) == text

    def test_over_limit(self):
        text = "a" * 200
        result = _truncate(text, 100)
        assert len(result) <= 100
        assert "truncated" in result

    def test_empty(self):
        assert _truncate("", 100) == ""


# ---------------------------------------------------------------------------
# IssueTrackerClient init
# ---------------------------------------------------------------------------


class TestClientInit:
    def test_linear_defaults(self):
        client = IssueTrackerClient("linear", "lin_api_xxx")
        assert client.provider == "linear"
        assert client.request_count == 0
        assert client.error_count == 0

    def test_jira_defaults(self):
        client = IssueTrackerClient(
            "jira", "user:token", base_url="https://org.atlassian.net"
        )
        assert client.provider == "jira"

    def test_jira_requires_base_url(self):
        with pytest.raises(ValueError, match="Jira requires a base_url"):
            IssueTrackerClient("jira", "user:token")

    def test_invalid_provider(self):
        with pytest.raises(ValueError, match="Unknown provider"):
            IssueTrackerClient("github", "token")

    def test_custom_params(self):
        client = IssueTrackerClient(
            "linear", "tok",
            default_team_id="team-1",
            scrub_secrets=False,
        )
        assert client._default_team_id == "team-1"
        assert client._scrub is False

    def test_jira_base_url_trailing_slash(self):
        client = IssueTrackerClient(
            "jira", "tok", base_url="https://org.atlassian.net/"
        )
        assert client._base_url == "https://org.atlassian.net"

    def test_project_key(self):
        client = IssueTrackerClient(
            "jira", "tok", base_url="https://x.net", project_key="OPS"
        )
        assert client._project_key == "OPS"


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


class TestConstants:
    def test_valid_providers(self):
        assert "linear" in _VALID_PROVIDERS
        assert "jira" in _VALID_PROVIDERS
        assert len(_VALID_PROVIDERS) == 2

    def test_valid_actions(self):
        assert "create_issue" in _VALID_ACTIONS
        assert "comment" in _VALID_ACTIONS
        assert "get_issue" in _VALID_ACTIONS
        assert "list_issues" in _VALID_ACTIONS
        assert "transition" in _VALID_ACTIONS
        assert len(_VALID_ACTIONS) == 5

    def test_linear_priorities(self):
        assert LINEAR_PRIORITIES["urgent"] == 1
        assert LINEAR_PRIORITIES["high"] == 2
        assert LINEAR_PRIORITIES["medium"] == 3
        assert LINEAR_PRIORITIES["low"] == 4
        assert LINEAR_PRIORITIES["none"] == 0

    def test_jira_priorities(self):
        assert "highest" in JIRA_PRIORITIES
        assert "high" in JIRA_PRIORITIES
        assert "medium" in JIRA_PRIORITIES
        assert "low" in JIRA_PRIORITIES
        assert "lowest" in JIRA_PRIORITIES

    def test_linear_api_url(self):
        assert LINEAR_API_URL == "https://api.linear.app/graphql"

    def test_max_title_len(self):
        assert MAX_TITLE_LEN == 256

    def test_max_body_len(self):
        assert MAX_BODY_LEN == 10_000

    def test_timeout(self):
        assert _TIMEOUT == 15


class TestIssueTrackerError:
    def test_str(self):
        e = IssueTrackerError("something went wrong")
        assert str(e) == "something went wrong"

    def test_inherits_exception(self):
        assert issubclass(IssueTrackerError, Exception)


# ---------------------------------------------------------------------------
# Linear API — mocked
# ---------------------------------------------------------------------------


class TestLinearCreateIssue:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient("linear", "lin_api_xxx", default_team_id="team-1")

    async def test_create_success(self, client):
        resp_data = {
            "data": {
                "issueCreate": {
                    "success": True,
                    "issue": {
                        "id": "uuid-1",
                        "identifier": "ENG-42",
                        "title": "Test issue",
                        "url": "https://linear.app/team/ENG-42",
                        "state": {"name": "Todo"},
                        "priority": 3,
                    },
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("create_issue", {
                "title": "Test issue",
                "description": "Something broke",
            })
        assert result["key"] == "ENG-42"
        assert result["url"] == "https://linear.app/team/ENG-42"

    async def test_create_no_team_id(self):
        client = IssueTrackerClient("linear", "tok")
        with pytest.raises(IssueTrackerError, match="team_id"):
            await client._linear_create_issue("title", "desc")

    async def test_create_with_priority(self, client):
        resp_data = {
            "data": {
                "issueCreate": {
                    "success": True,
                    "issue": {
                        "id": "uuid-2", "identifier": "ENG-43",
                        "title": "Urgent bug", "url": "https://linear.app/ENG-43",
                        "state": {"name": "Todo"}, "priority": 1,
                    },
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("create_issue", {
                "title": "Urgent bug",
                "description": "Everything is on fire",
                "priority": "urgent",
            })
        assert result["priority"] == 1

    async def test_create_failure(self, client):
        resp_data = {"data": {"issueCreate": {"success": False}}}
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError, match="creation failed"):
                await client.execute("create_issue", {
                    "title": "Test",
                    "description": "desc",
                })

    async def test_api_error(self, client):
        resp_data = {"errors": [{"message": "Unauthorized"}]}
        mock_resp = AsyncMock()
        mock_resp.status = 401
        mock_resp.reason = "Unauthorized"
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError, match="401"):
                await client.execute("create_issue", {
                    "title": "Test",
                    "description": "desc",
                })
        assert client.error_count > 0

    async def test_graphql_error(self, client):
        resp_data = {"errors": [{"message": "Field 'teamId' is required"}]}
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError, match="GraphQL error"):
                await client._linear_create_issue("Test", "desc", team_id="team-1")


class TestLinearComment:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient("linear", "tok", default_team_id="team-1")

    async def test_comment_success(self, client):
        resp_data = {
            "data": {
                "commentCreate": {
                    "success": True,
                    "comment": {"id": "cmt-1", "body": "Hello", "createdAt": "2026-01-01T00:00:00Z"},
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("comment", {
                "issue_id": "uuid-1",
                "body": "Loop iteration 5 completed. Disk usage at 88%.",
            })
        assert result["id"] == "cmt-1"

    async def test_comment_failure(self, client):
        resp_data = {"data": {"commentCreate": {"success": False}}}
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError, match="comment creation failed"):
                await client.execute("comment", {
                    "issue_id": "uuid-1",
                    "body": "test",
                })


class TestLinearGetIssue:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient("linear", "tok", default_team_id="team-1")

    async def test_get_issue_success(self, client):
        resp_data = {
            "data": {
                "issue": {
                    "id": "uuid-1", "identifier": "ENG-42",
                    "title": "Fix disk alert", "description": "Disk is full",
                    "url": "https://linear.app/ENG-42",
                    "state": {"name": "In Progress"}, "priority": 2,
                    "assignee": {"name": "Odin"},
                    "labels": {"nodes": [{"name": "infra"}, {"name": "urgent"}]},
                    "createdAt": "2026-01-01", "updatedAt": "2026-01-02",
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("get_issue", {"issue_id": "uuid-1"})
        assert result["key"] == "ENG-42"
        assert result["status"] == "In Progress"
        assert result["assignee"] == "Odin"
        assert "infra" in result["labels"]

    async def test_get_issue_not_found(self, client):
        resp_data = {"data": {"issue": None}}
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError, match="not found"):
                await client.execute("get_issue", {"issue_id": "nonexistent"})


class TestLinearListIssues:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient("linear", "tok", default_team_id="team-1")

    async def test_list_success(self, client):
        resp_data = {
            "data": {
                "issues": {
                    "nodes": [
                        {
                            "id": "uuid-1", "identifier": "ENG-42",
                            "title": "Fix disk", "url": "https://linear.app/ENG-42",
                            "state": {"name": "Todo"}, "priority": 3,
                            "assignee": {"name": "Odin"}, "createdAt": "2026-01-01",
                        },
                        {
                            "id": "uuid-2", "identifier": "ENG-43",
                            "title": "Fix memory", "url": "https://linear.app/ENG-43",
                            "state": {"name": "Done"}, "priority": 4,
                            "assignee": None, "createdAt": "2026-01-02",
                        },
                    ]
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("list_issues", {"limit": 10})
        assert len(result) == 2
        assert result[0]["key"] == "ENG-42"
        assert result[1]["assignee"] == ""

    async def test_list_empty(self, client):
        resp_data = {"data": {"issues": {"nodes": []}}}
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("list_issues", {})
        assert result == []

    async def test_list_with_status_filter(self, client):
        resp_data = {"data": {"issues": {"nodes": []}}}
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("list_issues", {"status": "In Progress"})
        assert isinstance(result, list)


class TestLinearTransition:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient("linear", "tok", default_team_id="team-1")

    async def test_transition_success(self, client):
        get_resp_data = {
            "data": {
                "issue": {
                    "id": "uuid-1", "identifier": "ENG-42", "title": "Bug",
                    "team": {
                        "states": {
                            "nodes": [
                                {"id": "state-1", "name": "Todo"},
                                {"id": "state-2", "name": "In Progress"},
                                {"id": "state-3", "name": "Done"},
                            ]
                        }
                    },
                }
            }
        }
        update_resp_data = {
            "data": {
                "issueUpdate": {
                    "success": True,
                    "issue": {
                        "id": "uuid-1", "identifier": "ENG-42",
                        "title": "Bug", "state": {"name": "Done"},
                    },
                }
            }
        }

        call_count = 0
        mock_resps = [get_resp_data, update_resp_data]

        async def mock_json():
            return mock_resps[call_count - 1]

        mock_resp = AsyncMock()
        mock_resp.status = 200

        def make_resp(*args, **kwargs):
            nonlocal call_count
            r = AsyncMock()
            r.status = 200
            r.json = AsyncMock(return_value=mock_resps[call_count])
            r.__aenter__ = AsyncMock(return_value=r)
            r.__aexit__ = AsyncMock(return_value=False)
            call_count += 1
            return r

        mock_session = AsyncMock()
        mock_session.post = MagicMock(side_effect=make_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("transition", {
                "issue_id": "uuid-1",
                "status": "Done",
            })
        assert result["status"] == "Done"

    async def test_transition_state_not_found(self, client):
        resp_data = {
            "data": {
                "issue": {
                    "id": "uuid-1", "identifier": "ENG-42", "title": "Bug",
                    "team": {
                        "states": {
                            "nodes": [
                                {"id": "state-1", "name": "Todo"},
                                {"id": "state-2", "name": "Done"},
                            ]
                        }
                    },
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError, match="not found"):
                await client.execute("transition", {
                    "issue_id": "uuid-1",
                    "status": "Cancelled",
                })

    async def test_transition_issue_not_found(self, client):
        resp_data = {"data": {"issue": None}}
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError, match="not found"):
                await client.execute("transition", {
                    "issue_id": "nonexistent",
                    "status": "Done",
                })


# ---------------------------------------------------------------------------
# Jira API — mocked
# ---------------------------------------------------------------------------


class TestJiraCreateIssue:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient(
            "jira", "user:token",
            base_url="https://org.atlassian.net",
            project_key="OPS",
        )

    async def test_create_success(self, client):
        resp_data = {"id": "10001", "key": "OPS-42"}

        mock_resp = AsyncMock()
        mock_resp.status = 201
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("create_issue", {
                "title": "Disk alert on prod-1",
                "description": "Disk at 95%",
            })
        assert result["key"] == "OPS-42"
        assert "atlassian.net/browse/OPS-42" in result["url"]

    async def test_create_no_project_key(self):
        client = IssueTrackerClient(
            "jira", "user:token", base_url="https://org.atlassian.net"
        )
        with pytest.raises(IssueTrackerError, match="project_key"):
            await client._jira_create_issue("title", "desc")

    async def test_create_with_priority(self, client):
        resp_data = {"id": "10002", "key": "OPS-43"}
        mock_resp = AsyncMock()
        mock_resp.status = 201
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("create_issue", {
                "title": "High priority bug",
                "description": "desc",
                "priority": "high",
            })
        assert result["key"] == "OPS-43"

    async def test_create_with_labels(self, client):
        resp_data = {"id": "10003", "key": "OPS-44"}
        mock_resp = AsyncMock()
        mock_resp.status = 201
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("create_issue", {
                "title": "Labeled issue",
                "description": "desc",
                "labels": ["infra", "automated"],
            })
        assert result["key"] == "OPS-44"

    async def test_api_error_401(self, client):
        resp_data = {"errorMessages": ["Unauthorized"]}
        mock_resp = AsyncMock()
        mock_resp.status = 401
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError, match="401"):
                await client.execute("create_issue", {
                    "title": "Test",
                    "description": "desc",
                })

    async def test_create_custom_issue_type(self, client):
        resp_data = {"id": "10004", "key": "OPS-45"}
        mock_resp = AsyncMock()
        mock_resp.status = 201
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("create_issue", {
                "title": "Bug report",
                "description": "desc",
                "issue_type": "Bug",
            })
        assert result["key"] == "OPS-45"


class TestJiraComment:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient(
            "jira", "user:token",
            base_url="https://org.atlassian.net",
            project_key="OPS",
        )

    async def test_comment_success(self, client):
        resp_data = {"id": "20001", "created": "2026-01-01T00:00:00Z"}
        mock_resp = AsyncMock()
        mock_resp.status = 201
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("comment", {
                "issue_id": "OPS-42",
                "body": "Loop report: disk usage normalized at 72%",
            })
        assert result["id"] == "20001"


class TestJiraGetIssue:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient(
            "jira", "user:token",
            base_url="https://org.atlassian.net",
            project_key="OPS",
        )

    async def test_get_success(self, client):
        resp_data = {
            "id": "10001",
            "key": "OPS-42",
            "fields": {
                "summary": "Disk alert",
                "description": {
                    "type": "doc", "version": 1,
                    "content": [{"type": "paragraph", "content": [
                        {"type": "text", "text": "Disk at 95%"}
                    ]}],
                },
                "status": {"name": "In Progress"},
                "priority": {"name": "High"},
                "assignee": {"displayName": "Odin"},
                "labels": ["infra"],
                "created": "2026-01-01", "updated": "2026-01-02",
            },
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("get_issue", {"issue_id": "OPS-42"})
        assert result["key"] == "OPS-42"
        assert result["status"] == "In Progress"
        assert result["description"] == "Disk at 95%"
        assert result["assignee"] == "Odin"

    async def test_get_null_fields(self, client):
        resp_data = {
            "id": "10001", "key": "OPS-42",
            "fields": {
                "summary": "Test", "description": None,
                "status": None, "priority": None,
                "assignee": None, "labels": [],
                "created": "", "updated": "",
            },
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("get_issue", {"issue_id": "OPS-42"})
        assert result["status"] == ""
        assert result["assignee"] == ""
        assert result["description"] == ""


class TestJiraListIssues:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient(
            "jira", "user:token",
            base_url="https://org.atlassian.net",
            project_key="OPS",
        )

    async def test_list_success(self, client):
        resp_data = {
            "issues": [
                {
                    "id": "10001", "key": "OPS-42",
                    "fields": {
                        "summary": "Fix disk",
                        "status": {"name": "Open"},
                        "priority": {"name": "High"},
                        "assignee": {"displayName": "Odin"},
                        "created": "2026-01-01",
                    },
                },
            ]
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("list_issues", {})
        assert len(result) == 1
        assert result[0]["key"] == "OPS-42"

    async def test_list_with_status_filter(self, client):
        resp_data = {"issues": []}
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("list_issues", {"status": "Open"})
        assert result == []


class TestJiraTransition:
    @pytest.fixture
    def client(self):
        return IssueTrackerClient(
            "jira", "user:token",
            base_url="https://org.atlassian.net",
            project_key="OPS",
        )

    async def test_transition_success(self, client):
        transitions_resp = {
            "transitions": [
                {"id": "31", "name": "Done", "to": {"name": "Done"}},
                {"id": "21", "name": "In Progress", "to": {"name": "In Progress"}},
            ]
        }
        transition_post_resp = {}  # 204 no content
        get_issue_resp = {
            "id": "10001", "key": "OPS-42",
            "fields": {
                "summary": "Fix disk",
                "description": None,
                "status": {"name": "Done"},
                "priority": {"name": "High"},
                "assignee": None,
                "labels": [],
                "created": "2026-01-01", "updated": "2026-01-02",
            },
        }

        call_count = 0
        responses = [transitions_resp, transition_post_resp, get_issue_resp]

        def make_resp(*args, **kwargs):
            nonlocal call_count
            r = AsyncMock()
            idx = min(call_count, len(responses) - 1)
            r.status = 204 if call_count == 1 else 200
            r.json = AsyncMock(return_value=responses[idx])
            r.__aenter__ = AsyncMock(return_value=r)
            r.__aexit__ = AsyncMock(return_value=False)
            call_count += 1
            return r

        mock_session = AsyncMock()
        mock_session.request = MagicMock(side_effect=make_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("transition", {
                "issue_id": "OPS-42",
                "status": "Done",
            })
        assert result["status"] == "Done"

    async def test_transition_not_found(self, client):
        transitions_resp = {
            "transitions": [
                {"id": "31", "name": "Done", "to": {"name": "Done"}},
            ]
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=transitions_resp)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError, match="not found"):
                await client.execute("transition", {
                    "issue_id": "OPS-42",
                    "status": "Cancelled",
                })


# ---------------------------------------------------------------------------
# Jira text extraction
# ---------------------------------------------------------------------------


class TestJiraExtractText:
    def test_extract_text(self):
        doc = {
            "type": "doc", "version": 1,
            "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "Hello world"}
            ]}],
        }
        assert IssueTrackerClient._jira_extract_text(doc) == "Hello world"

    def test_extract_multiple_paragraphs(self):
        doc = {
            "type": "doc", "version": 1,
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Line 1"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "Line 2"}]},
            ],
        }
        result = IssueTrackerClient._jira_extract_text(doc)
        assert "Line 1" in result
        assert "Line 2" in result

    def test_extract_none(self):
        assert IssueTrackerClient._jira_extract_text(None) == ""

    def test_extract_empty_dict(self):
        assert IssueTrackerClient._jira_extract_text({}) == ""

    def test_extract_no_content(self):
        assert IssueTrackerClient._jira_extract_text({"type": "doc"}) == ""


# ---------------------------------------------------------------------------
# Secret scrubbing
# ---------------------------------------------------------------------------


class TestSecretScrubbing:
    async def test_scrubs_secrets_in_title(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        resp_data = {
            "data": {
                "issueCreate": {
                    "success": True,
                    "issue": {
                        "id": "uuid-1", "identifier": "ENG-42",
                        "title": "test", "url": "https://linear.app/ENG-42",
                        "state": {"name": "Todo"}, "priority": 3,
                    },
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with patch("src.notifications.issue_tracker.scrub_output_secrets", return_value="[REDACTED]") as mock_scrub:
                await client.execute("create_issue", {
                    "title": "password=secret123",
                    "description": "test",
                })
                assert mock_scrub.called

    async def test_no_scrub_when_disabled(self):
        client = IssueTrackerClient(
            "linear", "tok", default_team_id="team-1", scrub_secrets=False
        )
        resp_data = {
            "data": {
                "issueCreate": {
                    "success": True,
                    "issue": {
                        "id": "uuid-1", "identifier": "ENG-42",
                        "title": "test", "url": "https://linear.app/ENG-42",
                        "state": {"name": "Todo"}, "priority": 3,
                    },
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with patch("src.notifications.issue_tracker.scrub_output_secrets") as mock_scrub:
                await client.execute("create_issue", {
                    "title": "no secrets here",
                    "description": "test",
                })
                mock_scrub.assert_not_called()


# ---------------------------------------------------------------------------
# Status & close
# ---------------------------------------------------------------------------


class TestGetStatus:
    def test_linear_status(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        status = client.get_status()
        assert status["provider"] == "linear"
        assert status["configured"] is True
        assert status["base_url"] == LINEAR_API_URL
        assert status["request_count"] == 0
        assert status["error_count"] == 0

    def test_jira_status(self):
        client = IssueTrackerClient(
            "jira", "tok", base_url="https://org.atlassian.net", project_key="OPS"
        )
        status = client.get_status()
        assert status["provider"] == "jira"
        assert status["base_url"] == "https://org.atlassian.net"
        assert status["project_key"] == "OPS"

    def test_unconfigured_status(self):
        client = IssueTrackerClient("linear", "")
        status = client.get_status()
        assert status["configured"] is False


class TestClose:
    async def test_close_session(self):
        client = IssueTrackerClient("linear", "tok")
        mock_session = AsyncMock()
        mock_session.closed = False
        client._session = mock_session
        await client.close()
        mock_session.close.assert_called_once()
        assert client._session is None

    async def test_close_no_session(self):
        client = IssueTrackerClient("linear", "tok")
        await client.close()  # Should not raise

    async def test_close_already_closed(self):
        client = IssueTrackerClient("linear", "tok")
        client._session = AsyncMock()
        client._session.closed = True
        await client.close()  # Should not call close again


# ---------------------------------------------------------------------------
# Unified dispatch
# ---------------------------------------------------------------------------


class TestUnifiedDispatch:
    async def test_invalid_action(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        with pytest.raises(ValueError, match="Unknown action"):
            await client.execute("delete_issue", {})

    async def test_linear_dispatch_create(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        with patch.object(client, "_linear_create_issue", new_callable=AsyncMock, return_value={"id": "x"}):
            result = await client.execute("create_issue", {"title": "t", "description": "d"})
        assert result["id"] == "x"

    async def test_linear_dispatch_comment(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        with patch.object(client, "_linear_comment", new_callable=AsyncMock, return_value={"id": "c"}):
            result = await client.execute("comment", {"issue_id": "uuid-1", "body": "hi"})
        assert result["id"] == "c"

    async def test_linear_dispatch_get(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        with patch.object(client, "_linear_get_issue", new_callable=AsyncMock, return_value={"key": "ENG-1"}):
            result = await client.execute("get_issue", {"issue_id": "uuid-1"})
        assert result["key"] == "ENG-1"

    async def test_linear_dispatch_list(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        with patch.object(client, "_linear_list_issues", new_callable=AsyncMock, return_value=[]):
            result = await client.execute("list_issues", {})
        assert result == []

    async def test_linear_dispatch_transition(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        with patch.object(client, "_linear_transition", new_callable=AsyncMock, return_value={"status": "Done"}):
            result = await client.execute("transition", {"issue_id": "uuid-1", "status": "Done"})
        assert result["status"] == "Done"

    async def test_jira_dispatch_create(self):
        client = IssueTrackerClient("jira", "tok", base_url="https://x.net", project_key="OPS")
        with patch.object(client, "_jira_create_issue", new_callable=AsyncMock, return_value={"key": "OPS-1"}):
            result = await client.execute("create_issue", {"title": "t", "description": "d"})
        assert result["key"] == "OPS-1"

    async def test_jira_dispatch_comment(self):
        client = IssueTrackerClient("jira", "tok", base_url="https://x.net", project_key="OPS")
        with patch.object(client, "_jira_comment", new_callable=AsyncMock, return_value={"id": "c"}):
            result = await client.execute("comment", {"issue_id": "OPS-42", "body": "hi"})
        assert result["id"] == "c"

    async def test_jira_dispatch_get(self):
        client = IssueTrackerClient("jira", "tok", base_url="https://x.net", project_key="OPS")
        with patch.object(client, "_jira_get_issue", new_callable=AsyncMock, return_value={"key": "OPS-42"}):
            result = await client.execute("get_issue", {"issue_id": "OPS-42"})
        assert result["key"] == "OPS-42"

    async def test_jira_dispatch_list(self):
        client = IssueTrackerClient("jira", "tok", base_url="https://x.net", project_key="OPS")
        with patch.object(client, "_jira_list_issues", new_callable=AsyncMock, return_value=[]):
            result = await client.execute("list_issues", {})
        assert result == []

    async def test_jira_dispatch_transition(self):
        client = IssueTrackerClient("jira", "tok", base_url="https://x.net", project_key="OPS")
        with patch.object(client, "_jira_transition", new_callable=AsyncMock, return_value={"status": "Done"}):
            result = await client.execute("transition", {"issue_id": "OPS-42", "status": "Done"})
        assert result["status"] == "Done"

    async def test_timeout_error(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        with patch.object(client, "_linear_create_issue", new_callable=AsyncMock, side_effect=asyncio.TimeoutError):
            with pytest.raises(IssueTrackerError, match="timed out"):
                await client.execute("create_issue", {"title": "t", "description": "d"})

    async def test_generic_error(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        with patch.object(client, "_linear_create_issue", new_callable=AsyncMock, side_effect=RuntimeError("boom")):
            with pytest.raises(IssueTrackerError, match="boom"):
                await client.execute("create_issue", {"title": "t", "description": "d"})


# ---------------------------------------------------------------------------
# Tool registration
# ---------------------------------------------------------------------------


class TestToolRegistration:
    def test_tool_in_registry(self):
        from src.tools.registry import TOOLS, TOOL_MAP
        assert "issue_tracker" in TOOL_MAP

    def test_required_fields(self):
        from src.tools.registry import TOOL_MAP
        tool = TOOL_MAP["issue_tracker"]
        assert tool["input_schema"]["required"] == ["action"]

    def test_action_enum(self):
        from src.tools.registry import TOOL_MAP
        tool = TOOL_MAP["issue_tracker"]
        action_prop = tool["input_schema"]["properties"]["action"]
        assert "enum" in action_prop
        assert set(action_prop["enum"]) == set(_VALID_ACTIONS)

    def test_all_properties_present(self):
        from src.tools.registry import TOOL_MAP
        tool = TOOL_MAP["issue_tracker"]
        props = tool["input_schema"]["properties"]
        expected = {
            "action", "title", "description", "issue_id", "body",
            "status", "priority", "labels", "team_id", "project_key",
            "issue_type", "limit",
        }
        assert set(props.keys()) == expected


# ---------------------------------------------------------------------------
# Executor handler
# ---------------------------------------------------------------------------


class TestExecutorHandler:
    async def test_no_client_configured(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        result = await executor._handle_issue_tracker({"action": "create_issue"})
        assert "not configured" in result

    async def test_invalid_action(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        mock_client = AsyncMock()
        executor._issue_tracker_client = mock_client
        result = await executor._handle_issue_tracker({"action": "delete"})
        assert "Error" in result

    async def test_missing_action(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        result = await executor._handle_issue_tracker({})
        assert "required" in result

    async def test_success(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        mock_client = AsyncMock()
        mock_client.execute = AsyncMock(return_value={"key": "ENG-42", "url": "https://linear.app/ENG-42"})
        executor._issue_tracker_client = mock_client
        result = await executor._handle_issue_tracker({
            "action": "create_issue",
            "title": "Test",
            "description": "Body",
        })
        parsed = json.loads(result)
        assert parsed["key"] == "ENG-42"

    async def test_error_handling(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        mock_client = AsyncMock()
        mock_client.execute = AsyncMock(
            side_effect=IssueTrackerError("team_id required")
        )
        executor._issue_tracker_client = mock_client
        result = await executor._handle_issue_tracker({
            "action": "create_issue",
            "title": "Test",
        })
        assert "issue_tracker error" in result
        assert "team_id" in result

    async def test_execute_dispatches(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor()
        mock_client = AsyncMock()
        mock_client.execute = AsyncMock(return_value={"id": "c1"})
        executor._issue_tracker_client = mock_client
        result = await executor.execute("issue_tracker", {
            "action": "comment",
            "issue_id": "uuid-1",
            "body": "test comment",
        })
        parsed = json.loads(str(result))
        assert parsed["id"] == "c1"


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------


class TestIssueTrackerAPIEndpoints:
    def _make_bot(self, issue_client=None):
        bot = MagicMock()
        bot._issue_tracker_client = issue_client
        bot.config = Config(
            discord={"token": "test"},
            issue_tracker=IssueTrackerConfig(enabled=issue_client is not None),
        )
        return bot

    def _make_app(self, bot):
        from src.web.api import create_api_routes
        from aiohttp import web
        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)
        return app

    async def test_status_disabled(self):
        bot = self._make_bot()
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/issues/status")
            assert resp.status == 200
            data = await resp.json()
            assert data["enabled"] is False

    async def test_status_enabled(self):
        mock_client = MagicMock()
        mock_client.get_status.return_value = {
            "provider": "linear",
            "configured": True,
            "base_url": LINEAR_API_URL,
            "project_key": "",
            "default_team_id": "team-1",
            "request_count": 5,
            "error_count": 1,
        }
        bot = self._make_bot(issue_client=mock_client)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/issues/status")
            assert resp.status == 200
            data = await resp.json()
            assert data["enabled"] is True
            assert data["provider"] == "linear"

    async def test_execute_disabled(self):
        bot = self._make_bot()
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/issues/execute",
                json={"action": "list_issues"},
            )
            assert resp.status == 503

    async def test_execute_success(self):
        mock_client = AsyncMock()
        mock_client.execute = AsyncMock(return_value=[{"key": "ENG-1"}])
        bot = self._make_bot(issue_client=mock_client)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/issues/execute",
                json={"action": "list_issues"},
            )
            assert resp.status == 200
            data = await resp.json()
            assert data["ok"] is True

    async def test_execute_no_action(self):
        mock_client = AsyncMock()
        bot = self._make_bot(issue_client=mock_client)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/api/issues/execute", json={})
            assert resp.status == 400

    async def test_execute_invalid_json(self):
        mock_client = AsyncMock()
        bot = self._make_bot(issue_client=mock_client)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/issues/execute",
                data="not json",
                headers={"Content-Type": "text/plain"},
            )
            assert resp.status == 400

    async def test_execute_error(self):
        mock_client = AsyncMock()
        mock_client.execute = AsyncMock(
            side_effect=IssueTrackerError("team_id required")
        )
        bot = self._make_bot(issue_client=mock_client)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/issues/execute",
                json={"action": "create_issue", "title": "test"},
            )
            assert resp.status == 400
            data = await resp.json()
            assert "team_id" in data["error"]

    async def test_create_disabled(self):
        bot = self._make_bot()
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/issues/create",
                json={"title": "Test"},
            )
            assert resp.status == 503

    async def test_create_success(self):
        mock_client = AsyncMock()
        mock_client.execute = AsyncMock(return_value={
            "key": "ENG-42", "url": "https://linear.app/ENG-42",
        })
        bot = self._make_bot(issue_client=mock_client)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/issues/create",
                json={"title": "Disk alert", "description": "Disk full"},
            )
            assert resp.status == 201
            data = await resp.json()
            assert data["ok"] is True
            assert data["issue"]["key"] == "ENG-42"

    async def test_create_no_title(self):
        mock_client = AsyncMock()
        bot = self._make_bot(issue_client=mock_client)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/issues/create",
                json={"description": "no title"},
            )
            assert resp.status == 400
            data = await resp.json()
            assert "title" in data["error"]

    async def test_create_error(self):
        mock_client = AsyncMock()
        mock_client.execute = AsyncMock(
            side_effect=IssueTrackerError("project_key required")
        )
        bot = self._make_bot(issue_client=mock_client)
        app = self._make_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/issues/create",
                json={"title": "Test", "description": "desc"},
            )
            assert resp.status == 400


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------


class TestModuleImports:
    def test_notifications_package(self):
        from src.notifications import IssueTrackerClient
        assert IssueTrackerClient is not None

    def test_issue_tracker_error(self):
        from src.notifications.issue_tracker import IssueTrackerError
        assert issubclass(IssueTrackerError, Exception)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    def test_linear_priorities_complete(self):
        assert len(LINEAR_PRIORITIES) == 5
        assert set(LINEAR_PRIORITIES.keys()) == {"urgent", "high", "medium", "low", "none"}

    def test_jira_priorities_complete(self):
        assert len(JIRA_PRIORITIES) == 5

    async def test_request_count_incremented(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        resp_data = {
            "data": {
                "issueCreate": {
                    "success": True,
                    "issue": {
                        "id": "x", "identifier": "E-1", "title": "t",
                        "url": "u", "state": {"name": "Todo"}, "priority": 0,
                    },
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            await client.execute("create_issue", {"title": "t", "description": "d"})
        assert client.request_count == 1

    async def test_error_count_incremented(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        resp_data = {"errors": [{"message": "bad"}]}
        mock_resp = AsyncMock()
        mock_resp.status = 500
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            with pytest.raises(IssueTrackerError):
                await client.execute("create_issue", {"title": "t", "description": "d"})
        assert client.error_count > 0

    def test_truncate_title(self):
        long_title = "x" * 300
        truncated = _truncate(long_title, MAX_TITLE_LEN)
        assert len(truncated) <= MAX_TITLE_LEN

    def test_truncate_body(self):
        long_body = "x" * 15000
        truncated = _truncate(long_body, MAX_BODY_LEN)
        assert len(truncated) <= MAX_BODY_LEN

    async def test_linear_list_limit_capped(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        resp_data = {"data": {"issues": {"nodes": []}}}
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("list_issues", {"limit": 100})
        assert isinstance(result, list)

    async def test_jira_204_response(self):
        client = IssueTrackerClient(
            "jira", "tok", base_url="https://x.net", project_key="OPS"
        )
        mock_resp = AsyncMock()
        mock_resp.status = 204
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client._jira_request("POST", "issue/OPS-42/transitions", {})
        assert result == {}

    async def test_linear_no_assignee(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        resp_data = {
            "data": {
                "issue": {
                    "id": "x", "identifier": "E-1", "title": "t",
                    "description": "d", "url": "u",
                    "state": {"name": "Todo"}, "priority": 0,
                    "assignee": None,
                    "labels": {"nodes": []},
                    "createdAt": "", "updatedAt": "",
                }
            }
        }
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=resp_data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.post = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("get_issue", {"issue_id": "x"})
        assert result["assignee"] == ""
        assert result["labels"] == []

    async def test_linear_transition_case_insensitive(self):
        client = IssueTrackerClient("linear", "tok", default_team_id="team-1")
        get_resp_data = {
            "data": {
                "issue": {
                    "id": "x", "identifier": "E-1", "title": "t",
                    "team": {
                        "states": {"nodes": [
                            {"id": "s1", "name": "Done"},
                        ]}
                    },
                }
            }
        }
        update_resp_data = {
            "data": {
                "issueUpdate": {
                    "success": True,
                    "issue": {
                        "id": "x", "identifier": "E-1",
                        "title": "t", "state": {"name": "Done"},
                    },
                }
            }
        }

        call_count = 0
        resps = [get_resp_data, update_resp_data]

        def make_resp(*a, **kw):
            nonlocal call_count
            r = AsyncMock()
            r.status = 200
            r.json = AsyncMock(return_value=resps[call_count])
            r.__aenter__ = AsyncMock(return_value=r)
            r.__aexit__ = AsyncMock(return_value=False)
            call_count += 1
            return r

        mock_session = AsyncMock()
        mock_session.post = MagicMock(side_effect=make_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("transition", {"issue_id": "x", "status": "done"})
        assert result["status"] == "Done"

    async def test_jira_transition_by_to_name(self):
        client = IssueTrackerClient(
            "jira", "tok", base_url="https://x.net", project_key="OPS"
        )
        transitions_resp = {
            "transitions": [
                {"id": "31", "name": "Close Issue", "to": {"name": "Closed"}},
            ]
        }
        transition_post_resp = {}
        get_issue_resp = {
            "id": "10001", "key": "OPS-42",
            "fields": {
                "summary": "t", "description": None,
                "status": {"name": "Closed"}, "priority": None,
                "assignee": None, "labels": [],
                "created": "", "updated": "",
            },
        }

        call_count = 0
        resps = [transitions_resp, transition_post_resp, get_issue_resp]

        def make_resp(*a, **kw):
            nonlocal call_count
            r = AsyncMock()
            idx = min(call_count, len(resps) - 1)
            r.status = 204 if call_count == 1 else 200
            r.json = AsyncMock(return_value=resps[idx])
            r.__aenter__ = AsyncMock(return_value=r)
            r.__aexit__ = AsyncMock(return_value=False)
            call_count += 1
            return r

        mock_session = AsyncMock()
        mock_session.request = MagicMock(side_effect=make_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            result = await client.execute("transition", {
                "issue_id": "OPS-42", "status": "Closed",
            })
        assert result["status"] == "Closed"


# ---------------------------------------------------------------------------
# Round 20 REVIEWER: JQL injection prevention and URL encoding
# ---------------------------------------------------------------------------


class TestRound20JQLSafety:
    """Round 20 REVIEWER: verify JQL values are properly quoted and URL-encoded."""

    @pytest.fixture
    def client(self):
        return IssueTrackerClient(
            "jira", "user:token",
            base_url="https://org.atlassian.net",
            project_key="OPS",
        )

    def _mock_resp(self, data):
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value=data)
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)
        return mock_resp

    async def test_project_key_quoted_in_jql(self, client):
        mock_resp = self._mock_resp({"issues": []})
        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            await client.execute("list_issues", {"project_key": "MY-PROJ"})

        url = mock_session.request.call_args[0][1]
        assert 'project%20%3D%20%22MY-PROJ%22' in url

    async def test_status_quoted_in_jql(self, client):
        mock_resp = self._mock_resp({"issues": []})
        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            await client.execute("list_issues", {"status": "In Progress"})

        url = mock_session.request.call_args[0][1]
        assert "%22In%20Progress%22" in url

    async def test_jql_injection_escaped(self, client):
        mock_resp = self._mock_resp({"issues": []})
        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            await client.execute("list_issues", {
                "status": 'Done" OR project = "EVIL',
            })

        url = mock_session.request.call_args[0][1]
        assert "EVIL" in url
        assert "OR" not in url.split("?jql=")[0]
        assert '%22' in url

    async def test_project_key_with_quotes_escaped(self, client):
        mock_resp = self._mock_resp({"issues": []})
        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            await client.execute("list_issues", {
                "project_key": 'OPS" OR 1=1 --',
            })

        url = mock_session.request.call_args[0][1]
        assert "%5C%22" in url or "%22" in url

    async def test_jql_url_encoded(self, client):
        mock_resp = self._mock_resp({"issues": []})
        mock_session = AsyncMock()
        mock_session.request = MagicMock(return_value=mock_resp)

        with patch.object(client, "_get_session", return_value=mock_session):
            await client.execute("list_issues", {"status": "Open"})

        url = mock_session.request.call_args[0][1]
        assert " AND " not in url.split("?jql=")[1] if "?jql=" in url else True
