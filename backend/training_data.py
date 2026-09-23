"""
Structured JSON scenarios for Operator Portal Training & Safety Simulation Module
Curriculum covers:
1. Portal Operations: Hands-free Voice Agent, 45-second SOS alert acknowledgment, Task lifecycle tracking.
2. Operator Safety: Seatbelt interlocks, Ground crew blind-spot proximity, Slope stability & hydraulic preservation.
"""
from typing import List, Dict, Any

SCENARIOS: List[Dict[str, Any]] = [
    # =========================================================================
    # TRACK 1: PORTAL OPERATIONS & IN-CAB ASSISTANT TRAINING
    # =========================================================================
    {
        "id": "SCEN-PORTAL-01",
        "category": "portal",
        "title": "Hands-Free Voice Assistant: Logging Faults While Operating",
        "task_type": "Material Loading",
        "weather": "Sunny",
        "machine_age_yrs": 3.0,
        "active_condition": "During high-cycle truck loading, you spot hydraulic fluid misting near the left boom swivel. Both hands are locked on the pilot joysticks.",
        "difficulty": "Beginner",
        "recommended_for": ["voice_onboarding", "portal_basics"],
        "portal_feature": "Hands-Free Web Speech Voice Agent",
        "options": [
            {
                "id": "opt_a",
                "text": "Take your hands off the joysticks while slewing to open the tablet keyboard and type a message to the supervisor.",
                "safety_score": 10,
                "efficiency_score": 20,
                "feedback": "HAZARD: Never take hands off live hydraulic controls to type on a screen while a 20-ton machine is slewing. Severe strike hazard.",
                "badge_unlocked": None
            },
            {
                "id": "opt_b",
                "text": "Keep hands on joysticks and trigger the Voice Assistant: speak 'Log hydraulic leak on left boom' to automatically dispatch an incident log to the supervisor hub.",
                "safety_score": 100,
                "efficiency_score": 100,
                "feedback": "EXCELLENT PORTAL USAGE: The in-cab voice assistant logs the incident with machine telemetry and timestamp without compromising joystick control.",
                "badge_unlocked": "Voice Co-Pilot Certified"
            },
            {
                "id": "opt_c",
                "text": "Ignore the leak until the end of the 8-hour shift so loading quotas aren't delayed.",
                "safety_score": 20,
                "efficiency_score": 10,
                "feedback": "EQUIPMENT DAMAGE RISK: Unreported hydraulic misting can blow a high-pressure hose, creating environmental fines and hydraulic pump burnout.",
                "badge_unlocked": None
            }
        ]
    },
    {
        "id": "SCEN-PORTAL-02",
        "category": "portal",
        "title": "Emergency SOS Response: 45-Second Auto-Escalation Window",
        "task_type": "Trenching",
        "weather": "Rainy",
        "machine_age_yrs": 5.0,
        "active_condition": "An in-cab hazard alarm triggers on your HUD with a red pulsing strobe and a 45-second countdown timer. A ground worker stepped near the swing radius.",
        "difficulty": "Intermediate",
        "recommended_for": ["sos_protocol", "portal_safety"],
        "portal_feature": "45-Second SOS Alert & Auto-Escalation Engine",
        "options": [
            {
                "id": "opt_a",
                "text": "Throttle down, set hydraulic lockout, confirm the worker moved to the safety zone, and tap the large green 'ACKNOWLEDGE SAFE' button within 45s.",
                "safety_score": 100,
                "efficiency_score": 95,
                "feedback": "PERFECT: Acknowledging within 45s records response time in the supervisor telemetry log and avoids false site-wide emergency alarms.",
                "badge_unlocked": "Rapid Responder"
            },
            {
                "id": "opt_b",
                "text": "Ignore the countdown and keep digging. Let the 45-second timer expire.",
                "safety_score": 10,
                "efficiency_score": 30,
                "feedback": "ESCALATION TRIGGERED: Unacknowledged alerts automatically escalate to the supervisor office via WebSocket, SMS, and email, halting site operations.",
                "badge_unlocked": None
            },
            {
                "id": "opt_c",
                "text": "Hit the tablet power button or dismiss dialog to silence the beeping without checking outside.",
                "safety_score": 0,
                "efficiency_score": 10,
                "feedback": "CRITICAL VIOLATION: Muting safety alarms without visual confirmation of personnel clearance bypasses CAT safety interlocks.",
                "badge_unlocked": None
            }
        ]
    },
    {
        "id": "SCEN-PORTAL-03",
        "category": "portal",
        "title": "Task Lifecycle: Start, AI Duration Variance, & Completion Logging",
        "task_type": "Earth Excavation",
        "weather": "Rainy",
        "machine_age_yrs": 4.0,
        "active_condition": "Rain begins during excavation. The CAT AI Duration Predictor adds +16% weather variance to your scheduled window. You complete the excavation in 52 mins.",
        "difficulty": "Beginner",
        "recommended_for": ["task_management", "portal_basics"],
        "portal_feature": "Today's Tasks & AI Duration Predictor",
        "options": [
            {
                "id": "opt_a",
                "text": "Tap 'Start Task' at shift commencement, work safely per AI weather-adjusted duration, then tap 'Complete Task' and log actual duration (52 min).",
                "safety_score": 95,
                "efficiency_score": 100,
                "feedback": "OUTSTANDING: Proper task lifecycle tracking trains the predictive regression model and builds your operator accuracy score.",
                "badge_unlocked": "Operations Master"
            },
            {
                "id": "opt_b",
                "text": "Leave all tasks in 'Upcoming' status and tell the supervisor verbally at the end of the week.",
                "safety_score": 40,
                "efficiency_score": 20,
                "feedback": "INEFFICIENT: Leaves site dispatcher blind to live task progression and breaks equipment scheduling.",
                "badge_unlocked": None
            }
        ]
    },

    # =========================================================================
    # TRACK 2: OPERATOR CABIN & JOBSITE SAFETY PROTOCOLS
    # =========================================================================
    {
        "id": "SCEN-SAFE-01",
        "category": "safety",
        "title": "Seatbelt Compliance & Ghost Idling Penalty",
        "task_type": "Material Loading",
        "weather": "Sunny",
        "machine_age_yrs": 4.0,
        "active_condition": "Waiting for haul trucks. You unfasten your seatbelt while the engine remains engaged at high idle (1800 RPM). Telemetry begins logging an idle penalty.",
        "difficulty": "Beginner",
        "recommended_for": ["seatbelt_compliance", "ghost_idling"],
        "portal_feature": "Telemetry Anomaly & Idle Cost Tracker",
        "options": [
            {
                "id": "opt_a",
                "text": "Refasten seatbelt immediately or disengage engine hydraulics to low Eco-Idle, eliminating fuel waste ($1.35/L) and safety violation flags.",
                "safety_score": 100,
                "efficiency_score": 100,
                "feedback": "EXCELLENT: Eliminates $12+/hr idle fuel penalty and prevents severe in-cab injury in the event of ground shift or collision.",
                "badge_unlocked": "Eco-Operator Master"
            },
            {
                "id": "opt_b",
                "text": "Leave seatbelt unbuckled and rev engine with full A/C to keep cab cool while waiting 40 minutes.",
                "safety_score": 30,
                "efficiency_score": 10,
                "feedback": "POOR: Flagged as 'Ghost Idling' (>40 min with <3 cycles) and logs an unbuckled seatbelt safety violation directly on supervisor dashboard.",
                "badge_unlocked": None
            }
        ]
    },
    {
        "id": "SCEN-SAFE-02",
        "category": "safety",
        "title": "Trenching in Heavy Rain with Proximity Sensor Alarm",
        "task_type": "Trenching",
        "weather": "Rainy",
        "machine_age_yrs": 6.0,
        "active_condition": "Heavy rain has turned the trench wall muddy. Proximity sonar alerts ground crew within 2 meters on the blind spot counterweight radius.",
        "difficulty": "Intermediate",
        "recommended_for": ["proximity_hazard", "rainy_mud_trenching"],
        "portal_feature": "Proximity Sensor & Collision Mitigation",
        "options": [
            {
                "id": "opt_a",
                "text": "Throttle down immediately, disengage hydraulic pilot lock, sound horn twice, and visually confirm ground personnel clearance before resuming at 50% slewing speed.",
                "safety_score": 100,
                "efficiency_score": 90,
                "feedback": "FULL COMPLIANCE: Standard CAT safety protocol. Disengaging pilot control locks swing until ground personnel are clear.",
                "badge_unlocked": "Proximity Guardian"
            },
            {
                "id": "opt_b",
                "text": "Keep swinging the boom rapidly to clear the trench before soil collapses, relying on side mirrors.",
                "safety_score": 0,
                "efficiency_score": 20,
                "feedback": "CRITICAL RISK: Swinging near blind-spot ground personnel in wet conditions can cause fatal strikes or wall cave-ins.",
                "badge_unlocked": None
            }
        ]
    },
    {
        "id": "SCEN-SAFE-03",
        "category": "safety",
        "title": "Steep Slope Grading with Low Fuel Emergency",
        "task_type": "Grading",
        "weather": "Windy",
        "machine_age_yrs": 5.0,
        "active_condition": "Finishing road shoulder on a 25-degree incline. Fuel gauge flashes below 10%, risking fuel pump starvation and hydraulic assist cut-off.",
        "difficulty": "Expert",
        "recommended_for": ["slope_stability", "equipment_preservation"],
        "portal_feature": "Incline & Mechanical Health Warning",
        "options": [
            {
                "id": "opt_a",
                "text": "Immediately orient the implement downhill, track smoothly down to flat ground, lower bucket to ground, and request fuel bowser via voice co-pilot.",
                "safety_score": 100,
                "efficiency_score": 95,
                "feedback": "PERFECT: Prevents engine stall on slope which disables hydraulic braking assist and risks runaway.",
                "badge_unlocked": "Grade Master"
            },
            {
                "id": "opt_b",
                "text": "Accelerate and try to finish the remaining 30 meters of incline grading before the fuel runs dry.",
                "safety_score": 10,
                "efficiency_score": 25,
                "feedback": "DANGEROUS: Running out of fuel on a slope creates an immediate rollover hazard.",
                "badge_unlocked": None
            }
        ]
    }
]

# Operator progress badges and points store
OPERATOR_PROGRESS: Dict[str, Dict[str, Any]] = {
    "OP1001": {
        "points": 350,
        "badges": ["Voice Co-Pilot Certified", "Rapid Responder", "Proximity Guardian"],
        "completed_scenarios": ["SCEN-PORTAL-01", "SCEN-SAFE-02"]
    },
    "OP1002": {
        "points": 210,
        "badges": ["Eco-Operator Master", "Operations Master"],
        "completed_scenarios": ["SCEN-SAFE-01"]
    },
    "OP1003": {
        "points": 90,
        "badges": ["Cabin Rookie"],
        "completed_scenarios": []
    }
}
