import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getUsers } from '../../services/api';
import { Users, Search, Shield, Truck, Building2, Factory, UserCheck, ChevronRight } from 'lucide-react';

const roleConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  USER:             { label: 'Citizen User',    color: '#34d399', icon: <UserCheck size={14} /> },
  COLLECTION_AGENT: { label: 'Field Agent',     color: '#fbbf24', icon: <Truck size={14} /> },
  CENTER_STAFF:     { label: 'Center Staff',    color: '#818cf8', icon: <Building2 size={14} /> },
  RECYCLER:         { label: 'Recycler',        color: '#22d3ee', icon: <Factory size={14} /> },
  ADMIN:            { label: 'Administrator',   color: '#f472b6', icon: <Shield size={14} /> },
};

export default function AdminUsers() {
  const [users, setUsers]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  useEffect(() => {
    getUsers().then(r => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u => {
    const matchesSearch =
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    if (roleFilter === 'ALL') return matchesSearch;
    return matchesSearch && u.role?.name === roleFilter;
  });

  const roleCounts = users.reduce((acc: Record<string, number>, u) => {
    const role = u.role?.name ?? 'UNKNOWN';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="fade-in space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Platform User Registry</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-pink-950/60 text-pink-300 border border-pink-800/40">
              Admin Access
            </span>
          </div>
          <p className="text-sm text-slate-400">
            All registered platform participants, their roles, and account status.
          </p>
        </div>

        {/* Role distribution KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(roleConfig).map(([roleKey, cfg]) => (
            <div
              key={roleKey}
              className="eco-card p-4 cursor-pointer eco-card-hover"
              onClick={() => setRoleFilter(roleFilter === roleKey ? 'ALL' : roleKey)}
              style={{ borderColor: roleFilter === roleKey ? cfg.color + '60' : undefined }}
            >
              <div className="flex items-center gap-2 mb-2" style={{ color: cfg.color }}>
                {cfg.icon}
                <span className="text-xs font-semibold">{cfg.label}</span>
              </div>
              <p className="text-xl font-bold text-slate-100">{roleCounts[roleKey] ?? 0}</p>
            </div>
          ))}
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm eco-input"
            />
          </div>
          <span className="text-xs text-slate-500 self-center">
            Showing {filtered.length} of {users.length} users
          </span>
        </div>

        {/* Users Table */}
        <div className="eco-card p-5">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mb-2" />
              <span className="text-xs">Loading user registry…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Users size={32} className="mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-300">No users found</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting search or role filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-3">Name</th>
                    <th className="py-3 px-3">Email</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Phone</th>
                    <th className="py-3 px-3">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map(user => {
                    const cfg = roleConfig[user.role?.name] ?? { label: user.role?.name, color: '#94a3b8', icon: <Users size={14} /> };
                    return (
                      <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                              style={{ background: cfg.color + '18', color: cfg.color }}
                            >
                              {user.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                            <span className="font-semibold text-slate-200">{user.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-xs text-slate-400 font-mono">{user.email}</td>
                        <td className="py-3.5 px-3">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}30` }}
                          >
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-xs text-slate-400">
                          {user.phone || <span className="text-slate-600 italic">—</span>}
                        </td>
                        <td className="py-3.5 px-3 text-xs text-slate-400">
                          {user.created_at
                            ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
