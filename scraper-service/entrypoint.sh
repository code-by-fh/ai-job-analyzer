#!/bin/sh

sleep 5

echo "Starting scraper worker..."

if [ "$SERVICE_MODE" = "worker" ]; then
    echo "🔵 MODUS ERKANNT: Starting Celery Worker (worker.py)..."
    exec celery -A worker.celery_app worker --loglevel=info --concurrency=4 -Q ai_queue

elif [ "$SERVICE_MODE" = "api" ]; then
    echo "🟢 MODUS ERKANNT: Starting FastAPI (api.py)..."
    exec uvicorn api:app --host 0.0.0.0 --port 80

else
    echo "⚪ KEIN MODUS GESETZT: Führe Standard-CMD aus Dockerfile aus..."
    exec "$@"
fi