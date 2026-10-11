import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { pickupApi } from '@/api/endpoints';
import type { PickupRequest } from '@/api/types';
import { useResource } from '@/hooks/useApi';
import { formatDate, formatDateTime, formatKg, humanize } from '@/lib/format';
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
} from '@/components/ui';

const FILTERS = [
  { value: '', label: 'All my pickups' },
  { value: 'ASSIGNED', label: 'Awaiting my acceptance' },
  { value: 'ACCEPTED', label: 'Accepted — to collect' },
  { value: 'COLLECTED', label: 'Collected — to deliver' },
  { value: 'RECEIVED_AT_CENTER', label: 'Delivered' },
  { value: 'FAILED', label: 'Failed' },
];

/** Full history of requests assigned to the signed-in agent. */
export function AgentAssignmentsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const fetcher = useCallback(
    (signal: AbortSignal) => pickupApi.list({ page, limit: 20, ...(status ? { status } : {}) }, signal),
    [page, status],
  );
  const { data, loading, error, reload } = useResource(fetcher);

  const rows = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="My assignments"
        description="Every pickup request the engine (or an administrator) has assigned to you, with its outcome."
      />

      <Card>
        <CardHeader
          title="Filter"
          actions={
            <SelectField
              label=""
              name="agentAssignmentStatus"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              options={FILTERS.slice(1)}
              placeholder="All my pickups"
              className="w-64"
            />
          }
        />

        {loading ? (
          <LoadingBlock label="Loading assignments…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No assignments here"
            description="Requests appear once the assignment engine selects you as the best eligible agent."
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Request</Th>
                  <Th>Citizen</Th>
                  <Th>Address</Th>
                  <Th>Preferred</Th>
                  <Th>Collected</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((pickup: PickupRequest) => (
                  <Tr key={pickup.id}>
                    <Td>
                      <Link to={`/pickups/${pickup.id}`} className="link font-medium">
                        {pickup.requestCode}
                      </Link>
                      <span className="block text-xs text-slate-500">{pickup._count?.items ?? 0} item(s)</span>
                    </Td>
                    <Td>
                      {pickup.user?.fullName}
                      <span className="block text-xs text-slate-500">{pickup.user?.phone ?? '—'}</span>
                    </Td>
                    <Td>
                      <span className="text-sm">{pickup.addressLine}</span>
                      <span className="block text-xs text-slate-500">
                        {pickup.city} {pickup.pincode}
                      </span>
                    </Td>
                    <Td>{formatDate(pickup.preferredDate)}</Td>
                    <Td>
                      {pickup.collectedAt ? (
                        <>
                          <span className="text-sm">{formatKg(pickup.collectedWeightKg)}</span>
                          <span className="block text-xs text-slate-500">{formatDateTime(pickup.collectedAt)}</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">Not collected</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={pickup.status} />
                      {pickup.failureReason ? (
                        <span className="mt-1 block text-xs text-rose-600">{humanize(pickup.failureReason)}</span>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination meta={data?.meta} onPageChange={setPage} busy={loading} />
          </>
        )}
      </Card>
    </>
  );
}
