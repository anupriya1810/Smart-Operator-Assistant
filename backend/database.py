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

    # 10. Geofence Zones Table
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

    # 11. Machine GPS Historical Breadcrumb Traces Table
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

    # --- Safe Migrations for Existing Tables ---
    # Add GPS columns to machines if not present
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

    # Add Weather Re-Approval columns to tasks if not present
    task_cols = [c[1] for c in cursor.execute("PRAGMA table_info(tasks);").fetchall()]
    if "weather_reapproval_required" not in task_cols:
        cursor.execute("ALTER TABLE tasks ADD COLUMN weather_reapproval_required INTEGER DEFAULT 0;")
    if "weather_approved_by" not in task_cols:
        cursor.execute("ALTER TABLE tasks ADD COLUMN weather_approved_by TEXT;")

    # Add safe migrations for operators table
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

    # Seed normal traces for EXC001 within Zone A
    cursor.execute("SELECT COUNT(*) FROM machine_gps_traces WHERE machine_id = 'EXC001';")
    if cursor.fetchone()[0] == 0:
        traces_exc1 = [
            ('EXC001', '2026-09-23T16:15:00Z', 40.7130, -74.0065, 3.2, 50.0, 0, None),
            ('EXC001', '2026-09-23T16:20:00Z', 40.7131, -74.0062, 4.0, 45.0, 0, None),
            ('EXC001', '2026-09-23T16:25:00Z', 40.7132, -74.0060, 3.8, 48.0, 0, None),
            ('EXC001', '2026-09-23T16:30:00Z', 40.7132, -74.0058, 4.5, 45.0, 0, None)
        ]
        cursor.executemany("""
        INSERT INTO machine_gps_traces (machine_id, timestamp, latitude, longitude, speed_kmh, heading_deg, is_anomaly, anomaly_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, traces_exc1)

    # 12. Proximity-Based Buddy Failover Alerts Table
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

    # 13. Multi-Operator SOS Correlation & Mass Evacuation Table
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

    # 14. Supervisor Configurable Thresholds Table
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

    cursor.execute("""
    INSERT OR IGNORE INTO supervisor_thresholds (
        id, idle_limit_min, sos_timeout_sec, diesel_cost_per_liter, idle_burn_rate_l_per_hour,
        anomaly_sensitivity, duty_cycle_max_hours, cooldown_period_min, updated_at
    ) VALUES (
        'SITE_DEFAULT', 40.0, 45, 1.35, 3.6, 'standard', 4.0, 15, '2026-09-24T00:00:00Z'
    );
    """)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)
