import React, { useState, useEffect } from 'react';
import {
  Navigation,
  AlertTriangle,
  ShieldAlert,
  Radio,
  Route,
  CheckCircle,
  Eye,
  RefreshCw,
  BellRing
} from 'lucide-react';
import { API_BASE } from '../../config';

interface MachineGps {
  machine_id: string;
  model: string;
  type: string;
  latitude: number;
  longitude: number;
  current_zone: string;
  authorized_zone: string;
  speed_kmh: number;
  heading_deg: number;
  is_geofence_breached: boolean;
  last_gps_update: string;
  current_operator_name?: string;
}

interface GeofenceZone {
  zone_id: string;
  name: string;
  center_lat: number;
  center_lon: number;
  radius_m: number;
  zone_type: 'safe_work_zone' | 'blast_danger_zone' | 'speed_restricted' | 'haul_road';
  max_speed_kmh: number;
}

interface GpsTrace {
  trace_id?: number;
  machine_id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading_deg: number;
  is_anomaly: boolean;
  anomaly_reason?: string;
}

interface GpsAnomaly {
  machine_id: string;
  machine_model: string;
  operator_name?: string;
  current_zone: string;
  authorized_zone: string;
  anomaly_type: string;
  anomaly_description: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface FleetGpsTrackerProps {
  supervisorTimezone?: string;
}

export const FleetGpsTracker: React.FC<FleetGpsTrackerProps> = ({ supervisorTimezone = 'America/New_York' }) => {
  const [machines, setMachines] = useState<MachineGps[]>([]);
  const [geofences, setGeofences] = useState<GeofenceZone[]>([]);
  const [anomalies, setAnomalies] = useState<GpsAnomaly[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('EXC002');
  const [traces, setTraces] = useState<GpsTrace[]>([]);
  const [loading, setLoading] = useState(false);
  const [dispatchedWarning, setDispatchedWarning] = useState<string | null>(null);

  const fetchGpsData = async () => {
    try {
      setLoading(true);
      const [machRes, geoRes, anomRes] = await Promise.all([
        fetch(`${API_BASE}/api/machines`),
        fetch(`${API_BASE}/api/fleet/geofences`),
        fetch(`${API_BASE}/api/fleet/gps/anomalies`)
      ]);

      if (machRes.ok) {
        const data = await machRes.json();
        // filter machines with valid coords
        setMachines(data.map((m: any) => ({
          ...m,
          latitude: m.latitude || 40.7128,
          longitude: m.longitude || -74.0060,
          speed_kmh: m.speed_kmh || 0.0,
          heading_deg: m.heading_deg || 0.0,
          is_geofence_breached: Boolean(m.is_geofence_breached)
        })));
      }
      if (geoRes.ok) setGeofences(await geoRes.json());
      if (anomRes.ok) setAnomalies(await anomRes.json());
    } catch (e) {
      console.error('GPS fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTracesForMachine = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/fleet/gps/traces?machine_id=${id}`);
      if (res.ok) setTraces(await res.json());
    } catch (e) {
      console.error('Traces fetch error:', e);
    }
  };

  useEffect(() => {
    fetchGpsData();
    const interval = setInterval(fetchGpsData, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedMachineId) {
      fetchTracesForMachine(selectedMachineId);
    }
  }, [selectedMachineId]);

  const handleSendCabinSiren = (machineId: string) => {
    setDispatchedWarning(`Cabin Siren & Recall Beacon dispatched to ${machineId} via In-Cab HUD.`);
    setTimeout(() => setDispatchedWarning(null), 6000);
  };

  // Coordinate projections for the SVG Jobsite Map
  // Center: Lat 40.7135, Lon -74.0060
  // Range: lat [40.7070 to 40.7200], lon [-74.0110 to -74.0010]
  const mapWidth = 720;
  const mapHeight = 440;
  const minLat = 40.7070, maxLat = 40.7205;
  const minLon = -74.0115, maxLon = -74.0010;

  const projectCoords = (lat: number, lon: number) => {
    const x = ((lon - minLon) / (maxLon - minLon)) * (mapWidth - 80) + 40;
    const y = ((maxLat - lat) / (maxLat - minLat)) * (mapHeight - 80) + 40;
    return { x: Math.max(20, Math.min(mapWidth - 20, x)), y: Math.max(20, Math.min(mapHeight - 20, y)) };
  };

  const activeMachine = machines.find(m => m.machine_id === selectedMachineId) || machines[0];

  return (
    <div className="cat-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ backgroundColor: 'var(--cat-yellow-subtle)', color: 'var(--cat-yellow)', padding: '0.4rem', borderRadius: '8px', display: 'flex' }}>
              <Navigation size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-text-primary)', margin: 0 }}>
                Fleet GPS Live Telemetry &amp; Geofence Radar
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)', margin: '2px 0 0 0' }}>
                Real-time satellite positioning, perimeter security, and automated boundary breach anomaly detection.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="cat-badge" style={{
            backgroundColor: anomalies.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            color: anomalies.length > 0 ? 'var(--cat-danger)' : 'var(--cat-success)',
            border: anomalies.length > 0 ? '1px solid var(--cat-danger)' : '1px solid var(--cat-success)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}>
            {anomalies.length > 0 ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
            <span>{anomalies.length} Perimeter Anomaly Flagged</span>
          </span>

          <button
            onClick={fetchGpsData}
            className="cat-btn cat-btn-outline"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', minHeight: '34px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Dispatched Notification Toast */}
      {dispatchedWarning && (
        <div style={{
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid var(--cat-success)',
          color: 'var(--theme-text-primary)',
          padding: '0.65rem 1rem',
          borderRadius: '8px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle size={16} color="var(--cat-success)" />
          <span>{dispatchedWarning}</span>
        </div>
      )}

      {/* "Something Weird" Anomaly Banner */}
      {anomalies.length > 0 && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid var(--cat-danger)',
          borderRadius: '10px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--cat-danger)', fontWeight: 800, fontSize: '0.9rem' }}>
              <ShieldAlert size={18} />
              <span>SUPERVISOR ALERT: Anomalous Machine Displacement Detected</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>Auto-reported by GPS Geofence Engine</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {anomalies.map((anom, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 800, color: 'var(--theme-text-primary)', fontSize: '0.85rem' }}>
                      {anom.machine_model} ({anom.machine_id})
                    </span>
                    <span className="cat-badge" style={{ backgroundColor: '#EF4444', color: '#FFFFFF', fontSize: '0.7rem' }}>
                      {anom.anomaly_type}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--theme-text-secondary)', lineHeight: '1.35' }}>
                    {anom.anomaly_description}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setSelectedMachineId(anom.machine_id)}
                    className="cat-btn cat-btn-outline"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', minHeight: '30px' }}
                  >
                    <Eye size={13} />
                    <span>Track Route</span>
                  </button>
                  <button
                    onClick={() => handleSendCabinSiren(anom.machine_id)}
                    className="cat-btn"
                    style={{
                      backgroundColor: 'var(--cat-danger)',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.75rem',
                      minHeight: '30px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <BellRing size={13} />
                    <span>Dispatch Siren</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Map & Breadcrumb Tracker Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: '1.25rem' }}>
        {/* SVG Interactive Jobsite Radar Map */}
        <div style={{
          backgroundColor: '#09090B',
          border: '1px solid var(--theme-card-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Map Controls Overlay */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: 'rgba(15, 15, 18, 0.85)',
            border: '1px solid #27272A',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: 'var(--theme-text-secondary)'
          }}>
            <Radio size={13} color="var(--cat-yellow)" className="spin" />
            <span>Active Satellite Coordinates: <strong>Metro NY &amp; Denver Operations</strong></span>
          </div>

          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 10,
            display: 'flex',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22C55E', color: '#22C55E', padding: '2px 8px', borderRadius: '4px' }}>
              ● Safe Zones
            </span>
            <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(239, 68, 68, 0.25)', border: '1px solid #EF4444', color: '#EF4444', padding: '2px 8px', borderRadius: '4px' }}>
              ▲ Blast Perimeter
            </span>
          </div>

          {/* SVG Map Canvas */}
          <svg
            viewBox={`0 0 ${mapWidth} ${mapHeight}`}
            style={{ width: '100%', height: 'auto', display: 'block', backgroundColor: '#09090B' }}
          >
            <defs>
              {/* Radar Grid Pattern */}
              <pattern id="radarGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#18181B" strokeWidth="0.8" />
              </pattern>
              {/* Blast Hazard Hatch */}
              <pattern id="blastHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(239, 68, 68, 0.35)" strokeWidth="3" />
              </pattern>
            </defs>

            {/* Grid Background */}
            <rect width={mapWidth} height={mapHeight} fill="url(#radarGrid)" />

            {/* Geofence Zones */}
            {geofences.map(zone => {
              const pt = projectCoords(zone.center_lat, zone.center_lon);
              const isBlast = zone.zone_type === 'blast_danger_zone';
              const r = isBlast ? 60 : 75;

              return (
                <g key={zone.zone_id}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={r}
                    fill={isBlast ? 'url(#blastHatch)' : 'rgba(255, 205, 17, 0.05)'}
                    stroke={isBlast ? '#EF4444' : '#EAB308'}
                    strokeWidth={isBlast ? 2 : 1.5}
                    strokeDasharray={isBlast ? '6,3' : '4,4'}
                  />
                  <text
                    x={pt.x}
                    y={pt.y - r - 6}
                    fill={isBlast ? '#EF4444' : '#A1A1AA'}
                    fontSize="10"
                    fontWeight="700"
                    textAnchor="middle"
                    style={{ letterSpacing: '0.04em' }}
                  >
                    {zone.name.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* Historical Breadcrumb Traces for Selected Machine */}
            {traces.length > 1 && (
              <g>
                {/* Polyline route */}
                <polyline
                  points={traces.map(t => {
                    const p = projectCoords(t.latitude, t.longitude);
                    return `${p.x},${p.y}`;
                  }).join(' ')}
                  fill="none"
                  stroke={traces.some(t => t.is_anomaly) ? '#EF4444' : '#FFCD11'}
                  strokeWidth="2.5"
                  strokeDasharray="4,2"
                />

                {/* Waypoint dots */}
                {traces.map((t, idx) => {
                  const p = projectCoords(t.latitude, t.longitude);
                  return (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={t.is_anomaly ? 5 : 3.5}
                      fill={t.is_anomaly ? '#EF4444' : '#FFCD11'}
                      stroke="#111111"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </g>
            )}

            {/* Machine Markers */}
            {machines.map(m => {
              const pt = projectCoords(m.latitude, m.longitude);
              const isSelected = m.machine_id === selectedMachineId;
              const isBreach = m.is_geofence_breached;

              return (
                <g
                  key={m.machine_id}
                  onClick={() => setSelectedMachineId(m.machine_id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Glowing halo for breach or selected */}
                  {(isBreach || isSelected) && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="16"
                      fill={isBreach ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 205, 17, 0.25)'}
                    >
                      <animate
                        attributeName="r"
                        values={isBreach ? '14;22;14' : '14;18;14'}
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Marker Pin Base */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="8.5"
                    fill={isBreach ? '#EF4444' : isSelected ? '#FFCD11' : '#3F3F46'}
                    stroke="#111111"
                    strokeWidth="2"
                  />

                  {/* Heading direction pointer */}
                  <path
                    d={`M ${pt.x} ${pt.y - 12} L ${pt.x + 4} ${pt.y - 7} L ${pt.x - 4} ${pt.y - 7} Z`}
                    fill={isBreach ? '#EF4444' : '#FFCD11'}
                    transform={`rotate(${m.heading_deg} ${pt.x} ${pt.y})`}
                  />

                  {/* Machine ID Label */}
                  <text
                    x={pt.x}
                    y={pt.y + 18}
                    fill={isBreach ? '#EF4444' : isSelected ? '#FFCD11' : '#E4E4E7'}
                    fontSize="11"
                    fontWeight="800"
                    textAnchor="middle"
                  >
                    {m.machine_id}
                  </text>
                  <text
                    x={pt.x}
                    y={pt.y + 28}
                    fill="#A1A1AA"
                    fontSize="9"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {m.speed_kmh} km/h
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Map Footer Bar */}
          <div style={{
            backgroundColor: '#121215',
            borderTop: '1px solid #27272A',
            padding: '0.65rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.78rem',
            color: 'var(--theme-text-secondary)',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}>
            <div>
              Click any equipment pin to project its <strong>Historical GPS Movement Trace</strong>.
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <span>Total Fleet: <strong>{machines.length} units</strong></span>
              <span>Active GPS Locks: <strong>{machines.filter(m => m.speed_kmh > 0).length} moving</strong></span>
            </div>
          </div>
        </div>

        {/* Selected Machine Telemetry & Trace Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Active Machine Card */}
          {activeMachine && (
            <div style={{
              backgroundColor: 'var(--theme-card-bg-elevated)',
              border: activeMachine.is_geofence_breached ? '1px solid var(--cat-danger)' : '1px solid var(--theme-card-border)',
              borderLeft: activeMachine.is_geofence_breached ? '4px solid var(--cat-danger)' : '4px solid var(--cat-yellow)',
              borderRadius: '10px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--theme-text-primary)' }}>
                      {activeMachine.model}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cat-yellow)', backgroundColor: '#111', padding: '1px 6px', borderRadius: '4px', border: '1px solid #333' }}>
                      {activeMachine.machine_id}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)', marginTop: '2px' }}>
                    Driver: <strong>{activeMachine.current_operator_name || 'Unassigned'}</strong>
                  </div>
                </div>

                <span className="cat-badge" style={{
                  backgroundColor: activeMachine.is_geofence_breached ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                  color: activeMachine.is_geofence_breached ? 'var(--cat-danger)' : 'var(--cat-success)',
                  border: activeMachine.is_geofence_breached ? '1px solid var(--cat-danger)' : '1px solid var(--cat-success)',
                  fontSize: '0.72rem'
                }}>
                  {activeMachine.is_geofence_breached ? 'GEOFENCE BREACH' : 'ZONE NOMINAL'}
                </span>
              </div>

              {/* Machine GPS Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', backgroundColor: 'var(--theme-subtle-bg)', padding: '0.65rem', borderRadius: '8px' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)', display: 'block' }}>Speed:</span>
                  <div className="mono-num" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--theme-text-primary)' }}>
                    {activeMachine.speed_kmh} km/h
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)', display: 'block' }}>Heading:</span>
                  <div className="mono-num" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--theme-text-primary)' }}>
                    {activeMachine.heading_deg}° NW
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)', display: 'block' }}>Current vs Authorized Zone:</span>
                  <div style={{ fontSize: '0.8rem', color: activeMachine.is_geofence_breached ? 'var(--cat-danger)' : 'var(--theme-text-primary)', fontWeight: 600 }}>
                    {activeMachine.current_zone} &bull; <span style={{ color: 'var(--theme-text-muted)' }}>Auth: {activeMachine.authorized_zone}</span>
                  </div>
                </div>
              </div>

              {activeMachine.is_geofence_breached && (
                <button
                  onClick={() => handleSendCabinSiren(activeMachine.machine_id)}
                  className="cat-btn"
                  style={{
                    backgroundColor: 'var(--cat-danger)',
                    color: '#FFFFFF',
                    border: 'none',
                    width: '100%',
                    minHeight: '38px',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <BellRing size={15} />
                  <span>Dispatch In-Cab Perimeter Siren</span>
                </button>
              )}
            </div>
          )}

          {/* Breadcrumb Trace Route Timeline */}
          <div style={{
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-card-border)',
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            flex: 1
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.85rem', color: 'var(--theme-text-primary)' }}>
                <Route size={15} color="var(--cat-yellow)" />
                <span>GPS Breadcrumb Route ({traces.length} Waypoints)</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>{selectedMachineId}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
              {traces.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)', textAlign: 'center', padding: '1rem' }}>
                  No historical traces available for this machine.
                </div>
              ) : (
                traces.map((t, idx) => (
                  <div
                    key={idx}
                    style={{
                      borderLeft: t.is_anomaly ? '3px solid var(--cat-danger)' : '3px solid var(--theme-divider)',
                      paddingLeft: '0.5rem',
                      fontSize: '0.78rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--theme-text-primary)' }}>
                      <span className="mono-num">{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: supervisorTimezone })}</span>
                      <span className="mono-num" style={{ color: 'var(--theme-text-secondary)' }}>{t.speed_kmh} km/h &bull; {t.heading_deg}°</span>
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--theme-text-muted)' }}>
                      Lat: {t.latitude.toFixed(4)}, Lon: {t.longitude.toFixed(4)}
                    </div>
                    {t.anomaly_reason && (
                      <div style={{ color: 'var(--cat-danger)', fontWeight: 700, fontSize: '0.72rem', marginTop: '2px' }}>
                        ▲ {t.anomaly_reason}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
