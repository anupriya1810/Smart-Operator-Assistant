import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, ShieldCheck, Compass, Gauge, Check } from 'lucide-react';

export interface GeofenceProximity {
  machine_id: string;
  machine_model: string;
  operator_id?: string | null;
  current_zone: string;
  authorized_zone: string;
  speed_kmh: number;
  heading_deg: number;
  is_geofence_breached: boolean;
  nearest_restricted_zone_id?: string | null;
  nearest_restricted_zone_name?: string | null;
  distance_to_restricted_m: number;
  warning_level: 'safe' | 'caution' | 'critical';
  warning_message: string;
}

interface OperatorGeofenceBannerProps {
  proximity: GeofenceProximity;
  onAcknowledge?: () => Promise<void>;
}

export const OperatorGeofenceBanner: React.FC<OperatorGeofenceBannerProps> = ({
  proximity,
  onAcknowledge
}) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAck = async () => {
    if (!onAcknowledge) return;
    setSubmitting(true);
    try {
      await onAcknowledge();
      setAcknowledged(true);
      setTimeout(() => setAcknowledged(false), 8000);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const isCritical = proximity.warning_level === 'critical';
  const isCaution = proximity.warning_level === 'caution';

  if (!isCritical && !isCaution) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between text-xs text-gray-600 shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" strokeWidth={1.5} />
          <span>Geofence Status: <strong>Nominal</strong> &bull; Authorized Zone: {proximity.authorized_zone}</span>
        </div>
        <span className="mono-num text-gray-500 font-medium">{proximity.distance_to_restricted_m}m to boundary</span>
      </div>
    );
  }

  return (
    <div
      className={
        isCritical
          ? 'bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-lg p-4 shadow-xs'
          : 'bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-lg p-4 shadow-xs'
      }
    >
      <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex items-start gap-3">
          {isCritical ? (
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" strokeWidth={1.5} />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" strokeWidth={1.5} />
          )}

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-semibold text-sm ${isCritical ? 'text-red-900' : 'text-amber-900'}`}>
                {isCritical ? 'Geofence Perimeter Breach' : 'Restricted Zone Proximity Warning'}
              </h3>
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isCritical ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                {isCritical ? 'CRITICAL' : 'CAUTION'}
              </span>
            </div>

            <p className="text-xs text-gray-700 mt-1 leading-relaxed">
              {proximity.warning_message}
            </p>

            <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-2 flex-wrap">
              <span className="flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="mono-num font-medium">{proximity.speed_kmh} km/h</span>
              </span>
              <span className="flex items-center gap-1">
                <Compass className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="mono-num font-medium">{proximity.heading_deg}°</span>
              </span>
              <span>
                Boundary: <strong className="mono-num">{isCritical ? '0.0m (BREACHED)' : `${proximity.distance_to_restricted_m}m`}</strong>
              </span>
            </div>
          </div>
        </div>

        {onAcknowledge && (
          <div className="shrink-0 self-center sm:self-start">
            <button
              onClick={handleAck}
              disabled={submitting || acknowledged}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all ${isCritical
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700'
                }`}
            >
              {acknowledged ? (
                <>
                  <Check className="w-3.5 h-3.5" strokeWidth={2} />
                  <span>Acknowledged</span>
                </>
              ) : submitting ? (
                'Logging...'
              ) : (
                'Acknowledge Buffer'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
