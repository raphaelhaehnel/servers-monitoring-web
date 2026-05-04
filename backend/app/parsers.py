"""
Parsers for SSH command output.

Architecture (Open/Closed Principle)
-------------------------------------
Each component type is handled by a dedicated ComponentHandler subclass.
To add a new component type:
  1. Subclass ComponentHandler
  2. Add one entry to COMPONENT_REGISTRY
  Nothing else needs to change.

Flow
----
1. parse_status(raw)  →  ParsedStatus
   - Extracts component_type from "Interfaces: <type>"
   - Extracts zero or more ComponentInstance (name + active/down)
   - Extracts server IP

2. get_handler(component_type)  →  ComponentHandler | None
   - Returns the right handler for the type

3. handler.extra_ssh_command()  →  str | None
   - The command to run after Status, or None if no extra command

4. handler.parse_extra_output(raw)  →  list[str]
   - Parses the extra command output into display-ready strings
"""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ── Value objects returned by parsers ────────────────────────────────────────

@dataclass
class ComponentInstance:
    """One running component on the server (name + health state)."""
    name:   str
    active: bool    # True = "Active", False = anything else
    status: str = "Unknown"  # Raw status string: "Active", "Server Down", "Invalid State", …


@dataclass
class ParsedStatus:
    """Structured result of the Status SSH command."""
    component_type: str                        # e.g. "Gateway", "Microservice"
    instances:      list[ComponentInstance]    # one per name: Active/Down line
    ip:             Optional[str]              # from "Interfaces: <type> <ip>"
    raw:            str                        # original stdout, kept for debugging


# ── Abstract handler ──────────────────────────────────────────────────────────

class ComponentHandler(ABC):
    """
    Strategy interface for component-type-specific SSH parsing.
    Subclass this to support a new component type.
    """

    @property
    @abstractmethod
    def component_type(self) -> str:
        """The exact string that appears after 'Interfaces:' in Status output."""

    @abstractmethod
    def extra_ssh_command(self) -> Optional[str]:
        """
        Additional SSH command to run after Status, or None.
        The command result is passed to parse_extra_output().
        """

    @abstractmethod
    def parse_extra_output(self, raw: str) -> list[str]:
        """
        Parse the stdout of extra_ssh_command() into a list of
        human-readable detail strings shown in the UI.
        """


# ── Concrete handlers ─────────────────────────────────────────────────────────

class GatewayHandler(ComponentHandler):
    """
    Gateway servers run command 'fk'.
    Output lines:  <gateway_name>,<path>,<number>
    We extract:    <gateway_name>
    There can be multiple gateways (multiple output lines).
    """

    @property
    def component_type(self) -> str:
        return "Gateway"

    def extra_ssh_command(self) -> Optional[str]:
        return "fk"

    def parse_extra_output(self, raw: str) -> list[str]:
        names: list[str] = []
        for line in raw.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(",")
            if parts and parts[0].strip():
                names.append(parts[0].strip())
        logger.debug("GatewayHandler: found %d gateway(s): %s", len(names), names)
        return names


class MicroserviceHandler(ComponentHandler):
    """
    Microservice servers run command 'jd'.
    Output line:  <name> <env> <number> <number> <number>
    We extract:   <name>  (always exactly one microservice)
    """

    @property
    def component_type(self) -> str:
        return "Microservice"

    def extra_ssh_command(self) -> Optional[str]:
        return "jd"

    def parse_extra_output(self, raw: str) -> list[str]:
        for line in raw.strip().splitlines():
            parts = line.strip().split()
            if parts:
                logger.debug("MicroserviceHandler: service name = %s", parts[0])
                return [parts[0]]
        return []


class RedisWriterHandler(ComponentHandler):
    """
    RedisWriter servers need no extra SSH command.
    The instance names are already extracted from Status output.
    """

    @property
    def component_type(self) -> str:
        return "RedisWriter"

    def extra_ssh_command(self) -> Optional[str]:
        return None

    def parse_extra_output(self, raw: str) -> list[str]:
        return []   # names come from Status instances


class UnknownHandler(ComponentHandler):
    """
    Fallback handler for component types not yet in the registry.
    Performs no extra command and returns no details.
    """

    @property
    def component_type(self) -> str:
        return "Unknown"

    def extra_ssh_command(self) -> Optional[str]:
        return None

    def parse_extra_output(self, raw: str) -> list[str]:
        return []


# ── Registry ──────────────────────────────────────────────────────────────────
# Add new handlers here. Order does not matter.

_HANDLERS: list[ComponentHandler] = [
    GatewayHandler(),
    MicroserviceHandler(),
    RedisWriterHandler(),
]

COMPONENT_REGISTRY: dict[str, ComponentHandler] = {
    h.component_type: h for h in _HANDLERS
}

_UNKNOWN_HANDLER = UnknownHandler()


def get_handler(component_type: str) -> ComponentHandler:
    """Return the handler for *component_type*, falling back to UnknownHandler."""
    return COMPONENT_REGISTRY.get(component_type, _UNKNOWN_HANDLER)


# ── Status parser ─────────────────────────────────────────────────────────────

# Matches:  "Interfaces: Gateway    198.654.24.1"
_INTERFACES_RE = re.compile(
    r'Interfaces:\s+(\S+)(?:\s+([\d.]+))?',
    re.IGNORECASE,
)

# Matches:  "SomeName: Active"  /  "SomeName-x: Server Down"  /  "SomeName: Invalid State"
# The status group is non-greedy and stops at two or more spaces (field separator)
# or end-of-string, so it won't bleed into the next field.
_INSTANCE_RE = re.compile(
    r'([\w\-]+):\s+(Active|Server Down|Invalid State|[\w ]+?)(?=\s{2,}|$)',
    re.IGNORECASE,
)


def parse_status(raw: str) -> ParsedStatus:
    """
    Parse the raw stdout of the Status SSH command.

    Supported formats (all on a single logical line, whitespace-separated):
      <name>: Active
      <name>: Server Down      Interfaces: <type>    <ip>
      <n1>: Active    <n2>: Server Down    Interfaces: <type>    <ip>

    Returns a ParsedStatus with component_type, instances, and ip.
    """
    if not raw or not raw.strip():
        return ParsedStatus(
            component_type="Unknown", instances=[], ip=None, raw=raw
        )

    # Extract Interfaces line
    iface_match = _INTERFACES_RE.search(raw)
    component_type = iface_match.group(1) if iface_match else "Unknown"
    ip             = iface_match.group(2) if iface_match else None

    # Strip the Interfaces portion so it can't produce spurious name matches
    clean = _INTERFACES_RE.sub("", raw)

    # Extract all <name>: <state> pairs
    instances: list[ComponentInstance] = []
    for m in _INSTANCE_RE.finditer(clean):
        raw_status = m.group(2).strip()
        instances.append(ComponentInstance(
            name=m.group(1),
            active=raw_status.lower() == "active",
            status=raw_status,
        ))

    logger.debug(
        "parse_status: type=%s  instances=%s  ip=%s",
        component_type,
        [(i.name, i.active) for i in instances],
        ip,
    )

    return ParsedStatus(
        component_type=component_type,
        instances=instances,
        ip=ip,
        raw=raw,
    )


# ── rpmqa parser ──────────────────────────────────────────────────────────────

def parse_rpmqa(raw: str) -> str:
    """
    Parse the output of the rpmqa command.
    Returns a single summary string (stub — replace with real logic).
    """
    lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
    if not lines:
        return "No packages found"
    return f"{len(lines)} package(s) installed"
