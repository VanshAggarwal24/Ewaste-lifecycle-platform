import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getMyItems, getPickups } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { Package, Truck, Recycle, Scale, TrendingUp, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface KpiCardProps {
  label: string; value: string | number; icon: React.ReactNode; color: string; sub?: string;
}
function KpiCard({ label, value, icon, color, sub }: KpiCardProps) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>{label}</p>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + '22' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{sub}</p>}
    </div>
  );
}

export default function UserDashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyItems().then(r => setItems(r.data)).finally(() => setLoading(false));
  }, []);

  const totalWeight = items.reduce((s, i) => s + (i.actual_weight_kg ?? i.estimated_weight_kg ?? 0), 0);
  const recycled    = items.filter(i => i.status === 'RECYCLED').length;
  const pending     = items.filter(i => !['RECYCLED','REFURBISHED','DISPOSED','CANCELLED'].includes(i.status)).length;

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
              Welcome, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
              Track your e-waste lifecycle and environmental impact.
            </p>
          </div>
          <Link to="/submit"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'var(--color-primary)', color: 'white' }}>
            <Plus size={16} /> Submit E-Waste
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Items"    value={items.length}               icon={<Package size={18} />}    color="#4ade80" />
          <KpiCard label="Weight Submitted" value={format.weight(totalWeight)} icon={<Scale size={18} />}   color="#60a5fa" sub="estimated + actual" />
          <KpiCard label="Active Pickups" value={pending}                    icon={<Truck size={18} />}      color="#fbbf24" />
          <KpiCard label="Recycled"       value={recycled}                   icon={<Recycle size={18} />}    color="#a78bfa" sub="items fully processed" />
        </div>

        {/* Recent Items */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>My Submitted Items</h2>
            <Link to="/my-items" className="text-xs" style={{ color: 'var(--color-primary-light)' }}>View all →</Link>
          </div>
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Loading…</p>
          ) : items.length === 0 ? (
            <div className="text-center py-10">
              <Package size={40} style={{ color: 'var(--color-border)', margin: '0 auto 12px' }} />
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No items submitted yet.</p>
              <Link to="/submit" className="text-sm mt-2 inline-block" style={{ color: 'var(--color-primary-light)' }}>
                Submit your first item →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Category', 'Est. Weight', 'Status', 'Submitted', 'Action'].map(h => (
                      <th key={h} className="text-left py-2 pr-4 font-medium text-xs"
                        style={{ color: 'var(--color-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 8).map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}
                      className="transition-colors">
                      <td className="py-3 pr-4 font-medium" style={{ color: 'var(--color-text)' }}>
                        {item.category?.name ?? '—'}
                      </td>
                      <td className="py-3 pr-4" style={{ color: 'var(--color-muted)' }}>
                        {format.weight(item.estimated_weight_kg)}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="py-3 pr-4 text-xs" style={{ color: 'var(--color-muted)' }}>
                        {format.date(item.submitted_at)}
                      </td>
                      <td className="py-3">
                        <Link to={`/track/${item.id}`} className="text-xs"
                          style={{ color: 'var(--color-primary-light)' }}>Track →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Impact note */}
        <div className="glass-card p-5 flex items-start gap-4"
          style={{ borderColor: 'rgba(22,163,74,0.3)' }}>
          <TrendingUp size={24} style={{ color: 'var(--color-primary-light)', flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Your Environmental Impact</p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              You have submitted <strong style={{ color: 'var(--color-primary-light)' }}>{format.weight(totalWeight)}</strong> of
              e-waste for responsible disposal. {recycled > 0 && `${recycled} item(s) have been fully recycled.`}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
