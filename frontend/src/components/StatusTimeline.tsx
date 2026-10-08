import React from 'react';
import { format } from '../utils/format';

interface HistoryEntry {
  id: string;
  old_status?: string;
  new_status: string;
  created_at: string;
  remarks?: string;
  user?: { name: string; role: { name: string } };
}

export default function StatusTimeline({ history }: { history: HistoryEntry[] }) {
  if (!history || history.length === 0)
    return <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No history yet.</p>;

  return (
    <div className="space-y-0">
      {[...history].reverse().map((h, i) => (
        <div key={h.id} className="timeline-item fade-in">
          <div className="timeline-dot" style={i === 0 ? { background: 'var(--color-primary-light)' } : {}} />
          <div className="glass-card p-3 ml-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {h.old_status && (
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {h.old_status.replace(/_/g, ' ')}
                  </span>
                )}
                {h.old_status && <span style={{ color: 'var(--color-muted)' }}>→</span>}
                <span className="text-sm font-semibold" style={{ color: 'var(--color-primary-light)' }}>
                  {h.new_status.replace(/_/g, ' ')}
                </span>
              </div>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {format.datetime(h.created_at)}
              </span>
            </div>
            {(h.remarks || h.user) && (
              <div className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
                {h.user && <span>{h.user.name}</span>}
                {h.remarks && <span className="ml-2">— {h.remarks}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
