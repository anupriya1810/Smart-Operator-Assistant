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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: '#FEF3C7', color: '#B45309', padding: '0.3rem', borderRadius: '6px', display: 'inline-flex' }}>
              <Truck size={18} />
            </div>
            {t('fleetView')}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
            Multi-custody asset tracking: Owned equipment, rented-in contractor units &amp; rented-out fleet.
          </p>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
          <strong style={{ color: '#0F172A' }}>{machines.length}</strong> Total Machines
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {machines.map(m => (
          <div
            key={m.machine_id}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.75rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.78rem', color: '#92400E', fontWeight: 600, backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', padding: '2px 8px', borderRadius: '4px' }}>
                  {m.machine_id}
                </span>
                {getCustodyBadge(m.custody_status)}
              </div>

              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0F172A', marginTop: '0.5rem' }}>
                {m.model}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
                Category: <strong style={{ color: '#0F172A' }}>{m.type}</strong> &bull; Age: <strong style={{ color: '#0F172A' }}>{m.age_years} yrs</strong>
              </div>

              {m.current_operator_name && (
                <div style={{ fontSize: '0.78rem', color: '#065F46', fontWeight: 600, marginTop: '0.5rem', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: '4px', display: 'inline-block' }}>
                  Active Operator: <strong>{m.current_operator_name}</strong>
                </div>
              )}
            </div>

            {/* Rental Details */}
            {m.custody_status !== 'owned' && (
              <div style={{
                backgroundColor: '#F8FAFC',
                padding: '0.65rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                border: '1px solid #E2E8F0',
                color: '#334155'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#0F172A', fontWeight: 600 }}>
                  <Building size={13} color="#D97706" />
                  <span>Counterparty: {m.rental_counterparty || 'N/A'}</span>
                </div>
                {m.rental_start && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748B', marginTop: '3px' }}>
                    <Calendar size={13} color="#64748B" />
                    <span>Period: {formatUtcToLocal(m.rental_start, supervisorTimezone).split(',')[0]} &ndash; {formatUtcToLocal(m.rental_end, supervisorTimezone).split(',')[0]}</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => openRentalModal(m)}
              className="cat-btn cat-btn-secondary"
              style={{ minHeight: '38px', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              <ArrowRightLeft size={14} />
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
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
          backdropFilter: 'blur(6px)'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            borderRadius: '16px',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '480px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            color: '#0F172A'
          }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.5rem' }}>
              Manage Custody: {selectedMachine.model} ({selectedMachine.machine_id})
            </h3>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
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
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
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
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
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
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '0.35rem' }}>
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
