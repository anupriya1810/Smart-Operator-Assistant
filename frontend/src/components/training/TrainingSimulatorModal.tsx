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
        maxWidth: '700px',
        maxHeight: '90vh',
        overflowY: 'auto',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '1.75rem',
        color: '#0F172A',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="cat-badge badge-yellow">{t('scenarioSimulator')}</span>
              {currentScenario?.id === recommendedScenarioId && (
                <span className="cat-badge badge-blue">★ Telemetry Recommended</span>
              )}
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginTop: '0.4rem' }}>
              {currentScenario?.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer', padding: '0.25rem' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Operator Current Stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#F8FAFC',
          padding: '0.75rem 1rem',
          borderRadius: '10px',
          border: '1px solid #E2E8F0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0F172A', fontWeight: 600 }}>
            <Award size={20} color="#D97706" />
            <span>Score: <strong style={{ color: '#D97706' }}>{operatorProgress.points}</strong> pts</span>
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
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderLeft: '4px solid #FFCD11',
          padding: '1rem 1.25rem',
          borderRadius: '10px'
        }}>
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginBottom: '0.5rem',
            fontSize: '0.8rem',
            color: '#64748B',
            flexWrap: 'wrap'
          }}>
            <span>Task: <strong style={{ color: '#334155' }}>{currentScenario?.task_type}</strong></span>
            <span>&bull;</span>
            <span>Weather: <strong style={{ color: '#334155' }}>{currentScenario?.weather}</strong></span>
            <span>&bull;</span>
            <span>Machine Age: <strong style={{ color: '#334155' }}>{currentScenario?.machine_age_yrs} yrs</strong></span>
            <span>&bull;</span>
            <span>Difficulty: <strong style={{ color: '#334155' }}>{currentScenario?.difficulty}</strong></span>
          </div>

          <div style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#0F172A', fontWeight: 500 }}>
            <strong style={{ color: '#0F172A' }}>Active Cabin Condition:</strong> {currentScenario?.active_condition}
          </div>
        </div>

        {/* Options */}
        {!result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Select Operator Protocol:
            </div>

            {currentScenario?.options.map(opt => (
              <div
                key={opt.id}
                onClick={() => setSelectedOptionId(opt.id)}
                style={{
                  backgroundColor: selectedOptionId === opt.id ? '#FFFBEB' : '#FFFFFF',
                  border: selectedOptionId === opt.id ? '1px solid #F59E0B' : '1px solid #E2E8F0',
                  boxShadow: selectedOptionId === opt.id ? '0 1px 3px rgba(245, 158, 11, 0.15)' : '0 1px 2px rgba(0, 0, 0, 0.03)',
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
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: selectedOptionId === opt.id ? '2px solid #D97706' : '2px solid #CBD5E1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                  backgroundColor: selectedOptionId === opt.id ? '#FFCD11' : '#FFFFFF'
                }}>
                  {selectedOptionId === opt.id && (
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#18181B' }} />
                  )}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#0F172A', fontWeight: 500, lineHeight: '1.4' }}>
                  {opt.text}
                </div>
              </div>
            ))}

            <button
              disabled={!selectedOptionId || loading}
              onClick={handleSubmit}
              className="cat-btn cat-btn-primary"
              style={{
                marginTop: '0.5rem',
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
            border: '1px solid',
            borderColor: result.safety_score >= 80 ? '#A7F3D0' : '#FECACA',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.05rem', color: result.safety_score >= 80 ? '#065F46' : '#991B1B' }}>
                {result.safety_score >= 80 ? <CheckCircle size={22} /> : <AlertTriangle size={22} />}
                <span>{result.safety_score >= 80 ? 'Safe & Compliant Protocol' : 'Safety Violation Risk'}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#92400E', fontWeight: 700, backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', padding: '2px 8px', borderRadius: '4px' }}>
                +{result.safety_score + result.efficiency_score} pts
              </div>
            </div>

            {/* Score Meters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '0.85rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: '#065F46', fontWeight: 600 }}>
                  <ShieldCheck size={15} color="#065F46" />
                  <span>Safety Impact</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#065F46' }}>
                  {result.safety_score}%
                </div>
              </div>

              <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', padding: '0.85rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: '#92400E', fontWeight: 600 }}>
                  <Zap size={15} color="#D97706" />
                  <span>Efficiency Impact</span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#92400E' }}>
                  {result.efficiency_score}%
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.9rem', color: '#334155', lineHeight: '1.5', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', padding: '0.85rem', borderRadius: '8px' }}>
              <strong style={{ color: '#0F172A' }}>Briefing:</strong> {result.feedback}
            </div>

            {result.badge_unlocked && (
              <div style={{
                backgroundColor: '#FEF3C7',
                border: '1px solid #FDE68A',
                boxShadow: '0 1px 3px rgba(245, 158, 11, 0.15)',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <Award size={28} color="#D97706" />
                <div>
                  <div style={{ fontWeight: 700, color: '#92400E', fontSize: '0.78rem' }}>NEW BADGE UNLOCKED!</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#78350F' }}>{result.badge_unlocked}</div>
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
