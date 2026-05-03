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
