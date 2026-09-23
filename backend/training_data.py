"""
Structured JSON scenarios for 2D Cabin Decision Simulator (Section 4)
"""
from typing import List, Dict, Any

SCENARIOS: List[Dict[str, Any]] = [
    {
        "id": "SCEN-001",
        "title": "Trenching in Heavy Rain with Proximity Sensor Alarm",
        "task_type": "Trenching",
        "weather": "Rainy",
        "machine_age_yrs": 6.0,
        "active_condition": "Heavy rain has turned the trench wall muddy. Proximity sonar alerts ground crew within 2 meters on the blind blind spot.",
        "difficulty": "Intermediate",
        "recommended_for": ["proximity_hazard", "rainy_mud_trenching"],
        "options": [
            {
                "id": "opt_a",
                "text": "Keep swinging the boom rapidly to clear the trench before soil collapses, relying on mirrors.",
                "safety_score": 0,
                "efficiency_score": 20,
                "feedback": "CRITICAL RISK: Swinging near blind spot ground personnel in rain can cause fatal strikes or trench cave-ins.",
                "badge_unlocked": None
            },
            {
                "id": "opt_b",
                "text": "Throttle down immediately, disengage hydraulic pilot lock, sound horn twice, and visually confirm ground personnel clearance before resuming at 50% slewing speed.",
                "safety_score": 100,
                "efficiency_score": 90,
                "feedback": "EXCELLENT: Full compliance with CAT safety protocols. Disengaging pilot control locks swing until blind spot is verified.",
                "badge_unlocked": "Proximity Guardian"
            },
            {
                "id": "opt_c",
                "text": "Rev the engine higher to maintain hydraulic power and sound the reverse beeper while backing up 5 meters.",
                "safety_score": 30,
                "efficiency_score": 50,
                "feedback": "UNSAFE: Backing up blindly on slippery mud increases rollover or track slippage into the trench.",
                "badge_unlocked": None
            }
        ]
    },
    {
        "id": "SCEN-002",
        "title": "Excessive Idling & Hydraulic Heat Creep",
        "task_type": "Material Loading",
        "weather": "Sunny",
        "machine_age_yrs": 4.0,
        "active_condition": "Waiting for haul trucks. Engine has been idling for 35 minutes at full RPM. Hydraulic oil temperature warning turns amber.",
        "difficulty": "Beginner",
        "recommended_for": ["ghost_idling", "fuel_waste"],
        "options": [
            {
                "id": "opt_a",
                "text": "Engage Auto-Engine Idle shutdown (or manually switch to Eco-Mode Low Idle) and report truck delay to site supervisor via voice.",
                "safety_score": 95,
                "efficiency_score": 100,
                "feedback": "OUTSTANDING: Conserves up to 3.8L of diesel per hour, prevents hydraulic oil thermal breakdown, and logs wait time.",
                "badge_unlocked": "Eco-Operator Master"
            },
            {
                "id": "opt_b",
                "text": "Keep the engine revved high with air conditioning on full blast so the cab stays cool.",
                "safety_score": 50,
                "efficiency_score": 10,
                "feedback": "POOR: Burns unnecessary diesel ($12+/hr waste) and accelerates hydraulic seal degradation.",
                "badge_unlocked": None
            },
            {
                "id": "opt_c",
                "text": "Continuously cycle the bucket back and forth to keep oil circulating through the cooler.",
                "safety_score": 40,
                "efficiency_score": 25,
                "feedback": "INEFFICIENT: False load cycling produces extra heat rather than cooling.",
                "badge_unlocked": None
            }
        ]
    },
    {
        "id": "SCEN-003",
        "title": "Steep Slope Grading with Low Fuel Warning",
        "task_type": "Grading",
        "weather": "Windy",
        "machine_age_yrs": 5.0,
        "active_condition": "Finishing road shoulder on a 25-degree incline. Fuel gauge flashes below 10%, risking fuel pump starvation.",
        "difficulty": "Expert",
        "recommended_for": ["slope_stability", "equipment_preservation"],
        "options": [
            {
                "id": "opt_a",
                "text": "Immediately orient the dozer blade downhill, track down to flat ground, lower implement, and call for mobile fuel bowser.",
                "safety_score": 100,
                "efficiency_score": 95,
                "feedback": "PERFECT: Prevents engine stalling on grade which would disable hydraulic braking assist.",
                "badge_unlocked": "Grade Master"
            },
            {
                "id": "opt_b",
                "text": "Speed up to finish the remaining 30 meters of grading before the fuel runs out.",
                "safety_score": 10,
                "efficiency_score": 30,
                "feedback": "DANGEROUS: Engine stall on a slope results in hydraulic lock loss and possible runaway.",
                "badge_unlocked": None
            }
        ]
    }
]

# In-memory badges and points store
OPERATOR_PROGRESS: Dict[str, Dict[str, Any]] = {
    "OP1001": {
        "points": 350,
        "badges": ["Trench Pro", "Safety First Level 2", "Proximity Guardian"],
        "completed_scenarios": ["SCEN-001"]
    },
    "OP1002": {
        "points": 210,
        "badges": ["Eco-Operator Master"],
        "completed_scenarios": ["SCEN-002"]
    },
    "OP1003": {
        "points": 90,
        "badges": ["Cabin Rookie"],
        "completed_scenarios": []
    }
}
