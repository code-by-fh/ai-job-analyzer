import os
import asyncio
import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

from database.core import Base, engine, SessionLocal, User
from core.auth import get_password_hash
from core.connection_manager import redis_listener
from routers.deps import limiter, COOKIE_SECURE
from core import process_hardening
from core.logger import get_logger

from routers import auth as auth_router
from routers import jobs, platforms, settings, companies, admin, dashboard, websocket, profile_documents, templates, search
from routers import notifications
from services import notification_migration, notifications_client

logger = get_logger(__name__)

_SKIP_LOG_PATHS = {"/health", "/metrics", "/sse"}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        if request.url.path in _SKIP_LOG_PATHS or request.url.path.startswith("/scraper"):
            return await call_next(request)
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000
        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(
            level,
            "%s %s → %d (%.0fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if COOKIE_SECURE:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast: without NOTIFY_API_URL / NOTIFY_API_KEY no channel could be managed and no match notified.
    notifications_client.get_client()
    logger.info("Starting Redis listener task...")
    task = asyncio.create_task(redis_listener())

    # Run pending Alembic migrations (a fresh database is created and stamped instead)
    try:
        from database.schema import prepare_schema
        prepare_schema(engine)
        logger.info("Alembic migrations applied")
    except Exception as e:
        logger.error(f"Alembic migration error: {e}")

    # Ensure Tables Exist
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Checked/Created Database Tables")
    except Exception as e:
        logger.error(f"Error creating tables: {e}")

    # Create Default Admin
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            import secrets as _secrets
            admin_password = os.getenv("ADMIN_PASSWORD") or _secrets.token_urlsafe(16)
            if not os.getenv("ADMIN_PASSWORD"):
                logger.warning(
                    "ADMIN_PASSWORD not set — generated random admin password: %s  "
                    "(set ADMIN_PASSWORD env var to use a fixed password)",
                    admin_password,
                )
            logger.info("Create default admin user")
            hashed_pwd = get_password_hash(admin_password)
            admin_user = User(
                username="admin", hashed_password=hashed_pwd, is_admin=True
            )
            db.add(admin_user)
            db.commit()
    except Exception as e:
        logger.error(f"Error creating default admin: {e}")
    finally:
        db.close()

    # In the background: the service may still be starting, and the API must not wait for it.
    migration = asyncio.create_task(asyncio.to_thread(notification_migration.run_at_startup, SessionLocal))

    yield
    task.cancel()
    migration.cancel()


process_hardening.disable_process_dump()

app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# Pydantic echoes the rejected value ("input", and parser messages under ctx "error") into
# every 422, e.g. a 1 MB template straight back to the client. The constraint values in
# ctx (max_length, ...) come from the schema and stay.
_INPUT_ECHO_KEY = "input"
_INPUT_ECHO_CTX_KEYS = frozenset({"error"})


def _without_input_echo(error: dict) -> dict:
    redacted = {key: value for key, value in error.items() if key != _INPUT_ECHO_KEY}
    if "ctx" in redacted:
        redacted["ctx"] = {key: value for key, value in redacted["ctx"].items() if key not in _INPUT_ECHO_CTX_KEYS}
        if not redacted["ctx"]:
            del redacted["ctx"]
    return redacted


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    """FastAPI's 422 body ({"detail": [...]}) without the echoed request input."""
    detail = [_without_input_echo(error) for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(detail)})


allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
]
logger.info(f"Allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    # The web client reads download filenames cross-origin from this header.
    expose_headers=["Content-Disposition"],
)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Routers
app.include_router(auth_router.router)
app.include_router(jobs.router)
app.include_router(platforms.router)
app.include_router(settings.router)
app.include_router(companies.router)
app.include_router(admin.router)
app.include_router(dashboard.router)
app.include_router(websocket.router)
app.include_router(profile_documents.router)
app.include_router(templates.router)
app.include_router(search.router)
app.include_router(notifications.router)


# Scraper runs as a separate internal service (see supervisord.conf). The frontend
# reaches it through the public API under /scraper/*, so we reverse-proxy those
# requests to it. Cookies, body, query and method are forwarded; the upstream's
# own CORS/security headers are dropped so this app's middleware stays authoritative.
_SCRAPER_SERVICE_URL = os.getenv("SCRAPER_SERVICE_URL", "http://127.0.0.1:8081").rstrip("/")
_PROXY_DROP_REQUEST_HEADERS = {"host", "content-length"}
_PROXY_KEEP_RESPONSE_HEADERS = {"content-type", "cache-control"}


@app.api_route(
    "/scraper/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def scraper_proxy(path: str, request: Request):
    url = f"{_SCRAPER_SERVICE_URL}/{path}"
    forward_headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _PROXY_DROP_REQUEST_HEADERS
    }
    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            upstream = await client.request(
                request.method,
                url,
                params=request.query_params,
                headers=forward_headers,
                content=body,
            )
    except httpx.RequestError as e:
        logger.error("Scraper proxy error for %s: %s", url, e)
        return Response(status_code=502, content=b"Scraper service unavailable")

    response_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() in _PROXY_KEEP_RESPONSE_HEADERS
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
    )
