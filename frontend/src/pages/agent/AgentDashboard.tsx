import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getPickups, confirmPickup } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { Truck, CheckCircle, AlertCircle, MapPin } from 'lucide-react';

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
      setMsg('Pickup confirmed successfully!');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to confirm pickup.');
    } finally {
      setConfirming(null);
    }
  };

  const active    = pickups.filter(p => ['PICKUP_ASSIGNED', 'PICKUP_REQUESTED'].includes(p.status));
  const completed = pickups.filter(p => ['COLLECTED', 'COMPLETED'].includes(p.status));

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Agent Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            Manage your assigned pickup requests.
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Active Pickups',    value: active.length,    color: '#fbbf24' },
            { label: 'Completed Today',   value: completed.length, color: '#4ade80' },
            { label: 'Total Assigned',    value: pickups.length,   color: '#a78bfa' },
          ].map(k => (
            <div key={k.label} className="glass-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{k.label}</p>
            </div>
          ))}
        </div>

        {msg && (
          <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
            style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.25)', color: '#86efac' }}>
            <CheckCircle size={16} />{msg}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            <AlertCircle size={16} />{error}
          </div>
        )}

        {/* Active pickups */}
        <div className="glass-card p-5">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--color-text)' }}>Active Pickups</h2>
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Loading…</p>
          ) : active.length === 0 ? (
            <div className="text-center py-10">
              <Truck size={36} style={{ color: 'var(--color-border)', margin: '0 auto 10px' }} />
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No active pickups assigned.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {active.map(p => (
                <div key={p.id} className="rounded-xl p-4" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge status={p.status} />
                        <span className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
                          #{p.id.slice(0, 8)}
                        </span>
                      </div>
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {p.user?.name ?? 'Unknown'} · {p.user?.phone ?? ''}
                      </p>
                      <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
                        <MapPin size={12} />
                        {p.latitude ? `${p.latitude.toFixed(4)}, ${p.longitude?.toFixed(4)}` : p.center?.address ?? '—'}
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                        Scheduled: {format.datetime(p.scheduled_at)} · {p.items?.length ?? 0} item(s)
                      </p>
                    </div>
                    {p.status === 'PICKUP_ASSIGNED' && (
                      <button
                        onClick={() => handleConfirm(p.id)}
                        disabled={confirming === p.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0"
                        style={{ background: 'var(--color-primary)', color: 'white', opacity: confirming === p.id ? 0.6 : 1 }}>
                        <CheckCircle size={14} />
                        {confirming === p.id ? 'Confirming…' : 'Confirm Collected'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed */}
        {completed.length > 0 && (
          <div className="glass-card p-5">
            <h2 className="font-semibold mb-4" style={{ color: 'var(--color-text)' }}>Completed Pickups</h2>
            <div className="space-y-2">
              {completed.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'var(--color-surface-2)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{p.user?.name ?? '—'}</p>
                    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{format.date(p.collected_at)}</p>
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
