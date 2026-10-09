import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getMyItems } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { Package, Search, Plus, ExternalLink, Filter, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MyItems() {
  const [items, setItems]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    getMyItems().then(r => setItems(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(i => {
    const matchesSearch = 
      i.category?.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.status.toLowerCase().includes(search.toLowerCase()) ||
      i.id.toLowerCase().includes(search.toLowerCase());
    
    if (statusFilter === 'ALL') return matchesSearch;
    if (statusFilter === 'ACTIVE') return matchesSearch && !['RECYCLED','REFURBISHED','DISPOSED','CANCELLED'].includes(i.status);
    if (statusFilter === 'COMPLETED') return matchesSearch && ['RECYCLED','REFURBISHED','DISPOSED'].includes(i.status);
    return matchesSearch && i.status === statusFilter;
  });

  const totalWeight = items.reduce((s, i) => s + (i.actual_weight_kg ?? i.estimated_weight_kg ?? 0), 0);

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">My Registered Assets</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {items.length} Total
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Audit trail of all equipment submitted for recycling and verified recovery.
            </p>
          </div>

          <Link to="/submit"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all cursor-pointer hover:opacity-95 self-start sm:self-auto"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
            <Plus size={16} />
            <span>Submit New Device</span>
          </Link>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by ID, category, or status…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs sm:text-sm eco-input"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'ALL', label: 'All Items' },
              { id: 'ACTIVE', label: 'In Progress' },
              { id: 'COMPLETED', label: 'Recycled / Recovered' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Table Card */}
        <div className="eco-card p-5">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
              <span className="text-xs">Loading asset records…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-3 text-slate-500">
                <Package size={24} />
              </div>
              <p className="text-sm font-medium text-slate-200">
                {search || statusFilter !== 'ALL' ? 'No items match filter criteria' : 'No items submitted yet'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {search ? 'Try clearing your query or selecting another filter.' : 'Submit your electronics to initiate pickup and material recycling.'}
              </p>
              {!search && statusFilter === 'ALL' && (
                <Link to="/submit"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold mt-4 px-3.5 py-2 rounded-xl text-emerald-300 bg-emerald-950/60 border border-emerald-800/40 hover:bg-emerald-900/50 transition-colors">
                  <Plus size={14} />
                  <span>Submit an Item</span>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3">Item Classification</th>
                    <th className="py-3 px-3">Est. Weight</th>
                    <th className="py-3 px-3">Actual Weight</th>
                    <th className="py-3 px-3">Condition</th>
                    <th className="py-3 px-3">Lifecycle Status</th>
                    <th className="py-3 px-3">Submitted</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-950/50 border border-emerald-800/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                            <Package size={15} />
                          </div>
                          <div>
                            <span className="font-semibold text-slate-200">{item.category?.name ?? 'Hardware Asset'}</span>
                            <p className="text-[11px] font-mono text-slate-500">#{item.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-400 font-mono">
                        {format.weight(item.estimated_weight_kg)}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-200 font-mono font-medium">
                        {format.weight(item.actual_weight_kg)}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="text-xs text-slate-400 capitalize">
                          {item.condition?.toLowerCase().replace(/_/g, ' ') ?? '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-400">
                        {format.date(item.submitted_at)}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <Link
                          to={`/track/${item.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors group-hover:translate-x-0.5 transform duration-150"
                        >
                          <span>Track</span>
                          <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
