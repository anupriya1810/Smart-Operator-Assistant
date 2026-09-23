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
          maxWidth: '540px',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '4px solid #DC2626',
          boxShadow: '8px 8px 0px #111111',
          padding: '2rem',
          textAlign: 'center',
          color: '#111111',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem'
        }}
      >
        <div style={{
          backgroundColor: '#DC2626',
          color: '#FFF',
          padding: '1rem',
          borderRadius: '50%',
          display: 'inline-flex',
          border: '2px solid #111111'
        }}>
          <AlertOctagon size={48} />
        </div>

        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#DC2626', letterSpacing: '0.05em' }}>
            {t('safetyAlert')}
          </h2>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#111111', marginTop: '0.5rem' }}>
            {activeAlert.alert_type}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#4B5563', marginTop: '0.25rem' }}>
            Machine: <strong style={{ color: '#111111', backgroundColor: '#FFCD11', padding: '1px 6px', borderRadius: '4px' }}>{activeAlert.machine_id}</strong> | Operator: <strong>{activeAlert.operator_id}</strong>
          </div>
        </div>

        {/* Countdown Timer */}
        {!isEscalated ? (
          <div style={{
            backgroundColor: '#FFFBEB',
            border: '2px solid #111111',
            boxShadow: '3px 3px 0px #111111',
            borderRadius: '12px',
            padding: '1rem 2rem',
            width: '100%'
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111' }}>
              {t('timeRemaining')}
            </div>
            <div style={{ fontSize: '3.2rem', fontWeight: 900, color: secondsRemaining <= 15 ? '#DC2626' : '#111111' }}>
              {secondsRemaining}s
            </div>
            <div style={{
              width: '100%',
              backgroundColor: '#E5E7EB',
              height: '10px',
              borderRadius: '5px',
              border: '1px solid #111111',
              overflow: 'hidden',
              marginTop: '0.5rem'
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
            backgroundColor: '#FEE2E2',
            border: '2px solid #DC2626',
            boxShadow: '3px 3px 0px #111111',
            borderRadius: '12px',
            padding: '1.25rem',
            width: '100%',
            color: '#991B1B'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 900, fontSize: '1.15rem' }}>
              <BellRing size={24} color="#DC2626" />
              <span>{t('escalatedNotice')}</span>
            </div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.4rem', color: '#111111', fontWeight: 600 }}>
              Pluggable dispatch: In-app supervisor alarm triggered. SMS & Email dispatch stubs queued.
            </p>
          </div>
        )}

        {/* Tactile Big Action Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
          <button
            onClick={() => onAcknowledge(activeAlert.alert_id)}
            className="cat-btn"
            style={{
              minHeight: '64px',
              fontSize: '1.15rem',
              backgroundColor: '#059669',
              borderColor: '#111111',
              boxShadow: '4px 4px 0px #111111',
              color: '#FFF'
            }}
          >
            <CheckCircle size={26} />
            {t('acknowledgeSafe')}
          </button>

          {!isEscalated && (
            <button
              onClick={() => {
                setIsEscalated(true);
                onEscalate(activeAlert.alert_id);
              }}
              className="cat-btn cat-btn-outline"
              style={{ minHeight: '44px', fontSize: '0.85rem', color: '#DC2626', borderColor: '#DC2626' }}
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
              color: '#4B5563',
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
