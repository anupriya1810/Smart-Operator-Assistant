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
import { AlertOctagon, GraduationCap, PlusCircle, RefreshCw, HardHat } from 'lucide-react';
import './i18n/translations';

const API_BASE = 'http://127.0.0.1:8000';

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

  // Modals
  const [activeAlert, setActiveAlert] = useState<any | null>(null);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);

  // Training simulator state
  const [trainingData, setTrainingData] = useState<{
    scenarios: any[];
    recommended_scenario_id: string;
    operator_progress: any;
  } | null>(null);


  // Fetch all initial data
  const fetchData = async () => {
    try {
      const [opsRes, machRes, tasksRes, alertsRes, anomRes, trainRes] = await Promise.all([
        fetch(`${API_BASE}/api/operators`),
        fetch(`${API_BASE}/api/machines`),
        fetch(`${API_BASE}/api/tasks`),
        fetch(`${API_BASE}/api/alerts`),
        fetch(`${API_BASE}/api/telemetry/anomalies`),
        fetch(`${API_BASE}/api/training/scenarios?operator_id=${activeOperatorId}`)
      ]);

      if (opsRes.ok) setOperators(await opsRes.json());
      if (machRes.ok) setMachines(await machRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (anomRes.ok) setAnomalies(await anomRes.json());
      if (trainRes.ok) setTrainingData(await trainRes.json());
    } catch (err) {
      console.error('Error fetching data from backend:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeOperatorId]);

  // Real-time WebSocket connection for live safety alert notifications & escalation
  useEffect(() => {
    let ws: WebSocket | null = null;
    const connectWs = () => {
      try {
        ws = new WebSocket('ws://127.0.0.1:8000/ws/alerts');
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[CABIN WS EVENT]', data);
            fetchData(); // Refresh on any event

            if (data.payload && data.payload.status === 'active') {
              setActiveAlert({
                alert_id: data.payload.alert_id,
                alert_type: data.payload.alert_type,
                machine_id: 'EXC001',
                operator_id: activeOperatorId,
                status: 'active'
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
    preferred_language: 'en'
  };

  const assignedTasks = tasks.filter(t => t.operator_id === activeOperatorId);
  const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'escalated');

  // Handlers for Operator Actions
  const handleUpdateTaskStatus = async (taskId: string, status: string, actualMin?: number) => {
    try {
      await fetch(`${API_BASE}/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actual_time_min: actualMin })
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
          notes: 'Triggered from In-Cab Dashboard touch button'
        })
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
        body: JSON.stringify({ operator_id: activeOperatorId, notes: 'Cabin Verified Safe by Operator' })
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
      body: JSON.stringify(rentalData)
    });
    fetchData();
  };

  const handleCreateTask = async (taskData: any) => {
    await fetch(`${API_BASE}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });
    fetchData();
  };

  const handleSubmitScenarioDecision = async (scenarioId: string, optionId: string) => {
    const res = await fetch(`${API_BASE}/api/training/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario_id: scenarioId,
        option_id: optionId,
        operator_id: activeOperatorId
      })
    });
    const result = await res.json();
    // Refresh training data
    const updated = await fetch(`${API_BASE}/api/training/scenarios?operator_id=${activeOperatorId}`);
    if (updated.ok) setTrainingData(await updated.json());
    return result;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#FFFFFF', color: '#111111' }}>
      {/* Top Bar with Role Switcher & Controls */}
      <Header
        currentRole={role}
        onRoleChange={setRole}
        activeOperatorId={activeOperatorId}
        onOperatorChange={setActiveOperatorId}
        operators={operators}
        activeAlertCount={activeAlerts.length}
      />

      <main style={{ flex: 1, padding: '1.25rem', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        {/* ========================================================================= */}
        {/* OPERATOR IN-CAB HUD VIEW                                                  */}
        {/* ========================================================================= */}
        {role === 'operator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Cabin HUD Machine & Shift Banner */}
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '2px solid #111111',
              borderLeft: '10px solid #FFCD11',
              boxShadow: '4px 4px 0px #111111',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ backgroundColor: '#111111', color: '#FFCD11', padding: '0.25rem 0.5rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <HardHat size={18} />
                    <span style={{ fontWeight: 900, fontSize: '0.85rem' }}>CABIN HUD</span>
                  </div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#111111' }}>
                    Cat 320 Hydraulic Excavator (EXC001)
                  </span>
                  <span className="cat-badge badge-green">OWNED</span>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#4B5563', marginTop: '6px' }}>
                  Operator: <strong style={{ color: '#111111' }}>{currentOperator.name}</strong> ({currentOperator.skill_level}) | Local Timezone: <strong style={{ color: '#111111' }}>{currentOperator.timezone}</strong>
                </div>
              </div>

              {/* High-Impact In-Cab Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowTrainingModal(true)}
                  className="cat-btn cat-btn-secondary"
                  style={{ minHeight: '48px', fontSize: '0.9rem' }}
                >
                  <GraduationCap size={18} color="#FFCD11" />
                  {t('trainingHub')}
                  {trainingData?.operator_progress && (
                    <span style={{ backgroundColor: '#FFCD11', color: '#111', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                      {trainingData.operator_progress.points} pts
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleTriggerSos('Manual Operator SOS Press')}
                  className="cat-btn cat-btn-danger"
                  style={{ minHeight: '48px', fontSize: '0.95rem', padding: '0.5rem 1.25rem' }}
                >
                  <AlertOctagon size={20} />
                  {t('sosEmergency')}
                </button>
              </div>
            </div>

            {/* Quick Cabin Hazard Simulation Triggers (For testing requirement) */}
            <div style={{
              backgroundColor: '#FFFBEB',
              border: '2px solid #111111',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              fontSize: '0.85rem'
            }}>
              <span style={{ color: '#111111', fontWeight: 800 }}>
                ⚡ Safety Simulation Triggers:
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleTriggerSos('Seatbelt Unfastened while Engine Engaged')}
                  className="cat-btn cat-btn-outline"
                  style={{ minHeight: '36px', fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                >
                  Simulate Seatbelt Alert
                </button>
                <button
                  onClick={() => handleTriggerSos('Proximity Hazard: Ground Crew Detected < 2m')}
                  className="cat-btn cat-btn-outline"
                  style={{ minHeight: '36px', fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                >
                  Simulate Proximity Hazard
                </button>
              </div>
            </div>

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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: '#111111' }}>
                        <GraduationCap size={20} color="#D97706" />
                        <span>Daily Simulation Recommendation</span>
                      </div>
                      <span className="cat-badge badge-black">Score: {trainingData.operator_progress.points}</span>
                    </div>

                    <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: '0.75rem' }}>
                      Recommended: <strong style={{ color: '#111111' }}>{trainingData.scenarios.find(s => s.id === trainingData.recommended_scenario_id)?.title || 'Cabin Safety Protocol'}</strong>
                    </p>

                    <button
                      onClick={() => setShowTrainingModal(true)}
                      className="cat-btn cat-btn-primary"
                      style={{ width: '100%', minHeight: '46px', fontSize: '0.9rem' }}
                    >
                      Launch 2D Decision Simulator
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUPERVISOR DASHBOARD VIEW                                                 */}
        {/* ========================================================================= */}
        {role === 'supervisor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Top Supervisor Controls & Metrics */}
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '2px solid #111111',
              boxShadow: '4px 4px 0px #111111',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem'
            }}>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111111' }}>
                  Marcus Vance — Site Operations Hub
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '4px' }}>
                  Managing <strong>{machines.length}</strong> machines across <strong>{operators.length}</strong> operators. Storage in UTC, local view: <strong>America/New_York</strong>.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => setShowSchedulerModal(true)}
                  className="cat-btn cat-btn-primary"
                  style={{ minHeight: '48px', fontSize: '0.9rem' }}
                >
                  <PlusCircle size={18} />
                  {t('scheduleTask')}
                </button>

                <button
                  onClick={fetchData}
                  className="cat-btn cat-btn-secondary"
                  style={{ minHeight: '48px', fontSize: '0.9rem' }}
                >
                  <RefreshCw size={18} />
                  {t('refresh')}
                </button>
              </div>
            </div>

            {/* Safety Alert Monitor */}
            <SafetyAlertMonitor
              alerts={alerts}
              supervisorTimezone="America/New_York"
              onRefresh={fetchData}
            />

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

      {/* SOS Alert Modal with 45s Countdown & Auto-Escalation */}
      {activeAlert && (
        <SosAlertModal
          activeAlert={activeAlert}
          onAcknowledge={handleAcknowledgeAlert}
          onEscalate={handleEscalateAlert}
          onClose={() => setActiveAlert(null)}
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
    </div>
  );
}

export default App;
