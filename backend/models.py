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
    preferred_language: Optional[str] = "en"
    timezone: str = "UTC"
    skill_level: str = "Intermediate"
    assigned_supervisor_id: Optional[str] = "SUP001"
    years_experience: Optional[int] = 5
    shift: Optional[str] = "Day"
    license_type: Optional[str] = "Heavy Equipment"
    training_completion_pct: Optional[float] = 80.0
    safety_violations_ytd: Optional[int] = 0

class OperatorResponse(OperatorBase):
    pass

class OperatorProfileUpdate(BaseModel):
    preferred_language: Optional[Literal["en", "hi", "es"]] = None
    timezone: Optional[str] = None

# --- Machine Models ---
class MachineBase(BaseModel):
    machine_id: str
    type: Optional[str] = None
    machine_type: Optional[str] = None
    model: str
    age_years: Optional[float] = None
    machine_age_yrs: Optional[float] = None
    owner_supervisor_id: Optional[str] = "SUP001"
    custody_status: Optional[str] = "owned"
    status: Optional[str] = "Active"
    purchase_date: Optional[str] = None
    last_maintenance_date: Optional[str] = None
    lifetime_engine_hours: Optional[float] = None
    fuel_tank_capacity_l: Optional[float] = None
    rental_counterparty: Optional[str] = None
    rental_start: Optional[str] = None
    rental_counterparty: Optional[str] = None
    rental_start: Optional[str] = None
    rental_end: Optional[str] = None
    latitude: Optional[float] = 40.7128
    longitude: Optional[float] = -74.0060
    current_zone: Optional[str] = "Zone A - Quarry North"
    authorized_zone: Optional[str] = "Zone A - Quarry North"
    speed_kmh: Optional[float] = 0.0
    heading_deg: Optional[float] = 0.0
    is_geofence_breached: Optional[bool] = False
    last_gps_update: Optional[str] = None

class MachineResponse(MachineBase):
    current_operator_name: Optional[str] = None

class GpsTracePoint(BaseModel):
    trace_id: Optional[int] = None
    machine_id: str
    timestamp: str
    latitude: float
    longitude: float
    speed_kmh: float = 0.0
    heading_deg: float = 0.0
    is_anomaly: bool = False
    anomaly_reason: Optional[str] = None

class GeofenceZoneResponse(BaseModel):
    zone_id: str
    name: str
    center_lat: float
    center_lon: float
    radius_m: float
    zone_type: Literal["safe_work_zone", "blast_danger_zone", "speed_restricted", "haul_road"]
    max_speed_kmh: float

class GpsAnomalyReport(BaseModel):
    machine_id: str
    machine_model: str
    operator_name: Optional[str] = None
    current_zone: str
    authorized_zone: str
    anomaly_type: str
    anomaly_description: str
    latitude: float
    longitude: float
    timestamp: str
    severity: Literal["low", "medium", "high", "critical"]

class GeofenceProximityStatus(BaseModel):
    machine_id: str
    machine_model: str
    operator_id: Optional[str] = None
    current_zone: str
    authorized_zone: str
    speed_kmh: float = 0.0
    heading_deg: float = 0.0
    is_geofence_breached: bool = False
    nearest_restricted_zone_id: Optional[str] = None
    nearest_restricted_zone_name: Optional[str] = None
    distance_to_restricted_m: float = 0.0
    warning_level: Literal["safe", "caution", "critical"] = "safe"
    warning_message: str

class RentalUpdateRequest(BaseModel):
    custody_status: Literal["owned", "rented_in", "rented_out"]
    rental_counterparty: Optional[str] = None
    rental_start: Optional[str] = None
    rental_end: Optional[str] = None

# --- Task Models ---
class TaskBase(BaseModel):
    task_id: str
    task_type: str
    weather: Optional[str] = "Sunny"
    operator_id: str
    machine_id: str
    scheduled_start: str # UTC ISO format
    scheduled_end: str   # UTC ISO format
    status: Literal["upcoming", "in-progress", "done", "delayed"] = "upcoming"
    location_zone: str
    notes: Optional[str] = None
    weather_reapproval_required: Optional[bool] = False
    weather_approved_by: Optional[str] = None

class TaskCreate(BaseModel):
    task_type: str
    weather: Optional[str] = None # Auto-resolved from location if not provided
    operator_id: str
    machine_id: str
    scheduled_start: str # Local or UTC ISO, normalized to UTC
    scheduled_end: str
    location_zone: str
    notes: Optional[str] = None
    estimated_time_min: Optional[float] = None # Calculated automatically by ML if not provided

class TaskResponse(TaskBase):
    operator_name: Optional[str] = None
    machine_model: Optional[str] = None
    estimated_time_min: Optional[float] = None
    predicted_time_min: Optional[float] = None
    actual_time_min: Optional[float] = None

class WeatherApprovalRequest(BaseModel):
    supervisor_id: str = "SUP001"
    action: Literal["approve", "postpone"] = "approve"
    notes: Optional[str] = None

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

# --- Proximity-Based Buddy Failover Models ---
class BuddyFailoverResponse(BaseModel):
    failover_id: str
    alert_id: str
    distressed_operator_id: str
    distressed_operator_name: Optional[str] = None
    distressed_machine_id: str
    distressed_machine_model: Optional[str] = None
    distressed_zone: str
    distressed_lat: float
    distressed_lon: float
    buddy_operator_id: str
    buddy_operator_name: Optional[str] = None
    buddy_machine_id: str
    buddy_machine_model: Optional[str] = None
    distance_meters: float
    status: Literal["pending", "en_route", "radio_contacted", "resolved"]
    dispatched_at: str
    acknowledged_at: Optional[str] = None
    notes: Optional[str] = None

class BuddyAlertResponseRequest(BaseModel):
    status: Literal["en_route", "radio_contacted", "resolved"] = "en_route"
    notes: Optional[str] = None

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
    buddy_failover: Optional[BuddyFailoverResponse] = None

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

# --- ML Prediction Models ---
class TaskTimePredictRequest(BaseModel):
    task_type: str
    operator_id: str
    machine_id: str
    latitude: float
    longitude: float
    scheduled_start: str
    estimated_time_min: Optional[float] = None

class FactorImpact(BaseModel):
    feature: str
    impact_min: float

class TaskTimePredictResponse(BaseModel):
    predicted_time_min: float
    estimated_time_min: float
    explanation: Optional[str] = None
    top_factors: List[FactorImpact]
    engineered_features: Optional[dict] = None

# --- Multi-Operator SOS Correlation & Evacuation Models ---
class SosCorrelationResponse(BaseModel):
    correlation_id: str
    location_zone: str
    alert_ids: List[str]
    operator_ids: List[str]
    operator_names: Optional[List[str]] = None
    machine_ids: List[str]
    machine_models: Optional[List[str]] = None
    operator_count: int
    first_triggered_at: str
    latest_triggered_at: str
    status: Literal["active_emergency", "evacuation_ordered", "contained", "resolved"]
    evacuation_ordered_at: Optional[str] = None
    notes: Optional[str] = None

class EvacuationOrderRequest(BaseModel):
    muster_zone: Optional[str] = "Muster Point Charlie (Highway Access Gate)"
    notes: Optional[str] = None

# --- Supervisor Configurable Threshold Models ---
class SupervisorThresholds(BaseModel):
    id: str = "SITE_DEFAULT"
    idle_limit_min: float = 40.0
    sos_timeout_sec: int = 45
    diesel_cost_per_liter: float = 1.35
    idle_burn_rate_l_per_hour: float = 3.6
    anomaly_sensitivity: Literal["low", "standard", "high", "strict"] = "standard"
    duty_cycle_max_hours: float = 4.0
    cooldown_period_min: int = 15
    updated_at: str

class ThresholdsUpdateRequest(BaseModel):
    idle_limit_min: Optional[float] = None
    sos_timeout_sec: Optional[int] = None
    diesel_cost_per_liter: Optional[float] = None
    idle_burn_rate_l_per_hour: Optional[float] = None
    anomaly_sensitivity: Optional[Literal["low", "standard", "high", "strict"]] = None
    duty_cycle_max_hours: Optional[float] = None
    cooldown_period_min: Optional[int] = None

# --- Machine Duty-Cycle Enforcement & Cooldown Models ---
class MachineDutyCycleStatus(BaseModel):
    machine_id: str
    machine_model: Optional[str] = None
    operator_id: Optional[str] = None
    operator_name: Optional[str] = None
    continuous_engine_hours: float
    duty_limit_hours: float
    is_cooldown_required: bool
    cooldown_duration_min: int
    cooldown_status: Literal["nominal", "cooldown_recommended", "cooling_down", "cooldown_completed"]
    cooldown_task_id: Optional[str] = None
    recommended_action: str
    last_cooldown_at: Optional[str] = None

class ScheduleCooldownRequest(BaseModel):
    cooldown_duration_min: Optional[int] = None
    notes: Optional[str] = None

# --- In-Cab Fatigue & Microsleep Detection Models ---
class FatigueEventCreate(BaseModel):
    operator_id: str
    machine_id: Optional[str] = "EXC001"
    eye_closure_duration_sec: float = 2.0
    notes: Optional[str] = None

class FatigueEventResponse(BaseModel):
    event_id: str
    alert_id: str
    operator_id: str
    operator_name: Optional[str] = None
    machine_id: str
    eye_closure_duration_sec: float
    recorded_at: str
    status: str
    notes: Optional[str] = None

# --- Dynamic ML Recalibration Models ---
class RecalibrateRequest(BaseModel):
    supervisor_id: Optional[str] = "SUP001"
    idle_bias_adjustment_pct: Optional[float] = 0.0
    sensitivity_factor: Optional[float] = 1.0
    retrain_from_db: Optional[bool] = False
    reason: Optional[str] = "Supervisor operational threshold realignment"

class RecalibrateResponse(BaseModel):
    status: str
    model_version: str
    baseline_mae: float
    recalibrated_mae: float
    mae_lift_pct: float
    samples_recalibrated: int
    adjustment_bias_min: float
    timestamp: str
    notes: Optional[str] = None

# --- OAuth 2.0 / JWT Authentication Models ---
class LoginRequest(BaseModel):
    username: str
    password: str
    role: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    name: str
    permissions: List[str]
    expires_in_sec: int

class UserProfileResponse(BaseModel):
    user_id: str
    name: str
    role: Literal["operator", "supervisor"]
    email: Optional[str] = None
    permissions: List[str]
    assigned_machine_id: Optional[str] = None
    preferred_language: str = "en"
    timezone: str = "America/New_York"
