import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Truck, ArrowRightLeft, Calendar, Building, Shield, Download, Upload } from 'lucide-react';
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

  // Semantic neutral custody badges distinct from safety alert red/green/amber
  const getCustodyBadge = (status: string) => {
    switch (status) {
      case 'rented_in':
        return (
          <span className="cat-badge badge-custody">
            <Download size={11} /> {t('rented_in')}
          </span>
        );
      case 'rented_out':
        return (
          <span className="cat-badge badge-custody">
            <Upload size={11} /> {t('rented_out')}
          </span>
        );
      default:
        return (
          <span className="cat-badge badge-custody">
            <Shield size={11} /> {t('owned')}
          </span>
        );
    }
  };

  return (
    <div className="cat-card">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.25rem',
        borderBottom: '1px solid var(--theme-divider)',
        paddingBottom: '0.75rem',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--theme-text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ backgroundColor: 'var(--cat-yellow-subtle)', color: 'var(--cat-yellow)', padding: '0.35rem', borderRadius: '6px', display: 'inline-flex' }}>
              <Truck size={18} />
            </div>
            {t('fleetView')}
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--theme-text-secondary)', marginTop: '2px' }}>
            Multi-custody fleet asset management: Owned units, contractor leases &amp; subcontractor loans.
          </p>
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--theme-text-secondary)', fontWeight: 600 }}>
          <strong style={{ color: 'var(--theme-text-primary)' }}>{machines.length}</strong> Total Fleet Units
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {machines.map(m => (
          <div
            key={m.machine_id}
            className="task-item-card"
            style={{
              backgroundColor: 'var(--theme-card-bg)',
              borderRadius: '10px',
              border: '1px solid var(--theme-card-border)',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.85rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontSize: '0.75rem',
                  color: 'var(--cat-yellow)',
                  fontWeight: 800,
                  backgroundColor: '#111111',
                  border: '1px solid #333333',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  {m.machine_id}
                </span>
                {getCustodyBadge(m.custody_status)}
              </div>

              <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--theme-text-primary)', marginTop: '0.65rem' }}>
                {m.model}
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)', marginTop: '2px' }}>
                Type: <strong style={{ color: 'var(--theme-text-primary)' }}>{m.type}</strong> &bull; Age: <strong style={{ color: 'var(--theme-text-primary)' }}>{m.age_years} yrs</strong>
              </div>

              {m.current_operator_name && (
                <div style={{
                  fontSize: '0.78rem',
                  color: 'var(--cat-success)',
                  fontWeight: 600,
                  marginTop: '0.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}>
                  <span>Active Operator:</span>
                  <strong style={{ color: 'var(--theme-text-primary)' }}>{m.current_operator_name}</strong>
                </div>
              )}
            </div>

            {/* Clean Rental Details without nested bordered box */}
            {m.custody_status !== 'owned' && (
              <div style={{
                borderTop: '1px solid var(--theme-divider)',
                paddingTop: '0.65rem',
                fontSize: '0.8rem',
                color: 'var(--theme-text-secondary)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                  <Building size={13} color="var(--cat-yellow)" />
                  <span>Counterparty: {m.rental_counterparty || 'N/A'}</span>
                </div>
                {m.rental_start && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--theme-text-muted)', marginTop: '3px' }}>
                    <Calendar size={13} />
                    <span className="mono-num">
                      {formatUtcToLocal(m.rental_start, supervisorTimezone).split(',')[0]} &ndash; {formatUtcToLocal(m.rental_end, supervisorTimezone).split(',')[0]}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => openRentalModal(m)}
              className="cat-btn cat-btn-secondary cat-btn-sm"
              style={{ width: '100%', marginTop: '0.25rem' }}
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
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
          backdropFilter: 'blur(6px)'
        }}>
          <div style={{
            backgroundColor: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-card-border)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            borderRadius: '16px',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '480px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.1rem',
            color: 'var(--theme-text-primary)'
          }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--theme-text-primary)', borderBottom: '1px solid var(--theme-divider)', paddingBottom: '0.65rem' }}>
              Manage Custody: {selectedMachine.model} ({selectedMachine.machine_id})
            </h3>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Custody Status
              </label>
              <select
                value={custodyStatus}
                onChange={e => setCustodyStatus(e.target.value as any)}
                className="cat-input"
                style={{
                  marginTop: '0.35rem',
                  backgroundColor: 'var(--theme-input-bg)',
                  borderColor: 'var(--theme-input-border)',
                  color: 'var(--theme-text-primary)'
                }}
              >
                <option value="owned">Owned Equipment</option>
                <option value="rented_in">Rented In (From Third-Party / Contractor)</option>
                <option value="rented_out">Rented Out (Leased to Subcontractor)</option>
              </select>
            </div>

            {custodyStatus !== 'owned' && (
              <>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Counterparty Company / Contractor
                  </label>
                  <input
                    type="text"
                    value={counterparty}
                    onChange={e => setCounterparty(e.target.value)}
                    placeholder="e.g. Apex Earthmoving LLC"
                    className="cat-input"
                    style={{
                      marginTop: '0.35rem',
                      backgroundColor: 'var(--theme-input-bg)',
                      borderColor: 'var(--theme-input-border)',
                      color: 'var(--theme-text-primary)'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase' }}>
                      Rental Start Date
                    </label>
                    <input
                      type="date"
                      value={rentalStart}
                      onChange={e => setRentalStart(e.target.value)}
                      className="cat-input"
                      style={{
                        marginTop: '0.35rem',
                        backgroundColor: 'var(--theme-input-bg)',
                        borderColor: 'var(--theme-input-border)',
                        color: 'var(--theme-text-primary)'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--theme-text-secondary)', textTransform: 'uppercase' }}>
                      Rental End Date
                    </label>
                    <input
                      type="date"
                      value={rentalEnd}
                      onChange={e => setRentalEnd(e.target.value)}
                      className="cat-input"
                      style={{
                        marginTop: '0.35rem',
                        backgroundColor: 'var(--theme-input-bg)',
                        borderColor: 'var(--theme-input-border)',
                        color: 'var(--theme-text-primary)'
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button
                onClick={() => setSelectedMachine(null)}
                className="cat-btn cat-btn-outline"
                style={{ minHeight: '44px' }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSaveRental}
                disabled={isSubmitting}
                className="cat-btn cat-btn-primary"
                style={{ minHeight: '44px' }}
              >
                {isSubmitting ? 'Saving...' : 'Save Custody Updates'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
