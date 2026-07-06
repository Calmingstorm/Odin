"""Tests for email tools (SMTP/IMAP).

Covers: send (MIME construction, STARTTLS, recipients, attachments, path
validation), search (standard IMAP + Gmail X-GM-RAW), read (body parsing,
truncation, attachment metadata), list_recent, disabled handler fallback,
and password redaction in errors.
"""
from __future__ import annotations

import email as email_lib
import os
from unittest.mock import MagicMock, patch

import pytest

from src.tools.email_client import (
    list_recent,
    read_email,
    search_email,
    send_email,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_raw_email(
    subject="Test", from_addr="a@b.com", to_addr="c@d.com",
    body="Hello world", date="Mon, 15 Jun 2026 12:00:00 +0000",
    message_id="<test@example.com>", attach_name=None, attach_data=b"",
):
    msg = email_lib.mime.multipart.MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Date"] = date
    msg["Message-ID"] = message_id
    msg.attach(email_lib.mime.text.MIMEText(body, "plain"))
    if attach_name:
        att = email_lib.mime.base.MIMEBase("application", "octet-stream")
        att.set_payload(attach_data)
        att.add_header("Content-Disposition", "attachment", filename=attach_name)
        msg.attach(att)
    return msg.as_bytes()


# ---------------------------------------------------------------------------
# send_email
# ---------------------------------------------------------------------------

class TestSendEmail:
    @patch("src.tools.email_client.smtplib.SMTP")
    def test_basic_send(self, mock_smtp_cls):
        mock_server = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_server)
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

        result = send_email(
            smtp_host="smtp.test.com", smtp_port=587,
            username="u", password="p", from_address="me@test.com",
            to=["them@test.com"], subject="Hi", body="Hello",
        )

        assert result["status"] == "sent"
        assert result["to"] == ["them@test.com"]
        assert result["subject"] == "Hi"
        assert result["message_id"]
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("u", "p")
        mock_server.sendmail.assert_called_once()

    @patch("src.tools.email_client.smtplib.SMTP")
    def test_cc_bcc_recipients(self, mock_smtp_cls):
        mock_server = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_server)
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

        send_email(
            smtp_host="smtp.test.com", smtp_port=587,
            username="u", password="p", from_address="me@test.com",
            to=["a@t.com"], subject="Hi", body="Hello",
            cc=["b@t.com"], bcc=["c@t.com"],
        )

        call_args = mock_server.sendmail.call_args
        all_recipients = call_args[0][1]
        assert "a@t.com" in all_recipients
        assert "b@t.com" in all_recipients
        assert "c@t.com" in all_recipients

    def test_no_recipients_raises(self):
        with pytest.raises(ValueError, match="No recipients"):
            send_email(
                smtp_host="h", smtp_port=587, username="u", password="p",
                from_address="me@t.com", to=[], subject="Hi", body="Hello",
            )

    @patch("src.tools.email_client.smtplib.SMTP")
    def test_attachment_outside_allowed_dirs(self, mock_smtp_cls):
        with pytest.raises(ValueError, match="outside allowed"):
            send_email(
                smtp_host="h", smtp_port=587, username="u", password="p",
                from_address="me@t.com", to=["a@t.com"], subject="Hi", body="Hello",
                attachments=["/etc/passwd"],
                allowed_dirs=["/tmp/safe"],
            )

    def test_attachments_require_allowed_dirs(self):
        with pytest.raises(ValueError, match="allowed_attachment_dirs"):
            send_email(
                smtp_host="h", smtp_port=587, username="u", password="p",
                from_address="me@t.com", to=["a@t.com"], subject="Hi", body="Hello",
                attachments=["/tmp/file.txt"],
                allowed_dirs=[],
            )

    @patch("src.tools.email_client.smtplib.SMTP")
    def test_attachment_valid_path(self, mock_smtp_cls, tmp_path):
        mock_server = MagicMock()
        mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_server)
        mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
        f = tmp_path / "report.txt"
        f.write_text("data")

        result = send_email(
            smtp_host="h", smtp_port=587, username="u", password="p",
            from_address="me@t.com", to=["a@t.com"], subject="Hi", body="Hello",
            attachments=[str(f)],
            allowed_dirs=[str(tmp_path)],
        )
        assert result["attachments"] == ["report.txt"]

    @patch("src.tools.email_client.smtplib.SMTP")
    def test_attachment_too_large(self, mock_smtp_cls, tmp_path):
        f = tmp_path / "big.bin"
        f.write_bytes(b"x" * 200)

        with pytest.raises(ValueError, match="bytes"):
            send_email(
                smtp_host="h", smtp_port=587, username="u", password="p",
                from_address="me@t.com", to=["a@t.com"], subject="Hi", body="Hello",
                attachments=[str(f)],
                allowed_dirs=[str(tmp_path)],
                max_attachment_bytes=100,
            )


# ---------------------------------------------------------------------------
# search_email
# ---------------------------------------------------------------------------

class TestSearchEmail:
    @patch("src.tools.email_client.imaplib.IMAP4_SSL")
    def test_gmail_uses_xgmraw(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_imap_cls.return_value = mock_conn
        mock_conn.login.return_value = ("OK", [])
        mock_conn.select.return_value = ("OK", [b"5"])
        mock_conn.uid.return_value = ("OK", [b""])

        search_email(
            imap_host="imap.gmail.com", imap_port=993,
            username="u", password="p", query="from:alice",
        )

        calls = mock_conn.uid.call_args_list
        assert calls[0][0] == ("SEARCH", None, "X-GM-RAW", '"from:alice"')

    @patch("src.tools.email_client.imaplib.IMAP4_SSL")
    def test_gmail_multiword_query_quoted(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_imap_cls.return_value = mock_conn
        mock_conn.login.return_value = ("OK", [])
        mock_conn.select.return_value = ("OK", [b"5"])
        mock_conn.uid.return_value = ("OK", [b""])

        search_email(
            imap_host="imap.gmail.com", imap_port=993,
            username="u", password="p",
            query="from:alice newer_than:7d has:attachment",
        )

        call_args = mock_conn.uid.call_args_list[0][0]
        assert call_args[0] == "SEARCH"
        assert call_args[2] == "X-GM-RAW"
        raw_arg = call_args[3]
        assert raw_arg.startswith('"') and raw_arg.endswith('"')
        assert "from:alice newer_than:7d has:attachment" in raw_arg

    @patch("src.tools.email_client.imaplib.IMAP4_SSL")
    def test_non_gmail_uses_standard_search(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_imap_cls.return_value = mock_conn
        mock_conn.login.return_value = ("OK", [])
        mock_conn.select.return_value = ("OK", [b"5"])
        mock_conn.uid.return_value = ("OK", [b""])

        search_email(
            imap_host="imap.fastmail.com", imap_port=993,
            username="u", password="p", query='FROM "alice"',
        )

        calls = mock_conn.uid.call_args_list
        assert calls[0][0] == ("SEARCH", None, 'FROM "alice"')

    @patch("src.tools.email_client.imaplib.IMAP4_SSL")
    def test_returns_summaries(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_imap_cls.return_value = mock_conn
        mock_conn.login.return_value = ("OK", [])
        mock_conn.select.return_value = ("OK", [b"1"])
        mock_conn.uid.side_effect = [
            ("OK", [b"42"]),
            ("OK", [(b"42 (RFC822.HEADER {500}", _make_raw_email(subject="Invoice"))]),
        ]

        results = search_email(
            imap_host="imap.gmail.com", imap_port=993,
            username="u", password="p", query="subject:invoice",
        )
        assert len(results) == 1
        assert results[0]["subject"] == "Invoice"
        assert results[0]["uid"] == "42"


# ---------------------------------------------------------------------------
# read_email
# ---------------------------------------------------------------------------

class TestReadEmail:
    @patch("src.tools.email_client.imaplib.IMAP4_SSL")
    def test_reads_full_message(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_imap_cls.return_value = mock_conn
        mock_conn.login.return_value = ("OK", [])
        mock_conn.select.return_value = ("OK", [b"1"])
        mock_conn.uid.return_value = (
            "OK",
            [(b"42 (RFC822 {999}", _make_raw_email(
                body="Full body here", attach_name="report.pdf", attach_data=b"pdf",
            ))],
        )

        result = read_email(
            imap_host="imap.gmail.com", imap_port=993,
            username="u", password="p", uid="42",
        )
        assert "Full body here" in result["body"]
        assert result["attachments"][0]["filename"] == "report.pdf"
        assert result["subject"] == "Test"

    @patch("src.tools.email_client.imaplib.IMAP4_SSL")
    def test_body_truncation(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_imap_cls.return_value = mock_conn
        mock_conn.login.return_value = ("OK", [])
        mock_conn.select.return_value = ("OK", [b"1"])
        mock_conn.uid.return_value = (
            "OK",
            [(b"42 (RFC822 {999}", _make_raw_email(body="x" * 5000))],
        )

        result = read_email(
            imap_host="imap.gmail.com", imap_port=993,
            username="u", password="p", uid="42", max_body_chars=100,
        )
        assert len(result["body"]) < 200
        assert "truncated" in result["body"]


# ---------------------------------------------------------------------------
# list_recent
# ---------------------------------------------------------------------------

class TestListRecent:
    @patch("src.tools.email_client.imaplib.IMAP4_SSL")
    def test_returns_summaries(self, mock_imap_cls):
        mock_conn = MagicMock()
        mock_imap_cls.return_value = mock_conn
        mock_conn.login.return_value = ("OK", [])
        mock_conn.select.return_value = ("OK", [b"1"])
        mock_conn.uid.side_effect = [
            ("OK", [b"10 11 12"]),
            ("OK", [(
                b'12 (UID 12 FLAGS (\\Seen) RFC822.SIZE 1234 RFC822.HEADER {500}',
                _make_raw_email(subject="Recent"),
            )]),
            ("OK", [(
                b'11 (UID 11 FLAGS () RFC822.SIZE 567 RFC822.HEADER {500}',
                _make_raw_email(subject="Older"),
            )]),
        ]

        results = list_recent(
            imap_host="imap.gmail.com", imap_port=993,
            username="u", password="p", limit=2,
        )
        assert len(results) == 2
        assert results[0]["subject"] == "Recent"
        assert results[0].get("size_bytes") == 1234


# ---------------------------------------------------------------------------
# Security / password redaction
# ---------------------------------------------------------------------------

class TestPasswordSafety:
    @patch("src.tools.email_client.smtplib.SMTP")
    def test_smtp_error_redacts_password(self, mock_smtp_cls):
        secret = "abcd-efgh-ijkl-mnop"
        mock_smtp_cls.side_effect = Exception(f"auth failed with {secret}")

        with pytest.raises(RuntimeError) as exc_info:
            send_email(
                smtp_host="h", smtp_port=587, username="u", password=secret,
                from_address="me@t.com", to=["a@t.com"], subject="Hi", body="Hello",
            )
        assert secret not in str(exc_info.value)
        assert "[REDACTED]" in str(exc_info.value)

    @patch("src.tools.email_client.imaplib.IMAP4_SSL")
    def test_imap_error_redacts_password(self, mock_imap_cls):
        secret = "abcd-efgh-ijkl-mnop"
        mock_imap_cls.side_effect = Exception(f"login failed with {secret}")

        with pytest.raises(RuntimeError) as exc_info:
            search_email(
                imap_host="h", imap_port=993, username="u", password=secret,
                query="test",
            )
        assert secret not in str(exc_info.value)
        assert "[REDACTED]" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Disabled handler fallback
# ---------------------------------------------------------------------------

class TestDisabledFallback:
    @pytest.mark.asyncio
    async def test_handlers_return_error_when_disabled(self):
        from src.tools.executor import ToolExecutor
        executor = ToolExecutor(email_config=None)
        for handler_name in ("_handle_email_send", "_handle_email_search",
                             "_handle_email_read", "_handle_email_list_recent"):
            handler = getattr(executor.comms_tools, handler_name)
            result = await handler({"to": ["a@b.com"], "subject": "Hi",
                                    "body": "Hello", "query": "test", "uid": "1"})
            assert "not configured" in result
