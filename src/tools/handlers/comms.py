"""Comms handler domain — email_send/search/read/list_recent,
issue_tracker (RFC-004 P6, wave 3).

Bodies moved VERBATIM from executor.py; lazy relative imports re-anchored
one level. ``_issue_tracker_client`` and the email config live on the
executor (tests and wiring set them there) and are reached live via deps.
"""

from __future__ import annotations

import asyncio

from .deps import HandlerBase


class CommsTools(HandlerBase):
    @property
    def _email_config(self):
        return self._deps.email_config()

    @property
    def _issue_tracker_client(self):
        return self._deps.issue_tracker_client()

    def _email_cfg(self):
        cfg = self._email_config
        if cfg is None or not cfg.enabled:
            return None
        return cfg

    async def _handle_email_send(self, inp: dict) -> str:
        from ..email_client import send_email

        cfg = self._email_cfg()
        if cfg is None:
            return "Error: email tools are not configured (email.enabled is false)"
        to = inp.get("to")
        if not to or not isinstance(to, list):
            return "Error: 'to' must be a non-empty list of email addresses"
        subject = str(inp.get("subject", ""))
        body = str(inp.get("body", ""))
        try:
            # smtplib blocks; run it off the event loop so a slow mail server
            # can't stall every other channel/task.
            result = await asyncio.to_thread(
                send_email,
                smtp_host=cfg.smtp.host,
                smtp_port=cfg.smtp.port,
                username=cfg.smtp.username,
                password=cfg.smtp.password,
                from_address=cfg.smtp.from_address,
                to=to,
                subject=subject,
                body=body,
                cc=inp.get("cc"),
                bcc=inp.get("bcc"),
                reply_to=inp.get("reply_to"),
                attachments=inp.get("attachments"),
                allowed_dirs=cfg.allowed_attachment_dirs,
                max_attachment_bytes=cfg.max_attachment_bytes,
                timeout=cfg.connect_timeout_seconds,
            )
            parts = [
                "Email sent successfully.",
                f"Message-ID: {result['message_id']}",
                f"To: {', '.join(result['to'])}",
                f"Subject: {result['subject']}",
            ]
            if result.get("cc"):
                parts.append(f"CC: {', '.join(result['cc'])}")
            if result.get("attachments"):
                parts.append(f"Attachments: {', '.join(result['attachments'])}")
            return "\n".join(parts)
        except (ValueError, RuntimeError) as e:
            return f"Error: {e}"

    async def _handle_email_search(self, inp: dict) -> str:
        from ..email_client import search_email

        cfg = self._email_cfg()
        if cfg is None:
            return "Error: email tools are not configured (email.enabled is false)"
        query = inp.get("query", "")
        if not query:
            return "Error: 'query' is required"
        limit = max(1, min(int(inp.get("limit", 20)), cfg.max_results))
        try:
            results = await asyncio.to_thread(
                search_email,
                imap_host=cfg.imap.host,
                imap_port=cfg.imap.port,
                username=cfg.imap.username,
                password=cfg.imap.password,
                query=query,
                folder=inp.get("folder", "INBOX"),
                limit=limit,
                timeout=cfg.connect_timeout_seconds,
            )
            if not results:
                return "No messages found matching the query."
            lines = [f"Found {len(results)} message(s):\n"]
            for r in results:
                att = " [has attachments]" if r.get("has_attachments") else ""
                lines.append(f"UID {r['uid']} | {r['date']} | {r['from']} | {r['subject']}{att}")
            return "\n".join(lines)
        except (ValueError, RuntimeError) as e:
            return f"Error: {e}"

    async def _handle_email_read(self, inp: dict) -> str:
        from ..email_client import read_email

        cfg = self._email_cfg()
        if cfg is None:
            return "Error: email tools are not configured (email.enabled is false)"
        uid = str(inp.get("uid", ""))
        if not uid:
            return "Error: 'uid' is required"
        try:
            result = await asyncio.to_thread(
                read_email,
                imap_host=cfg.imap.host,
                imap_port=cfg.imap.port,
                username=cfg.imap.username,
                password=cfg.imap.password,
                uid=uid,
                folder=inp.get("folder", "INBOX"),
                max_body_chars=cfg.max_body_chars,
                timeout=cfg.connect_timeout_seconds,
            )
            lines = [
                f"From: {result['from']}",
                f"To: {result['to']}",
                f"Subject: {result['subject']}",
                f"Date: {result['date']}",
                f"Message-ID: {result['message_id']}",
            ]
            if result.get("attachments"):
                att_list = ", ".join(
                    f"{a['filename']} ({a['size_bytes']} bytes)" for a in result["attachments"]
                )
                lines.append(f"Attachments: {att_list}")
            lines.append(f"\n{result['body']}")
            return "\n".join(lines)
        except (ValueError, RuntimeError) as e:
            return f"Error: {e}"

    async def _handle_email_list_recent(self, inp: dict) -> str:
        from ..email_client import list_recent

        cfg = self._email_cfg()
        if cfg is None:
            return "Error: email tools are not configured (email.enabled is false)"
        limit = max(1, min(int(inp.get("limit", 10)), cfg.max_results))
        try:
            results = await asyncio.to_thread(
                list_recent,
                imap_host=cfg.imap.host,
                imap_port=cfg.imap.port,
                username=cfg.imap.username,
                password=cfg.imap.password,
                folder=inp.get("folder", "INBOX"),
                limit=limit,
                timeout=cfg.connect_timeout_seconds,
            )
            if not results:
                return "No messages found."
            lines = [f"Recent {len(results)} message(s):\n"]
            for r in results:
                att = " [has attachments]" if r.get("has_attachments") else ""
                size = f" ({r['size_bytes']} bytes)" if r.get("size_bytes") else ""
                flags = f" [{' '.join(r['flags'])}]" if r.get("flags") else ""
                lines.append(
                    f"UID {r['uid']} | {r['date']} | {r['from']} | {r['subject']}{att}{size}{flags}"
                )
            return "\n".join(lines)
        except (ValueError, RuntimeError) as e:
            return f"Error: {e}"

    async def _handle_issue_tracker(self, inp: dict) -> str:
        action = inp.get("action", "")
        if not action:
            return "Error: 'action' is required"

        if not hasattr(self, "_issue_tracker_client") or self._issue_tracker_client is None:
            return "Error: issue tracker not configured (set issue_tracker.enabled=true in config)"

        try:
            from ...notifications.issue_tracker import IssueTrackerError, validate_action

            validate_action(action)
        except ValueError as e:
            return f"Error: {e}"

        try:
            result = await self._issue_tracker_client.execute(action, dict(inp))
            import json

            return json.dumps(result, indent=2)
        except IssueTrackerError as e:
            from ...llm.secret_scrubber import scrub_output_secrets

            return f"issue_tracker error: {scrub_output_secrets(str(e))}"
