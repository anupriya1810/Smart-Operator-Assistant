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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '2px solid #111111', paddingBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#111111', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: '#FFCD11', color: '#111111', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'inline-flex' }}>
              <Activity size={20} />
            </div>
            {t('idleAnomaly')}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '2px' }}>
            Machine telemetry stream (Photo 2) & $-cost-of-idle abuse detection.
          </p>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ backgroundColor: '#FFFFFF', border: '2px solid #111111', boxShadow: '3px 3px 0px #111111', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#111111', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>
            <DollarSign size={16} color="#D97706" />
            <span>Total Idle Fuel Burn</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#111111', marginTop: '4px' }}>
            ${totalIdleCost.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#4B5563', fontWeight: 600 }}>{totalIdleMins} total idling minutes</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', border: '2px solid #111111', boxShadow: '3px 3px 0px #111111', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#111111', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>
            <AlertTriangle size={16} color="#DC2626" />
            <span>Ghost Idling Flags</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: ghostIdleEvents > 0 ? '#DC2626' : '#059669', marginTop: '4px' }}>
            {ghostIdleEvents} Events
          </div>
          <div style={{ fontSize: '0.8rem', color: '#4B5563', fontWeight: 600 }}>&gt;40m idle with &lt;3 load cycles</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', border: '2px solid #111111', boxShadow: '3px 3px 0px #111111', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#111111', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>
            <Fuel size={16} color="#2563EB" />
            <span>Seatbelt Violations</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: seatbeltViolations > 0 ? '#D97706' : '#059669', marginTop: '4px' }}>
            {seatbeltViolations} Shifts
          </div>
          <div style={{ fontSize: '0.8rem', color: '#4B5563', fontWeight: 600 }}>Operating with unbuckled belt</div>
        </div>
      </div>

      {/* Telemetry Stream Log Table */}
      <div style={{ overflowX: 'auto', border: '2px solid #111111', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', backgroundColor: '#FFFFFF' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #111111', backgroundColor: '#FFCD11', color: '#111111', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 900 }}>
              <th style={{ padding: '0.75rem 0.6rem' }}>Timestamp</th>
              <th style={{ padding: '0.75rem 0.6rem' }}>Machine</th>
              <th style={{ padding: '0.75rem 0.6rem' }}>Operator</th>
              <th style={{ padding: '0.75rem 0.6rem' }}>Idling Time</th>
              <th style={{ padding: '0.75rem 0.6rem' }}>Load Cycles</th>
              <th style={{ padding: '0.75rem 0.6rem' }}>Seatbelt</th>
              <th style={{ padding: '0.75rem 0.6rem' }}>Idle Penalty ($)</th>
              <th style={{ padding: '0.75rem 0.6rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map((item, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid #E5E7EB',
                  backgroundColor: item.is_ghost_idle ? '#FEF2F2' : 'transparent',
                  color: '#111111'
                }}
              >
                <td style={{ padding: '0.7rem 0.6rem', fontWeight: 600 }}>
                  {formatUtcToLocal(item.timestamp, supervisorTimezone)}
                </td>
                <td style={{ padding: '0.7rem 0.6rem', fontWeight: 800, color: '#111111' }}>
                  <span style={{ backgroundColor: '#111111', color: '#FFCD11', padding: '2px 6px', borderRadius: '4px' }}>
                    {item.machine_id}
                  </span>
                </td>
                <td style={{ padding: '0.7rem 0.6rem', fontWeight: 600, color: '#374151' }}>
                  {item.operator_name || item.operator_id}
                </td>
                <td style={{ padding: '0.7rem 0.6rem', color: item.idling_time_min >= 40 ? '#DC2626' : '#111111', fontWeight: item.idling_time_min >= 40 ? 800 : 500 }}>
                  {item.idling_time_min} min
                </td>
                <td style={{ padding: '0.7rem 0.6rem', fontWeight: 700 }}>
                  {item.load_cycles}
                </td>
                <td style={{ padding: '0.7rem 0.6rem' }}>
                  {item.seatbelt_status.toLowerCase() === 'fastened' ? (
                    <span className="cat-badge badge-green" style={{ fontSize: '0.7rem' }}>✓ Fastened</span>
                  ) : (
                    <span className="cat-badge badge-red" style={{ fontSize: '0.7rem' }}>⚠ Unfastened</span>
                  )}
                </td>
                <td style={{ padding: '0.7rem 0.6rem', fontWeight: 900, color: '#111111' }}>
                  ${item.estimated_idle_cost_usd.toFixed(2)}
                </td>
                <td style={{ padding: '0.7rem 0.6rem' }}>
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
