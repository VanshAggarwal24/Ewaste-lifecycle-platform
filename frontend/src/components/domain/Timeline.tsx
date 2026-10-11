import { ArrowRight, Clock } from 'lucide-react';
import type { TimelineEvent } from '@/api/types';
import { EmptyState } from '@/components/ui';
import { ROLE_LABELS } from '@/lib/domain';
import { formatDateTime, formatRelative, humanize } from '@/lib/format';

/**
 * Renders the append-only `status_history` trail returned by the API.
 *
 * Entries come straight from the database in chronological order, so this list *is* the
 * lifecycle record — it is not reconstructed from client-side state.
 */
export function Timeline({
  events,
  emptyTitle = 'No lifecycle events recorded yet',
  emptyDescription = 'Events appear here the moment the first action is committed.',
}: {
  events: TimelineEvent[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!events || events.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} icon={<Clock className="h-5 w-5" />} />;
  }

  const ordered = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <ol className="timeline-rail relative space-y-5 pl-8">
      {ordered.map((event, index) => {
        const isLatest = index === ordered.length - 1;
        return (
          <li key={event.id} className="relative">
            <span
              className={`absolute top-1 -left-[1.4375rem] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-white ${
                isLatest ? 'bg-brand-600' : 'bg-slate-300'
              }`}
              aria-hidden
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{humanize(event.status)}</span>
              {event.subject ? (
                <>
                  <ArrowRight className="h-3 w-3 text-slate-300" aria-hidden />
                  <span className="text-xs font-medium text-slate-500">
                    {humanize(event.subject)}
                    {event.subjectRef ? ` · ${event.subjectRef}` : ''}
                  </span>
                </>
              ) : null}
            </div>

            {event.note ? <p className="mt-1 text-sm text-slate-600">{event.note}</p> : null}

            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
              <span title={formatDateTime(event.createdAt)}>{formatDateTime(event.createdAt)}</span>
              <span aria-hidden>·</span>
              <span>{formatRelative(event.createdAt)}</span>
              <span aria-hidden>·</span>
              <span>
                {event.actor ? `${event.actor.fullName} (${ROLE_LABELS[event.actor.role]})` : 'System'}
              </span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
