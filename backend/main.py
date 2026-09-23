from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

from database import get_db_connection, init_db
from models import (
    SupervisorResponse, OperatorResponse, OperatorProfileUpdate,
    MachineResponse, RentalUpdateRequest,
    TaskResponse, TaskCreate, TaskStatusUpdate,
    TelemetryRecord, IdleAnomalyReport,
    SafetyAlertCreate, SafetyAlertResponse, AlertAcknowledgeRequest,
    IncidentCreate, IncidentResponse,
    VoiceCommandRequest, VoiceCommandResponse
)
from services.notification_service import notification_service
from services.prediction_engine import prediction_engine
from services.anomaly_detector import anomaly_detector
from training_data import SCENARIOS, OPERATOR_PROGRESS

# Ensure database tables exist
init_db()

app = FastAPI(
    title="CAT Co-Pilot API",
    description="Multi-role In-Cab Smart Operator Assistant Platform API",
    version="1.0.0"
)

# CORS setup for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# --- Health Check ---
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "CAT Co-Pilot Backend",
        "server_time_utc": datetime.now(timezone.utc).isoformat(),
        "database": "sqlite3",
        "ml_engine": "active"
    }

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
    op = conn.execute("SELECT skill_level FROM operators WHERE operator_id = ?;", (task_in.operator_id,)).fetchone()
    mach = conn.execute("SELECT age_years FROM machines WHERE machine_id = ?;", (task_in.machine_id,)).fetchone()

    if not op or not mach:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid operator_id or machine_id")

    # Run ML prediction model
    pred_result = prediction_engine.predict(
        task_type=task_in.task_type,
        weather=task_in.weather,
        operator_skill=op["skill_level"],
        machine_age_years=mach["age_years"],
        estimated_time_min=task_in.estimated_time_min
    )

    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO tasks (task_id, task_type, weather, operator_id, machine_id, scheduled_start, scheduled_end, status, location_zone, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?);
    """, (new_task_id, task_in.task_type, task_in.weather, task_in.operator_id, task_in.machine_id,
          task_in.scheduled_start, task_in.scheduled_end, task_in.location_zone, task_in.notes))

    cursor.execute("""
    INSERT INTO task_time_predictions (task_id, estimated_time_min, predicted_time_min)
    VALUES (?, ?, ?);
    """, (new_task_id, pred_result["estimated_time_min"], pred_result["predicted_time_min"]))

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
        message=f"New Task Scheduled: {task_in.task_type} at {task_in.location_zone}",
        payload={"task_id": new_task_id, "predicted_duration": pred_result["predicted_time_min"]}
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
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/alerts/trigger", response_model=SafetyAlertResponse)
async def trigger_safety_alert(alert_in: SafetyAlertCreate):
    conn = get_db_connection()
    alert_id = f"ALT-{uuid.uuid4().hex[:4].upper()}"
    now_utc = datetime.now(timezone.utc).isoformat()

    # Determine supervisor
    sup_id = alert_in.supervisor_id
    if not sup_id:
        op = conn.execute("SELECT assigned_supervisor_id FROM operators WHERE operator_id = ?;", (alert_in.operator_id,)).fetchone()
        sup_id = op["assigned_supervisor_id"] if op else "SUP001"

    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO safety_alerts (alert_id, machine_id, operator_id, supervisor_id, alert_type, triggered_at, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?);
    """, (alert_id, alert_in.machine_id, alert_in.operator_id, sup_id, alert_in.alert_type, now_utc, alert_in.notes))
    conn.commit()

    alert_row = conn.execute("SELECT sa.*, o.name as operator_name FROM safety_alerts sa LEFT JOIN operators o ON sa.operator_id = o.operator_id WHERE sa.alert_id = ?;", (alert_id,)).fetchone()
    conn.close()

    # Send in-app WebSocket alert to cabin & supervisor
    await notification_service.notify(
        channels=["websocket", "log"],
        target="all",
        message=f"SAFETY HAZARD DETECTED: {alert_in.alert_type} on {alert_in.machine_id}",
        payload={"alert_id": alert_id, "alert_type": alert_in.alert_type, "status": "active", "requires_ack_sec": 45}
    )

    return dict(alert_row)

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

    return dict(updated)

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

# --- Task Duration Prediction Endpoint ---
@app.post("/api/predict-time")
def predict_task_duration(payload: Dict[str, Any]):
    return prediction_engine.predict(
        task_type=payload.get("task_type", "Earth Excavation"),
        weather=payload.get("weather", "Sunny"),
        operator_skill=payload.get("operator_skill", "Expert"),
        machine_age_years=float(payload.get("machine_age_years", 2.0)),
        estimated_time_min=float(payload.get("estimated_time_min", 60.0))
    )

# --- Training Hub Scenarios & Simulation (Section 4) ---
@app.get("/api/training/scenarios")
def get_training_scenarios(operator_id: Optional[str] = None):
    # Recommend scenario based on operator telemetry flags
    recommended_id = "SCEN-001"
    if operator_id == "OP1001":
        # OP1001 had seatbelt / excessive idle in telemetry
        recommended_id = "SCEN-002"

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
