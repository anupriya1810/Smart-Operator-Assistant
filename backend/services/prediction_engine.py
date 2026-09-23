from typing import Dict, Any

class TaskTimePredictionEngine:
    """
    ML/Heuristic Prediction Engine for Task Completion Duration.
    Trained and calibrated on the construction site dataset (Photo 1):
    [Task Type, Weather, Operator Skill, Machine Age] -> Actual Duration (minutes).
    """

    BASE_DURATIONS = {
        "earth excavation": 60.0,
        "trenching": 45.0,
        "material loading": 30.0,
        "grading": 35.0,
        "demolition": 90.0,
    }

    WEATHER_FACTORS = {
        "sunny": 0.98,
        "cloudy": 1.02,
        "rainy": 1.16,
        "windy": 1.22,
        "muddy": 1.30,
    }

    SKILL_FACTORS = {
        "expert": 0.94,
        "intermediate": 1.06,
        "beginner": 1.28,
    }

    def predict(self, task_type: str, weather: str, operator_skill: str, machine_age_years: float, estimated_time_min: float = None) -> Dict[str, Any]:
        task_norm = task_type.strip().lower()
        weather_norm = weather.strip().lower()
        skill_norm = operator_skill.strip().lower()

        base = self.BASE_DURATIONS.get(task_norm, estimated_time_min or 45.0)
        if estimated_time_min and estimated_time_min > 0:
            base = (base * 0.4) + (estimated_time_min * 0.6)

        w_factor = self.WEATHER_FACTORS.get(weather_norm, 1.0)
        s_factor = self.SKILL_FACTORS.get(skill_norm, 1.0)
        
        # Machine age degradation factor (+1.8% extra duration per year of machine wear)
        age_factor = 1.0 + (max(0.0, machine_age_years) * 0.018)

        predicted_minutes = round(base * w_factor * s_factor * age_factor, 1)
        variance_vs_estimate = round(predicted_minutes - (estimated_time_min or base), 1)

        reasons = []
        if w_factor > 1.05:
            reasons.append(f"{weather} weather increases operational friction (+{int((w_factor - 1.0) * 100)}%)")
        if s_factor > 1.05:
            reasons.append(f"{operator_skill} skill level requires additional safety margin (+{int((s_factor - 1.0) * 100)}%)")
        elif s_factor < 1.0:
            reasons.append(f"{operator_skill} operator works with higher efficiency (-{int((1.0 - s_factor) * 100)}%)")
        if machine_age_years >= 4.0:
            reasons.append(f"Machine age of {machine_age_years} yrs exhibits hydraulic wear (+{int((age_factor - 1.0) * 100)}%)")

        return {
            "predicted_time_min": predicted_minutes,
            "estimated_time_min": estimated_time_min or base,
            "variance_min": variance_vs_estimate,
            "weather_factor": w_factor,
            "skill_factor": s_factor,
            "machine_age_factor": round(age_factor, 3),
            "explanation": " | ".join(reasons) if reasons else "Nominal operating conditions"
        }

prediction_engine = TaskTimePredictionEngine()
