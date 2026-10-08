import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login as apiLogin } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Leaf, AlertCircle } from 'lucide-react';

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
      login(res.data);
      navigate(roleRoute[res.data.role] || '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const setDemo = (email: string) => setForm({ email, password: 'password123' });

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12"
        style={{ background: 'linear-gradient(135deg, #0a1f0d 0%, #0f2a14 50%, #122d18 100%)', borderRight: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
            <Leaf size={20} color="white" />
          </div>
          <span className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>EcoCycle</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4" style={{ color: 'var(--color-text)' }}>
            Track Every Gram of<br />
            <span style={{ color: 'var(--color-primary-light)' }}>Electronic Waste</span>
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            A database-driven platform managing the complete lifecycle of e-waste —
            from user submission to verified material recovery.
          </p>
          <div className="grid grid-cols-2 gap-4 mt-10">
            {[
              { label: 'Lifecycle Tracking', desc: 'Real-time status from submission to recycled' },
              { label: 'Smart Assignment', desc: 'Rule-based agent dispatch algorithm' },
              { label: 'ACID Transactions', desc: 'Guaranteed data consistency at every step' },
              { label: 'Recovery Analytics', desc: 'Material-level recycling efficiency metrics' },
            ].map(c => (
              <div key={c.label} className="glass-card p-4">
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-primary-light)' }}>{c.label}</p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>University Database Systems Project · All data is synthetic demo data.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
              <Leaf size={20} color="white" />
            </div>
            <span className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>EcoCycle</span>
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>Welcome back</h2>
          <p className="text-sm mb-8" style={{ color: 'var(--color-muted)' }}>Sign in to your account to continue</p>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>Email</label>
              <input
                type="email" required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>Password</label>
              <input
                type="password" required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: loading ? 'var(--color-border)' : 'var(--color-primary)', color: 'white' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-8">
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--color-muted)' }}>Quick demo login:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'User',        email: 'user@test.com' },
                { label: 'Agent',       email: 'agent@test.com' },
                { label: 'Center Staff',email: 'staff@test.com' },
                { label: 'Recycler',    email: 'recycler@test.com' },
              ].map(d => (
                <button key={d.email} onClick={() => setDemo(d.email)}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-left transition-all"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs mt-3 text-center" style={{ color: 'var(--color-muted)' }}>
              All demo accounts use password: <code className="font-mono" style={{ color: 'var(--color-primary-light)' }}>password123</code>
            </p>
          </div>

          <p className="mt-6 text-xs text-center" style={{ color: 'var(--color-muted)' }}>
            No account?{' '}
            <Link to="/register" style={{ color: 'var(--color-primary-light)' }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
