"""
Database Engine Layer for CAT Co-Pilot.
Supports PostgreSQL as the primary database with automatic schema initialization,
data migration from SQLite/cat_copilot_data.sql, and fallback to SQLite if PostgreSQL is unreachable.
"""

import os
import re
import sys
import sqlite3
from pathlib import Path
from typing import Optional, Any, List, Dict, Tuple

# Try importing psycopg2 for PostgreSQL support
try:
    import psycopg2
    import psycopg2.extras
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

# Paths
BASE_DIR = Path(__file__).parent
ENV_PATH = BASE_DIR / ".env"
SQLITE_PATH = BASE_DIR / "smart_cat.db"
SQL_DUMP_PATH = BASE_DIR / "cat_copilot_data.sql"

# Simple .env loader to avoid requiring python-dotenv
def _load_env_file(path: Path):
    if not path.exists():
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key and key not in os.environ:
                        os.environ[key] = val
    except Exception as e:
        print(f"[Database Env Notice] {e}")

_load_env_file(ENV_PATH)

DB_PATH = os.environ.get("DB_PATH", str(SQLITE_PATH))
DATABASE_URL = os.environ.get("DATABASE_URL")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "postgres")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "cat_copilot")

# Global engine flag
_ACTIVE_ENGINE = "sqlite"

def get_active_db_engine() -> str:
    global _ACTIVE_ENGINE
    return _ACTIVE_ENGINE

def _translate_sqlite_to_pg(query: str) -> str:
    """Translates SQLite query idioms into PostgreSQL compatible SQL."""
    q = query.strip()

    # 1. Ignore PRAGMA foreign_keys
    if q.upper().startswith("PRAGMA FOREIGN_KEYS"):
        return "SELECT 1;"

    # 2. Translate PRAGMA table_info(table_name)
    m = re.match(r"^PRAGMA\s+table_info\s*\(\s*['\"]?(\w+)['\"]?\s*\)", q, re.IGNORECASE)
    if m:
        table_name = m.group(1).lower()
        return f"""
        SELECT 0 as cid, column_name as name, data_type as type,
               case when is_nullable = 'NO' then 1 else 0 end as notnull,
               column_default as dflt_value, 0 as pk
        FROM information_schema.columns
        WHERE table_name = '{table_name}';
        """

    # 3. Translate INSERT OR IGNORE INTO -> INSERT INTO ... ON CONFLICT DO NOTHING
    if re.search(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b", q, re.IGNORECASE):
        q = re.sub(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b", "INSERT INTO", q, flags=re.IGNORECASE)
        # Append ON CONFLICT DO NOTHING before final semicolon
        q = q.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING;"

    # 4. Replace parameter placeholders '?' with '%s'
    # Replace ? outside of single quotes
    parts = q.split("'")
    for i in range(0, len(parts), 2):
        parts[i] = parts[i].replace("?", "%s")
    q = "'".join(parts)

    return q


class PostgresCursorWrapper:
    """Wraps a psycopg2 cursor so that rows can be accessed both as dict keys and indices."""
    def __init__(self, cursor, conn_wrapper=None):
        self._cursor = cursor
        self._conn_wrapper = conn_wrapper

    def execute(self, query: str, params: Optional[Any] = None):
        pg_query = _translate_sqlite_to_pg(query)
        if params is not None:
            if isinstance(params, (list, tuple)):
                self._cursor.execute(pg_query, tuple(params))
            else:
                self._cursor.execute(pg_query, (params,))
        else:
            self._cursor.execute(pg_query)
        return self

    def executemany(self, query: str, params_seq: List[Any]):
        pg_query = _translate_sqlite_to_pg(query)
        self._cursor.executemany(pg_query, params_seq)
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        return row

    def fetchall(self):
        return self._cursor.fetchall()

    def fetchmany(self, size: int = 1):
        return self._cursor.fetchmany(size)

    @property
    def rowcount(self):
        return self._cursor.rowcount

    @property
    def lastrowid(self):
        try:
            cur = self._cursor.connection.cursor()
            cur.execute("SELECT lastval();")
            val = cur.fetchone()[0]
            cur.close()
            return val
        except Exception:
            return None

    @property
    def description(self):
        return self._cursor.description

    def close(self):
        self._cursor.close()

    def __iter__(self):
        return iter(self._cursor)


class PostgresConnectionWrapper:
    """
    Wraps a psycopg2 connection to mimic sqlite3.Connection with RealDictCursor rows,
    conn.execute(), conn.commit(), and automatic transaction management.
    """
    def __init__(self, raw_conn):
        self._raw_conn = raw_conn

    def cursor(self):
        raw_cur = self._raw_conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        return PostgresCursorWrapper(raw_cur, self)

    def execute(self, query: str, params: Optional[Any] = None):
        cur = self.cursor()
        cur.execute(query, params)
        # Automatically commit write statements
        q_upper = query.strip().upper()
        if any(q_upper.startswith(cmd) for cmd in ["INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"]):
            try:
                self._raw_conn.commit()
            except Exception:
                pass
        return cur

    def commit(self):
        if not self._raw_conn.closed:
            self._raw_conn.commit()

    def rollback(self):
        if not self._raw_conn.closed:
            self._raw_conn.rollback()

    def close(self):
        if not self._raw_conn.closed:
            self._raw_conn.close()

    @property
    def closed(self):
        return self._raw_conn.closed


def connect_postgres() -> Optional[Any]:
    """Attempts to connect to PostgreSQL using DATABASE_URL or individual parameters."""
    if not PSYCOPG2_AVAILABLE:
        return None

    # 1. Try DATABASE_URL if available
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        try:
            raw = psycopg2.connect(db_url, connect_timeout=15)
            return PostgresConnectionWrapper(raw)
        except Exception as e:
            print(f"[PostgreSQL Notice] Could not connect to DATABASE_URL: {e}")

    # 2. Try direct parameters
    try:
        raw = psycopg2.connect(
            dbname=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            host=POSTGRES_HOST,
            port=POSTGRES_PORT,
            connect_timeout=3
        )
        return PostgresConnectionWrapper(raw)
    except Exception:
        # Try connecting to postgres database to auto-create target db
        try:
            admin_conn = psycopg2.connect(
                dbname="postgres",
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                connect_timeout=3
            )
            admin_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cur = admin_conn.cursor()
            cur.execute(f"CREATE DATABASE {POSTGRES_DB};")
            cur.close()
            admin_conn.close()

            raw = psycopg2.connect(
                dbname=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                connect_timeout=3
            )
            return PostgresConnectionWrapper(raw)
        except Exception:
            return None


def get_db_connection():
    """Returns an active database connection (PostgreSQL preferred, SQLite fallback)."""
    global _ACTIVE_ENGINE

    # Try PostgreSQL first
    pg_conn = connect_postgres()
    if pg_conn is not None:
        _ACTIVE_ENGINE = "postgresql"
        return pg_conn

    # Fallback to SQLite
    _ACTIVE_ENGINE = "sqlite"
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_postgres_schema(conn):
    """Creates all required tables in PostgreSQL."""
    cur = conn.cursor()

    # 1. Supervisors Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS supervisors (
        supervisor_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL,
        phone VARCHAR(50),
        timezone VARCHAR(50) NOT NULL DEFAULT 'UTC'
    );
    """)

    # 2. Operators Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS operators (
        operator_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        preferred_language VARCHAR(20) NOT NULL DEFAULT 'en',
        timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
        skill_level VARCHAR(20) NOT NULL CHECK(skill_level IN ('Beginner', 'Intermediate', 'Expert')),
        assigned_supervisor_id VARCHAR(50) NOT NULL REFERENCES supervisors(supervisor_id)
    );
    """)

    # 3. Machines Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS machines (
        machine_id VARCHAR(50) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        model VARCHAR(100) NOT NULL,
        age_years DOUBLE PRECISION NOT NULL,
        owner_supervisor_id VARCHAR(50) NOT NULL REFERENCES supervisors(supervisor_id),
        custody_status VARCHAR(20) NOT NULL CHECK(custody_status IN ('owned', 'rented_in', 'rented_out')),
        rental_counterparty VARCHAR(150),
        rental_start VARCHAR(50),
        rental_end VARCHAR(50),
        latitude DOUBLE PRECISION DEFAULT 40.7128,
        longitude DOUBLE PRECISION DEFAULT -74.0060,
        current_zone VARCHAR(100) DEFAULT 'Zone A - Quarry North',
        authorized_zone VARCHAR(100) DEFAULT 'Zone A - Quarry North',
        speed_kmh DOUBLE PRECISION DEFAULT 0.0,
        heading_deg DOUBLE PRECISION DEFAULT 0.0,
        is_geofence_breached INTEGER DEFAULT 0,
        last_gps_update VARCHAR(50),
        continuous_operating_hours DOUBLE PRECISION DEFAULT 2.0,
        last_cooldown_at VARCHAR(50)
    );
    """)

    # 4. Operator <-> Machine Assignments Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS operator_machine_assignments (
        assignment_id SERIAL PRIMARY KEY,
        operator_id VARCHAR(50) NOT NULL REFERENCES operators(operator_id),
        machine_id VARCHAR(50) NOT NULL REFERENCES machines(machine_id),
        shift_date VARCHAR(50) NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
    );
    """)

    # 5. Tasks Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        task_id VARCHAR(50) PRIMARY KEY,
        task_type VARCHAR(100) NOT NULL,
        weather VARCHAR(50) NOT NULL,
        operator_id VARCHAR(50) NOT NULL REFERENCES operators(operator_id),
        machine_id VARCHAR(50) NOT NULL REFERENCES machines(machine_id),
        scheduled_start VARCHAR(50) NOT NULL,
        scheduled_end VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL CHECK(status IN ('upcoming', 'in-progress', 'done', 'delayed')),
        location_zone VARCHAR(100) NOT NULL,
        notes TEXT,
        weather_reapproval_required INTEGER DEFAULT 0,
        weather_approved_by VARCHAR(50)
    );
    """)

    # 6. Task Time Predictions Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS task_time_predictions (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(50) NOT NULL UNIQUE REFERENCES tasks(task_id),
        estimated_time_min DOUBLE PRECISION NOT NULL,
        predicted_time_min DOUBLE PRECISION,
        actual_time_min DOUBLE PRECISION,
        completion_timestamp VARCHAR(50)
    );
    """)

    # 7. Machine Telemetry Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS machine_telemetry (
        id SERIAL PRIMARY KEY,
        timestamp VARCHAR(50) NOT NULL,
        machine_id VARCHAR(50) NOT NULL REFERENCES machines(machine_id),
        operator_id VARCHAR(50) NOT NULL REFERENCES operators(operator_id),
        engine_hours DOUBLE PRECISION NOT NULL,
        fuel_used_l DOUBLE PRECISION NOT NULL,
        load_cycles INTEGER NOT NULL,
        idling_time_min DOUBLE PRECISION NOT NULL,
        seatbelt_status VARCHAR(20) NOT NULL CHECK(seatbelt_status IN ('Fastened', 'Unfastened')),
        safety_alert_triggered VARCHAR(10) NOT NULL CHECK(safety_alert_triggered IN ('Yes', 'No'))
    );
    """)

    # 8. Safety Alerts Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS safety_alerts (
        alert_id VARCHAR(50) PRIMARY KEY,
        machine_id VARCHAR(50) NOT NULL REFERENCES machines(machine_id),
        operator_id VARCHAR(50) NOT NULL REFERENCES operators(operator_id),
        supervisor_id VARCHAR(50) NOT NULL REFERENCES supervisors(supervisor_id),
        alert_type VARCHAR(100) NOT NULL,
        triggered_at VARCHAR(50) NOT NULL,
        acknowledged_at VARCHAR(50),
        escalated_at VARCHAR(50),
        response_time_sec DOUBLE PRECISION,
        status VARCHAR(20) NOT NULL CHECK(status IN ('active', 'acknowledged', 'escalated', 'resolved')),
        notes TEXT
    );
    """)

    # 9. Incidents Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS incidents (
        incident_id VARCHAR(50) PRIMARY KEY,
        machine_id VARCHAR(50) NOT NULL REFERENCES machines(machine_id),
        operator_id VARCHAR(50) NOT NULL REFERENCES operators(operator_id),
        logged_at VARCHAR(50) NOT NULL,
        incident_text TEXT NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'medium',
        is_voice_logged INTEGER NOT NULL DEFAULT 0
    );
    """)

    # 10. Geofence Zones Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS geofence_zones (
        zone_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        center_lat DOUBLE PRECISION NOT NULL,
        center_lon DOUBLE PRECISION NOT NULL,
        radius_m DOUBLE PRECISION NOT NULL,
        zone_type VARCHAR(50) NOT NULL CHECK(zone_type IN ('safe_work_zone', 'blast_danger_zone', 'speed_restricted', 'haul_road')),
        max_speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 25.0
    );
    """)

    # 11. Machine GPS Historical Traces Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS machine_gps_traces (
        trace_id SERIAL PRIMARY KEY,
        machine_id VARCHAR(50) NOT NULL REFERENCES machines(machine_id),
        timestamp VARCHAR(50) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0.0,
        heading_deg DOUBLE PRECISION NOT NULL DEFAULT 0.0,
        is_anomaly INTEGER NOT NULL DEFAULT 0,
        anomaly_reason TEXT
    );
    """)

    # 12. Proximity-Based Buddy Failover Alerts Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS buddy_failover_alerts (
        failover_id VARCHAR(50) PRIMARY KEY,
        alert_id VARCHAR(50) NOT NULL REFERENCES safety_alerts(alert_id),
        distressed_operator_id VARCHAR(50) NOT NULL,
        distressed_machine_id VARCHAR(50) NOT NULL,
        distressed_zone VARCHAR(100) NOT NULL,
        distressed_lat DOUBLE PRECISION NOT NULL,
        distressed_lon DOUBLE PRECISION NOT NULL,
        buddy_operator_id VARCHAR(50) NOT NULL,
        buddy_machine_id VARCHAR(50) NOT NULL,
        distance_meters DOUBLE PRECISION NOT NULL,
        status VARCHAR(30) NOT NULL CHECK(status IN ('pending', 'en_route', 'radio_contacted', 'resolved')),
        dispatched_at VARCHAR(50) NOT NULL,
        acknowledged_at VARCHAR(50),
        notes TEXT
    );
    """)

    # 13. Multi-Operator SOS Correlation Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sos_correlations (
        correlation_id VARCHAR(50) PRIMARY KEY,
        location_zone VARCHAR(100) NOT NULL,
        alert_ids TEXT NOT NULL,
        operator_ids TEXT NOT NULL,
        machine_ids TEXT NOT NULL,
        operator_count INTEGER NOT NULL,
        first_triggered_at VARCHAR(50) NOT NULL,
        latest_triggered_at VARCHAR(50) NOT NULL,
        status VARCHAR(30) NOT NULL CHECK(status IN ('active_emergency', 'evacuation_ordered', 'contained', 'resolved')),
        evacuation_ordered_at VARCHAR(50),
        notes TEXT
    );
    """)

    # 14. Supervisor Configurable Thresholds Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS supervisor_thresholds (
        id VARCHAR(50) PRIMARY KEY,
        idle_limit_min DOUBLE PRECISION NOT NULL DEFAULT 40.0,
        sos_timeout_sec INTEGER NOT NULL DEFAULT 45,
        diesel_cost_per_liter DOUBLE PRECISION NOT NULL DEFAULT 1.35,
        idle_burn_rate_l_per_hour DOUBLE PRECISION NOT NULL DEFAULT 3.6,
        anomaly_sensitivity VARCHAR(20) NOT NULL DEFAULT 'standard',
        duty_cycle_max_hours DOUBLE PRECISION NOT NULL DEFAULT 4.0,
        cooldown_period_min INTEGER NOT NULL DEFAULT 15,
        updated_at VARCHAR(50) NOT NULL
    );
    """)

    # 15. Weather Cache Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS weather_cache (
        cache_key VARCHAR(100) PRIMARY KEY,
        temperature_c DOUBLE PRECISION NOT NULL,
        precipitation_mm DOUBLE PRECISION NOT NULL,
        wind_speed_kmh DOUBLE PRECISION NOT NULL,
        cached_at VARCHAR(50) NOT NULL
    );
    """)

    # 16. Task Locations Table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS task_locations (
        site_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        base_elevation_m DOUBLE PRECISION NOT NULL,
        description TEXT
    );
    """)

    # Ensure default supervisor thresholds row
    cur.execute("""
    INSERT INTO supervisor_thresholds (
        id, idle_limit_min, sos_timeout_sec, diesel_cost_per_liter, idle_burn_rate_l_per_hour,
        anomaly_sensitivity, duty_cycle_max_hours, cooldown_period_min, updated_at
    ) VALUES (
        'SITE_DEFAULT', 40.0, 45, 1.35, 3.6, 'standard', 4.0, 15, '2026-09-24T00:00:00Z'
    ) ON CONFLICT (id) DO NOTHING;
    """)

    conn.commit()


def migrate_data_from_sqlite_to_postgres(pg_conn):
    """Automatically copies all existing rows from SQLite into PostgreSQL if tables are empty."""
    if not SQLITE_PATH.exists():
        return

    try:
        sqlite_conn = sqlite3.connect(SQLITE_PATH)
        sqlite_conn.row_factory = sqlite3.Row
        s_cur = sqlite_conn.cursor()

        tables_to_migrate = [
            "supervisors",
            "operators",
            "machines",
            "operator_machine_assignments",
            "tasks",
            "task_time_predictions",
            "machine_telemetry",
            "safety_alerts",
            "incidents",
            "geofence_zones",
            "machine_gps_traces",
            "buddy_failover_alerts",
            "sos_correlations",
            "supervisor_thresholds",
            "weather_cache",
            "task_locations"
        ]

        for table in tables_to_migrate:
            # Check if PostgreSQL table is empty
            try:
                pg_cur = pg_conn.cursor()
                pg_cur.execute(f"SELECT COUNT(*) FROM {table};")
                count = pg_cur.fetchone()[0]
                if count > 0:
                    continue  # Table already populated
            except Exception:
                continue

            # Fetch all rows from SQLite
            try:
                s_cur.execute(f"SELECT * FROM {table};")
                rows = s_cur.fetchall()
                if not rows:
                    continue

                col_names = [d[0] for d in s_cur.description]
                cols_str = ", ".join(col_names)
                placeholders = ", ".join(["%s"] * len(col_names))
                insert_sql = f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING;"

                data = [tuple(r[c] for c in col_names) for r in rows]
                pg_cur.executemany(insert_sql, data)
                pg_conn.commit()
                print(f"[PostgreSQL Migration] Migrated {len(data)} rows into '{table}'.")
            except Exception as e:
                print(f"[PostgreSQL Migration Warning] Could not migrate '{table}': {e}")

        sqlite_conn.close()
    except Exception as err:
        print(f"[PostgreSQL Migration Error] {err}")


def init_sqlite_db(conn):
    """Standard SQLite database initialization."""
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS supervisors (
        supervisor_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC'
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS operators (
        operator_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        preferred_language TEXT NOT NULL DEFAULT 'en',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        skill_level TEXT NOT NULL CHECK(skill_level IN ('Beginner', 'Intermediate', 'Expert')),
        assigned_supervisor_id TEXT NOT NULL,
        FOREIGN KEY (assigned_supervisor_id) REFERENCES supervisors (supervisor_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS machines (
        machine_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        model TEXT NOT NULL,
        age_years REAL NOT NULL,
        owner_supervisor_id TEXT NOT NULL,
        custody_status TEXT NOT NULL CHECK(custody_status IN ('owned', 'rented_in', 'rented_out')),
        rental_counterparty TEXT,
        rental_start TEXT,
        rental_end TEXT,
        latitude REAL DEFAULT 40.7128,
        longitude REAL DEFAULT -74.0060,
        current_zone TEXT DEFAULT 'Zone A - Quarry North',
        authorized_zone TEXT DEFAULT 'Zone A - Quarry North',
        speed_kmh REAL DEFAULT 0.0,
        heading_deg REAL DEFAULT 0.0,
        is_geofence_breached INTEGER DEFAULT 0,
        last_gps_update TEXT,
        continuous_operating_hours REAL DEFAULT 2.0,
        last_cooldown_at TEXT,
        FOREIGN KEY (owner_supervisor_id) REFERENCES supervisors (supervisor_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS operator_machine_assignments (
        assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        operator_id TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        shift_date TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (operator_id) REFERENCES operators (operator_id),
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        weather TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        scheduled_start TEXT NOT NULL,
        scheduled_end TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('upcoming', 'in-progress', 'done', 'delayed')),
        location_zone TEXT NOT NULL,
        notes TEXT,
        weather_reapproval_required INTEGER DEFAULT 0,
        weather_approved_by TEXT,
        FOREIGN KEY (operator_id) REFERENCES operators (operator_id),
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS task_time_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL UNIQUE,
        estimated_time_min REAL NOT NULL,
        predicted_time_min REAL,
        actual_time_min REAL,
        completion_timestamp TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks (task_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS machine_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        engine_hours REAL NOT NULL,
        fuel_used_l REAL NOT NULL,
        load_cycles INTEGER NOT NULL,
        idling_time_min REAL NOT NULL,
        seatbelt_status TEXT NOT NULL CHECK(seatbelt_status IN ('Fastened', 'Unfastened')),
        safety_alert_triggered TEXT NOT NULL CHECK(safety_alert_triggered IN ('Yes', 'No')),
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id),
        FOREIGN KEY (operator_id) REFERENCES operators (operator_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS safety_alerts (
        alert_id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        supervisor_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        acknowledged_at TEXT,
        escalated_at TEXT,
        response_time_sec REAL,
        status TEXT NOT NULL CHECK(status IN ('active', 'acknowledged', 'escalated', 'resolved')),
        notes TEXT,
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id),
        FOREIGN KEY (operator_id) REFERENCES operators (operator_id),
        FOREIGN KEY (supervisor_id) REFERENCES supervisors (supervisor_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS incidents (
        incident_id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        logged_at TEXT NOT NULL,
        incident_text TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        is_voice_logged INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id),
        FOREIGN KEY (operator_id) REFERENCES operators (operator_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS geofence_zones (
        zone_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        center_lat REAL NOT NULL,
        center_lon REAL NOT NULL,
        radius_m REAL NOT NULL,
        zone_type TEXT NOT NULL CHECK(zone_type IN ('safe_work_zone', 'blast_danger_zone', 'speed_restricted', 'haul_road')),
        max_speed_kmh REAL NOT NULL DEFAULT 25.0
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS machine_gps_traces (
        trace_id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        speed_kmh REAL NOT NULL DEFAULT 0.0,
        heading_deg REAL NOT NULL DEFAULT 0.0,
        is_anomaly INTEGER NOT NULL DEFAULT 0,
        anomaly_reason TEXT,
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS buddy_failover_alerts (
        failover_id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL,
        distressed_operator_id TEXT NOT NULL,
        distressed_machine_id TEXT NOT NULL,
        distressed_zone TEXT NOT NULL,
        distressed_lat REAL NOT NULL,
        distressed_lon REAL NOT NULL,
        buddy_operator_id TEXT NOT NULL,
        buddy_machine_id TEXT NOT NULL,
        distance_meters REAL NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'en_route', 'radio_contacted', 'resolved')),
        dispatched_at TEXT NOT NULL,
        acknowledged_at TEXT,
        notes TEXT,
        FOREIGN KEY (alert_id) REFERENCES safety_alerts (alert_id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sos_correlations (
        correlation_id TEXT PRIMARY KEY,
        location_zone TEXT NOT NULL,
        alert_ids TEXT NOT NULL,
        operator_ids TEXT NOT NULL,
        machine_ids TEXT NOT NULL,
        operator_count INTEGER NOT NULL,
        first_triggered_at TEXT NOT NULL,
        latest_triggered_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active_emergency', 'evacuation_ordered', 'contained', 'resolved')),
        evacuation_ordered_at TEXT,
        notes TEXT
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS supervisor_thresholds (
        id TEXT PRIMARY KEY,
        idle_limit_min REAL NOT NULL DEFAULT 40.0,
        sos_timeout_sec INTEGER NOT NULL DEFAULT 45,
        diesel_cost_per_liter REAL NOT NULL DEFAULT 1.35,
        idle_burn_rate_l_per_hour REAL NOT NULL DEFAULT 3.6,
        anomaly_sensitivity TEXT NOT NULL DEFAULT 'standard',
        duty_cycle_max_hours REAL NOT NULL DEFAULT 4.0,
        cooldown_period_min INTEGER NOT NULL DEFAULT 15,
        updated_at TEXT NOT NULL
    );
    """)

    # --- Safe Migrations for Existing Tables ---
    machine_cols = [c[1] for c in cursor.execute("PRAGMA table_info(machines);").fetchall()]
    if "latitude" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN latitude REAL DEFAULT 40.7128;")
    if "longitude" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN longitude REAL DEFAULT -74.0060;")
    if "current_zone" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN current_zone TEXT DEFAULT 'Zone A - Quarry North';")
    if "authorized_zone" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN authorized_zone TEXT DEFAULT 'Zone A - Quarry North';")
    if "speed_kmh" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN speed_kmh REAL DEFAULT 0.0;")
    if "heading_deg" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN heading_deg REAL DEFAULT 0.0;")
    if "is_geofence_breached" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN is_geofence_breached INTEGER DEFAULT 0;")
    if "last_gps_update" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN last_gps_update TEXT;")
    if "continuous_operating_hours" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN continuous_operating_hours REAL DEFAULT 2.0;")
    if "last_cooldown_at" not in machine_cols:
        cursor.execute("ALTER TABLE machines ADD COLUMN last_cooldown_at TEXT;")

    task_cols = [c[1] for c in cursor.execute("PRAGMA table_info(tasks);").fetchall()]
    if "weather_reapproval_required" not in task_cols:
        cursor.execute("ALTER TABLE tasks ADD COLUMN weather_reapproval_required INTEGER DEFAULT 0;")
    if "weather_approved_by" not in task_cols:
        cursor.execute("ALTER TABLE tasks ADD COLUMN weather_approved_by TEXT;")

    op_cols = [c[1] for c in cursor.execute("PRAGMA table_info(operators);").fetchall()]
    if "assigned_supervisor_id" not in op_cols:
        cursor.execute("ALTER TABLE operators ADD COLUMN assigned_supervisor_id TEXT DEFAULT 'SUP001';")
    if "preferred_language" not in op_cols:
        cursor.execute("ALTER TABLE operators ADD COLUMN preferred_language TEXT DEFAULT 'en';")
    if "timezone" not in op_cols:
        cursor.execute("ALTER TABLE operators ADD COLUMN timezone TEXT DEFAULT 'America/New_York';")

    # Seed Default Geofence Zones if empty
    cursor.execute("SELECT COUNT(*) FROM geofence_zones;")
    if cursor.fetchone()[0] == 0:
        zones = [
            ('ZONE_A', 'Zone A - Quarry North', 40.7135, -74.0055, 350.0, 'safe_work_zone', 25.0),
            ('ZONE_B', 'Zone B - Utility Pipeline', 40.7110, -74.0080, 400.0, 'safe_work_zone', 20.0),
            ('ZONE_C', 'Zone C - Stockpile Hub', 40.7160, -74.0030, 300.0, 'safe_work_zone', 15.0),
            ('ZONE_D', 'Zone D - Old Silo / Demo', 40.7090, -74.0040, 250.0, 'safe_work_zone', 20.0),
            ('ZONE_BLAST', 'Blast Danger Perimeter (Restricted)', 40.7180, -74.0090, 220.0, 'blast_danger_zone', 0.0),
        ]
        cursor.executemany("""
        INSERT INTO geofence_zones (zone_id, name, center_lat, center_lon, radius_m, zone_type, max_speed_kmh)
        VALUES (?, ?, ?, ?, ?, ?, ?);
        """, zones)

    # Ensure LDR001, BLD001, BLD002 exist in machines
    cursor.execute("""
    INSERT OR IGNORE INTO machines (
        machine_id, machine_type, model, machine_age_yrs, purchase_date,
        last_maintenance_date, lifetime_engine_hours, fuel_tank_capacity_l, status,
        latitude, longitude, current_zone, authorized_zone
    ) VALUES
    ('BLD001', 'Bulldozer', 'Cat D6 Track-Type Tractor', 5, '2021-01-15', '2026-04-10', 4200, 350, 'Active', 40.7139, -74.0062, 'Zone A - Quarry North', 'Zone A - Quarry North'),
    ('LDR001', 'Wheel Loader', 'Cat 950M Wheel Loader', 3, '2023-03-20', '2026-05-01', 2800, 300, 'Active', 40.7158, -74.0032, 'Zone C - Stockpile Hub', 'Zone C - Stockpile Hub'),
    ('BLD002', 'Bulldozer', 'Cat D8 Heavy Dozer', 6, '2020-05-10', '2026-03-15', 6500, 450, 'Active', 40.7092, -74.0042, 'Zone D - Old Silo / Demo', 'Zone D - Old Silo / Demo');
    """)

    # Ensure active operator assignments for LDR001 and BLD001
    cursor.execute("SELECT COUNT(*) FROM operator_machine_assignments WHERE machine_id = 'BLD001';")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO operator_machine_assignments (operator_id, machine_id, shift_date, is_active) VALUES ('OP1003', 'BLD001', '2026-09-23', 1);")

    cursor.execute("SELECT COUNT(*) FROM operator_machine_assignments WHERE machine_id = 'LDR001';")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO operator_machine_assignments (operator_id, machine_id, shift_date, is_active) VALUES ('OP1002', 'LDR001', '2026-09-23', 1);")

    # Seed initial GPS positions for machines
    cursor.execute("""
    UPDATE machines SET
        latitude = 40.7132, longitude = -74.0058, current_zone = 'Zone A - Quarry North',
        authorized_zone = 'Zone A - Quarry North', speed_kmh = 4.5, heading_deg = 45.0,
        is_geofence_breached = 0, last_gps_update = '2026-09-23T16:30:00Z',
        continuous_operating_hours = 4.2
    WHERE machine_id = 'EXC001';
    """)

    # EXC002 is flagged as weird/anomalous: breached boundary into Blast Danger Zone!
    cursor.execute("""
    UPDATE machines SET
        latitude = 40.7182, longitude = -74.0088, current_zone = 'Blast Danger Perimeter (Restricted)',
        authorized_zone = 'Zone B - Utility Pipeline', speed_kmh = 8.1, heading_deg = 320.0,
        is_geofence_breached = 1, last_gps_update = '2026-09-23T16:31:00Z',
        continuous_operating_hours = 1.8
    WHERE machine_id = 'EXC002';
    """)

    cursor.execute("""
    UPDATE machines SET
        latitude = 40.7158, longitude = -74.0032, current_zone = 'Zone C - Stockpile Hub',
        authorized_zone = 'Zone C - Stockpile Hub', speed_kmh = 12.0, heading_deg = 90.0,
        is_geofence_breached = 0, last_gps_update = '2026-09-23T16:29:00Z',
        continuous_operating_hours = 2.0
    WHERE machine_id = 'LDR001';
    """)

    cursor.execute("""
    UPDATE machines SET
        latitude = 40.7139, longitude = -74.0062, current_zone = 'Zone A - Quarry North',
        authorized_zone = 'Zone A - Quarry North', speed_kmh = 0.0, heading_deg = 0.0,
        is_geofence_breached = 0, last_gps_update = '2026-09-23T16:28:00Z',
        continuous_operating_hours = 3.1
    WHERE machine_id = 'BLD001';
    """)

    cursor.execute("""
    UPDATE machines SET
        latitude = 40.7092, longitude = -74.0042, current_zone = 'Zone D - Old Silo / Demo',
        authorized_zone = 'Zone D - Old Silo / Demo', speed_kmh = 0.0, heading_deg = 180.0,
        is_geofence_breached = 0, last_gps_update = '2026-09-23T16:25:00Z',
        continuous_operating_hours = 0.5
    WHERE machine_id = 'BLD002';
    """)

    # Seed traces for EXC002 showing route towards danger perimeter
    cursor.execute("SELECT COUNT(*) FROM machine_gps_traces WHERE machine_id = 'EXC002';")
    if cursor.fetchone()[0] == 0:
        traces = [
            ('EXC002', '2026-09-23T16:15:00Z', 40.7112, -74.0080, 5.0, 350.0, 0, None),
            ('EXC002', '2026-09-23T16:20:00Z', 40.7130, -74.0082, 7.2, 345.0, 0, None),
            ('EXC002', '2026-09-23T16:25:00Z', 40.7155, -74.0085, 8.5, 335.0, 1, 'Exited Authorized Zone B - Utility Pipeline'),
            ('EXC002', '2026-09-23T16:30:00Z', 40.7175, -74.0087, 8.0, 325.0, 1, 'Approaching High-Risk Blast Danger Perimeter'),
            ('EXC002', '2026-09-23T16:31:00Z', 40.7182, -74.0088, 8.1, 320.0, 1, 'CRITICAL: Entered Blast Danger Perimeter (Restricted Zone)')
        ]
        cursor.executemany("""
        INSERT INTO machine_gps_traces (machine_id, timestamp, latitude, longitude, speed_kmh, heading_deg, is_anomaly, anomaly_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, traces)

    conn.commit()


def init_db():
    """Initializes the active database (PostgreSQL if connected, SQLite otherwise)."""
    conn = get_db_connection()
    if isinstance(conn, PostgresConnectionWrapper):
        print("[Database] Initializing PostgreSQL schema & verifying migrations...")
        init_postgres_schema(conn)
        migrate_data_from_sqlite_to_postgres(conn)
        conn.close()
        print("[Database] PostgreSQL connection active and synchronized.")
    else:
        init_sqlite_db(conn)
        conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Active Database Engine: {get_active_db_engine()}")
