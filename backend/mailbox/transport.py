"""Delivery over Gmail SMTP, and the saved-not-delivered fallbacks.

`delivered` means send_message returned without raising and nothing weaker. A
missing Gmail setup or a reserved demo address is a normal state, saved and
reported as such, never dressed up as sent. Config is read at call time, from
the module, so the state of the environment is what decides.
"""

from __future__ import annotations

import re
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from backend import config

DELIVERED, SAVED, FAILED = "delivered", "saved", "failed"
NOT_SET_UP = "Saved, not delivered. Gmail is not set up."
DEMO_ADDRESS = "Saved, not delivered. This is a demo address."

_ADDRESS = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$")


@dataclass(frozen=True)
class Result:
    status: str
    reason: str
    message: str


def is_valid_address(address: str) -> bool:
    return bool(_ADDRESS.match(address or ""))


def is_reserved(address: str) -> bool:
    """True for a domain that can never deliver, so a demo cannot email a real person."""
    domain = address.rsplit("@", 1)[-1].strip().lower().rstrip(".")
    return (domain in config.RESERVED_EMAIL_DOMAINS
            or domain.endswith(tuple(config.RESERVED_EMAIL_SUFFIXES)))


def gmail_configured() -> bool:
    return bool(config.GMAIL_USER and config.GMAIL_APP_PASSWORD)


def status() -> dict[str, object]:
    configured = gmail_configured()
    return {"gmail_configured": configured,
            "sender": config.GMAIL_USER or None,
            "delivery": "gmail" if configured else "save_only"}


def _failure(exc: Exception) -> str:
    """A reason a teacher can act on. The exception text is never shown, because
    it can carry server detail and the password must not travel anywhere."""
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "Gmail did not accept the sign-in. Check the app password."
    if isinstance(exc, (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused)):
        return "Gmail refused this address. Check it is spelled correctly."
    if isinstance(exc, (OSError, smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError)):
        return "Could not reach Gmail. Check the internet connection and try again."
    return "Gmail could not send this note. Try again in a moment."


def _build(to: str, subject: str, body: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = config.GMAIL_USER
    msg["To"] = to
    msg["Subject"] = " ".join(subject.split())
    msg.set_content(body, charset="utf-8")
    return msg


def deliver(to: str, subject: str, body: str) -> Result:
    if is_reserved(to):
        return Result(SAVED, "demo address", DEMO_ADDRESS)
    if not gmail_configured():
        return Result(SAVED, "gmail not set up", NOT_SET_UP)
    try:
        msg = _build(to, subject, body)
        with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT,
                              timeout=config.SMTP_TIMEOUT_SECONDS,
                              context=ssl.create_default_context()) as smtp:
            smtp.login(config.GMAIL_USER, config.GMAIL_APP_PASSWORD)
            smtp.send_message(msg)
    except Exception as exc:  # any failure is reported, none may reach the teacher as a trace
        reason = _failure(exc)
        return Result(FAILED, reason, f"Not sent. {reason}")
    return Result(DELIVERED, "", f"Sent to {to}.")
