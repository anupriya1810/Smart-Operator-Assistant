import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Cpu, X, Check } from 'lucide-react';
import { localInputToUtcIso } from '../../utils/timezone';

interface TaskSchedulerModalProps {
  operators: Array<{ operator_id: string; name: string; skill_level: string }>;
  machines: Array<{ machine_id: string; model: string; age_years: number }>;
  onClose: () => void;
  onTaskCreated: (taskData: any) => Promise<void>;
}

export const TaskSchedulerModal: React.FC<TaskSchedulerModalProps> = ({
  operators,
  machines,
  onClose,
  onTaskCreated,
}) => {
  const { t } = useTranslation();
  const [operatorId, setOperatorId] = useState(operators[0]?.operator_id || '');
  const [machineId, setMachineId] = useState(machines[0]?.machine_id || '');
  const [taskType, setTaskType] = useState('Trenching');
  const [weather, setWeather] = useState('Sunny');
  const [locationZone, setLocationZone] = useState('Zone B - South Pipeline');
  const [notes, setNotes] = useState('');
  const [estimatedMin, setEstimatedMin] = useState(45);
  const [predictedResult, setPredictedResult] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute local default times (e.g. starting now, ending in 1 hour)
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const toLocalInputValue = (d: Date) => d.toISOString().slice(0, 16);

  const [scheduledStartLocal, setScheduledStartLocal] = useState(toLocalInputValue(now));
  const [scheduledEndLocal, setScheduledEndLocal] = useState(toLocalInputValue(later));

  // Dynamically query prediction engine when inputs change
  useEffect(() => {
    const selectedOp = operators.find(o => o.operator_id === operatorId);
    const selectedMach = machines.find(m => m.machine_id === machineId);

    if (!selectedOp || !selectedMach) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/predict-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_type: taskType,
            weather: weather,
            operator_skill: selectedOp.skill_level,
            machine_age_years: selectedMach.age_years,
            estimated_time_min: estimatedMin,
          })
        });
        if (res.ok) {
          const data = await res.json();
          setPredictedResult(data);
        }
      } catch (e) {
        console.error(e);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [operatorId, machineId, taskType, weather, estimatedMin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const utcStart = localInputToUtcIso(scheduledStartLocal);
      const utcEnd = localInputToUtcIso(scheduledEndLocal);

      await onTaskCreated({
        task_type: taskType,
        weather: weather,
        operator_id: operatorId,
        machine_id: machineId,
        scheduled_start: utcStart,
        scheduled_end: utcEnd,
        location_zone: locationZone,
        notes: notes,
        estimated_time_min: estimatedMin
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to schedule task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '3px solid #111111',
        boxShadow: '6px 6px 0px #111111',
        borderRadius: '16px',
        padding: '1.75rem',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
        color: '#111111',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #111111', paddingBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#111111', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: '#FFCD11', color: '#111111', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'inline-flex' }}>
              <Calendar size={20} />
            </div>
            {t('scheduleTask')}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#111111', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Operator and Machine */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '4px' }}>
                Assign Operator:
              </label>
              <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="cat-input">
                {operators.map(op => (
                  <option key={op.operator_id} value={op.operator_id}>
                    {op.name} ({op.skill_level})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '4px' }}>
                Assign Machine:
              </label>
              <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="cat-input">
                {machines.map(m => (
                  <option key={m.machine_id} value={m.machine_id}>
                    {m.model} ({m.age_years} yrs)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Task Type and Weather */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '4px' }}>
                Task Type:
              </label>
              <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="cat-input">
                <option value="Earth Excavation">Earth Excavation</option>
                <option value="Trenching">Trenching</option>
                <option value="Material Loading">Material Loading</option>
                <option value="Grading">Grading</option>
                <option value="Demolition">Demolition</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '4px' }}>
                Site Weather:
              </label>
              <select value={weather} onChange={(e) => setWeather(e.target.value)} className="cat-input">
                <option value="Sunny">Sunny</option>
                <option value="Rainy">Rainy</option>
                <option value="Cloudy">Cloudy</option>
                <option value="Windy">Windy</option>
              </select>
            </div>
          </div>

          {/* Location and Baseline Estimate */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '4px' }}>
                Location Zone:
              </label>
              <input
                type="text"
                value={locationZone}
                onChange={(e) => setLocationZone(e.target.value)}
                placeholder="e.g. Zone B - North Trench"
                className="cat-input"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '4px' }}>
                Est. Min:
              </label>
              <input
                type="number"
                value={estimatedMin}
                onChange={(e) => setEstimatedMin(Number(e.target.value))}
                min="10"
                max="600"
                className="cat-input"
              />
            </div>
          </div>

          {/* Local Datetime Inputs (Automatically converted to UTC on submit) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '4px' }}>
                Scheduled Start (Local):
              </label>
              <input
                type="datetime-local"
                value={scheduledStartLocal}
                onChange={(e) => setScheduledStartLocal(e.target.value)}
                className="cat-input"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '4px' }}>
                Scheduled End (Local):
              </label>
              <input
                type="datetime-local"
                value={scheduledEndLocal}
                onChange={(e) => setScheduledEndLocal(e.target.value)}
                className="cat-input"
                required
              />
            </div>
          </div>

          {/* Live ML Predicted Duration Panel */}
          {predictedResult && (
            <div style={{
              backgroundColor: '#FFFBEB',
              border: '2px solid #111111',
              boxShadow: '2px 2px 0px #111111',
              borderRadius: '8px',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#111111', fontSize: '0.85rem', fontWeight: 800 }}>
                  <Cpu size={18} color="#D97706" />
                  <span>AI Dynamic Duration Predictor:</span>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#111111' }}>
                  {predictedResult.predicted_time_min} min
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#4B5563', fontWeight: 600 }}>
                {predictedResult.explanation}
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '4px' }}>
              Notes / Instructions for In-Cab HUD:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Ensure trench shoring box is positioned"
              className="cat-input"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              className="cat-btn cat-btn-primary"
              style={{ flex: 1 }}
            >
              <Check size={18} />
              {isSubmitting ? 'Scheduling...' : 'Confirm & Dispatch to Cab'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cat-btn cat-btn-outline"
              style={{ flex: 1 }}
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
