import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Truck, ArrowRightLeft, Calendar, Building } from 'lucide-react';
import { formatUtcToLocal } from '../../utils/timezone';

export interface MachineItem {
  machine_id: string;
  type: string;
  model: string;
  age_years: number;
  owner_supervisor_id: string;
  custody_status: 'owned' | 'rented_in' | 'rented_out';
  rental_counterparty?: string | null;
  rental_start?: string | null;
  rental_end?: string | null;
  current_operator_name?: string | null;
}

interface FleetCustodyViewProps {
  machines: MachineItem[];
  supervisorTimezone: string;
  onUpdateRental: (machineId: string, rentalData: any) => Promise<void>;
}

export const FleetCustodyView: React.FC<FleetCustodyViewProps> = ({
  machines,
  supervisorTimezone,
  onUpdateRental,
}) => {
  const { t } = useTranslation();
  const [selectedMachine, setSelectedMachine] = useState<MachineItem | null>(null);
  const [custodyStatus, setCustodyStatus] = useState<'owned' | 'rented_in' | 'rented_out'>('owned');
  const [counterparty, setCounterparty] = useState('');
  const [rentalStart, setRentalStart] = useState('');
  const [rentalEnd, setRentalEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openRentalModal = (m: MachineItem) => {
    setSelectedMachine(m);
    setCustodyStatus(m.custody_status);
    setCounterparty(m.rental_counterparty || '');
    setRentalStart(m.rental_start ? m.rental_start.slice(0, 10) : '');
    setRentalEnd(m.rental_end ? m.rental_end.slice(0, 10) : '');
  };

  const handleSaveRental = async () => {
    if (!selectedMachine) return;
    setIsSubmitting(true);
    try {
      await onUpdateRental(selectedMachine.machine_id, {
        custody_status: custodyStatus,
        rental_counterparty: custodyStatus === 'owned' ? null : counterparty,
        rental_start: custodyStatus === 'owned' || !rentalStart ? null : `${rentalStart}T00:00:00Z`,
        rental_end: custodyStatus === 'owned' || !rentalEnd ? null : `${rentalEnd}T23:59:59Z`,
      });
      setSelectedMachine(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCustodyBadge = (status: string) => {
    switch (status) {
      case 'rented_in':
        return <span className="cat-badge badge-blue">📥 {t('rented_in')}</span>;
      case 'rented_out':
        return <span className="cat-badge badge-purple">📤 {t('rented_out')}</span>;
      default:
        return <span className="cat-badge badge-green">🛡 {t('owned')}</span>;
    }
  };

  return (
    <div className="cat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '2px solid #111111', paddingBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#111111', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: '#FFCD11', color: '#111111', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'inline-flex' }}>
              <Truck size={20} />
            </div>
            {t('fleetView')}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '2px' }}>
            Multi-custody asset tracking: Owned equipment, rented-in contractor units & rented-out fleet.
          </p>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#111111', fontWeight: 700 }}>
          <strong>{machines.length}</strong> Total Machines
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {machines.map(m => (
          <div
            key={m.machine_id}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              border: '2px solid #111111',
              boxShadow: '3px 3px 0px #111111',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.75rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.8rem', color: '#111111', fontWeight: 800, backgroundColor: '#FFCD11', border: '1px solid #111111', padding: '2px 8px', borderRadius: '4px' }}>
                  {m.machine_id}
                </span>
                {getCustodyBadge(m.custody_status)}
              </div>

              <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#111111', marginTop: '0.5rem' }}>
                {m.model}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: '2px' }}>
                Category: <strong style={{ color: '#111111' }}>{m.type}</strong> | Machine Age: <strong style={{ color: '#111111' }}>{m.age_years} yrs</strong>
              </div>

              {m.current_operator_name && (
                <div style={{ fontSize: '0.85rem', color: '#065F46', fontWeight: 700, marginTop: '0.4rem', backgroundColor: '#D1FAE5', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                  Active Operator: <strong>{m.current_operator_name}</strong>
                </div>
              )}
            </div>

            {/* Rental Details */}
            {m.custody_status !== 'owned' && (
              <div style={{
                backgroundColor: '#FFFBEB',
                padding: '0.6rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                border: '1.5px solid #111111',
                color: '#111111'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#111111', fontWeight: 700 }}>
                  <Building size={14} color="#D97706" />
                  <span><strong>Counterparty:</strong> {m.rental_counterparty || 'N/A'}</span>
                </div>
                {m.rental_start && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#4B5563', marginTop: '3px' }}>
                    <Calendar size={14} color="#111111" />
                    <span>Period: {formatUtcToLocal(m.rental_start, supervisorTimezone).split(',')[0]} - {formatUtcToLocal(m.rental_end, supervisorTimezone).split(',')[0]}</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => openRentalModal(m)}
              className="cat-btn cat-btn-secondary"
              style={{ minHeight: '42px', fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
            >
              <ArrowRightLeft size={16} />
              Manage Custody / Rental
            </button>
          </div>
        ))}
      </div>

      {/* Rental Management Modal */}
      {selectedMachine && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '3px solid #111111',
            boxShadow: '6px 6px 0px #111111',
            borderRadius: '12px',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '480px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            color: '#111111'
          }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#111111', borderBottom: '2px solid #111111', paddingBottom: '0.5rem' }}>
              Manage Custody: {selectedMachine.model} ({selectedMachine.machine_id})
            </h3>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '0.3rem' }}>
                Custody Status:
              </label>
              <select
                value={custodyStatus}
                onChange={(e) => setCustodyStatus(e.target.value as any)}
                className="cat-input"
              >
                <option value="owned">Owned (In-House Fleet)</option>
                <option value="rented_in">Rented In (From External Supplier)</option>
                <option value="rented_out">Rented Out (To Subcontractor)</option>
              </select>
            </div>

            {custodyStatus !== 'owned' && (
              <>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '0.3rem' }}>
                    Counterparty Company:
                  </label>
                  <input
                    type="text"
                    value={counterparty}
                    onChange={(e) => setCounterparty(e.target.value)}
                    placeholder="e.g. Apex Heavy Fleet Inc."
                    className="cat-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '0.3rem' }}>
                      Start Date:
                    </label>
                    <input
                      type="date"
                      value={rentalStart}
                      onChange={(e) => setRentalStart(e.target.value)}
                      className="cat-input"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111111', display: 'block', marginBottom: '0.3rem' }}>
                      End Date:
                    </label>
                    <input
                      type="date"
                      value={rentalEnd}
                      onChange={(e) => setRentalEnd(e.target.value)}
                      className="cat-input"
                    />
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                disabled={isSubmitting}
                onClick={handleSaveRental}
                className="cat-btn cat-btn-primary"
                style={{ flex: 1 }}
              >
                {isSubmitting ? 'Saving...' : t('saveChanges')}
              </button>
              <button
                onClick={() => setSelectedMachine(null)}
                className="cat-btn cat-btn-outline"
                style={{ flex: 1 }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
