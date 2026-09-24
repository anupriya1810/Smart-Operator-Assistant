"""
Standalone PostgreSQL Migration & Verification Tool for CAT Co-Pilot.

Usage:
    python migrate_to_postgres.py [OPTIONAL_POSTGRES_URL]

Examples:
    python migrate_to_postgres.py
    python migrate_to_postgres.py "postgresql://postgres:postgres@localhost:5432/cat_copilot"
    python migrate_to_postgres.py "postgresql://user:secret@ep-cool-db.us-east-2.aws.neon.tech/neondb?sslmode=require"
"""

import sys
import os
import sqlite3
from pathlib import Path

# Load local environment
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from database import (
    connect_postgres,
    init_postgres_schema,
    migrate_data_from_sqlite_to_postgres,
    _load_env_file,
    ENV_PATH,
    SQLITE_PATH,
    PostgresConnectionWrapper
)

_load_env_file(ENV_PATH)

def main():
    print("=" * 65)
    print("  CAT Co-Pilot PostgreSQL Database Migration & Verification")
    print("=" * 65)

    # 1. Override DATABASE_URL if passed as CLI argument
    if len(sys.argv) > 1 and sys.argv[1].startswith("postgres"):
        os.environ["DATABASE_URL"] = sys.argv[1]
        print(f"[*] Using CLI-provided DATABASE_URL: {sys.argv[1][:30]}...")
    else:
        db_url = os.environ.get("DATABASE_URL")
        if db_url:
            print(f"[*] Using environment DATABASE_URL: {db_url[:30]}...")
        else:
            print("[*] No DATABASE_URL specified. Attempting default localhost:5432...")

    # 2. Connect to PostgreSQL
    pg_conn = connect_postgres()
    if pg_conn is None or not isinstance(pg_conn, PostgresConnectionWrapper):
        print("\n[ERROR] Could not connect to PostgreSQL.")
        print("  Please check that your PostgreSQL server is running and accessible.")
        print("  You can configure DATABASE_URL in backend/.env, or pass it directly:")
        print("    python migrate_to_postgres.py \"postgresql://user:password@host:5432/dbname\"\n")
        sys.exit(1)

    print("[SUCCESS] Successfully connected to PostgreSQL!")

    # 3. Create schema
    print("\n[Step 1/2] Initializing PostgreSQL schema tables...")
    init_postgres_schema(pg_conn)
    print("[OK] All PostgreSQL tables verified/created.")

    # 4. Migrate data from SQLite
    print("\n[Step 2/2] Migrating existing dataset from SQLite into PostgreSQL...")
    migrate_data_from_sqlite_to_postgres(pg_conn)
    print("[OK] Data migration completed.")

    # 5. Verify row counts
    print("\n" + "-" * 45)
    print(f" {'Table Name':<30} | {'PG Row Count':>10}")
    print("-" * 45)

    tables = [
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

    cur = pg_conn.cursor()
    total_rows = 0
    for tbl in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {tbl};")
            cnt = cur.fetchone()[0]
            total_rows += cnt
            print(f" {tbl:<30} | {cnt:>10}")
        except Exception as e:
            print(f" {tbl:<30} | ERROR: {e}")

    print("-" * 45)
    print(f" {'Total Records':<30} | {total_rows:>10}")
    print("-" * 45)

    pg_conn.close()
    print("\n[DONE] PostgreSQL database is ready and synchronized for CAT Co-Pilot!")

if __name__ == "__main__":
    main()
