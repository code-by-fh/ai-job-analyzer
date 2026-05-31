"""Batch e-mail digest adapters (Resend / Mailjet / SMTP).

A single generic sender (:func:`_send_email_batch`) handles recipient
validation, HTML rendering and subject building. Each channel only provides
its credential check, recipient/template fields and the actual transport in a
small ``send_fn`` closure. The public wrapper signatures are unchanged so that
``routers/platforms.py`` and ``routers/settings.py`` keep importing them via
``workers.worker``.
"""

import requests

from core.logger import get_logger
from database.core import JobEntry, UserProfile, JobPlatform, User

from workers.notifications.templates import (
    _RESEND_DEFAULT_HTML,
    _RESEND_DEFAULT_JOB_ROW,
    render_email_html,
    digest_subject,
)

logger = get_logger(__name__)

# Re-exported for backwards compatibility (used by the SMTP test route).
__all__ = [
    "_RESEND_DEFAULT_HTML",
    "_RESEND_DEFAULT_JOB_ROW",
    "_send_via_resend_batch",
    "_send_via_mailjet_batch",
    "_send_via_smtp_batch",
    "_flush_resend_digest",
    "_flush_mailjet_digest",
    "_flush_smtp_digest",
    "flush_all_digests",
]


def _send_email_batch(jobs, profile, platform, userName, *, recipients, raw_template, channel, send_fn):
    """Generic batch digest sender. Returns True on success.

    ``send_fn(subject, html, recipients) -> bool`` performs the channel-specific
    transport. Credential checks are done by the caller (channel-specific fields).
    """
    if not recipients:
        logger.warning(f"{channel}: no recipients configured for platform.")
        return False

    platform_name = (getattr(platform, "name", None) or "Job Platform") if platform else "Job Platform"
    html = render_email_html(jobs, raw_template, userName=userName, platform_name=platform_name)
    subject = digest_subject(len(jobs), platform_name)
    return send_fn(subject, html, recipients)


def _send_via_resend_batch(jobs, profile, platform=None, userName="Candidate"):
    """Send a batch digest email via Resend API. Returns True on success."""
    if not profile.resend_api_key or not profile.resend_from_email:
        logger.warning("Resend batch notification enabled but credentials missing.")
        return False

    recipients = (getattr(platform, "resend_recipients", None) or []) if platform else []
    raw_template = (getattr(platform, "resend_template", None) or "") if platform else ""
    platform_name = (getattr(platform, "name", None) or "Job Platform") if platform else "Job Platform"

    def _send(subject, html, recips):
        to = recips if isinstance(recips, list) else [recips]
        payload = {
            "from": profile.resend_from_email,
            "to": to,
            "subject": subject,
            "html": html,
        }
        resp = requests.post(
            "https://api.resend.com/emails",
            json=payload,
            headers={"Authorization": f"Bearer {profile.resend_api_key}"},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            logger.info(f" Resend digest sent: {len(jobs)} jobs → {recips} (platform: {platform_name})")
            return True
        logger.error(f"Resend API error {resp.status_code}: {resp.text}")
        return False

    return _send_email_batch(
        jobs, profile, platform, userName,
        recipients=recipients, raw_template=raw_template, channel="Resend", send_fn=_send,
    )


def _send_via_mailjet_batch(jobs, profile, platform=None, userName="Candidate"):
    """Send a batch digest email via Mailjet API. Returns True on success."""
    if not profile.mailjet_api_key or not profile.mailjet_secret_key or not profile.mailjet_from_email:
        logger.warning("Mailjet batch notification enabled but credentials missing.")
        return False

    recipients = (getattr(platform, "mailjet_recipients", None) or []) if platform else []
    raw_template = (getattr(platform, "mailjet_template", None) or "") if platform else ""
    platform_name = (getattr(platform, "name", None) or "Job Platform") if platform else "Job Platform"

    def _send(subject, html, recips):
        to_list = [{"Email": r} for r in (recips if isinstance(recips, list) else [recips])]
        payload = {
            "Messages": [{
                "From": {"Email": profile.mailjet_from_email, "Name": "Job Agent"},
                "To": to_list,
                "Subject": subject,
                "HTMLPart": html,
            }]
        }
        resp = requests.post(
            "https://api.mailjet.com/v3.1/send",
            json=payload,
            auth=(profile.mailjet_api_key, profile.mailjet_secret_key),
            timeout=15,
        )
        if resp.status_code in (200, 201):
            logger.info(f" Mailjet digest sent: {len(jobs)} jobs → {recips} (platform: {platform_name})")
            return True
        logger.error(f"Mailjet API error {resp.status_code}: {resp.text}")
        return False

    return _send_email_batch(
        jobs, profile, platform, userName,
        recipients=recipients, raw_template=raw_template, channel="Mailjet", send_fn=_send,
    )


def _send_via_smtp_batch(jobs, profile, platform=None, userName="Candidate"):
    """Send a batch digest email via SMTP (port 587, STARTTLS). Returns True on success."""
    if not profile.smtp_host or not profile.smtp_user or not profile.smtp_password:
        logger.warning("SMTP batch notification enabled but credentials missing.")
        return False

    recipients = (getattr(platform, "smtp_recipients", None) or []) if platform else []
    raw_template = (getattr(platform, "smtp_template", None) or "") if platform else ""
    platform_name = (getattr(platform, "name", None) or "Job Platform") if platform else "Job Platform"

    def _send(subject, html, recips):
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        smtp_port = getattr(profile, "smtp_port", None) or 587
        from_email = getattr(profile, "smtp_from_email", None) or profile.smtp_user
        recipients_list = recips if isinstance(recips, list) else [recips]
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = from_email
            msg["To"] = ", ".join(recipients_list)
            msg.attach(MIMEText(html, "html", "utf-8"))

            with smtplib.SMTP(profile.smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.login(profile.smtp_user, profile.smtp_password)
                server.sendmail(from_email, recipients_list, msg.as_string())

            logger.info(f" SMTP digest sent: {len(jobs)} jobs → {recips} (platform: {platform_name})")
            return True
        except Exception as e:
            logger.error(f"SMTP error: {e}")
            return False

    return _send_email_batch(
        jobs, profile, platform, userName,
        recipients=recipients, raw_template=raw_template, channel="SMTP", send_fn=_send,
    )


def _flush_digest(crawl_job_id, user_id, db, r, *, key_suffix, has_creds, send_batch, label):
    """Send a batched digest for all jobs queued during a crawl, if any."""
    key = f"crawl:{crawl_job_id}:{key_suffix}"
    job_ids_raw = r.lrange(key, 0, -1)
    if not job_ids_raw:
        return
    r.delete(key)

    job_ids = [
        jid.decode("utf-8") if isinstance(jid, bytes) else str(jid)
        for jid in job_ids_raw
    ]
    jobs = db.query(JobEntry).filter(JobEntry.id.in_(job_ids)).all()
    if not jobs:
        return

    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile or not has_creds(profile):
        return

    user = db.query(User).filter(User.id == user_id).first()
    userName = user.username if user else "Candidate"

    platform = None
    if jobs[0].platform_id:
        platform = db.query(JobPlatform).filter(JobPlatform.id == jobs[0].platform_id).first()

    try:
        send_batch(jobs, profile, platform=platform, userName=userName)
    except Exception as e:
        logger.error(f"{label} digest failed: {e}")


def _flush_resend_digest(crawl_job_id, user_id, db, r):
    _flush_digest(
        crawl_job_id, user_id, db, r,
        key_suffix="pending_resend",
        has_creds=lambda p: bool(p.resend_api_key),
        send_batch=_send_via_resend_batch,
        label="Resend",
    )


def _flush_mailjet_digest(crawl_job_id, user_id, db, r):
    _flush_digest(
        crawl_job_id, user_id, db, r,
        key_suffix="pending_mailjet",
        has_creds=lambda p: bool(p.mailjet_api_key),
        send_batch=_send_via_mailjet_batch,
        label="Mailjet",
    )


def _flush_smtp_digest(crawl_job_id, user_id, db, r):
    _flush_digest(
        crawl_job_id, user_id, db, r,
        key_suffix="pending_smtp",
        has_creds=lambda p: bool(p.smtp_host),
        send_batch=_send_via_smtp_batch,
        label="SMTP",
    )


def flush_all_digests(crawl_job_id, user_id, db, r):
    """Flush Resend, Mailjet and SMTP digests for a finished crawl."""
    _flush_resend_digest(crawl_job_id, user_id, db, r)
    _flush_mailjet_digest(crawl_job_id, user_id, db, r)
    _flush_smtp_digest(crawl_job_id, user_id, db, r)
