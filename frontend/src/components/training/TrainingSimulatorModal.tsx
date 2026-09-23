import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, CheckCircle, AlertTriangle, ShieldCheck, Zap, X, Shield, Laptop, BookOpen } from 'lucide-react';

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
  category?: 'portal' | 'safety';
  title: string;
  task_type: string;
  weather: string;
  machine_age_yrs: number;
  active_condition: string;
  difficulty: string;
  portal_feature?: string;
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
  const [filterCategory, setFilterCategory] = useState<'all' | 'portal' | 'safety'>('all');
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState(
    Math.max(0, scenarios.findIndex(s => s.id === recommendedScenarioId))
  );
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredScenarios = filterCategory === 'all'
    ? scenarios
    : scenarios.filter(s => s.category === filterCategory);

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
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
      padding: '1rem',
      backdropFilter: 'blur(6px)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '740px',
        maxHeight: '92vh',
        overflowY: 'auto',
        backgroundColor: 'var(--theme-card-bg)',
        borderRadius: '16px',
        border: '1px solid var(--theme-card-border)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
        padding: '1.75rem',
        color: 'var(--theme-text-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--theme-divider)', paddingBottom: '0.85rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="cat-badge badge-cat-brand">
                <BookOpen size={12} />
                OPERATOR SIMULATOR &amp; TRAINING
              </span>
              {currentScenario?.category === 'portal' ? (
                <span className="cat-badge badge-custody">
                  <Laptop size={12} /> Portal Skills Training
                </span>
              ) : (
                <span className="cat-badge badge-warning">
                  <Shield size={12} /> Jobsite Safety Training
                </span>
              )}
              {currentScenario?.id === recommendedScenarioId && (
                <span className="cat-badge badge-success">★ Telemetry Recommended</span>
              )}
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--theme-text-primary)', marginTop: '0.4rem' }}>
              {currentScenario?.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--theme-text-muted)', cursor: 'pointer', padding: '0.25rem' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Curriculum Pillar Filter Tabs */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: 'var(--theme-subtle-bg)',
          padding: '4px',
          borderRadius: '8px',
          border: '1px solid var(--theme-subtle-border)'
        }}>
          <button
            onClick={() => setFilterCategory('all')}
            style={{
              flex: 1,
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: filterCategory === 'all' ? 'var(--theme-card-bg-elevated)' : 'transparent',
              color: filterCategory === 'all' ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)',
              boxShadow: filterCategory === 'all' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
            }}
          >
            All Modules ({scenarios.length})
          </button>
          <button
            onClick={() => setFilterCategory('portal')}
            style={{
              flex: 1,
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: filterCategory === 'portal' ? 'var(--theme-card-bg-elevated)' : 'transparent',
              color: filterCategory === 'portal' ? 'var(--cat-yellow)' : 'var(--theme-text-secondary)',
              boxShadow: filterCategory === 'portal' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem'
            }}
          >
            <Laptop size={13} />
            Portal Usage ({scenarios.filter(s => s.category === 'portal').length})
          </button>
          <button
            onClick={() => setFilterCategory('safety')}
            style={{
              flex: 1,
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: filterCategory === 'safety' ? 'var(--theme-card-bg-elevated)' : 'transparent',
              color: filterCategory === 'safety' ? 'var(--cat-warning)' : 'var(--theme-text-secondary)',
              boxShadow: filterCategory === 'safety' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem'
            }}
          >
            <Shield size={13} />
            Jobsite Safety ({scenarios.filter(s => s.category === 'safety').length})
          </button>
        </div>

        {/* Scenario Carousel / Quick Selector */}
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '4px' }}>
          {filteredScenarios.map((s) => {
            const originalIndex = scenarios.findIndex(orig => orig.id === s.id);
            const isSelected = originalIndex === selectedScenarioIndex;
            const isCompleted = operatorProgress.completed_scenarios.includes(s.id);

            return (
              <button
                key={s.id}
                onClick={() => {
                  setResult(null);
                  setSelectedOptionId(null);
                  setSelectedScenarioIndex(originalIndex);
                }}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  border: isSelected ? '1.5px solid var(--cat-yellow)' : '1px solid var(--theme-card-border)',
                  backgroundColor: isSelected ? 'var(--cat-yellow-subtle)' : 'var(--theme-card-bg-elevated)',
                  color: isSelected ? 'var(--cat-yellow)' : 'var(--theme-text-secondary)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: isSelected ? '0 1px 3px var(--cat-yellow-glow)' : 'none'
                }}
              >
                {isCompleted && <span style={{ color: 'var(--cat-success)' }}>✓</span>}
                <span>{s.category === 'portal' ? '💻' : '🛡️'} {s.title.slice(0, 26)}...</span>
              </button>
            );
          })}
        </div>

        {/* Operator Current Stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--theme-subtle-bg)',
          padding: '0.75rem 1rem',
          borderRadius: '10px',
          border: '1px solid var(--theme-subtle-border)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--theme-text-primary)', fontWeight: 700 }}>
            <Award size={18} color="var(--cat-yellow)" />
            <span>Operator Training Score: <strong style={{ color: 'var(--cat-yellow)' }}>{operatorProgress.points}</strong> pts</span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {operatorProgress.badges.map((b, idx) => (
              <span key={idx} className="cat-badge badge-success" style={{ fontSize: '0.72rem' }}>
                🏅 {b}
              </span>
            ))}
          </div>
        </div>

        {/* Scenario Situation Card */}
        <div style={{
          backgroundColor: 'var(--theme-card-bg-elevated)',
          border: '1px solid var(--theme-card-border)',
          borderLeft: '4px solid var(--cat-yellow)',
          padding: '1.1rem 1.25rem',
          borderRadius: '10px'
        }}>
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginBottom: '0.5rem',
            fontSize: '0.8rem',
            color: 'var(--theme-text-muted)',
            flexWrap: 'wrap'
          }}>
            <span>Category: <strong style={{ color: currentScenario?.category === 'portal' ? 'var(--cat-yellow)' : 'var(--cat-warning)' }}>{currentScenario?.category === 'portal' ? 'Portal Operations' : 'Jobsite Safety'}</strong></span>
            <span>&bull;</span>
            <span>Machine: <strong style={{ color: 'var(--theme-text-primary)' }}>Cat 320 ({currentScenario?.machine_age_yrs} yrs)</strong></span>
            <span>&bull;</span>
            <span>Weather: <strong style={{ color: 'var(--theme-text-primary)' }}>{currentScenario?.weather}</strong></span>
            <span>&bull;</span>
            <span>Difficulty: <strong style={{ color: 'var(--theme-text-primary)' }}>{currentScenario?.difficulty}</strong></span>
          </div>

          {currentScenario?.portal_feature && (
            <div style={{
              fontSize: '0.8rem',
              color: 'var(--cat-yellow)',
              backgroundColor: 'var(--cat-yellow-subtle)',
              border: '1px solid rgba(255, 205, 17, 0.3)',
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              marginBottom: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <span>Target Portal Feature: <strong>{currentScenario.portal_feature}</strong></span>
            </div>
          )}

          <div style={{ fontSize: '0.95rem', lineHeight: '1.5', color: 'var(--theme-text-primary)', fontWeight: 500 }}>
            <strong style={{ color: 'var(--cat-yellow)' }}>In-Cab Situation:</strong> {currentScenario?.active_condition}
          </div>
        </div>

        {/* Options */}
        {!result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Choose Operator Action / Protocol:
            </div>

            {currentScenario?.options.map(opt => (
              <div
                key={opt.id}
                onClick={() => setSelectedOptionId(opt.id)}
                style={{
                  backgroundColor: selectedOptionId === opt.id ? 'var(--cat-yellow-subtle)' : 'var(--theme-card-bg-elevated)',
                  border: selectedOptionId === opt.id ? '1.5px solid var(--cat-yellow)' : '1px solid var(--theme-card-border)',
                  boxShadow: selectedOptionId === opt.id ? '0 1px 8px var(--cat-yellow-glow)' : 'none',
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
                  border: selectedOptionId === opt.id ? '2px solid var(--cat-yellow)' : '2px solid var(--theme-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                  backgroundColor: selectedOptionId === opt.id ? 'var(--cat-yellow)' : 'transparent'
                }}>
                  {selectedOptionId === opt.id && (
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#111111' }} />
                  )}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--theme-text-primary)', fontWeight: 500, lineHeight: '1.4' }}>
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
                minHeight: '48px',
                opacity: !selectedOptionId ? 0.5 : 1,
                cursor: !selectedOptionId ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Evaluating Protocol...' : t('submitChoice')}
            </button>
          </div>
        ) : (
          /* Consequence Result Card */
          <div style={{
            backgroundColor: 'var(--theme-card-bg-elevated)',
            border: '1px solid',
            borderColor: result.safety_score >= 80 ? 'var(--cat-success)' : 'var(--cat-danger)',
            borderRadius: '12px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.1rem', color: result.safety_score >= 80 ? 'var(--cat-success)' : 'var(--cat-danger)' }}>
                {result.safety_score >= 80 ? <CheckCircle size={22} /> : <AlertTriangle size={22} />}
                <span>{result.safety_score >= 80 ? 'Correct Protocol & Portal Mastery' : 'Safety / Protocol Violation'}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--cat-yellow)', fontWeight: 800, backgroundColor: '#111111', border: '1px solid #333333', padding: '2px 8px', borderRadius: '4px' }}>
                +{result.safety_score + result.efficiency_score} pts
              </div>
            </div>

            {/* Score Meters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ backgroundColor: 'var(--theme-subtle-bg)', border: '1px solid var(--theme-subtle-border)', padding: '0.85rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--cat-success)', fontWeight: 700 }}>
                  <ShieldCheck size={15} />
                  <span>Safety Compliance</span>
                </div>
                <div className="mono-num" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--cat-success)', marginTop: '2px' }}>
                  {result.safety_score}%
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--theme-subtle-bg)', border: '1px solid var(--theme-subtle-border)', padding: '0.85rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--cat-yellow)', fontWeight: 700 }}>
                  <Zap size={15} />
                  <span>Portal &amp; Operational Efficiency</span>
                </div>
                <div className="mono-num" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--cat-yellow)', marginTop: '2px' }}>
                  {result.efficiency_score}%
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.9rem', color: 'var(--theme-text-secondary)', lineHeight: '1.5', backgroundColor: 'var(--theme-subtle-bg)', border: '1px solid var(--theme-subtle-border)', padding: '0.85rem', borderRadius: '8px' }}>
              <strong style={{ color: 'var(--theme-text-primary)' }}>Instructor Briefing:</strong> {result.feedback}
            </div>

            {result.badge_unlocked && (
              <div style={{
                backgroundColor: 'var(--cat-yellow-subtle)',
                border: '1px solid var(--cat-yellow)',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <Award size={28} color="var(--cat-yellow)" />
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--cat-yellow)', fontSize: '0.75rem', textTransform: 'uppercase' }}>NEW BADGE UNLOCKED!</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--theme-text-primary)' }}>{result.badge_unlocked}</div>
                </div>
              </div>
            )}

            <button
              onClick={handleNextScenario}
              className="cat-btn cat-btn-primary"
              style={{ marginTop: '0.5rem', minHeight: '48px' }}
            >
              Continue to Next Module
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
