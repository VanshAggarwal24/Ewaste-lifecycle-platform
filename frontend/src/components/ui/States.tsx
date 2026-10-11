import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { ApiError } from '@/api/client';
import { Button } from './Button';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-brand-600 ${className}`} aria-hidden />;
}

/** Full-block loading state used while a screen's primary data is in flight. */
export function LoadingBlock({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-sm text-slate-500" role="status">
      <Spinner className="h-6 w-6" />
      <p>{label}</p>
      <div className="w-full max-w-md space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-3 animate-pulse rounded bg-slate-100" style={{ width: `${100 - index * 15}%` }} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <Inbox className="h-5 w-5" />}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Error state. Server messages (conflict, forbidden, validation) are shown verbatim —
 * the wording comes from the API so it can never contradict the actual rule enforced.
 */
export function ErrorState({
  error,
  onRetry,
  title = 'Could not load this view',
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const message = apiError?.displayMessage ?? (error as Error)?.message ?? 'Unexpected error';
  const isNetwork = apiError?.code === 'NETWORK_ERROR';

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">{message}</p>
        {isNetwork ? (
          <p className="mx-auto mt-2 max-w-lg text-xs text-slate-500">
            Start the API with <code className="rounded bg-slate-100 px-1 py-0.5">npm run dev</code> in the{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5">backend</code> folder, then retry.
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Compact inline error for forms and small panels. */
export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof ApiError ? error.displayMessage : (error as Error)?.message;
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

/** Headline metric tile. `value` is always a real figure from the API. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'clay' | 'sky' | 'amber' | 'slate';
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    clay: 'bg-clay-100 text-clay-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="card flex items-start gap-4 p-5">
      {icon ? (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>
      ) : null}
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
        <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  tone = 'brand',
  label,
}: {
  value: number;
  tone?: 'brand' | 'amber' | 'rose';
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const tones = { brand: 'bg-brand-500', amber: 'bg-amber-500', rose: 'bg-rose-500' };
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={clamped}>
        <div className={`h-full rounded-full ${tones[tone]}`} style={{ width: `${clamped}%` }} />
      </div>
      {label ? <p className="mt-1 text-xs text-slate-500">{label}</p> : null}
    </div>
  );
}
