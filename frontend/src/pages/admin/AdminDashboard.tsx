import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getKpis } from '../../services/api';
import api from '../../services/api';
import { Package, Scale, Recycle, Users, Truck, BarChart3, TrendingUp, Leaf, Database, Sparkles } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid
} from 'recharts';

const PALETTE = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

function KpiCard({ label, value, icon, color, sub }: any) {
  return (
    <div className="eco-card p-5 relative overflow-hidden eco-card-hover group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
          style={{ background: color + '18', color }}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight text-slate-100">{value}</p>
      {sub && <p className="text-xs mt-1.5 text-slate-400">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: any) {
  return (
    <div className="eco-card p-5 sm:p-6 flex flex-col justify-between">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1 flex flex-col justify-center">
        {children}
      </div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: '#0f1813',
    border: '1px solid #1e3326',
    borderRadius: '10px',
    color: '#f8fafc',
    fontSize: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  itemStyle: { color: '#34d399' },
};

export default function AdminDashboard() {
  const [kpis, setKpis]     = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getKpis(), api.get('/analytics/charts')])
      .then(([kr, cr]) => { setKpis(kr.data); setCharts(cr.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-xs">Aggregating platform metrics…</span>
      </div>
    </DashboardLayout>
  );

  const categoryData = kpis?.categoryDistribution ?? [];
  const monthlyData  = charts?.monthly ?? [];
  const outcomeData  = charts?.outcomes ?? [];
  const materialData = charts?.materials ?? [];

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Enterprise Sustainability Analytics</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
              Live Aggregations
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Real-time material mass balances, collection throughput, and recovery efficiency metrics.
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Weight Collected"
            value={`${(kpis?.totalWeightCollected ?? 0).toFixed(1)} kg`}
            icon={<Scale size={18} />}
            color="#34d399"
            sub="Actual verified & estimated"
          />
          <KpiCard
            label="Total Weight Recycled"
            value={`${(kpis?.totalWeightRecycled ?? 0).toFixed(1)} kg`}
            icon={<Recycle size={18} />}
            color="#60a5fa"
            sub="Extracted elemental yields"
          />
          <KpiCard
            label="Recovery Efficiency"
            value={kpis?.recoveryRate ?? '—'}
            icon={<TrendingUp size={18} />}
            color="#fbbf24"
            sub="Recovered ÷ input mass"
          />
          <KpiCard
            label="Hardware Categories"
            value={categoryData.length}
            icon={<BarChart3 size={18} />}
            color="#a78bfa"
            sub="Active equipment types"
          />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="E-Waste Volume by Equipment Category" subtitle="Distribution of registered assets across categories">
            {categoryData.length === 0 ? (
              <p className="text-xs text-slate-500 py-12 text-center">No category data recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={categoryData} margin={{ left: -20, top: 10, right: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#16241c" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Monthly Inflow & Collection Trend" subtitle="Historical throughput volume over time">
            {monthlyData.length === 0 ? (
              <p className="text-xs text-slate-500 py-12 text-center">No monthly historical points yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={monthlyData} margin={{ left: -20, top: 10, right: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#16241c" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="items" stroke="#34d399" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="End-of-Life State Distribution" subtitle="Classification of assets across lifecycle states">
            {outcomeData.length === 0 ? (
              <p className="text-xs text-slate-500 py-12 text-center">No outcome data available.</p>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={outcomeData} dataKey="count" nameKey="status"
                      cx="50%" cy="50%" outerRadius={75} innerRadius={45} paddingAngle={4}>
                      {outcomeData.map((_: any, i: number) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 w-full sm:w-56 text-xs">
                  {outcomeData.map((d: any, i: number) => (
                    <div key={d.status} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/40 border border-slate-800/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <span className="text-slate-300 truncate">{d.status.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="font-bold text-slate-100 font-mono ml-2">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Extracted Secondary Raw Materials" subtitle="Recovered copper, precious metals, and polymers in kg">
            {materialData.length === 0 ? (
              <p className="text-xs text-slate-500 py-12 text-center">No material recovery data recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={materialData} margin={{ left: -10, top: 10, right: 10, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#16241c" />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="total_kg" radius={[0, 6, 6, 0]}>
                    {materialData.map((_: any, i: number) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Architectural Database Calculation Banner */}
        <div className="eco-card p-5 flex items-start gap-3.5 border-emerald-900/40 bg-emerald-950/10">
          <Database size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">Live DBMS Aggregation Architecture</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">SQL GROUP BY</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Global Recovery Rate (<strong className="text-emerald-400">{kpis?.recoveryRate ?? '—'}</strong>) is computed dynamically:
              <code className="text-emerald-300 font-mono mx-1">SUM(material_recoveries.quantity_kg) / SUM(batch_items.processed_weight_kg) × 100</code>.
              Guarantees zero replication discrepancies across database transactions.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
