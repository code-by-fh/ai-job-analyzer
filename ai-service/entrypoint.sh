#!/bin/sh
set -e

sleep 5

echo "Running Database Migrations..."
# Optional: Nur ausführen, wenn alembic vorhanden ist
alembic upgrade head || echo "Migrations skipped or failed"

export PYTHONPATH=$PYTHONPATH:/app

echo "Starting command: $@"
exec "$@"