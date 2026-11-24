from __future__ import annotations

import os
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Tuple

from services.gmail_service import GmailService


def _build_message(sender: str, recipient: str, subject: str, body: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.set_content(body)
    return msg


def send_email(recipient: str, subject: str, body: str, timeout: int = 10) -> Tuple[bool, str | None]:
    """
    Send an email using Gmail API if available, otherwise using SMTP env vars.
    Returns (success, error_message).
    """
    try:
        sender = os.getenv("SMTP_FROM", "")
        gmail_service = GmailService()

        message = _build_message(sender, recipient, subject, body)

        # Prefer Gmail API if configured
        try:
            if gmail_service.can_send():
                try:
                    gmail_service.send_message(message)
                    return True, None
                except Exception as exc:
                    # fall through to SMTP path but capture error
                    gmail_err = str(exc)
                    # continue to SMTP
            else:
                gmail_err = None
        except Exception:
            gmail_err = None

        # SMTP fallback
        smtp_host = os.getenv("SMTP_HOST", "")
        smtp_port = int(os.getenv("SMTP_PORT", "587") or "587")
        smtp_username = os.getenv("SMTP_USERNAME", "")
        smtp_password = os.getenv("SMTP_PASSWORD", "")
        smtp_from = sender

        if not smtp_host or not smtp_from:
            return False, "SMTP configuration is incomplete."

        try:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=timeout) as smtp_client:
                if smtp_username and smtp_password:
                    smtp_client.starttls()
                    smtp_client.login(smtp_username, smtp_password)
                smtp_client.send_message(message)
        except Exception as exc:
            return False, str(exc)

        return True, None
    except Exception as exc:
        return False, str(exc)
