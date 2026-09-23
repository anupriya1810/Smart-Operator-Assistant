from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime

# --- Supervisor Models ---
class SupervisorBase(BaseModel):
    supervisor_id: str
    name: str
    email: str
    phone: Optional[str] = None
    timezone: str = "UTC"

class SupervisorResponse(SupervisorBase):
    pass

# --- Operator Models ---
class OperatorBase(BaseModel):
    operator_id: str
    name: str
    preferred_language: Literal["en", "hi", "es"] = "en"
    timezone: str = "UTC"
    skill_level: Literal["Beginner", "Intermediate", "Expert"]
    assigned_supervisor_id: str

class OperatorResponse(OperatorBase):
    pass

class OperatorProfileUpdate(BaseModel):
    preferred_language: Optional[Literal["en", "hi", "es"]] = None
    timezone: Optional[str] = None

# --- Machine Models ---
class MachineBase(BaseModel):
    machine_id: str
    type: str
    model: str
    age_years: float
    owner_supervisor_id: str
    custody_status: Literal["owned", "rented_in", "rented_out"] = "owned"
    rental_counterparty: Optional[str] = None
    rental_start: Optional[str] = None
    rental_end: Optional[str] = None

class MachineResponse(MachineBase):
    current_operator_name: Optional[str] = None

class RentalUpdateRequest(BaseModel):
    custody_status: Literal["owned", "rented_in", "rented_out"]
    rental_counterparty: Optional[str] = None
    rental_start: Optional[str] = None
    rental_end: Optional[str] = None

# --- Task Models ---
class TaskBase(BaseModel):
    task_id: str
    task_type: str
    weather: str
    operator_id: str
    machine_id: str
    scheduled_start: str # UTC ISO format
    scheduled_end: str   # UTC ISO format
    status: Literal["upcoming", "in-progress", "done", "delayed"] = "upcoming"
    location_zone: str
    notes: Optional[str] = None

class TaskCreate(BaseModel):
    task_type: str
    weather: str
    operator_id: str
    machine_id: str
    scheduled_start: str # Local or UTC ISO, will be normalized to UTC
    scheduled_end: str
    location_zone: str
    notes: Optional[str] = None
    estimated_time_min: Optional[float] = None

class TaskResponse(TaskBase):
    operator_name: Optional[str] = None
    machine_model: Optional[str] = None
    estimated_time_min: Optional[float] = None
    predicted_time_min: Optional[float] = None
    actual_time_min: Optional[float] = None

class TaskStatusUpdate(BaseModel):
    status: Literal["upcoming", "in-progress", "done", "delayed"]
    actual_time_min: Optional[float] = None

# --- Telemetry Models ---
class TelemetryRecord(BaseModel):
    id: Optional[int] = None
    timestamp: str # UTC ISO
    machine_id: str
    operator_id: str
    engine_hours: float
    fuel_used_l: float
    load_cycles: int
    idling_time_min: float
    seatbelt_status: Literal["Fastened", "Unfastened"]
    safety_alert_triggered: Literal["Yes", "No"]

class IdleAnomalyReport(BaseModel):
    machine_id: str
    operator_id: str
    operator_name: Optional[str] = None
    timestamp: str
    idling_time_min: float
    load_cycles: int
    fuel_wasted_l: float
    estimated_idle_cost_usd: float
    seatbelt_status: str
    is_ghost_idle: bool

# --- Safety Alert Models ---
class SafetyAlertCreate(BaseModel):
    machine_id: str
    operator_id: str
    supervisor_id: Optional[str] = None
    alert_type: str
    notes: Optional[str] = None

class SafetyAlertResponse(BaseModel):
    alert_id: str
    machine_id: str
    operator_id: str
    supervisor_id: str
    alert_type: str
    triggered_at: str
    acknowledged_at: Optional[str] = None
    escalated_at: Optional[str] = None
    response_time_sec: Optional[float] = None
    status: Literal["active", "acknowledged", "escalated", "resolved"]
    notes: Optional[str] = None
    operator_name: Optional[str] = None

class AlertAcknowledgeRequest(BaseModel):
    operator_id: str
    notes: Optional[str] = None

# --- Incident Logging Models ---
class IncidentCreate(BaseModel):
    machine_id: str
    operator_id: str
    incident_text: str
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    is_voice_logged: bool = False

class IncidentResponse(BaseModel):
    incident_id: str
    machine_id: str
    operator_id: str
    logged_at: str
    incident_text: str
    severity: str
    is_voice_logged: bool

# --- Voice Command Models ---
class VoiceCommandRequest(BaseModel):
    transcript: str
    operator_id: str
    machine_id: Optional[str] = None

class VoiceCommandResponse(BaseModel):
    action: str
    spoken_feedback: str
    data: Optional[dict] = None
