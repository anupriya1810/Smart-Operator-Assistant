from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
from pathlib import Path
import json
import math

from database import get_db_connection, init_db, get_active_db_engine
from models import (
    SupervisorResponse, OperatorResponse, OperatorProfileUpdate,
    MachineResponse, RentalUpdateRequest,
    TaskResponse, TaskCreate, TaskStatusUpdate,
    TelemetryRecord, IdleAnomalyReport,
    SafetyAlertCreate, SafetyAlertResponse, AlertAcknowledgeRequest,
    IncidentCreate, IncidentResponse,
    VoiceCommandRequest, VoiceCommandResponse,
    TaskTimePredictRequest, TaskTimePredictResponse,
    GpsTracePoint, GeofenceZoneResponse, GpsAnomalyReport, WeatherApprovalRequest,
    BuddyFailoverResponse, BuddyAlertResponseRequest, GeofenceProximityStatus,
    SosCorrelationResponse, EvacuationOrderRequest,
    SupervisorThresholds, ThresholdsUpdateRequest,
    MachineDutyCycleStatus, ScheduleCooldownRequest,
    FatigueEventCreate, FatigueEventResponse,
    RecalibrateRequest, RecalibrateResponse,
    LoginRequest, TokenResponse, UserProfileResponse
)
from services.notification_service import notification_service
from services.prediction_engine import prediction_engine
from services.anomaly_detector import anomaly_detector
from services.ml_prediction_service import predict_task_duration, recalibrate_model
from services.auth_service import auth_service
from services.weather_terrain_service import fetch_weather, fetch_terrain
from training_data import SCENARIOS, OPERATOR_PROGRESS
from seed_data import seed as seed_demo_data

app = FastAPI(
    title="CAT Co-Pilot API",
    description="Multi-role In-Cab Smart Operator Assistant Platform API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://smartoperatorassistant.vercel.app",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "CAT Co-Pilot Backend",
        "server_time_utc": datetime.now(timezone.utc).isoformat(),
        "database": get_active_db_engine(),
        "ml_engine": "active"
    }


# Ensure database tables exist
init_db()

try:
    seed_demo_data()
except Exception as e:
    print(f"[Seed Init Notice] {e}")

def load_runtime_thresholds():
    try:
        conn = get_db_connection()
        row = conn.execute("SELECT * FROM supervisor_thresholds WHERE id = 'SITE_DEFAULT';").fetchone()
        if row:
            anomaly_detector.update_thresholds(
                diesel_cost_per_liter=row["diesel_cost_per_liter"],
                idle_burn_rate_l_per_hour=row["idle_burn_rate_l_per_hour"],
                idle_limit_min=row["idle_limit_min"],
                anomaly_sensitivity=row["anomaly_sensitivity"]
            )
        conn.close()
    except Exception as e:
        print(f"[Threshold Init Notice] {e}")

load_runtime_thresholds()

# --- WebSocket for Real-time Cabin & Supervisor Alerts ---
@app.websocket("/ws/alerts")
async def websocket_alerts_endpoint(websocket: WebSocket):
    await websocket.accept()
    notification_service.ws_channel.connect(websocket)
    try:
        while True:
            # Keep connection alive and accept client pings/messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        notification_service.ws_channel.disconnect(websocket)
    except Exception:
        notification_service.ws_channel.disconnect(websocket)

# --- Supervisors & Operators ---
@app.get("/api/supervisors", response_model=List[SupervisorResponse])
def get_supervisors():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM supervisors;").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/operators", response_model=List[OperatorResponse])
def get_operators():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM operators;").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/operators/{operator_id}", response_model=OperatorResponse)
def get_operator(operator_id: str):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM operators WHERE operator_id = ?;", (operator_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Operator not found")
    return dict(row)

@app.patch("/api/operators/{operator_id}/profile", response_model=OperatorResponse)
def update_operator_profile(operator_id: str, update_data: OperatorProfileUpdate):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM operators WHERE operator_id = ?;", (operator_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Operator not found")
    
    current = dict(row)
    new_lang = update_data.preferred_language or current["preferred_language"]
    new_tz = update_data.timezone or current["timezone"]

    conn.execute(
        "UPDATE operators SET preferred_language = ?, timezone = ? WHERE operator_id = ?;",
        (new_lang, new_tz, operator_id)
    )
    conn.commit()
    updated_row = conn.execute("SELECT * FROM operators WHERE operator_id = ?;", (operator_id,)).fetchone()
    conn.close()
    return dict(updated_row)

# --- Machines & Rental Management ---
@app.get("/api/machines", response_model=List[MachineResponse])
def get_machines():
    conn = get_db_connection()
    # Join with latest active operator assignment
    query = """
    SELECT m.*, o.name as current_operator_name
    FROM machines m
    LEFT JOIN operator_machine_assignments oma ON m.machine_id = oma.machine_id AND oma.is_active = 1
    LEFT JOIN operators o ON oma.operator_id = o.operator_id;
    """
    rows = conn.execute(query).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/machines/{machine_id}/rental", response_model=MachineResponse)
async def update_machine_rental(machine_id: str, rental: RentalUpdateRequest):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM machines WHERE machine_id = ?;", (machine_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Machine not found")

    conn.execute("""
    UPDATE machines
    SET custody_status = ?, rental_counterparty = ?, rental_start = ?, rental_end = ?
    WHERE machine_id = ?;
    """, (rental.custody_status, rental.rental_counterparty, rental.rental_start, rental.rental_end, machine_id))
    conn.commit()

    updated = conn.execute("SELECT * FROM machines WHERE machine_id = ?;", (machine_id,)).fetchone()
    conn.close()

    # Broadcast notification to supervisors and operators
    await notification_service.notify(
        channels=["websocket", "log"],
        target="supervisor",
        message=f"Machine {machine_id} custody changed to {rental.custody_status}",
        payload={"machine_id": machine_id, "custody_status": rental.custody_status}
    )

    return dict(updated)

# --- Tasks & Scheduling ---
@app.get("/api/tasks", response_model=List[TaskResponse])
def get_tasks(operator_id: Optional[str] = None):
    conn = get_db_connection()
    base_query = """
    SELECT t.*, o.name as operator_name, m.model as machine_model,
           ttp.estimated_time_min, ttp.predicted_time_min, ttp.actual_time_min
    FROM tasks t
    LEFT JOIN operators o ON t.operator_id = o.operator_id
    LEFT JOIN machines m ON t.machine_id = m.machine_id
    LEFT JOIN task_time_predictions ttp ON t.task_id = ttp.task_id
    """
    if operator_id:
        query = base_query + " WHERE t.operator_id = ? ORDER BY t.scheduled_start ASC;"
        rows = conn.execute(query, (operator_id,)).fetchall()
    else:
        query = base_query + " ORDER BY t.scheduled_start ASC;"
        rows = conn.execute(query).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/tasks", response_model=TaskResponse)
async def create_task(task_in: TaskCreate):
    conn = get_db_connection()
    new_task_id = f"T{uuid.uuid4().hex[:5].upper()}"

    # Verify operator & machine exist
    op = conn.execute("SELECT * FROM operators WHERE operator_id = ?;", (task_in.operator_id,)).fetchone()
    mach = conn.execute("SELECT * FROM machines WHERE machine_id = ?;", (task_in.machine_id,)).fetchone()

    if not op or not mach:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid operator_id or machine_id")

    # Determine job site coordinates from location_zone
    lat, lon, site_id = 40.7128, -74.0060, "SITE_NY"
    if "Denver" in task_in.location_zone or "Quarry" in task_in.location_zone:
        lat, lon, site_id = 39.7392, -104.9903, "SITE_DEN"
    elif "Houston" in task_in.location_zone or "Highway" in task_in.location_zone:
        lat, lon, site_id = 29.7604, -95.3698, "SITE_HOU"
    elif "Phoenix" in task_in.location_zone or "Desert" in task_in.location_zone:
        lat, lon, site_id = 33.4484, -112.0740, "SITE_PHX"

    # Automatically fetch live site weather based on location if not provided
    weather_info = fetch_weather(lat, lon, task_in.scheduled_start)
    if not task_in.weather:
        if weather_info["precipitation_mm"] > 1.0:
            resolved_weather = "Rainy"
        elif weather_info["wind_speed_kmh"] > 24.0:
            resolved_weather = "Windy"
        elif weather_info["temperature_c"] > 28.0:
            resolved_weather = "Sunny"
        else:
            resolved_weather = "Cloudy"
    else:
        resolved_weather = task_in.weather

    # Automatic Baseline duration calculation if not provided by supervisor
    type_defaults = {
        "Material Loading": 30.0,
        "Trenching": 48.0,
        "Demolition": 85.0,
        "Earth Excavation": 55.0,
        "Grading": 38.0
    }
    baseline_est = task_in.estimated_time_min or type_defaults.get(task_in.task_type, 45.0)

    # Run XGBoost ML prediction model with live weather & terrain
    pred_result = predict_task_duration(
        task_type=task_in.task_type,
        operator_id=task_in.operator_id,
        machine_id=task_in.machine_id,
        latitude=lat,
        longitude=lon,
        scheduled_start=task_in.scheduled_start,
        estimated_time_min=baseline_est
    )

    # Check Weather Re-Approval Gate:
    # Severe winds (>28 km/h) or heavy rain (>12mm) triggers mandatory supervisor re-approval
    is_severe_weather = weather_info["wind_speed_kmh"] > 28.0 or weather_info["precipitation_mm"] > 12.0 or resolved_weather.lower() == "windy"
    initial_status = "delayed" if is_severe_weather else "upcoming"
    weather_reapproval = 1 if is_severe_weather else 0
    auto_notes = task_in.notes or ""
    if is_severe_weather:
        weather_notice = f"[WEATHER RE-APPROVAL REQUIRED: Wind {weather_info['wind_speed_kmh']}km/h, Precip {weather_info['precipitation_mm']}mm]"
        auto_notes = f"{weather_notice} {auto_notes}".strip()

    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO tasks (
        task_id, task_type, weather, operator_id, machine_id,
        scheduled_start, scheduled_end, status, location_zone, notes,
        weather_reapproval_required, weather_approved_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        new_task_id, task_in.task_type, resolved_weather, task_in.operator_id, task_in.machine_id,
        task_in.scheduled_start, task_in.scheduled_end, initial_status, task_in.location_zone, auto_notes,
        weather_reapproval, None
    ))

    cursor.execute("""
    INSERT INTO task_time_predictions (task_id, estimated_time_min, predicted_time_min)
    VALUES (?, ?, ?);
    """, (new_task_id, pred_result["estimated_time_min"], pred_result["predicted_time_min"]))

    # Synchronize to task_duration_log so ML dataset grows dynamically with user actions
    try:
        mach_age = int(mach["machine_age_yrs"] if "machine_age_yrs" in mach.keys() else (mach["age_years"] if "age_years" in mach.keys() else 5))
        cursor.execute("""
        INSERT OR REPLACE INTO task_duration_log (
            task_id, task_type, weather, operator_id, machine_id,
            operator_skill, machine_age_yrs, estimated_time_min, actual_time_min,
            latitude, longitude, site_id, scheduled_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            new_task_id, task_in.task_type, resolved_weather, task_in.operator_id, task_in.machine_id,
            op["skill_level"], mach_age, int(pred_result["estimated_time_min"]),
            int(pred_result["predicted_time_min"]), lat, lon, site_id, task_in.scheduled_start
        ))
    except Exception as e:
        print(f"[Dataset Sync Notice] task_duration_log write: {e}")

    conn.commit()

    # Query back joined
    query = """
    SELECT t.*, o.name as operator_name, m.model as machine_model,
           ttp.estimated_time_min, ttp.predicted_time_min, ttp.actual_time_min
    FROM tasks t
    LEFT JOIN operators o ON t.operator_id = o.operator_id
    LEFT JOIN machines m ON t.machine_id = m.machine_id
    LEFT JOIN task_time_predictions ttp ON t.task_id = ttp.task_id
    WHERE t.task_id = ?;
    """
    row = conn.execute(query, (new_task_id,)).fetchone()
    conn.close()

    # Notify via WebSocket
    await notification_service.notify(
        channels=["websocket", "log"],
        target=task_in.operator_id,
        message=f"New Task Scheduled: {task_in.task_type} at {task_in.location_zone} (Weather: {resolved_weather})",
        payload={
            "task_id": new_task_id,
            "predicted_duration": pred_result["predicted_time_min"],
            "weather_reapproval_required": bool(weather_reapproval)
        }
    )

    return dict(row)

@app.post("/api/tasks/{task_id}/weather-approval", response_model=TaskResponse)
async def approve_weather_for_task(task_id: str, req: WeatherApprovalRequest):
    conn = get_db_connection()
    task = conn.execute("SELECT * FROM tasks WHERE task_id = ?;", (task_id,)).fetchone()
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")

    new_status = "upcoming" if req.action == "approve" else "delayed"
    reapproval = 0 if req.action == "approve" else 1
    note_append = f" | [WEATHER AUTHORIZED by {req.supervisor_id}: {req.notes or 'Proceed with standard PPE'}]" if req.action == "approve" else f" | [WEATHER POSTPONED by {req.supervisor_id}: {req.notes or 'High wind hazard'}]"
    updated_notes = (task["notes"] or "") + note_append

    conn.execute("""
    UPDATE tasks
    SET status = ?, weather_reapproval_required = ?, weather_approved_by = ?, notes = ?
    WHERE task_id = ?;
    """, (new_status, reapproval, req.supervisor_id if req.action == "approve" else None, updated_notes, task_id))
    conn.commit()

    query = """
    SELECT t.*, o.name as operator_name, m.model as machine_model,
           ttp.estimated_time_min, ttp.predicted_time_min, ttp.actual_time_min
    FROM tasks t
    LEFT JOIN operators o ON t.operator_id = o.operator_id
    LEFT JOIN machines m ON t.machine_id = m.machine_id
    LEFT JOIN task_time_predictions ttp ON t.task_id = ttp.task_id
    WHERE t.task_id = ?;
    """
    row = conn.execute(query, (task_id,)).fetchone()
    conn.close()

    await notification_service.notify(
        channels=["websocket", "log"],
        target="all",
        message=f"Task {task_id} weather gate updated: {req.action.upper()} by {req.supervisor_id}",
        payload={"task_id": task_id, "status": new_status, "reapproval_required": bool(reapproval)}
    )

    return dict(row)

@app.patch("/api/tasks/{task_id}/status", response_model=TaskResponse)
async def update_task_status(task_id: str, status_update: TaskStatusUpdate):
    conn = get_db_connection()
    task = conn.execute("SELECT * FROM tasks WHERE task_id = ?;", (task_id,)).fetchone()
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")

    conn.execute("UPDATE tasks SET status = ? WHERE task_id = ?;", (status_update.status, task_id))

    if status_update.status == "done" and status_update.actual_time_min is not None:
        now_utc = datetime.now(timezone.utc).isoformat()
        conn.execute("""
        UPDATE task_time_predictions
        SET actual_time_min = ?, completion_timestamp = ?
        WHERE task_id = ?;
        """, (status_update.actual_time_min, now_utc, task_id))

        # Also update actual_time_min in task_duration_log to improve future retrainings
        try:
            conn.execute("""
            UPDATE task_duration_log
            SET actual_time_min = ?
            WHERE task_id = ?;
            """, (int(status_update.actual_time_min), task_id))
        except Exception as e:
            print(f"[Dataset Sync Notice] task_duration_log update: {e}")

    conn.commit()

    query = """
    SELECT t.*, o.name as operator_name, m.model as machine_model,
           ttp.estimated_time_min, ttp.predicted_time_min, ttp.actual_time_min
    FROM tasks t
    LEFT JOIN operators o ON t.operator_id = o.operator_id
    LEFT JOIN machines m ON t.machine_id = m.machine_id
    LEFT JOIN task_time_predictions ttp ON t.task_id = ttp.task_id
    WHERE t.task_id = ?;
    """
    row = conn.execute(query, (task_id,)).fetchone()
    conn.close()

    await notification_service.notify(
        channels=["websocket", "log"],
        target="supervisor",
        message=f"Task {task_id} status updated to {status_update.status}",
        payload={"task_id": task_id, "status": status_update.status}
    )

    return dict(row)

# --- Telemetry & Idle Anomalies (Photo 2) ---
@app.get("/api/telemetry", response_model=List[TelemetryRecord])
def get_telemetry(machine_id: Optional[str] = None):
    conn = get_db_connection()
    if machine_id:
        rows = conn.execute("SELECT * FROM machine_telemetry WHERE machine_id = ? ORDER BY timestamp DESC;", (machine_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM machine_telemetry ORDER BY timestamp DESC;").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/telemetry/anomalies", response_model=List[IdleAnomalyReport])
def get_telemetry_anomalies():
    conn = get_db_connection()
    query = """
    SELECT mt.*, o.name as operator_name
    FROM machine_telemetry mt
    LEFT JOIN operators o ON mt.operator_id = o.operator_id
    ORDER BY mt.timestamp DESC;
    """
    rows = conn.execute(query).fetchall()
    conn.close()

    reports = []
    for r in rows:
        row_dict = dict(r)
        analysis = anomaly_detector.analyze_record(row_dict)
        reports.append(IdleAnomalyReport(
            machine_id=row_dict["machine_id"],
            operator_id=row_dict["operator_id"],
            operator_name=row_dict.get("operator_name"),
            timestamp=row_dict["timestamp"],
            idling_time_min=analysis["idling_time_min"],
            load_cycles=analysis["load_cycles"],
            fuel_wasted_l=analysis["fuel_wasted_l"],
            estimated_idle_cost_usd=analysis["estimated_idle_cost_usd"],
            seatbelt_status=analysis["seatbelt_status"],
            is_ghost_idle=analysis["is_ghost_idle"]
        ))
    return reports

# --- Supervisor Configurable Threshold Endpoints ---
@app.get("/api/supervisor/thresholds", response_model=SupervisorThresholds)
def get_supervisor_thresholds():
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM supervisor_thresholds WHERE id = 'SITE_DEFAULT';").fetchone()
    if not row:
        now_utc = datetime.now(timezone.utc).isoformat()
        conn.execute("""
        INSERT INTO supervisor_thresholds (
            id, idle_limit_min, sos_timeout_sec, diesel_cost_per_liter, idle_burn_rate_l_per_hour,
            anomaly_sensitivity, duty_cycle_max_hours, cooldown_period_min, updated_at
        ) VALUES ('SITE_DEFAULT', 40.0, 45, 1.35, 3.6, 'standard', 4.0, 15, ?);
        """, (now_utc,))
        conn.commit()
        row = conn.execute("SELECT * FROM supervisor_thresholds WHERE id = 'SITE_DEFAULT';").fetchone()
    conn.close()
    return dict(row)

@app.put("/api/supervisor/thresholds", response_model=SupervisorThresholds)
async def update_supervisor_thresholds(req: ThresholdsUpdateRequest):
    conn = get_db_connection()
    current = conn.execute("SELECT * FROM supervisor_thresholds WHERE id = 'SITE_DEFAULT';").fetchone()
    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Threshold configuration not found")

    new_idle_limit = req.idle_limit_min if req.idle_limit_min is not None else current["idle_limit_min"]
    new_sos_timeout = req.sos_timeout_sec if req.sos_timeout_sec is not None else current["sos_timeout_sec"]
    new_diesel_cost = req.diesel_cost_per_liter if req.diesel_cost_per_liter is not None else current["diesel_cost_per_liter"]
    new_burn_rate = req.idle_burn_rate_l_per_hour if req.idle_burn_rate_l_per_hour is not None else current["idle_burn_rate_l_per_hour"]
    new_sensitivity = req.anomaly_sensitivity if req.anomaly_sensitivity is not None else current["anomaly_sensitivity"]
    new_duty_cycle = req.duty_cycle_max_hours if req.duty_cycle_max_hours is not None else current["duty_cycle_max_hours"]
    new_cooldown = req.cooldown_period_min if req.cooldown_period_min is not None else current["cooldown_period_min"]
    now_utc = datetime.now(timezone.utc).isoformat()

    conn.execute("""
    UPDATE supervisor_thresholds
    SET idle_limit_min = ?,
        sos_timeout_sec = ?,
        diesel_cost_per_liter = ?,
        idle_burn_rate_l_per_hour = ?,
        anomaly_sensitivity = ?,
        duty_cycle_max_hours = ?,
        cooldown_period_min = ?,
        updated_at = ?
    WHERE id = 'SITE_DEFAULT';
    """, (
        new_idle_limit, new_sos_timeout, new_diesel_cost, new_burn_rate,
        new_sensitivity, new_duty_cycle, new_cooldown, now_utc
    ))
    conn.commit()

    updated = conn.execute("SELECT * FROM supervisor_thresholds WHERE id = 'SITE_DEFAULT';").fetchone()
    conn.close()

    result = dict(updated)

    # Immediately sync runtime anomaly_detector
    anomaly_detector.update_thresholds(
        diesel_cost_per_liter=result["diesel_cost_per_liter"],
        idle_burn_rate_l_per_hour=result["idle_burn_rate_l_per_hour"],
        idle_limit_min=result["idle_limit_min"],
        anomaly_sensitivity=result["anomaly_sensitivity"]
    )

    # Dynamic ML Recalibration on threshold update
    recal_result = recalibrate_model(
        adjustment_bias_min=(result["idle_limit_min"] - 40.0) * 0.1,
        sensitivity_factor=1.1 if result["anomaly_sensitivity"] == "strict" else 1.0,
        reason="Triggered by supervisor threshold update"
    )

    # Broadcast notification to supervisor and active cabins
    await notification_service.notify(
        channels=["websocket", "log"],
        target="all",
        message=f"Site thresholds dynamically updated: Idle limit {result['idle_limit_min']}m, SOS timeout {result['sos_timeout_sec']}s, Diesel ${result['diesel_cost_per_liter']}/L.",
        payload={"type": "thresholds_updated", "thresholds": result, "ml_recalibration": recal_result}
    )

    return result

# --- Dynamic ML Model Recalibration Endpoint ---
@app.post("/api/ml/recalibrate", response_model=RecalibrateResponse)
async def api_recalibrate_model(req: Optional[RecalibrateRequest] = None):
    """
    Dynamically recalibrates the task duration prediction model without server restarts.
    Adjusts baseline offsets, sensitivity factors, and evaluates active lift.
    """
    bias = req.idle_bias_adjustment_pct * 0.1 if req and req.idle_bias_adjustment_pct else 0.0
    sensitivity = req.sensitivity_factor if req and req.sensitivity_factor else 1.0
    sup_id = req.supervisor_id if req and req.supervisor_id else "SUP001"
    reason = req.reason if req and req.reason else "Supervisor operational realignment"

    result = recalibrate_model(
        adjustment_bias_min=bias,
        sensitivity_factor=sensitivity,
        retrain_from_db=bool(req and req.retrain_from_db),
        supervisor_id=sup_id,
        reason=reason
    )

    await notification_service.notify(
        channels=["websocket", "log"],
        target="supervisor",
        message=f"ML Model Recalibrated: {result['model_version']} (MAE: {result['recalibrated_mae']}m, Lift: {result['mae_lift_pct']}%).",
        payload={"type": "ml_model_recalibrated", "metrics": result}
    )

    return result

# --- OAuth 2.0 / JWT Authentication & RBAC Endpoints ---
@app.post("/api/auth/token", response_model=TokenResponse)
async def login_for_access_token(form_data: LoginRequest):
    """OAuth2 / JWT login with username and password."""
    user = auth_service.authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    return auth_service.issue_token_for_user(user)

@app.post("/api/auth/login", response_model=TokenResponse)
async def json_login(login: LoginRequest):
    """Direct JSON body authentication endpoint."""
    user = auth_service.authenticate_user(login.username, login.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return auth_service.issue_token_for_user(user)

@app.get("/api/auth/me", response_model=UserProfileResponse)
async def get_current_user_profile(authorization: Optional[str] = Header(None)):
    """Validates JWT bearer token and returns active user profile."""
    if not authorization or not authorization.startswith("Bearer "):
        # Fallback to James Vance demo profile for instant evaluation
        return auth_service.get_user_profile("OP1001")

    token = authorization.replace("Bearer ", "").strip()
    payload = auth_service.decode_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("user_id", "OP1001")
    return auth_service.get_user_profile(user_id)

@app.post("/api/auth/quick-token/{role}", response_model=TokenResponse)
async def get_quick_demo_token(role: str):
    """Issues instant, valid RFC 7519 HMAC-SHA256 JWT for 1-tap evaluator persona switching."""
    if role.lower() not in ["operator", "supervisor"]:
        raise HTTPException(status_code=400, detail="Role must be 'operator' or 'supervisor'")
    return auth_service.get_quick_token(role)

# --- Machine Duty-Cycle Enforcement & Cooldown Scheduling ---
def calculate_machine_duty_cycle(machine_id: str, conn=None) -> Dict[str, Any]:
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True

    try:
        query = """
        SELECT m.machine_id, m.model, m.continuous_operating_hours, m.last_cooldown_at,
               o.operator_id, o.name as operator_name
        FROM machines m
        LEFT JOIN operator_machine_assignments oma ON m.machine_id = oma.machine_id AND oma.is_active = 1
        LEFT JOIN operators o ON oma.operator_id = o.operator_id
        WHERE m.machine_id = ?;
        """
        row = conn.execute(query, (machine_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Machine not found")

        t_row = conn.execute("SELECT duty_cycle_max_hours, cooldown_period_min FROM supervisor_thresholds WHERE id = 'SITE_DEFAULT';").fetchone()
        duty_limit = float(t_row["duty_cycle_max_hours"]) if t_row and t_row["duty_cycle_max_hours"] else 4.0
        cooldown_min = int(t_row["cooldown_period_min"]) if t_row and t_row["cooldown_period_min"] else 15

        continuous_h = float(row["continuous_operating_hours"] or 0.0)

        cd_task = conn.execute("""
            SELECT task_id, status FROM tasks
            WHERE machine_id = ? AND task_type LIKE '%Cooldown%' AND status IN ('upcoming', 'in-progress')
            ORDER BY scheduled_start DESC LIMIT 1;
        """, (machine_id,)).fetchone()

        if cd_task:
            cooldown_status = "cooling_down"
            is_cooldown_required = False
            rec_action = f"Equipment hydraulic rest and thermal cooldown in progress (Task {cd_task['task_id']}). Systems settling."
            cd_task_id = cd_task["task_id"]
        elif continuous_h >= duty_limit:
            cooldown_status = "cooldown_recommended"
            is_cooldown_required = True
            rec_action = f"MANDATORY REST DUE: Machine has operated {continuous_h:.1f} consecutive hours (limit: {duty_limit:.1f}h). Recommended {cooldown_min} min hydraulic & engine cooldown."
            cd_task_id = None
        else:
            remaining_h = max(0.0, round(duty_limit - continuous_h, 1))
            cooldown_status = "nominal"
            is_cooldown_required = False
            rec_action = f"Nominal operations: {remaining_h:.1f} hours remaining before mandatory thermal rest window."
            cd_task_id = None

        return {
            "machine_id": row["machine_id"],
            "machine_model": row["model"],
            "operator_id": row["operator_id"],
            "operator_name": row["operator_name"],
            "continuous_engine_hours": continuous_h,
            "duty_limit_hours": duty_limit,
            "is_cooldown_required": is_cooldown_required,
            "cooldown_duration_min": cooldown_min,
            "cooldown_status": cooldown_status,
            "cooldown_task_id": cd_task_id,
            "recommended_action": rec_action,
            "last_cooldown_at": row["last_cooldown_at"]
        }
    finally:
        if close_conn:
            conn.close()

@app.get("/api/fleet/duty-cycles", response_model=List[MachineDutyCycleStatus])
def get_fleet_duty_cycles(machine_id: Optional[str] = None):
    """Retrieve duty cycle and cooldown status for all machines or a single machine."""
    conn = get_db_connection()
    if machine_id:
        machines = conn.execute("SELECT machine_id FROM machines WHERE machine_id = ?;", (machine_id,)).fetchall()
    else:
        machines = conn.execute("SELECT machine_id FROM machines ORDER BY machine_id ASC;").fetchall()
    
    results = [calculate_machine_duty_cycle(m["machine_id"], conn) for m in machines]
    conn.close()
    return results

@app.get("/api/operators/{operator_id}/duty-cycle", response_model=MachineDutyCycleStatus)
def get_operator_duty_cycle(operator_id: str):
    """Retrieve duty cycle status for the machine assigned to this operator."""
    conn = get_db_connection()
    row = conn.execute("""
        SELECT machine_id FROM operator_machine_assignments
        WHERE operator_id = ? AND is_active = 1
        LIMIT 1;
    """, (operator_id,)).fetchone()
    
    m_id = row["machine_id"] if row else "EXC001"
    status = calculate_machine_duty_cycle(m_id, conn)
    conn.close()
    return status

@app.post("/api/fleet/duty-cycles/{machine_id}/schedule-cooldown", response_model=MachineDutyCycleStatus)
async def schedule_machine_cooldown(machine_id: str, req: Optional[ScheduleCooldownRequest] = None):
    """Schedules an immediate equipment hydraulic and engine cooldown task."""
    conn = get_db_connection()
    t_row = conn.execute("SELECT cooldown_period_min FROM supervisor_thresholds WHERE id = 'SITE_DEFAULT';").fetchone()
    cooldown_min = (req.cooldown_duration_min if req and req.cooldown_duration_min else (t_row["cooldown_period_min"] if t_row else 15))

    now_dt = datetime.now(timezone.utc)
    end_dt = now_dt + timedelta(minutes=cooldown_min)
    task_id = f"CD-{uuid.uuid4().hex[:4].upper()}"

    oma = conn.execute("SELECT operator_id FROM operator_machine_assignments WHERE machine_id = ? AND is_active = 1;", (machine_id,)).fetchone()
    op_id = oma["operator_id"] if oma else "OP1001"

    m_row = conn.execute("SELECT current_zone FROM machines WHERE machine_id = ?;", (machine_id,)).fetchone()
    zone = m_row["current_zone"] if m_row and m_row["current_zone"] else "Zone A - Quarry North"

    notes_text = f"Scheduled equipment cooldown: {req.notes if req and req.notes else 'Mandatory hydraulic and transmission thermal resting window.'}"

    conn.execute("""
        INSERT INTO tasks (
            task_id, task_type, weather, operator_id, machine_id,
            scheduled_start, scheduled_end, status, location_zone, notes,
            weather_reapproval_required, weather_approved_by
        ) VALUES (?, 'Equipment Thermal Cooldown & Hydraulic Check', 'Clear', ?, ?, ?, ?, 'in-progress', ?, ?, 0, 'SUP001');
    """, (task_id, op_id, machine_id, now_dt.isoformat(), end_dt.isoformat(), zone, notes_text))

    conn.execute("""
        INSERT INTO task_time_predictions (task_id, estimated_time_min, predicted_time_min)
        VALUES (?, ?, ?);
    """, (task_id, cooldown_min, cooldown_min))
    conn.commit()

    updated_status = calculate_machine_duty_cycle(machine_id, conn)
    conn.close()

    await notification_service.notify(
        channels=["websocket", "log"],
        target="all",
        message=f"Mandatory cooldown scheduled for {machine_id} ({cooldown_min} min). Hydraulic rest initiated.",
        payload={"type": "duty_cycle_cooldown_scheduled", "machine_id": machine_id, "task_id": task_id, "status": updated_status}
    )

    return updated_status

@app.post("/api/fleet/duty-cycles/{machine_id}/complete-cooldown", response_model=MachineDutyCycleStatus)
async def complete_machine_cooldown(machine_id: str):
    """Completes active cooldown, resets consecutive operating hours to 0.0, and marks machine rest period as completed."""
    conn = get_db_connection()
    now_utc = datetime.now(timezone.utc).isoformat()

    cd_tasks = conn.execute("""
        SELECT task_id FROM tasks
        WHERE machine_id = ? AND task_type LIKE '%Cooldown%' AND status IN ('upcoming', 'in-progress');
    """, (machine_id,)).fetchall()

    conn.execute("""
        UPDATE tasks
        SET status = 'done'
        WHERE machine_id = ? AND task_type LIKE '%Cooldown%' AND status IN ('upcoming', 'in-progress');
    """, (machine_id,))

    for ct in cd_tasks:
        conn.execute("""
            UPDATE task_time_predictions
            SET actual_time_min = estimated_time_min,
                completion_timestamp = ?
            WHERE task_id = ?;
        """, (now_utc, ct["task_id"]))

    conn.execute("""
        UPDATE machines
        SET continuous_operating_hours = 0.0,
            last_cooldown_at = ?
        WHERE machine_id = ?;
    """, (now_utc, machine_id))
    conn.commit()

    updated_status = calculate_machine_duty_cycle(machine_id, conn)
    conn.close()

    await notification_service.notify(
        channels=["websocket", "log"],
        target="all",
        message=f"Equipment cooldown completed for {machine_id}. Continuous operating duty cycle reset to 0.0h.",
        payload={"type": "duty_cycle_cooldown_completed", "machine_id": machine_id, "status": updated_status}
    )

    return updated_status

# --- Proximity Distance (Haversine Formula) & Buddy Failover Helpers ---
def calculate_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Great Circle distance between two coordinates in meters using the Haversine formula."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 1)

def find_nearest_buddy_operator(distressed_machine_id: str, conn):
    """
    Finds the nearest active machine with an assigned operator to the distressed machine.
    Returns: dict with buddy machine and operator info plus distance in meters, or None.
    """
    distressed = conn.execute("""
        SELECT m.machine_id, m.model, m.latitude, m.longitude, m.current_zone,
               o.operator_id, o.name as operator_name
        FROM machines m
        LEFT JOIN operator_machine_assignments oma ON m.machine_id = oma.machine_id AND oma.is_active = 1
        LEFT JOIN operators o ON oma.operator_id = o.operator_id
        WHERE m.machine_id = ?;
    """, (distressed_machine_id,)).fetchone()

    if not distressed or distressed["latitude"] is None or distressed["longitude"] is None:
        return None

    d_op_id = distressed["operator_id"]
    query = """
        SELECT m.machine_id, m.model, m.latitude, m.longitude, m.current_zone,
               o.operator_id, o.name as operator_name
        FROM machines m
        INNER JOIN operator_machine_assignments oma ON m.machine_id = oma.machine_id AND oma.is_active = 1
        INNER JOIN operators o ON oma.operator_id = o.operator_id
        WHERE m.machine_id != ? AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
    """
    params = [distressed_machine_id]
    if d_op_id:
        query += " AND oma.operator_id != ?"
        params.append(d_op_id)

    candidates = conn.execute(query, tuple(params)).fetchall()

    if not candidates:
        return None

    best_candidate = None
    min_dist = float("inf")
    d_lat = distressed["latitude"]
    d_lon = distressed["longitude"]

    for c in candidates:
        dist = calculate_distance_meters(d_lat, d_lon, c["latitude"], c["longitude"])
        if dist < min_dist:
            min_dist = dist
            best_candidate = {
                "buddy_machine_id": c["machine_id"],
                "buddy_machine_model": c["model"],
                "buddy_operator_id": c["operator_id"],
                "buddy_operator_name": c["operator_name"],
                "distance_meters": dist,
                "distressed_operator_id": distressed["operator_id"] or "OP1001",
                "distressed_operator_name": distressed["operator_name"] or "Distressed Operator",
                "distressed_machine_id": distressed["machine_id"],
                "distressed_machine_model": distressed["model"],
                "distressed_zone": distressed["current_zone"] or "Worksite",
                "distressed_lat": d_lat,
                "distressed_lon": d_lon
            }

    return best_candidate

async def dispatch_buddy_failover(alert_id: str, conn=None):
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True

    # Check if failover already exists for this alert
    existing = conn.execute("SELECT * FROM buddy_failover_alerts WHERE alert_id = ?;", (alert_id,)).fetchone()
    if existing:
        row = conn.execute("""
        SELECT bfa.*,
               d_op.name as distressed_operator_name, d_m.model as distressed_machine_model,
               b_op.name as buddy_operator_name, b_m.model as buddy_machine_model
        FROM buddy_failover_alerts bfa
        LEFT JOIN operators d_op ON bfa.distressed_operator_id = d_op.operator_id
        LEFT JOIN machines d_m ON bfa.distressed_machine_id = d_m.machine_id
        LEFT JOIN operators b_op ON bfa.buddy_operator_id = b_op.operator_id
        LEFT JOIN machines b_m ON bfa.buddy_machine_id = b_m.machine_id
        WHERE bfa.alert_id = ?;
        """, (alert_id,)).fetchone()
        res = dict(row) if row else dict(existing)
        if close_conn:
            conn.close()
        return res

    alert = conn.execute("SELECT * FROM safety_alerts WHERE alert_id = ?;", (alert_id,)).fetchone()
    if not alert:
        if close_conn:
            conn.close()
        raise HTTPException(status_code=404, detail="Alert not found")

    nearest = find_nearest_buddy_operator(alert["machine_id"], conn)
    if not nearest:
        if close_conn:
            conn.close()
        return None

    failover_id = f"BUD-{uuid.uuid4().hex[:4].upper()}"
    now_utc = datetime.now(timezone.utc).isoformat()

    conn.execute("""
    INSERT INTO buddy_failover_alerts (
        failover_id, alert_id, distressed_operator_id, distressed_machine_id,
        distressed_zone, distressed_lat, distressed_lon,
        buddy_operator_id, buddy_machine_id, distance_meters,
        status, dispatched_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?);
    """, (
        failover_id, alert_id, nearest["distressed_operator_id"], nearest["distressed_machine_id"],
        nearest["distressed_zone"], nearest["distressed_lat"], nearest["distressed_lon"],
        nearest["buddy_operator_id"], nearest["buddy_machine_id"], nearest["distance_meters"],
        now_utc, f"Proximity-based buddy failover: Nearest unit {nearest['distance_meters']}m away."
    ))
    conn.commit()

    row = conn.execute("""
    SELECT bfa.*,
           d_op.name as distressed_operator_name, d_m.model as distressed_machine_model,
           b_op.name as buddy_operator_name, b_m.model as buddy_machine_model
    FROM buddy_failover_alerts bfa
    LEFT JOIN operators d_op ON bfa.distressed_operator_id = d_op.operator_id
    LEFT JOIN machines d_m ON bfa.distressed_machine_id = d_m.machine_id
    LEFT JOIN operators b_op ON bfa.buddy_operator_id = b_op.operator_id
    LEFT JOIN machines b_m ON bfa.buddy_machine_id = b_m.machine_id
    WHERE bfa.failover_id = ?;
    """, (failover_id,)).fetchone()

    result = dict(row)

    if close_conn:
        conn.close()

    # Notify buddy operator via WebSocket & log
    await notification_service.notify(
        channels=["websocket", "log"],
        target=nearest["buddy_operator_id"],
        message=f"CRITICAL PROXIMITY ALERT: Nearby operator {nearest['distressed_operator_name']} ({nearest['distressed_machine_model']}) has an unacknowledged emergency! You are {nearest['distance_meters']}m away. Please assist immediately.",
        payload={"type": "buddy_failover", "failover": result}
    )

    # Notify supervisor of buddy failover dispatch
    await notification_service.notify(
        channels=["websocket", "log"],
        target="supervisor",
        message=f"Proximity buddy failover dispatched to {nearest['buddy_operator_name']} ({nearest['buddy_machine_id']}) — {nearest['distance_meters']}m from incident.",
        payload={"type": "buddy_failover_dispatched", "failover": result}
    )

    return result

# --- Safety Alerts, SOS Flow, & Escalation ---
@app.get("/api/alerts", response_model=List[SafetyAlertResponse])
def get_safety_alerts():
    conn = get_db_connection()
    query = """
    SELECT sa.*, o.name as operator_name
    FROM safety_alerts sa
    LEFT JOIN operators o ON sa.operator_id = o.operator_id
    ORDER BY sa.triggered_at DESC;
    """
    rows = conn.execute(query).fetchall()

    alerts_list = []
    for r in rows:
        alert_dict = dict(r)
        # Check for buddy failover
        b_row = conn.execute("""
        SELECT bfa.*,
               d_op.name as distressed_operator_name, d_m.model as distressed_machine_model,
               b_op.name as buddy_operator_name, b_m.model as buddy_machine_model
        FROM buddy_failover_alerts bfa
        LEFT JOIN operators d_op ON bfa.distressed_operator_id = d_op.operator_id
        LEFT JOIN machines d_m ON bfa.distressed_machine_id = d_m.machine_id
        LEFT JOIN operators b_op ON bfa.buddy_operator_id = b_op.operator_id
        LEFT JOIN machines b_m ON bfa.buddy_machine_id = b_m.machine_id
        WHERE bfa.alert_id = ?;
        """, (alert_dict["alert_id"],)).fetchone()
        if b_row:
            alert_dict["buddy_failover"] = dict(b_row)
        else:
            alert_dict["buddy_failover"] = None
        alerts_list.append(alert_dict)

    conn.close()
    return alerts_list

def format_correlation_row(row: Any, conn=None) -> Dict[str, Any]:
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True

    try:
        raw_alerts = row["alert_ids"]
        raw_ops = row["operator_ids"]
        raw_machines = row["machine_ids"]

        alert_ids = json.loads(raw_alerts) if isinstance(raw_alerts, str) else (raw_alerts or [])
        operator_ids = json.loads(raw_ops) if isinstance(raw_ops, str) else (raw_ops or [])
        machine_ids = json.loads(raw_machines) if isinstance(raw_machines, str) else (raw_machines or [])

        operator_names = []
        if operator_ids:
            ph = ",".join(["?"] * len(operator_ids))
            op_rows = conn.execute(f"SELECT operator_id, name FROM operators WHERE operator_id IN ({ph});", tuple(operator_ids)).fetchall()
            names_map = {r["operator_id"]: r["name"] for r in op_rows}
            operator_names = [names_map.get(oid, oid) for oid in operator_ids]

        machine_models = []
        if machine_ids:
            ph = ",".join(["?"] * len(machine_ids))
            m_rows = conn.execute(f"SELECT machine_id, model FROM machines WHERE machine_id IN ({ph});", tuple(machine_ids)).fetchall()
            models_map = {r["machine_id"]: r["model"] for r in m_rows}
            machine_models = [models_map.get(mid, mid) for mid in machine_ids]

        return {
            "correlation_id": row["correlation_id"],
            "location_zone": row["location_zone"],
            "alert_ids": alert_ids,
            "operator_ids": operator_ids,
            "operator_names": operator_names,
            "machine_ids": machine_ids,
            "machine_models": machine_models,
            "operator_count": row["operator_count"],
            "first_triggered_at": row["first_triggered_at"],
            "latest_triggered_at": row["latest_triggered_at"],
            "status": row["status"],
            "evacuation_ordered_at": row["evacuation_ordered_at"],
            "notes": row["notes"]
        }
    finally:
        if close_conn:
            conn.close()

async def evaluate_sos_correlation(alert_id: str, machine_id: str, operator_id: str, conn=None) -> Optional[str]:
    """
    Evaluates whether this safety alert forms a multi-operator SOS correlation cluster
    (>= 2 distinct operators in the same zone within 5 minutes / 300 seconds).
    If so, updates or creates an incident cluster and notifies supervisor & cabin units.
    """
    close_conn = False
    if conn is None:
        conn = get_db_connection()
        close_conn = True

    try:
        # Determine machine zone
        m_row = conn.execute("SELECT current_zone FROM machines WHERE machine_id = ?;", (machine_id,)).fetchone()
        zone = (m_row["current_zone"] if m_row and m_row["current_zone"] else "Zone A - Quarry North")

        now_dt = datetime.now(timezone.utc)
        now_utc = now_dt.isoformat()

        # Check for open correlation cluster in this zone
        corr_row = conn.execute(
            "SELECT * FROM sos_correlations WHERE location_zone = ? AND status IN ('active_emergency', 'evacuation_ordered') ORDER BY latest_triggered_at DESC LIMIT 1;",
            (zone,)
        ).fetchone()

        if corr_row:
            alert_ids = json.loads(corr_row["alert_ids"])
            operator_ids = json.loads(corr_row["operator_ids"])
            machine_ids = json.loads(corr_row["machine_ids"])

            if alert_id not in alert_ids:
                alert_ids.append(alert_id)
            if operator_id not in operator_ids:
                operator_ids.append(operator_id)
            if machine_id not in machine_ids:
                machine_ids.append(machine_id)

            op_count = len(operator_ids)
            conn.execute("""
                UPDATE sos_correlations
                SET alert_ids = ?, operator_ids = ?, machine_ids = ?,
                    operator_count = ?, latest_triggered_at = ?,
                    notes = ?
                WHERE correlation_id = ?;
            """, (
                json.dumps(alert_ids),
                json.dumps(operator_ids),
                json.dumps(machine_ids),
                op_count,
                now_utc,
                f"Multi-operator emergency in {zone} ({op_count} operators affected)",
                corr_row["correlation_id"]
            ))
            conn.commit()

            corr_id = corr_row["correlation_id"]
            await notification_service.notify(
                channels=["websocket", "log"],
                target="all",
                message=f"REGIONAL EMERGENCY ESCALATION: Additional alert {alert_id} in {zone}! Total {op_count} operators distressed.",
                payload={
                    "type": "regional_emergency",
                    "correlation_id": corr_id,
                    "location_zone": zone,
                    "operator_count": op_count,
                    "status": corr_row["status"]
                }
            )
            return corr_id

        # No open correlation: evaluate recent alerts in same zone (within 300 seconds)
        recent_alerts = conn.execute("""
            SELECT sa.alert_id, sa.machine_id, sa.operator_id, sa.triggered_at, m.current_zone
            FROM safety_alerts sa
            LEFT JOIN machines m ON sa.machine_id = m.machine_id
            WHERE sa.status IN ('active', 'escalated', 'acknowledged')
            ORDER BY sa.triggered_at DESC;
        """).fetchall()

        matched_alerts = []
        distinct_ops = set()
        distinct_machines = set()
        alert_timestamps = []

        for r in recent_alerts:
            r_zone = r["current_zone"] or "Zone A - Quarry North"
            if r_zone != zone:
                continue
            try:
                trig_dt = datetime.fromisoformat(r["triggered_at"].replace("Z", "+00:00"))
                diff_sec = (now_dt - trig_dt).total_seconds()
                if diff_sec <= 300:
                    matched_alerts.append(r["alert_id"])
                    distinct_ops.add(r["operator_id"])
                    distinct_machines.add(r["machine_id"])
                    alert_timestamps.append(r["triggered_at"])
            except Exception:
                pass

        if len(distinct_ops) >= 2:
            corr_id = f"CORR-{uuid.uuid4().hex[:6].upper()}"
            alert_timestamps.sort()
            first_trig = alert_timestamps[0] if alert_timestamps else now_utc
            latest_trig = alert_timestamps[-1] if alert_timestamps else now_utc

            conn.execute("""
                INSERT INTO sos_correlations (
                    correlation_id, location_zone, alert_ids, operator_ids, machine_ids,
                    operator_count, first_triggered_at, latest_triggered_at, status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active_emergency', ?);
            """, (
                corr_id,
                zone,
                json.dumps(matched_alerts),
                json.dumps(list(distinct_ops)),
                json.dumps(list(distinct_machines)),
                len(distinct_ops),
                first_trig,
                latest_trig,
                f"Regional emergency detected: {len(distinct_ops)} operators triggered SOS in {zone} within 5 minutes."
            ))
            conn.commit()

            await notification_service.notify(
                channels=["websocket", "log"],
                target="all",
                message=f"REGIONAL EMERGENCY: {len(distinct_ops)} operator alarms detected in {zone}! Multi-unit distress incident opened.",
                payload={
                    "type": "regional_emergency",
                    "correlation_id": corr_id,
                    "location_zone": zone,
                    "operator_count": len(distinct_ops),
                    "status": "active_emergency"
                }
            )
            return corr_id

        return None
    finally:
        if close_conn:
            conn.close()

@app.post("/api/alerts/trigger", response_model=SafetyAlertResponse)
async def trigger_safety_alert(alert_in: SafetyAlertCreate):
    conn = get_db_connection()
    alert_id = f"ALT-{uuid.uuid4().hex[:4].upper()}"
    now_utc = datetime.now(timezone.utc).isoformat()

    # Determine supervisor
    sup_id = alert_in.supervisor_id
    if not sup_id:
        try:
            op = conn.execute("SELECT assigned_supervisor_id FROM operators WHERE operator_id = ?;", (alert_in.operator_id,)).fetchone()
            sup_id = (op["assigned_supervisor_id"] if op and op["assigned_supervisor_id"] else "SUP001")
        except Exception:
            sup_id = "SUP001"

    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO safety_alerts (alert_id, machine_id, operator_id, supervisor_id, alert_type, triggered_at, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?);
    """, (alert_id, alert_in.machine_id, alert_in.operator_id, sup_id, alert_in.alert_type, now_utc, alert_in.notes))

    # Also record alert in telemetry_log and increment safety_violations_ytd in operators
    try:
        cursor.execute("""
        INSERT INTO telemetry_log (ts, machine_id, operator_id, engine_hours, fuel_used_l, load_cycles, idling_time_min, seatbelt_status, safety_alert_triggered)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (now_utc, alert_in.machine_id, alert_in.operator_id, 4.5, 42.0, 10, 22.0, 'Unfastened', 1))

        cursor.execute("""
        UPDATE operators
        SET safety_violations_ytd = safety_violations_ytd + 1
        WHERE operator_id = ?;
        """, (alert_in.operator_id,))
    except Exception as e:
        print(f"[Alert Telemetry Sync Notice] {e}")

    conn.commit()

    # Evaluate Multi-Operator SOS Correlation (>=2 alerts in same zone within 5m)
    try:
        await evaluate_sos_correlation(alert_id, alert_in.machine_id, alert_in.operator_id, conn)
    except Exception as err:
        print(f"[SOS Correlation Evaluation Notice] {err}")

    alert_row = conn.execute("SELECT sa.*, o.name as operator_name FROM safety_alerts sa LEFT JOIN operators o ON sa.operator_id = o.operator_id WHERE sa.alert_id = ?;", (alert_id,)).fetchone()
    
    # Query dynamic SOS timeout duration
    sos_timeout = 45
    try:
        t_row = conn.execute("SELECT sos_timeout_sec FROM supervisor_thresholds WHERE id = 'SITE_DEFAULT';").fetchone()
        if t_row and t_row["sos_timeout_sec"]:
            sos_timeout = int(t_row["sos_timeout_sec"])
    except Exception:
        pass

    conn.close()

    # Send in-app WebSocket alert to cabin & supervisor
    await notification_service.notify(
        channels=["websocket", "log"],
        target="all",
        message=f"SAFETY HAZARD DETECTED: {alert_in.alert_type} on {alert_in.machine_id}",
        payload={"alert_id": alert_id, "alert_type": alert_in.alert_type, "status": "active", "requires_ack_sec": sos_timeout}
    )

    return dict(alert_row)

@app.post("/api/operators/{operator_id}/fatigue-event", response_model=FatigueEventResponse)
async def log_fatigue_event(operator_id: str, event_in: FatigueEventCreate):
    """
    Logs an autonomous in-cab computer vision eye closure / microsleep event.
    Automatically generates a high-priority safety alert and notifies supervisor console.
    """
    conn = get_db_connection()
    event_id = f"FAT-{uuid.uuid4().hex[:4].upper()}"
    alert_id = f"ALT-{uuid.uuid4().hex[:4].upper()}"
    now_utc = datetime.now(timezone.utc).isoformat()
    machine_id = event_in.machine_id or "EXC001"
    duration = event_in.eye_closure_duration_sec

    # Find operator details
    op = conn.execute("SELECT name, assigned_supervisor_id FROM operators WHERE operator_id = ?;", (operator_id,)).fetchone()
    op_name = op["name"] if op else operator_id
    sup_id = op["assigned_supervisor_id"] if op and op["assigned_supervisor_id"] else "SUP001"

    alert_notes = event_in.notes or f"Autonomous in-cab camera detected prolonged eye closure ({duration:.1f}s >= 2.0s threshold). Cabin wake-up siren sounded."

    # Insert into safety_alerts
    conn.execute("""
        INSERT INTO safety_alerts (alert_id, machine_id, operator_id, supervisor_id, alert_type, triggered_at, status, notes)
        VALUES (?, ?, ?, ?, 'Operator Fatigue / Microsleep Detected', ?, 'active', ?);
    """, (alert_id, machine_id, operator_id, sup_id, now_utc, alert_notes))

    # Increment operator safety violations count
    conn.execute("""
        UPDATE operators
        SET safety_violations_ytd = safety_violations_ytd + 1
        WHERE operator_id = ?;
    """, (operator_id,))

    # Insert telemetry violation record
    try:
        conn.execute("""
            INSERT INTO telemetry_log (ts, machine_id, operator_id, engine_hours, fuel_used_l, load_cycles, idling_time_min, seatbelt_status, safety_alert_triggered)
            VALUES (?, ?, ?, 4.5, 42.0, 10, 22.0, 'Unfastened', 1);
        """, (now_utc, machine_id, operator_id))
    except Exception as e:
        print(f"[Fatigue Telemetry Sync Notice] {e}")

    conn.commit()
    conn.close()

    # Broadcast notification to supervisor & fleet cabins
    await notification_service.notify(
        channels=["websocket", "log"],
        target="supervisor",
        message=f"CRITICAL SAFETY WARNING: Fatigue / microsleep event on {machine_id} by {op_name} (Eyes closed {duration:.1f}s).",
        payload={
            "type": "operator_fatigue_alert",
            "event_id": event_id,
            "alert_id": alert_id,
            "operator_id": operator_id,
            "operator_name": op_name,
            "machine_id": machine_id,
            "duration_sec": duration,
            "status": "active"
        }
    )

    return {
        "event_id": event_id,
        "alert_id": alert_id,
        "operator_id": operator_id,
        "operator_name": op_name,
        "machine_id": machine_id,
        "eye_closure_duration_sec": duration,
        "recorded_at": now_utc,
        "status": "active",
        "notes": alert_notes
    }

@app.post("/api/alerts/{alert_id}/acknowledge", response_model=SafetyAlertResponse)
async def acknowledge_safety_alert(alert_id: str, ack: AlertAcknowledgeRequest):
    conn = get_db_connection()
    alert = conn.execute("SELECT * FROM safety_alerts WHERE alert_id = ?;", (alert_id,)).fetchone()
    if not alert:
        conn.close()
        raise HTTPException(status_code=404, detail="Alert not found")

    triggered_dt = datetime.fromisoformat(alert["triggered_at"].replace("Z", "+00:00"))
    now_dt = datetime.now(timezone.utc)
    response_sec = max(0.0, round((now_dt - triggered_dt).total_seconds(), 1))

    now_utc = now_dt.isoformat()
    note_text = f"Acknowledged by operator: {ack.notes or 'Cabin Safe Acknowledged'}"

    conn.execute("""
    UPDATE safety_alerts
    SET acknowledged_at = ?, response_time_sec = ?, status = 'acknowledged', notes = ?
    WHERE alert_id = ?;
    """, (now_utc, response_sec, note_text, alert_id))
    conn.commit()

    updated = conn.execute("SELECT sa.*, o.name as operator_name FROM safety_alerts sa LEFT JOIN operators o ON sa.operator_id = o.operator_id WHERE sa.alert_id = ?;", (alert_id,)).fetchone()
    conn.close()

    await notification_service.notify(
        channels=["websocket", "log"],
        target="supervisor",
        message=f"Alert {alert_id} acknowledged by operator {ack.operator_id} in {response_sec}s",
        payload={"alert_id": alert_id, "status": "acknowledged", "response_time_sec": response_sec}
    )

    return dict(updated)

@app.post("/api/alerts/{alert_id}/escalate", response_model=SafetyAlertResponse)
async def escalate_safety_alert(alert_id: str):
    conn = get_db_connection()
    alert = conn.execute("SELECT * FROM safety_alerts WHERE alert_id = ?;", (alert_id,)).fetchone()
    if not alert:
        conn.close()
        raise HTTPException(status_code=404, detail="Alert not found")

    now_utc = datetime.now(timezone.utc).isoformat()
    escalated_notes = f"Auto-escalated to supervisor {alert['supervisor_id']}. Unacknowledged within timeout."

    conn.execute("""
    UPDATE safety_alerts
    SET escalated_at = ?, status = 'escalated', notes = ?
    WHERE alert_id = ?;
    """, (now_utc, escalated_notes, alert_id))
    conn.commit()

    updated = conn.execute("SELECT sa.*, o.name as operator_name FROM safety_alerts sa LEFT JOIN operators o ON sa.operator_id = o.operator_id WHERE sa.alert_id = ?;", (alert_id,)).fetchone()
    conn.close()

    # Dispatches through websocket and stubs for SMS & email
    await notification_service.notify(
        channels=["websocket", "log", "sms", "email"],
        target=alert["supervisor_id"],
        message=f"CRITICAL ESCALATION: Safety hazard {alert['alert_type']} on {alert['machine_id']} UNACKNOWLEDGED by operator!",
        payload={"alert_id": alert_id, "status": "escalated"}
    )

    # Proximity-based buddy failover: Dispatch to nearest active operator
    failover_info = await dispatch_buddy_failover(alert_id)
    updated_dict = dict(updated)
    if failover_info:
        updated_dict["buddy_failover"] = failover_info

    return updated_dict

# --- Proximity-Based Buddy Failover Endpoints ---
@app.post("/api/alerts/{alert_id}/buddy-failover", response_model=Optional[BuddyFailoverResponse])
async def trigger_buddy_failover_endpoint(alert_id: str):
    """Explicitly triggers or recalculates proximity-based buddy failover for an alert."""
    res = await dispatch_buddy_failover(alert_id)
    return res

@app.get("/api/operators/{operator_id}/buddy-alerts", response_model=List[BuddyFailoverResponse])
def get_operator_buddy_alerts(operator_id: str):
    """Retrieve all pending or active buddy failover alerts assigned to this operator."""
    conn = get_db_connection()
    query = """
    SELECT bfa.*,
           d_op.name as distressed_operator_name, d_m.model as distressed_machine_model,
           b_op.name as buddy_operator_name, b_m.model as buddy_machine_model
    FROM buddy_failover_alerts bfa
    LEFT JOIN operators d_op ON bfa.distressed_operator_id = d_op.operator_id
    LEFT JOIN machines d_m ON bfa.distressed_machine_id = d_m.machine_id
    LEFT JOIN operators b_op ON bfa.buddy_operator_id = b_op.operator_id
    LEFT JOIN machines b_m ON bfa.buddy_machine_id = b_m.machine_id
    WHERE bfa.buddy_operator_id = ? AND bfa.status IN ('pending', 'en_route', 'radio_contacted')
    ORDER BY bfa.dispatched_at DESC;
    """
    rows = conn.execute(query, (operator_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/buddy-alerts/{failover_id}/respond", response_model=BuddyFailoverResponse)
async def respond_to_buddy_alert(failover_id: str, req: BuddyAlertResponseRequest):
    """Enables the buddy operator to confirm they are en-route, have established radio contact, or resolved the incident."""
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM buddy_failover_alerts WHERE failover_id = ?;", (failover_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Buddy failover alert not found")

    now_utc = datetime.now(timezone.utc).isoformat()
    note_append = f" | [Status: {req.status.upper()} - {req.notes or 'Cabin responding'}]"
    new_notes = (row["notes"] or "") + note_append

    conn.execute("""
    UPDATE buddy_failover_alerts
    SET status = ?, acknowledged_at = ?, notes = ?
    WHERE failover_id = ?;
    """, (req.status, now_utc, new_notes, failover_id))
    conn.commit()

    updated = conn.execute("""
    SELECT bfa.*,
           d_op.name as distressed_operator_name, d_m.model as distressed_machine_model,
           b_op.name as buddy_operator_name, b_m.model as buddy_machine_model
    FROM buddy_failover_alerts bfa
    LEFT JOIN operators d_op ON bfa.distressed_operator_id = d_op.operator_id
    LEFT JOIN machines d_m ON bfa.distressed_machine_id = d_m.machine_id
    LEFT JOIN operators b_op ON bfa.buddy_operator_id = b_op.operator_id
    LEFT JOIN machines b_m ON bfa.buddy_machine_id = b_m.machine_id
    WHERE bfa.failover_id = ?;
    """, (failover_id,)).fetchone()
    conn.close()

    result = dict(updated)

    await notification_service.notify(
        channels=["websocket", "log"],
        target="all",
        message=f"Buddy responder {result.get('buddy_operator_name')} updated failover status to {req.status.upper()}.",
        payload={"failover_id": failover_id, "status": req.status}
    )

    return result

@app.get("/api/buddy-alerts", response_model=List[BuddyFailoverResponse])
def get_all_buddy_alerts():
    """Retrieve all buddy failovers for supervisor tracking."""
    conn = get_db_connection()
    query = """
    SELECT bfa.*,
           d_op.name as distressed_operator_name, d_m.model as distressed_machine_model,
           b_op.name as buddy_operator_name, b_m.model as buddy_machine_model
    FROM buddy_failover_alerts bfa
    LEFT JOIN operators d_op ON bfa.distressed_operator_id = d_op.operator_id
    LEFT JOIN machines d_m ON bfa.distressed_machine_id = d_m.machine_id
    LEFT JOIN operators b_op ON bfa.buddy_operator_id = b_op.operator_id
    LEFT JOIN machines b_m ON bfa.buddy_machine_id = b_m.machine_id
    ORDER BY bfa.dispatched_at DESC;
    """
    rows = conn.execute(query).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# --- Multi-Operator SOS Correlation & Mass Evacuation Endpoints ---
@app.get("/api/fleet/sos-correlations", response_model=List[SosCorrelationResponse])
def get_sos_correlations(
    zone: Optional[str] = None,
    status: Optional[str] = None
):
    """Retrieve all SOS incident correlations, optionally filtered by zone or status."""
    conn = get_db_connection()
    query = "SELECT * FROM sos_correlations"
    params = []
    conditions = []
    if zone:
        conditions.append("location_zone = ?")
        params.append(zone)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY latest_triggered_at DESC;"

    rows = conn.execute(query, tuple(params)).fetchall()
    results = [format_correlation_row(r, conn) for r in rows]
    conn.close()
    return results

@app.post("/api/fleet/sos-correlations/{correlation_id}/evacuate", response_model=SosCorrelationResponse)
async def order_mass_evacuation(correlation_id: str, req: EvacuationOrderRequest):
    """Dispatches a site/zone-wide mass evacuation order directing all cabin units to cease operations and head to muster points."""
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM sos_correlations WHERE correlation_id = ?;", (correlation_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="SOS Correlation incident not found")

    now_utc = datetime.now(timezone.utc).isoformat()
    muster_point = req.muster_zone or "Muster Point Charlie (Highway Access Gate)"
    updated_notes = f"MASS EVACUATION ORDERED by Site Supervisor at {now_utc}. Designated Muster: {muster_point}. Notes: {req.notes or 'Cease operations, lock hydraulics, proceed on foot/transport to muster point.'}"

    conn.execute("""
        UPDATE sos_correlations
        SET status = 'evacuation_ordered',
            evacuation_ordered_at = ?,
            notes = ?
        WHERE correlation_id = ?;
    """, (now_utc, updated_notes, correlation_id))
    conn.commit()

    updated = conn.execute("SELECT * FROM sos_correlations WHERE correlation_id = ?;", (correlation_id,)).fetchone()
    result = format_correlation_row(updated, conn)
    conn.close()

    # Broadcast Critical Mass Evacuation Order across WebSocket, radio & sirens
    await notification_service.notify(
        channels=["websocket", "log", "sms"],
        target="all",
        message=f"CRITICAL DIRECTIVE: SITE MASS EVACUATION ORDERED for {result['location_zone']}! Muster at {muster_point}.",
        payload={
            "type": "mass_evacuation_order",
            "correlation_id": correlation_id,
            "location_zone": result["location_zone"],
            "muster_zone": muster_point,
            "status": "evacuation_ordered",
            "operator_count": result["operator_count"]
        }
    )

    return result

@app.post("/api/fleet/sos-correlations/{correlation_id}/resolve", response_model=SosCorrelationResponse)
async def resolve_sos_correlation(correlation_id: str, notes: Optional[str] = "Incident contained and resolved by site supervisor."):
    """Marks a multi-operator emergency correlation as resolved."""
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM sos_correlations WHERE correlation_id = ?;", (correlation_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="SOS Correlation incident not found")

    now_utc = datetime.now(timezone.utc).isoformat()
    updated_notes = (row["notes"] or "") + f" | [RESOLVED at {now_utc}: {notes}]"

    conn.execute("""
        UPDATE sos_correlations
        SET status = 'resolved',
            notes = ?
        WHERE correlation_id = ?;
    """, (updated_notes, correlation_id))
    conn.commit()

    updated = conn.execute("SELECT * FROM sos_correlations WHERE correlation_id = ?;", (correlation_id,)).fetchone()
    result = format_correlation_row(updated, conn)
    conn.close()

    await notification_service.notify(
        channels=["websocket", "log"],
        target="all",
        message=f"Regional emergency in {result['location_zone']} has been CONTAINED AND RESOLVED. Normal site protocol resumed.",
        payload={
            "type": "incident_resolved",
            "correlation_id": correlation_id,
            "status": "resolved"
        }
    )

    return result

# --- Incident Logging (Manual & Hands-free Voice) ---
@app.get("/api/incidents", response_model=List[IncidentResponse])
def get_incidents():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM incidents ORDER BY logged_at DESC;").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/incidents", response_model=IncidentResponse)
async def create_incident(inc: IncidentCreate):
    conn = get_db_connection()
    inc_id = f"INC-{uuid.uuid4().hex[:4].upper()}"
    now_utc = datetime.now(timezone.utc).isoformat()

    conn.execute("""
    INSERT INTO incidents (incident_id, machine_id, operator_id, logged_at, incident_text, severity, is_voice_logged)
    VALUES (?, ?, ?, ?, ?, ?, ?);
    """, (inc_id, inc.machine_id, inc.operator_id, now_utc, inc.incident_text, inc.severity, 1 if inc.is_voice_logged else 0))
    conn.commit()

    row = conn.execute("SELECT * FROM incidents WHERE incident_id = ?;", (inc_id,)).fetchone()
    conn.close()

    await notification_service.notify(
        channels=["websocket", "log"],
        target="supervisor",
        message=f"Incident Logged on {inc.machine_id}: {inc.incident_text[:60]}...",
        payload={"incident_id": inc_id, "severity": inc.severity}
    )

    return dict(row)

# --- Task Time Estimation ML Pipeline Endpoints ---
@app.post("/predict/task-time", response_model=TaskTimePredictResponse)
@app.post("/api/predict/task-time", response_model=TaskTimePredictResponse)
def predict_task_time_endpoint(req: TaskTimePredictRequest):
    """
    Primary CAT Co-Pilot Task Duration Prediction Endpoint.
    Accepts task_type, operator_id, machine_id, coordinates (lat/lon), and scheduled_start.
    Computes engineered machine health & operator reliability scores,
    fetches real-time weather & elevation terrain APIs, and returns predicted duration
    with top driving factor impacts (in minutes).
    """
    return predict_task_duration(
        task_type=req.task_type,
        operator_id=req.operator_id,
        machine_id=req.machine_id,
        latitude=req.latitude,
        longitude=req.longitude,
        scheduled_start=req.scheduled_start,
        estimated_time_min=req.estimated_time_min
    )

@app.get("/api/ml/evaluation-report")
def get_ml_evaluation_report():
    """Returns the trained model's MAE/RMSE benchmark and feature importance comparison vs baseline."""
    report_path = Path(__file__).parent / "ml" / "artifacts" / "evaluation_report.json"
    if report_path.exists():
        import json
        with open(report_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"status": "Model not yet trained"}

@app.get("/api/ml/dataset-stats")
def get_dataset_stats():
    """Returns live counts from the PostgreSQL / SQLite database to confirm dynamic growth."""
    conn = get_db_connection()
    try:
        tasks_count = conn.execute("SELECT COUNT(*) FROM task_duration_log;").fetchone()[0]
        ops_count = conn.execute("SELECT COUNT(*) FROM operators;").fetchone()[0]
        mach_count = conn.execute("SELECT COUNT(*) FROM machines;").fetchone()[0]
        telem_count = conn.execute("SELECT COUNT(*) FROM telemetry_log;").fetchone()[0]
        conn.close()
        return {
            "database_tables": {
                "task_duration_log": tasks_count,
                "telemetry_log": telem_count,
                "operators": ops_count,
                "machines": mach_count
            },
            "status": "active"
        }
    except Exception as e:
        conn.close()
        return {"error": str(e)}

@app.post("/api/predict-time")
def predict_task_duration_compat(payload: Dict[str, Any]):
    """Backward compatibility wrapper for legacy callers."""
    return predict_task_duration(
        task_type=payload.get("task_type", "Earth Excavation"),
        operator_id=payload.get("operator_id", "OP1001"),
        machine_id=payload.get("machine_id", "EXC001"),
        latitude=float(payload.get("latitude", 40.7128)),
        longitude=float(payload.get("longitude", -74.0060)),
        scheduled_start=payload.get("scheduled_start", datetime.now(timezone.utc).isoformat()),
        estimated_time_min=float(payload.get("estimated_time_min", 45.0))
    )

# --- Fleet GPS, Geofencing, & Real-Time Tracking ---
@app.get("/api/fleet/geofences", response_model=List[GeofenceZoneResponse])
def get_geofences():
    """Retrieve all defined worksite geofences, safety buffers, and restricted danger zones."""
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM geofence_zones;").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/fleet/gps/traces", response_model=List[GpsTracePoint])
def get_gps_traces(machine_id: Optional[str] = None):
    """Retrieve breadcrumb trace points showing historical movement path of heavy equipment."""
    conn = get_db_connection()
    if machine_id:
        rows = conn.execute("SELECT * FROM machine_gps_traces WHERE machine_id = ? ORDER BY timestamp ASC;", (machine_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM machine_gps_traces ORDER BY timestamp ASC;").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/fleet/gps/anomalies", response_model=List[GpsAnomalyReport])
def get_gps_anomalies():
    """
    Evaluates current positions & traces to highlight anomalous events to the supervisor:
    1. Geofence Breaches (machine outside its authorized working boundary).
    2. Intrusion into Blast Danger Perimeters.
    3. Route displacements during unauthorized hours.
    """
    conn = get_db_connection()
    query = """
    SELECT m.*, o.name as operator_name
    FROM machines m
    LEFT JOIN operator_machine_assignments oma ON m.machine_id = oma.machine_id AND oma.is_active = 1
    LEFT JOIN operators o ON oma.operator_id = o.operator_id;
    """
    machines = conn.execute(query).fetchall()
    traces = conn.execute("SELECT * FROM machine_gps_traces WHERE is_anomaly = 1 ORDER BY timestamp DESC;").fetchall()
    conn.close()

    anomalies = []
    for m in machines:
        if m["is_geofence_breached"] or "Blast" in (m["current_zone"] or ""):
            anomalies.append(GpsAnomalyReport(
                machine_id=m["machine_id"],
                machine_model=m["model"],
                operator_name=m["operator_name"],
                current_zone=m["current_zone"] or "Unknown",
                authorized_zone=m["authorized_zone"] or "Zone A - Quarry North",
                anomaly_type="Geofence Boundary Breach & Danger Zone Intrusion",
                anomaly_description=f"{m['model']} ({m['machine_id']}) moved into restricted '{m['current_zone']}' without supervisor clearance! Authorized work zone was '{m['authorized_zone']}'.",
                latitude=m["latitude"] or 40.7182,
                longitude=m["longitude"] or -74.0088,
                timestamp=m["last_gps_update"] or datetime.now(timezone.utc).isoformat(),
                severity="critical"
            ))

    for t in traces:
        anomalies.append(GpsAnomalyReport(
            machine_id=t["machine_id"],
            machine_model=t["machine_id"],
            operator_name=None,
            current_zone="Restricted Route",
            authorized_zone="Assigned Worksite",
            anomaly_type="Unexpected Path Displacement",
            anomaly_description=t["anomaly_reason"] or "Route displacement detected outside normal operating boundaries",
            latitude=t["latitude"],
            longitude=t["longitude"],
            timestamp=t["timestamp"],
            severity="high"
        ))

    return anomalies

# --- In-Cab Operator Geofence Proximity Warning Engine ---
def calculate_geofence_proximity(machine_id: str, conn):
    """
    Computes real-time proximity between an active machine and restricted worksite perimeters.
    Returns: GeofenceProximityStatus dict.
    """
    machine = conn.execute("""
        SELECT m.*, oma.operator_id
        FROM machines m
        LEFT JOIN operator_machine_assignments oma ON m.machine_id = oma.machine_id AND oma.is_active = 1
        WHERE m.machine_id = ?;
    """, (machine_id,)).fetchone()

    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    m_lat = machine["latitude"] if machine["latitude"] is not None else 40.7128
    m_lon = machine["longitude"] if machine["longitude"] is not None else -74.0060

    zones = conn.execute("SELECT * FROM geofence_zones;").fetchall()

    restricted_zones = [z for z in zones if z["zone_type"] == "blast_danger_zone" or "Blast" in z["name"]]
    if not restricted_zones:
        restricted_zones = zones

    nearest_zone = None
    min_dist_to_perimeter = float("inf")

    for z in restricted_zones:
        center_dist = calculate_distance_meters(m_lat, m_lon, z["center_lat"], z["center_lon"])
        perimeter_dist = center_dist - z["radius_m"]

        if perimeter_dist < min_dist_to_perimeter:
            min_dist_to_perimeter = perimeter_dist
            nearest_zone = z

    is_breached = bool(machine["is_geofence_breached"]) or min_dist_to_perimeter <= 0.0 or "Blast" in (machine["current_zone"] or "")

    if is_breached or min_dist_to_perimeter <= 0.0:
        warning_level = "critical"
        dist_m = 0.0
        msg = f"CRITICAL GEOFENCE BREACH: Machine inside restricted '{nearest_zone['name'] if nearest_zone else 'Blast Perimeter'}'! Engage hydraulic lockout and reverse immediately."
    elif min_dist_to_perimeter <= 50.0:
        warning_level = "caution"
        dist_m = round(min_dist_to_perimeter, 1)
        msg = f"PROXIMITY CAUTION: Approaching restricted '{nearest_zone['name'] if nearest_zone else 'Blast Zone'}' ({dist_m}m to boundary). Reduce speed to <10 km/h."
    else:
        warning_level = "safe"
        dist_m = round(min_dist_to_perimeter, 1)
        msg = f"Nominal Operations: Cabin inside authorized '{machine['authorized_zone'] or machine['current_zone']}' ({dist_m}m to nearest restricted perimeter)."

    return {
        "machine_id": machine["machine_id"],
        "machine_model": machine["model"],
        "operator_id": machine["operator_id"],
        "current_zone": machine["current_zone"] or "Zone A - Quarry North",
        "authorized_zone": machine["authorized_zone"] or "Zone A - Quarry North",
        "speed_kmh": machine["speed_kmh"] or 0.0,
        "heading_deg": machine["heading_deg"] or 0.0,
        "is_geofence_breached": is_breached,
        "nearest_restricted_zone_id": nearest_zone["zone_id"] if nearest_zone else "ZONE_BLAST",
        "nearest_restricted_zone_name": nearest_zone["name"] if nearest_zone else "Blast Danger Perimeter",
        "distance_to_restricted_m": dist_m,
        "warning_level": warning_level,
        "warning_message": msg
    }

@app.get("/api/fleet/geofence-proximity/{machine_id}", response_model=GeofenceProximityStatus)
def get_machine_geofence_proximity(machine_id: str):
    """Retrieve real-time geofence proximity evaluation for a specific machine."""
    conn = get_db_connection()
    status = calculate_geofence_proximity(machine_id, conn)
    conn.close()
    return status

@app.get("/api/operators/{operator_id}/geofence-proximity", response_model=GeofenceProximityStatus)
def get_operator_geofence_proximity(operator_id: str):
    """Retrieve real-time geofence proximity for the equipment currently assigned to this operator."""
    conn = get_db_connection()
    assignment = conn.execute("""
        SELECT machine_id FROM operator_machine_assignments
        WHERE operator_id = ? AND is_active = 1
        ORDER BY assignment_id DESC LIMIT 1;
    """, (operator_id,)).fetchone()

    machine_id = assignment["machine_id"] if assignment else "EXC001"
    status = calculate_geofence_proximity(machine_id, conn)
    conn.close()
    return status

@app.post("/api/operators/{operator_id}/geofence-proximity/acknowledge")
async def acknowledge_geofence_proximity(operator_id: str):
    """Logs that the operator acknowledged the in-cab proximity warning."""
    conn = get_db_connection()
    assignment = conn.execute("""
        SELECT machine_id FROM operator_machine_assignments
        WHERE operator_id = ? AND is_active = 1
        ORDER BY assignment_id DESC LIMIT 1;
    """, (operator_id,)).fetchone()
    conn.close()

    m_id = assignment["machine_id"] if assignment else "EXC001"

    await notification_service.notify(
        channels=["websocket", "log"],
        target="supervisor",
        message=f"Operator {operator_id} acknowledged geofence proximity warning for {m_id}.",
        payload={"operator_id": operator_id, "machine_id": m_id, "status": "acknowledged"}
    )
    return {"status": "acknowledged", "operator_id": operator_id, "machine_id": m_id}

@app.get("/api/weather/site")
def get_site_weather(latitude: float = 40.7128, longitude: float = -74.0060, scheduled_time: Optional[str] = None):
    """Real-time weather endpoint for the scheduler and HUD so users don't have to input weather manually."""
    weather_info = fetch_weather(latitude, longitude, scheduled_time)
    
    # Interpret condition label for convenience
    p = weather_info.get("precipitation_mm", 0.0)
    w = weather_info.get("wind_speed_kmh", 0.0)
    t = weather_info.get("temperature_c", 20.0)

    if p > 1.0:
        condition = "Rainy"
    elif w > 24.0:
        condition = "Windy"
    elif t > 28.0:
        condition = "Sunny"
    else:
        condition = "Cloudy"

    is_severe = w > 28.0 or p > 12.0
    return {
        **weather_info,
        "condition": condition,
        "is_severe": is_severe,
        "reapproval_required": is_severe
    }

@app.post("/api/alerts/{alert_id}/assign-training")
async def assign_remedial_training(alert_id: str, payload: Dict[str, Any]):
    """Assigns an in-cab remedial simulator scenario directly from a logged safety alert or incident."""
    conn = get_db_connection()
    alert = conn.execute("SELECT * FROM safety_alerts WHERE alert_id = ?;", (alert_id,)).fetchone()
    if not alert:
        conn.close()
        raise HTTPException(status_code=404, detail="Alert not found")

    scenario_id = payload.get("scenario_id", "SCEN-SAFE-01")
    op_id = alert["operator_id"]
    
    prog = OPERATOR_PROGRESS.setdefault(op_id, {"points": 0, "badges": [], "completed_scenarios": []})
    prog["assigned_remedial_scenario"] = scenario_id
    conn.close()

    await notification_service.notify(
        channels=["websocket", "log"],
        target=op_id,
        message=f"Supervisor assigned remedial safety training module ({scenario_id}) for incident on {alert['machine_id']}.",
        payload={"alert_id": alert_id, "scenario_id": scenario_id}
    )

    return {"status": "assigned", "operator_id": op_id, "scenario_id": scenario_id}

# --- Training Hub Scenarios & Simulation (Section 4) ---
@app.get("/api/training/scenarios")
def get_training_scenarios(operator_id: Optional[str] = None):
    # Recommend scenario based on operator telemetry flags
    recommended_id = "SCEN-PORTAL-01"
    if operator_id == "OP1001":
        # OP1001 had seatbelt / excessive idle in telemetry
        recommended_id = "SCEN-SAFE-01"

    return {
        "scenarios": SCENARIOS,
        "recommended_scenario_id": recommended_id,
        "operator_progress": OPERATOR_PROGRESS.get(operator_id or "OP1001", {
            "points": 100,
            "badges": ["Cabin Rookie"],
            "completed_scenarios": []
        })
    }

@app.post("/api/training/submit")
def submit_scenario_choice(payload: Dict[str, Any]):
    scenario_id = payload.get("scenario_id")
    option_id = payload.get("option_id")
    operator_id = payload.get("operator_id", "OP1001")

    scenario = next((s for s in SCENARIOS if s["id"] == scenario_id), None)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    option = next((o for o in scenario["options"] if o["id"] == option_id), None)
    if not option:
        raise HTTPException(status_code=400, detail="Invalid option_id")

    # Update progress
    prog = OPERATOR_PROGRESS.setdefault(operator_id, {"points": 0, "badges": [], "completed_scenarios": []})
    earned_pts = option["safety_score"] + option["efficiency_score"]
    prog["points"] += earned_pts
    if scenario_id not in prog["completed_scenarios"]:
        prog["completed_scenarios"].append(scenario_id)

    badge = option.get("badge_unlocked")
    if badge and badge not in prog["badges"]:
        prog["badges"].append(badge)

    # Persist training completion progress to operators table
    try:
        conn = get_db_connection()
        conn.execute("""
        UPDATE operators
        SET training_completion_pct = MIN(100.0, training_completion_pct + 2.5)
        WHERE operator_id = ?;
        """, (operator_id,))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Training Sync Notice] {e}")

    return {
        "scenario_id": scenario_id,
        "option_id": option_id,
        "safety_score": option["safety_score"],
        "efficiency_score": option["efficiency_score"],
        "feedback": option["feedback"],
        "badge_unlocked": badge,
        "total_points": prog["points"],
        "all_badges": prog["badges"]
    }

# --- Hands-Free Voice Agent NLP / Action Dispatcher ---
@app.post("/api/voice/command", response_model=VoiceCommandResponse)
async def process_voice_command(cmd: VoiceCommandRequest):
    text = cmd.transcript.strip().lower()
    operator_id = cmd.operator_id

    # 1. "what's my next task?"
    if "next task" in text or "what is my task" in text or "what do i do" in text:
        conn = get_db_connection()
        query = """
        SELECT t.*, m.model as machine_model, ttp.predicted_time_min
        FROM tasks t
        LEFT JOIN machines m ON t.machine_id = m.machine_id
        LEFT JOIN task_time_predictions ttp ON t.task_id = ttp.task_id
        WHERE t.operator_id = ? AND t.status IN ('upcoming', 'in-progress')
        ORDER BY t.scheduled_start ASC LIMIT 1;
        """
        task = conn.execute(query, (operator_id,)).fetchone()
        conn.close()

        if task:
            pred = task["predicted_time_min"] or 45
            spoken = f"Your next assignment is {task['task_type']} at {task['location_zone']} using machine {task['machine_model']}. Estimated completion is {int(pred)} minutes."
            return VoiceCommandResponse(
                action="show_task",
                spoken_feedback=spoken,
                data=dict(task)
            )
        else:
            return VoiceCommandResponse(
                action="no_task",
                spoken_feedback="You currently have no scheduled tasks remaining today. Good work."
            )

    # 2. "log hydraulic leak on left boom" / report issue
    elif "log" in text or "leak" in text or "report" in text or "issue" in text or "hazard" in text:
        conn = get_db_connection()
        machine = cmd.machine_id or "EXC001"
        inc_id = f"INC-{uuid.uuid4().hex[:4].upper()}"
        now_utc = datetime.now(timezone.utc).isoformat()
        
        conn.execute("""
        INSERT INTO incidents (incident_id, machine_id, operator_id, logged_at, incident_text, severity, is_voice_logged)
        VALUES (?, ?, ?, ?, ?, 'high', 1);
        """, (inc_id, machine, operator_id, now_utc, cmd.transcript))
        conn.commit()
        conn.close()

        spoken = f"Incident logged successfully on {machine}: {cmd.transcript}. Notified site supervisor."
        await notification_service.notify(
            channels=["websocket", "log"],
            target="supervisor",
            message=f"Voice Incident Logged: {cmd.transcript}",
            payload={"incident_id": inc_id, "machine_id": machine}
        )
        return VoiceCommandResponse(
            action="incident_logged",
            spoken_feedback=spoken,
            data={"incident_id": inc_id, "transcript": cmd.transcript}
        )

    # 3. Emergency SOS
    elif "sos" in text or "emergency" in text or "help" in text:
        alert = await trigger_safety_alert(SafetyAlertCreate(
            machine_id=cmd.machine_id or "EXC001",
            operator_id=operator_id,
            alert_type="Voice Triggered Emergency SOS",
            notes=f"Triggered by voice transcript: '{cmd.transcript}'"
        ))
        return VoiceCommandResponse(
            action="sos_triggered",
            spoken_feedback="Emergency SOS initiated. Cabin alert active. Supervisor is being notified.",
            data={"alert_id": alert["alert_id"]}
        )

    else:
        return VoiceCommandResponse(
            action="general_query",
            spoken_feedback=f"Received: '{cmd.transcript}'. You can ask 'What is my next task?' or say 'Log hydraulic leak on left boom'."
        )

