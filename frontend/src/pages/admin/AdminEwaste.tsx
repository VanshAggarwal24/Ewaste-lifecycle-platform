import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import api from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
export default function AdminEwaste() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/ewaste').then(r => setItems(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">All E-Waste Items</h1>
          <p className="text-sm text-slate-400">Platform-wide item registry and lifecycle status.</p>
        </div>

        <div className="eco-card overflow-hidden">
          {loading ? (
            <p className="p-8 text-center text-slate-400 text-sm">Loading items…</p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-slate-400 text-sm">No items recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                    <th className="text-left p-3">Category</th>
                    <th className="text-left p-3">Weight</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-900/40">
                      <td className="p-3">
                        <span className="font-semibold text-slate-200">{item.category?.name}</span>
                        <span className="block font-mono text-slate-500">#{item.id.slice(0, 8)}</span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {format.weight(item.actual_weight_kg || item.estimated_weight_kg)}
                      </td>
                      <td className="p-3"><StatusBadge status={item.status} /></td>
                      <td className="p-3 text-slate-400">{format.date(item.submitted_at)}</td>
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
