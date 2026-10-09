import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login as apiLogin } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Leaf, AlertCircle, Shield, Cpu, RefreshCw, BarChart3, ArrowRight, UserCheck, Truck, Building2, Factory } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const roleRoute: Record<string, string> = {
    USER:             '/dashboard',
    COLLECTION_AGENT: '/agent/dashboard',
    CENTER_STAFF:     '/center/dashboard',
    RECYCLER:         '/recycler/dashboard',
    ADMIN:            '/admin/dashboard',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiLogin(form.email, form.password);
      login({ ...res.data, email: res.data.email || form.email });
      navigate(roleRoute[res.data.role] || '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please verify credentials or connection.');
    } finally {
      setLoading(false);
    }
  };

  const setDemo = (email: string) => setForm({ email, password: 'password123' });

  const demoAccounts = [
    { label: 'Citizen User', role: 'Submission & Tracking', email: 'user@test.com', icon: <UserCheck size={16} /> },
    { label: 'Collection Agent', role: 'Dispatched Pickups', email: 'agent@test.com', icon: <Truck size={16} /> },
    { label: 'Center Staff', role: 'Inspection & Intake', email: 'staff@test.com', icon: <Building2 size={16} /> },
    { label: 'Recycler Corp', role: 'Material Recovery', email: 'recycler@test.com', icon: <Factory size={16} /> },
    { label: 'Admin', role: 'Platform Analytics', email: 'admin@test.com', icon: <Shield size={16} /> },
  ];


  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>
      {/* Left panel - Brand & Highlights */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 xl:p-16 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #07130b 0%, #0d1e13 50%, #0f2618 100%)', borderRight: '1px solid var(--color-border)' }}>
        
        {/* Ambient glow decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center pulse-green shadow-lg"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' }}>
            <Leaf size={22} color="white" />
          </div>
          <div>
            <span className="font-bold text-xl tracking-tight" style={{ color: 'var(--color-text)' }}>EcoCycle</span>
            <p className="text-xs text-emerald-400 font-medium">Lifecycle Management Platform</p>
          </div>
        </div>

        <div className="relative z-10 my-auto py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-6"
            style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--color-primary-light)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            End-to-End Circular Economy
          </div>

          <h1 className="text-4xl xl:text-5xl font-extrabold leading-[1.15] mb-5 tracking-tight" style={{ color: 'var(--color-text)' }}>
            Track Every Gram of<br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-green-300 bg-clip-text text-transparent">
              Electronic Waste
            </span>
          </h1>
          <p className="text-base leading-relaxed max-w-lg" style={{ color: 'var(--color-text-secondary)' }}>
            A database-driven platform orchestrating the complete lifecycle of e-waste —
            from consumer submission and smart agent dispatch to lab inspection and verified material recovery.
          </p>

          <div className="grid grid-cols-2 gap-3.5 mt-10">
            {[
              { icon: <RefreshCw size={18} className="text-emerald-400" />, label: 'Lifecycle Auditing', desc: 'Real-time status tracking with ACID integrity' },
              { icon: <Cpu size={18} className="text-emerald-400" />, label: 'Smart Dispatch', desc: 'Rule-based agent routing & capacity validation' },
              { icon: <Shield size={18} className="text-emerald-400" />, label: 'Role-Based Access', desc: 'Strict security boundaries across 5 system roles' },
              { icon: <BarChart3 size={18} className="text-emerald-400" />, label: 'Recovery Yields', desc: 'Material analytics for precious & base metals' },
            ].map(c => (
              <div key={c.label} className="glass-card p-4 hover:border-emerald-500/30 transition-all">
                <div className="flex items-center gap-2.5 mb-1.5">
                  {c.icon}
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{c.label}</p>
                </div>
                <p className="text-xs leading-normal" style={{ color: 'var(--color-muted)' }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Database Systems & Architecture Project · Live PostgreSQL & Prisma Integration
          </p>
        </div>
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile brand header */}
          <div className="mb-8 lg:hidden flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
              <Leaf size={20} color="white" />
            </div>
            <div>
              <span className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>EcoCycle</span>
              <p className="text-xs text-emerald-400">Lifecycle Management</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>Welcome back</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Sign in to access your role workspace</p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl mb-5 text-sm"
              style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5' }}>
              <AlertCircle size={18} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Email Address
              </label>
              <input
                type="email" required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="name@organization.com"
                className="w-full eco-input"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                  Password
                </label>
              </div>
              <input
                type="password" required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••••••"
                className="w-full eco-input"
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all shadow-md mt-2 cursor-pointer"
              style={{
                background: loading ? 'var(--color-surface-3)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
              }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Authenticating…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Accounts */}
          <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                1-Click Demo Accounts
              </span>
              <span className="text-[11px] font-mono text-emerald-400">password123</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {demoAccounts.map(d => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => setDemo(d.email)}
                  className={`p-2.5 rounded-xl text-left transition-all border group cursor-pointer ${
                    form.email === d.email ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-emerald-400 group-hover:text-emerald-300">{d.icon}</span>
                    <span className="text-xs font-semibold text-slate-200">{d.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{d.role}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

