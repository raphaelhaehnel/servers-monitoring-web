"""
Utility functions for parsing structured information out of DNS names.

Expected DNS format:
    <system>-<env>-<name>-<number>
    e.g.  google-prod1-redis-1
              │       │      │    └─ instance number
              │       │      └────── service / component name
              │       └───────────── environment  (prod1, staging, dev, …)
              └───────────────────── system / organisation
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)

_DNS_SEPARATOR = "-"
_ENV_SEGMENT_INDEX = 1          # zero-based index of the environment token
_MIN_SEGMENTS_REQUIRED = 2      # need at least <system>-<env>


def extract_environment(dns: str) -> Optional[str]:
    """
    Return the environment token from *dns*, or ``None`` if the name does not
    follow the expected ``<system>-<env>-…`` pattern.

    Examples
    --------
    >>> extract_environment("google-prod1-redis-1")
    'prod1'
    >>> extract_environment("acme-staging-api-3")
    'staging'
    >>> extract_environment("barehost")
    None
    """
    segments = dns.split(_DNS_SEPARATOR)
    if len(segments) < _MIN_SEGMENTS_REQUIRED:
        logger.debug(
            "Cannot extract environment from '%s': expected at least %d dash-separated "
            "segments, got %d.",
            dns,
            _MIN_SEGMENTS_REQUIRED,
            len(segments),
        )
        return None
    return segments[_ENV_SEGMENT_INDEX]
