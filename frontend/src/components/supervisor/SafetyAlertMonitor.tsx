import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, CheckCircle, Clock, BellRing } from 'lucide-react';
import { formatUtcToLocal } from '../../utils/timezone';

export interface AlertItem {
  alert_id: string;
  machine_id: string;
  operator_id: string;
  operator_name?: string;
  supervisor_id: string;
  alert_type: string;
  triggered_at: string;
  acknowledged_at?: string | null;
  escalated_at?: string | null;
  response_time_sec?: number | null;
  status: 'active' | 'acknowledged' | 'escalated' | 'resolved';
  notes?: string | null;
}

interface SafetyAlertMonitorProps {
  alerts: AlertItem[];
  supervisorTimezone: string;
  onRefresh: () => void;
}

export const SafetyAlertMonitor: React.FC<SafetyAlertMonitorProps> = ({
  alerts,
  supervisorTimezone,
  onRefresh,
}) => {
  const { t } = useTranslation();

  const activeCount = alerts.filter(a => a.status === 'active' || a.status === 'escalated').length;

  return (
    <div className="cat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '2px solid #111111', paddingBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#111111', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: '#FFCD11', color: '#111111', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'inline-flex' }}>
              <ShieldAlert size={20} />
            </div>
            {t('safetyMonitor')}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '2px' }}>
            Real-time telemetry & in-cab SOS escalation log.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {activeCount > 0 ? (
            <span className="cat-badge badge-red" style={{ animation: 'emergencyFlash 1.5s infinite' }}>
              ⚠ {activeCount} ACTION REQUIRED
            </span>
          ) : (
            <span className="cat-badge badge-green">✓ ALL CABINS NOMINAL</span>
          )}
          <button onClick={onRefresh} className="cat-btn cat-btn-secondary" style={{ minHeight: '36px', padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            {t('refresh')}
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#4B5563' }}>
          No safety alerts logged.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {alerts.map(a => {
            const isCritical = a.status === 'escalated' || a.status === 'active';

            return (
              <div
                key={a.alert_id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '8px',
                  border: isCritical ? '2.5px solid #DC2626' : '2px solid #111111',
                  boxShadow: isCritical ? '3px 3px 0px #DC2626' : '2px 2px 0px #111111',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 900, color: isCritical ? '#DC2626' : '#111111', fontSize: '1.05rem' }}>
                        {a.alert_type}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#111111', backgroundColor: '#FFCD11', border: '1px solid #111111', padding: '2px 6px', borderRadius: '4px' }}>
                        {a.alert_id}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '2px' }}>
                      Machine: <strong style={{ color: '#111111' }}>{a.machine_id}</strong> | Operator: <strong style={{ color: '#111111' }}>{a.operator_name || a.operator_id}</strong>
                    </div>
                  </div>

                  <div>
                    {a.status === 'escalated' && (
                      <span className="cat-badge badge-red">
                        <BellRing size={12} /> ESCALATED TO OFFICE
                      </span>
                    )}
                    {a.status === 'active' && (
                      <span className="cat-badge badge-yellow">
                        <Clock size={12} /> IN-CAB ACKNOWLEDGING (45s)
                      </span>
                    )}
                    {a.status === 'acknowledged' && (
                      <span className="cat-badge badge-green">
                        <CheckCircle size={12} /> ACKNOWLEDGED SAFE ({a.response_time_sec ? `${a.response_time_sec}s` : ''})
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#6B7280', borderTop: '1px solid #E5E7EB', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
                  <span>Triggered: <strong>{formatUtcToLocal(a.triggered_at, supervisorTimezone)}</strong></span>
                  {a.notes && <span style={{ color: '#111111', fontStyle: 'italic' }}>"{a.notes}"</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
