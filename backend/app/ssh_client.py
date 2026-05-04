"""
SSH client abstraction with two modes:

* **Mock mode** (``SSH_MOCK_MODE=true``, default): simulates SSH responses with
  realistic fake data and occasional random failures – no real servers needed.
* **Real mode** (``SSH_MOCK_MODE=false``): uses Paramiko to connect to actual
  servers via password or private-key authentication.

Switching between modes is done exclusively through the ``SSH_MOCK_MODE``
environment variable, so no code changes are required when moving from a dev
environment to a real OpenShift deployment.
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass, field
from typing import Optional

from app.config import config

logger = logging.getLogger(__name__)


# ── Result type ───────────────────────────────────────────────────────────────


@dataclass
class SSHCommandResult:
    command: str
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: float = 0.0

    @property
    def success(self) -> bool:
        return self.exit_code == 0


# ── Mock data pools ───────────────────────────────────────────────────────────

_MOCK_RPMQA: list[str] = [
    (
        "bash-5.1.8-6.el9.x86_64\n"
        "glibc-2.34-60.el9.x86_64\n"
        "openssl-3.0.7-18.el9_2.x86_64\n"
        "python3-3.9.18-3.el9.x86_64\n"
        "nginx-1.20.1-14.el9_2.1.x86_64\n"
        "postgresql-13.11-1.el9_2.x86_64"
    ),
    (
        "bash-4.4.20-4.el8.x86_64\n"
        "glibc-2.28-236.el8_9.12.x86_64\n"
        "openssl-1.1.1k-12.el8_9.x86_64\n"
        "python3-3.6.8-56.el8.x86_64\n"
        "httpd-2.4.37-62.module_el8.9.0.x86_64\n"
        "mariadb-10.3.39-1.module_el8.9.0.x86_64"
    ),
    (
        "bash-5.0.17-2.el8.x86_64\n"
        "glibc-2.31-14.el8.x86_64\n"
        "openssl-1.1.1l-3.el8.x86_64\n"
        "python3-3.8.10-1.el8.x86_64\n"
        "tomcat-9.0.50-1.el8.x86_64\n"
        "java-11-openjdk-11.0.20.0.8-3.el8.x86_64"
    ),
    (
        "bash-5.2.15-3.el9.x86_64\n"
        "glibc-2.34-73.el9.x86_64\n"
        "openssl-3.1.1-2.el9.x86_64\n"
        "python3-3.11.2-2.el9.x86_64\n"
        "podman-4.4.1-12.el9.x86_64\n"
        "docker-ce-24.0.5-1.el9.x86_64"
    ),
]

# Status outputs — realistic per component type
# Gateway: one or two gateways, Active or Server Down
_MOCK_STATUS_GATEWAY: list[str] = [
    "GW-Alpha: Active    Interfaces: Gateway    10.0.1.11",
    "GW-Beta: Active    Interfaces: Gateway    10.0.1.12",
    "GW-Alpha: Active    GW-Beta: Server Down    Interfaces: Gateway    10.0.1.13",
    "GW-Primary: Server Down    Interfaces: Gateway    10.0.1.14",
]

# Microservice: always exactly one component
_MOCK_STATUS_MICROSERVICE: list[str] = [
    "Microservice: Active    Interfaces: Microservice    10.0.2.21",
    "Microservice: Server Down    Interfaces: Microservice    10.0.2.22",
]

# RedisWriter: one or two writers
_MOCK_STATUS_REDISWRITER: list[str] = [
    "RedisWriter-site1: Active    Interfaces: RedisWriter    10.0.3.31",
    "RedisWriter-site1: Active    RedisWriter-site2: Active    Interfaces: RedisWriter    10.0.3.32",
    "RedisWriter-site1: Server Down    RedisWriter-site2: Active    Interfaces: RedisWriter    10.0.3.33",
]

# Pool used when the dns doesn't match a specific type (round-robin by hash)
_MOCK_STATUS_ALL: list[list[str]] = [
    _MOCK_STATUS_GATEWAY,
    _MOCK_STATUS_MICROSERVICE,
    _MOCK_STATUS_REDISWRITER,
]

# Gateway names returned by command "fk"
_MOCK_FK: list[str] = [
    "GatewayDBWriter-v2.4.1x86.rpm,/opt/gw/dbwriter,42",
    "GatewayDBWriter-v2.4.1x86.rpm,/opt/gw/dbwriter,42\nGatewayAPIRouter-v1.9.0x86.rpm,/opt/gw/router,17",
    "GatewayMetrics-v3.0.2x86.rpm,/opt/gw/metrics,8",
]

# Microservice name returned by command "jd"
_MOCK_JD: list[str] = [
    "PaymentService prod 3 1 0",
    "InventoryService staging 1 0 0",
    "OrderProcessor prod 5 2 1",
]

# Probability of a simulated SSH failure (0–1)
_MOCK_FAILURE_RATE: float = 0.08


# ── SSH client ────────────────────────────────────────────────────────────────


class SSHClient:
    """
    Thin wrapper around SSH execution that supports both mock and real modes.
    """

    def __init__(self, mock_mode: bool = True) -> None:
        self._mock_mode = mock_mode
        mode_label = "MOCK" if mock_mode else "REAL"
        logger.info("SSH client initialised in %s mode.", mode_label)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _mock_command(self, dns: str, command: str) -> SSHCommandResult:
        """Return a plausible fake response without touching any real host."""
        t0 = time.monotonic()
        time.sleep(random.uniform(0.05, 0.4))   # simulate network latency

        if random.random() < _MOCK_FAILURE_RATE:
            duration = (time.monotonic() - t0) * 1000
            logger.debug("[MOCK] %s @ %s → simulated failure", command, dns)
            return SSHCommandResult(
                command=command,
                stdout="",
                stderr="ssh: connect to host %s port 22: Connection timed out" % dns,
                exit_code=255,
                duration_ms=duration,
            )

        if command == "rpmqa":
            stdout = random.choice(_MOCK_RPMQA)
        elif command == "Status":
            # Pick a consistent component type per dns (stable across polls)
            pool = _MOCK_STATUS_ALL[hash(dns) % len(_MOCK_STATUS_ALL)]
            stdout = random.choice(pool)
        elif command == "fk":
            stdout = random.choice(_MOCK_FK)
        elif command == "jd":
            stdout = random.choice(_MOCK_JD)
        else:
            duration = (time.monotonic() - t0) * 1000
            return SSHCommandResult(
                command=command,
                stdout="",
                stderr="bash: %s: command not found" % command,
                exit_code=127,
                duration_ms=duration,
            )

        duration = (time.monotonic() - t0) * 1000
        logger.debug("[MOCK] %s @ %s → OK (%.0f ms)", command, dns, duration)
        return SSHCommandResult(
            command=command,
            stdout=stdout,
            stderr="",
            exit_code=0,
            duration_ms=duration,
        )

    def _real_command(self, dns: str, command: str) -> SSHCommandResult:
        """Execute a command on a real host via Paramiko."""
        try:
            import paramiko  # optional dependency
        except ImportError:
            raise RuntimeError(
                "paramiko is not installed. Add it to requirements.txt or use mock mode."
            )

        t0 = time.monotonic()
        client: Optional[paramiko.SSHClient] = None
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            connect_kwargs: dict = {
                "hostname": dns,
                "port": config.SSH_PORT,
                "username": config.SSH_USERNAME,
                "timeout": config.SSH_TIMEOUT,
                "allow_agent": False,
                "look_for_keys": bool(config.SSH_KEY_PATH),
            }
            if config.SSH_KEY_PATH:
                connect_kwargs["key_filename"] = config.SSH_KEY_PATH
            if config.SSH_PASSWORD:
                connect_kwargs["password"] = config.SSH_PASSWORD

            client.connect(**connect_kwargs)
            _, stdout_fh, stderr_fh = client.exec_command(command, timeout=config.SSH_TIMEOUT)
            exit_code: int = stdout_fh.channel.recv_exit_status()
            stdout = stdout_fh.read().decode("utf-8", errors="replace")
            stderr = stderr_fh.read().decode("utf-8", errors="replace")
            duration = (time.monotonic() - t0) * 1000
            logger.debug("[REAL] %s @ %s → exit=%d (%.0f ms)", command, dns, exit_code, duration)
            return SSHCommandResult(
                command=command,
                stdout=stdout,
                stderr=stderr,
                exit_code=exit_code,
                duration_ms=duration,
            )
        except Exception as exc:
            duration = (time.monotonic() - t0) * 1000
            logger.warning("[REAL] %s @ %s → error: %s", command, dns, exc)
            return SSHCommandResult(
                command=command,
                stdout="",
                stderr=str(exc),
                exit_code=1,
                duration_ms=duration,
            )
        finally:
            if client:
                client.close()

    # ── Public API ────────────────────────────────────────────────────────────

    def run_command(self, dns: str, command: str) -> SSHCommandResult:
        """Run a single SSH command and return its result."""
        if self._mock_mode:
            return self._mock_command(dns, command)
        return self._real_command(dns, command)

    def run_commands(self, dns: str, commands: list[str]) -> dict[str, SSHCommandResult]:
        """
        Run multiple SSH commands sequentially on the same host.
        Returns a mapping of ``command → result``.
        """
        return {cmd: self.run_command(dns, cmd) for cmd in commands}


# ── Singleton ─────────────────────────────────────────────────────────────────

ssh_client = SSHClient(mock_mode=config.SSH_MOCK_MODE)
