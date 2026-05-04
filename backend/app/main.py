"""
Application entry point.

Start with:
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import auth, scheduler
from app.config import config
from app.routes import router

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("=== Server Monitor starting up ===")
    logger.info("Config: DATA_DIR=%s  SSH_MOCK=%s  POLL_INTERVAL=%ds",
                config.DATA_DIR, config.SSH_MOCK_MODE, config.POLL_INTERVAL_SECONDS)
    scheduler.start()
    yield
    logger.info("=== Server Monitor shutting down ===")
    scheduler.stop()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Server Monitor API",
    description="REST API for registering, monitoring, and booking SSH servers.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# ── Auth endpoints ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    username: str

class AuthStatusResponse(BaseModel):
    authenticated: bool
    username: str | None = None


@app.post("/auth/login", response_model=LoginResponse, tags=["auth"],
          summary="Log in and receive a session token")
async def login(body: LoginRequest) -> LoginResponse:
    try:
        token = auth.login(body.username, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    return LoginResponse(token=token, username=body.username)


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, tags=["auth"],
          summary="Invalidate the current session token")
async def logout(body: dict) -> None:
    token = body.get("token", "")
    if token:
        auth.logout(token)


@app.get("/auth/verify", response_model=AuthStatusResponse, tags=["auth"],
         summary="Check whether a token is still valid")
async def verify(token: str = "") -> AuthStatusResponse:
    if token and auth.is_valid_token(token):
        return AuthStatusResponse(authenticated=True, username=config.AUTH_USERNAME)
    return AuthStatusResponse(authenticated=False)


# ── Ops endpoints ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["ops"], summary="Liveness probe")
async def health() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/ready", tags=["ops"], summary="Readiness probe")
async def ready() -> dict[str, str]:
    return {"status": "ready"}
