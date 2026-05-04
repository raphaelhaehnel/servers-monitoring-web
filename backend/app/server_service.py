"""
Service layer.

SSH polling flow
----------------
1. Run "Status"          → parse_status()     → ParsedStatus
2. Look up handler       → get_handler(type)
3. If handler has extra command → run it       → handler.parse_extra_output()
4. Store structured data on ServerInfo

Concurrency control and audit log unchanged from previous version.
"""

from __future__ import annotations

import concurrent.futures
import logging
from datetime import datetime, timezone
from typing import Optional

from app.models import AuditAction, AuditEntry, ComponentInstance, ServerInfo, ServerStatusLabel
from app.parsers import get_handler, parse_rpmqa, parse_status
from app.ssh_client import ssh_client
from app.storage import storage

logger = logging.getLogger(__name__)


class VersionConflictError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _compute_status_label(server: ServerInfo) -> ServerStatusLabel:
    if not server.reachable:
        return ServerStatusLabel.UNREACHABLE
    if not server.is_available:
        return ServerStatusLabel.BOOKED
    return ServerStatusLabel.AVAILABLE


def _check_version(server: ServerInfo, client_version: int) -> None:
    if server.version != client_version:
        raise VersionConflictError(
            f"The data for '{server.dns}' has been modified by another user "
            f"(stored version {server.version}, your version {client_version}). "
            f"Please refresh and try again."
        )


def _audit(server: ServerInfo, action: AuditAction, by: Optional[str], detail: str) -> None:
    server.history.append(
        AuditEntry(action=action, timestamp=_now(), by=by, detail=detail)
    )


# ── SSH polling ───────────────────────────────────────────────────────────────

def _apply_ssh_results(server: ServerInfo) -> ServerInfo:
    """Run all required SSH commands and store structured results."""

    # Always run rpmqa
    rpmqa_result = ssh_client.run_command(server.dns, "rpmqa")
    if rpmqa_result.success:
        server.raw_rpmqa             = rpmqa_result.stdout
        server.installed_applications = parse_rpmqa(rpmqa_result.stdout)

    # Always run Status first — determines component type and which extra command to run
    status_result = ssh_client.run_command(server.dns, "Status")

    if status_result.success:
        server.raw_status = status_result.stdout
        parsed = parse_status(status_result.stdout)

        server.component_type = parsed.component_type
        server.server_ip      = parsed.ip
        server.component_instances = [
            ComponentInstance(name=inst.name, active=inst.active)
            for inst in parsed.instances
        ]

        # Run the component-specific extra command if one exists
        handler      = get_handler(parsed.component_type)
        extra_cmd    = handler.extra_ssh_command()
        if extra_cmd:
            extra_result = ssh_client.run_command(server.dns, extra_cmd)
            if extra_result.success:
                server.component_details = handler.parse_extra_output(extra_result.stdout)
            else:
                logger.warning(
                    "Extra command '%s' failed on %s: %s",
                    extra_cmd, server.dns, extra_result.stderr,
                )
                server.component_details = []
        else:
            server.component_details = []

    server.reachable    = status_result.success
    server.last_updated = _now()
    server.status_label = _compute_status_label(server)
    return server


# ── Read operations ───────────────────────────────────────────────────────────

def get_server(dns: str) -> Optional[ServerInfo]:
    return storage.get(dns)

def get_servers(dns_list: list[str]) -> list[ServerInfo]:
    return storage.get_many(dns_list)

def get_all_servers() -> list[ServerInfo]:
    return storage.get_all()


# ── Write operations ──────────────────────────────────────────────────────────

def add_server(dns: str) -> ServerInfo:
    if storage.exists(dns):
        raise ValueError(f"Server '{dns}' is already registered.")
    server = ServerInfo(dns=dns)
    _audit(server, AuditAction.REGISTERED, by=None, detail="Server registered.")
    storage.add(server)
    logger.info("Added server: %s", dns)
    return server


def delete_server(dns: str, client_version: int) -> None:
    server = storage.get(dns)
    if server is None:
        raise ValueError(f"Server '{dns}' is not registered.")
    _check_version(server, client_version)
    storage.delete(dns)
    logger.info("Deleted server: %s", dns)


def book_server(
    dns: str, client_version: int, user: str,
    comment: str = "", duration_hours: Optional[float] = None,
) -> ServerInfo:
    server = storage.get(dns)
    if server is None:
        raise ValueError(f"Server '{dns}' is not registered.")
    _check_version(server, client_version)
    if not server.is_available:
        raise ValueError(f"Server '{dns}' is already booked by '{server.booked_by}'.")

    server.is_available           = False
    server.booked_by              = user
    server.booked_since           = _now()
    server.booking_duration_hours = duration_hours
    server.comment                = comment
    server.status_label           = ServerStatusLabel.BOOKED
    server.version               += 1

    duration_str = f" for {duration_hours}h" if duration_hours else ""
    comment_str  = (' — "' + comment + '"') if comment else ''
    _audit(server, AuditAction.BOOKED, by=user,
           detail=f'Booked by {user}{duration_str}{comment_str}.')
    storage.update(server)
    return server


def free_server(dns: str, client_version: int, comment: Optional[str] = None) -> ServerInfo:
    server = storage.get(dns)
    if server is None:
        raise ValueError(f"Server '{dns}' is not registered.")
    _check_version(server, client_version)

    previous_user = server.booked_by
    server.is_available           = True
    server.booked_by              = None
    server.booked_since           = None
    server.booking_duration_hours = None
    if comment is not None:
        server.comment = comment
    server.status_label = _compute_status_label(server)
    server.version     += 1

    freed_by_str = f' (freed by {previous_user})' if previous_user else ''
    comment_str  = (' — "' + comment + '"') if comment else ''
    _audit(server, AuditAction.FREED, by=previous_user,
           detail=f'Server freed{freed_by_str}{comment_str}.')
    storage.update(server)
    return server


def change_comment(dns: str, client_version: int, comment: str) -> ServerInfo:
    server = storage.get(dns)
    if server is None:
        raise ValueError(f"Server '{dns}' is not registered.")
    _check_version(server, client_version)

    old_comment  = server.comment
    server.comment  = comment
    server.version += 1

    old_str = ('"' + old_comment + '" → ') if old_comment else ''
    _audit(server, AuditAction.COMMENT_CHANGED, by=server.booked_by,
           detail='Comment changed: ' + old_str + '"' + comment + '".')
    storage.update(server)
    return server


# ── SSH polling ───────────────────────────────────────────────────────────────

def poll_server(dns: str) -> ServerInfo:
    server = storage.get(dns)
    if server is None:
        raise ValueError(f"Server '{dns}' is not registered.")
    server = _apply_ssh_results(server)
    storage.update(server)
    logger.info("Polled %s: type=%s reachable=%s", dns, server.component_type, server.reachable)
    return server


def poll_all_servers() -> list[ServerInfo]:
    servers = storage.get_all()
    if not servers:
        return []
    updated: list[ServerInfo] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10, thread_name_prefix="ssh-poll") as ex:
        future_to_dns = {ex.submit(poll_server, s.dns): s.dns for s in servers}
        for future in concurrent.futures.as_completed(future_to_dns):
            dns = future_to_dns[future]
            try:
                updated.append(future.result())
            except Exception as exc:
                logger.error("poll_all_servers: failed to poll %s: %s", dns, exc)
    return updated
