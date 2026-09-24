import React, { useState } from 'react';
import { ShieldAlert, Radio, Navigation, CheckCircle, AlertTriangle, X } from 'lucide-react';

export interface BuddyFailover {
  failover_id: string;
  alert_id: string;
  distressed_operator_id: string;
  distressed_operator_name?: string;
  distressed_machine_id: string;
  distressed_machine_model?: string;
  distressed_zone: string;
  distressed_lat: number;
  distressed_lon: number;
  buddy_operator_id: string;
  buddy_operator_name?: string;
  buddy_machine_id: string;
  buddy_machine_model?: string;
  distance_meters: number;
  status: 'pending' | 'en_route' | 'radio_contacted' | 'resolved';
  dispatched_at: string;
  acknowledged_at?: string;
  notes?: string;
}

interface BuddyAlertModalProps {
  failover: BuddyFailover;
  onRespond: (failoverId: string, status: 'en_route' | 'radio_contacted' | 'resolved', notes?: string) => Promise<void>;
  onClose: () => void;
}

export const BuddyAlertModal: React.FC<BuddyAlertModalProps> = ({
  failover,
  onRespond,
  onClose
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');

  const handleAction = async (status: 'en_route' | 'radio_contacted' | 'resolved') => {
    setSubmitting(true);
    try {
      await onRespond(failover.failover_id, status, notes || undefined);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
      <div className="w-full max-w-xl bg-white border border-red-200 border-l-4 border-l-red-500 rounded-xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-100 px-4 py-3 flex items-center justify-between text-red-900">
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={22} className="text-red-600 stroke-[2]" />
            <div>
              <div className="text-sm font-bold uppercase tracking-wider text-red-700">
                Proximity Buddy Emergency Failover
              </div>
              <div className="text-xs text-gray-600">
                Supervisor Escalation: You are the nearest on-site operator to this emergency.
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-red-100/50 cursor-pointer transition-colors"
            title="Close Alert"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 flex flex-col gap-4 text-gray-900">
          {/* Proximity Distance & Target Badge */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider block">
                Distressed Equipment &amp; Operator
              </span>
              <div className="text-base font-bold text-gray-900 mt-0.5">
                {failover.distressed_operator_name || failover.distressed_operator_id}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {failover.distressed_machine_model || failover.distressed_machine_id} &bull; <strong className="text-gray-700 font-medium">{failover.distressed_zone}</strong>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                Distance To Target
              </span>
              <div className="text-2xl font-extrabold font-mono text-red-600">
                {failover.distance_meters} m
              </div>
              <span className="text-[11px] font-medium text-emerald-600">
                ● Nearest Active Cabin Unit
              </span>
            </div>
          </div>

          {/* Incident Status & Instructions */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex flex-col gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-semibold text-amber-800">
              <AlertTriangle size={15} className="stroke-[2]" />
              <span>Standard Field Safety Protocol:</span>
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-gray-700">
              <li>Ensure your machine is in a stable position with hydraulic lockout engaged.</li>
              <li>Initiate two-way radio check on Site Channel 1 with <strong>{failover.distressed_operator_name}</strong>.</li>
              <li>If no radio reply within 30 seconds, deploy cautiously to the coordinates or dispatch ground support.</li>
            </ol>
          </div>

          {/* Current Status Pill */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Failover Incident ID: <strong className="text-gray-800 font-mono font-medium">{failover.failover_id}</strong></span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${failover.status === 'en_route'
                ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
              STATUS: {failover.status.toUpperCase()}
            </span>
          </div>

          {/* Optional Responder Notes */}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
              Responder Cabin Notes (Sent to Supervisor Hub):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. In radio contact; operator confirmed safe, hydraulic hose ruptured."
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-yellow-400 shadow-xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <button
              onClick={() => handleAction('en_route')}
              disabled={submitting}
              className="py-2.5 px-4 rounded-lg bg-[#FFCD11] hover:bg-[#e6b80f] text-gray-950 font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Navigation size={16} className="stroke-[2]" />
              <span>{submitting ? 'Updating...' : 'EN ROUTE (ASSISTING)'}</span>
            </button>

            <button
              onClick={() => handleAction('radio_contacted')}
              disabled={submitting}
              className="py-2.5 px-4 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Radio size={16} className="stroke-[2]" />
              <span>{submitting ? 'Updating...' : 'RADIO CONTACT MADE'}</span>
            </button>
          </div>

          <div className="flex justify-center pt-1">
            <button
              onClick={() => handleAction('resolved')}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-50 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <CheckCircle size={14} className="text-emerald-600 stroke-[2]" />
              <span>Mark Incident Resolved (All Clear)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
