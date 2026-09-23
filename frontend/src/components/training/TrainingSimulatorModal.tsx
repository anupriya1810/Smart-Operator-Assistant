import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, CheckCircle, AlertTriangle, ShieldCheck, Zap, X } from 'lucide-react';

interface ScenarioOption {
  id: string;
  text: string;
  safety_score: number;
  efficiency_score: number;
  feedback: string;
  badge_unlocked?: string | null;
}

interface Scenario {
  id: string;
  title: string;
  task_type: string;
  weather: string;
  machine_age_yrs: number;
  active_condition: string;
  difficulty: string;
  options: ScenarioOption[];
}

interface TrainingSimulatorModalProps {
  scenarios: Scenario[];
  recommendedScenarioId?: string;
  operatorProgress: {
    points: number;
    badges: string[];
    completed_scenarios: string[];
  };
  onClose: () => void;
  onSubmitDecision: (scenarioId: string, optionId: string) => Promise<any>;
}

export const TrainingSimulatorModal: React.FC<TrainingSimulatorModalProps> = ({
  scenarios,
  recommendedScenarioId,
  operatorProgress,
  onClose,
  onSubmitDecision,
}) => {
  const { t } = useTranslation();
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState(
    Math.max(0, scenarios.findIndex(s => s.id === recommendedScenarioId))
  );
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const currentScenario = scenarios[selectedScenarioIndex] || scenarios[0];

  const handleSubmit = async () => {
    if (!selectedOptionId || !currentScenario) return;
    setLoading(true);
    try {
      const res = await onSubmitDecision(currentScenario.id, selectedOptionId);
      setResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNextScenario = () => {
    setResult(null);
    setSelectedOptionId(null);
    setSelectedScenarioIndex((prev) => (prev + 1) % scenarios.length);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
      padding: '1rem',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        overflowY: 'auto',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '3px solid #111111',
        boxShadow: '6px 6px 0px #111111',
        padding: '1.75rem',
        color: '#111111',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111111', paddingBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="cat-badge badge-yellow">{t('scenarioSimulator')}</span>
              {currentScenario?.id === recommendedScenarioId && (
                <span className="cat-badge badge-blue">★ Telemetry Recommended</span>
              )}
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#111111', marginTop: '0.4rem' }}>
              {currentScenario?.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#111111', cursor: 'pointer', padding: '0.25rem' }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Operator Current Stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#FFFBEB',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          border: '2px solid #111111'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111111', fontWeight: 800 }}>
            <Award size={22} color="#D97706" />
            <span>Score: {operatorProgress.points} pts</span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {operatorProgress.badges.map((b, idx) => (
              <span key={idx} className="cat-badge badge-green" style={{ fontSize: '0.75rem' }}>
                🏅 {b}
              </span>
            ))}
          </div>
        </div>

        {/* Scenario Situation Card */}
        <div style={{
          backgroundColor: '#F9FAFB',
          border: '2px solid #111111',
          borderLeft: '8px solid #FFCD11',
          padding: '1rem',
          borderRadius: '8px'
        }}>
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '0.75rem',
            fontSize: '0.85rem',
            color: '#4B5563',
            flexWrap: 'wrap'
          }}>
            <span><strong>Task:</strong> {currentScenario?.task_type}</span>
            <span>•</span>
            <span><strong>Weather:</strong> {currentScenario?.weather}</span>
            <span>•</span>
            <span><strong>Machine Age:</strong> {currentScenario?.machine_age_yrs} yrs</span>
            <span>•</span>
            <span><strong>Difficulty:</strong> {currentScenario?.difficulty}</span>
          </div>

          <div style={{ fontSize: '1.05rem', lineHeight: '1.5', color: '#111111', fontWeight: 600 }}>
            <strong>Active Cabin Condition:</strong> {currentScenario?.active_condition}
          </div>
        </div>

        {/* Options */}
        {!result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#111111', fontWeight: 800, textTransform: 'uppercase' }}>
              Select Operator Protocol:
            </div>

            {currentScenario?.options.map(opt => (
              <div
                key={opt.id}
                onClick={() => setSelectedOptionId(opt.id)}
                style={{
                  backgroundColor: selectedOptionId === opt.id ? '#FFFBEB' : '#FFFFFF',
                  border: selectedOptionId === opt.id ? '2.5px solid #111111' : '1.5px solid #111111',
                  boxShadow: selectedOptionId === opt.id ? '3px 3px 0px #FFCD11' : '1px 1px 0px #111111',
                  borderRadius: '10px',
                  padding: '1rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem'
                }}
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  border: '2px solid #111111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                  backgroundColor: selectedOptionId === opt.id ? '#FFCD11' : '#FFFFFF'
                }}>
                  {selectedOptionId === opt.id && (
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#111111' }} />
                  )}
                </div>
                <div style={{ fontSize: '0.95rem', color: '#111111', fontWeight: 600 }}>
                  {opt.text}
                </div>
              </div>
            ))}

            <button
              disabled={!selectedOptionId || loading}
              onClick={handleSubmit}
              className="cat-btn cat-btn-primary"
              style={{
                marginTop: '0.75rem',
                opacity: !selectedOptionId ? 0.5 : 1,
                cursor: !selectedOptionId ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Evaluating...' : t('submitChoice')}
            </button>
          </div>
        ) : (
          /* Consequence Result Card */
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '3px solid',
            borderColor: result.safety_score >= 80 ? '#059669' : '#DC2626',
            boxShadow: '4px 4px 0px #111111',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 900, fontSize: '1.2rem', color: result.safety_score >= 80 ? '#065F46' : '#991B1B' }}>
                {result.safety_score >= 80 ? <CheckCircle size={26} /> : <AlertTriangle size={26} />}
                <span>{result.safety_score >= 80 ? 'Safe & Compliant Protocol' : 'Safety Violation Risk'}</span>
              </div>
              <div style={{ fontSize: '1rem', color: '#111111', fontWeight: 900, backgroundColor: '#FFCD11', border: '1px solid #111111', padding: '2px 8px', borderRadius: '4px' }}>
                +{result.safety_score + result.efficiency_score} pts
              </div>
            </div>

            {/* Score Meters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ backgroundColor: '#D1FAE5', border: '1.5px solid #065F46', padding: '0.85rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#065F46', fontWeight: 700 }}>
                  <ShieldCheck size={16} color="#065F46" />
                  <span>Safety Impact</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#065F46' }}>
                  {result.safety_score}%
                </div>
              </div>

              <div style={{ backgroundColor: '#FFFBEB', border: '1.5px solid #D97706', padding: '0.85rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#92400E', fontWeight: 700 }}>
                  <Zap size={16} color="#D97706" />
                  <span>Efficiency Impact</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#92400E' }}>
                  {result.efficiency_score}%
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.95rem', color: '#111111', lineHeight: '1.5', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', padding: '0.85rem', borderRadius: '8px' }}>
              <strong>Briefing:</strong> {result.feedback}
            </div>

            {result.badge_unlocked && (
              <div style={{
                backgroundColor: '#FFCD11',
                border: '2px solid #111111',
                boxShadow: '2px 2px 0px #111111',
                padding: '0.85rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <Award size={32} color="#111111" />
                <div>
                  <div style={{ fontWeight: 900, color: '#111111', fontSize: '0.85rem' }}>NEW BADGE UNLOCKED!</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#111111' }}>{result.badge_unlocked}</div>
                </div>
              </div>
            )}

            <button
              onClick={handleNextScenario}
              className="cat-btn cat-btn-primary"
              style={{ marginTop: '0.5rem' }}
            >
              Continue to Next Scenario
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
