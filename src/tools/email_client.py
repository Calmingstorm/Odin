"""SMTP/IMAP email client for Odin's email tools.

Sends via SMTP (STARTTLS) and reads via IMAP (SSL).  Designed for Gmail
with App Passwords but works with any standard provider.  Connections are
short-lived (created per call, closed after) — no pool, no persistent
state.  Gmail's X-GM-RAW search extension is auto-detected from the IMAP
host and used transparently when available.
"""

from __future__ import annotations

import email as email_lib
import email.encoders
import email.mime.base
import email.mime.multipart
import email.mime.text
import imaplib
import mimetypes
import os
import smtplib
import ssl
from email.header import decode_header
from email.utils import formataddr, formatdate, make_msgid, parseaddr
from pathlib import Path

from ..odin_log import get_logger

log = get_logger("email")

_GMAIL_HOST_MARKER = "gmail.com"


def _tls_context(verify: bool) -> ssl.SSLContext:
    context = ssl.create_default_context()
    if not verify:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    return context


def _safe_error(exc: Exception, password: str | None) -> str:
    msg = str(exc)
    if password and password in msg:
        msg = msg.replace(password, "[REDACTED]")
    return msg


def _decode_header_value(raw: str | None) -> str:
    if not raw:
        return ""
    parts = decode_header(raw)
    decoded = []
    for data, charset in parts:
        if isinstance(data, bytes):
            decoded.append(data.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(data)
    return " ".join(decoded)


def _is_attachment(part: email_lib.message.Message) -> bool:
    return part.get_content_disposition() == "attachment"


def _body_parts(msg: email_lib.message.Message):
    """Yield body leaves, never text nested within an attached message."""

    def walk(part: email_lib.message.Message, inside_attachment: bool):
        inside_attachment |= _is_attachment(part)
        if part.is_multipart():
            children = part.get_payload()
            if isinstance(children, list):
                for child in children:
                    if isinstance(child, email_lib.message.Message):
                        yield from walk(child, inside_attachment)
        elif not inside_attachment:
            yield part

    yield from walk(msg, False)


def _extract_body(msg: email_lib.message.Message, max_chars: int) -> str:
    if msg.is_multipart():
        for part in _body_parts(msg):
            ct = part.get_content_type()
            if ct == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    text = payload.decode(charset, errors="replace")  # type: ignore[union-attr]  # get_payload(decode=True) never returns Message
                    if len(text) > max_chars:
                        return (
                            text[:max_chars]
                            + f"\n\n[truncated at {max_chars} chars, original {len(text)}]"
                        )
                    return text
        for part in _body_parts(msg):
            ct = part.get_content_type()
            if ct == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    text = payload.decode(charset, errors="replace")  # type: ignore[union-attr]  # get_payload(decode=True) never returns Message
                    if len(text) > max_chars:
                        return (
                            text[:max_chars]
                            + f"\n\n[truncated at {max_chars} chars, original {len(text)}]"
                        )
                    return f"[HTML content]\n{text}"
        return "[no text body found]"
    payload = msg.get_payload(decode=True)
    if payload:
        charset = msg.get_content_charset() or "utf-8"
        text = payload.decode(charset, errors="replace")  # type: ignore[union-attr]  # get_payload(decode=True) never returns Message
        if len(text) > max_chars:
            return text[:max_chars] + f"\n\n[truncated at {max_chars} chars, original {len(text)}]"
        return text
    return "[empty message]"


def _attachment_metadata(msg: email_lib.message.Message) -> list[dict]:
    attachments = []
    for part in msg.walk():
        if _is_attachment(part):
            filename = part.get_filename() or "(unnamed)"
            filename = _decode_header_value(filename)
            size = len(part.get_payload(decode=True) or b"")
            attachments.append(
                {
                    "filename": filename,
                    "content_type": part.get_content_type(),
                    "size_bytes": size,
                }
            )
    return attachments


def _message_summary(msg: email_lib.message.Message, uid: str = "") -> dict:
    return {
        "uid": uid,
        "from": _decode_header_value(msg.get("From")),
        "to": _decode_header_value(msg.get("To")),
        "subject": _decode_header_value(msg.get("Subject")),
        "date": msg.get("Date", ""),
        "message_id": msg.get("Message-ID", ""),
        "has_attachments": any(_is_attachment(p) for p in msg.walk()),
    }


def send_email(
    *,
    smtp_host: str,
    smtp_port: int,
    username: str,
    password: str,
    from_address: str,
    to: list[str],
    subject: str,
    body: str,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    reply_to: str | None = None,
    attachments: list[str] | None = None,
    allowed_dirs: list[str] | None = None,
    max_attachment_bytes: int = 10 * 1024 * 1024,
    timeout: int = 30,
    tls_verify: bool = True,
) -> dict:
    all_recipients = list(to)
    if cc:
        all_recipients.extend(cc)
    if bcc:
        all_recipients.extend(bcc)

    if not all_recipients:
        raise ValueError("No recipients specified")

    msg = email_lib.mime.multipart.MIMEMultipart()
    msg["From"] = formataddr(parseaddr(from_address))
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    if reply_to:
        msg["Reply-To"] = reply_to
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()

    msg.attach(email_lib.mime.text.MIMEText(body, "plain", "utf-8"))

    if attachments:
        if not allowed_dirs:
            raise ValueError("Attachments require allowed_attachment_dirs to be configured")
        resolved_allowed = [os.path.realpath(d) for d in allowed_dirs]
        for filepath in attachments:
            real = os.path.realpath(filepath)
            if not any(real.startswith(d + os.sep) or real == d for d in resolved_allowed):
                raise ValueError(f"Attachment path '{filepath}' is outside allowed directories")
            if not os.path.isfile(real):
                raise ValueError(f"Attachment '{filepath}' is not a file")
            size = os.path.getsize(real)
            if size > max_attachment_bytes:
                raise ValueError(
                    f"Attachment '{filepath}' is {size} bytes (limit {max_attachment_bytes})"
                )
            ctype, _ = mimetypes.guess_type(real)
            if ctype is None:
                ctype = "application/octet-stream"
            maintype, subtype = ctype.split("/", 1)
            with open(real, "rb") as f:
                att = email_lib.mime.base.MIMEBase(maintype, subtype)
                att.set_payload(f.read())
            email_lib.encoders.encode_base64(att)
            att.add_header(
                "Content-Disposition",
                "attachment",
                filename=Path(real).name,
            )
            msg.attach(att)

    refused_map = None
    cleanup_warning = ""
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=timeout) as server:
            server.starttls(context=_tls_context(tls_verify))
            server.login(username, password)
            refused_map = server.sendmail(from_address, all_recipients, msg.as_string())
    except Exception as e:
        if refused_map is None:
            if isinstance(e, smtplib.SMTPRecipientsRefused):
                refusals = _refusals(e.recipients, to, cc, bcc, password)
                raise RuntimeError(
                    f"SMTP send failed: no message was sent. Refused: {_format_refusals(refusals)}"
                ) from None
            raise RuntimeError(f"SMTP send failed: {_safe_error(e, password)}") from None
        # DATA was accepted before __exit__/QUIT failed. Never invite a resend.
        cleanup_warning = f"SMTP cleanup failed after acceptance: {_safe_error(e, password)}"
        log.warning("%s", cleanup_warning)

    refusals = _refusals(refused_map, to, cc, bcc, password)
    accepted = [address for address in dict.fromkeys(all_recipients) if address not in refused_map]
    log.info(
        "Email accepted by SMTP for %s, refused for %s, subject=%r, message_id=%s",
        accepted,
        [entry["address"] for entry in refusals],
        subject,
        msg["Message-ID"],
    )

    return {
        "status": "partial" if refusals else "sent",
        "message_id": msg["Message-ID"],
        "to": to,
        "cc": cc or [],
        "subject": subject,
        "attachments": [Path(p).name for p in (attachments or [])],
        "accepted_count": len(accepted),
        "refused": refusals,
        "cleanup_warning": cleanup_warning,
    }


def _refusals(
    refused_map: dict,
    to: list[str],
    cc: list[str] | None,
    bcc: list[str] | None,
    password: str | None,
) -> list[dict]:
    """Label and sanitize SMTP refusals, including addresses hidden in BCC."""
    result: list[dict] = []
    seen: set[str] = set()
    for field, addresses in (("To", to), ("CC", cc or []), ("BCC", bcc or [])):
        for address in addresses:
            if address in seen or address not in refused_map:
                continue
            seen.add(address)
            code, response = refused_map[address]
            text = (
                response.decode("utf-8", "replace")
                if isinstance(response, bytes)
                else str(response)
            )
            reason = " ".join(text.split())
            if password and password in reason:
                reason = reason.replace(password, "[REDACTED]")
            result.append(
                {"address": address, "field": field, "code": int(code), "reason": reason[:200]}
            )
    return result


def _format_refusals(refusals: list[dict]) -> str:
    return "; ".join(
        f"{entry['address']} ({entry['field']}): {entry['code']} {entry['reason']}".rstrip()
        for entry in refusals
    )


def search_email(
    *,
    imap_host: str,
    imap_port: int,
    username: str,
    password: str,
    query: str,
    folder: str = "INBOX",
    limit: int = 20,
    timeout: int = 30,
    tls_verify: bool = True,
) -> list[dict]:
    try:
        conn = imaplib.IMAP4_SSL(imap_host, imap_port, timeout=timeout,
                                 ssl_context=_tls_context(tls_verify))
    except Exception as e:
        raise RuntimeError(f"IMAP connect failed: {_safe_error(e, password)}") from None

    try:
        conn.login(username, password)
        conn.select(f'"{folder}"', readonly=True)

        if _GMAIL_HOST_MARKER in imap_host.lower():
            escaped = query.replace("\\", "\\\\").replace('"', '\\"')
            status, data = conn.uid("SEARCH", None, "X-GM-RAW", f'"{escaped}"')  # type: ignore[arg-type]  # stdlib None-charset idiom; IMAP4._command skips None
        else:
            status, data = conn.uid("SEARCH", None, query)  # type: ignore[arg-type]  # stdlib None-charset idiom; IMAP4._command skips None

        if status != "OK":
            raise RuntimeError(f"IMAP search failed: SEARCH returned {status}")

        uids = data[0].split() if data[0] else []
        uids = uids[-limit:]
        uids.reverse()

        results = []
        for uid in uids:
            status, msg_data = conn.uid("FETCH", uid, "(RFC822.HEADER)")
            if status != "OK" or not msg_data or not msg_data[0]:
                continue
            raw = msg_data[0][1] if isinstance(msg_data[0], tuple) else msg_data[0]
            if isinstance(raw, bytes):
                msg = email_lib.message_from_bytes(raw)
                results.append(
                    _message_summary(msg, uid.decode() if isinstance(uid, bytes) else str(uid))
                )

        return results
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"IMAP search failed: {_safe_error(e, password)}") from None
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def read_email(
    *,
    imap_host: str,
    imap_port: int,
    username: str,
    password: str,
    uid: str,
    folder: str = "INBOX",
    max_body_chars: int = 50_000,
    timeout: int = 30,
    tls_verify: bool = True,
) -> dict:
    try:
        conn = imaplib.IMAP4_SSL(imap_host, imap_port, timeout=timeout,
                                 ssl_context=_tls_context(tls_verify))
    except Exception as e:
        raise RuntimeError(f"IMAP connect failed: {_safe_error(e, password)}") from None

    try:
        conn.login(username, password)
        conn.select(f'"{folder}"', readonly=True)

        status, msg_data = conn.uid("FETCH", uid, "(RFC822)")
        if status != "OK" or not msg_data or not msg_data[0]:
            raise ValueError(f"Message UID {uid} not found in {folder}")

        raw = msg_data[0][1] if isinstance(msg_data[0], tuple) else msg_data[0]
        msg = email_lib.message_from_bytes(raw)

        summary = _message_summary(msg, uid)
        summary["body"] = _extract_body(msg, max_body_chars)
        summary["attachments"] = _attachment_metadata(msg)
        return summary
    except (RuntimeError, ValueError):
        raise
    except Exception as e:
        raise RuntimeError(f"IMAP read failed: {_safe_error(e, password)}") from None
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def list_recent(
    *,
    imap_host: str,
    imap_port: int,
    username: str,
    password: str,
    folder: str = "INBOX",
    limit: int = 10,
    timeout: int = 30,
    tls_verify: bool = True,
) -> list[dict]:
    try:
        conn = imaplib.IMAP4_SSL(imap_host, imap_port, timeout=timeout,
                                 ssl_context=_tls_context(tls_verify))
    except Exception as e:
        raise RuntimeError(f"IMAP connect failed: {_safe_error(e, password)}") from None

    try:
        conn.login(username, password)
        conn.select(f'"{folder}"', readonly=True)

        status, data = conn.uid("SEARCH", None, "ALL")  # type: ignore[arg-type]  # stdlib None-charset idiom; IMAP4._command skips None
        if status != "OK":
            raise RuntimeError(f"IMAP list failed: SEARCH returned {status}")
        if not data[0]:
            return []

        uids = data[0].split()
        uids = uids[-limit:]
        uids.reverse()

        results = []
        for uid in uids:
            status, msg_data = conn.uid("FETCH", uid, "(RFC822.HEADER FLAGS RFC822.SIZE)")
            if status != "OK" or not msg_data or not msg_data[0]:
                continue
            raw_tuple = msg_data[0]
            if isinstance(raw_tuple, tuple):
                raw = raw_tuple[1]
                meta_line = (
                    raw_tuple[0].decode() if isinstance(raw_tuple[0], bytes) else str(raw_tuple[0])
                )
            else:
                continue
            msg = email_lib.message_from_bytes(raw)
            summary = _message_summary(msg, uid.decode() if isinstance(uid, bytes) else str(uid))
            if "RFC822.SIZE" in meta_line:
                import re

                m = re.search(r"RFC822\.SIZE\s+(\d+)", meta_line)
                if m:
                    summary["size_bytes"] = int(m.group(1))
            if "FLAGS" in meta_line:
                import re

                m = re.search(r"FLAGS\s*\(([^)]*)\)", meta_line)
                if m:
                    summary["flags"] = m.group(1).split()
            results.append(summary)

        return results
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"IMAP list failed: {_safe_error(e, password)}") from None
    finally:
        try:
            conn.logout()
        except Exception:
            pass
