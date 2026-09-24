import React, { useState } from 'react';
import { Thermometer, CheckCircle, Pause, Play } from 'lucide-react';

export interface DutyCycleInfo {
  machine_id: string;
  machine_model?: string;
  operator_id?: string;
  operator_name?: string;
  continuous_engine_hours: number;
  duty_limit_hours: number;
  is_cooldown_required: boolean;
  cooldown_duration_min: number;
  cooldown_status: 'nominal' | 'cooldown_recommended' | 'cooling_down' | 'cooldown_completed';
  cooldown_task_id?: string | null;
  recommended_action: string;
  last_cooldown_at?: string | null;
}

interface DutyCycleBannerProps {
  dutyCycle: DutyCycleInfo | null;
  onScheduleCooldown?: (machineId: string) => Promise<void>;
  onCompleteCooldown?: (machineId: string) => Promise<void>;
}

export const DutyCycleBanner: React.FC<DutyCycleBannerProps> = ({
  dutyCycle,
  onScheduleCooldown,
  onCompleteCooldown,
}) => {
  const [submitting, setSubmitting] = useState(false);

  if (!dutyCycle) return null;

  const {
    continuous_engine_hours,
    duty_limit_hours,
    cooldown_status,
    cooldown_duration_min,
    recommended_action,
    machine_id,
  } = dutyCycle;

  const percent = Math.min(100, Math.round((continuous_engine_hours / duty_limit_hours) * 100));
  const isWarning = cooldown_status === 'cooldown_recommended';
  const isCooling = cooldown_status === 'cooling_down';

  const handleAction = async () => {
    setSubmitting(true);
    try {
      if (isCooling && onCompleteCooldown) {
        await onCompleteCooldown(machine_id);
      } else if (onScheduleCooldown) {
        await onScheduleCooldown(machine_id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const getBarColor = () => {
    if (isCooling) return 'bg-blue-500';
    if (percent >= 100 || isWarning) return 'bg-red-500';
    if (percent >= 75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className={`bg-white border rounded-lg p-4 shadow-xs flex flex-col justify-between ${isWarning ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-700">
            <Thermometer className="w-4 h-4 text-gray-600" strokeWidth={1.5} />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">Thermal &amp; Duty-Cycle</div>
            <div className="text-[11px] text-gray-500">Unit: {machine_id}</div>
          </div>
        </div>

        <div>
          {isCooling ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              <Pause className="w-3 h-3" strokeWidth={2} /> Cooling ({cooldown_duration_min}m)
            </span>
          ) : isWarning ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
              Rest Required
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Nominal
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar (bg-gray-100 track with colored fill) */}
      <div className="my-3">
        <div className="flex justify-between text-[11px] text-gray-500 mb-1">
          <span>Continuous Engine Load</span>
          <span className="mono-num font-semibold text-gray-800">{continuous_engine_hours}h / {duty_limit_hours}h ({percent}%)</span>
        </div>
        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`} style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 text-xs">
        <p className="text-[11px] text-gray-600 truncate max-w-[260px]" title={recommended_action}>
          {recommended_action}
        </p>

        {(isWarning || isCooling) && (onScheduleCooldown || onCompleteCooldown) && (
          <button
            onClick={handleAction}
            disabled={submitting}
            className={`px-2.5 py-1 rounded text-xs font-semibold shrink-0 transition-colors ${isCooling
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
          >
            {isCooling ? (
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" strokeWidth={2} /> Resume</span>
            ) : (
              <span className="flex items-center gap-1"><Play className="w-3 h-3" strokeWidth={2} /> Start Rest</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
