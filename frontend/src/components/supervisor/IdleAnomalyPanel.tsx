import React from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, AlertTriangle, ShieldCheck, Activity, ArrowUpRight } from 'lucide-react';
import { formatUtcToLocal } from '../../utils/timezone';

export interface TelemetryAnomaly {
  machine_id: string;
  operator_id: string;
  operator_name?: string;
  timestamp: string;
  idling_time_min: number;
  load_cycles: number;
  fuel_wasted_l: number;
  estimated_idle_cost_usd: number;
  seatbelt_status: string;
  is_ghost_idle: boolean;
}

interface IdleAnomalyPanelProps {
  anomalies: TelemetryAnomaly[];
  supervisorTimezone: string;
}

export const IdleAnomalyPanel: React.FC<IdleAnomalyPanelProps> = ({
  anomalies,
  supervisorTimezone,
}) => {
  const { t } = useTranslation();

  const totalIdleCost = anomalies.reduce((acc, curr) => acc + curr.estimated_idle_cost_usd, 0);
  const totalIdleMins = anomalies.reduce((acc, curr) => acc + curr.idling_time_min, 0);
  const ghostIdleEvents = anomalies.filter(a => a.is_ghost_idle).length;
  const seatbeltViolations = anomalies.filter(a => a.seatbelt_status.toLowerCase() === 'unfastened').length;

  return (
    <div className="cat-card">
      {/* Panel Header */}
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
              <Activity size={18} />
            </div>
            {t('idleAnomaly')}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--theme-text-secondary)', marginTop: '2px' }}>
            Machine telemetry stream (Photo 2) &bull; Idle fuel burn penalties at $1.35/L off-road diesel.
          </p>
        </div>
        <span className="cat-badge badge-custody">
          {anomalies.length} TELEMETRY RECORDS
        </span>
      </div>

      {/* KPI Summary Cards with Trend Indicators */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.25rem'
      }}>
        {/* KPI 1: Fuel Burn Cost */}
        <div style={{
          backgroundColor: 'var(--theme-card-bg-elevated)',
          border: '1px solid var(--theme-card-border)',
          borderRadius: '10px',
          padding: '1.1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--theme-text-muted)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Idle Fuel Burn
              </span>
              <DollarSign size={16} color="var(--cat-yellow)" />
            </div>
            <div className="mono-num" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--theme-text-primary)', marginTop: '4px' }}>
              ${totalIdleCost.toFixed(2)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--theme-text-secondary)' }}>
            <span className="mono-num">{totalIdleMins} total idle mins</span>
            <span style={{ color: 'var(--cat-warning)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
              <ArrowUpRight size={13} /> +12% shift burn
            </span>
          </div>
        </div>

        {/* KPI 2: Ghost Idle Flags */}
        <div style={{
          backgroundColor: 'var(--theme-card-bg-elevated)',
          border: '1px solid var(--theme-card-border)',
          borderRadius: '10px',
          padding: '1.1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--theme-text-muted)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Ghost Idling Flags
              </span>
              <AlertTriangle size={16} color="var(--cat-danger)" />
            </div>
            <div className="mono-num" style={{ fontSize: '1.75rem', fontWeight: 800, color: ghostIdleEvents > 0 ? 'var(--cat-danger)' : 'var(--cat-success)', marginTop: '4px' }}>
              {ghostIdleEvents} Events
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--theme-text-secondary)' }}>
            <span>&gt;40m idle, &lt;3 cycles</span>
            {ghostIdleEvents > 0 && (
              <span className="cat-badge badge-danger" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                ACTION NEEDED
              </span>
            )}
          </div>
        </div>

        {/* KPI 3: Seatbelt Violations */}
        <div style={{
          backgroundColor: 'var(--theme-card-bg-elevated)',
          border: '1px solid var(--theme-card-border)',
          borderRadius: '10px',
          padding: '1.1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--theme-text-muted)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Seatbelt Violations
              </span>
              <ShieldCheck size={16} color={seatbeltViolations > 0 ? 'var(--cat-warning)' : 'var(--cat-success)'} />
            </div>
            <div className="mono-num" style={{ fontSize: '1.75rem', fontWeight: 800, color: seatbeltViolations > 0 ? 'var(--cat-warning)' : 'var(--cat-success)', marginTop: '4px' }}>
              {seatbeltViolations} Shifts
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--theme-text-secondary)' }}>
            <span>Cabin Interlock Alert</span>
            <span style={{ color: seatbeltViolations === 0 ? 'var(--cat-success)' : 'var(--cat-warning)', fontWeight: 600 }}>
              {seatbeltViolations === 0 ? '100% Compliant' : 'Unbuckled Shifts'}
            </span>
          </div>
        </div>
      </div>

      {/* Telemetry Stream Log Table with Scannable Full-Row Tint and Right-Aligned Numeric Data */}
      <div style={{
        overflowX: 'auto',
        border: '1px solid var(--theme-card-border)',
        borderRadius: '10px'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.85rem',
          backgroundColor: 'var(--theme-card-bg)'
        }}>
          <thead>
            <tr style={{
              borderBottom: '1px solid var(--theme-card-border)',
              backgroundColor: 'var(--theme-subtle-bg)',
              color: 'var(--theme-text-secondary)',
              textTransform: 'uppercase',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.04em'
            }}>
              <th style={{ padding: '0.75rem 0.85rem', textAlign: 'left' }}>Timestamp</th>
              <th style={{ padding: '0.75rem 0.85rem', textAlign: 'left' }}>Machine</th>
              <th style={{ padding: '0.75rem 0.85rem', textAlign: 'left' }}>Operator</th>
              {/* Right-aligned numeric columns for easy vertical comparison */}
              <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Idling Time</th>
              <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Load Cycles</th>
              <th style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>Seatbelt</th>
              <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Idle Penalty</th>
              <th style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map((item, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid var(--theme-divider)',
                  // Full-row tint for flagged Ghost Idle rows for instant scannability
                  backgroundColor: item.is_ghost_idle
                    ? 'rgba(239, 68, 68, 0.08)'
                    : 'transparent',
                  color: 'var(--theme-text-primary)',
                  transition: 'background-color 0.15s ease'
                }}
              >
                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 500, color: 'var(--theme-text-secondary)' }} className="mono-num">
                  {formatUtcToLocal(item.timestamp, supervisorTimezone)}
                </td>
                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700 }}>
                  <span style={{
                    backgroundColor: '#111111',
                    color: 'var(--cat-yellow)',
                    border: '1px solid #333333',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 800
                  }}>
                    {item.machine_id}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                  {item.operator_name || item.operator_id}
                </td>
                {/* Numeric Columns Right-Aligned */}
                <td style={{
                  padding: '0.75rem 0.85rem',
                  textAlign: 'right',
                  color: item.idling_time_min >= 40 ? 'var(--cat-danger)' : 'var(--theme-text-primary)',
                  fontWeight: item.idling_time_min >= 40 ? 800 : 500
                }} className="mono-num">
                  {item.idling_time_min} min
                </td>
                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: 700 }} className="mono-num">
                  {item.load_cycles}
                </td>
                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                  {item.seatbelt_status.toLowerCase() === 'fastened' ? (
                    <span className="cat-badge badge-success" style={{ fontSize: '0.7rem' }}>
                      ✓ Fastened
                    </span>
                  ) : (
                    <span className="cat-badge badge-danger" style={{ fontSize: '0.7rem' }}>
                      ⚠ Unfastened
                    </span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: 800, color: 'var(--theme-text-primary)' }} className="mono-num">
                  ${item.estimated_idle_cost_usd.toFixed(2)}
                </td>
                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                  {item.is_ghost_idle ? (
                    <span className="cat-badge badge-danger" style={{ fontSize: '0.7rem' }}>
                      GHOST IDLE
                    </span>
                  ) : (
                    <span className="cat-badge badge-custody" style={{ fontSize: '0.7rem' }}>
                      NORMAL
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
