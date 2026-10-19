"""Request and response models. Requests forbid unknown keys; every field is bounded.

Responses never carry a secret value: secret fields appear only in ``secrets`` as "set" / "not set".
"""

import re
from datetime import datetime
from typing import Annotated, Any, Dict, List, Literal, Optional, Union
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.channel_types import FieldKind, is_email_address
from app.limits import (
    BODY_MAX_LENGTH,
    CHANNEL_NAME_MAX_LENGTH,
    JOB_REASONING_MAX_LENGTH,
    JOB_TEXT_MAX_LENGTH,
    JOB_URL_MAX_LENGTH,
    MAX_CHANNELS_PER_NOTIFICATION,
    MAX_FIELDS_PER_CHANNEL,
    MAX_JOBS_PER_DIGEST,
    MAX_RECIPIENTS,
    OWNER_MAX_LENGTH,
    OWNER_PATTERN,
    PLATFORM_NAME_MAX_LENGTH,
    PUSH_TEMPLATE_MAX_LENGTH,
    SUBJECT_MAX_LENGTH,
    TEMPLATE_HTML_MAX_LENGTH,
    USER_NAME_MAX_LENGTH,
)

_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
SET = "set"
NOT_SET = "not set"


def _single_line(value: str) -> str:
    if _CONTROL_CHARACTERS.search(value):
        raise ValueError("must be a single line without control characters")
    return value


def _email(value: str) -> str:
    if not is_email_address(value):
        raise ValueError("must be an email address")
    return value


Owner = Annotated[str, StringConstraints(min_length=1, max_length=OWNER_MAX_LENGTH, pattern=OWNER_PATTERN)]
ChannelName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=CHANNEL_NAME_MAX_LENGTH), AfterValidator(_single_line)
]
ChannelTypeId = Literal["pushover", "resend", "mailjet", "smtp"]
# Raw values are checked against the type's field schema in channel_types; the body limit bounds them before.
FieldValue = Union[str, int, List[str], None]
FieldValues = Annotated[Dict[str, FieldValue], Field(max_length=MAX_FIELDS_PER_CHANNEL)]
EmailAddress = Annotated[str, AfterValidator(_email)]
Subject = Annotated[str, StringConstraints(min_length=1, max_length=SUBJECT_MAX_LENGTH), AfterValidator(_single_line)]
SingleLine = Annotated[str, AfterValidator(_single_line)]


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChannelCreate(_Request):
    owner: Owner
    type: ChannelTypeId
    name: ChannelName
    fields: FieldValues


class ChannelUpdate(_Request):
    """Omitted keys stay as they are; a field set to null is cleared; type and owner never change."""

    name: Optional[ChannelName] = None
    fields: FieldValues = Field(default_factory=dict)


class LabelOut(BaseModel):
    de: str
    en: str


class FieldSpecOut(BaseModel):
    name: str
    label: LabelOut
    kind: FieldKind
    required: bool
    secret: bool
    max_length: Optional[int]
    max_items: Optional[int]
    default: Optional[int]


class ChannelTypeOut(BaseModel):
    id: str
    label: LabelOut
    fields: List[FieldSpecOut]


class ChannelTypeList(BaseModel):
    items: List[ChannelTypeOut]


class ChannelOut(BaseModel):
    id: UUID
    type: str
    name: str
    owner: str
    fields: Dict[str, Any] = Field(description="Non-secret field values")
    secrets: Dict[str, Literal["set", "not set"]] = Field(description="Secret fields, value never returned")
    created_at: datetime
    updated_at: datetime


class ChannelPage(BaseModel):
    items: List[ChannelOut]
    total: int
    limit: int
    offset: int


class JobItem(_Request):
    title: Annotated[str, Field(max_length=JOB_TEXT_MAX_LENGTH)] = ""
    company: Annotated[str, Field(max_length=JOB_TEXT_MAX_LENGTH)] = ""
    match_score: Annotated[Optional[float], Field(ge=0, le=100)] = None
    reasoning: Annotated[str, Field(max_length=JOB_REASONING_MAX_LENGTH)] = ""
    url: Annotated[str, Field(max_length=JOB_URL_MAX_LENGTH)] = ""


class DigestVariables(_Request):
    user_name: Annotated[SingleLine, Field(max_length=USER_NAME_MAX_LENGTH)] = "Candidate"
    platform_name: Annotated[SingleLine, Field(max_length=PLATFORM_NAME_MAX_LENGTH)] = "Job Platform"
    jobs: Annotated[List[JobItem], Field(min_length=1, max_length=MAX_JOBS_PER_DIGEST)]


class DigestTemplate(_Request):
    """The job digest: e-mail channels get one HTML mail, push channels one message per job."""

    name: Literal["job_digest"]
    html: Annotated[Optional[str], Field(max_length=TEMPLATE_HTML_MAX_LENGTH)] = None
    push_text: Annotated[Optional[str], Field(max_length=PUSH_TEMPLATE_MAX_LENGTH)] = None
    variables: DigestVariables


class NotificationCreate(_Request):
    """Either ``subject`` + ``body`` (plain text) or ``template`` (``subject`` then optional)."""

    owner: Owner
    channel_ids: Annotated[Optional[List[UUID]], Field(max_length=MAX_CHANNELS_PER_NOTIFICATION)] = None
    subject: Optional[Subject] = None
    body: Annotated[Optional[str], Field(min_length=1, max_length=BODY_MAX_LENGTH)] = None
    template: Optional[DigestTemplate] = None
    recipients: Annotated[Optional[List[EmailAddress]], Field(min_length=1, max_length=MAX_RECIPIENTS)] = None

    @model_validator(mode="after")
    def _one_content(self) -> "NotificationCreate":
        if (self.body is None) == (self.template is None):
            raise ValueError("send either body or template")
        if self.body is not None and self.subject is None:
            raise ValueError("a body needs a subject")
        return self


class PreviewCreate(_Request):
    template: DigestTemplate


class PreviewOut(BaseModel):
    """The digest as it would be sent: subject and HTML of the mail, the push text of the first job."""

    subject: str
    html: str
    push_text: str


class DeliveryOut(BaseModel):
    channel_id: UUID
    delivered: bool
    reason: Optional[str] = Field(default=None, description="Fixed failure code when not delivered")


class NotificationResult(BaseModel):
    results: List[DeliveryOut]
