import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getMyItems } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
import { Package, Truck, Recycle, Scale, TrendingUp, Plus, ArrowRight, ShieldCheck, Leaf, Sparkles, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  sub?: string;
  badge?: string;
}

function KpiCard({ label, value, icon, color, sub, badge }: KpiCardProps) {
  return (
    <div className="eco-card p-5 relative overflow-hidden eco-card-hover group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
          style={{ background: color + '18', color }}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-100">{value}</span>
        {badge && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {badge}
          </span>
        )}
      </div>
      {sub && <p className="text-xs mt-1.5 text-slate-400">{sub}</p>}
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
  const inFlight    = items.filter(i => !['RECYCLED','REFURBISHED','DISPOSED','CANCELLED'].includes(i.status)).length;
  const co2Saved    = (totalWeight * 1.84).toFixed(1); // standard approx kg CO2e saved per kg of e-waste recycled

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-slate-100">
                Welcome back, {user?.name?.split(' ')[0] || 'User'}
              </h1>
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                <Leaf size={12} /> Active Recycler
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Track your electronic equipment lifecycle and circular economy impact in real time.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link to="/submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all hover:opacity-95 cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
              <Plus size={16} />
              <span>Submit E-Waste</span>
            </Link>
          </div>
        </div>

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Submitted"
            value={items.length}
            icon={<Package size={18} />}
            color="#34d399"
            sub="Registered electronic items"
          />
          <KpiCard
            label="Diverted Weight"
            value={format.weight(totalWeight)}
            icon={<Scale size={18} />}
            color="#60a5fa"
            sub="Kept out of landfills"
          />
          <KpiCard
            label="In-Flight Lifecycle"
            value={inFlight}
            icon={<Truck size={18} />}
            color="#fbbf24"
            sub="Pickups & processing active"
            badge={inFlight > 0 ? `${inFlight} active` : undefined}
          />
          <KpiCard
            label="Fully Recovered"
            value={recycled}
            icon={<Recycle size={18} />}
            color="#a78bfa"
            sub="Processed & materials extracted"
          />
        </div>

        {/* Environmental Impact Banner */}
        <div className="eco-card p-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.03) 100%)', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-400 flex-shrink-0 mt-0.5">
                <Sparkles size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-100">Verified Environmental Contribution</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 font-medium border border-emerald-800/40">GHG Reduction</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  By responsibly recycling <span className="text-emerald-300 font-medium">{format.weight(totalWeight)}</span> of hardware,
                  you have prevented an estimated <strong className="text-emerald-300">{co2Saved} kg of CO₂ equivalent</strong> emissions
                  and saved toxic heavy metals (lead, cadmium, mercury) from contaminating groundwater.
                </p>
              </div>
            </div>

            <Link to="/submit" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap">
              <span>Recycle another device</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Recent Items Section */}
        <div className="eco-card p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/60">
            <div>
              <h2 className="text-base font-bold text-slate-100">Recent E-Waste Items</h2>
              <p className="text-xs text-slate-400 mt-0.5">Track real-time status transitions and assigned pickup logistics.</p>
            </div>
            <Link to="/my-items" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
              <span>View full ledger</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
              <span className="text-xs">Fetching registered assets…</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-3 text-slate-500">
                <Package size={24} />
              </div>
              <p className="text-sm font-medium text-slate-200">No items submitted yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Submit old laptops, phones, cables, or appliances to begin doorstep collection and tracking.
              </p>
              <Link to="/submit"
                className="inline-flex items-center gap-1.5 text-xs font-semibold mt-4 px-3.5 py-2 rounded-xl text-emerald-300 bg-emerald-950/60 border border-emerald-800/40 hover:bg-emerald-900/50 transition-colors">
                <Plus size={14} />
                <span>Submit your first device</span>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3">Item / Category</th>
                    <th className="py-3 px-3">Weight</th>
                    <th className="py-3 px-3">Condition</th>
                    <th className="py-3 px-3">Current Status</th>
                    <th className="py-3 px-3">Submitted On</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {items.slice(0, 6).map(item => (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-950/50 border border-emerald-800/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                            <Package size={15} />
                          </div>
                          <div>
                            <span className="font-semibold text-slate-200">{item.category?.name ?? 'Electronic Device'}</span>
                            <p className="text-[11px] font-mono text-slate-500">#{item.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-300 font-mono">
                        {format.weight(item.actual_weight_kg ?? item.estimated_weight_kg)}
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
