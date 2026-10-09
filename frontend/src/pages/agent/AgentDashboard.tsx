import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getPickups, confirmPickup } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { Truck, CheckCircle2, AlertCircle, MapPin, Phone, User, Package, Clock, ArrowRight, ShieldCheck } from 'lucide-react';

export default function AgentDashboard() {
  const [pickups, setPickups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    getPickups().then(r => setPickups(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleConfirm = async (pickupId: string) => {
    setConfirming(pickupId);
    setMsg(''); setError('');
    try {
      await confirmPickup(pickupId, {});
      setMsg('Pickup verified and recorded as COLLECTED. Chain of custody updated.');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to confirm pickup. Please try again.');
    } finally {
      setConfirming(null);
    }
  };

  const active    = pickups.filter(p => ['PICKUP_ASSIGNED', 'PICKUP_REQUESTED'].includes(p.status));
  const completed = pickups.filter(p => ['COLLECTED', 'RECEIVED_AT_CENTER'].includes(p.status));

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Field Logistics & Collection Operations</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 border border-amber-800/40">
              Agent Portal
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Assigned doorstep pickups, route details, and custodial handoff verification.
          </p>
        </div>

        {/* Operational Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="eco-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Queue</span>
              <Truck size={18} className="text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-slate-100">{active.length}</p>
            <p className="text-xs text-slate-400 mt-1">Pending physical collection</p>
          </div>

          <div className="eco-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Collected Today</span>
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">{completed.length}</p>
            <p className="text-xs text-slate-400 mt-1">Verified handoffs delivered</p>
          </div>

          <div className="eco-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">All-Time Dispatches</span>
              <ShieldCheck size={18} className="text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-slate-100">{pickups.length}</p>
            <p className="text-xs text-slate-400 mt-1">Total assignments logged</p>
          </div>
        </div>

        {/* Feedback alerts */}
        {msg && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm"
            style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#34d399' }}>
            <CheckCircle2 size={18} className="flex-shrink-0" />
            <span>{msg}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm"
            style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5' }}>
            <AlertCircle size={18} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Active Dispatches */}
        <div className="eco-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
            <div>
              <h2 className="text-base font-bold text-slate-100">Scheduled Pickups</h2>
              <p className="text-xs text-slate-400 mt-0.5">Collect e-waste packages directly from citizen residences.</p>
            </div>
            <span className="text-xs font-mono text-slate-400">{active.length} pending</span>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
              <span className="text-xs">Fetching assigned pickups…</span>
            </div>
          ) : active.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-3 text-slate-500">
                <Truck size={24} />
              </div>
              <p className="text-sm font-medium text-slate-200">No active pickups currently assigned</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                When new citizen submissions are processed by the smart dispatch engine, they will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {active.map(p => (
                <div key={p.id} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.status} />
                        <span className="text-xs font-mono text-slate-500">#{p.id.slice(0, 8)}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                        <User size={15} className="text-slate-400" />
                        <span>{p.user?.name ?? 'Anonymous Citizen'}</span>
                        {p.user?.phone && (
                          <span className="text-xs font-mono text-slate-400 flex items-center gap-1 ml-2">
                            <Phone size={12} /> {p.user?.phone}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <MapPin size={13} className="text-amber-400 flex-shrink-0" />
                        <span>
                          {p.latitude ? `Coords: ${p.latitude.toFixed(4)}, ${p.longitude?.toFixed(4)}` : p.center?.address ?? 'Target Center Intake'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                        <span className="flex items-center gap-1">
                          <Package size={13} />
                          {p.items?.length ?? 0} item(s) attached
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={13} />
                          Scheduled: {format.datetime(p.scheduled_at)}
                        </span>
                      </div>
                    </div>

                    {p.status === 'PICKUP_ASSIGNED' && (
                      <button
                        onClick={() => handleConfirm(p.id)}
                        disabled={confirming === p.id}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow transition-all cursor-pointer self-start sm:self-center"
                        style={{
                          background: confirming === p.id ? 'var(--color-surface-3)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        }}
                      >
                        {confirming === p.id ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Updating State…</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={15} />
                            <span>Confirm Collected</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed Deliveries */}
        {completed.length > 0 && (
          <div className="eco-card p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-100 mb-3">Recent Completed Collections</h2>
            <div className="divide-y divide-slate-800/60">
              {completed.map(p => (
                <div key={p.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-200">{p.user?.name ?? 'Citizen'}</span>
                    <p className="text-slate-500 font-mono text-[11px]">#{p.id.slice(0, 8)} · {format.date(p.collected_at)}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
