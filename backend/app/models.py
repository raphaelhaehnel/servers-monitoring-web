"""
Pydantic models for server data and API request / response schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.utils import extract_environment


class ServerStatusLabel(str, Enum):
    AVAILABLE   = "available"
    BOOKED      = "booked"
    UNREACHABLE = "unreachable"
    UNKNOWN     = "unknown"


# ── Audit log ─────────────────────────────────────────────────────────────────

class AuditAction(str, Enum):
    REGISTERED      = "registered"
    BOOKED          = "booked"
    FREED           = "freed"
    COMMENT_CHANGED = "comment_changed"


class AuditEntry(BaseModel):
    id:        str            = Field(default_factory=lambda: str(uuid.uuid4()))
    action:    AuditAction
    timestamp: datetime
    by:        Optional[str] = Field(None)
    detail:    str            = Field("")


# ── Component data (from SSH) ─────────────────────────────────────────────────

class ComponentInstance(BaseModel):
    """One running component on the server (name + health state)."""
    name:   str
    active: bool = Field(True, description="True = Active, False = anything else")
    status: str  = Field("Unknown", description="Raw status string: Active, Server Down, Invalid State, …")


# ── Core domain model ─────────────────────────────────────────────────────────

class ServerInfo(BaseModel):
    """Full representation of a monitored server."""

    # Identity
    dns:         str           = Field(...)
    environment: Optional[str] = Field(None)

    @model_validator(mode="after")
    def _derive_environment(self) -> "ServerInfo":
        self.environment = extract_environment(self.dns)
        return self

    # Availability / booking
    is_available:           bool             = Field(True)
    booked_by:              Optional[str]    = Field(None)
    booked_since:           Optional[datetime] = Field(None)
    booking_duration_hours: Optional[float]  = Field(None)
    comment:                str              = Field("")

    # SSH — raw data (kept for debugging and rpmqa display)
    installed_applications: Optional[str]  = Field(None)
    raw_rpmqa:              Optional[str]  = Field(None)
    raw_status:             Optional[str]  = Field(None)

    # SSH — structured component data (parsed from Status + extra command)
    component_type:     Optional[str]            = Field(
        None, description="Gateway | Microservice | RedisWriter | Unknown"
    )
    component_instances: list[ComponentInstance] = Field(
        default_factory=list,
        description="Each name:Active/Down entry from the Status output.",
    )
    component_details:  list[str]                = Field(
        default_factory=list,
        description="Extra details: gateway names (fk) or microservice name (jd).",
    )
    server_ip:          Optional[str]            = Field(
        None, description="IP address extracted from the Interfaces line."
    )

    # Health / meta
    reachable:    bool              = Field(False)
    status_label: ServerStatusLabel = Field(ServerStatusLabel.UNKNOWN)
    last_updated: Optional[datetime] = Field(None)

    # Concurrency control
    version: int = Field(0)

    # Audit history
    history: list[AuditEntry] = Field(default_factory=list)


# ── Request schemas ───────────────────────────────────────────────────────────

class AddServerRequest(BaseModel):
    dns: str

class GetServersRequest(BaseModel):
    dns_list: list[str]

class BookServerRequest(BaseModel):
    dns:            str
    version:        int
    user:           str
    comment:        str            = Field("")
    duration_hours: Optional[float] = Field(None)

class FreeServerRequest(BaseModel):
    dns:     str
    version: int
    comment: Optional[str] = Field(None)

class ChangeCommentRequest(BaseModel):
    dns:     str
    version: int
    comment: str

class DeleteServerRequest(BaseModel):
    version: int

class OperationResult(BaseModel):
    success: bool
    message: str
