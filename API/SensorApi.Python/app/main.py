"""FastAPI application for ingesting and querying sensor readings.

This module exposes a small REST API used by the ESP32 firmware and the
frontend. It keeps implementation intentionally lightweight and relies on
`app/db.py` for database access and `app/netinfo.py` to determine a
reasonable host IP for display/debugging.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db import get_db_connection, init_db
from .netinfo import get_host_ip


class SensorReading(BaseModel):
    """Represents a single sensor measurement.

    - `temperature`: degrees Celsius
    - `humidity`: relative humidity in percent
    - `date`: optional UTC timestamp (if omitted the server assigns one)
    """

    temperature: float
    humidity: float
    date: Optional[datetime] = None


app = FastAPI(title="Sensor API", version="1.0")


# Allow broad access from the static frontend; in production restrict origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Initialize DB and determine the host IP to expose via metadata.

    The host IP can be forced by setting the `BACKEND_FIXED_IP` environment
    variable (useful when running in containers).
    """

    init_db()

    fixed = os.getenv("BACKEND_FIXED_IP")
    host_ip = fixed or get_host_ip()
    app.state.host_ip = host_ip
    print(f"[startup] detected host IP: {host_ip}")


@app.get("/health")
def health_check() -> dict:
    """Liveness endpoint used by orchestrators and the frontend."""

    return {"status": "ok", "host_ip": app.state.host_ip}


@app.get("/meta")
def meta() -> dict:
    """Return small runtime metadata for debugging and UI display."""

    return {"host_ip": app.state.host_ip}


@app.get("/getCurrent", response_model=List[SensorReading])
def get_current() -> List[SensorReading]:
    """Return the most recent sensor reading (or empty list if none).

    The response is a list to make it convenient for the frontend charting
    code which expects an array of readings.
    """

    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT Temperature, Humidity, Date FROM SensorTable ORDER BY Date DESC LIMIT 1;"
        ).fetchone()

        if not row:
            return []

        return [
            SensorReading(temperature=row[0], humidity=row[1], date=row[2])
        ]


@app.post("/data/insert")
def insert_reading(reading: SensorReading) -> dict:
    """Insert a new sensor reading into the database.

    If the incoming reading omits the `date` field the server assigns the
    current UTC time.
    """

    if reading is None:
        raise HTTPException(status_code=400, detail="Sensor reading data is required.")

    timestamp = reading.date or datetime.now(timezone.utc)

    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO SensorTable (Temperature, Humidity, Date) VALUES (%s, %s, %s)",
            (reading.temperature, reading.humidity, timestamp),
        )
        conn.commit()

    return {"message": "Insertion successful."}


@app.get("/data/query", response_model=List[SensorReading])
def query_readings(
    start: datetime = Query(...),
    end: datetime = Query(...),
    interval: int = Query(..., gt=0),
) -> List[SensorReading]:
    """Return sensor readings between `start` and `end`, downsampled by `interval`.

    The `interval` parameter is in seconds. The endpoint returns the first
    reading and then subsequent readings separated by at least `interval`
    seconds to produce a uniformly-sampled timeseries for charts.
    """

    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT Temperature, Humidity, Date FROM SensorTable WHERE Date BETWEEN %s AND %s ORDER BY Date ASC",
            (start, end),
        ).fetchall()

    readings = [SensorReading(temperature=r[0], humidity=r[1], date=r[2]) for r in rows]

    # Downsample by interval (seconds)
    filtered: List[SensorReading] = []
    last_included: Optional[SensorReading] = None
    for r in readings:
        if last_included is None:
            filtered.append(r)
            last_included = r
            continue
        delta = (r.date - last_included.date).total_seconds()
        if delta >= interval:
            filtered.append(r)
            last_included = r

    return filtered


@app.get("/getPast", response_model=List[SensorReading])
def get_past(
    start: datetime = Query(...),
    end: datetime = Query(...),
    interval: int = Query(..., gt=0),
) -> List[SensorReading]:
    """Compatibility wrapper that delegates to `/data/query`."""

    return query_readings(start=start, end=end, interval=interval)


@app.get("/data/list")
def list_readings_paginated(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    sort_by: str = Query("date"),
    sort_dir: str = Query("desc"),
    page: int = Query(1, gt=0),
    page_size: int = Query(25, gt=0, le=500),
) -> dict:
    """Return paginated, filterable, and sortable sensor readings for the data table.

    Only the rows for the requested page are fetched from the database, making
    this endpoint efficient regardless of the total number of stored readings.

    Parameters
    ----------
    start, end:   Optional UTC datetime bounds (inclusive).
    search:       Free-text filter applied to temperature, humidity, and date.
    sort_by:      Column to sort by — 'date', 'temperature', or 'humidity'.
    sort_dir:     'asc' or 'desc'.
    page:         1-based page number.
    page_size:    Rows per page (max 500).
    """

    # Whitelist sort columns and direction to prevent SQL injection
    allowed_cols: dict[str, str] = {
        "date": "Date",
        "temperature": "Temperature",
        "humidity": "Humidity",
    }
    order_col = allowed_cols.get(sort_by.lower(), "Date")
    order_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

    conditions: list[str] = []
    params: list = []

    if start:
        conditions.append("Date >= %s")
        params.append(start)
    if end:
        conditions.append("Date <= %s")
        params.append(end)
    if search:
        conditions.append(
            "(CAST(Temperature AS TEXT) LIKE %s"
            " OR CAST(Humidity AS TEXT) LIKE %s"
            " OR CAST(Date AS TEXT) LIKE %s)"
        )
        like_val = f"%{search}%"
        params.extend([like_val, like_val, like_val])

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    count_sql = f"SELECT COUNT(*) FROM SensorTable {where_clause}"
    data_sql = (
        f"SELECT Temperature, Humidity, Date FROM SensorTable"
        f" {where_clause}"
        f" ORDER BY {order_col} {order_dir}"
        f" LIMIT %s OFFSET %s"
    )

    offset = (page - 1) * page_size

    with get_db_connection() as conn:
        total: int = conn.execute(count_sql, params).fetchone()[0]
        rows = conn.execute(data_sql, params + [page_size, offset]).fetchall()

    data = [
        {
            "temperature": r[0],
            "humidity": r[1],
            "date": r[2].isoformat() if r[2] else None,
        }
        for r in rows
    ]
    total_pages = ((total + page_size - 1) // page_size) if total > 0 else 0

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": total_pages,
        "data": data,
    }
