import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, CheckCircle, Clock, BellRing, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [showResolvedList, setShowResolvedList] = useState(true);

  const activeAlerts = alerts.filter(a => a.status === 'active' || a.status === 'escalated');
  const acknowledgedAlerts = alerts.filter(a => a.status === 'acknowledged' || a.status === 'resolved');

  return (
    <div className="cat-card">
      {/* Header with quick status summary */}
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
            <div style={{ backgroundColor: 'var(--cat-danger-bg-dark)', color: 'var(--cat-danger)', padding: '0.35rem', borderRadius: '6px', display: 'inline-flex' }}>
              <ShieldAlert size={18} />
            </div>
            {t('safetyMonitor')}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--theme-text-secondary)', marginTop: '2px' }}>
            Live fleet safety telemetry &amp; 45-second SOS escalation triage.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {activeAlerts.length > 0 ? (
            <span className="cat-badge badge-danger alert-pulse-loud">
              <BellRing size={13} /> {activeAlerts.length} ACTION REQUIRED
            </span>
          ) : (
            <span className="cat-badge badge-success">
              <CheckCircle size={13} /> ALL CABINS NOMINAL
            </span>
          )}
          <button onClick={onRefresh} className="cat-btn cat-btn-outline cat-btn-sm">
            {t('refresh')}
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--theme-text-muted)', fontSize: '0.9rem' }}>
          No safety alerts logged across active shifts.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* SECTION 1: HIGH-PRIORITY ACTIVE / ESCALATED ALERTS (Visually Loud) */}
          {activeAlerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cat-danger)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <BellRing size={14} /> Critical Attention Required ({activeAlerts.length})
              </div>

              {activeAlerts.map(a => {
                const isEscalated = a.status === 'escalated';

                return (
                  <div
                    key={a.alert_id}
                    className="alert-pulse-loud"
                    style={{
                      backgroundColor: 'var(--theme-card-bg-elevated)',
                      borderRadius: '10px',
                      border: '2px solid var(--cat-danger)',
                      borderLeft: '6px solid var(--cat-danger)',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: 'var(--cat-danger)', fontSize: '1.1rem' }}>
                            {a.alert_type}
                          </span>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'var(--cat-danger)',
                            backgroundColor: 'var(--cat-danger-bg-dark)',
                            border: '1px solid var(--cat-danger)',
                            padding: '1px 7px',
                            borderRadius: '4px'
                          }}>
                            {a.alert_id}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)', marginTop: '4px' }}>
                          Machine: <strong style={{ color: 'var(--theme-text-primary)' }}>{a.machine_id}</strong> &bull; Operator: <strong style={{ color: 'var(--theme-text-primary)' }}>{a.operator_name || a.operator_id}</strong>
                        </div>
                      </div>

                      <div>
                        {isEscalated ? (
                          <span className="cat-badge badge-danger">
                            <BellRing size={13} /> ESCALATED TO SUPERVISOR
                          </span>
                        ) : (
                          <span className="cat-badge badge-warning">
                            <Clock size={13} /> IN-CAB ACKNOWLEDGING (45s)
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.8rem',
                      color: 'var(--theme-text-secondary)',
                      borderTop: '1px solid var(--theme-divider)',
                      paddingTop: '0.5rem',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}>
                      <span>Triggered: <strong className="mono-num" style={{ color: 'var(--theme-text-primary)' }}>{formatUtcToLocal(a.triggered_at, supervisorTimezone)}</strong></span>
                      {a.notes && <span style={{ color: 'var(--theme-text-muted)', fontStyle: 'italic' }}>"{a.notes}"</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SECTION 2: ACKNOWLEDGED / RESOLVED ALERTS (Visually Compact & Receded) */}
          {acknowledgedAlerts.length > 0 && (
            <div style={{ marginTop: activeAlerts.length > 0 ? '0.5rem' : '0' }}>
              <div
                onClick={() => setShowResolvedList(!showResolvedList)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--theme-text-muted)',
                  cursor: 'pointer',
                  padding: '0.5rem 0',
                  userSelect: 'none'
                }}
              >
                <span>Resolved &amp; Safe Cabin Log ({acknowledgedAlerts.length})</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {showResolvedList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </div>

              {showResolvedList && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {acknowledgedAlerts.map(a => (
                    <div
                      key={a.alert_id}
                      style={{
                        backgroundColor: 'var(--theme-subtle-bg)',
                        borderRadius: '6px',
                        border: '1px solid var(--theme-subtle-border)',
                        borderLeft: '3px solid var(--cat-success)',
                        padding: '0.65rem 0.85rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        opacity: 0.85
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--theme-text-primary)' }}>
                          {a.alert_type}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)' }}>
                          {a.alert_id}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)' }}>
                          Machine: <strong>{a.machine_id}</strong> ({a.operator_name || a.operator_id})
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }} className="mono-num">
                          {formatUtcToLocal(a.triggered_at, supervisorTimezone).split(',')[1] || formatUtcToLocal(a.triggered_at, supervisorTimezone)}
                        </span>
                        <span className="cat-badge badge-success" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                          <CheckCircle size={11} /> SAFE ({a.response_time_sec ? `${a.response_time_sec}s` : 'ACK'})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
