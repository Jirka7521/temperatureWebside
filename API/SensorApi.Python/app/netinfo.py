import socket
import fcntl
import struct
import os


def get_host_ip():
    """Return first non-loopback IPv4 address for the host/container.

    Tries common methods; falls back to 127.0.0.1.
    """
    # 1) honor explicit env var
    env_ip = os.getenv("BACKEND_FIXED_IP")
    if env_ip:
        return env_ip

    # 2) try to use gethostname + getaddrinfo
    try:
        for res in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET, socket.SOCK_DGRAM):
            ip = res[4][0]
            if not ip.startswith("127."):
                return ip
    except Exception:
        pass

    # 3) use a UDP socket to a public IP to discover the outbound interface
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # doesn't have to be reachable
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass

    # 4) fallback
    return "127.0.0.1"
