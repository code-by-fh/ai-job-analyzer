"""Contact, recruiter and salary details the job analysis reads out of the posting.

The LLM output is untrusted: every part is checked with the same bounded models that guard
PATCH /jobs/{id}; an invalid part is dropped and never fails the analysis. Values only land in
fields the user left empty, and `JobEntry.posting_extracted` records which ones came from the posting.
"""

import re
from typing import Any, Optional

from pydantic import ValidationError

from core.logger import get_logger
from database.core import (
    MAX_CONTACTS,
    JobContactPerson,
    JobEntry,
    JobRecruiterInfo,
    JobSalaryBenchmark,
)

logger = get_logger(__name__)

POSTING_FIELDS = ("contact_persons", "recruiter_info", "salary_benchmark")

EMAIL_FORMAT = re.compile(r"^[^\s@<>,;:\"']+@[^\s@<>,;:\"']+\.[^\s@<>,;:\"']+$")
PHONE_FORMAT = re.compile(r"^[0-9+()\-./ ]{3,}$")
STORED_CURRENCY = "EUR"
STORED_PERIOD = "year"


def _drop_invalid_reachability(raw: dict) -> dict:
    """Remove a malformed email or phone, so only that field is lost and not the whole person."""
    checks = {"email": EMAIL_FORMAT, "phone": PHONE_FORMAT}
    return {
        key: value
        for key, value in raw.items()
        if key not in checks or not value or (isinstance(value, str) and checks[key].match(value.strip()))
    }


def _clean(model, raw: Any) -> Optional[dict]:
    """Validate one object, keeping only the model's keys; None when it is not valid."""
    if not isinstance(raw, dict):
        return None
    known = {
        key: value.strip() if isinstance(value, str) else value
        for key, value in raw.items()
        if key in model.model_fields and value is not None
    }
    try:
        return model(**_drop_invalid_reachability(known)).model_dump()
    except (ValidationError, TypeError):
        logger.info(f"Dropped invalid {model.__name__} from the analysis output")
        return None


def _contacts(raw: Any) -> list:
    if not isinstance(raw, list):
        return []
    cleaned = (_clean(JobContactPerson, item) for item in raw)
    return [contact for contact in cleaned if contact and contact["name"]][:MAX_CONTACTS]


def _recruiter(raw: Any) -> Optional[dict]:
    recruiter = _clean(JobRecruiterInfo, raw)
    return recruiter if recruiter and any(recruiter.values()) else None


def _is_yearly_euro(raw: Any) -> bool:
    """The model must state unit and period; anything but yearly EUR is not stored."""
    if not isinstance(raw, dict):
        return False
    currency, period = raw.get("currency"), raw.get("period")
    return (
        isinstance(currency, str) and currency.strip().upper() == STORED_CURRENCY
        and isinstance(period, str) and period.strip().lower() == STORED_PERIOD
    )


def _salary(raw: Any) -> Optional[dict]:
    if isinstance(raw, dict) and any(isinstance(raw.get(key), bool) for key in ("min", "max")):
        return None
    if not _is_yearly_euro(raw):
        return None
    salary = _clean(JobSalaryBenchmark, raw)
    return salary if salary and (salary["min"] is not None or salary["max"] is not None) else None


def validate_posting_details(data: dict) -> dict:
    """The valid, non-empty parts of the analysis output, keyed by job field name."""
    found = {
        "contact_persons": _contacts(data.get("contact_persons")),
        "recruiter_info": _recruiter(data.get("recruiter_info")),
        "salary_benchmark": _salary(data.get("salary_benchmark")),
    }
    return {field: value for field, value in found.items() if value}


def _is_empty(job: JobEntry, field: str) -> bool:
    value = getattr(job, field)
    if field == "contact_persons":
        return not value
    if field == "recruiter_info":
        return not value or not any(value.values())
    return not value or (value.get("min") is None and value.get("max") is None)


def apply_posting_details(job: JobEntry, data: dict) -> None:
    """Fill empty contact/recruiter/salary fields from the analysis output; never overwrite."""
    extracted = list(job.posting_extracted or [])
    for field, value in validate_posting_details(data).items():
        if _is_empty(job, field):
            setattr(job, field, value)
            if field not in extracted:
                extracted.append(field)
    job.posting_extracted = extracted or None


def forget_posting_origin(job: JobEntry, edited_fields: set) -> None:
    """A field the user saved is theirs now, so it loses its "from the posting" mark."""
    if not job.posting_extracted:
        return
    remaining = [field for field in job.posting_extracted if field not in edited_fields]
    job.posting_extracted = remaining or None
