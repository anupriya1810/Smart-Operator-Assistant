import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/common/Header';
import { TodayTasksView } from './components/operator/TodayTasksView';
import type { TaskItem } from './components/operator/TodayTasksView';
import { VoiceControlPanel } from './components/operator/VoiceControlPanel';
import { SosAlertModal } from './components/operator/SosAlertModal';
import { TrainingSimulatorModal } from './components/training/TrainingSimulatorModal';
import { FleetCustodyView } from './components/supervisor/FleetCustodyView';
import type { MachineItem } from './components/supervisor/FleetCustodyView';
import { TaskSchedulerModal } from './components/supervisor/TaskSchedulerModal';
import { SafetyAlertMonitor } from './components/supervisor/SafetyAlertMonitor';
import type { AlertItem } from './components/supervisor/SafetyAlertMonitor';
import { IdleAnomalyPanel } from './components/supervisor/IdleAnomalyPanel';
import type { TelemetryAnomaly } from './components/supervisor/IdleAnomalyPanel';
import { FleetGpsTracker } from './components/supervisor/FleetGpsTracker';
import { BuddyAlertModal } from './components/operator/BuddyAlertModal';
import type { BuddyFailover } from './components/operator/BuddyAlertModal';
import { OperatorGeofenceBanner } from './components/operator/OperatorGeofenceBanner';
import type { GeofenceProximity } from './components/operator/OperatorGeofenceBanner';
import { ThresholdConfigModal } from './components/supervisor/ThresholdConfigModal';
import type { SupervisorThresholdsData } from './components/supervisor/ThresholdConfigModal';
import { DutyCycleBanner } from './components/operator/DutyCycleBanner';
import type { DutyCycleInfo } from './components/operator/DutyCycleBanner';
import { FatigueMonitor } from './components/operator/FatigueMonitor';
import { API_BASE } from './config';
import {
  AlertOctagon,
  GraduationCap,
  PlusCircle,
  RefreshCw,
  HardHat,
  CloudRain,
  Sliders,
  Sparkles,
} from 'lucide-react';
import './i18n/translations';

export function App() {
  const { t } = useTranslation();

  // Role & Profile State
  const [role, setRole] = useState<'operator' | 'supervisor'>('operator');
  const [activeOperatorId, setActiveOperatorId] = useState<string>('OP1001');

  // Core Entity State
  const [operators, setOperators] = useState<any[]>([]);
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [anomalies, setAnomalies] = useState<TelemetryAnomaly[]>([]);
  const [thresholds, setThresholds] = useState<SupervisorThresholdsData | null>(null);
  const [operatorDutyCycle, setOperatorDutyCycle] = useState<DutyCycleInfo | null>(null);

  // JWT Auth & Recalibration State
  const [jwtToken, setJwtToken] = useState<string | null>(localStorage.getItem('cat_jwt_token') || null);
  const [recalibrationNotice, setRecalibrationNotice] = useState<string | null>(null);
  const [isRecalibrating, setIsRecalibrating] = useState<boolean>(false);

  // Modals & Safety Extensions
  const [activeAlert, setActiveAlert] = useState<any | null>(null);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [showBuddyModal, setShowBuddyModal] = useState(true);
  const [buddyAlerts, setBuddyAlerts] = useState<BuddyFailover[]>([]);
  const [proximityStatus, setProximityStatus] = useState<GeofenceProximity | null>(null);

  // Training simulator state
  const [trainingData, setTrainingData] = useState<{
    scenarios: any[];
    recommended_scenario_id: string;
    operator_progress: any;
  } | null>(null);

  // Fetch all initial data
  const fetchData = async () => {
    try {
      const [opsRes, machRes, tasksRes, alertsRes, anomRes, trainRes, buddyRes, proxRes, threshRes, dutyOpRes] = await Promise.all([
        fetch(`${API_BASE}/api/operators`),
        fetch(`${API_BASE}/api/machines`),
        fetch(`${API_BASE}/api/tasks`),
        fetch(`${API_BASE}/api/alerts`),
        fetch(`${API_BASE}/api/telemetry/anomalies`),
        fetch(`${API_BASE}/api/training/scenarios?operator_id=${activeOperatorId}`),
        fetch(`${API_BASE}/api/operators/${activeOperatorId}/buddy-alerts`),
        fetch(`${API_BASE}/api/operators/${activeOperatorId}/geofence-proximity`),
        fetch(`${API_BASE}/api/supervisor/thresholds`),
        fetch(`${API_BASE}/api/operators/${activeOperatorId}/duty-cycle`),
      ]);

      if (opsRes.ok) setOperators(await opsRes.json());
      if (machRes.ok) setMachines(await machRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (anomRes.ok) setAnomalies(await anomRes.json());
      if (trainRes.ok) setTrainingData(await trainRes.json());
      if (buddyRes && buddyRes.ok) {
        const bData = await buddyRes.json();
        setBuddyAlerts(bData);
        if (bData.length > 0) setShowBuddyModal(true);
      }
      if (proxRes && proxRes.ok) setProximityStatus(await proxRes.json());
      if (threshRes && threshRes.ok) setThresholds(await threshRes.json());
      if (dutyOpRes && dutyOpRes.ok) setOperatorDutyCycle(await dutyOpRes.json());
    } catch (err) {
      console.error('Error fetching data from backend:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeOperatorId]);

  const WS_BASE = API_BASE.replace(/^http/, 'ws');

  // Real-time WebSocket connection for live safety alert notifications & escalation
  useEffect(() => {
    let ws: WebSocket | null = null;
    const connectWs = () => {
      try {
        ws = new WebSocket(`${WS_BASE}/ws/alerts`);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[CABIN WS EVENT]', data);
            fetchData(); // Refresh on any event

            if (data.payload && data.payload.type === 'buddy_failover') {
              setShowBuddyModal(true);
            }

            if (data.payload && data.payload.type === 'thresholds_updated') {
              setThresholds(data.payload.thresholds);
            }

            if (data.payload && (data.payload.type === 'duty_cycle_cooldown_scheduled' || data.payload.type === 'duty_cycle_cooldown_completed')) {
              fetchData();
            }

            if (data.payload && data.payload.type === 'ml_model_recalibrated') {
              setRecalibrationNotice(`ML Model Recalibrated: ${data.payload.metrics.model_version} (MAE Lift: ${data.payload.metrics.mae_lift_pct}%)`);
              setTimeout(() => setRecalibrationNotice(null), 6000);
            }

            if (data.payload && data.payload.status === 'active') {
              setActiveAlert({
                alert_id: data.payload.alert_id,
                alert_type: data.payload.alert_type,
                machine_id: 'EXC001',
                operator_id: activeOperatorId,
                status: 'active',
              });
            }
          } catch (e) {}
        };
        ws.onerror = () => ws?.close();
      } catch (e) {}
    };

    connectWs();
    const interval = setInterval(fetchData, 10000); // Polling backup
    return () => {
      ws?.close();
      clearInterval(interval);
    };
  }, [activeOperatorId]);

  const currentOperator = operators.find(o => o.operator_id === activeOperatorId) || {
    operator_id: 'OP1001',
    name: 'Jake Miller',
    skill_level: 'Expert',
    timezone: 'America/New_York',
    preferred_language: 'en',
  };

  const assignedTasks = tasks.filter(t => t.operator_id === activeOperatorId);
  const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'escalated');

  // Handlers for Operator Actions
  const handleUpdateTaskStatus = async (taskId: string, status: string, actualMin?: number) => {
    try {
      await fetch(`${API_BASE}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actual_time_min: actualMin }),
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTriggerSos = async (alertType: string = 'Manual Operator Distress SOS') => {
    try {
      const res = await fetch(`${API_BASE}/api/alerts/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: 'EXC001',
          operator_id: activeOperatorId,
          alert_type: alertType,
          notes: 'Triggered from In-Cab Dashboard touch button',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveAlert(data);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await fetch(`${API_BASE}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator_id: activeOperatorId, notes: 'Cabin Verified Safe by Operator' }),
      });
      setActiveAlert(null);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEscalateAlert = async (alertId: string) => {
    try {
      await fetch(`${API_BASE}/api/alerts/${alertId}/escalate`, { method: 'POST' });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateRental = async (machineId: string, rentalData: any) => {
    await fetch(`${API_BASE}/api/machines/${machineId}/rental`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rentalData),
    });
    fetchData();
  };

  const handleCreateTask = async (taskData: any) => {
    await fetch(`${API_BASE}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    });
    fetchData();
  };

  const handleWeatherApproval = async (taskId: string, action: 'approve' | 'postpone') => {
    try {
      await fetch(`${API_BASE}/api/tasks/${taskId}/weather-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supervisor_id: 'SUP001', action }),
      });
      fetchData();
    } catch (e) {
      console.error('Weather approval error:', e);
    }
  };

  const handleRespondBuddyAlert = async (failoverId: string, status: 'en_route' | 'radio_contacted' | 'resolved', responderNotes?: string) => {
    try {
      await fetch(`${API_BASE}/api/buddy-alerts/${failoverId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes: responderNotes }),
      });
      fetchData();
      if (status === 'resolved') {
        setShowBuddyModal(false);
      }
    } catch (e) {
      console.error('Buddy alert response error:', e);
    }
  };

  const handleAcknowledgeProximity = async () => {
    try {
      await fetch(`${API_BASE}/api/operators/${activeOperatorId}/geofence-proximity/acknowledge`, {
        method: 'POST',
      });
      fetchData();
    } catch (e) {
      console.error('Proximity acknowledge error:', e);
    }
  };

  const handleSaveThresholds = async (updated: Partial<SupervisorThresholdsData>) => {
    try {
      const res = await fetch(`${API_BASE}/api/supervisor/thresholds`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const data = await res.json();
        setThresholds(data);
        fetchData();
      }
    } catch (e) {
      console.error('Save thresholds error:', e);
    }
  };

  const handleSwitchRoleWithJwt = async (newRole: 'operator' | 'supervisor') => {
    setRole(newRole);
    try {
      const res = await fetch(`${API_BASE}/api/auth/quick-token/${newRole}`, { method: 'POST' });
      if (res.ok) {
        const tokenData = await res.json();
        setJwtToken(tokenData.access_token);
        localStorage.setItem('cat_jwt_token', tokenData.access_token);
        if (newRole === 'operator') {
          setActiveOperatorId(tokenData.user_id);
        }
      }
    } catch (e) {
      console.warn('JWT quick token error:', e);
    }
  };

  const handleRecalibrateML = async () => {
    setIsRecalibrating(true);
    try {
      const res = await fetch(`${API_BASE}/api/ml/recalibrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({
          supervisor_id: 'SUP001',
          idle_bias_adjustment_pct: 12.0,
          sensitivity_factor: 1.05,
          reason: 'Manual supervisor dashboard calibration',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecalibrationNotice(`ML Recalibrated: ${data.model_version} | MAE Lift: ${data.mae_lift_pct}% error reduction vs baseline.`);
        setTimeout(() => setRecalibrationNotice(null), 6000);
        fetchData();
      }
    } catch (e) {
      console.error('Recalibrate error:', e);
    } finally {
      setIsRecalibrating(false);
    }
  };

  const handleScheduleCooldown = async (machineId: string) => {
    try {
      await fetch(`${API_BASE}/api/fleet/duty-cycles/${machineId}/schedule-cooldown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supervisor_id: 'SUP001', notes: 'Scheduled via portal' }),
      });
      fetchData();
    } catch (e) {
      console.error('Schedule cooldown error:', e);
    }
  };

  const handleCompleteCooldown = async (machineId: string) => {
    try {
      await fetch(`${API_BASE}/api/fleet/duty-cycles/${machineId}/complete-cooldown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified_by: activeOperatorId }),
      });
      fetchData();
    } catch (e) {
      console.error('Complete cooldown error:', e);
    }
  };

  const handleSubmitScenarioDecision = async (scenarioId: string, optionId: string) => {
    const res = await fetch(`${API_BASE}/api/training/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario_id: scenarioId,
        option_id: optionId,
        operator_id: activeOperatorId,
      }),
    });
    const result = await res.json();
    // Refresh training data
    const updated = await fetch(`${API_BASE}/api/training/scenarios?operator_id=${activeOperatorId}`);
    if (updated.ok) setTrainingData(await updated.json());
    return result;
  };

  return (
    <div
      className={role === 'operator' ? 'cat-theme-operator' : 'cat-theme-supervisor'}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--theme-bg)',
        color: 'var(--theme-text-primary)',
        transition: 'background-color 0.25s ease, color 0.25s ease',
      }}
    >
      {/* Top Bar with Role Switcher & Controls */}
      <Header
        currentRole={role}
        onRoleChange={handleSwitchRoleWithJwt}
        activeOperatorId={activeOperatorId}
        onOperatorChange={setActiveOperatorId}
        operators={operators}
        activeAlertCount={activeAlerts.length}
      />

      <main style={{ flex: 1, padding: '1.5rem 1.25rem', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        {/* ========================================================================= */}
        {/* OPERATOR IN-CAB HUD VIEW                                                  */}
        {/* ========================================================================= */}
        {role === 'operator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Cabin HUD Machine & Shift Banner */}
            <div
              style={{
                backgroundColor: 'var(--theme-banner-bg)',
                border: '1px solid var(--theme-banner-border)',
                borderLeft: '4px solid var(--cat-yellow)',
                boxShadow: 'var(--theme-shadow)',
                borderRadius: '12px',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                transition: 'background-color 0.25s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      backgroundColor: '#111111',
                      color: '#FFCD11',
                      border: '1px solid #333333',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <HardHat size={16} />
                    <span style={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.04em' }}>IN-CAB HUD</span>
                  </div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--theme-text-primary)' }}>
                    Cat 320 Hydraulic Excavator (EXC001)
                  </span>
                  <span className="cat-badge badge-custody">OWNED ASSET</span>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--theme-text-secondary)', marginTop: '6px' }}>
                  Operator: <strong style={{ color: 'var(--theme-text-primary)' }}>{currentOperator.name}</strong> ({currentOperator.skill_level}) &bull; Shift Timezone: <strong style={{ color: 'var(--theme-text-primary)' }}>{currentOperator.timezone}</strong>
                </div>
              </div>

              {/* In-Cab Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowTrainingModal(true)}
                  className="cat-btn cat-btn-secondary"
                  style={{ minHeight: '44px', fontSize: '0.875rem' }}
                >
                  <GraduationCap size={18} color="#FFCD11" />
                  {t('trainingHub')}
                  {trainingData?.operator_progress && (
                    <span
                      style={{
                        backgroundColor: '#FFCD11',
                        color: '#111111',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        marginLeft: '4px',
                      }}
                    >
                      {trainingData.operator_progress.points} pts
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleTriggerSos('Manual Operator SOS Press')}
                  className="cat-btn cat-btn-danger"
                  style={{ minHeight: '44px', fontSize: '0.875rem', padding: '0.5rem 1.25rem' }}
                >
                  <AlertOctagon size={18} />
                  {t('sosEmergency')}
                </button>
              </div>
            </div>

            {/* Safety Simulation Triggers banner */}
            <div
              style={{
                backgroundColor: 'var(--theme-subtle-bg)',
                border: '1px solid var(--theme-subtle-border)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--cat-yellow)', fontWeight: 700 }}>
                <span>⚡ Safety Simulator Triggers:</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleTriggerSos('Seatbelt Unfastened while Engine Engaged')}
                  className="cat-btn cat-btn-outline cat-btn-sm"
                >
                  Simulate Seatbelt Alert
                </button>
                <button
                  onClick={() => handleTriggerSos('Proximity Hazard: Ground Crew Detected < 2m')}
                  className="cat-btn cat-btn-outline cat-btn-sm"
                >
                  Simulate Proximity Hazard
                </button>
                <button
                  onClick={() => handleTriggerSos('Operator Fatigue / Microsleep Detected (>2s eye closure)')}
                  className="cat-btn cat-btn-outline cat-btn-sm"
                >
                  Simulate Fatigue Alert
                </button>
              </div>
            </div>

            {/* Critical Perimeter Geofence Breach Banner if active */}
            {proximityStatus && (proximityStatus.is_geofence_breached || proximityStatus.warning_level === 'critical') && (
              <OperatorGeofenceBanner
                proximity={proximityStatus}
                onAcknowledge={handleAcknowledgeProximity}
              />
            )}

            {/* Thermal / Duty Cycle Cooldown Banner if required */}
            {operatorDutyCycle && (operatorDutyCycle.is_cooldown_required || operatorDutyCycle.cooldown_status === 'cooling_down') && (
              <DutyCycleBanner
                dutyCycle={operatorDutyCycle}
                onScheduleCooldown={handleScheduleCooldown}
                onCompleteCooldown={handleCompleteCooldown}
              />
            )}

            {/* Main In-Cab Layout: Tasks & Voice Assistant */}
            <div className="cat-grid-dashboard">
              <TodayTasksView
                tasks={assignedTasks}
                operatorTimezone={currentOperator.timezone}
                onUpdateStatus={handleUpdateTaskStatus}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <VoiceControlPanel
                  operatorId={activeOperatorId}
                  machineId="EXC001"
                  onRefreshData={fetchData}
                  onTriggerSos={() => handleTriggerSos('Voice Triggered Emergency SOS')}
                />

                {/* Training Hub Quick Card */}
                {trainingData && (
                  <div className="cat-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--theme-text-primary)', fontSize: '0.95rem' }}>
                        <GraduationCap size={18} color="var(--cat-yellow)" />
                        <span>Portal &amp; Safety Simulator</span>
                      </div>
                      <span className="cat-badge badge-cat-brand">Score: {trainingData.operator_progress.points} pts</span>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                      Interactive modules for mastering in-cab portal tools (voice co-pilot, 45s SOS) and critical cabin safety protocols.
                    </p>

                    <div style={{ backgroundColor: 'var(--theme-subtle-bg)', border: '1px solid var(--theme-subtle-border)', padding: '0.5rem 0.75rem', borderRadius: '6px', marginBottom: '0.85rem', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--theme-text-muted)' }}>Telemetry Recommendation: </span>
                      <strong style={{ color: 'var(--theme-text-primary)' }}>
                        {trainingData.scenarios.find(s => s.id === trainingData.recommended_scenario_id)?.title || 'Portal & Safety Training'}
                      </strong>
                    </div>

                    <button
                      onClick={() => setShowTrainingModal(true)}
                      className="cat-btn cat-btn-primary"
                      style={{ width: '100%', minHeight: '44px', fontSize: '0.875rem' }}
                    >
                      Launch Operator Simulator
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Background Fatigue Vision Service */}
            <div style={{ display: 'none' }}>
              <FatigueMonitor
                operatorId={activeOperatorId}
                machineId={currentOperator.assigned_machine_id || 'EXC001'}
                onFatigueAlert={() => {
                  fetchData();
                  handleTriggerSos('Operator Fatigue / Microsleep Detected (>2s eye closure)');
                }}
                apiBase={API_BASE}
              />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUPERVISOR DASHBOARD VIEW                                                 */}
        {/* ========================================================================= */}
        {role === 'supervisor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Top Supervisor Controls & Metrics */}
            <div
              style={{
                backgroundColor: 'var(--theme-card-bg)',
                border: '1px solid var(--theme-card-border)',
                boxShadow: 'var(--theme-shadow)',
                borderRadius: '12px',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                transition: 'background-color 0.25s ease',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--theme-text-primary)' }}>
                  Marcus Vance &mdash; Site Operations Hub
                </h1>
                <p style={{ fontSize: '0.875rem', color: 'var(--theme-text-secondary)', marginTop: '4px' }}>
                  Managing <strong>{machines.length}</strong> machines across <strong>{operators.length}</strong> operators &bull; Coordinated UTC storage, viewing in <strong>America/New_York</strong>.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowSchedulerModal(true)}
                  className="cat-btn cat-btn-primary"
                  style={{ minHeight: '44px', fontSize: '0.875rem' }}
                >
                  <PlusCircle size={16} />
                  {t('scheduleTask')}
                </button>

                <button
                  onClick={() => setShowThresholdModal(true)}
                  className="cat-btn cat-btn-outline"
                  style={{ minHeight: '44px', fontSize: '0.875rem' }}
                >
                  <Sliders size={16} />
                  Site Thresholds
                </button>

                <button
                  onClick={handleRecalibrateML}
                  disabled={isRecalibrating}
                  className="cat-btn cat-btn-outline"
                  style={{ minHeight: '44px', fontSize: '0.875rem' }}
                >
                  <Sparkles size={16} color="var(--cat-yellow)" />
                  {isRecalibrating ? 'Recalibrating...' : 'Recalibrate ML'}
                </button>

                <button
                  onClick={fetchData}
                  className="cat-btn cat-btn-outline"
                  style={{ minHeight: '44px', fontSize: '0.875rem' }}
                >
                  <RefreshCw size={16} />
                  {t('refresh')}
                </button>
              </div>
            </div>

            {/* Recalibration Notice if active */}
            {recalibrationNotice && (
              <div
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10B981',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  color: '#34D399',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Sparkles size={16} />
                <span>{recalibrationNotice}</span>
              </div>
            )}

            {/* Weather Re-Approval Gate for High Wind / Heavy Rain Hazards */}
            {tasks.filter(t => t.weather_reapproval_required).length > 0 && (
              <div
                style={{
                  backgroundColor: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid var(--cat-warning)',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--cat-warning)', fontWeight: 800, fontSize: '0.95rem' }}>
                    <CloudRain size={20} />
                    <span>WEATHER RE-APPROVAL GATE ({tasks.filter(t => t.weather_reapproval_required).length} Tasks Awaiting Authorization)</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>Automated High Wind / Precipitation Safeguard</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {tasks.filter(t => t.weather_reapproval_required).map(t => (
                    <div
                      key={t.task_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid rgba(234, 179, 8, 0.25)',
                        padding: '0.75rem 1rem',
                        borderRadius: '6px',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 800, color: 'var(--theme-text-primary)' }}>{t.task_type}</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cat-yellow)', backgroundColor: '#111', padding: '1px 6px', borderRadius: '4px' }}>{t.task_id}</span>
                          <span className="cat-badge" style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)', color: 'var(--cat-warning)' }}>
                            Weather: {t.weather}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)', marginTop: '2px' }}>
                          Zone: <strong>{t.location_zone}</strong> &bull; Machine: {t.machine_model || t.machine_id} &bull; Driver: {t.operator_name || t.operator_id}
                        </div>
                        {t.notes && <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', fontStyle: 'italic', marginTop: '2px' }}>"{t.notes}"</div>}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleWeatherApproval(t.task_id, 'approve')}
                          className="cat-btn cat-btn-primary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', minHeight: '34px' }}
                        >
                          Authorize Exception
                        </button>
                        <button
                          onClick={() => handleWeatherApproval(t.task_id, 'postpone')}
                          className="cat-btn cat-btn-outline"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', minHeight: '34px' }}
                        >
                          Postpone Dispatch
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Safety Alert Monitor */}
            <SafetyAlertMonitor
              alerts={alerts}
              supervisorTimezone="America/New_York"
              onRefresh={fetchData}
            />

            {/* Fleet GPS Live Telemetry & Geofence Radar */}
            <FleetGpsTracker supervisorTimezone="America/New_York" />

            {/* Fleet & Custody Tracking */}
            <FleetCustodyView
              machines={machines}
              supervisorTimezone="America/New_York"
              onUpdateRental={handleUpdateRental}
            />

            {/* Idle & Telemetry Anomaly Panel (Photo 2) */}
            <IdleAnomalyPanel
              anomalies={anomalies}
              supervisorTimezone="America/New_York"
            />
          </div>
        )}
      </main>

      {/* SOS Alert Modal with dynamic Countdown & Auto-Escalation */}
      {activeAlert && (
        <SosAlertModal
          activeAlert={activeAlert}
          onAcknowledge={handleAcknowledgeAlert}
          onEscalate={handleEscalateAlert}
          onClose={() => setActiveAlert(null)}
          sosTimeoutSec={thresholds?.sos_timeout_sec || 45}
        />
      )}

      {/* 2D Decision Simulator Training Hub Modal */}
      {showTrainingModal && trainingData && (
        <TrainingSimulatorModal
          scenarios={trainingData.scenarios}
          recommendedScenarioId={trainingData.recommended_scenario_id}
          operatorProgress={trainingData.operator_progress}
          onClose={() => setShowTrainingModal(false)}
          onSubmitDecision={handleSubmitScenarioDecision}
        />
      )}

      {/* Task Scheduler Modal with Live AI Prediction */}
      {showSchedulerModal && (
        <TaskSchedulerModal
          operators={operators}
          machines={machines}
          onClose={() => setShowSchedulerModal(false)}
          onTaskCreated={handleCreateTask}
        />
      )}

      {/* Site Thresholds & Safety Limits Configuration Modal */}
      <ThresholdConfigModal
        isOpen={showThresholdModal}
        onClose={() => setShowThresholdModal(false)}
        currentThresholds={thresholds}
        onSave={handleSaveThresholds}
      />

      {/* Proximity Buddy Emergency Failover Modal */}
      {role === 'operator' && buddyAlerts.length > 0 && showBuddyModal && (
        <BuddyAlertModal
          failover={buddyAlerts[0]}
          onRespond={handleRespondBuddyAlert}
          onClose={() => setShowBuddyModal(false)}
        />
      )}
    </div>
  );
}

export default App;
