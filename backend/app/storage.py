"""
JSON-file storage that simulates a PVC-backed persistent volume.

In OpenShift, mount a PersistentVolumeClaim at the path defined by DATA_DIR
and this module will read/write servers.json there automatically.

Thread-safety is achieved with a re-entrant lock so the background scheduler
and HTTP handlers can coexist without corrupting the file.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Optional

from app.config import config
from app.models import ServerInfo

logger = logging.getLogger(__name__)


class ServerStorage:
    """In-process, file-backed store for :class:`ServerInfo` records."""

    def __init__(self, file_path: Path) -> None:
        self._file_path = file_path
        self._lock = threading.RLock()
        self._ensure_data_dir()
        self._servers: dict[str, ServerInfo] = self._load()
        logger.info(
            "Storage initialised: %s (%d server(s) loaded)",
            self._file_path,
            len(self._servers),
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    def _ensure_data_dir(self) -> None:
        self._file_path.parent.mkdir(parents=True, exist_ok=True)

    def _load(self) -> dict[str, ServerInfo]:
        if not self._file_path.exists():
            logger.info("No existing data file – starting with empty server list.")
            return {}
        try:
            with open(self._file_path, "r", encoding="utf-8") as fh:
                raw: dict = json.load(fh)
            servers = {dns: ServerInfo(**data) for dns, data in raw.items()}
            logger.info("Loaded %d server(s) from %s", len(servers), self._file_path)
            return servers
        except Exception as exc:
            logger.error("Failed to load servers from %s: %s", self._file_path, exc)
            return {}

    def _save(self) -> None:
        """Persist current state to disk (must be called while holding _lock)."""
        try:
            data = {
                dns: server.model_dump(mode="json")
                for dns, server in self._servers.items()
            }
            tmp = self._file_path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2, default=str)
            tmp.replace(self._file_path)   # atomic rename
        except Exception as exc:
            logger.error("Failed to persist servers to %s: %s", self._file_path, exc)

    # ── Public API ────────────────────────────────────────────────────────────

    def get_all(self) -> list[ServerInfo]:
        with self._lock:
            return list(self._servers.values())

    def get(self, dns: str) -> Optional[ServerInfo]:
        with self._lock:
            return self._servers.get(dns)

    def get_many(self, dns_list: list[str]) -> list[ServerInfo]:
        with self._lock:
            return [self._servers[d] for d in dns_list if d in self._servers]

    def add(self, server: ServerInfo) -> None:
        with self._lock:
            self._servers[server.dns] = server
            self._save()

    def update(self, server: ServerInfo) -> None:
        with self._lock:
            self._servers[server.dns] = server
            self._save()

    def delete(self, dns: str) -> bool:
        with self._lock:
            if dns not in self._servers:
                return False
            del self._servers[dns]
            self._save()
            return True

    def exists(self, dns: str) -> bool:
        with self._lock:
            return dns in self._servers


# ── Singleton ─────────────────────────────────────────────────────────────────

storage = ServerStorage(config.SERVERS_FILE)
