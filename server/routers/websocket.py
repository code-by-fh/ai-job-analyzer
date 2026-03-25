from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from database.core import SessionLocal, User
from connection_manager import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    from jose import JWTError, jwt
    from auth import SECRET_KEY, ALGORITHM

    token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=1008)
        return
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        token_version: int = payload.get("tv", 0)
        if not username:
            raise JWTError("no sub")
    except JWTError:
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user or user.token_version != token_version:
            await websocket.close(code=1008)
            return
        user_id = user.id
    finally:
        db.close()

    await manager.connect(websocket, user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
