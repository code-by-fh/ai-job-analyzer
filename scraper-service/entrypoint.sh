#!/bin/sh
set -e

export PYTHONPATH=$PYTHONPATH:/app

echo "========================================"
echo "   CONTAINER START - DIAGNOSE MODUS"
echo "========================================"
echo "Aktuelles Verzeichnis: $(pwd)"
echo "Dateien im Verzeichnis:"
ls -la *.py 2>/dev/null || echo "Keine Python-Dateien gefunden!"

echo "Gelesene Variable SERVICE_MODE: '$SERVICE_MODE'"

echo "Starte Supervisord..."
exec supervisord -c supervisord.conf