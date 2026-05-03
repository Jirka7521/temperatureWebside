"""Database helpers for the Sensor API.

This module provides a simple connection factory and an initialization
helper that ensures the required table exists. Connection parameters are
loaded from environment variables (optionally from a `.env` file).
"""

from __future__ import annotations

import os
from typing import ContextManager

from dotenv import load_dotenv
import psycopg


load_dotenv()


def get_db_connection() -> ContextManager[psycopg.Connection]:
    """Return a context-manageable psycopg connection using environment config.

    Environment variables used (with defaults):
    - DB_HOST: hostname/IP of the database (default: 'database.local')
    - DB_PORT: port (default: '5432')
    - DB_NAME: database name (default: 'temperature')
    - DB_USER: username (default: 'postgres')
    - DB_PASSWORD: password (default: 'postgres')
    """
    return psycopg.connect(
        host=os.getenv("DB_HOST", "database.local"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "temperature"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
    )


def init_db() -> None:
    """Create the `SensorTable` if it does not already exist.

    This is safe to call on every startup; the CREATE TABLE IF NOT EXISTS
    statement ensures idempotence.
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
        conn.commit()
