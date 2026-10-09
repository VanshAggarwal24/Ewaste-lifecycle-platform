import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import api from '../../services/api';
import { getPickups, receivePickup, createInspection, createBatch, getRecyclers, getBatches } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { CheckCircle2, AlertCircle, ClipboardCheck, Building2, Cpu, Factory, Layers } from 'lucide-react';

function tabFromPath(pathname: string): 'incoming' | 'inspect' | 'batches' {
  if (pathname.includes('/inspect')) return 'inspect';
  if (pathname.includes('/batches')) return 'batches';
  return 'incoming';
}

export default function CenterDashboard() {
  const location = useLocation();
  const [tab, setTab] = useState<'incoming' | 'inspect' | 'batches'>(() => tabFromPath(location.pathname));
  const [pickups, setPickups] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [inspectedItems, setInspectedItems] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [recyclers, setRecyclers] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [recyclerId, setRecyclerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [inspectForm, setInspectForm] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [creatingBatch, setCreatingBatch] = useState(false);

  useEffect(() => {
    setTab(tabFromPath(location.pathname));
  }, [location.pathname]);

  const load = () => {
    setLoading(true);
    Promise.all([
      getPickups(),
      api.get('/ewaste'),
      getBatches(),
      getRecyclers(),
    ]).then(([pr, ir, br, rr]) => {
      setPickups(pr.data.filter((p: any) => p.status === 'COLLECTED'));
      setItems(ir.data.filter((i: any) => i.status === 'RECEIVED_AT_CENTER'));
      setInspectedItems(ir.data.filter((i: any) => i.status === 'INSPECTED'));
      setBatches(br.data);
      setRecyclers(rr.data);
      if (rr.data.length > 0 && !recyclerId) setRecyclerId(rr.data[0].id);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleReceive = async (pickupId: string) => {
    setMsg(''); setError('');
    try {
      await receivePickup(pickupId);
      setMsg('Pickup batch received at sorting hub. Contained items marked as RECEIVED_AT_CENTER.');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to receive pickup batch.');
    }
  };

  const toggleItem = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleCreateBatch = async () => {
    if (selectedItems.size === 0) { setError('Select at least one inspected item for the batch.'); return; }
    if (!recyclerId) { setError('Select a recycler partner.'); return; }
    setCreatingBatch(true); setMsg(''); setError('');
    try {
      const centerId = inspectedItems[0]?.pickup_request?.center_id;
      await createBatch({
        center_id: centerId,
        recycler_id: recyclerId,
        item_ids: Array.from(selectedItems),
      });
      setMsg(`Processing batch created with ${selectedItems.size} item(s) and sent to recycler.`);
      setSelectedItems(new Set());
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create processing batch.');
    } finally {
      setCreatingBatch(false);
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
      setMsg('Diagnostic inspection recorded. Item transitioned to INSPECTED.');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save inspection report.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Intake & Technical Grading Center</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
              Staff Facility
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Verify custodial custody of incoming agent deliveries and record lab inspection diagnostics.
          </p>
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

        {/* Tabs */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900/60 border border-slate-800 w-fit">
          <button
            onClick={() => setTab('incoming')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tab === 'incoming'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Incoming Deliveries ({pickups.length})
          </button>
          <button
            onClick={() => setTab('inspect')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tab === 'inspect'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pending Diagnostic ({items.length})
          </button>
          <button
            onClick={() => setTab('batches')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tab === 'batches'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Processing Batches ({inspectedItems.length})
          </button>
        </div>

        {/* Tab 1: Incoming Pickups */}
        {tab === 'incoming' && (
          <div className="eco-card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
              <div>
                <h2 className="text-base font-bold text-slate-100">Deliveries Awaiting Intake Scan</h2>
                <p className="text-xs text-slate-400 mt-0.5">Physical items brought by collection agents awaiting custody receipt.</p>
              </div>
              <span className="text-xs font-mono text-slate-400">{pickups.length} queue</span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
                <span className="text-xs">Loading logistics intake queue…</span>
              </div>
            ) : pickups.length === 0 ? (
              <div className="text-center py-12">
                <Building2 size={32} className="mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-300">All collected batches received</p>
                <p className="text-xs text-slate-500 mt-1">No pending field deliveries awaiting reception.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pickups.map(p => (
                  <div key={p.id} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-slate-200">Pickup #{p.id.slice(0, 8)}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="text-xs text-slate-400">
                        Dispatched Agent: <strong className="text-slate-300">{p.agent?.name ?? 'Assigned Agent'}</strong> · Collected on {format.datetime(p.collected_at)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Contains {p.items?.length ?? 1} item(s) awaiting unboxing and diagnostic grading.
                      </p>
                    </div>

                    <button
                      onClick={() => handleReceive(p.id)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow transition-all cursor-pointer self-start sm:self-center"
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                    >
                      <CheckCircle2 size={15} />
                      <span>Accept Delivery & Ingest</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Pending Inspection */}
        {tab === 'inspect' && (
          <div className="eco-card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
              <div>
                <h2 className="text-base font-bold text-slate-100">Lab Diagnostic & Grading Queue</h2>
                <p className="text-xs text-slate-400 mt-0.5">Record functional assessment, material classification, and recoverable mass.</p>
              </div>
              <span className="text-xs font-mono text-purple-400">{items.length} items</span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-2" />
                <span className="text-xs">Loading items for inspection…</span>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardCheck size={32} className="mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-300">No items awaiting technical inspection</p>
                <p className="text-xs text-slate-500 mt-1">Accept incoming deliveries above to populate the grading bench.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map(item => {
                  const f = inspectForm[item.id] || {};
                  const set = (k: string, v: string) => setInspectForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], [k]: v } }));
                  return (
                    <div key={item.id} className="p-5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-purple-950/60 border border-purple-800/40 flex items-center justify-center text-purple-300">
                            <Cpu size={16} />
                          </div>
                          <div>
                            <span className="font-bold text-sm text-slate-200">{item.category?.name ?? 'Hardware Asset'}</span>
                            <span className="text-xs font-mono text-slate-500 ml-2">#{item.id.slice(0, 8)}</span>
                          </div>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Physical Condition *</label>
                          <select
                            value={f.physical_condition || 'MINOR_DAMAGE'}
                            onChange={e => set('physical_condition', e.target.value)}
                            className="w-full eco-input py-2 text-xs cursor-pointer"
                          >
                            <option value="PRISTINE">Pristine (Like New)</option>
                            <option value="MINOR_DAMAGE">Minor Damage</option>
                            <option value="MODERATE_DAMAGE">Moderate Damage</option>
                            <option value="SEVERE_DAMAGE">Severe Damage</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Classification *</label>
                          <select
                            value={f.classification || 'RECYCLABLE'}
                            onChange={e => set('classification', e.target.value)}
                            className="w-full eco-input py-2 text-xs cursor-pointer"
                          >
                            <option value="RECYCLABLE">RECYCLABLE (Extract Materials)</option>
                            <option value="REFURBISHABLE">REFURBISHABLE (Repair/Resell)</option>
                            <option value="REUSABLE">REUSABLE (Direct Secondary Use)</option>
                            <option value="DISPOSABLE">DISPOSABLE (Hazardous Scrap)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Functional Test *</label>
                          <select
                            value={f.functional_status || 'false'}
                            onChange={e => set('functional_status', e.target.value)}
                            className="w-full eco-input py-2 text-xs cursor-pointer"
                          >
                            <option value="false">Non-Functional / Dead</option>
                            <option value="true">Powers On / Functional</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Est. Recoverable Mass (kg)</label>
                          <input
                            type="number"
                            step="0.05"
                            value={f.estimated_recoverable_weight_kg || ''}
                            onChange={e => set('estimated_recoverable_weight_kg', e.target.value)}
                            placeholder="e.g. 1.85"
                            className="w-full eco-input py-2 text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Hazardous Components</label>
                          <input
                            type="text"
                            value={f.hazardous_components || ''}
                            onChange={e => set('hazardous_components', e.target.value)}
                            placeholder="e.g. Li-ion, CRT Lead"
                            className="w-full eco-input py-2 text-xs"
                          />
                        </div>
                      </div>


                      <div>
                        <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Diagnostic Log & Observations</label>
                        <input
                          type="text"
                          value={f.notes || ''}
                          onChange={e => set('notes', e.target.value)}
                          placeholder="Note circuit board integrity, casing condition, or battery swell…"
                          className="w-full eco-input py-2 text-xs"
                        />
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleInspect(item.id)}
                          disabled={submitting === item.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white shadow transition-all cursor-pointer hover:opacity-95"
                          style={{
                            background: submitting === item.id ? 'var(--color-surface-3)' : 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                          }}
                        >
                          <ClipboardCheck size={14} />
                          <span>{submitting === item.id ? 'Saving Report…' : 'Finalize Diagnostic & Approve'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Processing Batches */}
        {tab === 'batches' && (
          <div className="space-y-4">
            <div className="eco-card p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
                <div>
                  <h2 className="text-base font-bold text-slate-100">Create Recycler Batch</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Group inspected items and dispatch to a certified recycler.</p>
                </div>
                <span className="text-xs font-mono text-cyan-400">{selectedItems.size} selected</span>
              </div>

              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-2" />
                  <span className="text-xs">Loading inspected inventory…</span>
                </div>
              ) : inspectedItems.length === 0 ? (
                <div className="text-center py-12">
                  <Factory size={32} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-300">No inspected items ready for batching</p>
                  <p className="text-xs text-slate-500 mt-1">Complete diagnostics on received items first.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Recycler Partner *</label>
                      <select
                        value={recyclerId}
                        onChange={e => setRecyclerId(e.target.value)}
                        className="w-full eco-input py-2 text-xs cursor-pointer"
                      >
                        {recyclers.map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.email})</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={handleCreateBatch}
                        disabled={creatingBatch || selectedItems.size === 0}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow transition-all cursor-pointer"
                        style={{
                          background: creatingBatch ? 'var(--color-surface-3)' : 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                        }}
                      >
                        <Layers size={15} />
                        <span>{creatingBatch ? 'Creating Batch…' : 'Create & Send Batch'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {inspectedItems.map(item => (
                      <label
                        key={item.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedItems.has(item.id)
                            ? 'border-cyan-500/40 bg-cyan-950/30'
                            : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                          className="accent-cyan-500"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-sm text-slate-200">{item.category?.name}</span>
                          <span className="text-xs font-mono text-slate-500 ml-2">#{item.id.slice(0, 8)}</span>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {format.weight(item.actual_weight_kg || item.estimated_weight_kg)} · {item.inspection?.classification ?? 'INSPECTED'}
                          </p>
                        </div>
                        <StatusBadge status={item.status} />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {batches.length > 0 && (
              <div className="eco-card p-5 sm:p-6">
                <h2 className="text-base font-bold text-slate-100 mb-3">Sent Batches</h2>
                <div className="divide-y divide-slate-800/60">
                  {batches.map(b => (
                    <div key={b.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-200">Batch #{b.id.slice(0, 8)}</span>
                        <p className="text-slate-500 font-mono text-[11px]">
                          {b.batch_items?.length ?? 0} items · Sent {format.date(b.sent_at)} · {b.status}
                        </p>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
