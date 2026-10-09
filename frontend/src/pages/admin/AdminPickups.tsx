import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getPickups } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from '../../utils/format';
export default function AdminPickups() {
  const [pickups, setPickups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPickups().then(r => setPickups(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">All Pickup Requests</h1>
          <p className="text-sm text-slate-400">Dispatch queue and collection history across centers.</p>
        </div>

        <div className="eco-card overflow-hidden">
          {loading ? (
            <p className="p-8 text-center text-slate-400 text-sm">Loading pickups…</p>
          ) : pickups.length === 0 ? (
            <p className="p-8 text-center text-slate-400 text-sm">No pickups recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                    <th className="text-left p-3">ID</th>
                    <th className="text-left p-3">Citizen</th>
                    <th className="text-left p-3">Agent</th>
                    <th className="text-left p-3">Center</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {pickups.map(p => (
                    <tr key={p.id} className="border-b border-slate-800/60 hover:bg-slate-900/40">
                      <td className="p-3 font-mono text-slate-400">#{p.id.slice(0, 8)}</td>
                      <td className="p-3 text-slate-200">{p.user?.name ?? '—'}</td>
                      <td className="p-3 text-slate-300">{p.agent?.name ?? 'Unassigned'}</td>
                      <td className="p-3 text-slate-300">{p.center?.name ?? '—'}</td>
                      <td className="p-3"><StatusBadge status={p.status} /></td>
                      <td className="p-3 text-slate-400">{format.date(p.created_at)}</td>
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
