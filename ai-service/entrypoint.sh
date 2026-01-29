#!/bin/sh
set -e

export PYTHONPATH=$PYTHONPATH:/app

echo "--- ENTRYPOINT START ---"

if [ "$SERVICE_MODE" = "worker" ]; then
    echo "🔵 Starting CELERY WORKER..."
    exec celery -A worker.celery_app worker --loglevel=info --concurrency=4 -Q ai_queue

elif [ "$SERVICE_MODE" = "api" ]; then
    echo "🟢 Starting FASTAPI..."
    echo "Running Database Migrations..."
    alembic upgrade head || echo "Migrations skipped or failed"
    # Hier der Befehl für die API (api.py)
    # Port 80 ist wichtig für CapRover Container-intern
    exec uvicorn api:app --host 0.0.0.0 --port 80

else
    echo "⚪ No mode selected, executing passed command..."
    exec "$@"
fi