import sys
import os
from database import get_db_connection
from services.prediction_engine import prediction_engine
from services.anomaly_detector import anomaly_detector

def test_backend_integrity():
    conn = get_db_connection()
    
    # 1. Check Supervisors
    sups = conn.execute("SELECT COUNT(*) FROM supervisors;").fetchone()[0]
    print(f"[OK] Supervisors count: {sups}")
    assert sups > 0, "No supervisors found"

    # 2. Check Operators
    ops = conn.execute("SELECT COUNT(*) FROM operators;").fetchone()[0]
    print(f"[OK] Operators count: {ops}")
    assert ops >= 3, "Expected at least 3 operators"

    # 3. Check Machines
    machs = conn.execute("SELECT COUNT(*) FROM machines;").fetchone()[0]
    print(f"[OK] Machines count: {machs}")
    assert machs >= 4, "Expected at least 4 machines"

    # 4. Check Tasks from Photo 1 (T001 to T005)
    tasks = conn.execute("SELECT COUNT(*) FROM tasks;").fetchone()[0]
    print(f"[OK] Tasks count: {tasks}")
    assert tasks >= 5, "Expected at least 5 tasks from Photo 1"

    # 5. Check Telemetry from Photo 2
    telem = conn.execute("SELECT COUNT(*) FROM machine_telemetry;").fetchone()[0]
    print(f"[OK] Telemetry records count: {telem}")
    assert telem >= 4, "Expected 4 telemetry rows from Photo 2"

    conn.close()

    # 6. Test Prediction Engine
    pred = prediction_engine.predict("Trenching", "Rainy", "Intermediate", 4.0, 45.0)
    print(f"[OK] Prediction Engine test: Trenching in Rainy, 4yr old machine -> {pred['predicted_time_min']} min")
    assert pred["predicted_time_min"] > 45.0, "Rainy + 4yr machine should increase duration"

    # 7. Test Anomaly Detector
    anomaly = anomaly_detector.analyze_record({
        "machine_id": "EXC001",
        "operator_id": "OP1001",
        "idling_time_min": 60.0,
        "load_cycles": 1,
        "seatbelt_status": "Unfastened"
    })
    print(f"[OK] Anomaly Detector test: Ghost Idle: {anomaly['is_ghost_idle']}, Cost: ${anomaly['estimated_idle_cost_usd']}")
    assert anomaly["is_ghost_idle"] is True, "60 min idle with 1 cycle should be flagged as ghost idle"

    print("\nALL BACKEND INTEGRITY CHECKS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_backend_integrity()
