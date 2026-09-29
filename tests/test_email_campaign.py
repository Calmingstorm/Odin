"""Mail acceptance and TLS regressions, without opening sockets."""
import smtplib
import ssl
from unittest.mock import MagicMock, patch

import pytest

from src.config.schema import EmailConfig
from src.tools import email_client as ec


@pytest.mark.parametrize("verify", [True, False])
@pytest.mark.parametrize("action,extra", [
    (ec.search_email, {"query": "ALL"}),
    (ec.read_email, {"uid": "1"}),
    (ec.list_recent, {}),
])
def test_all_imap_paths_receive_explicit_tls_context(verify, action, extra):
    conn = MagicMock()
    conn.uid.return_value = ("OK", [b""])
    with patch.object(ec.imaplib, "IMAP4_SSL", return_value=conn) as ctor:
        try:
            action(imap_host="mail.example", imap_port=993, username="test",
                   password="dummy", tls_verify=verify, **extra)
        except ValueError:  # empty FETCH is expected for read
            pass
    context = ctor.call_args.kwargs["ssl_context"]
    assert context.check_hostname is verify
    assert context.verify_mode == (ssl.CERT_REQUIRED if verify else ssl.CERT_NONE)


@pytest.mark.parametrize("verify", [True, False])
def test_smtp_context_and_real_stdlib_quit_failure_preserve_acceptance(verify):
    server = smtplib.SMTP()  # no host: no socket, real __enter__/__exit__
    server.starttls = MagicMock()
    server.login = MagicMock()
    server.sendmail = MagicMock(return_value={})
    server.docmd = MagicMock(return_value=(421, b"closing"))
    server.close = MagicMock()
    with patch.object(ec.smtplib, "SMTP", return_value=server):
        result = ec.send_email(smtp_host="mail.example", smtp_port=587,
                               username="test", password="dummy", from_address="a@example",
                               to=["b@example"], subject="subject", body="body", tls_verify=verify)
    context = server.starttls.call_args.kwargs["context"]
    assert context.check_hostname is verify
    assert context.verify_mode == (ssl.CERT_REQUIRED if verify else ssl.CERT_NONE)
    assert result["status"] == "sent"
    assert result["accepted_count"] == 1
    assert "after acceptance" in result["cleanup_warning"]
    server.sendmail.assert_called_once()


def test_config_tls_secure_default_and_explicit_opt_out():
    assert EmailConfig().tls_verify
    assert not EmailConfig(tls_verify=False).tls_verify
