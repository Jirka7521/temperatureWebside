from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db import get_db_connection, init_db
from .netinfo import get_host_ip
import os


class SensorReading(BaseModel):
    temperature: float
    humidity: float
    date: Optional[datetime] = None


app = FastAPI(title="Sensor API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.on_event("startup")
def on_startup():
    init_db()
    # determine host IP (can be overridden by BACKEND_FIXED_IP env)
    fixed = os.getenv("BACKEND_FIXED_IP")
    host_ip = fixed or get_host_ip()
    app.state.host_ip = host_ip
    print(f"[startup] detected host IP: {host_ip}")


@app.get("/health")
def health_check():
    return {"status": "ok", "host_ip": app.state.host_ip}


@app.get("/meta")
def meta():
    return {"host_ip": app.state.host_ip}


@app.get("/getCurrent", response_model=List[SensorReading])
def get_current():
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT Temperature, Humidity, Date FROM SensorTable ORDER BY Date DESC LIMIT 1;"
        ).fetchone()
        if not row:
            return []
        return [
            SensorReading(
                temperature=row[0],
                humidity=row[1],
                date=row[2]
            )
        ]


@app.post("/data/insert")
def insert_reading(reading: SensorReading):
    if reading is None:
        raise HTTPException(status_code=400, detail="Sensor reading data is required.")

    timestamp = reading.date or datetime.now(timezone.utc)

    with get_db_connection() as conn:
        result = conn.execute(
            "INSERT INTO SensorTable (Temperature, Humidity, Date) VALUES (%s, %s, %s)",
            (reading.temperature, reading.humidity, timestamp)
        )
        conn.commit()

    return {"message": "Insertion successful."}


@app.get("/data/query", response_model=List[SensorReading])
def query_readings(
    start: datetime = Query(...),
    end: datetime = Query(...),
    interval: int = Query(..., gt=0)
):
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT Temperature, Humidity, Date FROM SensorTable WHERE Date BETWEEN %s AND %s ORDER BY Date ASC",
            (start, end)
        ).fetchall()

    readings = [
        SensorReading(temperature=r[0], humidity=r[1], date=r[2])
        for r in rows
    ]

    filtered = []
    last_included = None
    for reading in readings:
        if last_included is None:
            filtered.append(reading)
            last_included = reading
            continue
        delta = (reading.date - last_included.date).total_seconds()
        if delta >= interval:
            filtered.append(reading)
            last_included = reading

    return filtered


@app.get("/getPast", response_model=List[SensorReading])
def get_past(
    start: datetime = Query(...),
    end: datetime = Query(...),
    interval: int = Query(..., gt=0)
):
    return query_readings(start=start, end=end, interval=interval)
