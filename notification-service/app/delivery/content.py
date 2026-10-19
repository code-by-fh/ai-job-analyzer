"""What a notification says, rendered once for e-mail channels and once for push channels."""

from dataclasses import dataclass
from typing import Optional, Tuple

from app.schemas import DigestTemplate, NotificationCreate
from app.templates import digest_subject, render_email_html, render_push_message, single_line, web_link

TEST_SUBJECT = "Testbenachrichtigung"
TEST_BODY = "Dieser Benachrichtigungskanal ist richtig eingerichtet. / This notification channel is set up correctly."


@dataclass(frozen=True)
class EmailContent:
    """Exactly one of ``html`` and ``text`` is set."""

    subject: str
    html: Optional[str]
    text: Optional[str]


@dataclass(frozen=True)
class PushContent:
    title: str
    message: str
    url: Optional[str]


@dataclass(frozen=True)
class Content:
    email: EmailContent
    pushes: Tuple[PushContent, ...]


def plain_content(subject: str, body: str) -> Content:
    return Content(EmailContent(subject, html=None, text=body), (PushContent(subject, body, url=None),))


TEST_CONTENT = plain_content(TEST_SUBJECT, TEST_BODY)


def digest_content(template: DigestTemplate, subject: Optional[str] = None) -> Content:
    """The digest rendered once per channel kind; also what a preview shows."""
    variables = template.variables
    html = render_email_html(
        variables.jobs, template.html or "", user_name=variables.user_name, platform_name=variables.platform_name
    )
    email = EmailContent(subject or digest_subject(len(variables.jobs), variables.platform_name), html=html, text=None)
    pushes = tuple(
        PushContent(single_line(job.title), render_push_message(job, template.push_text), web_link(job.url))
        for job in variables.jobs
    )
    return Content(email, pushes)


def content_for(request: NotificationCreate) -> Content:
    """The request's content; the schema guarantees body + subject or a template."""
    if request.template is not None:
        return digest_content(request.template, request.subject)
    return plain_content(request.subject or "", request.body or "")
