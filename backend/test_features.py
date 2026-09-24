import asyncio
from database import get_db_connection
from main import (
    get_geofences,
    get_gps_anomalies,
    get_site_weather,
    create_task,
    approve_weather_for_task,
    assign_remedial_training,
    get_safety_alerts,
    calculate_distance_meters,
    find_nearest_buddy_operator,
    trigger_safety_alert,
    escalate_safety_alert,
    get_operator_buddy_alerts,
    respond_to_buddy_alert,
    get_machine_geofence_proximity,
    get_operator_geofence_proximity,
    acknowledge_geofence_proximity,
    get_sos_correlations,
    order_mass_evacuation,
    resolve_sos_correlation,
    get_supervisor_thresholds,
    update_supervisor_thresholds,
    anomaly_detector,
    get_fleet_duty_cycles,
    get_operator_duty_cycle,
    schedule_machine_cooldown,
    complete_machine_cooldown,
    log_fatigue_event,
    api_recalibrate_model,
    json_login,
    get_current_user_profile,
    get_quick_demo_token
)
from models import (
    TaskCreate, WeatherApprovalRequest, SafetyAlertCreate, BuddyAlertResponseRequest,
    EvacuationOrderRequest, ThresholdsUpdateRequest, ScheduleCooldownRequest, FatigueEventCreate,
    RecalibrateRequest, LoginRequest
)

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

    # 7. Proximity Haversine Distance Test
    # EXC001 (40.7132, -74.0058) to BLD001 (40.7139, -74.0062) ~84.5 meters
    dist = calculate_distance_meters(40.7132, -74.0058, 40.7139, -74.0062)
    print(f"[OK] Haversine Distance between EXC001 and BLD001: {dist} meters")
    assert 75.0 <= dist <= 95.0, f"Expected distance ~84m, got {dist}m"

    # 8. Nearest Buddy Operator Lookup
    conn = get_db_connection()
    nearest = find_nearest_buddy_operator("EXC001", conn)
    conn.close()
    assert nearest is not None, "Expected nearest buddy operator for EXC001"
    print(f"[OK] Nearest Buddy for EXC001: {nearest['buddy_operator_name']} ({nearest['buddy_machine_model']}) at {nearest['distance_meters']}m")
    assert nearest["buddy_machine_id"] == "BLD001"
    assert nearest["buddy_operator_id"] == "OP1003"
    assert nearest["distance_meters"] < 100.0

    # 9. Trigger Safety Alert & Auto-Escalate with Proximity Buddy Failover
    new_alert = await trigger_safety_alert(SafetyAlertCreate(
        machine_id="EXC001",
        operator_id="OP1001",
        alert_type="Critical Unacknowledged SOS Event",
        notes="Operator cabin unresponsive after 45s timer expired"
    ))
    print(f"[OK] Triggered Safety Alert: {new_alert['alert_id']} ({new_alert['alert_type']})")
    assert new_alert["status"] == "active"

    escalated = await escalate_safety_alert(new_alert["alert_id"])
    print(f"[OK] Alert {escalated['alert_id']} escalated. Status: {escalated['status']}")
    assert escalated["status"] == "escalated"
    assert escalated.get("buddy_failover") is not None
    buddy_info = escalated["buddy_failover"]
    print(f"[OK] Auto-dispatched Buddy Failover {buddy_info['failover_id']} to {buddy_info['buddy_operator_name']} ({buddy_info['distance_meters']}m away)")
    assert buddy_info["buddy_operator_id"] == "OP1003"
    assert buddy_info["status"] == "pending"

    # 10. Query Operator Incoming Buddy Alerts
    operator_buddy_alerts = get_operator_buddy_alerts("OP1003")
    print(f"[OK] Operator OP1003 has {len(operator_buddy_alerts)} active buddy alert(s)")
    assert len(operator_buddy_alerts) > 0
    matched = next((b for b in operator_buddy_alerts if b["failover_id"] == buddy_info["failover_id"]), None)
    assert matched is not None

    # 11. Buddy Operator Acknowledges & En Route
    response_result = await respond_to_buddy_alert(
        buddy_info["failover_id"],
        BuddyAlertResponseRequest(status="en_route", notes="Operator Carlos Gomez acknowledging, throttled down and navigating to Zone A Quarry North.")
    )
    print(f"[OK] Buddy Responder Status Updated: {response_result['status']} ({response_result['notes']})")
    assert response_result["status"] == "en_route"
    assert "Carlos Gomez" in response_result["notes"]

    # 12. Verify Safety Alerts list includes Buddy Failover details
    refreshed_alerts = get_safety_alerts()
    matched_alert = next((a for a in refreshed_alerts if a["alert_id"] == new_alert["alert_id"]), None)
    assert matched_alert is not None
    assert matched_alert.get("buddy_failover") is not None
    assert matched_alert["buddy_failover"]["status"] == "en_route"
    print(f"[OK] Safety Alert {matched_alert['alert_id']} verified with enriched buddy failover: Status '{matched_alert['buddy_failover']['status']}'")

    # 13. Operator Geofence Proximity: Nominal Zone Machine (EXC001)
    prox_exc1 = get_machine_geofence_proximity("EXC001")
    print(f"[OK] EXC001 Geofence Proximity: Level='{prox_exc1['warning_level']}', Dist={prox_exc1['distance_to_restricted_m']}m, Msg='{prox_exc1['warning_message']}'")
    assert prox_exc1["warning_level"] == "safe"
    assert prox_exc1["is_geofence_breached"] is False
    assert prox_exc1["distance_to_restricted_m"] > 50.0

    # 14. Operator Geofence Proximity: Critical Breach Machine (EXC002 inside Blast Zone)
    prox_exc2 = get_machine_geofence_proximity("EXC002")
    print(f"[OK] EXC002 Geofence Proximity: Level='{prox_exc2['warning_level']}', Dist={prox_exc2['distance_to_restricted_m']}m, Breach={prox_exc2['is_geofence_breached']}")
    assert prox_exc2["warning_level"] == "critical"
    assert prox_exc2["is_geofence_breached"] is True
    assert prox_exc2["distance_to_restricted_m"] == 0.0
    assert "Blast" in prox_exc2["nearest_restricted_zone_name"]

    # 15. Operator Assigned Machine Proximity Evaluation
    op_prox = get_operator_geofence_proximity("OP1001")
    print(f"[OK] Operator OP1001 Geofence Proximity retrieved: Machine={op_prox['machine_id']}, Level={op_prox['warning_level']}")
    assert op_prox["machine_id"] in ["EXC001", "EXC002"]

    # 16. Operator Acknowledge Proximity Warning Action
    ack_res = await acknowledge_geofence_proximity("OP1001")
    print(f"[OK] Operator Proximity Acknowledgement: {ack_res}")
    assert ack_res["status"] == "acknowledged"

    # 17. Multi-Operator SOS Correlation: Trigger second distress alarm in Zone A - Quarry North
    # Carlos Gomez (OP1003) on BLD001 triggers emergency in same zone within 5 minutes of Jake Miller (OP1001)
    second_alert = await trigger_safety_alert(SafetyAlertCreate(
        machine_id="BLD001",
        operator_id="OP1003",
        alert_type="Structural Rockfall Hazard SOS",
        notes="Massive rock slide along highwall boundary in Zone A - Quarry North"
    ))
    print(f"[OK] Second Safety Alert Triggered: {second_alert['alert_id']} ({second_alert['alert_type']})")
    assert second_alert["status"] == "active"

    # 18. Verify Multi-Operator SOS Correlation Cluster Detection
    correlations = get_sos_correlations(zone="Zone A - Quarry North")
    print(f"[OK] Retrieved {len(correlations)} SOS Correlation(s) in Zone A - Quarry North")
    assert len(correlations) > 0
    active_corr = next((c for c in correlations if c["status"] in ("active_emergency", "evacuation_ordered")), None)
    assert active_corr is not None, "Expected active correlation emergency cluster"
    print(f"[OK] Active Correlation Incident: ID={active_corr['correlation_id']}, Operators={active_corr['operator_count']}, Status={active_corr['status']}")
    assert active_corr["operator_count"] >= 2
    assert "OP1001" in active_corr["operator_ids"]
    assert "OP1003" in active_corr["operator_ids"]
    assert "EXC001" in active_corr["machine_ids"]
    assert "BLD001" in active_corr["machine_ids"]

    # 19. Dispatch Mass Zone Evacuation Order
    evac_res = await order_mass_evacuation(
        active_corr["correlation_id"],
        EvacuationOrderRequest(
            muster_zone="Muster Point Charlie (Highway Access Gate)",
            notes="Rockfall hazard confirmed across North face. Immediate cabin evacuation mandatory."
        )
    )
    print(f"[OK] Mass Evacuation Ordered: ID={evac_res['correlation_id']}, Status='{evac_res['status']}', OrderedAt={evac_res['evacuation_ordered_at']}")
    assert evac_res["status"] == "evacuation_ordered"
    assert evac_res["evacuation_ordered_at"] is not None
    assert "Muster Point Charlie" in evac_res["notes"]

    # 20. Contain & Resolve Multi-Operator Emergency
    resolve_res = await resolve_sos_correlation(
        active_corr["correlation_id"],
        notes="Site engineer completed geotechnical inspection. Zone safe, all operators accounted for."
    )
    print(f"[OK] Multi-Operator Incident Resolved: Status='{resolve_res['status']}'")
    assert resolve_res["status"] == "resolved"
    assert "RESOLVED" in resolve_res["notes"]

    # 21. Get Default Site Thresholds
    thresh = get_supervisor_thresholds()
    print(f"[OK] Retrieved Site Thresholds: IdleLimit={thresh['idle_limit_min']}m, SOS={thresh['sos_timeout_sec']}s, Diesel=${thresh['diesel_cost_per_liter']}/L, Sensitivity={thresh['anomaly_sensitivity']}")
    assert thresh["idle_limit_min"] > 0
    assert thresh["sos_timeout_sec"] >= 30
    assert thresh["diesel_cost_per_liter"] > 0

    # 22. Dynamically Update Site Thresholds via API
    updated_thresh = await update_supervisor_thresholds(ThresholdsUpdateRequest(
        idle_limit_min=30.0,
        diesel_cost_per_liter=1.85,
        idle_burn_rate_l_per_hour=4.0,
        sos_timeout_sec=50,
        anomaly_sensitivity="strict",
        duty_cycle_max_hours=4.5,
        cooldown_period_min=20
    ))
    print(f"[OK] Dynamically Updated Thresholds: IdleLimit={updated_thresh['idle_limit_min']}m, Diesel=${updated_thresh['diesel_cost_per_liter']}/L, Burn={updated_thresh['idle_burn_rate_l_per_hour']}L/h, SOS={updated_thresh['sos_timeout_sec']}s")
    assert updated_thresh["idle_limit_min"] == 30.0
    assert updated_thresh["diesel_cost_per_liter"] == 1.85
    assert updated_thresh["idle_burn_rate_l_per_hour"] == 4.0
    assert updated_thresh["sos_timeout_sec"] == 50
    assert updated_thresh["anomaly_sensitivity"] == "strict"
    assert updated_thresh["duty_cycle_max_hours"] == 4.5
    assert updated_thresh["cooldown_period_min"] == 20

    # Verify runtime AnomalyDetector was immediately synchronized
    assert anomaly_detector.idle_limit_min == 30.0
    assert anomaly_detector.diesel_cost_per_liter == 1.85
    assert anomaly_detector.idle_burn_rate_l_per_hour == 4.0
    assert anomaly_detector.anomaly_sensitivity == "strict"

    # 23. Dynamic Anomaly Recalculation under new Thresholds
    # Telemetry with 35 min idle was previously NOT ghost idle under 40 min limit.
    # Under new 30 min limit, it MUST be flagged as ghost idle!
    telemetry_sample = {
        "machine_id": "EXC001",
        "operator_id": "OP1001",
        "timestamp": "2026-09-24T00:00:00Z",
        "idling_time_min": 35.0,
        "load_cycles": 2,
        "seatbelt_status": "Fastened"
    }
    rec_analysis = anomaly_detector.analyze_record(telemetry_sample)
    print(f"[OK] Dynamic Anomaly Evaluation (35m idle under 30m limit): GhostIdle={rec_analysis['is_ghost_idle']}, Cost=${rec_analysis['estimated_idle_cost_usd']}, FuelWasted={rec_analysis['fuel_wasted_l']}L")
    assert rec_analysis["is_ghost_idle"] is True, "35 min idle should be flagged under 30 min limit"
    assert rec_analysis["estimated_idle_cost_usd"] > 4.00

    # 24. Reset Thresholds back to Factory Defaults
    reset_thresh = await update_supervisor_thresholds(ThresholdsUpdateRequest(
        idle_limit_min=40.0,
        diesel_cost_per_liter=1.35,
        idle_burn_rate_l_per_hour=3.6,
        sos_timeout_sec=45,
        anomaly_sensitivity="standard",
        duty_cycle_max_hours=4.0,
        cooldown_period_min=15
    ))
    print(f"[OK] Re-set Factory Defaults: IdleLimit={reset_thresh['idle_limit_min']}m, Diesel=${reset_thresh['diesel_cost_per_liter']}/L, SOS={reset_thresh['sos_timeout_sec']}s")
    assert reset_thresh["idle_limit_min"] == 40.0
    assert reset_thresh["diesel_cost_per_liter"] == 1.35
    assert anomaly_detector.idle_limit_min == 40.0
    assert anomaly_detector.diesel_cost_per_liter == 1.35

    # 25. Fleet Duty Cycle Evaluation (Nominal Machine)
    # Ensure EXC001 continuous_operating_hours is reset or set to 4.2 for duty test
    conn = get_db_connection()
    conn.execute("UPDATE machines SET continuous_operating_hours = 1.8 WHERE machine_id = 'EXC002';")
    conn.execute("UPDATE machines SET continuous_operating_hours = 4.2 WHERE machine_id = 'EXC001';")
    conn.commit()
    conn.close()

    fleet_cycles = get_fleet_duty_cycles()
    print(f"[OK] Fleet Duty Cycles Retrieved: {len(fleet_cycles)} machines tracked")
    assert len(fleet_cycles) >= 4, "Expected at least 4 machines tracked"
    
    exc2_cycle = next((c for c in fleet_cycles if c["machine_id"] == "EXC002"), None)
    assert exc2_cycle is not None
    assert exc2_cycle["is_cooldown_required"] is False
    assert exc2_cycle["cooldown_status"] == "nominal"
    assert exc2_cycle["continuous_engine_hours"] == 1.8
    assert exc2_cycle["duty_limit_hours"] == 4.0
    print(f"[OK] EXC002 Nominal Duty Cycle Verified: {exc2_cycle['continuous_engine_hours']}h / {exc2_cycle['duty_limit_hours']}h, Status='{exc2_cycle['cooldown_status']}'")

    # 26. Duty Cycle Limit Exceeded (Thermal Rest Recommended for EXC001)
    exc1_cycle = next((c for c in fleet_cycles if c["machine_id"] == "EXC001"), None)
    assert exc1_cycle is not None
    print(f"[OK] EXC001 Duty Cycle Limit Exceeded: {exc1_cycle['continuous_engine_hours']}h / {exc1_cycle['duty_limit_hours']}h, Required={exc1_cycle['is_cooldown_required']}, Status='{exc1_cycle['cooldown_status']}'")
    assert exc1_cycle["continuous_engine_hours"] >= 4.0
    assert exc1_cycle["is_cooldown_required"] is True
    assert exc1_cycle["cooldown_status"] == "cooldown_recommended"
    assert "MANDATORY REST DUE" in exc1_cycle["recommended_action"]

    # Verify Operator Duty Cycle endpoint for OP1001 (assigned to EXC001 or EXC002)
    op_duty = get_operator_duty_cycle("OP1001")
    assert op_duty is not None
    print(f"[OK] Operator OP1001 Machine Duty Cycle: Machine={op_duty['machine_id']}, Continuous={op_duty['continuous_engine_hours']}h, Status='{op_duty['cooldown_status']}'")

    # 27. Schedule Cooldown Task
    cooldown_res = await schedule_machine_cooldown("EXC001", ScheduleCooldownRequest(
        cooldown_duration_min=15,
        notes="Mandatory hydraulic and transmission thermal resting window."
    ))
    print(f"[OK] Cooldown Scheduled for EXC001: Task={cooldown_res['cooldown_task_id']}, Status='{cooldown_res['cooldown_status']}', Duration={cooldown_res['cooldown_duration_min']}m")
    assert cooldown_res["cooldown_status"] == "cooling_down"
    assert cooldown_res["is_cooldown_required"] is False
    assert cooldown_res["cooldown_task_id"] is not None

    # Verify task was created in tasks table
    conn = get_db_connection()
    cd_task = conn.execute("""
        SELECT t.*, ttp.estimated_time_min
        FROM tasks t
        LEFT JOIN task_time_predictions ttp ON t.task_id = ttp.task_id
        WHERE t.task_id = ?;
    """, (cooldown_res["cooldown_task_id"],)).fetchone()
    conn.close()
    assert cd_task is not None
    assert cd_task["status"] == "in-progress"
    assert "Cooldown" in cd_task["task_type"]
    assert cd_task["estimated_time_min"] == 15

    # 28. Complete Cooldown & Reset Duty Cycle to 0.0h
    completed_res = await complete_machine_cooldown("EXC001")
    print(f"[OK] Cooldown Completed for EXC001: Continuous={completed_res['continuous_engine_hours']}h, Status='{completed_res['cooldown_status']}', LastCooldown={completed_res['last_cooldown_at']}")
    assert completed_res["continuous_engine_hours"] == 0.0
    assert completed_res["cooldown_status"] == "nominal"
    assert completed_res["is_cooldown_required"] is False
    assert completed_res["last_cooldown_at"] is not None

    # Verify task in DB marked as done
    conn = get_db_connection()
    cd_task_done = conn.execute("SELECT * FROM tasks WHERE task_id = ?;", (cooldown_res["cooldown_task_id"],)).fetchone()
    conn.close()
    assert cd_task_done["status"] == "done"

    # 29. Fatigue / Microsleep Event Logging via Autonomous Vision Engine
    conn = get_db_connection()
    initial_violations = conn.execute("SELECT safety_violations_ytd FROM operators WHERE operator_id = 'OP1001';").fetchone()["safety_violations_ytd"] or 0
    conn.close()

    fat_event = await log_fatigue_event("OP1001", FatigueEventCreate(
        operator_id="OP1001",
        machine_id="EXC001",
        eye_closure_duration_sec=2.4,
        notes="Autonomous in-cab camera detected prolonged eye closure (2.4s >= 2.0s threshold)."
    ))
    print(f"[OK] Fatigue Alert Triggered: Event={fat_event['event_id']}, Alert={fat_event['alert_id']}, Duration={fat_event['eye_closure_duration_sec']}s, Status='{fat_event['status']}'")
    assert fat_event["status"] == "active"
    assert fat_event["eye_closure_duration_sec"] == 2.4
    assert fat_event["alert_id"].startswith("ALT-")

    # Verify safety_alerts record
    conn = get_db_connection()
    alert_rec = conn.execute("SELECT * FROM safety_alerts WHERE alert_id = ?;", (fat_event["alert_id"],)).fetchone()
    assert alert_rec is not None
    assert alert_rec["alert_type"] == "Operator Fatigue / Microsleep Detected"
    assert alert_rec["operator_id"] == "OP1001"
    assert alert_rec["status"] == "active"

    # 30. Operator Violation Count Increment & Remedial Simulator Assignment
    updated_violations = conn.execute("SELECT safety_violations_ytd FROM operators WHERE operator_id = 'OP1001';").fetchone()["safety_violations_ytd"]
    conn.close()
    print(f"[OK] Operator Violations Incremented: {initial_violations} -> {updated_violations}")
    assert updated_violations == initial_violations + 1

    # Assign remedial training module for fatigue event
    remedial_assign = await assign_remedial_training(fat_event["alert_id"], {"scenario_id": "SCEN-SAFE-01"})
    print(f"[OK] Remedial Simulator Scenario Assigned for Fatigue Alert: {remedial_assign}")
    assert remedial_assign["status"] == "assigned"
    assert remedial_assign["scenario_id"] == "SCEN-SAFE-01"

    # 31. Dynamic ML Model Recalibration via API
    recal_result = await api_recalibrate_model(RecalibrateRequest(
        supervisor_id="SUP001",
        idle_bias_adjustment_pct=15.0,
        sensitivity_factor=1.05,
        reason="Real-time site operational drift correction"
    ))
    print(f"[OK] ML Model Recalibrated: Version={recal_result['model_version']}, BaselineMAE={recal_result['baseline_mae']}m, NewMAE={recal_result['recalibrated_mae']}m, Lift={recal_result['mae_lift_pct']}%")
    assert recal_result["status"] == "recalibrated"
    assert recal_result["adjustment_bias_min"] == 1.5
    assert recal_result["recalibrated_mae"] < recal_result["baseline_mae"]
    assert recal_result["mae_lift_pct"] > 0.0

    # 32. OAuth 2.0 / JWT Authentication (Supervisor Login)
    sup_token = await json_login(LoginRequest(username="sarah.jenkins", password="cat2026"))
    print(f"[OK] JWT Issued for Supervisor: Role={sup_token['role']}, User={sup_token['name']}, Token={sup_token['access_token'][:25]}...")
    assert sup_token["role"] == "supervisor"
    assert sup_token["user_id"] == "SUP001"
    assert len(sup_token["access_token"].split(".")) == 3
    assert "manage_tasks" in sup_token["permissions"]
    assert "recalibrate_ml" in sup_token["permissions"]

    # 33. JWT Token Verification & RBAC Profile Access
    sup_profile = await get_current_user_profile(f"Bearer {sup_token['access_token']}")
    print(f"[OK] Verified User Profile: Name='{sup_profile['name']}', Role='{sup_profile['role']}', PermCount={len(sup_profile['permissions'])}")
    assert sup_profile["user_id"] == "SUP001"
    assert sup_profile["role"] == "supervisor"

    # 34. OAuth 2.0 / JWT Authentication (Operator Login)
    op_token = await json_login(LoginRequest(username="james.vance", password="cat2026"))
    print(f"[OK] JWT Issued for Operator: Role={op_token['role']}, User={op_token['name']}, Machine={op_token['user_id']}")
    assert op_token["role"] == "operator"
    assert op_token["user_id"] == "OP1001"
    assert "view_fatigue" in op_token["permissions"]

    # 35. 1-Tap Quick Token Persona Switcher (For frictionless live judging evaluation)
    quick_sup = await get_quick_demo_token("supervisor")
    quick_op = await get_quick_demo_token("operator")
    print(f"[OK] 1-Tap Quick Token Generator: Supervisor={quick_sup['name']}, Operator={quick_op['name']}")
    assert quick_sup["role"] == "supervisor"
    assert quick_op["role"] == "operator"
    assert len(quick_sup["access_token"].split(".")) == 3
    assert len(quick_op["access_token"].split(".")) == 3

    print("\n================================================================================")
    print("ALL 35 TESTS PASSED 100%! ENTIRE ROADMAP TEST SUITE VALIDATED PERFECTLY!")
    print("================================================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())
