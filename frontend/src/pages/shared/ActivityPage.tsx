import { useCallback, useState } from 'react';
import { activityApi } from '@/api/endpoints';
import { useResource } from '@/hooks/useApi';
import { Timeline } from '@/components/domain/Timeline';
import { Card, CardBody, CardHeader, ErrorState, LoadingBlock, PageHeader, Pagination, SelectField } from '@/components/ui';

/**
 * Scoped activity feed. The server decides what the caller may see (their own items and
 * pickups, their centre, their batches, or the whole platform for administrators).
 */
export function ActivityPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');

  const fetcher = useCallback(
    (signal: AbortSignal) => activityApi.list({ page, limit: 25, ...(entityType ? { entityType } : {}) }, signal),
    [page, entityType],
  );
  const { data, loading, error, reload } = useResource(fetcher);

  return (
    <>
      <PageHeader
        title="Activity"
        description="Chronological, append-only history of lifecycle events. Entries are written by the API inside the same transaction as the change itself."
      />

      <Card>
        <CardHeader
          title="Event feed"
          subtitle={data?.meta ? `${data.meta.total} event(s)` : undefined}
          actions={
            <SelectField
              label=""
              name="activityEntityType"
              value={entityType}
              placeholder="All record types"
              className="w-56"
              onChange={(event) => {
                setEntityType(event.target.value);
                setPage(1);
              }}
              options={[
                { value: 'EWASTE_ITEM', label: 'Items' },
                { value: 'PICKUP_REQUEST', label: 'Pickup requests' },
                { value: 'PROCESSING_BATCH', label: 'Processing batches' },
              ]}
            />
          }
        >
        </CardHeader>

        {loading ? (
          <LoadingBlock label="Loading activity…" rows={5} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <CardBody>
              <Timeline
                events={data?.data ?? []}
                emptyTitle="No events recorded yet"
                emptyDescription="Actions you take — submissions, pickups, inspections, batches — appear here."
              />
            </CardBody>
            <Pagination meta={data?.meta} onPageChange={setPage} busy={loading} />
          </>
        )}
      </Card>
    </>
  );
}
