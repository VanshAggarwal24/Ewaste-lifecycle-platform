import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getItem } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import StatusTimeline from '../../components/StatusTimeline';
import { format } from '../../utils/format';
import { Package, ArrowLeft, Scale, Calendar, Building2, CheckCircle2, Clock, ShieldCheck, Copy, Check } from 'lucide-react';

export default function TrackItem() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    getItem(id)
      .then(r => setItem(r.data))
      .catch(() => setError('Item not found or access denied.'))
      .finally(() => setLoading(false));
  }, [id]);

  const copyId = () => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStepStatus = (stepIndex: number, currentStatus: string) => {
    const statusOrder: Record<string, number> = {
      SUBMITTED: 1,
      PICKUP_REQUESTED: 1,
      PICKUP_ASSIGNED: 2,
      COLLECTED: 2,
      RECEIVED_AT_CENTER: 3,
      INSPECTED: 4,
      PROCESSING: 4,
      RECYCLED: 5,
      REFURBISHED: 5,
      DISPOSED: 5,
    };
    const currentStep = statusOrder[currentStatus] || 1;
    if (currentStep > stepIndex) return 'completed';
    if (currentStep === stepIndex) return 'current';
    return 'upcoming';
  };

  if (loading) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-64 fade-in text-slate-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-xs">Querying asset chain of custody…</span>
      </div>
    </DashboardLayout>
  );

  if (error || !item) return (
    <DashboardLayout>
      <div className="fade-in text-center py-20 eco-card max-w-md mx-auto p-8 my-8">
        <p className="text-sm font-semibold mb-3 text-red-400">{error || 'Asset record not found.'}</p>
        <p className="text-xs text-slate-400 mb-6">Verify the item identifier or check permissions with the system administrator.</p>
        <Link to="/my-items"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-800/40 hover:bg-emerald-900/50 transition-colors">
          <ArrowLeft size={14} /> Back to My Items
        </Link>
      </div>
    </DashboardLayout>
  );

  const steps = [
    { num: 1, label: 'Submitted' },
    { num: 2, label: 'Collected' },
    { num: 3, label: 'Center Intake' },
    { num: 4, label: 'Inspected' },
    { num: 5, label: 'Recycled' },
  ];

  return (
    <DashboardLayout>
      <div className="fade-in max-w-3xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/my-items"
              className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-100">Asset Audit Trail</h1>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                  Live Ledger
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono text-slate-400">ID: {item.id}</span>
                <button
                  onClick={copyId}
                  className="p-1 text-slate-500 hover:text-emerald-400 transition-colors cursor-pointer"
                  title="Copy asset UUID"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>

          <StatusBadge status={item.status} />
        </div>

        {/* Milestone Stepper */}
        <div className="eco-card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Lifecycle Progress
          </h2>
          <div className="grid grid-cols-5 gap-2 relative">
            {steps.map((s, idx) => {
              const state = getStepStatus(s.num, item.status);
              return (
                <div key={s.num} className="flex flex-col items-center text-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all mb-2 ${
                    state === 'completed'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : state === 'current'
                      ? 'bg-emerald-950/80 text-emerald-300 border-2 border-emerald-400 shadow-md ring-2 ring-emerald-500/20'
                      : 'bg-slate-900 border border-slate-800 text-slate-600'
                  }`}>
                    {state === 'completed' ? <CheckCircle2 size={16} /> : s.num}
                  </div>
                  <span className={`text-[11px] font-medium leading-tight ${
                    state === 'current' ? 'text-emerald-300 font-bold' : state === 'completed' ? 'text-slate-200' : 'text-slate-500'
                  }`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Details Card */}
        <div className="eco-card p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                <Package size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100">{item.category?.name ?? 'Hardware Asset'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Declared Condition: <span className="text-slate-200 font-medium capitalize">{item.condition?.toLowerCase().replace(/_/g, ' ') ?? '—'}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/60">
            <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Scale size={14} />
                <span>Estimated Weight</span>
              </div>
              <p className="text-sm font-bold font-mono text-slate-200">{format.weight(item.estimated_weight_kg)}</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Scale size={14} className="text-emerald-400" />
                <span>Actual Verified Weight</span>
              </div>
              <p className="text-sm font-bold font-mono text-emerald-400">
                {format.weight(item.actual_weight_kg) || 'Pending Weigh-in'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Calendar size={14} />
                <span>Submitted Date</span>
              </div>
              <p className="text-sm font-medium text-slate-200">{format.date(item.submitted_at)}</p>
            </div>
          </div>
        </div>

        {/* Inspection Report Card */}
        {item.inspection && (
          <div className="eco-card p-5 sm:p-6 space-y-4 border-purple-900/30">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-purple-400" />
              <h3 className="font-bold text-sm text-slate-100">Technical Diagnostic Inspection</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                Center Certified
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                <span className="text-slate-400 block mb-0.5">Functional Status</span>
                <span className={`font-semibold ${item.inspection.functional_status ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {item.inspection.functional_status ? 'Operational' : 'Non-Operational'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                <span className="text-slate-400 block mb-0.5">Classification</span>
                <span className="font-semibold text-slate-200">{item.inspection.classification ?? '—'}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                <span className="text-slate-400 block mb-0.5">Physical Grade</span>
                <span className="font-semibold text-slate-200">{item.inspection.physical_condition?.replace(/_/g, ' ') ?? '—'}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                <span className="text-slate-400 block mb-0.5">Recoverable Mass</span>
                <span className="font-semibold font-mono text-emerald-400">{format.weight(item.inspection.estimated_recoverable_weight_kg)}</span>
              </div>
            </div>

            {item.inspection.notes && (
              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-300">
                <span className="font-semibold text-slate-400 block mb-1">Technician Notes:</span>
                {item.inspection.notes}
              </div>
            )}
          </div>
        )}

        {/* Audit Timeline */}
        <div className="eco-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5 pb-2 border-b border-slate-800/60">
            <div>
              <h3 className="font-bold text-sm text-slate-100">Audit & State Transition History</h3>
              <p className="text-xs text-slate-400 mt-0.5">Immutable event log of all custodial handoffs.</p>
            </div>
            <Clock size={16} className="text-slate-500" />
          </div>
          <StatusTimeline history={item.status_histories ?? []} />
        </div>
      </div>
    </DashboardLayout>
  );
}
