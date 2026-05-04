# ── Build stage ───────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.12-slim

# OpenShift runs containers as an arbitrary non-root UID.
# We make /app and /data world-writable so any UID can write there.
RUN useradd --uid 1001 --no-create-home appuser

WORKDIR /app

COPY --from=builder /install /usr/local
COPY app/ app/

# Default data directory – override with DATA_DIR env var pointing to your PVC
RUN mkdir -p /data && chmod -R 777 /data

# Drop privileges (OpenShift will override UID anyway, but explicit is cleaner)
USER 1001

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    SSH_MOCK_MODE=true \
    POLL_INTERVAL_SECONDS=300 \
    HOST=0.0.0.0 \
    PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
