FROM python:3.11-slim

WORKDIR /app

# System deps: build tools for C-extensions, PDF rendering, supervisor,
# Chrome + Xvfb for botasaurus browser mode in Docker.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    python3-dev \
    libcairo2-dev \
    supervisor \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    xvfb \
    libglib2.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libasound2 \
    && wget -q -O /tmp/chrome.deb \
       "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb" \
    && (dpkg -i /tmp/chrome.deb || apt-get install -fy) \
    && rm /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Tell botasaurus / undetected-chromedriver where Chrome lives
ENV CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

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
