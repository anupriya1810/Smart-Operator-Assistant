import React, { useState, useEffect } from 'react';
import { Sliders, X, CheckCircle, RotateCcw, Fuel, Clock, ShieldAlert } from 'lucide-react';

export interface SupervisorThresholdsData {
  id: string;
  idle_limit_min: number;
  sos_timeout_sec: number;
  diesel_cost_per_liter: number;
  idle_burn_rate_l_per_hour: number;
  anomaly_sensitivity: 'low' | 'standard' | 'high' | 'strict';
  duty_cycle_max_hours: number;
  cooldown_period_min: number;
  updated_at?: string;
}

interface ThresholdConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentThresholds: SupervisorThresholdsData | null;
  onSave: (updated: Partial<SupervisorThresholdsData>) => Promise<void>;
}

export const ThresholdConfigModal: React.FC<ThresholdConfigModalProps> = ({
  isOpen,
  onClose,
  currentThresholds,
  onSave,
}) => {
  const [idleLimit, setIdleLimit] = useState(40);
  const [sosTimeout, setSosTimeout] = useState(45);
  const [dieselCost, setDieselCost] = useState(1.35);
  const [burnRate, setBurnRate] = useState(3.6);
  const [sensitivity, setSensitivity] = useState<'low' | 'standard' | 'high' | 'strict'>('standard');
  const [dutyCycle, setDutyCycle] = useState(4.0);
  const [cooldown, setCooldown] = useState(15);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (currentThresholds) {
      setIdleLimit(currentThresholds.idle_limit_min);
      setSosTimeout(currentThresholds.sos_timeout_sec);
      setDieselCost(currentThresholds.diesel_cost_per_liter);
      setBurnRate(currentThresholds.idle_burn_rate_l_per_hour);
      setSensitivity(currentThresholds.anomaly_sensitivity);
      setDutyCycle(currentThresholds.duty_cycle_max_hours);
      setCooldown(currentThresholds.cooldown_period_min);
    }
  }, [currentThresholds, isOpen]);

  if (!isOpen) return null;

  // Real-time projected cost calculation for 45 min idle
  const sampleWastedFuel = (45 / 60) * burnRate;
  const sampleProjectedCost = sampleWastedFuel * dieselCost;

  const handleResetDefaults = () => {
    setIdleLimit(40);
    setSosTimeout(45);
    setDieselCost(1.35);
    setBurnRate(3.6);
    setSensitivity('standard');
    setDutyCycle(4.0);
    setCooldown(15);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        idle_limit_min: idleLimit,
        sos_timeout_sec: sosTimeout,
        diesel_cost_per_liter: dieselCost,
        idle_burn_rate_l_per_hour: burnRate,
        anomaly_sensitivity: sensitivity,
        duty_cycle_max_hours: dutyCycle,
        cooldown_period_min: cooldown,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to update thresholds:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.78)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-card-border)',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 205, 17, 0.15)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--theme-divider)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--theme-subtle-bg)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              backgroundColor: 'var(--cat-yellow-subtle)',
              color: 'var(--cat-yellow)',
              padding: '0.45rem',
              borderRadius: '8px',
              display: 'inline-flex'
            }}>
              <Sliders size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-text-primary)' }}>
                Site Thresholds &amp; Safety Limits
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)', marginTop: '2px' }}>
                Tune real-time parameters for idle detection, SOS timers, and fuel benchmarks.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cat-btn cat-btn-icon"
            style={{ color: 'var(--theme-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {saveSuccess && (
            <div style={{
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid var(--cat-success)',
              color: 'var(--cat-success)',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <CheckCircle size={16} />
              <span>Thresholds successfully updated and broadcasted across site!</span>
            </div>
          )}

          {/* Section 1: Fleet Idling & Cost */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cat-yellow)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Fuel size={14} /> Fleet Idling &amp; Fuel Waste Benchmarks
            </div>

            {/* Ghost Idle Threshold */}
            <div style={{ backgroundColor: 'var(--theme-subtle-bg)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--theme-subtle-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--theme-text-primary)' }}>
                  Ghost Idling Alert Limit: <strong style={{ color: 'var(--cat-yellow)' }}>{idleLimit} minutes</strong>
                </label>
                <span className="cat-badge" style={{ backgroundColor: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}>
                  Default: 40 min
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={60}
                step={5}
                value={idleLimit}
                onChange={e => setIdleLimit(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--cat-yellow)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                <span>20 min (Strict)</span>
                <span>40 min (Factory)</span>
                <span>60 min (Relaxed)</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--theme-text-secondary)', marginTop: '0.35rem' }}>
                Machines exceeding this idle duration with minimal load cycles will trigger supervisor ghost idle alerts.
              </p>
            </div>

            {/* Diesel Cost & Burn Rate (2 Columns) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ backgroundColor: 'var(--theme-subtle-bg)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--theme-subtle-border)' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--theme-text-primary)', display: 'block', marginBottom: '0.4rem' }}>
                  Off-Road Diesel: <strong style={{ color: 'var(--cat-yellow)' }}>${dieselCost.toFixed(2)}/L</strong>
                </label>
                <input
                  type="number"
                  min={0.80}
                  max={3.50}
                  step={0.05}
                  value={dieselCost}
                  onChange={e => setDieselCost(Number(e.target.value))}
                  className="cat-input"
                  style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)', display: 'block', marginTop: '0.35rem' }}>
                  Current benchmark: $1.35/L
                </span>
              </div>

              <div style={{ backgroundColor: 'var(--theme-subtle-bg)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--theme-subtle-border)' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--theme-text-primary)', display: 'block', marginBottom: '0.4rem' }}>
                  Idle Burn Rate: <strong style={{ color: 'var(--cat-yellow)' }}>{burnRate.toFixed(1)} L/hr</strong>
                </label>
                <input
                  type="number"
                  min={1.5}
                  max={6.5}
                  step={0.1}
                  value={burnRate}
                  onChange={e => setBurnRate(Number(e.target.value))}
                  className="cat-input"
                  style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)', display: 'block', marginTop: '0.35rem' }}>
                  Excavator standard: 3.6 L/hr
                </span>
              </div>
            </div>

            {/* Live Projected Cost Preview Box */}
            <div style={{
              backgroundColor: 'rgba(255, 205, 17, 0.08)',
              border: '1px solid rgba(255, 205, 17, 0.3)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8rem'
            }}>
              <span style={{ color: 'var(--theme-text-secondary)' }}>
                Live Model Preview: <strong>45 min idle</strong> fuel waste:
              </span>
              <span style={{ fontWeight: 800, color: 'var(--cat-yellow)', fontSize: '0.9rem' }}>
                {sampleWastedFuel.toFixed(2)} L &bull; ${sampleProjectedCost.toFixed(2)} USD
              </span>
            </div>
          </div>

          {/* Section 2: Safety & SOS Escalation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cat-danger)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ShieldAlert size={14} /> Safety Escalation &amp; Cabin SOS
            </div>

            {/* SOS Timeout */}
            <div style={{ backgroundColor: 'var(--theme-subtle-bg)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--theme-subtle-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--theme-text-primary)' }}>
                  In-Cab SOS Acknowledge Timeout: <strong style={{ color: 'var(--cat-danger)' }}>{sosTimeout} seconds</strong>
                </label>
                <span className="cat-badge" style={{ backgroundColor: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}>
                  Default: 45 sec
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={60}
                step={5}
                value={sosTimeout}
                onChange={e => setSosTimeout(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--cat-danger)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                <span>30s (Rapid Response)</span>
                <span>45s (Factory)</span>
                <span>60s (Extended)</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--theme-text-secondary)', marginTop: '0.35rem' }}>
                Countdown duration before unacknowledged emergency alerts auto-escalate to supervisor and page the nearest buddy operator.
              </p>
            </div>

            {/* Anomaly Detection Sensitivity */}
            <div style={{ backgroundColor: 'var(--theme-subtle-bg)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--theme-subtle-border)' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--theme-text-primary)', display: 'block', marginBottom: '0.5rem' }}>
                Telemetry Anomaly Sensitivity Profile:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {(['low', 'standard', 'high', 'strict'] as const).map(level => {
                  const isSelected = sensitivity === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setSensitivity(level)}
                      style={{
                        padding: '0.45rem 0.25rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        borderRadius: '6px',
                        border: isSelected ? '1px solid var(--cat-yellow)' : '1px solid var(--theme-card-border)',
                        backgroundColor: isSelected ? 'var(--cat-yellow-subtle)' : 'var(--theme-card-bg)',
                        color: isSelected ? 'var(--cat-yellow)' : 'var(--theme-text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)', marginTop: '0.4rem' }}>
                {sensitivity === 'strict' && 'Strict: Flags idling with <= 3 load cycles and enforces tight compliance buffers.'}
                {sensitivity === 'standard' && 'Standard: Factory balanced setting (<= 2 load cycles required).'}
                {sensitivity === 'high' && 'High: Heightened sensitivity to intermittent duty interruptions.'}
                {sensitivity === 'low' && 'Low: Permissive tolerance for heavy stop-and-go quarry traffic.'}
              </p>
            </div>
          </div>

          {/* Section 3: Duty Cycle & Cooldown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cat-blue, #60A5FA)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Clock size={14} /> Equipment Duty Cycle &amp; Maintenance Rest
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ backgroundColor: 'var(--theme-subtle-bg)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--theme-subtle-border)' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--theme-text-primary)', display: 'block', marginBottom: '0.4rem' }}>
                  Max Continuous Duty: <strong style={{ color: 'var(--cat-blue, #60A5FA)' }}>{dutyCycle} hrs</strong>
                </label>
                <input
                  type="number"
                  min={2.0}
                  max={8.0}
                  step={0.5}
                  value={dutyCycle}
                  onChange={e => setDutyCycle(Number(e.target.value))}
                  className="cat-input"
                  style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ backgroundColor: 'var(--theme-subtle-bg)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--theme-subtle-border)' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--theme-text-primary)', display: 'block', marginBottom: '0.4rem' }}>
                  Mandatory Cooldown: <strong style={{ color: 'var(--cat-blue, #60A5FA)' }}>{cooldown} min</strong>
                </label>
                <input
                  type="number"
                  min={10}
                  max={45}
                  step={5}
                  value={cooldown}
                  onChange={e => setCooldown(Number(e.target.value))}
                  className="cat-input"
                  style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '1rem',
            borderTop: '1px solid var(--theme-divider)',
            marginTop: '0.5rem',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="cat-btn cat-btn-outline"
              style={{ fontSize: '0.82rem', padding: '0.55rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <RotateCcw size={14} /> Factory Defaults
            </button>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                className="cat-btn cat-btn-outline"
                style={{ fontSize: '0.82rem', padding: '0.55rem 1rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="cat-btn cat-btn-primary"
                style={{ fontSize: '0.85rem', fontWeight: 800, padding: '0.55rem 1.4rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <CheckCircle size={15} /> {isSaving ? 'Saving...' : 'Save & Propagate'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
