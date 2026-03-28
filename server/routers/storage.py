import os
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from database.core import SessionLocal, User, UserProfile
from auth import get_current_user
from logger import get_logger
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

@router.get("/google/login")
async def google_login(request: Request, current_user: User = Depends(get_current_user)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google Client ID not configured")
    
    # Scope for Google Drive file access + user info
    scopes = [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email"
    ]
    
    # Dynamically determine redirect URI if not set
    # Using the host from the request ensures it matches what the browser is calling (e.g. localhost:8002)
    redirect_uri = GOOGLE_REDIRECT_URI
    if not redirect_uri:
        host = request.headers.get("host", "localhost:8000")
        scheme = "https" if request.url.scheme == "https" else "http"
        redirect_uri = f"{scheme}://{host}/storage/google/callback"

    auth_url = (
        f"{GOOGLE_AUTH_URL}?client_id={GOOGLE_CLIENT_ID}&redirect_uri={redirect_uri}"
        f"&response_type=code&scope={' '.join(scopes)}&access_type=offline&prompt=consent"
        f"&state={current_user.id}"
    )
    return RedirectResponse(auth_url)

@router.get("/google/callback")
async def google_callback(request: Request, code: str, state: str):
    # state contains user_id
    user_id = int(state)
    
    # Dynamically determine redirect URI if not set
    redirect_uri = GOOGLE_REDIRECT_URI
    if not redirect_uri:
        host = request.headers.get("host", "localhost:8000")
        scheme = "https" if request.url.scheme == "https" else "http"
        redirect_uri = f"{scheme}://{host}/storage/google/callback"

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        
        if token_resp.status_code != 200:
            logger.error(f"Google Token Exchange Error: {token_resp.text}")
            return RedirectResponse(f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/settings?error=google_auth_failed")
            
        tokens = token_resp.json()
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token") # Note: refresh_token only provided on first consent
        
        # Get User Info (Email)
        user_info_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        user_info = user_info_resp.json()
        email = user_info.get("email")
        
        # Save to DB
        db = SessionLocal()
        try:
            profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            if profile:
                profile.active_storage_service = "GOOGLE_DRIVE"
                profile.google_drive_email = email
                if refresh_token:
                    profile.google_drive_refresh_token = refresh_token
                db.commit()
        finally:
            db.close()
            
    return RedirectResponse(f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/settings?tab=storage&success=google_connected")

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
