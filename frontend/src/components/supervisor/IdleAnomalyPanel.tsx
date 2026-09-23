import React from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, AlertTriangle, Fuel, Activity } from 'lucide-react';
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: '#FEF3C7', color: '#B45309', padding: '0.3rem', borderRadius: '6px', display: 'inline-flex' }}>
              <Activity size={18} />
            </div>
            {t('idleAnomaly')}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
            Machine telemetry stream (Photo 2) &amp; $-cost-of-idle abuse detection.
          </p>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', borderRadius: '10px', padding: '1.1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748B', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            <DollarSign size={15} color="#D97706" />
            <span>Total Idle Fuel Burn</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
            ${totalIdleCost.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>{totalIdleMins} total idling minutes</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', borderRadius: '10px', padding: '1.1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748B', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            <AlertTriangle size={15} color="#DC2626" />
            <span>Ghost Idling Flags</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: ghostIdleEvents > 0 ? '#DC2626' : '#059669', marginTop: '4px' }}>
            {ghostIdleEvents} Events
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>&gt;40m idle with &lt;3 load cycles</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', borderRadius: '10px', padding: '1.1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748B', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            <Fuel size={15} color="#2563EB" />
            <span>Seatbelt Violations</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: seatbeltViolations > 0 ? '#D97706' : '#059669', marginTop: '4px' }}>
            {seatbeltViolations} Shifts
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>Operating with unbuckled belt</div>
        </div>
      </div>

      {/* Telemetry Stream Log Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', backgroundColor: '#FFFFFF' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#475569', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em' }}>
              <th style={{ padding: '0.75rem 0.85rem' }}>Timestamp</th>
              <th style={{ padding: '0.75rem 0.85rem' }}>Machine</th>
              <th style={{ padding: '0.75rem 0.85rem' }}>Operator</th>
              <th style={{ padding: '0.75rem 0.85rem' }}>Idling Time</th>
              <th style={{ padding: '0.75rem 0.85rem' }}>Load Cycles</th>
              <th style={{ padding: '0.75rem 0.85rem' }}>Seatbelt</th>
              <th style={{ padding: '0.75rem 0.85rem' }}>Idle Penalty</th>
              <th style={{ padding: '0.75rem 0.85rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map((item, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid #F1F5F9',
                  backgroundColor: item.is_ghost_idle ? '#FEF2F2' : 'transparent',
                  color: '#0F172A'
                }}
              >
                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 500, color: '#334155' }}>
                  {formatUtcToLocal(item.timestamp, supervisorTimezone)}
                </td>
                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>
                  <span style={{ backgroundColor: '#18181B', color: '#FFCD11', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem' }}>
                    {item.machine_id}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 500, color: '#334155' }}>
                  {item.operator_name || item.operator_id}
                </td>
                <td style={{ padding: '0.75rem 0.85rem', color: item.idling_time_min >= 40 ? '#DC2626' : '#0F172A', fontWeight: item.idling_time_min >= 40 ? 700 : 500 }}>
                  {item.idling_time_min} min
                </td>
                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600 }}>
                  {item.load_cycles}
                </td>
                <td style={{ padding: '0.75rem 0.85rem' }}>
                  {item.seatbelt_status.toLowerCase() === 'fastened' ? (
                    <span className="cat-badge badge-green" style={{ fontSize: '0.7rem' }}>✓ Fastened</span>
                  ) : (
                    <span className="cat-badge badge-red" style={{ fontSize: '0.7rem' }}>⚠ Unfastened</span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: '#0F172A' }}>
                  ${item.estimated_idle_cost_usd.toFixed(2)}
                </td>
                <td style={{ padding: '0.75rem 0.85rem' }}>
                  {item.is_ghost_idle ? (
                    <span className="cat-badge badge-red" style={{ fontSize: '0.7rem' }}>GHOST IDLE</span>
                  ) : (
                    <span className="cat-badge badge-blue" style={{ fontSize: '0.7rem' }}>NORMAL</span>
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
