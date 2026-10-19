"""Application factory. Start with ``uvicorn app.main:create_app --factory`` (one process, see README)."""

import logging
import os
import time
from typing import Callable, Optional

from fastapi import FastAPI

from app.api.deps import Limiters
from app.api.routes import health_router, router
from app.channels import reseal_all
from app.config import Settings, load_settings
from app.crypto import FieldCipher
from app.db import open_database
from app.errors import install_error_handlers
from app.limits import APP_TEST_SEND_RATE, MAX_BODY_BYTES, NOTIFICATION_RATE, TEST_SEND_RATE
from app.middleware import ApiKeyMiddleware, BodyLimitMiddleware
from app.rate_limit import RateLimiter

LOGGER_NAME = "notify"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
UTC_TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def _configure_logging() -> None:
    """Service logs in UTC with an explicit offset; uvicorn keeps its own handlers."""
    logger = logging.getLogger(LOGGER_NAME)
    if logger.handlers:
        return
    handler = logging.StreamHandler()
    formatter = logging.Formatter(LOG_FORMAT, UTC_TIME_FORMAT)
    formatter.converter = time.gmtime
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def create_app(settings: Optional[Settings] = None, clock: Callable[[], float] = time.monotonic) -> FastAPI:
    """Build the app; without *settings* they come from the environment and the start fails fast if invalid."""
    settings = settings or load_settings(os.environ)
    _configure_logging()
    # The API description is served only behind the API key (GET /v1/openapi.json).
    app = FastAPI(title="Notification Service", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.session_factory = open_database(settings.database_path)
    app.state.cipher = FieldCipher(settings.encryption_keys)
    if app.state.cipher.rotating:
        reseal_all(app.state.session_factory, app.state.cipher)
    app.state.limiters = Limiters(
        test_sends=RateLimiter.for_rate(TEST_SEND_RATE, clock),
        app_test_sends=RateLimiter.for_rate(APP_TEST_SEND_RATE, clock),
        notifications=RateLimiter.for_rate(NOTIFICATION_RATE, clock),
    )
    install_error_handlers(app)
    app.include_router(health_router)
    app.include_router(router)
    # The last one added runs first: authentication before any body is read.
    app.add_middleware(BodyLimitMiddleware, max_bytes=MAX_BODY_BYTES)
    app.add_middleware(ApiKeyMiddleware, api_keys=settings.api_keys)
    return app
