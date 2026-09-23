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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid #111111', paddingBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ backgroundColor: '#FFCD11', color: '#111111', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'inline-flex' }}>
            <Volume2 size={20} />
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#111111' }}>
            {t('voiceAssistant')}
          </h3>
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#065F46', backgroundColor: '#D1FAE5', border: '1px solid #065F46', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669' }}></span>
          CABIN RADIO ACTIVE
        </span>
      </div>

      {/* Main Microphone Button */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1rem 0' }}>
        <button
          onClick={toggleListening}
          className={`cat-btn ${isListening ? 'cat-mic-active' : 'cat-btn-primary'}`}
          style={{
            minHeight: '64px',
            width: '100%',
            maxWidth: '380px',
            fontSize: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            borderRadius: '12px'
          }}
        >
          {isListening ? (
            <>
              <MicOff size={24} />
              <span>{t('voiceListening')}</span>
            </>
          ) : (
            <>
              <Mic size={24} />
              <span>{t('voiceReady')}</span>
            </>
          )}
        </button>

        {!isSupported && (
          <p style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>
            Note: Browser speech recognition requires Chrome/Edge or click the shortcut triggers below.
          </p>
        )}
      </div>

      {/* Transcript & Radio Audio Feedback */}
      {(transcript || lastFeedback) && (
        <div style={{
          backgroundColor: '#FFFBEB',
          border: '2px solid #111111',
          boxShadow: '2px 2px 0px #111111',
          borderRadius: '8px',
          padding: '0.85rem',
          margin: '0.5rem 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          fontSize: '0.9rem'
        }}>
          {transcript && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111111' }}>
              <Mic size={16} color="#D97706" />
              <span><strong>Heard:</strong> "{transcript}"</span>
            </div>
          )}
          {lastFeedback && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#111111' }}>
              <Volume2 size={16} color="#111111" style={{ marginTop: '3px' }} />
              <span><strong>CAT Response:</strong> {lastFeedback}</span>
            </div>
          )}
        </div>
      )}

      {/* Quick 1-Tap Voice Trigger Shortcuts (Hands-free simulator) */}
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', color: '#111111', fontWeight: 800, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Gloved 1-Tap Voice Simulation:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            onClick={() => triggerManualCommand("What's my next task?")}
            className="cat-btn cat-btn-outline"
            style={{ minHeight: '40px', fontSize: '0.8rem', padding: '0.4rem 0.8rem', flex: '1 1 auto' }}
          >
            <FileText size={14} />
            "What's my next task?"
          </button>

          <button
            onClick={() => triggerManualCommand("Log hydraulic leak on left boom")}
            className="cat-btn cat-btn-outline"
            style={{ minHeight: '40px', fontSize: '0.8rem', padding: '0.4rem 0.8rem', flex: '1 1 auto' }}
          >
            <CheckCircle2 size={14} />
            "Log hydraulic leak on left boom"
          </button>

          <button
            onClick={() => triggerManualCommand("Emergency SOS")}
            className="cat-btn cat-btn-danger"
            style={{ minHeight: '40px', fontSize: '0.8rem', padding: '0.4rem 0.8rem', flex: '1 1 auto' }}
          >
            <ShieldAlert size={14} />
            "Emergency SOS"
          </button>
        </div>
      </div>
    </div>
  );
};
