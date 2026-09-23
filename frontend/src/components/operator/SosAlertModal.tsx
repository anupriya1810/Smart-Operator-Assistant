import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertOctagon, CheckCircle, BellRing, PhoneCall } from 'lucide-react';

interface ActiveAlert {
  alert_id: string;
  machine_id: string;
  operator_id: string;
  alert_type: string;
  status: 'active' | 'acknowledged' | 'escalated' | 'resolved';
  notes?: string;
}

interface SosAlertModalProps {
  activeAlert: ActiveAlert | null;
  onAcknowledge: (alertId: string) => void;
  onEscalate: (alertId: string) => void;
  onClose: () => void;
}

export const SosAlertModal: React.FC<SosAlertModalProps> = ({
  activeAlert,
  onAcknowledge,
  onEscalate,
  onClose,
}) => {
  const { t } = useTranslation();
  const [secondsRemaining, setSecondsRemaining] = useState(45);
  const [isEscalated, setIsEscalated] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Sound alarm beeps
  useEffect(() => {
    if (!activeAlert || activeAlert.status !== 'active') return;

    setSecondsRemaining(45);
    setIsEscalated(false);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
        const playBeep = () => {
          if (!audioContextRef.current) return;
          const osc = audioContextRef.current.createOscillator();
          const gain = audioContextRef.current.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, audioContextRef.current.currentTime);
          gain.gain.setValueAtTime(0.15, audioContextRef.current.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.3);
          osc.connect(gain);
          gain.connect(audioContextRef.current.destination);
          osc.start();
          osc.stop(audioContextRef.current.currentTime + 0.3);
        };
        playBeep();
      }
    } catch (e) {}

    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsEscalated(true);
          onEscalate(activeAlert.alert_id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [activeAlert?.alert_id]);

  if (!activeAlert) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      backdropFilter: 'blur(8px)'
    }}>
      <div
        className="cat-card cat-emergency-pulse"
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#18181B',
          borderRadius: '16px',
          border: '2px solid #DC2626',
          boxShadow: '0 0 35px rgba(220, 38, 38, 0.45)',
          padding: '2rem',
          textAlign: 'center',
          color: '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem'
        }}
      >
        <div style={{
          backgroundColor: 'rgba(220, 38, 38, 0.2)',
          border: '2px solid #DC2626',
          color: '#EF4444',
          padding: '1rem',
          borderRadius: '50%',
          display: 'inline-flex'
        }}>
          <AlertOctagon size={44} />
        </div>

        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#EF4444', letterSpacing: '0.02em' }}>
            {t('safetyAlert')}
          </h2>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#F8FAFC', marginTop: '0.4rem' }}>
            {activeAlert.alert_type}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#94A3B8', marginTop: '0.4rem' }}>
            Machine: <strong style={{ color: '#FFCD11', backgroundColor: '#111111', padding: '2px 8px', borderRadius: '4px' }}>{activeAlert.machine_id}</strong> &bull; Operator: <strong style={{ color: '#F8FAFC' }}>{activeAlert.operator_id}</strong>
          </div>
        </div>

        {/* Countdown Timer with high contrast HUD styling */}
        {!isEscalated ? (
          <div style={{
            backgroundColor: '#111111',
            border: '1px solid #2E2E33',
            borderRadius: '12px',
            padding: '1.25rem 2rem',
            width: '100%'
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('timeRemaining')}
            </div>
            <div className="mono-num" style={{
              fontSize: '3.2rem',
              fontWeight: 900,
              color: secondsRemaining <= 15 ? '#EF4444' : '#FFCD11',
              margin: '0.2rem 0',
              textShadow: secondsRemaining <= 15 ? '0 0 15px rgba(239, 68, 68, 0.6)' : 'none'
            }}>
              {secondsRemaining}s
            </div>
            <div style={{
              width: '100%',
              backgroundColor: '#26262B',
              height: '8px',
              borderRadius: '9999px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                backgroundColor: secondsRemaining <= 15 ? '#EF4444' : '#FFCD11',
                width: `${(secondsRemaining / 45) * 100}%`,
                transition: 'width 1s linear'
              }} />
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #DC2626',
            borderRadius: '12px',
            padding: '1.25rem',
            width: '100%',
            color: '#FCA5A5'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.05rem', color: '#EF4444' }}>
              <BellRing size={20} />
              <span>{t('escalatedNotice')}</span>
            </div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.4rem', color: '#E2E8F0' }}>
              Pluggable dispatch: In-app supervisor alarm triggered. SMS &amp; Email dispatch stubs queued.
            </p>
          </div>
        )}

        {/* Tactile Big Action Button for In-Cab Operations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
          <button
            onClick={() => onAcknowledge(activeAlert.alert_id)}
            className="cat-btn"
            style={{
              minHeight: '60px',
              fontSize: '1.05rem',
              fontWeight: 800,
              backgroundColor: '#10B981',
              borderColor: '#059669',
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
              color: '#FFFFFF'
            }}
          >
            <CheckCircle size={24} />
            {t('acknowledgeSafe')}
          </button>

          {!isEscalated && (
            <button
              onClick={() => {
                setIsEscalated(true);
                onEscalate(activeAlert.alert_id);
              }}
              className="cat-btn cat-btn-outline"
              style={{
                minHeight: '44px',
                fontSize: '0.85rem',
                color: '#EF4444',
                borderColor: '#7F1D1D',
                backgroundColor: '#1F1F24'
              }}
            >
              <PhoneCall size={16} />
              Manual Immediate Escalation to Supervisor
            </button>
          )}

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '0.25rem'
            }}
          >
            Dismiss Dialog
          </button>
        </div>
      </div>
    </div>
  );
};
