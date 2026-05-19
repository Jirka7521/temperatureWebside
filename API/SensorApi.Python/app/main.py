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


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SensorReading(BaseModel):
    """Represents a single sensor measurement.

    Attributes
    ----------
    temperature : float
        Degrees Celsius.
    humidity : float
        Relative humidity in percent.
    date : datetime, optional
        UTC timestamp.  When omitted the server assigns ``datetime.now(UTC)``.
    """

    temperature: float
    humidity: float
    date: Optional[datetime] = None


class TablePage(BaseModel):
    """Paginated response envelope returned by ``GET /getData``.

    Attributes
    ----------
    data : list[SensorReading]
        Slice of sensor readings for the requested page.
    total : int
        Total number of rows that match the current filters (used by the
        frontend to compute total pages and display "X of Y records").
    page : int
        The current 1-based page index that was returned.
    pageSize : int
        Number of records per page that was used for this response.
    totalPages : int
        Pre-computed ``ceil(total / pageSize)``; always ≥ 1.
    """

    data: List[SensorReading]
    total: int
    page: int
    pageSize: int
    totalPages: int


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


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _escape_like(value: str) -> str:
    """Escape PostgreSQL LIKE meta-characters in *value*.

    Replaces ``%`` → ``\\%`` and ``_`` → ``\\_`` so a user-supplied search
    term is treated as a literal substring rather than a LIKE pattern.
    PostgreSQL's default LIKE escape character is ``\\``, so no ``ESCAPE``
    clause is needed.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ---------------------------------------------------------------------------
# Paginated data-table endpoint
# ---------------------------------------------------------------------------

# Whitelist mapping from the frontend's column names to actual SQL column names.
# This is the ONLY place where sort column names are resolved; never interpolate
# user input directly into SQL.
_SORT_COLUMN_MAP: dict[str, str] = {
    "date":        "Date",
    "temperature": "Temperature",
    "humidity":    "Humidity",
}


@app.get("/getData", response_model=TablePage)
def get_data_table(
    page: int = Query(1, ge=1, description="1-based page number"),
    pageSize: int = Query(50, ge=1, le=500, description="Records per page (max 500)"),
    sortBy: str = Query("date", description="Column: date | temperature | humidity"),
    sortOrder: str = Query("desc", description="Direction: asc | desc"),
    search: Optional[str] = Query(None, description="Substring matched against date, temperature and humidity"),
    startDate: Optional[datetime] = Query(None, description="Inclusive lower bound on Date (UTC)"),
    endDate: Optional[datetime] = Query(None, description="Inclusive upper bound on Date (UTC)"),
) -> TablePage:
    """Return a paged, filterable, sortable slice of the sensor history.

    Only the requested page is pulled from the database.  A second COUNT query
    with identical WHERE conditions gives the total record count so the frontend
    can render page-navigation controls without fetching the whole table.

    Parameters
    ----------
    page      : 1-based page index.
    pageSize  : records to return; the frontend should not request more than
                it can display (the endpoint hard-caps at 500).
    sortBy    : column to order by — validated against an internal whitelist so
                it can never be used for SQL injection.
    sortOrder : ``asc`` or ``desc`` (anything else is treated as ``desc``).
    search    : optional free-text term; matched against the string
                representations of all three columns (date formatted as
                ``YYYY-MM-DD HH24:MI:SS`` in UTC, temperature, humidity).
    startDate : filter to rows where ``Date >= startDate`` (UTC).
    endDate   : filter to rows where ``Date <= endDate`` (UTC).
    """

    # ── Sanitise sort parameters ────────────────────────────────────────────
    # Map the frontend column name to the real DB column name through a
    # whitelist — never interpolate sortBy/sortOrder directly into SQL.
    sort_col = _SORT_COLUMN_MAP.get(sortBy.lower(), "Date")
    sort_dir = "ASC" if sortOrder.lower() == "asc" else "DESC"

    # ── Build WHERE clause dynamically ─────────────────────────────────────
    # Each condition and its bound parameters are collected separately so the
    # final SQL stays readable and the parameter list stays flat.
    conditions: list[str] = []
    params: list = []

    # Date range filters
    if startDate is not None:
        conditions.append("Date >= %s")
        params.append(startDate)

    if endDate is not None:
        conditions.append("Date <= %s")
        params.append(endDate)

    # Free-text search across all three visible columns.
    # Numeric columns are cast to text for substring matching.
    # The date column is formatted in UTC so the search term can be a
    # partial date/time string (e.g. "2026-05" or "14:3").
    if search:
        safe = _escape_like(search.strip())
        pattern = f"%{safe}%"
        conditions.append(
            "("
            "  CAST(Temperature AS TEXT) LIKE %s"
            "  OR CAST(Humidity    AS TEXT) LIKE %s"
            "  OR TO_CHAR(Date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') LIKE %s"
            ")"
        )
        params.extend([pattern, pattern, pattern])

    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    # ── Queries ─────────────────────────────────────────────────────────────
    offset = (page - 1) * pageSize

    # Only fetch the columns the frontend uses (id is not exposed in the
    # SensorReading model, so it is omitted to avoid unnecessary data transfer).
    data_sql = (
        f"SELECT Temperature, Humidity, Date "
        f"FROM SensorTable "
        f"{where_sql} "
        f"ORDER BY {sort_col} {sort_dir} "
        f"LIMIT %s OFFSET %s"
    )

    # COUNT uses the same WHERE clause; params are the same (without LIMIT/OFFSET).
    count_sql = f"SELECT COUNT(*) FROM SensorTable {where_sql}"

    with get_db_connection() as conn:
        rows  = conn.execute(data_sql,  params + [pageSize, offset]).fetchall()
        total = conn.execute(count_sql, params).fetchone()[0]

    # ── Build response ───────────────────────────────────────────────────────
    data = [SensorReading(temperature=r[0], humidity=r[1], date=r[2]) for r in rows]

    # Always return at least 1 page even when there are no matching records.
    total_pages = max(1, (total + pageSize - 1) // pageSize)

    return TablePage(
        data=data,
        total=total,
        page=page,
        pageSize=pageSize,
        totalPages=total_pages,
    )
