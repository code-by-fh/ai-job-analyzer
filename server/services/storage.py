import os
import json
import httpx
from typing import Optional
from core.logger import get_logger

logger = get_logger(__name__)

class StorageService:
    def upload_file(self, content: str, filename: str, mime_type: str = "text/plain") -> bool:
        raise NotImplementedError

class GoogleDriveStorage(StorageService):
    def __init__(self, refresh_token: str):
        self.refresh_token = refresh_token
        self.client_id = os.getenv("GOOGLE_CLIENT_ID")
        self.client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        self.access_token = None

    async def _refresh_access_token(self):
        url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
            "grant_type": "refresh_token",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, data=data)
            if resp.status_code == 200:
                self.access_token = resp.json().get("access_token")
                return True
            logger.error(f"Failed to refresh Google token: {resp.text}")
            return False

    async def upload_file(self, content: str, filename: str, mime_type: str = "text/plain") -> bool:
        if not self.access_token:
            if not await self._refresh_access_token():
                return False

        async with httpx.AsyncClient() as client:
            # Step 1: Create Metadata
            metadata = {
                "name": filename,
                "mimeType": mime_type
            }
            
            # Step 2: Multipart Upload (Simple for MVP)
            # For complex files use Resumable Upload
            files = {
                'data': ('metadata', json.dumps(metadata), 'application/json; charset=UTF-8'),
                'file': (filename, content, mime_type)
            }
            
            url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
            headers = {"Authorization": f"Bearer {self.access_token}"}
            
            resp = await client.post(url, headers=headers, files=files)
            if resp.status_code in (200, 201):
                logger.info(f"Successfully uploaded {filename} to Google Drive")
                return True
            
            logger.error(f"Google Drive Upload Error: {resp.text}")
            return False

def get_storage_service(profile) -> Optional[StorageService]:
    if profile.active_storage_service == "GOOGLE_DRIVE" and profile.google_drive_refresh_token:
        return GoogleDriveStorage(profile.google_drive_refresh_token)
    return None
