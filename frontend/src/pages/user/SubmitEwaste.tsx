import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import api from '../../services/api';
import { submitEwaste } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';

export default function SubmitEwaste() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<any[]>([]);
  const [centers, setCenters] = useState<any[]>([]);
  const [form, setForm] = useState({
    category_id: '',
    estimated_weight_kg: '',
    condition: 'WORKING',
    center_id: '',
    pickup_latitude: '28.6139',
    pickup_longitude: '77.2090',
  });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/categories').then(r => setCategories(r.data)).catch(() => {});
    api.get('/centers').then(r => setCenters(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await submitEwaste({
        category_id: Number(form.category_id),
        estimated_weight_kg: parseFloat(form.estimated_weight_kg),
        condition: form.condition,
        center_id: form.center_id,
        pickup_latitude: parseFloat(form.pickup_latitude),
        pickup_longitude: parseFloat(form.pickup_longitude),
      });
      setSuccess(true);
      setTimeout(() => navigate('/my-items'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const conditions = ['WORKING', 'PARTIALLY_WORKING', 'NOT_WORKING', 'DAMAGED'];

  if (success) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 fade-in">
          <CheckCircle size={56} style={{ color: 'var(--color-primary-light)' }} className="mb-4" />
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            Submitted Successfully!
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Your e-waste item has been submitted. A pickup will be assigned shortly.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="fade-in max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>Submit E-Waste</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
          Enter your device details. A collection agent will be dispatched automatically.
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl mb-4 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            <AlertCircle size={16} />{error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>
              Category *
            </label>
            <select required value={form.category_id}
              onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              <option value="">Select category…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>
              Estimated Weight (kg) *
            </label>
            <input type="number" step="0.1" min="0.1" required
              value={form.estimated_weight_kg}
              onChange={e => setForm(f => ({ ...f, estimated_weight_kg: e.target.value }))}
              placeholder="e.g. 2.5"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>
              Current Condition *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {conditions.map(c => (
                <button key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, condition: c }))}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-left transition-all"
                  style={{
                    background: form.condition === c ? 'rgba(22,163,74,0.2)' : 'var(--color-surface-2)',
                    border: form.condition === c ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    color: form.condition === c ? 'var(--color-primary-light)' : 'var(--color-muted)',
                  }}>
                  {c.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-muted)' }}>
              Collection Center *
            </label>
            <select required value={form.center_id}
              onChange={e => setForm(f => ({ ...f, center_id: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              <option value="">Select center…</option>
              {centers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.address}</option>)}
            </select>
          </div>

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: loading ? 'var(--color-border)' : 'var(--color-primary)', color: 'white' }}>
            {loading ? 'Submitting…' : <><span>Submit for Pickup</span><ChevronRight size={16} /></>}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
