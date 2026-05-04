"""
Background scheduler that periodically polls all registered servers via SSH.

Uses APScheduler's ``BackgroundScheduler`` so it runs in a daemon thread
without blocking the ASGI event loop.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import config
from app import server_service

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler(timezone="UTC", job_defaults={"misfire_grace_time": 60})


def _poll_job() -> None:
    """Wrapper so APScheduler can call poll_all_servers without arguments."""
    try:
        results = server_service.poll_all_servers()
        logger.info("Scheduled poll complete: %d server(s) processed.", len(results))
    except Exception as exc:
        logger.error("Scheduled poll failed: %s", exc, exc_info=True)


def start() -> None:
    """Start the scheduler. Call this once on application startup."""
    _scheduler.add_job(
        _poll_job,
        trigger=IntervalTrigger(seconds=config.POLL_INTERVAL_SECONDS),
        id="poll_all_servers",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "Scheduler started – polling every %d second(s).",
        config.POLL_INTERVAL_SECONDS,
    )


def stop() -> None:
    """Gracefully stop the scheduler. Call this on application shutdown."""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped.")
