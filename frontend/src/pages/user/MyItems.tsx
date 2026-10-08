import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getMyItems } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { Package, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MyItems() {
  const [items, setItems]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getMyItems().then(r => setItems(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(i =>
    i.category?.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>My Items</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
              All e-waste items you have submitted.
            </p>
          </div>
          <Link to="/submit"
            className="px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--color-primary)', color: 'white' }}>
            + Submit New
          </Link>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by category or status…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          />
        </div>

        <div className="glass-card p-5">
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Package size={40} style={{ color: 'var(--color-border)', margin: '0 auto 12px' }} />
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                {search ? 'No items match your search.' : 'No items yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Category', 'Est. Weight', 'Actual Weight', 'Condition', 'Status', 'Submitted', ''].map(h => (
                      <th key={h} className="text-left py-2 pr-4 font-medium text-xs" style={{ color: 'var(--color-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--color-text)' }}>{item.category?.name ?? '—'}</td>
                      <td className="py-3 pr-4" style={{ color: 'var(--color-muted)' }}>{format.weight(item.estimated_weight_kg)}</td>
                      <td className="py-3 pr-4" style={{ color: 'var(--color-muted)' }}>{format.weight(item.actual_weight_kg)}</td>
                      <td className="py-3 pr-4 text-xs" style={{ color: 'var(--color-muted)' }}>{item.condition?.replace(/_/g, ' ') ?? '—'}</td>
                      <td className="py-3 pr-4"><StatusBadge status={item.status} /></td>
                      <td className="py-3 pr-4 text-xs" style={{ color: 'var(--color-muted)' }}>{format.date(item.submitted_at)}</td>
                      <td className="py-3">
                        <Link to={`/track/${item.id}`} className="text-xs" style={{ color: 'var(--color-primary-light)' }}>Track →</Link>
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
