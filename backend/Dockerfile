# Backend API container.
#
# Multi-stage isn't used here because the backend has no build step —
# the Python code runs as-is. Just install dependencies, copy the
# source, and run uvicorn.

FROM python:3.11-slim

# System packages the Pillow wheel needs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so a source change doesn't reinstall them.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the source.
COPY . .

# Data directory for the SQLite database and uploaded media. In
# production this is a volume mount.
RUN mkdir -p /app/data/media

EXPOSE 8000

# The health check hits the API's own health endpoint. Docker marks
# the container unhealthy if this doesn't return 200 within 5 seconds.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000"]