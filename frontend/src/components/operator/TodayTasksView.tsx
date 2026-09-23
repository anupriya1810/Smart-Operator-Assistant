import React from 'react';
import { useTranslation } from 'react-i18next';
import { Play, CheckCircle, Clock, MapPin, CloudRain, Sun, Wind, AlertTriangle, Cpu } from 'lucide-react';
import { formatUtcToLocal } from '../../utils/timezone';

export interface TaskItem {
  task_id: string;
  task_type: string;
  weather: string;
  operator_id: string;
  operator_name?: string;
  machine_id: string;
  machine_model?: string;
  scheduled_start: string;
  scheduled_end: string;
  status: 'upcoming' | 'in-progress' | 'done' | 'delayed';
  location_zone: string;
  notes?: string;
  estimated_time_min?: number;
  predicted_time_min?: number;
  actual_time_min?: number;
  weather_reapproval_required?: boolean;
  weather_approved_by?: string;
}

interface TodayTasksViewProps {
  tasks: TaskItem[];
  operatorTimezone: string;
  onUpdateStatus: (taskId: string, newStatus: 'upcoming' | 'in-progress' | 'done' | 'delayed', actualMin?: number) => void;
}

export const TodayTasksView: React.FC<TodayTasksViewProps> = ({
  tasks,
  operatorTimezone,
  onUpdateStatus,
}) => {
  const { t } = useTranslation();

  const getWeatherIcon = (weather: string) => {
    const w = weather.toLowerCase();
    if (w.includes('rain')) return <CloudRain size={15} color="#60A5FA" />;
    if (w.includes('wind')) return <Wind size={15} color="#FBBF24" />;
    return <Sun size={15} color="#FFCD11" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in-progress':
        return <span className="cat-badge badge-warning">● IN-PROGRESS</span>;
      case 'done':
        return <span className="cat-badge badge-success">✓ COMPLETED</span>;
      case 'delayed':
        return <span className="cat-badge badge-danger">⚠ DELAYED</span>;
      default:
        return <span className="cat-badge badge-custody">⏱ UPCOMING</span>;
    }
  };

  return (
    <div className="cat-card">
      {/* Header bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.25rem',
        borderBottom: '1px solid var(--theme-divider)',
        paddingBottom: '0.75rem',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: 'var(--cat-yellow-subtle)', color: 'var(--cat-yellow)', padding: '0.35rem', borderRadius: '6px', display: 'inline-flex' }}>
              <Clock size={18} />
            </div>
            {t('todaysTasks')}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--theme-text-secondary)', marginTop: '2px' }}>
            Cabin local time: <strong style={{ color: 'var(--theme-text-primary)' }}>{operatorTimezone}</strong>
          </p>
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--theme-text-secondary)', fontWeight: 600 }}>
          <strong style={{ color: 'var(--theme-text-primary)' }}>{tasks.length}</strong> tasks assigned today
        </div>
      </div>

      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--theme-text-muted)' }}>
          <AlertTriangle size={32} color="var(--cat-yellow)" style={{ margin: '0 auto 0.75rem' }} />
          <p>{t('noTasks')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tasks.map(task => {
            const hasVariance = task.predicted_time_min && task.estimated_time_min && (task.predicted_time_min !== task.estimated_time_min);
            const variance = hasVariance ? Math.round(task.predicted_time_min! - task.estimated_time_min!) : 0;
            const isInProgress = task.status === 'in-progress';
            const isDone = task.status === 'done';

            return (
              <div
                key={task.task_id}
                className="task-item-card"
                style={{
                  backgroundColor: 'var(--theme-card-bg-elevated)',
                  borderRadius: '10px',
                  border: isInProgress
                    ? '1px solid var(--cat-yellow)'
                    : '1px solid var(--theme-card-border)',
                  borderLeft: isInProgress
                    ? '4px solid var(--cat-yellow)'
                    : isDone
                      ? '4px solid var(--cat-success)'
                      : '4px solid var(--theme-card-border)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: isInProgress ? '0 4px 16px var(--cat-yellow-glow)' : 'none'
                }}
              >
                {/* Header row: Title, ID, Machine, Zone, Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--theme-text-primary)' }}>
                        {task.task_type}
                      </span>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: 'var(--cat-yellow)',
                        backgroundColor: '#111111',
                        border: '1px solid #333333',
                        padding: '1px 7px',
                        borderRadius: '4px'
                      }}>
                        {task.task_id}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                      <span className="cat-badge badge-cat-brand" style={{ fontSize: '0.75rem' }}>
                        {task.machine_model || task.machine_id}
                      </span>
                      <span style={{ color: 'var(--theme-text-muted)' }}>&bull;</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--theme-text-secondary)', fontWeight: 500 }}>
                        <MapPin size={14} color="var(--cat-yellow)" />
                        {task.location_zone}
                      </span>
                    </div>
                  </div>

                  <div>{getStatusBadge(task.status)}</div>
                </div>

                {/* Clean Metadata Section (NO nested bordered boxes, uses spacing & dividers) */}
                <div className="cat-meta-row">
                  {/* Local Time Window */}
                  <div className="cat-meta-item">
                    <span className="cat-meta-label">{t('scheduledWindow')}</span>
                    <span className="cat-meta-value mono-num">
                      {formatUtcToLocal(task.scheduled_start, operatorTimezone)}
                    </span>
                  </div>

                  {/* Weather */}
                  <div className="cat-meta-item">
                    <span className="cat-meta-label">{t('weather')}</span>
                    <span className="cat-meta-value">
                      {getWeatherIcon(task.weather)}
                      <span>{task.weather}</span>
                    </span>
                  </div>

                  {/* ML Predicted Duration */}
                  <div className="cat-meta-item">
                    <span className="cat-meta-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Cpu size={12} color="var(--cat-yellow)" />
                      <span>{t('predictedDuration')}</span>
                    </span>
                    <div className="cat-meta-value mono-num" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>{task.predicted_time_min ? `${task.predicted_time_min} min` : `${task.estimated_time_min || 45} min`}</span>
                      {hasVariance && variance !== 0 && (
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: variance > 0 ? 'var(--cat-danger)' : 'var(--cat-success)'
                        }}>
                          ({variance > 0 ? `+${variance}m` : `${variance}m`})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Weather Re-Approval Gate Banner */}
                {task.weather_reapproval_required && (
                  <div style={{
                    backgroundColor: 'rgba(234, 179, 8, 0.12)',
                    border: '1px solid var(--cat-warning)',
                    borderRadius: '6px',
                    padding: '0.6rem 0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    fontSize: '0.8rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--cat-warning)', fontWeight: 700 }}>
                      <AlertTriangle size={15} />
                      <span>WEATHER RE-APPROVAL GATE: High Wind / Rain Hazard</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                      {task.weather_approved_by ? `Authorized by ${task.weather_approved_by}` : 'Pending Supervisor Clearance'}
                    </span>
                  </div>
                )}

                {/* Dispatch Notes */}
                {task.notes && (
                  <div style={{
                    fontSize: '0.82rem',
                    color: 'var(--theme-text-secondary)',
                    fontStyle: 'italic',
                    backgroundColor: 'var(--theme-subtle-bg)',
                    borderLeft: '3px solid var(--cat-yellow)',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '4px'
                  }}>
                    "{task.notes}"
                  </div>
                )}

                {/* Operator In-Cab Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                  {task.status === 'upcoming' && (
                    <button
                      onClick={() => onUpdateStatus(task.task_id, 'in-progress')}
                      className="cat-btn cat-btn-primary"
                      style={{ flex: 1 }}
                    >
                      <Play size={18} />
                      {t('startTask')}
                    </button>
                  )}

                  {task.status === 'in-progress' && (
                    <button
                      onClick={() => {
                        const actual = prompt("Enter actual completion duration in minutes:", String(task.predicted_time_min || 45));
                        onUpdateStatus(task.task_id, 'done', actual ? parseFloat(actual) : undefined);
                      }}
                      className="cat-btn cat-btn-success"
                      style={{ flex: 1 }}
                    >
                      <CheckCircle size={18} />
                      {t('completeTask')}
                    </button>
                  )}

                  {task.status === 'done' && (
                    <div style={{ color: 'var(--cat-success)', fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0' }}>
                      <CheckCircle size={18} /> Task Completed. {task.actual_time_min ? `Actual duration: ${task.actual_time_min} min` : ''}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
