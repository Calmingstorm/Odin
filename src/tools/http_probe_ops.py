"""HTTP probe operations helper for the http_probe tool.

Builds safe curl commands for HTTP probing with timing, retries,
and response capture — useful for API debugging and health checking.
All user-provided values go through shlex.quote() for shell injection protection.
"""

from __future__ import annotations

import shlex
from urllib.parse import urlparse

ALLOWED_METHODS = frozenset({
    "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS",
})

MAX_TIMEOUT = 120
DEFAULT_TIMEOUT = 30
MAX_RETRIES = 5
DEFAULT_RETRIES = 0
MAX_RETRY_DELAY = 30
DEFAULT_RETRY_DELAY = 1
MAX_BODY_SIZE = 50000  # 50KB body limit

_TIMING_FORMAT = (
    r"\n---PROBE-RESULTS---"
    r"\nstatus_code: %{http_code}"
    r"\ntime_dns: %{time_namelookup}s"
    r"\ntime_connect: %{time_connect}s"
    r"\ntime_tls: %{time_appconnect}s"
    r"\ntime_ttfb: %{time_starttransfer}s"
    r"\ntime_total: %{time_total}s"
    r"\nsize_download: %{size_download} bytes"
    r"\nspeed_download: %{speed_download} bytes/s"
    r"\nredirects: %{num_redirects}"
    r"\nremote_ip: %{remote_ip}"
    r"\nremote_port: %{remote_port}"
)


def _sq(value: str) -> str:
    return shlex.quote(value)


def validate_url(url: str) -> str:
    """Validate and return URL. Raises ValueError for invalid URLs."""
    if not url or not url.strip():
        raise ValueError("URL is required")
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(
            f"Invalid URL scheme: {parsed.scheme!r}. Only http and https are supported."
        )
    if not parsed.netloc:
        raise ValueError("URL must include a host (e.g., https://example.com)")
    return url


def _clamp_int(value, default: int, minimum: int, maximum: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(v, maximum))


def build_http_probe_command(params: dict) -> str:
    """Build a curl command for HTTP probing.

    All user-provided values are passed through shlex.quote().
    Returns a single command string.
    """
    url = validate_url(params.get("url", ""))
    method = params.get("method", "GET").upper()
    if method not in ALLOWED_METHODS:
        raise ValueError(
            f"Invalid HTTP method: {method}. "
            f"Allowed: {', '.join(sorted(ALLOWED_METHODS))}"
        )

    parts = ["curl", "-sS"]

    # Timing output format
    parts.append(f"-w {_sq(_TIMING_FORMAT)}")

    # Include response headers in output
    parts.append("-i")

    # HTTP method
    if method != "GET":
        parts.append(f"-X {method}")

    # Timeout
    timeout = _clamp_int(
        params.get("timeout"), DEFAULT_TIMEOUT, 1, MAX_TIMEOUT
    )
    parts.append(f"--max-time {timeout}")
    parts.append(f"--connect-timeout {min(timeout, 10)}")

    # Follow redirects
    follow = params.get("follow_redirects", True)
    if follow:
        parts.append("-L")
        parts.append("--max-redirs 10")

    # SSL verification
    verify_ssl = params.get("verify_ssl", True)
    if not verify_ssl:
        parts.append("-k")

    # Retries
    retries = _clamp_int(
        params.get("retries"), DEFAULT_RETRIES, 0, MAX_RETRIES
    )
    if retries > 0:
        parts.append(f"--retry {retries}")
        retry_delay = _clamp_int(
            params.get("retry_delay"), DEFAULT_RETRY_DELAY, 0, MAX_RETRY_DELAY
        )
        parts.append(f"--retry-delay {retry_delay}")

    # Custom headers
    headers = params.get("headers")
    if isinstance(headers, dict):
        for name, value in headers.items():
            header_str = f"{name}: {value}"
            parts.append(f"-H {_sq(header_str)}")

    # Request body
    body = params.get("body")
    if body and method in ("POST", "PUT", "PATCH"):
        if isinstance(body, str) and len(body) <= MAX_BODY_SIZE:
            parts.append(f"-d {_sq(body)}")

    # URL (always last)
    parts.append(_sq(url))

    return " ".join(parts)
