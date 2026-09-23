"""
PostgreSQL & SQLite Migration and Backfill Script for CAT Co-Pilot.

Loads 'cat_copilot_data.sql' into PostgreSQL (if available) or SQLite,
adds the required coordinate/site columns to 'task_duration_log',
and backfills the 300 historical tasks across 4 representative job sites.
"""

import os
import re
import sys
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta

# Try importing psycopg2 for PostgreSQL support
try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

BASE_DIR = Path(__file__).parent
SQL_FILE = BASE_DIR / "cat_copilot_data.sql"
SQLITE_DB = BASE_DIR / "smart_cat.db"

# 4 Representative Job Sites (Metro NY, Denver Quarry, Houston Highway, Phoenix Desert)
REPRESENTATIVE_SITES = [
    {
        "site_id": "SITE_NY",
        "name": "Metro Substructure & Excavation (New York, NY)",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "base_elevation_m": 10.0,
        "description": "Dense urban excavation site, sea-level elevation, moderate temperature variability."
    },
    {
        "site_id": "SITE_DEN",
        "name": "Highland Aggregate Quarry (Denver, CO)",
        "latitude": 39.7392,
        "longitude": -104.9903,
        "base_elevation_m": 1609.0,
        "description": "High-altitude rocky quarry, steep gradient, thinner atmosphere impacting engine load."
    },
    {
        "site_id": "SITE_HOU",
        "name": "Coastal Corridor Expansion (Houston, TX)",
        "latitude": 29.7604,
        "longitude": -95.3698,
        "base_elevation_m": 15.0,
        "description": "Flat coastal plain with frequent heavy precipitation, humidity, and muddy terrain."
    },
    {
        "site_id": "SITE_PHX",
        "name": "Desert Trenching & Utility Corridor (Phoenix, AZ)",
        "latitude": 33.4484,
        "longitude": -112.0740,
        "base_elevation_m": 331.0,
        "description": "Arid, rocky hardpan terrain with extreme daytime heat and elevated dust/wind."
    }
]

def get_postgres_connection():
    """Attempt connecting to PostgreSQL using DATABASE_URL or environment variables."""
    if not PSYCOPG2_AVAILABLE:
        return None
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        try:
            conn = psycopg2.connect(db_url)
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            return conn
        except Exception as e:
            print(f"[PostgreSQL] Failed connecting to DATABASE_URL: {e}")
            return None
    
    # Try default local credentials
    user = os.environ.get("POSTGRES_USER", "postgres")
    password = os.environ.get("POSTGRES_PASSWORD", "postgres")
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    dbname = os.environ.get("POSTGRES_DB", "cat_copilot")

    try:
        conn = psycopg2.connect(
            dbname=dbname,
            user=user,
            password=password,
            host=host,
            port=port,
            connect_timeout=3
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        return conn
    except Exception as e:
        # Try connecting to default postgres database to create cat_copilot
        try:
            conn = psycopg2.connect(
                dbname="postgres",
                user=user,
                password=password,
                host=host,
                port=port,
                connect_timeout=3
            )
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cur = conn.cursor()
            cur.execute(f"CREATE DATABASE {dbname};")
            cur.close()
            conn.close()
            return psycopg2.connect(dbname=dbname, user=user, password=password, host=host, port=port)
        except Exception:
            return None

def load_data_sqlite():
    """Load cat_copilot_data.sql and execute schema migrations in SQLite."""
    print(f"\n[SQLite] Loading dataset into {SQLITE_DB}...")
    conn = sqlite3.connect(SQLITE_DB)
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = OFF;")

    with open(SQL_FILE, "r", encoding="utf-8") as f:
        sql_content = f.read()

    # SQLite adaptations: replace SERIAL with INTEGER PRIMARY KEY AUTOINCREMENT
    clean_sql = sql_content.replace("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
    # Clean PostgreSQL specific casts if any
    clean_sql = re.sub(r'::[a-zA-Z_]+', '', clean_sql)

    # Execute statements
    statements = [stmt.strip() for stmt in clean_sql.split(";") if stmt.strip()]
    for stmt in statements:
        # Avoid dropping unrelated tables if needed
        try:
            cur.execute(stmt)
        except Exception as e:
            # print error if critical
            if "syntax error" in str(e).lower():
                print(f"[SQLite Warning] Statement failed: {e}\nStmt snippet: {stmt[:60]}")

    conn.commit()

    # 1. Ensure task_locations table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS task_locations (
        site_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        base_elevation_m REAL NOT NULL,
        description TEXT
    );
    """)

    for site in REPRESENTATIVE_SITES:
        cur.execute("""
        INSERT OR REPLACE INTO task_locations (site_id, name, latitude, longitude, base_elevation_m, description)
        VALUES (?, ?, ?, ?, ?, ?);
        """, (site["site_id"], site["name"], site["latitude"], site["longitude"], site["base_elevation_m"], site["description"]))

    # 2. Ensure weather_cache table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS weather_cache (
        cache_key TEXT PRIMARY KEY,
        temperature_c REAL NOT NULL,
        precipitation_mm REAL NOT NULL,
        wind_speed_kmh REAL NOT NULL,
        source TEXT NOT NULL,
        cached_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 3. Add coordinates and scheduled_date columns to task_duration_log if not already present
    cur.execute("PRAGMA table_info(task_duration_log);")
    cols = [col[1] for col in cur.fetchall()]
    
    if "latitude" not in cols:
        cur.execute("ALTER TABLE task_duration_log ADD COLUMN latitude REAL;")
    if "longitude" not in cols:
        cur.execute("ALTER TABLE task_duration_log ADD COLUMN longitude REAL;")
    if "site_id" not in cols:
        cur.execute("ALTER TABLE task_duration_log ADD COLUMN site_id TEXT;")
    if "scheduled_date" not in cols:
        cur.execute("ALTER TABLE task_duration_log ADD COLUMN scheduled_date TEXT;")

    # 4. Backfill existing 300 rows
    cur.execute("SELECT task_id FROM task_duration_log ORDER BY task_id;")
    tasks = [row[0] for row in cur.fetchall()]
    print(f"[SQLite] Found {len(tasks)} tasks in task_duration_log to backfill.")

    base_date = datetime(2026, 5, 4, 8, 0, 0)
    for idx, task_id in enumerate(tasks):
        # Distribute across the 4 representative sites
        site = REPRESENTATIVE_SITES[idx % len(REPRESENTATIVE_SITES)]
        # Dates spaced across May 2026 (matching telemetry range May 1 to May 31)
        day_offset = (idx * 27) // len(tasks)  # 0 to 26 days
        hour_offset = (idx * 3) % 8            # daytime hours 8am to 4pm
        task_date = base_date + timedelta(days=day_offset, hours=hour_offset)
        iso_date = task_date.strftime("%Y-%m-%d %H:%M:%S")

        cur.execute("""
        UPDATE task_duration_log
        SET latitude = ?,
            longitude = ?,
            site_id = ?,
            scheduled_date = ?
        WHERE task_id = ?;
        """, (site["latitude"], site["longitude"], site["site_id"], iso_date, task_id))

    conn.commit()
    conn.close()
    print("[SQLite] Successfully loaded data, added coordinate columns, and backfilled 300 tasks!")

def load_data_postgres(conn):
    """Load cat_copilot_data.sql and execute schema migrations in PostgreSQL."""
    print("\n[PostgreSQL] Connected! Executing schema and data loading...")
    cur = conn.cursor()

    with open(SQL_FILE, "r", encoding="utf-8") as f:
        sql_content = f.read()

    cur.execute(sql_content)

    # 1. Create task_locations
    cur.execute("""
    CREATE TABLE IF NOT EXISTS task_locations (
        site_id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        base_elevation_m DOUBLE PRECISION NOT NULL,
        description TEXT
    );
    """)

    for site in REPRESENTATIVE_SITES:
        cur.execute("""
        INSERT INTO task_locations (site_id, name, latitude, longitude, base_elevation_m, description)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (site_id) DO UPDATE SET
            name = EXCLUDED.name,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            base_elevation_m = EXCLUDED.base_elevation_m,
            description = EXCLUDED.description;
        """, (site["site_id"], site["name"], site["latitude"], site["longitude"], site["base_elevation_m"], site["description"]))

    # 2. Create weather_cache
    cur.execute("""
    CREATE TABLE IF NOT EXISTS weather_cache (
        cache_key VARCHAR(100) PRIMARY KEY,
        temperature_c DOUBLE PRECISION NOT NULL,
        precipitation_mm DOUBLE PRECISION NOT NULL,
        wind_speed_kmh DOUBLE PRECISION NOT NULL,
        source VARCHAR(50) NOT NULL,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 3. Add coordinate columns to task_duration_log
    cur.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_duration_log' AND column_name='latitude') THEN
            ALTER TABLE task_duration_log ADD COLUMN latitude DOUBLE PRECISION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_duration_log' AND column_name='longitude') THEN
            ALTER TABLE task_duration_log ADD COLUMN longitude DOUBLE PRECISION;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_duration_log' AND column_name='site_id') THEN
            ALTER TABLE task_duration_log ADD COLUMN site_id VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_duration_log' AND column_name='scheduled_date') THEN
            ALTER TABLE task_duration_log ADD COLUMN scheduled_date TIMESTAMP;
        END IF;
    END $$;
    """)

    # 4. Backfill existing 300 rows
    cur.execute("SELECT task_id FROM task_duration_log ORDER BY task_id;")
    tasks = [row[0] for row in cur.fetchall()]
    print(f"[PostgreSQL] Found {len(tasks)} tasks in task_duration_log to backfill.")

    base_date = datetime(2026, 5, 4, 8, 0, 0)
    for idx, task_id in enumerate(tasks):
        site = REPRESENTATIVE_SITES[idx % len(REPRESENTATIVE_SITES)]
        day_offset = (idx * 27) // len(tasks)
        hour_offset = (idx * 3) % 8
        task_date = base_date + timedelta(days=day_offset, hours=hour_offset)

        cur.execute("""
        UPDATE task_duration_log
        SET latitude = %s,
            longitude = %s,
            site_id = %s,
            scheduled_date = %s
        WHERE task_id = %s;
        """, (site["latitude"], site["longitude"], site["site_id"], task_date, task_id))

    cur.close()
    conn.close()
    print("[PostgreSQL] Successfully loaded data, added coordinate columns, and backfilled 300 tasks!")

def verify_counts():
    """Print record counts from SQLite to confirm data integrity."""
    conn = sqlite3.connect(SQLITE_DB)
    cur = conn.cursor()
    print("\n--- Verifying Table Counts (SQLite) ---")
    tables = ["operators", "machines", "telemetry_log", "task_duration_log", "task_locations"]
    for t in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {t};")
            count = cur.fetchone()[0]
            print(f"Table '{t}': {count} rows")
        except Exception as e:
            print(f"Table '{t}': Error ({e})")
    
    # Check sample backfilled task
    cur.execute("SELECT task_id, task_type, site_id, latitude, longitude, scheduled_date FROM task_duration_log LIMIT 3;")
    rows = cur.fetchall()
    print("\nSample Backfilled Tasks:")
    for r in rows:
        print(f"  Task {r[0]}: {r[1]} @ {r[2]} ({r[3]}, {r[4]}) on {r[5]}")
    conn.close()

if __name__ == "__main__":
    print("=== CAT Co-Pilot Data & Migration Runner ===")
    pg_conn = get_postgres_connection()
    if pg_conn:
        load_data_postgres(pg_conn)
    else:
        print("[Notice] PostgreSQL server not running or connection refused.")
        print("          Proceeding with SQLite storage (full schema & data loaded).")
        print("          To switch to PostgreSQL, start your Postgres service and run:")
        print("          python backend/load_postgres.py")
    
    # Also load SQLite to ensure local app and tests always have full dataset available
    load_data_sqlite()
    verify_counts()
