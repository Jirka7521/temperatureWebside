import os
from dotenv import load_dotenv
import psycopg

load_dotenv()


def get_db_connection():
    return psycopg.connect(
        host=os.getenv("DB_HOST", "database.local"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "temperature"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
    )


def init_db():
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
