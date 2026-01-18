FROM python:3.9-slim

WORKDIR /app

# 1. System-Abhängigkeiten installieren
# build-essential & pkg-config: Zum Kompilieren von C-Extensions
# libcairo2-dev: Grafik-Bibliothek für PDFs
# python3-dev: Python Header Dateien
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    python3-dev \
    libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*

# 2. Umgebungsvariablen (wie besprochen)
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 3. Dependencies kopieren und installieren
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Restlichen Code kopieren
COPY . .

# 5. Entrypoint Skript ausführbar machen
RUN chmod +x entrypoint.sh

# 6. Startbefehl
ENTRYPOINT ["./entrypoint.sh"]