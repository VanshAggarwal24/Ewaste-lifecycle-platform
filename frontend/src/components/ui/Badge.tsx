import type { ReactNode } from 'react';
import { STATUS_TONES, type Tone } from '@/lib/domain';
import { humanize } from '@/lib/format';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  progress: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  success: 'bg-brand-50 text-brand-800 ring-brand-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function Badge({
  tone = 'neutral',
  children,
  className = '',
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** Renders a workflow status using the tone registered for it in `lib/domain`. */
export function StatusBadge({ status, className = '' }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const tone = STATUS_TONES[status] ?? 'neutral';
  return (
    <Badge tone={tone} className={className}>
      {humanize(status)}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, Tone> = {
    USER: 'info',
    COLLECTION_AGENT: 'progress',
    CENTER_STAFF: 'warning',
    RECYCLER: 'success',
    ADMIN: 'danger',
  };
  return <Badge tone={map[role] ?? 'neutral'}>{humanize(role)}</Badge>;
}

export function GradeBadge({ grade }: { grade: string | null | undefined }) {
  if (!grade) return <span className="text-xs text-slate-400">—</span>;
  const map: Record<string, Tone> = { A: 'success', B: 'info', C: 'warning', D: 'danger' };
  return <Badge tone={map[grade] ?? 'neutral'}>Grade {grade}</Badge>;
}

export function HazardBadge({ level }: { level: number | null | undefined }) {
  if (level === null || level === undefined) return <span className="text-xs text-slate-400">—</span>;
  const tone: Tone = level >= 4 ? 'danger' : level === 3 ? 'warning' : level === 2 ? 'info' : 'success';
  return <Badge tone={tone}>Hazard {level}/5</Badge>;
}
