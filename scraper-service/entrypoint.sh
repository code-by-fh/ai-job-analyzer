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

if [ "$SERVICE_MODE" = "worker" ]; then
    echo "✅ MODUS: WORKER erkannt."
    echo "Starte Celery mit worker.py..."
    if [ ! -f "worker.py" ]; then
        echo "❌ FEHLER: worker.py nicht gefunden!"
        exit 1
    fi
    exec celery -A worker.celery_app worker --loglevel=info --concurrency=4 -Q scraper_queue

elif [ "$SERVICE_MODE" = "api" ]; then
    echo "✅ MODUS: API erkannt."
    echo "Starte FastAPI..."
    exec uvicorn api:app --host 0.0.0.0 --port 80

else
    echo "⚠️  WARNUNG: Kein gültiger SERVICE_MODE gesetzt (Wert ist leer oder falsch)."
    echo "Fallback: Führe übergebene Argumente aus: $@"
    
    if [ -z "$1" ]; then
        echo "❌ FEHLER: Weder SERVICE_MODE gesetzt noch Argumente übergeben."
        echo "Der Container weiß nicht, was er tun soll."
        echo "Bitte setze SERVICE_MODE=worker oder SERVICE_MODE=api in CapRover."
        exit 1
    fi
    exec "$@"
fi