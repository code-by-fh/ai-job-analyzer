from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.auth import ACCESS_TOKEN_TYPE, user_from_token
from database.core import SessionLocal
from core.connection_manager import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    db = SessionLocal()
    try:
        user = user_from_token(db, websocket.cookies.get("access_token"), ACCESS_TOKEN_TYPE)
        user_id = user.id if user else None
    finally:
        db.close()
    if user_id is None:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
