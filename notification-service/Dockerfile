FROM python:3.11.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NOTIFY_DATABASE_PATH=/data/notifications.sqlite3

WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt

# Fixed non-root user; /data is the only writable path (a named volume in compose, seeded with this ownership).
RUN groupadd --system --gid 10001 notify \
    && useradd --system --uid 10001 --gid notify --home-dir /srv --shell /usr/sbin/nologin notify \
    && mkdir /data && chown notify:notify /data

COPY app ./app

USER 10001:10001
EXPOSE 8000

# One process: the rate limiter is in memory and SQLite takes one writer.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
