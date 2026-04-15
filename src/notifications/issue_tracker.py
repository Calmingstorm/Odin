"""Issue tracker integration for Linear and Jira.

Creates issues from loop reports, comments on existing issues, and queries
issue status. Uses REST APIs with aiohttp — no external SDKs required.
"""
from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import quote

import aiohttp

from ..llm.secret_scrubber import scrub_output_secrets
from ..odin_log import get_logger

log = get_logger("issue_tracker")

_TIMEOUT = 15  # seconds per API call
MAX_TITLE_LEN = 256
MAX_BODY_LEN = 10_000
_VALID_PROVIDERS = ("linear", "jira")
_VALID_ACTIONS = ("create_issue", "comment", "get_issue", "list_issues", "transition")

LINEAR_API_URL = "https://api.linear.app/graphql"

# Linear priority mapping: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
LINEAR_PRIORITIES = {"urgent": 1, "high": 2, "medium": 3, "low": 4, "none": 0}

# Jira priority names (standard defaults)
JIRA_PRIORITIES = {"highest": "Highest", "high": "High", "medium": "Medium",
                   "low": "Low", "lowest": "Lowest"}


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 20] + "\n…(truncated)"


def validate_provider(provider: str) -> str:
    p = provider.lower().strip()
    if p not in _VALID_PROVIDERS:
        raise ValueError(f"Unknown provider '{provider}'. Must be one of: {', '.join(_VALID_PROVIDERS)}")
    return p


def validate_action(action: str) -> str:
    a = action.lower().strip()
    if a not in _VALID_ACTIONS:
        raise ValueError(f"Unknown action '{action}'. Must be one of: {', '.join(_VALID_ACTIONS)}")
    return a


class IssueTrackerError(Exception):
    pass


class IssueTrackerClient:
    """Async client for Linear and Jira issue tracker APIs."""

    def __init__(
        self,
        provider: str,
        api_token: str,
        *,
        base_url: str = "",
        project_key: str = "",
        default_team_id: str = "",
        scrub_secrets: bool = True,
    ) -> None:
        self._provider = validate_provider(provider)
        self._api_token = api_token
        self._base_url = base_url.rstrip("/") if base_url else ""
        self._project_key = project_key
        self._default_team_id = default_team_id
        self._scrub = scrub_secrets
        self._session: aiohttp.ClientSession | None = None
        self._request_count = 0
        self._error_count = 0

        if self._provider == "jira" and not self._base_url:
            raise ValueError("Jira requires a base_url (e.g. https://yourorg.atlassian.net)")

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def request_count(self) -> int:
        return self._request_count

    @property
    def error_count(self) -> int:
        return self._error_count

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            headers: dict[str, str] = {"Content-Type": "application/json"}
            if self._provider == "linear":
                headers["Authorization"] = self._api_token
            elif self._provider == "jira":
                import base64
                cred = base64.b64encode(self._api_token.encode()).decode()
                headers["Authorization"] = f"Basic {cred}"
            self._session = aiohttp.ClientSession(
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=_TIMEOUT),
            )
        return self._session

    def _scrub_text(self, text: str) -> str:
        return scrub_output_secrets(text) if self._scrub else text

    # ------------------------------------------------------------------
    # Linear API
    # ------------------------------------------------------------------

    async def _linear_request(self, query: str, variables: dict | None = None) -> dict:
        session = await self._get_session()
        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables
        try:
            async with session.post(LINEAR_API_URL, json=payload) as resp:
                self._request_count += 1
                body = await resp.json()
                if resp.status != 200:
                    self._error_count += 1
                    msg = body.get("errors", [{}])[0].get("message", resp.reason) if isinstance(body, dict) else str(resp.status)
                    raise IssueTrackerError(f"Linear API error ({resp.status}): {msg}")
                if "errors" in body:
                    self._error_count += 1
                    msg = body["errors"][0].get("message", "unknown error")
                    raise IssueTrackerError(f"Linear GraphQL error: {msg}")
                return body.get("data", {})
        except aiohttp.ClientError as exc:
            self._request_count += 1
            self._error_count += 1
            raise IssueTrackerError(f"Linear request failed: {exc}") from exc

    async def _linear_create_issue(
        self, title: str, description: str, team_id: str = "",
        priority: str = "", labels: list[str] | None = None,
    ) -> dict[str, Any]:
        tid = team_id or self._default_team_id
        if not tid:
            raise IssueTrackerError("Linear requires a team_id (pass it or set default_team_id in config)")

        mutation = """
        mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                success
                issue { id identifier title url state { name } priority }
            }
        }
        """
        inp: dict[str, Any] = {
            "title": _truncate(title, MAX_TITLE_LEN),
            "description": _truncate(description, MAX_BODY_LEN),
            "teamId": tid,
        }
        if priority and priority.lower() in LINEAR_PRIORITIES:
            inp["priority"] = LINEAR_PRIORITIES[priority.lower()]
        if labels:
            inp["labelIds"] = labels

        data = await self._linear_request(mutation, {"input": inp})
        result = data.get("issueCreate", {})
        if not result.get("success"):
            raise IssueTrackerError("Linear issue creation failed")
        issue = result.get("issue", {})
        return {
            "id": issue.get("id", ""),
            "key": issue.get("identifier", ""),
            "title": issue.get("title", ""),
            "url": issue.get("url", ""),
            "status": issue.get("state", {}).get("name", ""),
            "priority": issue.get("priority", 0),
        }

    async def _linear_comment(self, issue_id: str, body: str) -> dict[str, Any]:
        mutation = """
        mutation CreateComment($input: CommentCreateInput!) {
            commentCreate(input: $input) {
                success
                comment { id body createdAt }
            }
        }
        """
        data = await self._linear_request(mutation, {
            "input": {"issueId": issue_id, "body": _truncate(body, MAX_BODY_LEN)}
        })
        result = data.get("commentCreate", {})
        if not result.get("success"):
            raise IssueTrackerError("Linear comment creation failed")
        comment = result.get("comment", {})
        return {
            "id": comment.get("id", ""),
            "created_at": comment.get("createdAt", ""),
        }

    async def _linear_get_issue(self, issue_id: str) -> dict[str, Any]:
        query = """
        query GetIssue($id: String!) {
            issue(id: $id) {
                id identifier title description url
                state { name } priority
                assignee { name } labels { nodes { name } }
                createdAt updatedAt
            }
        }
        """
        data = await self._linear_request(query, {"id": issue_id})
        issue = data.get("issue")
        if not issue:
            raise IssueTrackerError(f"Linear issue not found: {issue_id}")
        return {
            "id": issue.get("id", ""),
            "key": issue.get("identifier", ""),
            "title": issue.get("title", ""),
            "description": issue.get("description", ""),
            "url": issue.get("url", ""),
            "status": issue.get("state", {}).get("name", ""),
            "priority": issue.get("priority", 0),
            "assignee": (issue.get("assignee") or {}).get("name", ""),
            "labels": [n.get("name", "") for n in (issue.get("labels", {}).get("nodes") or [])],
            "created_at": issue.get("createdAt", ""),
            "updated_at": issue.get("updatedAt", ""),
        }

    async def _linear_list_issues(
        self, team_id: str = "", limit: int = 25, status: str = "",
    ) -> list[dict[str, Any]]:
        tid = team_id or self._default_team_id
        filter_parts = []
        if tid:
            filter_parts.append(f'team: {{ id: {{ eq: "{tid}" }} }}')
        if status:
            filter_parts.append(f'state: {{ name: {{ eq: "{status}" }} }}')
        filter_str = ", ".join(filter_parts)
        filter_clause = f", filter: {{ {filter_str} }}" if filter_str else ""

        query = f"""
        query ListIssues($first: Int!) {{
            issues(first: $first{filter_clause}) {{
                nodes {{
                    id identifier title url
                    state {{ name }} priority
                    assignee {{ name }}
                    createdAt
                }}
            }}
        }}
        """
        data = await self._linear_request(query, {"first": min(limit, 50)})
        nodes = data.get("issues", {}).get("nodes", [])
        return [
            {
                "id": n.get("id", ""),
                "key": n.get("identifier", ""),
                "title": n.get("title", ""),
                "url": n.get("url", ""),
                "status": n.get("state", {}).get("name", ""),
                "priority": n.get("priority", 0),
                "assignee": (n.get("assignee") or {}).get("name", ""),
                "created_at": n.get("createdAt", ""),
            }
            for n in nodes
        ]

    async def _linear_transition(self, issue_id: str, state_name: str) -> dict[str, Any]:
        # First find the state ID by name within the issue's team
        query = """
        query GetIssueTeam($id: String!) {
            issue(id: $id) {
                id identifier title
                team { states { nodes { id name } } }
            }
        }
        """
        data = await self._linear_request(query, {"id": issue_id})
        issue = data.get("issue")
        if not issue:
            raise IssueTrackerError(f"Linear issue not found: {issue_id}")

        states = issue.get("team", {}).get("states", {}).get("nodes", [])
        target_state = None
        for s in states:
            if s.get("name", "").lower() == state_name.lower():
                target_state = s
                break
        if not target_state:
            available = [s.get("name", "") for s in states]
            raise IssueTrackerError(
                f"State '{state_name}' not found. Available: {', '.join(available)}"
            )

        mutation = """
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) {
                success
                issue { id identifier title state { name } }
            }
        }
        """
        data = await self._linear_request(mutation, {
            "id": issue_id,
            "input": {"stateId": target_state["id"]},
        })
        result = data.get("issueUpdate", {})
        if not result.get("success"):
            raise IssueTrackerError("Linear issue transition failed")
        updated = result.get("issue", {})
        return {
            "id": updated.get("id", ""),
            "key": updated.get("identifier", ""),
            "title": updated.get("title", ""),
            "status": updated.get("state", {}).get("name", ""),
        }

    # ------------------------------------------------------------------
    # Jira API
    # ------------------------------------------------------------------

    async def _jira_request(
        self, method: str, path: str, body: dict | None = None,
    ) -> dict:
        session = await self._get_session()
        url = f"{self._base_url}/rest/api/3/{path.lstrip('/')}"
        try:
            async with session.request(method, url, json=body) as resp:
                self._request_count += 1
                if resp.status == 204:
                    return {}
                try:
                    data = await resp.json()
                except Exception:
                    data = {}
                if resp.status >= 400:
                    self._error_count += 1
                    errors = data.get("errorMessages", []) or [data.get("message", str(resp.status))]
                    raise IssueTrackerError(f"Jira API error ({resp.status}): {'; '.join(str(e) for e in errors)}")
                return data
        except aiohttp.ClientError as exc:
            self._request_count += 1
            self._error_count += 1
            raise IssueTrackerError(f"Jira request failed: {exc}") from exc

    async def _jira_create_issue(
        self, title: str, description: str, project_key: str = "",
        issue_type: str = "Task", priority: str = "", labels: list[str] | None = None,
    ) -> dict[str, Any]:
        pkey = project_key or self._project_key
        if not pkey:
            raise IssueTrackerError("Jira requires a project_key (pass it or set in config)")

        fields: dict[str, Any] = {
            "project": {"key": pkey},
            "summary": _truncate(title, MAX_TITLE_LEN),
            "description": {
                "type": "doc",
                "version": 1,
                "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": _truncate(description, MAX_BODY_LEN)}
                ]}],
            },
            "issuetype": {"name": issue_type},
        }
        if priority:
            pname = JIRA_PRIORITIES.get(priority.lower(), priority)
            fields["priority"] = {"name": pname}
        if labels:
            fields["labels"] = labels

        data = await self._jira_request("POST", "issue", {"fields": fields})
        return {
            "id": data.get("id", ""),
            "key": data.get("key", ""),
            "url": f"{self._base_url}/browse/{data.get('key', '')}",
        }

    async def _jira_comment(self, issue_key: str, body: str) -> dict[str, Any]:
        comment_body = {
            "body": {
                "type": "doc",
                "version": 1,
                "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": _truncate(body, MAX_BODY_LEN)}
                ]}],
            }
        }
        data = await self._jira_request("POST", f"issue/{issue_key}/comment", comment_body)
        return {
            "id": data.get("id", ""),
            "created_at": data.get("created", ""),
        }

    async def _jira_get_issue(self, issue_key: str) -> dict[str, Any]:
        data = await self._jira_request("GET", f"issue/{issue_key}")
        fields = data.get("fields", {})
        return {
            "id": data.get("id", ""),
            "key": data.get("key", ""),
            "title": fields.get("summary", ""),
            "description": self._jira_extract_text(fields.get("description")),
            "url": f"{self._base_url}/browse/{data.get('key', '')}",
            "status": (fields.get("status") or {}).get("name", ""),
            "priority": (fields.get("priority") or {}).get("name", ""),
            "assignee": (fields.get("assignee") or {}).get("displayName", ""),
            "labels": fields.get("labels", []),
            "created_at": fields.get("created", ""),
            "updated_at": fields.get("updated", ""),
        }

    async def _jira_list_issues(
        self, project_key: str = "", limit: int = 25, status: str = "",
    ) -> list[dict[str, Any]]:
        pkey = project_key or self._project_key
        jql_parts = []
        if pkey:
            safe_pkey = pkey.replace('"', '\\"')
            jql_parts.append(f'project = "{safe_pkey}"')
        if status:
            safe_status = status.replace('"', '\\"')
            jql_parts.append(f'status = "{safe_status}"')
        jql = " AND ".join(jql_parts) if jql_parts else "ORDER BY created DESC"

        data = await self._jira_request(
            "GET",
            f"search?jql={quote(jql, safe='')}&maxResults={min(limit, 50)}&fields=summary,status,priority,assignee,created",
        )
        issues = data.get("issues", [])
        return [
            {
                "id": i.get("id", ""),
                "key": i.get("key", ""),
                "title": i.get("fields", {}).get("summary", ""),
                "url": f"{self._base_url}/browse/{i.get('key', '')}",
                "status": (i.get("fields", {}).get("status") or {}).get("name", ""),
                "priority": (i.get("fields", {}).get("priority") or {}).get("name", ""),
                "assignee": (i.get("fields", {}).get("assignee") or {}).get("displayName", ""),
                "created_at": i.get("fields", {}).get("created", ""),
            }
            for i in issues
        ]

    async def _jira_transition(self, issue_key: str, status_name: str) -> dict[str, Any]:
        data = await self._jira_request("GET", f"issue/{issue_key}/transitions")
        transitions = data.get("transitions", [])
        target = None
        for t in transitions:
            if t.get("name", "").lower() == status_name.lower():
                target = t
                break
            if t.get("to", {}).get("name", "").lower() == status_name.lower():
                target = t
                break

        if not target:
            available = [t.get("name", "") for t in transitions]
            raise IssueTrackerError(
                f"Transition to '{status_name}' not found. Available: {', '.join(available)}"
            )

        await self._jira_request("POST", f"issue/{issue_key}/transitions", {
            "transition": {"id": target["id"]}
        })
        updated = await self._jira_get_issue(issue_key)
        return {
            "id": updated["id"],
            "key": updated["key"],
            "title": updated["title"],
            "status": updated["status"],
        }

    @staticmethod
    def _jira_extract_text(doc: dict | None) -> str:
        if not doc or not isinstance(doc, dict):
            return ""
        parts: list[str] = []
        for block in doc.get("content", []):
            for inline in block.get("content", []):
                if inline.get("type") == "text":
                    parts.append(inline.get("text", ""))
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Unified dispatch
    # ------------------------------------------------------------------

    async def execute(self, action: str, params: dict[str, Any]) -> dict[str, Any]:
        action = validate_action(action)
        if self._scrub:
            for key in ("title", "description", "body", "comment"):
                if key in params and isinstance(params[key], str):
                    params[key] = self._scrub_text(params[key])

        try:
            if self._provider == "linear":
                return await self._dispatch_linear(action, params)
            else:
                return await self._dispatch_jira(action, params)
        except IssueTrackerError:
            raise
        except asyncio.TimeoutError as exc:
            self._error_count += 1
            raise IssueTrackerError(f"{self._provider} request timed out") from exc
        except Exception as exc:
            self._error_count += 1
            raise IssueTrackerError(f"{self._provider} error: {exc}") from exc

    async def _dispatch_linear(self, action: str, params: dict) -> dict[str, Any]:
        if action == "create_issue":
            return await self._linear_create_issue(
                title=params.get("title", ""),
                description=params.get("description", ""),
                team_id=params.get("team_id", ""),
                priority=params.get("priority", ""),
                labels=params.get("labels"),
            )
        elif action == "comment":
            return await self._linear_comment(
                issue_id=params.get("issue_id", ""),
                body=params.get("body", ""),
            )
        elif action == "get_issue":
            return await self._linear_get_issue(
                issue_id=params.get("issue_id", ""),
            )
        elif action == "list_issues":
            return await self._linear_list_issues(
                team_id=params.get("team_id", ""),
                limit=int(params.get("limit", 25)),
                status=params.get("status", ""),
            )
        elif action == "transition":
            return await self._linear_transition(
                issue_id=params.get("issue_id", ""),
                state_name=params.get("status", ""),
            )
        return {}

    async def _dispatch_jira(self, action: str, params: dict) -> dict[str, Any]:
        if action == "create_issue":
            return await self._jira_create_issue(
                title=params.get("title", ""),
                description=params.get("description", ""),
                project_key=params.get("project_key", ""),
                issue_type=params.get("issue_type", "Task"),
                priority=params.get("priority", ""),
                labels=params.get("labels"),
            )
        elif action == "comment":
            return await self._jira_comment(
                issue_key=params.get("issue_id", ""),
                body=params.get("body", ""),
            )
        elif action == "get_issue":
            return await self._jira_get_issue(
                issue_key=params.get("issue_id", ""),
            )
        elif action == "list_issues":
            return await self._jira_list_issues(
                project_key=params.get("project_key", ""),
                limit=int(params.get("limit", 25)),
                status=params.get("status", ""),
            )
        elif action == "transition":
            return await self._jira_transition(
                issue_key=params.get("issue_id", ""),
                status_name=params.get("status", ""),
            )
        return {}

    def get_status(self) -> dict[str, Any]:
        return {
            "provider": self._provider,
            "configured": bool(self._api_token),
            "base_url": self._base_url if self._provider == "jira" else LINEAR_API_URL,
            "project_key": self._project_key,
            "default_team_id": self._default_team_id,
            "request_count": self._request_count,
            "error_count": self._error_count,
        }

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
