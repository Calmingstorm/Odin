"""Coverage for src/tools/email_client.py body-extraction + IMAP/SMTP paths
(RFC-006 P16, safe).

Pure MIME parsing (``_extract_body`` every branch, ``_decode_header_value``) plus
the SMTP send and IMAP search/read/list flows with ``smtplib.SMTP`` /
``imaplib.IMAP4_SSL`` faked — including the connect-fail, non-OK, and not-found
error arms. SAFE: no real SMTP/IMAP connection, no network; only constructed
in-memory email messages and faked transport objects.
"""
from __future__ import annotations

import email as email_lib
from unittest.mock import patch

import pytest

from src.tools import email_client as ec

_HDR = b"From: alice@example.com\r\nTo: bob@example.com\r\nSubject: Hi there\r\n\r\n"


class TestPureHelpers:
    def test_decode_header_value(self):
        assert ec._decode_header_value(None) == ""            # empty guard
        assert ec._decode_header_value("plain subject") == "plain subject"
        assert ec._decode_header_value("=?utf-8?q?caf=C3=A9?=") == "café"  # bytes branch

    def test_extract_body_multipart_plain(self):
        msg = email_lib.message_from_string(
            "Content-Type: multipart/alternative; boundary=b\r\n\r\n"
            "--b\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nplain part\r\n--b--\r\n")
        assert ec._extract_body(msg, 5000) == "plain part"

    def test_extract_body_multipart_html_only(self):
        msg = email_lib.message_from_string(
            "Content-Type: multipart/alternative; boundary=b\r\n\r\n"
            "--b\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>hi</p>\r\n--b--\r\n")
        out = ec._extract_body(msg, 5000)
        assert out.startswith("[HTML content]") and "<p>hi</p>" in out

    def test_extract_body_multipart_none(self):
        msg = email_lib.message_from_string(
            "Content-Type: multipart/mixed; boundary=b\r\n\r\n"
            "--b\r\nContent-Type: image/png\r\n"
            "Content-Disposition: attachment; filename=x.png\r\n\r\nBLOB\r\n--b--\r\n")
        assert ec._extract_body(msg, 5000) == "[no text body found]"

    def test_extract_body_singlepart_and_empty(self):
        body = email_lib.message_from_string("Content-Type: text/plain\r\n\r\nhello world")
        assert ec._extract_body(body, 5000) == "hello world"
        empty = email_lib.message_from_string("Subject: x\r\n\r\n")
        assert ec._extract_body(empty, 5000) == "[empty message]"

    def test_extract_body_truncation(self):
        big = email_lib.message_from_string("Content-Type: text/plain\r\n\r\n" + "z" * 100)
        out = ec._extract_body(big, 10)
        assert out.startswith("z" * 10) and "truncated at 10 chars" in out


class _FakeIMAP:
    """Minimal imaplib.IMAP4_SSL stand-in — no socket, records logout."""

    def __init__(self, *, search=("OK", [b""]), fetch_map=None):
        self._search = search
        self._fetch_map = fetch_map or {}
        self.logged_out = False

    def login(self, user, password):
        return ("OK", [b"ok"])

    def select(self, folder, readonly=False):
        return ("OK", [b"1"])

    def uid(self, command, *args):
        if command == "SEARCH":
            return self._search
        # FETCH
        uid = args[0]
        return self._fetch_map.get(uid, ("NO", [None]))

    def logout(self):
        self.logged_out = True


def _imap_patch(fake):
    return patch("imaplib.IMAP4_SSL", return_value=fake)


class TestSearchEmail:
    def test_returns_summaries(self):
        fake = _FakeIMAP(search=("OK", [b"1"]),
                         fetch_map={b"1": ("OK", [(b"1 (RFC822.HEADER", _HDR)])})
        with _imap_patch(fake):
            out = ec.search_email(imap_host="imap.example.com", imap_port=993,
                                  username="u", password="p", query="hi")
        assert out[0]["subject"] == "Hi there" and fake.logged_out

    def test_gmail_uses_xgmraw(self):
        fake = _FakeIMAP(search=("OK", [b"1"]),
                         fetch_map={b"1": ("OK", [(b"1 (RFC822.HEADER", _HDR)])})
        with _imap_patch(fake), patch.object(fake, "uid", wraps=fake.uid) as spy:
            ec.search_email(imap_host="imap.gmail.com", imap_port=993,
                            username="u", password="p", query='is:unread')
        assert any("X-GM-RAW" in str(c.args) for c in spy.call_args_list)

    def test_non_ok_search_returns_empty(self):
        with _imap_patch(_FakeIMAP(search=("NO", [b""]))):
            assert ec.search_email(imap_host="imap.example.com", imap_port=993,
                                   username="u", password="p", query="x") == []

    def test_connect_failure_raises_redacted(self):
        with patch("imaplib.IMAP4_SSL", side_effect=OSError("bad secret-pw here")):
            with pytest.raises(RuntimeError, match="IMAP connect failed"):
                ec.search_email(imap_host="h", imap_port=1, username="u",
                                password="secret-pw", query="x")


class TestReadEmail:
    def test_reads_full_message(self):
        raw = _HDR + b"body here"
        fake = _FakeIMAP(fetch_map={"7": ("OK", [(b"7 (RFC822", raw)])})
        with _imap_patch(fake):
            out = ec.read_email(imap_host="imap.example.com", imap_port=993,
                                username="u", password="p", uid="7")
        assert out["subject"] == "Hi there" and "body" in out and fake.logged_out

    def test_uid_not_found_raises(self):
        with _imap_patch(_FakeIMAP(fetch_map={})):  # FETCH returns ("NO", [None])
            with pytest.raises(ValueError, match="not found"):
                ec.read_email(imap_host="imap.example.com", imap_port=993,
                              username="u", password="p", uid="404")

    def test_connect_failure_raises(self):
        with patch("imaplib.IMAP4_SSL", side_effect=OSError("nope")):
            with pytest.raises(RuntimeError, match="IMAP connect failed"):
                ec.read_email(imap_host="h", imap_port=1, username="u",
                              password="p", uid="1")


class TestListRecent:
    def test_lists_with_flags_and_size(self):
        raw = _HDR
        meta = b"1 (RFC822.SIZE 2048 FLAGS (\\Seen))"
        fake = _FakeIMAP(search=("OK", [b"1"]), fetch_map={b"1": ("OK", [(meta, raw)])})
        with _imap_patch(fake):
            out = ec.list_recent(imap_host="imap.example.com", imap_port=993,
                                 username="u", password="p")
        assert out[0]["size_bytes"] == 2048
        assert out[0]["flags"] == ["\\Seen"]

    def test_non_ok_returns_empty(self):
        with _imap_patch(_FakeIMAP(search=("NO", [b""]))):
            assert ec.list_recent(imap_host="imap.example.com", imap_port=993,
                                  username="u", password="p") == []

    def test_connect_failure_raises(self):
        with patch("imaplib.IMAP4_SSL", side_effect=OSError("nope")):
            with pytest.raises(RuntimeError, match="IMAP connect failed"):
                ec.list_recent(imap_host="h", imap_port=1, username="u", password="p")


class _FakeSMTP:
    """smtplib.SMTP stand-in used as a context manager — records the send."""

    def __init__(self, *a, **kw):
        self.sent = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        pass

    def login(self, user, password):
        pass

    def sendmail(self, from_addr, recipients, body):
        self.sent = (from_addr, recipients, body)


class TestSendEmail:
    def test_sends_with_reply_to(self):
        fake = _FakeSMTP()
        with patch("smtplib.SMTP", return_value=fake):
            out = ec.send_email(smtp_host="smtp.example.com", smtp_port=587,
                                username="u", password="p", from_address="me@example.com",
                                to=["you@example.com"], cc=["c@example.com"],
                                reply_to="reply@example.com", subject="Hi", body="hello")
        assert out["status"] == "sent" and out["cc"] == ["c@example.com"]
        assert fake.sent is not None and "reply@example.com" in fake.sent[2]

    def test_no_recipients_raises(self):
        with pytest.raises(ValueError, match="No recipients"):
            ec.send_email(smtp_host="h", smtp_port=1, username="u", password="p",
                          from_address="me@example.com", to=[], subject="s", body="b")

    def test_smtp_failure_redacts_password(self):
        with patch("smtplib.SMTP", side_effect=OSError("auth failed for topsecret")):
            with pytest.raises(RuntimeError) as ei:
                ec.send_email(smtp_host="h", smtp_port=1, username="u",
                              password="topsecret", from_address="me@example.com",
                              to=["you@example.com"], subject="s", body="b")
        assert "topsecret" not in str(ei.value) and "[REDACTED]" in str(ei.value)

    def test_attachment_outside_allowed_dir_raises(self, tmp_path):
        f = tmp_path / "doc.txt"
        f.write_text("data")
        with patch("smtplib.SMTP", return_value=_FakeSMTP()):
            with pytest.raises(ValueError, match="outside allowed"):
                ec.send_email(smtp_host="h", smtp_port=1, username="u", password="p",
                              from_address="me@example.com", to=["you@example.com"],
                              subject="s", body="b", attachments=[str(f)],
                              allowed_dirs=["/some/other/dir"])

    def test_attachment_not_a_file_raises(self, tmp_path):
        with patch("smtplib.SMTP", return_value=_FakeSMTP()):
            with pytest.raises(ValueError, match="not a file"):
                ec.send_email(smtp_host="h", smtp_port=1, username="u", password="p",
                              from_address="me@example.com", to=["you@example.com"],
                              subject="s", body="b",
                              attachments=[str(tmp_path / "missing.txt")],
                              allowed_dirs=[str(tmp_path)])
