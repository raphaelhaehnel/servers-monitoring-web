"""
Simple token-based authentication.

Flow
----
1. Client POSTs credentials to POST /auth/login
   → receives a random opaque token (UUID4) on success.
2. Client sends the token on every mutating request:
   Authorization: Bearer <token>
3. Client POSTs to POST /auth/logout to invalidate the token.

Design notes
------------
* Tokens live in an in-memory dict — they are lost on restart, which is
  fine: users just log in again.
* Multiple concurrent sessions with the same credentials are explicitly
  supported (each login call issues a fresh, independent token).
* The single valid credential pair is read from environment variables so
  it can be stored in an OpenShift Secret without any code changes.
* Read-only endpoints (GET) are public and never require a token.
"""

from __future__ import annotations

import logging
import secrets
import time
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import config

logger = logging.getLogger(__name__)

# ── In-memory token store ─────────────────────────────────────────────────────
# { token: issued_at_unix_timestamp }
_active_tokens: dict[str, float] = {}

_bearer_scheme = HTTPBearer(auto_error=False)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _is_expired(issued_at: float) -> bool:
    if config.AUTH_TOKEN_TTL == 0:
        return False
    return (time.time() - issued_at) > config.AUTH_TOKEN_TTL


def _purge_expired() -> None:
    """Remove stale tokens to avoid unbounded memory growth."""
    expired = [t for t, ts in _active_tokens.items() if _is_expired(ts)]
    for t in expired:
        del _active_tokens[t]


# ── Public API ────────────────────────────────────────────────────────────────

def login(username: str, password: str) -> str:
    """
    Validate credentials and return a new session token.
    Raises :class:`ValueError` on bad credentials.
    """
    if username != config.AUTH_USERNAME or password != config.AUTH_PASSWORD:
        raise ValueError("Invalid username or password.")
    _purge_expired()
    token = secrets.token_urlsafe(32)
    _active_tokens[token] = time.time()
    logger.info("New session created for user '%s'  (total active: %d)", username, len(_active_tokens))
    return token


def logout(token: str) -> None:
    """Invalidate a token. No-op if the token is unknown."""
    _active_tokens.pop(token, None)
    logger.info("Session revoked (active remaining: %d)", len(_active_tokens))


def is_valid_token(token: str) -> bool:
    """Return True if the token exists and has not expired."""
    issued_at = _active_tokens.get(token)
    if issued_at is None:
        return False
    if _is_expired(issued_at):
        del _active_tokens[token]
        return False
    return True


# ── FastAPI dependency ────────────────────────────────────────────────────────

def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> str:
    """
    FastAPI dependency injected into every mutating endpoint.
    Returns the validated token string; raises HTTP 401 otherwise.
    """
    if credentials is None or not is_valid_token(credentials.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials
