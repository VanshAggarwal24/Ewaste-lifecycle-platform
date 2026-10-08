import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getBatches, completeBatch } from '../../services/api';
import api from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { CheckCircle, AlertCircle, Plus, Minus } from 'lucide-react';

export default function RecyclerDashboard() {
  const [batches, setBatches] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState<string | null>(null);
  const [recoveryForms, setRecoveryForms] = useState<Record<string, { material_id: string; quantity_kg: string }[]>>({});

  const load = () => {
    setLoading(true);
    Promise.all([getBatches(), api.get('/materials')]).then(([br, mr]) => {
      setBatches(br.data);
      setMaterials(mr.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const addRow = (batchId: string) => {
    setRecoveryForms(prev => ({
      ...prev,
      [batchId]: [...(prev[batchId] || []), { material_id: '', quantity_kg: '' }]
    }));
  };

  const removeRow = (batchId: string, idx: number) => {
    setRecoveryForms(prev => ({
      ...prev,
      [batchId]: prev[batchId].filter((_, i) => i !== idx)
    }));
  };

  const updateRow = (batchId: string, idx: number, key: string, val: string) => {
    setRecoveryForms(prev => {
      const rows = [...(prev[batchId] || [])];
      rows[idx] = { ...rows[idx], [key]: val };
      return { ...prev, [batchId]: rows };
    });
  };

  const handleComplete = async (batchId: string) => {
    const rows = recoveryForms[batchId] || [];
    if (rows.length === 0) { setError('Add at least one recovery record.'); return; }
    const recoveries = rows.map(r => ({
      material_id: Number(r.material_id),
      quantity_kg: parseFloat(r.quantity_kg),
    }));
    setCompleting(batchId); setMsg(''); setError('');
    try {
      await completeBatch(batchId, { recoveries });
      setMsg('Batch completed and material recoveries recorded.');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to complete batch.');
    } finally {
      setCompleting(null);
    }
  };

  const active    = batches.filter(b => b.status !== 'COMPLETED');
  const completed = batches.filter(b => b.status === 'COMPLETED');

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Recycler Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            Process assigned batches and record recovered materials.
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

        <div className="glass-card p-5">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
            Active Batches ({active.length})
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Loading…</p>
          ) : active.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No active batches assigned.</p>
          ) : active.map(b => {
            const rows = recoveryForms[b.id] || [];
            const totalInputWeight = b.batch_items?.reduce((s: number, bi: any) => s + (bi.processed_weight_kg || 0), 0) ?? 0;
            return (
              <div key={b.id} className="rounded-xl p-4 mb-4"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      Batch #{b.id.slice(0, 8)}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      Center: {b.center?.name ?? '—'} · Items: {b.batch_items?.length ?? 0} · Input: {format.weight(totalInputWeight)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      Sent: {format.date(b.sent_at)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full"
                    style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                    {b.status}
                  </span>
                </div>

                {/* Material recovery rows */}
                <div className="mb-3">
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-muted)' }}>Recovery Records</p>
                  {rows.map((row, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                      <select value={row.material_id}
                        onChange={e => updateRow(b.id, idx, 'material_id', e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                        <option value="">Material…</option>
                        {materials.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <input type="number" step="0.01" placeholder="kg"
                        value={row.quantity_kg}
                        onChange={e => updateRow(b.id, idx, 'quantity_kg', e.target.value)}
                        className="w-24 px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      />
                      <button onClick={() => removeRow(b.id, idx)}
                        className="p-2 rounded-xl"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                        <Minus size={14} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addRow(b.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                    style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                    <Plus size={14} /> Add Material
                  </button>
                </div>

                <button
                  onClick={() => handleComplete(b.id)}
                  disabled={completing === b.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--color-primary)', color: 'white', opacity: completing === b.id ? 0.6 : 1 }}>
                  <CheckCircle size={14} />
                  {completing === b.id ? 'Processing…' : 'Mark Completed & Record Recovery'}
                </button>
              </div>
            );
          })}
        </div>

        {completed.length > 0 && (
          <div className="glass-card p-5">
            <h2 className="font-semibold mb-3" style={{ color: 'var(--color-text)' }}>Completed Batches</h2>
            <div className="space-y-2">
              {completed.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'var(--color-surface-2)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>#{b.id.slice(0, 8)}</p>
                    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      Completed: {format.date(b.completed_at)}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full"
                    style={{ background: 'rgba(22,163,74,0.15)', color: '#4ade80' }}>COMPLETED</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
