import React from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Volume2, ShieldAlert, FileText, CheckCircle2 } from 'lucide-react';
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

  return (
    <div className="cat-card cat-card-accent">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ backgroundColor: '#FEF3C7', color: '#B45309', padding: '0.3rem', borderRadius: '6px', display: 'inline-flex' }}>
            <Volume2 size={18} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
            {t('voiceAssistant')}
          </h3>
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#065F46', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }}></span>
          CABIN RADIO ACTIVE
        </span>
      </div>

      {/* Main Microphone Button */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0' }}>
        <button
          onClick={toggleListening}
          className={`cat-btn ${isListening ? 'cat-mic-active' : 'cat-btn-primary'}`}
          style={{
            minHeight: '56px',
            width: '100%',
            maxWidth: '380px',
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            borderRadius: '10px'
          }}
        >
          {isListening ? (
            <>
              <MicOff size={20} />
              <span>{t('voiceListening')}</span>
            </>
          ) : (
            <>
              <Mic size={20} />
              <span>{t('voiceReady')}</span>
            </>
          )}
        </button>

        {!isSupported && (
          <p style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 500 }}>
            Note: Speech recognition requires Chrome/Edge, or click the simulation shortcuts below.
          </p>
        )}
      </div>

      {/* Transcript & Radio Audio Feedback */}
      {(transcript || lastFeedback) && (
        <div style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '0.85rem',
          margin: '0.5rem 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          fontSize: '0.875rem'
        }}>
          {transcript && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0F172A' }}>
              <Mic size={15} color="#D97706" />
              <span><strong>Heard:</strong> "{transcript}"</span>
            </div>
          )}
          {lastFeedback && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#334155' }}>
              <Volume2 size={15} color="#475569" style={{ marginTop: '3px' }} />
              <span><strong>CAT Response:</strong> {lastFeedback}</span>
            </div>
          )}
        </div>
      )}

      {/* Quick 1-Tap Voice Trigger Shortcuts (Hands-free simulator) */}
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Gloved 1-Tap Simulation Shortcuts:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            onClick={() => triggerManualCommand("What's my next task?")}
            className="cat-btn cat-btn-outline"
            style={{ minHeight: '36px', fontSize: '0.78rem', padding: '0.35rem 0.75rem', flex: '1 1 auto' }}
          >
            <FileText size={13} />
            "What's my next task?"
          </button>

          <button
            onClick={() => triggerManualCommand("Log hydraulic leak on left boom")}
            className="cat-btn cat-btn-outline"
            style={{ minHeight: '36px', fontSize: '0.78rem', padding: '0.35rem 0.75rem', flex: '1 1 auto' }}
          >
            <CheckCircle2 size={13} />
            "Log hydraulic leak on left boom"
          </button>

          <button
            onClick={() => triggerManualCommand("Emergency SOS")}
            className="cat-btn cat-btn-danger"
            style={{ minHeight: '36px', fontSize: '0.78rem', padding: '0.35rem 0.75rem', flex: '1 1 auto' }}
          >
            <ShieldAlert size={13} />
            "Emergency SOS"
          </button>
        </div>
      </div>
    </div>
  );
};
