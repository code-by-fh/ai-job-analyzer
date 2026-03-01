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
    supervisor \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "80"]