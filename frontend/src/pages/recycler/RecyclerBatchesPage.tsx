import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { batchApi } from '@/api/endpoints';
import type { ProcessingBatch } from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { BATCH_STATUS_OPTIONS, PATH_LABELS } from '@/lib/domain';
import { formatDate, formatDateTime, formatNumber, humanize } from '@/lib/format';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Pagination,
  SelectField,
  StatusBadge,
  TableWrap,
  Td,
  Th,
  Tr,
  buttonClasses,
} from '@/components/ui';

/** Batches released to the signed-in recycler organisation. */
export function RecyclerBatchesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const fetcher = useCallback(
    (signal: AbortSignal) => batchApi.list({ page, limit: 15, ...(status ? { status } : {}) }, signal),
    [page, status],
  );
  const { data, loading, error, reload } = useResource(fetcher);

  const rows = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Assigned batches"
        description="Every batch released to your organisation. Start processing to begin recording recovered material."
      />

      <Card>
        <CardHeader
          title="Filter"
          actions={
            <SelectField
              label=""
              name="recyclerBatchStatus"
              value={status}
              placeholder="All statuses"
              className="w-56"
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              options={BATCH_STATUS_OPTIONS.map((value) => ({ value, label: humanize(value) }))}
            />
          }
        />

        {loading ? (
          <LoadingBlock label="Loading batches…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No batches assigned"
            description="Collection centres release batches to your organisation; they appear here instantly."
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th>Centre</Th>
                  <Th>Path</Th>
                  <Th>Items</Th>
                  <Th>Released</Th>
                  <Th>Status</Th>
                  <Th align="right">Open</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((batch: ProcessingBatch) => (
                  <Tr key={batch.id}>
                    <Td>
                      <Link to={`/batches/${batch.id}`} className="link font-medium">
                        {batch.batchCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{batch.name}</span>
                    </Td>
                    <Td>{batch.center ? `${batch.center.name} (${batch.center.code})` : '—'}</Td>
                    <Td>{batch.processingPath ? PATH_LABELS[batch.processingPath] ?? humanize(batch.processingPath) : 'Mixed'}</Td>
                    <Td className="tabular">{batch._count?.batchItems ?? 0}</Td>
                    <Td>{formatDateTime(batch.releasedAt)}</Td>
                    <Td>
                      <StatusBadge status={batch.status} />
                    </Td>
                    <Td align="right">
                      <Link to={`/batches/${batch.id}`} className={buttonClasses('secondary', 'sm')}>
                        Open
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={data?.meta} onPageChange={setPage} busy={loading} />
          </>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Showing {formatNumber(rows.length)} batch(es) updated up to {formatDate(new Date())}. Recovered weight is
        summarised on each batch page.
      </p>
    </>
  );
}
