import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import api from '../../services/api';
import { getPickups, receivePickup, createInspection } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { CheckCircle, AlertCircle, ClipboardCheck } from 'lucide-react';

export default function CenterDashboard() {
  const [tab, setTab] = useState<'incoming' | 'inspect'>('incoming');
  const [pickups, setPickups] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [inspectForm, setInspectForm] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      getPickups(),
      api.get('/ewaste'),
    ]).then(([pr, ir]) => {
      setPickups(pr.data.filter((p: any) => p.status === 'COLLECTED'));
      setItems(ir.data.filter((i: any) => i.status === 'RECEIVED_AT_CENTER'));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleReceive = async (pickupId: string) => {
    setMsg(''); setError('');
    try {
      await receivePickup(pickupId);
      setMsg('Pickup received and items updated.');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to receive pickup.');
    }
  };

  const handleInspect = async (itemId: string) => {
    setSubmitting(itemId); setMsg(''); setError('');
    const f = inspectForm[itemId] || {};
    try {
      await createInspection({
        item_id: itemId,
        physical_condition: f.physical_condition || 'MINOR_DAMAGE',
        functional_status: f.functional_status === 'true',
        classification: f.classification || 'RECYCLABLE',
        estimated_recoverable_weight_kg: parseFloat(f.estimated_recoverable_weight_kg || 0),
        hazardous_components: f.hazardous_components || '',
        notes: f.notes || '',
      });
      setMsg('Inspection recorded.');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save inspection.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Center Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            Receive incoming pickups and inspect e-waste items.
          </p>
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

        {/* Tabs */}
        <div className="flex gap-2">
          {(['incoming', 'inspect'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: tab === t ? 'rgba(22,163,74,0.15)' : 'var(--color-surface-2)',
                border: tab === t ? '1px solid rgba(22,163,74,0.3)' : '1px solid var(--color-border)',
                color: tab === t ? 'var(--color-primary-light)' : 'var(--color-muted)',
              }}>
              {t === 'incoming' ? `Incoming Pickups (${pickups.length})` : `Pending Inspection (${items.length})`}
            </button>
          ))}
        </div>

        {tab === 'incoming' && (
          <div className="glass-card p-5">
            <h2 className="font-semibold mb-4" style={{ color: 'var(--color-text)' }}>Pickups Awaiting Reception</h2>
            {loading ? <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Loading…</p>
            : pickups.length === 0 ? <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No collected pickups waiting.</p>
            : pickups.map(p => (
              <div key={p.id} className="rounded-xl p-4 mb-3"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      Pickup #{p.id.slice(0, 8)} · {p.items?.length ?? 0} item(s)
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                      Agent: {p.agent?.name ?? '—'} · Collected: {format.date(p.collected_at)}
                    </p>
                  </div>
                  <button onClick={() => handleReceive(p.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'var(--color-primary)', color: 'white' }}>
                    <CheckCircle size={14} /> Mark Received
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'inspect' && (
          <div className="glass-card p-5">
            <h2 className="font-semibold mb-4" style={{ color: 'var(--color-text)' }}>Items Pending Inspection</h2>
            {loading ? <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Loading…</p>
            : items.length === 0 ? <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No items awaiting inspection.</p>
            : items.map(item => {
              const f = inspectForm[item.id] || {};
              const set = (k: string, v: string) => setInspectForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], [k]: v } }));
              return (
                <div key={item.id} className="rounded-xl p-4 mb-4"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        {item.category?.name ?? '—'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>#{item.id.slice(0, 8)}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Classification</label>
                      <select value={f.classification || 'RECYCLABLE'}
                        onChange={e => set('classification', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                        {['REUSABLE', 'REFURBISHABLE', 'RECYCLABLE', 'DISPOSABLE'].map(c =>
                          <option key={c} value={c}>{c}</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Functional?</label>
                      <select value={f.functional_status || 'false'}
                        onChange={e => set('functional_status', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Est. Recoverable (kg)</label>
                      <input type="number" step="0.01" value={f.estimated_recoverable_weight_kg || ''}
                        onChange={e => set('estimated_recoverable_weight_kg', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Hazardous components</label>
                      <input type="text" value={f.hazardous_components || ''}
                        onChange={e => set('hazardous_components', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                        placeholder="Lead, Mercury…"
                      />
                    </div>
                  </div>
                  <textarea rows={2} value={f.notes || ''}
                    onChange={e => set('notes', e.target.value)}
                    placeholder="Inspection notes…"
                    className="w-full px-3 py-2 rounded-xl text-xs outline-none mb-3"
                    style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  />
                  <button onClick={() => handleInspect(item.id)}
                    disabled={submitting === item.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                    style={{ background: 'var(--color-primary)', color: 'white', opacity: submitting === item.id ? 0.6 : 1 }}>
                    <ClipboardCheck size={14} />
                    {submitting === item.id ? 'Saving…' : 'Save Inspection'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
