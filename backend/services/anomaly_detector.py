from typing import List, Dict, Any

class AnomalyDetector:
    """
    Detects machine telemetry anomalies:
    1. Ghost Idling & Excessive Fuel Burn (Idling > 45 mins with <= 2 load cycles)
    2. Seatbelt compliance failure while engine is active
    3. Dollar-cost of idle time calculation
    """
    DIESEL_COST_PER_LITER = 1.35  # USD per liter of off-road diesel
    IDLE_BURN_RATE_L_PER_HOUR = 3.6  # Liters of fuel burned per hour of heavy excavator idle

    def analyze_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        idling_min = float(record.get("idling_time_min", 0))
        load_cycles = int(record.get("load_cycles", 0))
        seatbelt = record.get("seatbelt_status", "Fastened")
        
        # Idle cost calculation
        idle_hours = idling_min / 60.0
        fuel_wasted_l = round(idle_hours * self.IDLE_BURN_RATE_L_PER_HOUR, 2)
        idle_cost_usd = round(fuel_wasted_l * self.DIESEL_COST_PER_LITER, 2)

        # Ghost idling flag: >40 min idle with <= 2 load cycles
        is_ghost_idle = (idling_min >= 40.0) and (load_cycles <= 2)
        
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
