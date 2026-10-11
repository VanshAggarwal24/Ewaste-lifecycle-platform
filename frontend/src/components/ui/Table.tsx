import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '@/api/types';
import { Button } from './Button';

/** Horizontal-scroll wrapper so wide tables stay usable on phones. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className = '',
  align = 'left',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      scope="col"
      className={`border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-500 uppercase ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
  align = 'left',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={`border-b border-slate-100 px-4 py-3 align-middle text-slate-700 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tr className={`transition hover:bg-slate-50/70 ${className}`}>{children}</tr>;
}

/** Pagination controls driven by the API's `meta` block. */
export function Pagination({
  meta,
  onPageChange,
  busy = false,
}: {
  meta: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  busy?: boolean;
}) {
  if (!meta || meta.total === 0) return null;

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
      <p className="tabular">
        Showing <span className="font-medium text-slate-800">{from.toLocaleString('en-IN')}</span>–
        <span className="font-medium text-slate-800">{to.toLocaleString('en-IN')}</span> of{' '}
        <span className="font-medium text-slate-800">{meta.total.toLocaleString('en-IN')}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!meta.hasPreviousPage || busy}
          onClick={() => onPageChange(meta.page - 1)}
          icon={<ChevronLeft className="h-3.5 w-3.5" />}
        >
          Previous
        </Button>
        <span className="tabular px-1 text-xs text-slate-500">
          Page {meta.page} of {Math.max(1, meta.totalPages)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!meta.hasNextPage || busy}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
