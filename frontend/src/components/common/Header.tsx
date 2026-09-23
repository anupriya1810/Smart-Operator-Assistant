import React from 'react';
import { useTranslation } from 'react-i18next';
import { HardHat, ShieldAlert, Globe, Clock, UserCheck, Maximize2, Radio } from 'lucide-react';

interface HeaderProps {
  currentRole: 'operator' | 'supervisor';
  onRoleChange: (role: 'operator' | 'supervisor') => void;
  activeOperatorId: string;
  onOperatorChange: (id: string) => void;
  operators: Array<{ operator_id: string; name: string; preferred_language: string; timezone: string; skill_level: string }>;
  activeAlertCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  activeOperatorId,
  onOperatorChange,
  operators,
  activeAlertCount,
}) => {
  const { t, i18n } = useTranslation();
  const currentOp = operators.find(o => o.operator_id === activeOperatorId) || operators[0];

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    i18n.changeLanguage(newLang);
    localStorage.setItem('cat_copilot_lang', newLang);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header style={{
      backgroundColor: '#161616',
      borderBottom: '2px solid #2B2B2B',
      padding: '0.75rem 1.25rem',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Brand & In-Cab Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          backgroundColor: '#FFCD11',
          color: '#111',
          padding: '0.4rem 0.6rem',
          borderRadius: '6px',
          fontWeight: 900,
          fontSize: '1.25rem',
          letterSpacing: '1px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem'
        }}>
          <span>CAT</span>
          <HardHat size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#FFF', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{t('appName')}</span>
            <span style={{ fontSize: '0.75rem', backgroundColor: '#262626', color: '#FFCD11', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid rgba(255,205,17,0.3)' }}>
              v1.0 HUD
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{t('appSubtitle')}</div>
        </div>
      </div>

      {/* Role Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#111', padding: '4px', borderRadius: '8px', border: '1px solid #333' }}>
        <button
          onClick={() => onRoleChange('operator')}
          style={{
            minHeight: '40px',
            padding: '0.4rem 1rem',
            borderRadius: '6px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: currentRole === 'operator' ? '#FFCD11' : 'transparent',
            color: currentRole === 'operator' ? '#111' : '#9CA3AF',
            transition: 'all 0.2s'
          }}
        >
          <Radio size={16} />
          {t('roleOperator')}
        </button>

        <button
          onClick={() => onRoleChange('supervisor')}
          style={{
            minHeight: '40px',
            padding: '0.4rem 1rem',
            borderRadius: '6px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: currentRole === 'supervisor' ? '#FFCD11' : 'transparent',
            color: currentRole === 'supervisor' ? '#111' : '#9CA3AF',
            transition: 'all 0.2s',
            position: 'relative'
          }}
        >
          <ShieldAlert size={16} />
          {t('roleSupervisor')}
          {activeAlertCount > 0 && (
            <span style={{
              backgroundColor: '#EF4444',
              color: '#FFF',
              borderRadius: '9999px',
              padding: '0.1rem 0.4rem',
              fontSize: '0.7rem',
              marginLeft: '0.3rem'
            }}>
              {activeAlertCount}
            </span>
          )}
        </button>
      </div>

      {/* Profile, Language, Timezone, Fullscreen Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {currentRole === 'operator' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#1F1F1F', padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid #333' }}>
            <UserCheck size={16} color="#FFCD11" />
            <select
              value={activeOperatorId}
              onChange={(e) => onOperatorChange(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                color: '#FFF',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {operators.map(op => (
                <option key={op.operator_id} value={op.operator_id} style={{ backgroundColor: '#222', color: '#FFF' }}>
                  {op.name} ({op.skill_level})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Language Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#1F1F1F', padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid #333' }}>
          <Globe size={16} color="#9CA3AF" />
          <select
            value={i18n.language}
            onChange={handleLanguageChange}
            style={{
              backgroundColor: 'transparent',
              color: '#FFF',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="en" style={{ backgroundColor: '#222' }}>English</option>
            <option value="hi" style={{ backgroundColor: '#222' }}>हिन्दी (Hindi)</option>
            <option value="es" style={{ backgroundColor: '#222' }}>Español</option>
          </select>
        </div>

        {/* Timezone Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          fontSize: '0.75rem',
          color: '#9CA3AF',
          backgroundColor: '#1A1A1A',
          padding: '0.35rem 0.6rem',
          borderRadius: '6px',
          border: '1px solid #2B2B2B'
        }}>
          <Clock size={14} color="#FFCD11" />
          <span>{currentOp?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </div>

        {/* Fullscreen Button for In-Cab Tablets */}
        <button
          onClick={toggleFullscreen}
          title="Toggle In-Cab Fullscreen"
          style={{
            backgroundColor: '#1F1F1F',
            border: '1px solid #333',
            color: '#FFCD11',
            borderRadius: '6px',
            padding: '0.4rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </header>
  );
};
