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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '2px solid #111111', paddingBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#111111', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: '#FFCD11', color: '#111111', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'inline-flex' }}>
              <Clock size={20} />
            </div>
            {t('todaysTasks')}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '2px' }}>
            All times converted to your cabin timezone: <strong style={{ color: '#111111' }}>{operatorTimezone}</strong>
          </p>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#111111', fontWeight: 700 }}>
          <strong>{tasks.length}</strong> tasks assigned
        </div>
      </div>

      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: '#4B5563' }}>
          <AlertTriangle size={36} color="#D97706" style={{ margin: '0 auto 0.75rem' }} />
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
                  border: task.status === 'in-progress' ? '3px solid #FFCD11' : '2px solid #111111',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: task.status === 'in-progress' ? '4px 4px 0px #FFCD11' : '3px 3px 0px #111111'
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 900, fontSize: '1.2rem', color: '#111111' }}>
                        {task.task_type}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#111111', backgroundColor: '#FFCD11', border: '1px solid #111111', padding: '2px 6px', borderRadius: '4px' }}>
                        {task.task_id}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px', fontSize: '0.9rem', color: '#111111' }}>
                      <strong style={{ backgroundColor: '#111111', color: '#FFCD11', padding: '1px 6px', borderRadius: '4px' }}>
                        {task.machine_model || task.machine_id}
                      </strong>
                      <span style={{ color: '#9CA3AF' }}>|</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#374151', fontWeight: 600 }}>
                        <MapPin size={15} color="#D97706" />
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
                  backgroundColor: '#F9FAFB',
                  border: '1.5px solid #111111',
                  padding: '0.85rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem'
                }}>
                  {/* Local Time Window */}
                  <div>
                    <div style={{ color: '#4B5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('scheduledWindow')}
                    </div>
                    <div style={{ fontWeight: 800, color: '#111111', marginTop: '3px' }}>
                      {formatUtcToLocal(task.scheduled_start, operatorTimezone)}
                    </div>
                  </div>

                  {/* Weather */}
                  <div>
                    <div style={{ color: '#4B5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      {t('weather')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 800, color: '#111111', marginTop: '3px' }}>
                      {getWeatherIcon(task.weather)}
                      <span>{task.weather}</span>
                    </div>
                  </div>

                  {/* ML Predicted Duration */}
                  <div>
                    <div style={{ color: '#4B5563', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Cpu size={14} color="#D97706" />
                      <span>{t('predictedDuration')}</span>
                    </div>
                    <div style={{ fontWeight: 900, color: '#111111', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{task.predicted_time_min ? `${task.predicted_time_min} min` : `${task.estimated_time_min || 45} min`}</span>
                      {hasVariance && variance !== 0 && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: variance > 0 ? '#DC2626' : '#059669' }}>
                          ({variance > 0 ? `+${variance}m weather/wear` : `${variance}m`})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {task.notes && (
                  <div style={{ fontSize: '0.85rem', color: '#111111', fontStyle: 'italic', backgroundColor: '#FFFBEB', borderLeft: '4px solid #FFCD11', border: '1px solid #FEF3C7', padding: '0.6rem 0.75rem', borderRadius: '4px' }}>
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
                      className="cat-btn"
                      style={{ flex: 1, backgroundColor: '#059669', borderColor: '#111111', color: '#FFF' }}
                    >
                      <CheckCircle size={18} />
                      {t('completeTask')}
                    </button>
                  )}

                  {task.status === 'done' && (
                    <div style={{ color: '#059669', fontSize: '0.9rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0' }}>
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
