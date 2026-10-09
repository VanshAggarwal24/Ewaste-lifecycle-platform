import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getBatches, completeBatch } from '../../services/api';
import api from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { CheckCircle2, AlertCircle, Plus, Minus, Factory, Recycle, Layers, Scale, Sparkles } from 'lucide-react';

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
      [batchId]: [...(prev[batchId] || []), { material_id: materials[0]?.id ? String(materials[0].id) : '', quantity_kg: '' }]
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
    if (rows.length === 0) { setError('Please add at least one recovered material record.'); return; }
    const recoveries = rows.map(r => ({
      material_id: Number(r.material_id),
      quantity_kg: parseFloat(r.quantity_kg || '0'),
    })).filter(r => r.quantity_kg > 0);

    if (recoveries.length === 0) {
      setError('Please specify valid non-zero recovery weights.');
      return;
    }

    setCompleting(batchId); setMsg(''); setError('');
    try {
      await completeBatch(batchId, { recoveries });
      setMsg('Batch marked as COMPLETED and recovered materials deposited into ledger.');
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
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Industrial Material Recovery & Refining</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
              Recycler Facility
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Process aggregated hardware batches, perform shredding/separation, and record verified elemental yields.
          </p>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="eco-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Batches to Process</span>
              <Layers size={18} className="text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-slate-100">{active.length}</p>
            <p className="text-xs text-slate-400 mt-1">Industrial refinery queue</p>
          </div>

          <div className="eco-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Batches Completed</span>
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">{completed.length}</p>
            <p className="text-xs text-slate-400 mt-1">Secondary materials recovered</p>
          </div>

          <div className="eco-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cataloged Materials</span>
              <Sparkles size={18} className="text-cyan-400" />
            </div>
            <p className="text-2xl font-bold text-slate-100">{materials.length}</p>
            <p className="text-xs text-slate-400 mt-1">Copper, Gold, Aluminum, etc.</p>
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

        {/* Active Batches */}
        <div className="eco-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
            <div>
              <h2 className="text-base font-bold text-slate-100">Assigned Processing Batches</h2>
              <p className="text-xs text-slate-400 mt-0.5">Input mass ready for mechanical dismantling & elemental recovery.</p>
            </div>
            <span className="text-xs font-mono text-cyan-400">{active.length} active</span>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-2" />
              <span className="text-xs">Loading batch allocations…</span>
            </div>
          ) : active.length === 0 ? (
            <div className="text-center py-12">
              <Factory size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-300">No active batches assigned</p>
              <p className="text-xs text-slate-500 mt-1">Collection centers create batches once sorted containers meet threshold weight.</p>
            </div>
          ) : active.map(b => {
            const rows = recoveryForms[b.id] || [];
            const totalInputWeight = b.batch_items?.reduce((s: number, bi: any) => s + (bi.processed_weight_kg || 0), 0) ?? 0;
            return (
              <div key={b.id} className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 mb-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-200">Refinery Batch #{b.id.slice(0, 8)}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Origin Center: <strong className="text-slate-300">{b.center?.name ?? 'Hub'}</strong> · Gross Intake Mass: <span className="font-mono text-emerald-400 font-semibold">{format.weight(totalInputWeight)}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Dispatched: {format.date(b.sent_at)} · Items: {b.batch_items?.length ?? 0}</p>
                  </div>
                </div>

                {/* Material rows */}
                <div className="pt-2 border-t border-slate-800/60">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                    Extracted Material Yields (Mass Verification)
                  </span>

                  {rows.length === 0 ? (
                    <p className="text-xs text-slate-500 italic mb-3">No material lines added yet. Click &quot;Add Material Yield&quot; below to log refined output.</p>
                  ) : (
                    <div className="space-y-2 mb-3">
                      {rows.map((row, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            value={row.material_id}
                            onChange={e => updateRow(b.id, idx, 'material_id', e.target.value)}
                            className="flex-1 eco-input py-2 text-xs cursor-pointer"
                          >
                            <option value="">Select target metal/polymer…</option>
                            {materials.map((m: any) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.unit || 'kg'})
                              </option>
                            ))}
                          </select>

                          <div className="relative w-36">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={row.quantity_kg}
                              onChange={e => updateRow(b.id, idx, 'quantity_kg', e.target.value)}
                              className="w-full eco-input py-2 pr-8 text-xs font-mono"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 pointer-events-none">kg</span>
                          </div>

                          <button
                            onClick={() => removeRow(b.id, idx)}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors cursor-pointer"
                            title="Remove row"
                          >
                            <Minus size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => addRow(b.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 hover:bg-cyan-900/50 transition-colors cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Add Material Yield</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleComplete(b.id)}
                      disabled={completing === b.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white shadow transition-all cursor-pointer hover:opacity-95"
                      style={{
                        background: completing === b.id ? 'var(--color-surface-3)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      }}
                    >
                      <CheckCircle2 size={14} />
                      <span>{completing === b.id ? 'Committing Ledger…' : 'Finalize Batch & Certify Recovery'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Completed Batches Ledger */}
        {completed.length > 0 && (
          <div className="eco-card p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-100 mb-3">Refinery Completion Ledger</h2>
            <div className="divide-y divide-slate-800/60">
              {completed.map(b => (
                <div key={b.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-200">Refinery Batch #{b.id.slice(0, 8)}</span>
                    <p className="text-slate-500 font-mono text-[11px]">Completed on {format.date(b.completed_at)} · Certified for circular reuse</p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/40">
                    CERTIFIED RECYCLED
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
