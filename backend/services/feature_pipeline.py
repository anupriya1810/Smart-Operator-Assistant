"""
CAT Co-Pilot Feature Engineering Pipeline.

Merges data across:
1. `task_duration_log`: task_type, estimated_time_min (feature, not target), actual_time_min (target for training).
2. `operators`: skill_level, years_experience, training_completion_pct, safety_violations_ytd, shift.
3. `machines`: machine_age_yrs, lifetime_engine_hours, days_since_last_maintenance, status.
4. `telemetry_log`: rolling avg idling_time_min, rolling avg load_cycles, safety_alert_triggered count up to task date.
5. External Weather API (Open-Meteo): temperature_c, precipitation_mm, wind_speed_kmh.
6. External Terrain API (Open-Meteo Elevation): elevation_m, slope_pct, ruggedness_score, terrain_difficulty.

Engineered Scores:
------------------
1. Machine Health Score (Formula):
   Combines machine age, lifetime engine hours, days since last maintenance, and machine operational status:
     - age_penalty = min(1.0, machine_age_yrs / 15.0)
     - hours_penalty = min(1.0, lifetime_engine_hours / 25000.0)
     - maint_penalty = min(1.0, days_since_last_maintenance / 180.0)
     - status_multiplier = 0.60 if status == 'Under Maintenance' else (0.85 if status == 'Idle' else 1.0)
     - machine_health_score = max(0.05, min(1.0, (1.0 - (0.35 * age_penalty + 0.40 * hours_penalty + 0.25 * maint_penalty)) * status_multiplier))

2. Operator Reliability Score (Formula):
   Raw skill level alone is a weak signal. Combines skill level, experience, formal training completion, and safety violations:
     - skill_weight = 0.50 if Beginner, 0.80 if Intermediate, 1.00 if Expert
     - exp_score = min(1.0, years_experience / 20.0)
     - training_score = training_completion_pct / 100.0
     - violation_penalty = min(0.40, safety_violations_ytd * 0.08)
     - operator_reliability_score = max(0.10, min(1.0, (0.35 * skill_weight + 0.25 * exp_score + 0.25 * training_score + 0.15) - violation_penalty))
"""

import os
import sqlite3
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

from services.weather_terrain_service import fetch_weather, fetch_terrain, warm_weather_cache_for_sites

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "smart_cat.db"))

CATEGORICAL_FEATURES = [
    "task_type",
    "skill_level",
    "shift",
    "machine_type",
    "machine_status",
    "terrain_difficulty"
]

NUMERICAL_FEATURES = [
    "estimated_time_min",
    "years_experience",
    "training_completion_pct",
    "safety_violations_ytd",
    "operator_reliability_score",
    "machine_age_yrs",
    "lifetime_engine_hours",
    "days_since_last_maintenance",
    "machine_health_score",
    "rolling_avg_idling_time_min",
    "rolling_avg_load_cycles",
    "rolling_safety_alerts_count",
    "temperature_c",
    "precipitation_mm",
    "wind_speed_kmh",
    "elevation_m",
    "slope_pct",
    "ruggedness_score"
]

def get_db_conn():
    try:
        from database import get_db_connection
        return get_db_connection()
    except Exception:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

def compute_machine_health_score(machine_age_yrs: float, lifetime_engine_hours: float, days_since_last_maint: float, status: str) -> float:
    """
    Compute normalized Machine Health Score [0.05, 1.0].
    
    Formula:
      age_penalty = min(1.0, machine_age_yrs / 15.0)
      hours_penalty = min(1.0, lifetime_engine_hours / 25000.0)
      maint_penalty = min(1.0, days_since_last_maint / 180.0)
      status_mult = 0.60 if Under Maintenance, 0.85 if Idle, 1.0 if Active
      health_score = (1.0 - (0.35*age_penalty + 0.40*hours_penalty + 0.25*maint_penalty)) * status_mult
    """
    age_penalty = min(1.0, max(0.0, float(machine_age_yrs) / 15.0))
    hours_penalty = min(1.0, max(0.0, float(lifetime_engine_hours) / 25000.0))
    maint_penalty = min(1.0, max(0.0, float(days_since_last_maint) / 180.0))

    status_str = str(status).strip()
    if status_str == "Under Maintenance":
        status_mult = 0.60
    elif status_str == "Idle":
        status_mult = 0.85
    else:
        status_mult = 1.0

    raw_health = (1.0 - (0.35 * age_penalty + 0.40 * hours_penalty + 0.25 * maint_penalty)) * status_mult
    return round(float(np.clip(raw_health, 0.05, 1.0)), 4)

def compute_operator_reliability_score(skill_level: str, years_experience: float, training_completion_pct: float, safety_violations_ytd: int) -> float:
    """
    Compute normalized Operator Reliability Score [0.10, 1.0].
    
    Formula:
      skill_weight: Beginner=0.50, Intermediate=0.80, Expert=1.00
      exp_score = min(1.0, years_experience / 20.0)
      training_score = training_completion_pct / 100.0
      violation_penalty = min(0.40, safety_violations_ytd * 0.08)
      reliability_score = (0.35*skill_weight + 0.25*exp_score + 0.25*training_score + 0.15) - violation_penalty
    """
    skill = str(skill_level).strip()
    if skill == "Expert":
        skill_weight = 1.00
    elif skill == "Intermediate":
        skill_weight = 0.80
    else:
        skill_weight = 0.50

    exp_score = min(1.0, max(0.0, float(years_experience) / 20.0))
    training_score = min(1.0, max(0.0, float(training_completion_pct) / 100.0))
    violation_penalty = min(0.40, max(0, int(safety_violations_ytd)) * 0.08)

    raw_score = (0.35 * skill_weight + 0.25 * exp_score + 0.25 * training_score + 0.15) - violation_penalty
    return round(float(np.clip(raw_score, 0.10, 1.0)), 4)

def get_rolling_telemetry(cur: sqlite3.Cursor, operator_id: str, machine_id: str, task_date_str: str) -> Dict[str, float]:
    """
    Aggregate telemetry_log up to task date for the operator+machine pair.
    Computes:
      - rolling_avg_idling_time_min
      - rolling_avg_load_cycles
      - rolling_safety_alerts_count
    Falls back to operator-level or fleet-level telemetry if no prior events exist for the exact pair.
    """
    # 1. Check exact operator + machine pair prior to task_date
    cur.execute("""
    SELECT AVG(idling_time_min), AVG(load_cycles), SUM(CASE WHEN safety_alert_triggered = 1 OR safety_alert_triggered = 'TRUE' OR safety_alert_triggered = 'Yes' THEN 1 ELSE 0 END)
    FROM telemetry_log
    WHERE operator_id = ? AND machine_id = ? AND ts <= ?;
    """, (operator_id, machine_id, task_date_str))
    row = cur.fetchone()

    if row and row[0] is not None:
        return {
            "rolling_avg_idling_time_min": round(float(row[0]), 2),
            "rolling_avg_load_cycles": round(float(row[1]), 2),
            "rolling_safety_alerts_count": int(row[2] or 0)
        }

    # 2. Fallback: check operator prior telemetry across any machine
    cur.execute("""
    SELECT AVG(idling_time_min), AVG(load_cycles), SUM(CASE WHEN safety_alert_triggered = 1 OR safety_alert_triggered = 'TRUE' OR safety_alert_triggered = 'Yes' THEN 1 ELSE 0 END)
    FROM telemetry_log
    WHERE operator_id = ? AND ts <= ?;
    """, (operator_id, task_date_str))
    row = cur.fetchone()
    if row and row[0] is not None:
        return {
            "rolling_avg_idling_time_min": round(float(row[0]), 2),
            "rolling_avg_load_cycles": round(float(row[1]), 2),
            "rolling_safety_alerts_count": int(row[2] or 0)
        }

    # 3. Fleet baseline averages fallback
    return {
        "rolling_avg_idling_time_min": 14.8,
        "rolling_avg_load_cycles": 17.5,
        "rolling_safety_alerts_count": 0
    }

def build_dataset_dataframe() -> pd.DataFrame:
    """
    Extract all 300 tasks from task_duration_log, join operators, machines, telemetry,
    and external weather/terrain APIs. Returns a feature-engineered DataFrame.
    """
    conn = get_db_conn()
    cur = conn.cursor()

    # Query joined base data
    query = """
    SELECT 
        t.task_id,
        t.task_type,
        t.weather AS logged_weather,
        t.operator_id,
        t.machine_id,
        t.estimated_time_min,
        t.actual_time_min,
        t.latitude,
        t.longitude,
        t.site_id,
        t.scheduled_date,
        o.skill_level,
        o.years_experience,
        o.training_completion_pct,
        o.safety_violations_ytd,
        o.shift,
        m.machine_type,
        m.model AS machine_model,
        m.machine_age_yrs,
        m.lifetime_engine_hours,
        m.last_maintenance_date,
        m.status AS machine_status
    FROM task_duration_log t
    JOIN operators o ON t.operator_id = o.operator_id
    JOIN machines m ON t.machine_id = m.machine_id
    ORDER BY t.scheduled_date ASC, t.task_id ASC;
    """
    cur.execute(query)
    rows = cur.fetchall()

    # Pre-cache weather across all unique sites for May 2026
    try:
        cur.execute("SELECT latitude, longitude FROM task_locations;")
        loc_rows = cur.fetchall()
        sites = [{"latitude": row["latitude"], "longitude": row["longitude"]} for row in loc_rows]
        if sites:
            print("[Feature Pipeline] Pre-caching weather archive data for unique job sites...")
            warm_weather_cache_for_sites(sites, "2026-05-01", "2026-05-31")
    except Exception as e:
        print(f"[Feature Pipeline] Cache pre-warm notice: {e}")

    records = []
    print(f"[Feature Pipeline] Processing {len(rows)} tasks across databases and external APIs...")

    for r in rows:
        task_id = r["task_id"]
        task_type = r["task_type"]
        est_min = float(r["estimated_time_min"])
        act_min = float(r["actual_time_min"])
        lat = float(r["latitude"] if r["latitude"] is not None else 40.7128)
        lon = float(r["longitude"] if r["longitude"] is not None else -74.0060)
        sched_date = r["scheduled_date"] or "2026-05-15 09:00:00"

        # 1. Operators features & Reliability Score
        skill_level = r["skill_level"]
        years_exp = float(r["years_experience"])
        train_pct = float(r["training_completion_pct"])
        violations = int(r["safety_violations_ytd"])
        shift = r["shift"]
        op_reliability = compute_operator_reliability_score(skill_level, years_exp, train_pct, violations)

        # 2. Machine features & Health Score
        age_yrs = float(r["machine_age_yrs"])
        eng_hours = float(r["lifetime_engine_hours"])
        maint_date_str = r["last_maintenance_date"]
        machine_status = r["machine_status"]
        
        try:
            maint_dt = datetime.strptime(maint_date_str, "%Y-%m-%d")
            task_dt = datetime.strptime(sched_date.split(".")[0], "%Y-%m-%d %H:%M:%S")
            days_since_maint = max(0, (task_dt - maint_dt).days)
        except Exception:
            days_since_maint = 60

        machine_health = compute_machine_health_score(age_yrs, eng_hours, days_since_maint, machine_status)

        # 3. Telemetry Rolling Behavioral Aggregates
        telem = get_rolling_telemetry(cur, r["operator_id"], r["machine_id"], sched_date)

        # 4. External Weather API (Open-Meteo with caching)
        weather_info = fetch_weather(lat, lon, sched_date)

        # 5. External Terrain API (Open-Meteo Elevation with caching)
        terrain_info = fetch_terrain(lat, lon)

        record = {
            "task_id": task_id,
            "scheduled_date": sched_date,
            "task_type": task_type,
            "estimated_time_min": est_min,
            "actual_time_min": act_min,
            # Operator
            "operator_id": r["operator_id"],
            "skill_level": skill_level,
            "years_experience": years_exp,
            "training_completion_pct": train_pct,
            "safety_violations_ytd": violations,
            "shift": shift,
            "operator_reliability_score": op_reliability,
            # Machine
            "machine_id": r["machine_id"],
            "machine_type": r["machine_type"],
            "machine_age_yrs": age_yrs,
            "lifetime_engine_hours": eng_hours,
            "days_since_last_maintenance": days_since_maint,
            "machine_status": machine_status,
            "machine_health_score": machine_health,
            # Telemetry Rolling Aggregates
            "rolling_avg_idling_time_min": telem["rolling_avg_idling_time_min"],
            "rolling_avg_load_cycles": telem["rolling_avg_load_cycles"],
            "rolling_safety_alerts_count": telem["rolling_safety_alerts_count"],
            # Weather Features
            "temperature_c": weather_info["temperature_c"],
            "precipitation_mm": weather_info["precipitation_mm"],
            "wind_speed_kmh": weather_info["wind_speed_kmh"],
            # Terrain Features
            "elevation_m": terrain_info["elevation_m"],
            "slope_pct": terrain_info["slope_pct"],
            "ruggedness_score": terrain_info["ruggedness_score"],
            "terrain_difficulty": terrain_info["terrain_difficulty"]
        }
        records.append(record)

    conn.close()
    df = pd.DataFrame(records)
    print(f"[Feature Pipeline] Successfully generated {len(df)} feature rows!")
    return df

def extract_features_for_single_task(
    task_type: str,
    operator_id: str,
    machine_id: str,
    latitude: float,
    longitude: float,
    scheduled_start: str,
    estimated_time_min: Optional[float] = None
) -> Dict[str, Any]:
    """
    Extract and engineer all features for a single live inference request.
    Lookups operator/machine from DB, fetches live weather & terrain APIs,
    computes rolling telemetry & engineered scores.
    """
    conn = get_db_conn()
    cur = conn.cursor()

    # Operator lookup
    cur.execute("SELECT skill_level, years_experience, training_completion_pct, safety_violations_ytd, shift FROM operators WHERE operator_id = ?;", (operator_id,))
    op_row = cur.fetchone()
    if op_row:
        skill_level = op_row["skill_level"]
        years_exp = float(op_row["years_experience"])
        train_pct = float(op_row["training_completion_pct"])
        violations = int(op_row["safety_violations_ytd"])
        shift = op_row["shift"]
    else:
        skill_level = "Intermediate"
        years_exp = 5.0
        train_pct = 80.0
        violations = 0
        shift = "Day"

    op_reliability = compute_operator_reliability_score(skill_level, years_exp, train_pct, violations)

    # Machine lookup
    cur.execute("SELECT machine_type, machine_age_yrs, lifetime_engine_hours, last_maintenance_date, status FROM machines WHERE machine_id = ?;", (machine_id,))
    m_row = cur.fetchone()
    if m_row:
        machine_type = m_row["machine_type"]
        age_yrs = float(m_row["machine_age_yrs"])
        eng_hours = float(m_row["lifetime_engine_hours"])
        maint_date_str = m_row["last_maintenance_date"]
        status = m_row["status"]
    else:
        machine_type = "Excavator"
        age_yrs = 5.0
        eng_hours = 8000.0
        maint_date_str = "2026-06-01"
        status = "Active"

    try:
        maint_dt = datetime.strptime(maint_date_str, "%Y-%m-%d")
        now_dt = datetime.utcnow()
        days_since_maint = max(0, (now_dt - maint_dt).days)
    except Exception:
        days_since_maint = 45

    machine_health = compute_machine_health_score(age_yrs, eng_hours, days_since_maint, status)

    # Telemetry lookup
    telem = get_rolling_telemetry(cur, operator_id, machine_id, scheduled_start)
    conn.close()

    # External APIs
    weather_info = fetch_weather(latitude, longitude, scheduled_start)
    terrain_info = fetch_terrain(latitude, longitude)

    # Estimated time default heuristic if not provided
    if estimated_time_min is None:
        type_defaults = {
            "Material Loading": 30.0,
            "Trenching": 48.0,
            "Demolition": 85.0,
            "Earth Excavation": 55.0,
            "Grading": 38.0
        }
        estimated_time_min = type_defaults.get(task_type, 45.0)

    return {
        "task_type": task_type,
        "estimated_time_min": float(estimated_time_min),
        "skill_level": skill_level,
        "years_experience": years_exp,
        "training_completion_pct": train_pct,
        "safety_violations_ytd": violations,
        "shift": shift,
        "operator_reliability_score": op_reliability,
        "machine_type": machine_type,
        "machine_age_yrs": age_yrs,
        "lifetime_engine_hours": eng_hours,
        "days_since_last_maintenance": float(days_since_maint),
        "machine_status": status,
        "machine_health_score": machine_health,
        "rolling_avg_idling_time_min": telem["rolling_avg_idling_time_min"],
        "rolling_avg_load_cycles": telem["rolling_avg_load_cycles"],
        "rolling_safety_alerts_count": telem["rolling_safety_alerts_count"],
        "temperature_c": weather_info["temperature_c"],
        "precipitation_mm": weather_info["precipitation_mm"],
        "wind_speed_kmh": weather_info["wind_speed_kmh"],
        "elevation_m": terrain_info["elevation_m"],
        "slope_pct": terrain_info["slope_pct"],
        "ruggedness_score": terrain_info["ruggedness_score"],
        "terrain_difficulty": terrain_info["terrain_difficulty"]
    }
