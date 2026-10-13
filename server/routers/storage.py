import os
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from database.core import SessionLocal, User, UserProfile
from core.auth import get_current_user
from core.logger import get_logger
from core.oauth_state import OAUTH_STATE_TTL_SECONDS, new_oauth_nonce, sign_oauth_state, verify_oauth_state
from routers.deps import COOKIE_SECURE
import httpx

logger = get_logger(__name__)
router = APIRouter(prefix="/storage", tags=["storage"])

# Google OAuth2 Config (to be filled from env)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI") # If None, will be determined dynamically
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
DRIVE_OAUTH_NONCE_COOKIE = "drive_oauth_nonce"
# "/": the browser may reach the API under a proxy prefix, which a narrower path would not match.
# Lax so it comes back on Google's top-level redirect, not on cross-site subrequests.
DRIVE_OAUTH_COOKIE_PATH = "/"
DRIVE_OAUTH_COOKIE_SAMESITE = "lax"
STORAGE_NONE = "NONE"
STORAGE_GOOGLE_DRIVE = "GOOGLE_DRIVE"
HTTP_OK = 200
# Fixed query strings the settings page knows; no Google or server text reaches the browser.
DRIVE_CONNECTED_QUERY = "tab=storage&success=google_connected"
DRIVE_FAILED_QUERY = "error=google_auth_failed"

@router.get("/google/login")
async def google_login(request: Request, current_user: User = Depends(get_current_user)):
    # The browser tab navigates here directly, so a refusal is the settings page's fixed error, never JSON.
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        return _settings_redirect(DRIVE_FAILED_QUERY)
    
    # Scope for Google Drive file access + user info
    scopes = [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email"
    ]
    
    redirect_uri = _callback_uri(request)
    nonce = new_oauth_nonce()
    state = sign_oauth_state(current_user.id, nonce, int(time.time()) + OAUTH_STATE_TTL_SECONDS)
    auth_url = (
        f"{GOOGLE_AUTH_URL}?client_id={GOOGLE_CLIENT_ID}&redirect_uri={redirect_uri}"
        f"&response_type=code&scope={' '.join(scopes)}&access_type=offline&prompt=consent"
        f"&state={state}"
    )
    return _with_nonce_cookie(RedirectResponse(auth_url), nonce)


def _with_nonce_cookie(response: RedirectResponse, nonce: str) -> RedirectResponse:
    response.set_cookie(
        DRIVE_OAUTH_NONCE_COOKIE, nonce, max_age=OAUTH_STATE_TTL_SECONDS, path=DRIVE_OAUTH_COOKIE_PATH,
        httponly=True, secure=COOKIE_SECURE, samesite=DRIVE_OAUTH_COOKIE_SAMESITE,
    )
    return response


def _settings_redirect(query: str) -> RedirectResponse:
    response = RedirectResponse(f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/settings?{query}")
    response.delete_cookie(
        DRIVE_OAUTH_NONCE_COOKIE, path=DRIVE_OAUTH_COOKIE_PATH,
        httponly=True, secure=COOKIE_SECURE, samesite=DRIVE_OAUTH_COOKIE_SAMESITE,
    )
    return response


def _callback_uri(request: Request) -> str:
    if GOOGLE_REDIRECT_URI:
        return GOOGLE_REDIRECT_URI
    host = request.headers.get("host", "localhost:8000")
    scheme = "https" if request.url.scheme == "https" else "http"
    return f"{scheme}://{host}/storage/google/callback"


def _json_object(response: httpx.Response) -> Optional[dict]:
    """The JSON object Google answers with; any other JSON value is no answer (non-JSON raises ValueError)."""
    body = response.json()
    if not isinstance(body, dict):
        logger.error(f"Google answered with JSON that is no object: {type(body).__name__}")
        return None
    return body


async def _exchange_code(client: httpx.AsyncClient, code: str, redirect_uri: str) -> Optional[dict]:
    response = await client.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    })
    if response.status_code != HTTP_OK:
        logger.error(f"Google token exchange failed with status {response.status_code}")
        return None
    return _json_object(response)


async def _drive_email(client: httpx.AsyncClient, access_token: Optional[str]) -> Optional[str]:
    response = await client.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
    if response.status_code != HTTP_OK:
        logger.error(f"Google userinfo failed with status {response.status_code}")
        return None
    email = (_json_object(response) or {}).get("email")
    return email if isinstance(email, str) else None


def _store_drive_connection(user_id: int, email: str, refresh_token: Optional[str]) -> bool:
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            return False
        profile.active_storage_service = STORAGE_GOOGLE_DRIVE
        profile.google_drive_email = email
        if refresh_token:  # Google sends it on the first consent only
            profile.google_drive_refresh_token = refresh_token
        db.commit()
        return True
    except SQLAlchemyError:
        db.rollback()
        logger.exception(f"Storing the Drive connection of user {user_id} failed")
        return False
    finally:
        db.close()


async def _connect_drive(user_id: int, code: str, redirect_uri: str) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            tokens = await _exchange_code(client, code, redirect_uri)
            email = await _drive_email(client, tokens.get("access_token")) if tokens else None
    except (httpx.HTTPError, ValueError):
        # ValueError: an answer that is not JSON (json.JSONDecodeError), e.g. an HTML error page.
        logger.exception("Google OAuth request failed")
        return False
    if not email:
        return False
    return _store_drive_connection(user_id, email, tokens.get("refresh_token"))


@router.get("/google/callback")
async def google_callback(
    request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None
):
    """Unauthenticated: only the signed state, bound to this browser by the nonce cookie, names the account."""
    user_id = verify_oauth_state(state, request.cookies.get(DRIVE_OAUTH_NONCE_COOKIE), time.time())
    if error or not code or user_id is None:
        return _settings_redirect(DRIVE_FAILED_QUERY)
    if not await _connect_drive(user_id, code, _callback_uri(request)):
        return _settings_redirect(DRIVE_FAILED_QUERY)
    return _settings_redirect(DRIVE_CONNECTED_QUERY)

@router.post("/google/disconnect")
async def google_disconnect(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if profile:
            profile.active_storage_service = "NONE"
            profile.google_drive_refresh_token = None
            profile.google_drive_email = None
            db.commit()
    finally:
        db.close()
    return {"status": "disconnected"}


@router.get("/status")
def storage_status(current_user: User = Depends(get_current_user)):
    """What the settings page needs to offer Drive: booleans and the user's own Drive address only."""
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        return {
            "available": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET),
            "connected": bool(profile and profile.google_drive_refresh_token),
            "active": (profile.active_storage_service if profile else None) or STORAGE_NONE,
            "email": profile.google_drive_email if profile else None,
        }
    finally:
        db.close()


@router.post("/toggle")
async def toggle_storage_service(request: Request, current_user: User = Depends(get_current_user)):
    data = await request.json()
    service = data.get("service")
    if service not in ("NONE", "GOOGLE_DRIVE"):
        raise HTTPException(status_code=400, detail="Invalid storage service")
        
    db = SessionLocal()
    try:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        if not profile:
            profile = UserProfile(user_id=current_user.id)
            db.add(profile)
            
        if service == "GOOGLE_DRIVE" and not profile.google_drive_refresh_token:
            raise HTTPException(status_code=400, detail="Google Drive not connected")
            
        profile.active_storage_service = service
        db.commit()
    finally:
        db.close()
    return {"status": "success", "service": service}
