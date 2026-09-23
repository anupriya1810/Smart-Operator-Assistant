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
    if (w.includes('rain')) return <CloudRain size={16} color="#60A5FA" />;
    if (w.includes('wind')) return <Wind size={16} color="#FBBF24" />;
    return <Sun size={16} color="#FFCD11" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in-progress':
        return <span className="cat-badge badge-yellow">● {status.toUpperCase()}</span>;
      case 'done':
        return <span className="cat-badge badge-green">✓ {status.toUpperCase()}</span>;
      case 'delayed':
        return <span className="cat-badge badge-red">⚠ {status.toUpperCase()}</span>;
      default:
        return <span className="cat-badge badge-blue">⏱ {status.toUpperCase()}</span>;
    }
  };

  return (
    <div className="cat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: '#FEF3C7', color: '#B45309', padding: '0.3rem', borderRadius: '6px', display: 'inline-flex' }}>
              <Clock size={18} />
            </div>
            {t('todaysTasks')}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
            Cabin local time: <strong style={{ color: '#0F172A' }}>{operatorTimezone}</strong>
          </p>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
          <strong style={{ color: '#0F172A' }}>{tasks.length}</strong> tasks assigned
        </div>
      </div>

      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
          <AlertTriangle size={32} color="#D97706" style={{ margin: '0 auto 0.75rem' }} />
          <p>{t('noTasks')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tasks.map(task => {
            const hasVariance = task.predicted_time_min && task.estimated_time_min && (task.predicted_time_min !== task.estimated_time_min);
            const variance = hasVariance ? Math.round(task.predicted_time_min! - task.estimated_time_min!) : 0;

            return (
              <div
                key={task.task_id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '10px',
                  borderTop: task.status === 'in-progress' ? '1px solid #F59E0B' : '1px solid #E2E8F0',
                  borderRight: task.status === 'in-progress' ? '1px solid #F59E0B' : '1px solid #E2E8F0',
                  borderBottom: task.status === 'in-progress' ? '1px solid #F59E0B' : '1px solid #E2E8F0',
                  borderLeft: task.status === 'in-progress' ? '4px solid #FFCD11' : '1px solid #E2E8F0',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: task.status === 'in-progress' ? '0 4px 12px rgba(255, 205, 17, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.04)'
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0F172A' }}>
                        {task.task_type}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400E', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', padding: '1px 6px', borderRadius: '4px' }}>
                        {task.task_id}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px', fontSize: '0.85rem', color: '#64748B' }}>
                      <strong style={{ backgroundColor: '#18181B', color: '#FFCD11', padding: '1px 6px', borderRadius: '4px', fontSize: '0.78rem' }}>
                        {task.machine_model || task.machine_id}
                      </strong>
                      <span>&bull;</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#475569', fontWeight: 500 }}>
                        <MapPin size={14} color="#D97706" />
                        {task.location_zone}
                      </span>
                    </div>
                  </div>

                  <div>{getStatusBadge(task.status)}</div>
                </div>

                {/* Details grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.75rem',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem'
                }}>
                  {/* Local Time Window */}
                  <div>
                    <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {t('scheduledWindow')}
                    </div>
                    <div style={{ fontWeight: 600, color: '#0F172A', marginTop: '3px' }}>
                      {formatUtcToLocal(task.scheduled_start, operatorTimezone)}
                    </div>
                  </div>

                  {/* Weather */}
                  <div>
                    <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {t('weather')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: '#0F172A', marginTop: '3px' }}>
                      {getWeatherIcon(task.weather)}
                      <span>{task.weather}</span>
                    </div>
                  </div>

                  {/* ML Predicted Duration */}
                  <div>
                    <div style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Cpu size={13} color="#D97706" />
                      <span>{t('predictedDuration')}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{task.predicted_time_min ? `${task.predicted_time_min} min` : `${task.estimated_time_min || 45} min`}</span>
                      {hasVariance && variance !== 0 && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: variance > 0 ? '#DC2626' : '#059669' }}>
                          ({variance > 0 ? `+${variance}m weather/wear` : `${variance}m`})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {task.notes && (
                  <div style={{ fontSize: '0.85rem', color: '#451A03', fontStyle: 'italic', backgroundColor: '#FFFBEB', borderLeft: '3px solid #F59E0B', border: '1px solid #FEF3C7', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
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
                      <Play size={16} />
                      {t('startTask')}
                    </button>
                  )}

                  {task.status === 'in-progress' && (
                    <button
                      onClick={() => {
                        const actual = prompt("Enter actual completion duration in minutes:", String(task.predicted_time_min || 45));
                        onUpdateStatus(task.task_id, 'done', actual ? parseFloat(actual) : undefined);
                      }}
                      className="cat-btn"
                      style={{ flex: 1, backgroundColor: '#059669', borderColor: '#047857', color: '#FFF' }}
                    >
                      <CheckCircle size={16} />
                      {t('completeTask')}
                    </button>
                  )}

                  {task.status === 'done' && (
                    <div style={{ color: '#059669', fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0' }}>
                      <CheckCircle size={16} /> Task Completed. {task.actual_time_min ? `Actual duration: ${task.actual_time_min} min` : ''}
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
