"""Optional email delivery; notification failures never abort publication."""
import json
import logging
import os
from pathlib import Path

from .render import MAIL_CONTENT_RE

LOGGER = logging.getLogger(__name__)


def load_recipients(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [task["email"] for task in payload.get("tasks", []) if task.get("email")]


def send_mail(recipients: list[str], subject: str, html_content: str) -> bool:
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_host = os.getenv("SMTP_HOST")
    if not recipients or not all((smtp_user, smtp_password, smtp_host)):
        LOGGER.info("Email skipped: recipients or SMTP configuration is missing")
        return False
    import yagmail

    with yagmail.Client(
        user=smtp_user,
        password=smtp_password,
        host=smtp_host,
    ) as client:
        client.send(recipients, subject, html_content)
    return True


def notify_email(project_root: Path, html_content: str | None = None, content_path: Path | None = None) -> bool:
    """Treat every notification failure as optional, without logging credentials."""
    if not all(
        os.getenv(name) for name in ("SMTP_USER", "SMTP_PASSWORD", "SMTP_HOST")
    ):
        LOGGER.info("Email skipped: SMTP configuration is missing")
        return False
    try:
        if html_content is None:
            if content_path is not None:
                html_content = content_path.read_text(encoding="utf-8")
            else:
                readme = (project_root / "docs/README.md").read_text(encoding="utf-8")
                match = MAIL_CONTENT_RE.search(readme)
                if not match:
                    raise ValueError("generated page has no email content")
                html_content = match.group(1)
        recipients = load_recipients(project_root / "tasks.json")
        return send_mail(recipients, "嘎!RSS订阅", html_content)
    except Exception as error:
        # Notifications are optional. Do not include SMTP responses or secrets.
        LOGGER.warning(
            "Email notification failed (%s); feed build and deployment are unaffected",
            type(error).__name__,
        )
        return False


