import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Volume2, ShieldAlert, FileText, CheckCircle2, Radio } from 'lucide-react';
import { useVoiceAgent } from '../../hooks/useVoiceAgent';

interface VoiceControlPanelProps {
  operatorId: string;
  machineId: string;
  onRefreshData?: () => void;
  onTriggerSos?: () => void;
}

export const VoiceControlPanel: React.FC<VoiceControlPanelProps> = ({
  operatorId,
  machineId,
  onRefreshData,
  onTriggerSos,
}) => {
  const { t } = useTranslation();

  // Hold-to-trigger SOS state
  const [sosHoldProgress, setSosHoldProgress] = useState(0);
  const [isHoldingSos, setIsHoldingSos] = useState(false);
  const holdIntervalRef = useRef<any>(null);

  const handleCommandResult = (action: string) => {
    if (action === 'sos_triggered' && onTriggerSos) {
      onTriggerSos();
    }
    if (onRefreshData) {
      onRefreshData();
    }
  };

  const {
    isListening,
    transcript,
    lastFeedback,
    isSupported,
    toggleListening,
    triggerManualCommand,
  } = useVoiceAgent({
    operatorId,
    machineId,
    onCommandExecuted: handleCommandResult
  });

  // Hold-to-trigger SOS logic (prevents accidental cab bumps)
  const startHoldSos = () => {
    setIsHoldingSos(true);
    setSosHoldProgress(0);
    const startTime = Date.now();
    const duration = 1500; // 1.5 seconds

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setSosHoldProgress(pct);

      if (elapsed >= duration) {
        clearInterval(holdIntervalRef.current);
        setIsHoldingSos(false);
        setSosHoldProgress(0);
        if (onTriggerSos) onTriggerSos();
      }
    }, 30);
  };

  const cancelHoldSos = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
    }
    setIsHoldingSos(false);
    setSosHoldProgress(0);
  };

  return (
    <div className="cat-card cat-card-accent">
      {/* Header bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        borderBottom: '1px solid var(--theme-divider)',
        paddingBottom: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ backgroundColor: 'var(--cat-yellow-subtle)', color: 'var(--cat-yellow)', padding: '0.35rem', borderRadius: '6px', display: 'inline-flex' }}>
            <Volume2 size={18} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--theme-text-primary)' }}>
            {t('voiceAssistant')}
          </h3>
        </div>
        <span className="cat-badge badge-success">
          <Radio size={12} /> CABIN RADIO ACTIVE
        </span>
      </div>

      {/* Main Microphone Button with Animated Listening State */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
        <button
          onClick={toggleListening}
          className={`cat-btn ${isListening ? 'cat-mic-listening' : 'cat-btn-primary'}`}
          style={{
            minHeight: '60px',
            width: '100%',
            fontSize: '1rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            borderRadius: '10px'
          }}
        >
          {isListening ? (
            <>
              <MicOff size={22} />
              <span>RECORDING AUDIO...</span>
              <div className="voice-waveform">
                <span className="voice-bar"></span>
                <span className="voice-bar"></span>
                <span className="voice-bar"></span>
                <span className="voice-bar"></span>
                <span className="voice-bar"></span>
              </div>
            </>
          ) : (
            <>
              <Mic size={22} />
              <span>TAP OR PRESS FOR HANDS-FREE</span>
            </>
          )}
        </button>

        <p style={{ fontSize: '0.75rem', color: isListening ? 'var(--cat-danger)' : 'var(--theme-text-muted)', fontWeight: 600 }}>
          {isListening
            ? '● Listening in cabin... Speak naturally or say "What is my next task?"'
            : !isSupported
              ? 'Speech API requires Chrome/Edge, or tap the gloved shortcuts below.'
              : 'Web Speech STT enabled &bull; No hands required while operating joysticks'}
        </p>
      </div>

      {/* Transcript & Radio Audio Feedback */}
      {(transcript || lastFeedback) && (
        <div style={{
          backgroundColor: 'var(--theme-card-bg-elevated)',
          border: '1px solid var(--theme-card-border)',
          borderRadius: '8px',
          padding: '0.85rem',
          margin: '0.75rem 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          fontSize: '0.875rem'
        }}>
          {transcript && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--theme-text-primary)' }}>
              <Mic size={15} color="var(--cat-yellow)" />
              <span><strong>Heard:</strong> "{transcript}"</span>
            </div>
          )}
          {lastFeedback && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--theme-text-secondary)' }}>
              <Volume2 size={15} color="var(--theme-text-muted)" style={{ marginTop: '3px' }} />
              <span><strong>CAT Response:</strong> {lastFeedback}</span>
            </div>
          )}
        </div>
      )}

      {/* Quick 1-Tap Voice Trigger Shortcuts (Hands-free simulator) */}
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Gloved 1-Tap Query Shortcuts:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            onClick={() => triggerManualCommand("What's my next task?")}
            className="cat-btn cat-btn-outline cat-btn-sm"
            style={{ flex: '1 1 calc(50% - 0.25rem)' }}
          >
            <FileText size={14} />
            "What's my next task?"
          </button>

          <button
            onClick={() => triggerManualCommand("Log hydraulic leak on left boom")}
            className="cat-btn cat-btn-outline cat-btn-sm"
            style={{ flex: '1 1 calc(50% - 0.25rem)' }}
          >
            <CheckCircle2 size={14} />
            "Log hydraulic leak"
          </button>
        </div>
      </div>

      {/* Visually Separated Emergency SOS Section with Hold-to-Trigger Protection */}
      <div style={{
        marginTop: '1.25rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--theme-divider)'
      }}>
        <div style={{
          backgroundColor: 'var(--theme-subtle-bg)',
          border: '1px solid var(--theme-subtle-border)',
          borderRadius: '8px',
          padding: '0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--cat-danger)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ShieldAlert size={14} /> Critical Safety Action
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--theme-text-muted)' }}>
              Hold 1.5s to prevent accidental bump
            </span>
          </div>

          <div style={{ position: 'relative', width: '100%' }}>
            <button
              onMouseDown={startHoldSos}
              onMouseUp={cancelHoldSos}
              onMouseLeave={cancelHoldSos}
              onTouchStart={startHoldSos}
              onTouchEnd={cancelHoldSos}
              className="cat-btn cat-btn-danger"
              style={{
                width: '100%',
                minHeight: '52px',
                fontSize: '0.95rem',
                fontWeight: 800,
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Animated Progress Bar Fill */}
              {isHoldingSos && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${sosHoldProgress}%`,
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    transition: 'width 0.03s linear'
                  }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={20} />
                {isHoldingSos ? `HOLDING FOR SOS (${Math.round(sosHoldProgress)}%)...` : 'PRESS & HOLD FOR EMERGENCY SOS'}
              </span>
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: '2px' }}>
            <button
              onClick={() => onTriggerSos && onTriggerSos()}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--theme-text-muted)',
                fontSize: '0.72rem',
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              Instant emergency click (bypasses 1.5s hold)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
