import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import { getItem } from '../../services/api';
import { StatusBadge } from '../../components/StatusBadge';
import StatusTimeline from '../../components/StatusTimeline';
import { format } from '../../utils/format';
import { Package, ArrowLeft, Scale, Calendar, Tag } from 'lucide-react';

export default function TrackItem() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getItem(id)
      .then(r => setItem(r.data))
      .catch(() => setError('Item not found or access denied.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64 fade-in">
        <div className="text-sm" style={{ color: 'var(--color-muted)' }}>Loading item…</div>
      </div>
    </DashboardLayout>
  );

  if (error || !item) return (
    <DashboardLayout>
      <div className="fade-in text-center py-20">
        <p className="text-sm mb-4" style={{ color: '#fca5a5' }}>{error || 'Item not found.'}</p>
        <Link to="/my-items" className="text-sm" style={{ color: 'var(--color-primary-light)' }}>← Back to items</Link>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="fade-in max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/my-items" style={{ color: 'var(--color-muted)' }}><ArrowLeft size={20} /></Link>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>Item Tracker</h1>
            <p className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>{item.id}</p>
          </div>
        </div>

        {/* Details card */}
        <div className="glass-card p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(22,163,74,0.15)' }}>
                <Package size={18} style={{ color: 'var(--color-primary-light)' }} />
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
                  {item.category?.name ?? '—'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                  Condition: {item.condition?.replace(/_/g, ' ') ?? '—'}
                </p>
              </div>
            </div>
            <StatusBadge status={item.status} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: <Scale size={14} />,    label: 'Est. Weight', value: format.weight(item.estimated_weight_kg) },
              { icon: <Scale size={14} />,    label: 'Act. Weight', value: format.weight(item.actual_weight_kg) },
              { icon: <Calendar size={14} />, label: 'Submitted',   value: format.date(item.submitted_at) },
            ].map(d => (
              <div key={d.label} className="rounded-xl p-3" style={{ background: 'var(--color-surface-2)' }}>
                <div className="flex items-center gap-1 mb-1" style={{ color: 'var(--color-muted)' }}>
                  {d.icon}
                  <span className="text-xs">{d.label}</span>
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{d.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Inspection */}
        {item.inspection && (
          <div className="glass-card p-5">
            <h2 className="font-semibold mb-3" style={{ color: 'var(--color-text)' }}>Inspection Report</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Functional',      item.inspection.functional_status ? 'Yes' : 'No'],
                ['Classification',  item.inspection.classification ?? '—'],
                ['Physical',        item.inspection.physical_condition ?? '—'],
                ['Est. Recoverable', format.weight(item.inspection.estimated_recoverable_weight_kg)],
              ].map(([l, v]) => (
                <div key={l}>
                  <span style={{ color: 'var(--color-muted)' }}>{l}: </span>
                  <span className="font-medium" style={{ color: 'var(--color-text)' }}>{v}</span>
                </div>
              ))}
            </div>
            {item.inspection.notes && (
              <p className="mt-3 text-xs p-3 rounded-xl" style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
                {item.inspection.notes}
              </p>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="glass-card p-5">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--color-text)' }}>Lifecycle Timeline</h2>
          <StatusTimeline history={item.status_histories ?? []} />
        </div>
      </div>
    </DashboardLayout>
  );
}
