import React, { useEffect, useState } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import api from '../../services/api';
import { submitEwaste } from '../../services/api';
import { useNavigate, Link } from 'react-router-dom';
import { CheckCircle, AlertCircle, ArrowRight, Package, MapPin, Scale, Sparkles, Building2, HelpCircle } from 'lucide-react';

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
    api.get('/categories').then(r => {
      setCategories(r.data);
      if (r.data.length > 0 && !form.category_id) {
        setForm(f => ({ ...f, category_id: String(r.data[0].id) }));
      }
    }).catch(() => {});

    api.get('/centers').then(r => {
      setCenters(r.data);
      if (r.data.length > 0 && !form.center_id) {
        setForm(f => ({ ...f, center_id: r.data[0].id }));
      }
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category_id || !form.center_id || !form.estimated_weight_kg) {
      setError('Please fill in all required fields.');
      return;
    }
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
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit e-waste item. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const conditions = [
    { value: 'WORKING', label: 'Working', desc: 'Powers on, functional display or parts' },
    { value: 'PARTIALLY_WORKING', label: 'Partially Working', desc: 'Intermittent faults, broken ports/battery' },
    { value: 'NOT_WORKING', label: 'Non-Functional', desc: 'Dead motherboard, does not boot' },
    { value: 'DAMAGED', label: 'Damaged / Scrapped', desc: 'Cracked casing, salvaged for parts' },
  ];

  const weightPresets = [
    { label: 'Smartphone (~0.2 kg)', weight: '0.2' },
    { label: 'Tablet (~0.5 kg)', weight: '0.5' },
    { label: 'Laptop (~2.2 kg)', weight: '2.2' },
    { label: 'Desktop / Monitor (~6 kg)', weight: '6.0' },
  ];

  if (success) {
    return (
      <DashboardLayout>
        <div className="eco-card max-w-xl mx-auto p-8 text-center fade-in my-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
            <CheckCircle size={36} />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">
            E-Waste Submitted Successfully!
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
            Your item has been recorded in the platform ledger. An automated pickup dispatch rule has scheduled collection with nearest available field agents.
          </p>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-left my-6 space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Initial Status:</span>
              <span className="font-semibold text-emerald-400">PICKUP_REQUESTED</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Declared Weight:</span>
              <span className="font-semibold">{form.estimated_weight_kg} kg</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-500">Transaction Guarantee:</span>
              <span className="font-mono text-emerald-400">ACID Atomicity Verified</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/my-items"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow transition-all cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
            >
              <span>View My Items</span>
              <ArrowRight size={16} />
            </Link>
            <button
              onClick={() => {
                setSuccess(false);
                setForm(f => ({ ...f, estimated_weight_kg: '' }));
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800/40 transition-colors"
            >
              Submit Another Item
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="fade-in max-w-2xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Submit E-Waste for Recycling</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
              Intake Portal
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Register electronics for verified doorstep collection, diagnostic grading, and circular recycling.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm"
            style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5' }}>
            <AlertCircle size={18} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="eco-card p-6 sm:p-8 space-y-6">
          {/* Category */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-300">
              Equipment Category <span className="text-emerald-400">*</span>
            </label>
            <select
              required
              value={form.category_id}
              onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              className="w-full eco-input cursor-pointer"
            >
              <option value="">Select equipment classification…</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.description ? `(${c.description})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Weight */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Estimated Weight (kg) <span className="text-emerald-400">*</span>
              </label>
              <span className="text-[11px] text-slate-400">Accurately weighed upon arrival</span>
            </div>
            <input
              type="number"
              step="0.05"
              min="0.05"
              required
              value={form.estimated_weight_kg}
              onChange={e => setForm(f => ({ ...f, estimated_weight_kg: e.target.value }))}
              placeholder="e.g. 2.4"
              className="w-full eco-input font-mono"
            />
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {weightPresets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, estimated_weight_kg: p.weight }))}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-300">
              Device Condition <span className="text-emerald-400">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {conditions.map(c => {
                const selected = form.condition === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, condition: c.value }))}
                    className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                      selected
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                        : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-200">{c.label}</span>
                      {selected && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                    </div>
                    <p className="text-[11px] leading-tight text-slate-400">{c.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collection Center */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-300">
              Assigned Collection Center <span className="text-emerald-400">*</span>
            </label>
            <select
              required
              value={form.center_id}
              onChange={e => setForm(f => ({ ...f, center_id: e.target.value }))}
              className="w-full eco-input cursor-pointer"
            >
              <option value="">Select target sorting facility…</option>
              {centers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.address} ({c.capacity_kg ? `Max ${c.capacity_kg} kg` : 'Operational'})
                </option>
              ))}
            </select>
          </div>

          {/* Guaranteed Dispatch Badge */}
          <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800 flex items-start gap-3 text-xs text-slate-400">
            <Building2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-300">Automated Chain of Custody</span>
              <p className="text-[11px] mt-0.5 leading-relaxed">
                Submissions automatically trigger database state transitions with verified timestamping and immutable agent accountability records.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition-all cursor-pointer hover:opacity-95"
            style={{
              background: loading ? 'var(--color-surface-3)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            }}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Recording in Ledger…</span>
              </>
            ) : (
              <>
                <span>Confirm & Dispatch Pickup</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
