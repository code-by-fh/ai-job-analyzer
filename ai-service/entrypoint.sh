#!/bin/sh

sleep 5

echo "Running Database Migrations..."
alembic upgrade head

echo "Starting command: $@"
exec "$@"