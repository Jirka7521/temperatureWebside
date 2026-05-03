"""Small utility to determine the host/container IPv4 address.

The goal is to return a sensible non-loopback IPv4 address for use
by other services (for example to display where the API is reachable).

Approach (in order):
- honour explicit environment override `BACKEND_FIXED_IP` (useful in Docker)
- use `socket.getaddrinfo()` on the hostname to find non-loopback addresses
- open a UDP socket and inspect the socket's own address used for an
  outbound connection (doesn't actually send traffic)
- fallback to `127.0.0.1` if nothing else is available

This module avoids platform-specific modules (e.g. `fcntl`) so it can be
imported on Windows as well as Linux containers.
"""

from __future__ import annotations

import os
import socket
from typing import Optional


def get_host_ip() -> str:
    """Return the first reasonable non-loopback IPv4 address.

    Returns the value of the `BACKEND_FIXED_IP` environment variable if set.
    Otherwise tries a few heuristics and ultimately returns '127.0.0.1'.
    """
    # 1) honour an explicit environment override (very useful in Docker)
    env_ip = os.getenv("BACKEND_FIXED_IP")
    if env_ip:
        return env_ip

    # 2) try resolving the local hostname to an IPv4 address
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET, socket.SOCK_DGRAM)
        for res in infos:
            candidate = res[4][0]
            if candidate and not candidate.startswith("127."):
                return candidate
    except Exception:
        # resolution can fail in some environments (e.g. minimal containers)
        pass

    # 3) create a UDP socket and inspect the socket's own address when
    #    connected to a public IP. This does not send traffic but reveals
    #    the outbound interface used by the OS.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            # the IP here does not need to be reachable; it's only used to
            # determine the local address bound by the OS for that route.
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
    except Exception:
        pass

    # 4) last resort
    return "127.0.0.1"
