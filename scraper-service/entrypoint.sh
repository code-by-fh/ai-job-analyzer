#!/bin/sh

sleep 5

echo "Starting scraper worker..."

echo "Starting command: $@"
exec "$@"