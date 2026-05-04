"""
FastAPI router.

Read endpoints  → public (no auth, no version).
Write endpoints → require Bearer token + client_version for conflict detection.
DELETE          → version passed in request body via DeleteServerRequest.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app import server_service
from app.auth import require_auth
from app.models import (
    AddServerRequest,
    BookServerRequest,
    ChangeCommentRequest,
    DeleteServerRequest,
    FreeServerRequest,
    GetServersRequest,
    ServerInfo,
)
from app.server_service import VersionConflictError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["servers"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _not_found(dns: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                         detail=f"Server '{dns}' is not registered.")

def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


# ── Public reads ──────────────────────────────────────────────────────────────

@router.post("/servers/query", response_model=list[ServerInfo])
async def get_servers(body: GetServersRequest) -> list[ServerInfo]:
    return server_service.get_servers(body.dns_list)

@router.get("/servers", response_model=list[ServerInfo])
async def get_all_servers() -> list[ServerInfo]:
    return server_service.get_all_servers()

@router.get("/servers/{dns:path}", response_model=ServerInfo)
async def get_server(dns: str) -> ServerInfo:
    server = server_service.get_server(dns)
    if server is None:
        raise _not_found(dns)
    return server


# ── Protected writes ──────────────────────────────────────────────────────────

@router.post("/servers/book", response_model=ServerInfo)
async def book_server(body: BookServerRequest,
                      _token: str = Depends(require_auth)) -> ServerInfo:
    try:
        return server_service.book_server(
            dns=body.dns, client_version=body.version,
            user=body.user, comment=body.comment, duration_hours=body.duration_hours)
    except VersionConflictError as exc:
        raise _conflict(str(exc))
    except ValueError as exc:
        raise _bad_request(str(exc))


@router.post("/servers/free", response_model=ServerInfo)
async def free_server(body: FreeServerRequest,
                      _token: str = Depends(require_auth)) -> ServerInfo:
    try:
        return server_service.free_server(
            dns=body.dns, client_version=body.version, comment=body.comment)
    except VersionConflictError as exc:
        raise _conflict(str(exc))
    except ValueError:
        raise _not_found(body.dns)


@router.post("/servers/comment", response_model=ServerInfo)
async def change_comment(body: ChangeCommentRequest,
                         _token: str = Depends(require_auth)) -> ServerInfo:
    try:
        return server_service.change_comment(
            dns=body.dns, client_version=body.version, comment=body.comment)
    except VersionConflictError as exc:
        raise _conflict(str(exc))
    except ValueError:
        raise _not_found(body.dns)


@router.post("/servers/update-all", response_model=list[ServerInfo])
async def update_all_servers(_token: str = Depends(require_auth)) -> list[ServerInfo]:
    return server_service.poll_all_servers()


@router.post("/servers", response_model=ServerInfo, status_code=status.HTTP_201_CREATED)
async def add_server(body: AddServerRequest,
                     _token: str = Depends(require_auth)) -> ServerInfo:
    try:
        return server_service.add_server(body.dns)
    except ValueError as exc:
        raise _conflict(str(exc))


@router.delete("/servers/{dns:path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(dns: str, body: DeleteServerRequest,
                        _token: str = Depends(require_auth)) -> None:
    try:
        server_service.delete_server(dns, client_version=body.version)
    except VersionConflictError as exc:
        raise _conflict(str(exc))
    except ValueError:
        raise _not_found(dns)


@router.post("/servers/{dns:path}/update", response_model=ServerInfo)
async def update_server(dns: str, _token: str = Depends(require_auth)) -> ServerInfo:
    try:
        return server_service.poll_server(dns)
    except ValueError:
        raise _not_found(dns)
