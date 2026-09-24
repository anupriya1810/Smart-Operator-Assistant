import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Cpu, X, CloudRain, Wind, Sun, Cloud, AlertTriangle, MapPin, Sparkles } from 'lucide-react';
import { localInputToUtcIso } from '../../utils/timezone';
import { API_BASE } from '../../config';

interface TaskSchedulerModalProps {
  operators: Array<{ operator_id: string; name: string; skill_level: string }>;
  machines: Array<{ machine_id: string; model: string; age_years: number }>;
  onClose: () => void;
  onTaskCreated: (taskData: any) => Promise<void>;
}

const ZONE_COORDINATES: Record<string, { lat: number; lon: number; label: string }> = {
  'Zone A - Quarry North': { lat: 40.7135, lon: -74.0055, label: 'Zone A - Quarry North (Excavation Pit)' },
  'Zone B - Utility Pipeline': { lat: 40.7110, lon: -74.0080, label: 'Zone B - Utility Pipeline (Trenching Corridor)' },
  'Zone C - Stockpile Hub': { lat: 40.7160, lon: -74.0030, label: 'Zone C - Stockpile Hub (Loading Yard)' },
  'Zone D - Old Silo / Demo': { lat: 40.7090, lon: -74.0040, label: 'Zone D - Old Silo / Demo (Demolition Ground)' },
};

export const TaskSchedulerModal: React.FC<TaskSchedulerModalProps> = ({
  operators,
  machines,
  onClose,
  onTaskCreated,
}) => {
  const { t } = useTranslation();
  const [operatorId, setOperatorId] = useState(operators[0]?.operator_id || '');
  const [machineId, setMachineId] = useState(machines[0]?.machine_id || '');
  const [taskType, setTaskType] = useState('Earth Excavation');
  const [locationZone, setLocationZone] = useState('Zone A - Quarry North');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-detected live weather state
  const [siteWeather, setSiteWeather] = useState<{
    condition: string;
    temperature_c: number;
    precipitation_mm: number;
    wind_speed_kmh: number;
    is_severe: boolean;
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // ML predicted duration result
  const [predictedResult, setPredictedResult] = useState<any | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);

  // Local default times (starting now, ending in 1 hour)
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  const toLocalInputValue = (d: Date) => d.toISOString().slice(0, 16);

  const [scheduledStartLocal, setScheduledStartLocal] = useState(toLocalInputValue(now));
  const [scheduledEndLocal, setScheduledEndLocal] = useState(toLocalInputValue(later));

  // 1. Auto-fetch site weather whenever locationZone changes
  useEffect(() => {
    const coords = ZONE_COORDINATES[locationZone] || { lat: 40.7135, lon: -74.0055 };
    setWeatherLoading(true);

    const timer = setTimeout(async () => {
      try {
        const utcStart = localInputToUtcIso(scheduledStartLocal);
        const res = await fetch(`${API_BASE}/api/weather/site?latitude=${coords.lat}&longitude=${coords.lon}&scheduled_time=${encodeURIComponent(utcStart)}`);
        if (res.ok) {
          const data = await res.json();
          setSiteWeather(data);
        }
      } catch (err) {
        console.error('Weather auto-fetch error:', err);
      } finally {
        setWeatherLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [locationZone, scheduledStartLocal]);

  // 2. Query ML task duration prediction engine automatically
  useEffect(() => {
    const selectedOp = operators.find(o => o.operator_id === operatorId);
    const selectedMach = machines.find(m => m.machine_id === machineId);
    if (!selectedOp || !selectedMach) return;

    const coords = ZONE_COORDINATES[locationZone] || { lat: 40.7135, lon: -74.0055 };
    setPredictLoading(true);

    const timer = setTimeout(async () => {
      try {
        const utcStart = localInputToUtcIso(scheduledStartLocal);
        const res = await fetch(`${API_BASE}/api/predict/task-time`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_type: taskType,
            operator_id: operatorId,
            machine_id: machineId,
            latitude: coords.lat,
            longitude: coords.lon,
            scheduled_start: utcStart,
          })
        });
        if (res.ok) {
          const data = await res.json();
          setPredictedResult(data);
        }
      } catch (e) {
        console.error('ML Prediction error:', e);
      } finally {
        setPredictLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [operatorId, machineId, taskType, locationZone, scheduledStartLocal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const utcStart = localInputToUtcIso(scheduledStartLocal);
      const utcEnd = localInputToUtcIso(scheduledEndLocal);

      await onTaskCreated({
        task_type: taskType,
        operator_id: operatorId,
        machine_id: machineId,
        scheduled_start: utcStart,
        scheduled_end: utcEnd,
        location_zone: locationZone,
        notes: notes
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to schedule task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getWeatherIcon = (cond?: string) => {
    switch (cond?.toLowerCase()) {
      case 'rainy': return <CloudRain size={16} color="var(--cat-info)" />;
      case 'windy': return <Wind size={16} color="var(--cat-warning)" />;
      case 'cloudy': return <Cloud size={16} color="#A1A1AA" />;
      default: return <Sun size={16} color="var(--cat-yellow)" />;
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      backdropFilter: 'blur(5px)'
    }}>
      <div style={{
        backgroundColor: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-card-border)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
        borderRadius: '16px',
        padding: '1.75rem',
        width: '100%',
        maxWidth: '580px',
        maxHeight: '92vh',
        overflowY: 'auto',
        color: 'var(--theme-text-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--theme-divider)', paddingBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: 'var(--cat-yellow-subtle)', color: 'var(--cat-yellow)', padding: '0.35rem', borderRadius: '6px', display: 'inline-flex' }}>
              <Calendar size={18} />
            </div>
            {t('scheduleTask')}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--theme-text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Operator and Machine */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Assign Operator:
              </label>
              <select
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                className="cat-input"
                style={{ backgroundColor: 'var(--theme-input-bg)', borderColor: 'var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              >
                {operators.map(op => (
                  <option key={op.operator_id} value={op.operator_id}>
                    {op.name} ({op.skill_level})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Assign Machine:
              </label>
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="cat-input"
                style={{ backgroundColor: 'var(--theme-input-bg)', borderColor: 'var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              >
                {machines.map(m => (
                  <option key={m.machine_id} value={m.machine_id}>
                    {m.model} ({m.age_years} yrs)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Task Type and Worksite Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Task Type:
              </label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="cat-input"
                style={{ backgroundColor: 'var(--theme-input-bg)', borderColor: 'var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              >
                <option value="Earth Excavation">Earth Excavation</option>
                <option value="Trenching">Trenching</option>
                <option value="Material Loading">Material Loading</option>
                <option value="Grading">Grading</option>
                <option value="Demolition">Demolition</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={12} color="var(--cat-yellow)" /> Worksite Location:
                </span>
              </label>
              <select
                value={locationZone}
                onChange={(e) => setLocationZone(e.target.value)}
                className="cat-input"
                style={{ backgroundColor: 'var(--theme-input-bg)', borderColor: 'var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
              >
                {Object.keys(ZONE_COORDINATES).map(zone => (
                  <option key={zone} value={zone}>
                    {ZONE_COORDINATES[zone].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Auto-Detected Live Site Weather Banner (No Manual Input Required) */}
          <div style={{
            backgroundColor: siteWeather?.is_severe ? 'rgba(239, 68, 68, 0.12)' : 'var(--theme-subtle-bg)',
            border: siteWeather?.is_severe ? '1px solid var(--cat-danger)' : '1px solid var(--theme-subtle-border)',
            borderRadius: '8px',
            padding: '0.75rem 0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-primary)' }}>
                {getWeatherIcon(siteWeather?.condition)}
                <span>Auto-Detected Site Conditions (Open-Meteo API):</span>
              </div>
              {weatherLoading ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>Fetching live satellite feed...</span>
              ) : (
                <span className="cat-badge badge-cat-brand" style={{ fontSize: '0.75rem' }}>
                  {siteWeather?.condition || 'Sunny'}
                </span>
              )}
            </div>

            {siteWeather && (
              <div style={{ fontSize: '0.78rem', color: 'var(--theme-text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span>Temp: <strong>{siteWeather.temperature_c}°C</strong></span>
                <span>Precipitation: <strong>{siteWeather.precipitation_mm} mm</strong></span>
                <span>Wind Speed: <strong>{siteWeather.wind_speed_kmh} km/h</strong></span>
              </div>
            )}

            {siteWeather?.is_severe && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--cat-danger)', fontSize: '0.75rem', fontWeight: 700, marginTop: '2px' }}>
                <AlertTriangle size={13} />
                <span>Harsh weather detected. Task will require Supervisor Re-Approval gate upon creation.</span>
              </div>
            )}
          </div>

          {/* Local Datetime Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Scheduled Start (Local):
              </label>
              <input
                type="datetime-local"
                value={scheduledStartLocal}
                onChange={(e) => setScheduledStartLocal(e.target.value)}
                className="cat-input"
                style={{ backgroundColor: 'var(--theme-input-bg)', borderColor: 'var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Scheduled End (Local):
              </label>
              <input
                type="datetime-local"
                value={scheduledEndLocal}
                onChange={(e) => setScheduledEndLocal(e.target.value)}
                className="cat-input"
                style={{ backgroundColor: 'var(--theme-input-bg)', borderColor: 'var(--theme-input-border)', color: 'var(--theme-text-primary)' }}
                required
              />
            </div>
          </div>

          {/* Live AI Task Duration Calculation (No Manual Est Min Needed) */}
          <div style={{
            backgroundColor: 'var(--cat-yellow-subtle)',
            border: '1px solid var(--cat-yellow)',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--theme-text-primary)', fontSize: '0.85rem', fontWeight: 700 }}>
                <Cpu size={16} color="var(--cat-yellow)" />
                <span>AI Predicted Task Duration:</span>
              </div>
              <div className="mono-num" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--theme-text-primary)' }}>
                {predictLoading ? 'Calculating...' : `${predictedResult?.predicted_time_min || 45.0} min`}
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)', lineHeight: '1.4' }}>
              {predictedResult?.explanation || 'Automatic feature synthesis across operator skill, machine age, elevation, and live site weather.'}
            </div>

            {predictedResult?.top_factors && predictedResult.top_factors.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '4px' }}>
                {predictedResult.top_factors.slice(0, 3).map((f: any, idx: number) => (
                  <span key={idx} style={{
                    fontSize: '0.72rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(255, 205, 17, 0.3)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: 'var(--theme-text-primary)'
                  }}>
                    {f.feature}: <strong>{f.impact_min > 0 ? `+${f.impact_min}m` : `${f.impact_min}m`}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
              Notes / Instructions for In-Cab HUD:
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Ensure drainage slope compliance; coordinate with hauler dump team."
              className="cat-input"
              style={{ backgroundColor: 'var(--theme-input-bg)', borderColor: 'var(--theme-input-border)', color: 'var(--theme-text-primary)', minHeight: '65px', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              className="cat-btn cat-btn-outline"
              style={{ minHeight: '42px', fontSize: '0.875rem' }}
            >
              {t('cancel')}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="cat-btn cat-btn-primary"
              style={{ minHeight: '42px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Sparkles size={16} />
              {isSubmitting ? 'Scheduling...' : 'Dispatch Task with AI Duration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
