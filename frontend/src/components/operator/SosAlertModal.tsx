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
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      backdropFilter: 'blur(5px)'
    }}>
      <div
        className="cat-emergency-pulse"
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #FECACA',
          boxShadow: '0 25px 50px -12px rgba(220, 38, 38, 0.25)',
          padding: '2rem',
          textAlign: 'center',
          color: '#0F172A',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem'
        }}
      >
        <div style={{
          backgroundColor: '#FEE2E2',
          color: '#DC2626',
          padding: '1rem',
          borderRadius: '50%',
          display: 'inline-flex'
        }}>
          <AlertOctagon size={42} />
        </div>

        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#DC2626' }}>
            {t('safetyAlert')}
          </h2>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', marginTop: '0.4rem' }}>
            {activeAlert.alert_type}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '0.35rem' }}>
            Machine: <strong style={{ color: '#0F172A', backgroundColor: '#FEF3C7', padding: '1px 6px', borderRadius: '4px' }}>{activeAlert.machine_id}</strong> &bull; Operator: <strong>{activeAlert.operator_id}</strong>
          </div>
        </div>

        {/* Countdown Timer */}
        {!isEscalated ? (
          <div style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '1rem 2rem',
            width: '100%'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('timeRemaining')}
            </div>
            <div style={{ fontSize: '2.8rem', fontWeight: 800, color: secondsRemaining <= 15 ? '#DC2626' : '#0F172A', margin: '0.2rem 0' }}>
              {secondsRemaining}s
            </div>
            <div style={{
              width: '100%',
              backgroundColor: '#E2E8F0',
              height: '8px',
              borderRadius: '9999px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                backgroundColor: secondsRemaining <= 15 ? '#DC2626' : '#FFCD11',
                width: `${(secondsRemaining / 45) * 100}%`,
                transition: 'width 1s linear'
              }} />
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '12px',
            padding: '1.25rem',
            width: '100%',
            color: '#991B1B'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.05rem' }}>
              <BellRing size={20} color="#DC2626" />
              <span>{t('escalatedNotice')}</span>
            </div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.35rem', color: '#475569' }}>
              Pluggable dispatch: In-app supervisor alarm triggered. SMS &amp; Email dispatch stubs queued.
            </p>
          </div>
        )}

        {/* Tactile Big Action Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
          <button
            onClick={() => onAcknowledge(activeAlert.alert_id)}
            className="cat-btn"
            style={{
              minHeight: '56px',
              fontSize: '1.05rem',
              backgroundColor: '#059669',
              borderColor: '#047857',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
              color: '#FFF'
            }}
          >
            <CheckCircle size={22} />
            {t('acknowledgeSafe')}
          </button>

          {!isEscalated && (
            <button
              onClick={() => {
                setIsEscalated(true);
                onEscalate(activeAlert.alert_id);
              }}
              className="cat-btn cat-btn-outline"
              style={{ minHeight: '40px', fontSize: '0.82rem', color: '#DC2626', borderColor: '#FECACA' }}
            >
              <PhoneCall size={15} />
              Manual Immediate Escalation to Supervisor
            </button>
          )}

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              fontSize: '0.85rem',
              fontWeight: 500,
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
