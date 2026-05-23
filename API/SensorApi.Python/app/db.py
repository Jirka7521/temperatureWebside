"""Database helpers for the Sensor API.

This module owns a single process-wide connection pool. Connection parameters
are loaded from environment variables (optionally from a `.env` file).

Why a pool: previously every request opened a brand-new `psycopg.connect(...)`
and closed it again. Each of those connections grabbed a fresh ephemeral port
and, once closed, left a socket lingering in TIME_WAIT for ~60s. Under steady
polling (frontend every 15s, ESP32 uploads, multiple clients) the host churned
through ports/file descriptors until it could no longer accept connections.
Reusing a small fixed pool keeps the number of sockets bounded and constant.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from psycopg_pool import ConnectionPool


load_dotenv()


def _connection_kwargs() -> dict:
    """Build psycopg connection kwargs from environment config.

    Environment variables used (with defaults):
    - DB_HOST: hostname/IP of the database (default: 'database.local')
    - DB_PORT: port (default: '5432')
    - DB_NAME: database name (default: 'temperature')
    - DB_USER: username (default: 'postgres')
    - DB_PASSWORD: password (default: 'postgres')
    """
    return {
        "host": os.getenv("DB_HOST", "database.local"),
        "port": os.getenv("DB_PORT", "5432"),
        "dbname": os.getenv("DB_NAME", "temperature"),
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD", "postgres"),
    }


# A single process-wide pool. Connections are reused across requests instead of
# being opened and torn down per request. `open=False` so the pool is opened
# explicitly at application startup (see app.main.on_startup); `check` validates
# each connection on checkout so a stale/dropped connection is transparently
# replaced rather than handed to a request.
pool = ConnectionPool(
    min_size=int(os.getenv("DB_POOL_MIN_SIZE", "1")),
    max_size=int(os.getenv("DB_POOL_MAX_SIZE", "10")),
    max_idle=float(os.getenv("DB_POOL_MAX_IDLE", "300")),
    kwargs=_connection_kwargs(),
    check=ConnectionPool.check_connection,
    open=False,
)


def get_db_connection():
    """Borrow a pooled connection.

    Use as a context manager: ``with get_db_connection() as conn:``. On exit the
    connection is committed (or rolled back on error) and returned to the pool —
    it is NOT closed, so the underlying socket is reused by the next request.
    """
    return pool.connection()


def init_db() -> None:
    """Create the `SensorTable` and its supporting index if missing.

    Safe to call on every startup; both statements are idempotent.
    """
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS SensorTable (
                Id BIGSERIAL PRIMARY KEY,
                Temperature DOUBLE PRECISION NOT NULL,
                Humidity DOUBLE PRECISION NOT NULL,
                Date TIMESTAMPTZ NOT NULL
            );
            """
        )
        # Range/sort queries (/getPast, /data/list) all filter and order by Date.
        # Without this index they degrade to full scans + sorts as the table grows.
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sensortable_date ON SensorTable (Date);"
        )
        conn.commit()
