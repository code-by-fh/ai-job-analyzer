"""The one rule for "this user maintains a profile": the setup status, source setup, manual crawl
start and the scheduler all ask it, so they never disagree."""

from typing import Optional

from sqlalchemy.orm import Session

from database.core import UserProfile

# The fixed 409 detail the web maps to its own message.
PROFILE_REQUIRED = "profile_required"


def profile_complete(profile: Optional[UserProfile]) -> bool:
    """A profile counts as maintained once it names a role and skills."""
    return bool(profile and (profile.role or "").strip() and (profile.skills or "").strip())


def user_profile_complete(db: Session, user_id: int) -> bool:
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    return profile_complete(profile)
