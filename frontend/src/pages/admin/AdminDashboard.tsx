import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getKpis } from '../../services/api';
import api from '../../services/api';
import { Package, Scale, Recycle, Users, Truck, BarChart3, TrendingUp, Leaf } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const COLORS = ['#4ade80', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#34d399'];

function KpiCard({ label, value, icon, color, sub }: any) {
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

function ChartCard({ title, children }: any) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text)' }}>{title}</h3>
      {children}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: '#0f1a12', border: '1px solid #1e3a25', borderRadius: '8px', color: '#e2f0e7', fontSize: '12px' },
  itemStyle: { color: '#7aa882' },
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
      <div className="flex items-center justify-center h-64">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Loading analytics…</p>
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
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Admin Analytics</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
            Platform-wide metrics computed from live database records.
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Weight Collected" value={`${(kpis?.totalWeightCollected ?? 0).toFixed(1)} kg`}
            icon={<Scale size={18} />}   color="#4ade80" sub="actual + estimated" />
          <KpiCard label="Total Weight Recycled" value={`${(kpis?.totalWeightRecycled ?? 0).toFixed(1)} kg`}
            icon={<Recycle size={18} />}  color="#60a5fa" sub="from material recoveries" />
          <KpiCard label="Global Recovery Rate" value={kpis?.recoveryRate ?? '—'}
            icon={<TrendingUp size={18} />} color="#fbbf24" sub="recovered / processed" />
          <KpiCard label="Categories Active" value={categoryData.length}
            icon={<BarChart3 size={18} />}  color="#a78bfa" />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="E-Waste by Category">
            {categoryData.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>No data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryData} margin={{ left: -20 }}>
                  <XAxis dataKey="name" tick={{ fill: '#7aa882', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#7aa882', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#4ade80" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Monthly Collection Trend">
            {monthlyData.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>No data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyData} margin={{ left: -20 }}>
                  <XAxis dataKey="month" tick={{ fill: '#7aa882', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#7aa882', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="items" stroke="#4ade80" strokeWidth={2} dot={{ fill: '#4ade80' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Recycling Outcome Distribution">
            {outcomeData.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>No data available.</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={200}>
                  <PieChart>
                    <Pie data={outcomeData} dataKey="count" nameKey="status"
                      cx="50%" cy="50%" outerRadius={80} innerRadius={50} paddingAngle={3}>
                      {outcomeData.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {outcomeData.map((d: any, i: number) => (
                    <div key={d.status} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                        {d.status.replace(/_/g, ' ')}: <strong style={{ color: 'var(--color-text)' }}>{d.count}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Material Recovery Distribution (kg)">
            {materialData.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>No recovery data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={materialData} margin={{ left: -20 }} layout="vertical">
                  <XAxis type="number" tick={{ fill: '#7aa882', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#7aa882', fontSize: 11 }} width={70} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="total_kg" radius={[0, 4, 4, 0]}>
                    {materialData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Recovery rate highlight */}
        <div className="glass-card p-5 flex items-start gap-4"
          style={{ borderColor: 'rgba(22,163,74,0.3)' }}>
          <Leaf size={24} style={{ color: 'var(--color-primary-light)', flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
              Recovery Rate: <span style={{ color: 'var(--color-primary-light)' }}>{kpis?.recoveryRate ?? '—'}</span>
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Calculated as: Total Recovered Material Weight ÷ Total Processed E-Waste Weight × 100.
              Computed live from <code className="font-mono">material_recoveries</code> and <code className="font-mono">processing_batch_items</code>.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
