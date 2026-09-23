import sqlite3
import os
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "smart_cat.db"))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Supervisors Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS supervisors (
        supervisor_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC'
    );
    """)

    # 2. Operators Table
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

    # 3. Machines Table (with ownership, custody status, rental info)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS machines (
        machine_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        model TEXT NOT NULL,
        age_years REAL NOT NULL,
        owner_supervisor_id TEXT NOT NULL,
        custody_status TEXT NOT NULL CHECK(custody_status IN ('owned', 'rented_in', 'rented_out')),
        rental_counterparty TEXT,
        rental_start TEXT, -- UTC ISO format
        rental_end TEXT,   -- UTC ISO format
        FOREIGN KEY (owner_supervisor_id) REFERENCES supervisors (supervisor_id)
    );
    """)

    # 4. Operator <-> Machine Many-to-Many Join Table (Assignments)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS operator_machine_assignments (
        assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        operator_id TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        shift_date TEXT NOT NULL, -- UTC ISO Date
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (operator_id) REFERENCES operators (operator_id),
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id)
    );
    """)

    # 5. Task Details Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        weather TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        scheduled_start TEXT NOT NULL, -- UTC ISO format
        scheduled_end TEXT NOT NULL,   -- UTC ISO format
        status TEXT NOT NULL CHECK(status IN ('upcoming', 'in-progress', 'done', 'delayed')),
        location_zone TEXT NOT NULL,
        notes TEXT,
        FOREIGN KEY (operator_id) REFERENCES operators (operator_id),
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id)
    );
    """)

    # 6. Task Time Predicted vs Actual (Separate table as requested in Section 5)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS task_time_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL UNIQUE,
        estimated_time_min REAL NOT NULL,
        predicted_time_min REAL,
        actual_time_min REAL,
        completion_timestamp TEXT, -- UTC ISO format
        FOREIGN KEY (task_id) REFERENCES tasks (task_id)
    );
    """)

    # 7. Machine Telemetry Stream Table (Matching Photo 2)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS machine_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL, -- UTC ISO format
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

    # 8. Safety Alerts Table (for SOS & Escalation Flow)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS safety_alerts (
        alert_id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        supervisor_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        triggered_at TEXT NOT NULL,   -- UTC ISO format
        acknowledged_at TEXT,         -- UTC ISO format
        escalated_at TEXT,            -- UTC ISO format
        response_time_sec REAL,
        status TEXT NOT NULL CHECK(status IN ('active', 'acknowledged', 'escalated', 'resolved')),
        notes TEXT,
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id),
        FOREIGN KEY (operator_id) REFERENCES operators (operator_id),
        FOREIGN KEY (supervisor_id) REFERENCES supervisors (supervisor_id)
    );
    """)

    # 9. Incidents / Operator Voice Notes Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS incidents (
        incident_id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        logged_at TEXT NOT NULL, -- UTC ISO format
        incident_text TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        is_voice_logged INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (machine_id) REFERENCES machines (machine_id),
        FOREIGN KEY (operator_id) REFERENCES operators (operator_id)
    );
    """)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)
