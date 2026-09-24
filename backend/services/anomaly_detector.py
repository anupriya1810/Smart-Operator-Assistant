from typing import List, Dict, Any

class AnomalyDetector:
    """
    Detects machine telemetry anomalies:
    1. Ghost Idling & Excessive Fuel Burn (Idling >= idle_limit_min with <= load_cycles)
    2. Seatbelt compliance failure while engine is active
    3. Dollar-cost of idle time calculation
    """
    DIESEL_COST_PER_LITER = 1.35  # USD per liter of off-road diesel
    IDLE_BURN_RATE_L_PER_HOUR = 3.6  # Liters of fuel burned per hour of heavy excavator idle

    def __init__(
        self,
        diesel_cost_per_liter: float = 1.35,
        idle_burn_rate_l_per_hour: float = 3.6,
        idle_limit_min: float = 40.0,
        anomaly_sensitivity: str = "standard"
    ):
        self.diesel_cost_per_liter = diesel_cost_per_liter
        self.idle_burn_rate_l_per_hour = idle_burn_rate_l_per_hour
        self.idle_limit_min = idle_limit_min
        self.anomaly_sensitivity = anomaly_sensitivity

    def update_thresholds(
        self,
        diesel_cost_per_liter: float = None,
        idle_burn_rate_l_per_hour: float = None,
        idle_limit_min: float = None,
        anomaly_sensitivity: str = None
    ):
        if diesel_cost_per_liter is not None:
            self.diesel_cost_per_liter = float(diesel_cost_per_liter)
            self.DIESEL_COST_PER_LITER = self.diesel_cost_per_liter
        if idle_burn_rate_l_per_hour is not None:
            self.idle_burn_rate_l_per_hour = float(idle_burn_rate_l_per_hour)
            self.IDLE_BURN_RATE_L_PER_HOUR = self.idle_burn_rate_l_per_hour
        if idle_limit_min is not None:
            self.idle_limit_min = float(idle_limit_min)
        if anomaly_sensitivity is not None:
            self.anomaly_sensitivity = anomaly_sensitivity

    def analyze_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        idling_min = float(record.get("idling_time_min", 0))
        load_cycles = int(record.get("load_cycles", 0))
        seatbelt = record.get("seatbelt_status", "Fastened")
        
        # Sensitivity-adjusted load cycle tolerance
        max_cycles = 2
        if self.anomaly_sensitivity == "strict":
            max_cycles = 3
        elif self.anomaly_sensitivity == "low":
            max_cycles = 1

        # Idle cost calculation using active rate and burn benchmark
        idle_hours = idling_min / 60.0
        fuel_wasted_l = round(idle_hours * self.idle_burn_rate_l_per_hour, 2)
        idle_cost_usd = round(fuel_wasted_l * self.diesel_cost_per_liter, 2)

        # Ghost idling flag using active configurable idle_limit_min
        is_ghost_idle = (idling_min >= self.idle_limit_min) and (load_cycles <= max_cycles)
        
        # Unfastened seatbelt flag
        is_seatbelt_violation = (seatbelt.lower() == "unfastened")

        severity = "normal"
        if is_ghost_idle and is_seatbelt_violation:
            severity = "critical"
        elif is_ghost_idle or is_seatbelt_violation:
            severity = "warning"

        return {
            "machine_id": record.get("machine_id"),
            "operator_id": record.get("operator_id"),
            "timestamp": record.get("timestamp"),
            "idling_time_min": idling_min,
            "load_cycles": load_cycles,
            "seatbelt_status": seatbelt,
            "fuel_wasted_l": fuel_wasted_l,
            "estimated_idle_cost_usd": idle_cost_usd,
            "is_ghost_idle": is_ghost_idle,
            "is_seatbelt_violation": is_seatbelt_violation,
            "severity": severity
        }

anomaly_detector = AnomalyDetector()
