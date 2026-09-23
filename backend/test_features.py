import asyncio
from main import (
    get_geofences,
    get_gps_anomalies,
    get_site_weather,
    create_task,
    approve_weather_for_task,
    assign_remedial_training,
    get_safety_alerts
)
from models import TaskCreate, WeatherApprovalRequest

async def run_tests():
    # 1. Geofences
    geos = get_geofences()
    print(f"[OK] Geofences loaded: {len(geos)} zones defined")
    assert len(geos) >= 5, "Expected at least 5 geofence zones"

    # 2. GPS Anomalies
    anomalies = get_gps_anomalies()
    print(f"[OK] GPS Anomalies detected: {len(anomalies)} (e.g. {anomalies[0].anomaly_type})")
    assert len(anomalies) > 0, "Expected at least 1 anomaly for EXC002"
    assert any("Blast" in a.current_zone or a.machine_id == "EXC002" for a in anomalies)

    # 3. Live Site Weather
    w = get_site_weather(40.7135, -74.0055)
    print(f"[OK] Auto-detected site weather: {w.get('condition')} ({w.get('temperature_c')}C, wind {w.get('wind_speed_kmh')}km/h)")
    assert "condition" in w and "temperature_c" in w

    # 4. Create Task without weather and without estimated_time_min
    t = await create_task(TaskCreate(
        task_type="Earth Excavation",
        operator_id="OP1001",
        machine_id="EXC001",
        scheduled_start="2026-09-24T08:00:00Z",
        scheduled_end="2026-09-24T09:00:00Z",
        location_zone="Zone A - Quarry North",
        notes="Automated weather and duration verification"
    ))
    print(f"[OK] Task {t['task_id']} created with auto-weather '{t['weather']}', predicted min: {t['predicted_time_min']}, reapproval: {t.get('weather_reapproval_required')}")
    assert t["predicted_time_min"] > 0
    assert t["weather"] is not None

    # 5. Weather approval
    appr = await approve_weather_for_task(t["task_id"], WeatherApprovalRequest(
        supervisor_id="SUP001",
        action="approve",
        notes="Safe to operate"
    ))
    print(f"[OK] Weather approved for {appr['task_id']}, reapproval: {appr['weather_reapproval_required']}, approved_by: {appr['weather_approved_by']}")
    assert appr["weather_reapproval_required"] == 0
    assert appr["weather_approved_by"] == "SUP001"

    # 6. Assign training from alert
    alerts = get_safety_alerts()
    if alerts:
        a_id = alerts[0]["alert_id"]
        res = await assign_remedial_training(a_id, {"scenario_id": "SCEN-SAFE-01"})
        print(f"[OK] Assigned remedial training module for {a_id}: {res}")
        assert res["status"] == "assigned"

    print("\nALL NEW GPS, GEOFENCE, AUTO-WEATHER & REMEDIAL TRAINING TESTS PASSED 100%!")

if __name__ == "__main__":
    asyncio.run(run_tests())
