FROM mcr.microsoft.com/playwright/python:v1.41.0-jammy

WORKDIR /app

# 1. System-Abhängigkeiten installieren
# build-essential & pkg-config: Zum Kompilieren von C-Extensions
# libcairo2-dev: Grafik-Bibliothek für PDFs
# python3-dev: Python Header Dateien
RUN DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    build-essential \
    pkg-config \
    python3-dev \
    libcairo2-dev \
    supervisor \
    xvfb \
    x11vnc \
    novnc \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DISPLAY=:99

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium

# Create non-root user and set up permissions
RUN groupadd -r appgroup && useradd -r -g appgroup -d /app -s /sbin/nologin appuser
RUN mkdir -p /app/uploads /var/log/supervisor && \
    chown -R appuser:appgroup /app /var/log/supervisor && \
    chmod -R 755 /var/log/supervisor

COPY . .
RUN chown -R appuser:appgroup /app
RUN chmod +x entrypoint.sh

USER appuser

ENTRYPOINT ["./entrypoint.sh"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]