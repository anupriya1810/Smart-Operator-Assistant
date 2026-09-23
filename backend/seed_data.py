import sqlite3
from database import get_db_connection, init_db

def seed():
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if already seeded
    cursor.execute("SELECT COUNT(*) FROM supervisors;")
    if cursor.fetchone()[0] > 0:
        print("Database already contains records. Skipping seed.")
        conn.close()
        return

    # 1. Supervisors
    cursor.execute("""
    INSERT INTO supervisors (supervisor_id, name, email, phone, timezone)
    VALUES ('SUP001', 'Marcus Vance', 'marcus.vance@cat-operations.com', '+1-555-0199', 'America/New_York');
    """)

    # 2. Operators
    operators = [
        ('OP1001', 'Jake Miller', 'en', 'America/New_York', 'Expert', 'SUP001'),
        ('OP1002', 'Priya Sharma', 'hi', 'Asia/Kolkata', 'Intermediate', 'SUP001'),
        ('OP1003', 'Carlos Gomez', 'es', 'America/Chicago', 'Beginner', 'SUP001'),
    ]
    cursor.executemany("""
    INSERT INTO operators (operator_id, name, preferred_language, timezone, skill_level, assigned_supervisor_id)
    VALUES (?, ?, ?, ?, ?, ?);
    """, operators)

    # 3. Machines (Procured/Owned, Rented-In, Rented-Out)
    machines = [
        ('EXC001', 'Excavator', 'Cat 320 Hydraulic Excavator', 2.0, 'SUP001', 'owned', None, None, None),
        ('EXC002', 'Excavator', 'Cat 336 Heavy Excavator', 4.0, 'SUP001', 'rented_in', 'Apex Heavy Fleet Inc.', '2025-04-01T00:00:00Z', '2025-07-01T23:59:59Z'),
        ('LDR001', 'Wheel Loader', 'Cat 950M Wheel Loader', 3.0, 'SUP001', 'owned', None, None, None),
        ('BLD001', 'Bulldozer', 'Cat D6 Track-Type Tractor', 5.0, 'SUP001', 'owned', None, None, None),
        ('BLD002', 'Bulldozer', 'Cat D8 Heavy Dozer', 6.0, 'SUP001', 'rented_out', 'Titan Civil Infrastructure', '2025-05-01T00:00:00Z', '2025-06-15T23:59:59Z'),
    ]
    cursor.executemany("""
    INSERT INTO machines (machine_id, type, model, age_years, owner_supervisor_id, custody_status, rental_counterparty, rental_start, rental_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, machines)

    # 4. Operator <-> Machine M:N Assignments
    assignments = [
        ('OP1001', 'EXC001', '2025-05-01', 1),
        ('OP1001', 'EXC002', '2025-05-02', 1),
        ('OP1002', 'LDR001', '2025-05-01', 1),
        ('OP1003', 'BLD001', '2025-05-01', 1),
    ]
    cursor.executemany("""
    INSERT INTO operator_machine_assignments (operator_id, machine_id, shift_date, is_active)
    VALUES (?, ?, ?, ?);
    """, assignments)

    # 5. Tasks (Directly matching Photo 1: T001 to T005)
    # T001: Earth Excavation, Sunny, Expert, Machine Age 2, Est 60 min, Actual 58 min
    # T002: Trenching, Rainy, Intermediate, Machine Age 4, Est 45 min, Actual 52 min
    # T003: Material Loading, Cloudy, Beginner, Machine Age 3, Est 30 min, Actual 42 min
    # T004: Grading, Sunny, Expert, Machine Age 5, Est 35 min, Actual 33 min
    # T005: Demolition, Windy, Intermediate, Machine Age 6, Est 90 min, Actual 105 min
    tasks = [
        ('T001', 'Earth Excavation', 'Sunny', 'OP1001', 'EXC001', '2025-05-01T08:00:00Z', '2025-05-01T09:00:00Z', 'done', 'Zone A - Quarry North', 'Deep earth excavation for foundational footings'),
        ('T002', 'Trenching', 'Rainy', 'OP1002', 'EXC002', '2025-05-01T10:00:00Z', '2025-05-01T10:45:00Z', 'in-progress', 'Zone B - Utility Pipeline', 'Drainage pipe trenching; watch for slick mud conditions'),
        ('T003', 'Material Loading', 'Cloudy', 'OP1003', 'LDR001', '2025-05-01T13:00:00Z', '2025-05-01T13:30:00Z', 'done', 'Zone C - Stockpile Hub', 'Loading aggregate onto haul trucks'),
        ('T004', 'Grading', 'Sunny', 'OP1001', 'BLD001', '2025-05-01T14:30:00Z', '2025-05-01T15:05:00Z', 'upcoming', 'Zone A - Access Roadway', 'Final pass finish grading on perimeter road'),
        ('T005', 'Demolition', 'Windy', 'OP1002', 'BLD002', '2025-05-02T09:00:00Z', '2025-05-02T10:30:00Z', 'delayed', 'Zone D - Old Concrete Silo', 'Wind speeds exceeding 30mph, delayed pending safety clearance'),
    ]
    cursor.executemany("""
    INSERT INTO tasks (task_id, task_type, weather, operator_id, machine_id, scheduled_start, scheduled_end, status, location_zone, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, tasks)

    # 6. Task Time Predicted vs Actual (Matching Photo 1)
    predictions = [
        ('T001', 60.0, 59.2, 58.0, '2025-05-01T08:58:00Z'),
        ('T002', 45.0, 51.5, 52.0, None),
        ('T003', 30.0, 41.0, 42.0, '2025-05-01T13:42:00Z'),
        ('T004', 35.0, 33.8, 33.0, None),
        ('T005', 90.0, 102.5, 105.0, None),
    ]
    cursor.executemany("""
    INSERT INTO task_time_predictions (task_id, estimated_time_min, predicted_time_min, actual_time_min, completion_timestamp)
    VALUES (?, ?, ?, ?, ?);
    """, predictions)

    # 7. Machine Telemetry Stream (Exactly matching Photo 2)
    # 2025-05-01 08:00:00 | EXC001 | OP1001 | 1523.5 | 5.2 | 12 | 30 | Fastened | No
    # 2025-05-01 10:00:00 | EXC001 | OP1001 | 1524.8 | 3.8 | 2  | 55 | Unfastened | Yes
    # 2025-05-01 14:00:00 | EXC001 | OP1001 | 1526.5 | 6.1 | 10 | 15 | Fastened | No
    # 2025-05-02 09:00:00 | EXC001 | OP1001 | 1530.2 | 2.0 | 1  | 60 | Unfastened | Yes
    telemetry = [
        ('2025-05-01T08:00:00Z', 'EXC001', 'OP1001', 1523.5, 5.2, 12, 30.0, 'Fastened', 'No'),
        ('2025-05-01T10:00:00Z', 'EXC001', 'OP1001', 1524.8, 3.8, 2, 55.0, 'Unfastened', 'Yes'),
        ('2025-05-01T14:00:00Z', 'EXC001', 'OP1001', 1526.5, 6.1, 10, 15.0, 'Fastened', 'No'),
        ('2025-05-02T09:00:00Z', 'EXC001', 'OP1001', 1530.2, 2.0, 1, 60.0, 'Unfastened', 'Yes'),
    ]
    cursor.executemany("""
    INSERT INTO machine_telemetry (timestamp, machine_id, operator_id, engine_hours, fuel_used_l, load_cycles, idling_time_min, seatbelt_status, safety_alert_triggered)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, telemetry)

    # 8. Initial Safety Alerts (based on telemetry violations)
    alerts = [
        ('ALT-001', 'EXC001', 'OP1001', 'SUP001', 'Seatbelt Unfastened while Engine Engaged', '2025-05-01T10:00:00Z', '2025-05-01T10:00:42Z', None, 42.0, 'acknowledged', 'Operator acknowledged prompt and fastened belt.'),
        ('ALT-002', 'EXC001', 'OP1001', 'SUP001', 'Seatbelt Unfastened & Inactivity', '2025-05-02T09:00:00Z', None, '2025-05-02T09:01:00Z', None, 'escalated', 'Operator did not acknowledge within 60s timeout. Auto-escalated to supervisor Marcus Vance.'),
    ]
    cursor.executemany("""
    INSERT INTO safety_alerts (alert_id, machine_id, operator_id, supervisor_id, alert_type, triggered_at, acknowledged_at, escalated_at, response_time_sec, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, alerts)

    # 9. Initial Incident voice log
    incidents = [
        ('INC-001', 'EXC001', 'OP1001', '2025-05-01T10:15:00Z', 'Noticed minor hydraulic fluid weeping near left boom cylinder seal. Still functional but requires inspection.', 'medium', 1),
    ]
    cursor.executemany("""
    INSERT INTO incidents (incident_id, machine_id, operator_id, logged_at, incident_text, severity, is_voice_logged)
    VALUES (?, ?, ?, ?, ?, ?, ?);
    """, incidents)

    conn.commit()
    conn.close()
    print("Database seeded with Photo 1 & Photo 2 fixtures successfully!")

if __name__ == "__main__":
    seed()
