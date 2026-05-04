"""
Configuration loaded from environment variables.

In OpenShift, set these via ConfigMap / Secret objects.
DATA_DIR should point to the PVC mount path (e.g. /mnt/data).
AUTH_USERNAME / AUTH_PASSWORD should be stored in a Secret.
"""

import os
from pathlib import Path


class Config:
    # ── Storage (PVC) ────────────────────────────────────────────────────────
    DATA_DIR: Path = Path(os.getenv("DATA_DIR", "./data"))
    SERVERS_FILE: Path = DATA_DIR / "servers.json"

    # ── SSH ──────────────────────────────────────────────────────────────────
    SSH_USERNAME: str = os.getenv("SSH_USERNAME", "root")
    SSH_PASSWORD: str = os.getenv("SSH_PASSWORD", "")
    SSH_KEY_PATH: str = os.getenv("SSH_KEY_PATH", "")
    SSH_PORT: int = int(os.getenv("SSH_PORT", "22"))
    SSH_TIMEOUT: int = int(os.getenv("SSH_TIMEOUT", "10"))
    SSH_MOCK_MODE: bool = os.getenv("SSH_MOCK_MODE", "true").lower() == "true"

    # ── Polling ───────────────────────────────────────────────────────────────
    POLL_INTERVAL_SECONDS: int = int(os.getenv("POLL_INTERVAL_SECONDS", "300"))
    POLL_MAX_WORKERS: int = int(os.getenv("POLL_MAX_WORKERS", "10"))

    # ── Authentication ────────────────────────────────────────────────────────
    # Store these in an OpenShift Secret (see openshift/deployment.yaml).
    # Multiple concurrent sessions with the same credentials are allowed.
    AUTH_USERNAME: str = os.getenv("AUTH_USERNAME", "redis")
    AUTH_PASSWORD: str = os.getenv("AUTH_PASSWORD", "redis123")
    # How long a session token stays valid (seconds). 0 = never expire.
    AUTH_TOKEN_TTL: int = int(os.getenv("AUTH_TOKEN_TTL", "28800"))  # 8 h

    # ── API server ────────────────────────────────────────────────────────────
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


config = Config()
