"""Bounded, read-only checks of public RSS/Atom endpoints."""
import ipaddress
import socket
import time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import feedparser
import requests

MAX_BYTES = 5 * 1024 * 1024


def public_url(url):
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Only public HTTP(S) URLs without credentials are allowed")
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError("URL resolves to a non-public address")


def check_link(url, *, request_get=requests.get, validate_url=public_url, clock=time.monotonic):
    result = {"feed_url": url, "checked_at": datetime.now(timezone.utc).isoformat(), "status": "unknown"}
    deadline = clock() + 15
    try:
        target = url
        for _ in range(6):
            validate_url(target)
            remaining = deadline - clock()
            if remaining <= 0:
                raise requests.Timeout("Check exceeded 15 seconds")
            response = request_get(target, timeout=(min(4, remaining), min(8, remaining)), stream=True,
                                   allow_redirects=False, headers={"User-Agent": "garss-link-check/1.0", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"})
            try:
                result.update(http_status=response.status_code, final_url=target)
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("Location")
                    if not location:
                        raise ValueError("Redirect has no destination")
                    target = urljoin(target, location)
                    continue
                if response.status_code in {404, 410}:
                    return {**result, "status": "invalid", "reason": f"HTTP {response.status_code}"}
                if response.status_code != 200:
                    return {**result, "reason": f"HTTP {response.status_code}; availability unconfirmed"}
                chunks, size = [], 0
                for chunk in response.iter_content(65536):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ValueError("Feed exceeds 5 MiB")
                    if clock() >= deadline:
                        raise requests.Timeout("Check exceeded 15 seconds")
                    chunks.append(chunk)
                parsed = feedparser.parse(b"".join(chunks))
                if not parsed.get("version"):
                    return {**result, "status": "invalid", "reason": "Response is not RSS or Atom"}
                if parsed.get("bozo") and not parsed.get("entries"):
                    return {**result, "status": "invalid", "reason": "Feed cannot be parsed"}
                return {**result, "status": "valid", "entry_count": len(parsed.get("entries", [])), "reason": "RSS/Atom parsed successfully"}
            finally:
                response.close()
        return {**result, "reason": "Too many redirects"}
    except (requests.RequestException, OSError, ValueError) as error:
        return {**result, "reason": str(error)[:250]}
